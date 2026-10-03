/// <reference lib="webworker" />
// Dedicated on-device inference worker. Never logs narrative text or model output.
import { AutoModelForCausalLM, AutoTokenizer, env } from "@huggingface/transformers";
import {
  AI_MAX_INPUT_TOKENS,
  AI_MAX_NEW_TOKENS,
  AI_MODEL,
  AI_REQUIRED_FILES,
  AI_VARIANTS,
  type AiBackend,
  type AiInstallManifest,
  type WorkerIn,
  type WorkerOut,
} from "../lib/ai-config";

env.allowLocalModels = false;
env.allowRemoteModels = true; // only fetched on cache miss; install is an explicit user action
env.useBrowserCache = true;
env.useWasmCache = true;
env.cacheKey = AI_MODEL.cacheName;
// Name the file in network errors (model/runtime URLs only, never narrative text).
const baseFetch = env.fetch;
env.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    return await baseFetch(input as string, init);
  } catch (e) {
    const u = String(input instanceof Request ? input.url : input).split("?")[0];
    throw new Error(`${(e as Error).message} (${u.slice(-80)})`);
  }
}) as typeof env.fetch;

const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenizer: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let model: any = null;
let loadedBackend: AiBackend | null = null;

async function load(backend: AiBackend, report: boolean) {
  if (model && loadedBackend === backend) return;
  const v = AI_VARIANTS[backend];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progress_callback = (p: any) => {
    if (report && p.status === "progress" && p.file) post({ type: "progress", file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
  };
  tokenizer = await AutoTokenizer.from_pretrained(AI_MODEL.id, { revision: AI_MODEL.revision, progress_callback });
  if (report) post({ type: "phase", phase: "initializing" });
  model = await AutoModelForCausalLM.from_pretrained(AI_MODEL.id, {
    revision: AI_MODEL.revision,
    dtype: v.dtype,
    device: backend,
    progress_callback,
  });
  loadedBackend = backend;
}

async function generate(messages: { role: string; content: string }[]) {
  const inputs = tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    return_dict: true,
    enable_thinking: false, // Qwen3 no-thinking template mode
  });
  const inputTokens: number = inputs.input_ids.dims[1];
  if (inputTokens > AI_MAX_INPUT_TOKENS) throw new Error("Input too long for on-device extraction.");
  const t0 = performance.now();
  const out = await model.generate({ ...inputs, max_new_tokens: AI_MAX_NEW_TOKENS, do_sample: false });
  const text: string = tokenizer.batch_decode(out.slice(null, [inputTokens, null]), { skip_special_tokens: true })[0];
  return { text, inputTokens, ms: Math.round(performance.now() - t0) };
}

async function cachedInventory() {
  const cache = await caches.open(AI_MODEL.cacheName);
  const keys = (await cache.keys()).map((r) => r.url);
  let bytes = 0;
  for (const k of keys) {
    const res = await cache.match(k);
    const len = Number(res?.headers.get("content-length") ?? 0);
    bytes += Number.isFinite(len) ? len : 0;
  }
  return { keys, bytes };
}

function missingRequired(keys: string[], backend: AiBackend): string[] {
  const rev = AI_MODEL.revision;
  const need = [...AI_REQUIRED_FILES, AI_VARIANTS[backend].file].filter(
    (f) => !keys.some((k) => k.includes(AI_MODEL.id) && k.includes(rev) && k.endsWith(`/${f}`)),
  );
  if (!keys.some((k) => /ort-wasm[^/]*\.wasm$/.test(k))) need.push("onnxruntime .wasm");
  if (!keys.some((k) => /ort-wasm[^/]*\.mjs$/.test(k))) need.push("onnxruntime .mjs");
  return need;
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.type === "install") {
      post({ type: "phase", phase: "downloading" });
      await load(msg.backend, true);
      post({ type: "phase", phase: "verifying" });
      // Real inference on a fixed synthetic line before reporting readiness.
      const smoke = await generate([
        { role: "system", content: 'Reply with one JSON object only: {"patientCode": <segment number or null>}' },
        { role: "user", content: "[1] Synthetic patient SYN-0001 seen today." },
      ]);
      if (!smoke.text.trim()) throw new Error("Model produced no output during verification.");
      const inv = await cachedInventory();
      const missing = missingRequired(inv.keys, msg.backend);
      if (missing.length) throw new Error(`Model files not fully cached: ${missing.join(", ")}`);
      let smokeParsed = false;
      try {
        smokeParsed = typeof JSON.parse(smoke.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim()) === "object";
      } catch {
        smokeParsed = false;
      }
      const manifest: AiInstallManifest = {
        modelId: AI_MODEL.id,
        revision: AI_MODEL.revision,
        backend: msg.backend,
        dtype: AI_VARIANTS[msg.backend].dtype,
        installedAt: new Date().toISOString(),
        cachedKeys: inv.keys,
        cachedBytes: inv.bytes,
        smokeMs: smoke.ms,
        smokeParsed,
      };
      const cache = await caches.open(AI_MODEL.cacheName);
      await cache.put(new Request(new URL(AI_MODEL.manifestKey, self.location.origin).href), new Response(JSON.stringify(manifest), { headers: { "content-type": "application/json" } }));
      post({ type: "installed", manifest });
    } else if (msg.type === "load") {
      await load(msg.backend, false);
      post({ type: "loaded" });
    } else if (msg.type === "generate") {
      if (!model) throw new Error("Model not loaded.");
      const r = await generate(msg.messages);
      post({ type: "generated", id: msg.id, ...r });
    }
  } catch (err) {
    const m = (err as Error)?.message || String(err);
    post({ type: "error", ...(msg.type === "generate" ? { id: msg.id } : {}), message: /quota|QuotaExceeded/i.test(m) ? `Storage full: ${m}` : m });
  }
};
