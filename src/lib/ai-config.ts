// Pinned on-device model configuration. Sizes are from the Hugging Face file listing at the pinned revision.
export const AI_MODEL = {
  id: "onnx-community/Qwen3-0.6B-ONNX",
  revision: "da1453100cf3ff33ef56d17983fc7a8648706db6",
  license: "Apache-2.0 (Qwen3-0.6B base model)",
  library: "@huggingface/transformers 4.3.0",
  runtime: "onnxruntime-web 1.31.0-dev.20260914-8d85527a0",
  cacheName: "hutano-ai-v1",
  manifestKey: "/__hutano_ai_install.json",
} as const;

export type AiBackend = "webgpu" | "wasm";

/** WebGPU (with shader-f16) uses q4f16; otherwise single-threaded WASM uses q8. */
export const AI_VARIANTS: Record<AiBackend, { dtype: "q4f16" | "q8"; file: string; bytes: number }> = {
  webgpu: { dtype: "q4f16", file: "onnx/model_q4f16.onnx", bytes: 569_789_750 },
  wasm: { dtype: "q8", file: "onnx/model_quantized.onnx", bytes: 617_687_575 },
};

/** tokenizer.json + configs (~9.2 MB) and the ONNX Runtime WebAssembly runtime (~27 MB). */
export const AI_SHARED_BYTES = 9_117_040 + 9_705 + 912 + 219 + 26_861_777 + 53_057;

export const AI_REQUIRED_FILES = ["config.json", "generation_config.json", "tokenizer.json", "tokenizer_config.json"];

export const AI_TIMEOUT_MS = { webgpu: 90_000, wasm: 240_000 } as const;
export const AI_MAX_INPUT_TOKENS = 1500;
export const AI_MAX_NEW_TOKENS = 96;

export interface AiInstallManifest {
  modelId: string;
  revision: string;
  backend: AiBackend;
  dtype: string;
  installedAt: string;
  cachedKeys: string[];
  cachedBytes: number;
  smokeMs: number;
  smokeParsed: boolean;
}

export type WorkerIn =
  | { type: "install"; backend: AiBackend }
  | { type: "load"; backend: AiBackend }
  | { type: "generate"; id: string; messages: { role: string; content: string }[] };

export type WorkerOut =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "phase"; phase: "downloading" | "initializing" | "verifying" }
  | { type: "installed"; manifest: AiInstallManifest }
  | { type: "loaded" }
  | { type: "generated"; id: string; text: string; inputTokens: number; ms: number }
  | { type: "error"; id?: string; message: string; stage?: "download" | "initialize" | "verify" | "cache-check"; file?: string };

/** Fixed synthetic smoke prompt run during install, before the model is marked Ready. */
export const AI_SMOKE_MESSAGES = [
  { role: "system", content: 'Reply with one JSON object only, exactly {"patientCode": N} where N is the number of the sentence that contains a patient code.' },
  { role: "user", content: "[1] Synthetic patient SYN-0001 seen today." },
];

/** Smoke output must be exactly {"patientCode":1} (optionally wrapped in an empty think block / code fence). */
export function checkSmokeOutput(text: unknown): { ok: boolean; reason: string } {
  if (typeof text !== "string" || !text.trim()) return { ok: false, reason: "no output" };
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (t.length > 200) return { ok: false, reason: "output too long" };
  let o: unknown;
  try {
    o = JSON.parse(t);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ok: false, reason: "not a JSON object" };
  const keys = Object.keys(o);
  if (keys.length !== 1 || keys[0] !== "patientCode") return { ok: false, reason: "unexpected keys" };
  if ((o as Record<string, unknown>)["patientCode"] !== 1) return { ok: false, reason: "wrong answer" };
  return { ok: true, reason: "ok" };
}
