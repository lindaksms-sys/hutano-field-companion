// Browser-side manager for the on-device model: explicit install, cancel, remove, extract.
// No narrative is ever sent to the worker before the user installed the model in Settings.
import {
  AiExtractionError,
  buildMessages,
  combineHybrid,
  segmentNarrative,
} from "@/domain/ai-extraction";
import { runRules } from "@/domain/rules";
import type { InputLanguage } from "@/domain/types";
import type { ExtractionResult } from "@/domain/extraction";
import {
  AI_MODEL,
  AI_REQUIRED_FILES,
  AI_SHARED_BYTES,
  AI_TIMEOUT_MS,
  AI_VARIANTS,
  type AiBackend,
  type AiInstallManifest,
  type WorkerIn,
  type WorkerOut,
} from "./ai-config";

export type AiStage = "start" | "download" | "initialize" | "verify" | "cache-check";
export type AiErrorCategory = "network" | "cache" | "quota" | "worker" | "model-init" | "verification" | "timeout" | "unknown";

/** Sanitized, copyable diagnostics. Never contains note text, prompts or model output. */
export interface AiDiagnostic {
  backend: AiBackend;
  stage: AiStage;
  category: AiErrorCategory;
  file: string; // basename only
  message: string; // sanitized, URLs reduced to basenames, capped
  browser: string;
  gpu: "available" | "not available" | "unknown";
  time: string;
}

export type AiState =
  | { kind: "checking" }
  | { kind: "unsupported"; reason: string }
  | { kind: "not_downloaded"; backend: AiBackend; gpuAvailable: boolean; estimateBytes: number }
  | { kind: "downloading"; backend: AiBackend; loaded: number; total: number; file: string }
  | { kind: "initializing"; backend: AiBackend; phase: "initializing" | "verifying" }
  | { kind: "ready"; manifest: AiInstallManifest }
  | { kind: "error"; message: string; backend: AiBackend | null; diag?: AiDiagnostic };

export interface WorkerLike {
  postMessage(m: WorkerIn): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<WorkerOut>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

let makeWorker: () => WorkerLike = () =>
  new Worker(new URL("../workers/ai-extraction.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;
/** Test hook. */
export function setWorkerFactory(f: () => WorkerLike) {
  makeWorker = f;
}

/** No progress for this long during download, or no completion during init/verify, fails the install (cache kept). */
export const INSTALL_TIMEOUTS = { stallMs: 120_000, initMs: 300_000 };

let state: AiState = { kind: "checking" };
const listeners = new Set<(s: AiState) => void>();
function set(s: AiState) {
  state = s;
  listeners.forEach((l) => l(s));
}
export const getAiState = () => state;
export function onAiState(l: (s: AiState) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

let worker: WorkerLike | null = null;
let workerLoaded = false;
let gpuCache: boolean | null = null;
let installDone: (() => void) | null = null; // resolves the pending installModel() promise
let watchdog: ReturnType<typeof setTimeout> | null = null;

function clearWatchdog() {
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
}
function killWorker() {
  clearWatchdog();
  try {
    worker?.terminate();
  } catch {
    /* already gone */
  }
  worker = null;
  workerLoaded = false;
}
function endInstall() {
  const d = installDone;
  installDone = null;
  d?.();
}

export const estimateBytes = (b: AiBackend) => AI_VARIANTS[b].bytes + AI_SHARED_BYTES;

// ---- backend preference (UI setting only, never encounter data) ----
const PREF_KEY = "hutano.aiBackend";
/** Default is the tested CPU/WASM path; GPU must be chosen explicitly. */
export function getBackendPreference(): AiBackend {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(PREF_KEY) === "webgpu" ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}
export function setBackendPreference(b: AiBackend) {
  try {
    localStorage.setItem(PREF_KEY, b);
  } catch {
    /* ignore */
  }
  if (state.kind === "not_downloaded" || state.kind === "error") void refreshAiState(true);
}

export async function detectGpu(): Promise<boolean> {
  if (gpuCache !== null) return gpuCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gpu = (navigator as any).gpu;
    const adapter = gpu ? await gpu.requestAdapter() : null;
    gpuCache = !!(adapter && adapter.features?.has("shader-f16"));
  } catch {
    gpuCache = false;
  }
  return gpuCache;
}

function supportProblem(): string | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return "Web Workers not available";
  if (!("caches" in window)) return "Cache storage not available";
  if (typeof WebAssembly === "undefined") return "WebAssembly not available";
  return null;
}

/** Back-compat: the backend a new install would use (user preference; GPU only if chosen and available). */
export async function detectBackend(): Promise<{ backend: AiBackend | null; reason?: string }> {
  const p = supportProblem();
  if (p) return { backend: null, reason: p };
  const pref = getBackendPreference();
  return { backend: pref === "webgpu" && (await detectGpu()) ? "webgpu" : "wasm" };
}

async function readManifest(): Promise<AiInstallManifest | null> {
  const cache = await caches.open(AI_MODEL.cacheName);
  const res = await cache.match(new URL(AI_MODEL.manifestKey, location.origin).href);
  if (!res) return null;
  const m = (await res.json()) as AiInstallManifest;
  if (m.modelId !== AI_MODEL.id || m.revision !== AI_MODEL.revision) return null;
  if (m.smokeParsed !== true) return null; // installs from before strict verification must be redone
  // Every recorded file must still be present (browser may have evicted some).
  const keys = new Set((await cache.keys()).map((r) => r.url));
  if (!m.cachedKeys.every((k) => keys.has(k))) return null;
  const need = [...AI_REQUIRED_FILES, AI_VARIANTS[m.backend].file];
  if (!need.every((f) => m.cachedKeys.some((k) => k.endsWith(`/${f}`)))) return null;
  return m;
}

/** `force` re-reads even mid-install (used after cancel/failure so the UI can never stay stuck). */
export async function refreshAiState(force = false) {
  if (typeof window === "undefined") return;
  if (!force && (state.kind === "downloading" || state.kind === "initializing")) return;
  const p = supportProblem();
  if (p) return set({ kind: "unsupported", reason: p });
  const gpuAvailable = await detectGpu();
  const pref = getBackendPreference();
  const backend: AiBackend = pref === "webgpu" && gpuAvailable ? "webgpu" : "wasm";
  try {
    const m = await readManifest();
    // A valid install keeps its own backend, whatever the current preference.
    set(m ? { kind: "ready", manifest: m } : { kind: "not_downloaded", backend, gpuAvailable, estimateBytes: estimateBytes(backend) });
  } catch (e) {
    set({ kind: "error", message: `Could not read model storage: ${sanitize((e as Error)?.message ?? String(e))}`, backend });
  }
}

export async function storageHeadroom(): Promise<{ free: number | null }> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est?.quota) return { free: null };
    return { free: est.quota - (est.usage ?? 0) };
  } catch {
    return { free: null };
  }
}

// ---- diagnostics ----
export function sanitize(msg: string): string {
  return String(msg)
    .replace(/https?:\/\/[^\s)'"]+/g, (u) => u.split("?")[0]!.split("/").pop() || "url")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}
export const basename = (f: string) => (f ? sanitize(f).split("/").pop()!.slice(0, 80) : "");

export function categorize(message: string, stage: AiStage): AiErrorCategory {
  const m = message.toLowerCase();
  if (/quota|storage full|not enough browser storage|no space/.test(m)) return "quota";
  if (/timed out|timeout|no progress|stalled/.test(m)) return "timeout";
  if (/failed to fetch|network|load failed|err_|offline|http \d|status \d|cors/.test(m)) return "network";
  if (/cache|not fully cached|caches/.test(m)) return "cache";
  if (/worker|could not start/.test(m)) return "worker";
  if (stage === "verify" || /verification/.test(m)) return "verification";
  if (stage === "initialize" || /webgpu|gpu|wasm|session|onnx|backend|memory|out of memory/.test(m)) return "model-init";
  return "unknown";
}

function browserInfo(): string {
  if (typeof navigator === "undefined") return "unknown";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = navigator as any;
  const brands = n.userAgentData?.brands?.map((b: { brand: string; version: string }) => `${b.brand} ${b.version}`).join(", ");
  const mem = n.deviceMemory ? ` · ~${n.deviceMemory} GB RAM reported` : "";
  const cores = n.hardwareConcurrency ? ` · ${n.hardwareConcurrency} cores` : "";
  return sanitize(`${brands || n.userAgent || "unknown"}${n.userAgentData?.mobile ? " · mobile" : ""}${mem}${cores}`);
}

export function makeDiagnostic(backend: AiBackend, stage: AiStage, message: string, file = ""): AiDiagnostic {
  const msg = sanitize(message);
  return { backend, stage, category: categorize(msg, stage), file: basename(file), message: msg, browser: browserInfo(), gpu: gpuCache === null ? "unknown" : gpuCache ? "available" : "not available", time: new Date().toISOString() };
}

export function diagnosticText(d: AiDiagnostic): string {
  return [
    "Hutano on-device AI install diagnostic (no patient data)",
    `Model: ${AI_MODEL.id} @ ${AI_MODEL.revision.slice(0, 12)}`,
    `Library: ${AI_MODEL.library}`,
    `Mode: ${d.backend === "webgpu" ? "GPU (experimental) q4f16" : "Compatibility / CPU q8"}`,
    `Stage: ${d.stage}`,
    `Category: ${d.category}`,
    `File: ${d.file || "-"}`,
    `Error: ${d.message}`,
    `GPU detected: ${d.gpu}`,
    `Browser: ${d.browser}`,
    `Time: ${d.time}`,
  ].join("\n");
}

const NEXT_STEP: Record<AiErrorCategory, string> = {
  network: "Check Wi-Fi and retry; files already downloaded are kept.",
  cache: "Retry. If it repeats, Remove model files and download again.",
  quota: "Free up phone storage or browser site data, then retry.",
  worker: "Reload the page and retry. If it repeats, this browser may not support it.",
  "model-init": "The device could not start the model. Try Compatibility / CPU mode, close other apps, then retry.",
  verification: "The model loaded but failed its test. Retry; if it repeats, Remove model files and download again.",
  timeout: "It stopped making progress. Retry on stable Wi-Fi; downloaded files are kept.",
  unknown: "Retry. If it repeats, copy the diagnostic and share it.",
};
export const nextStep = (c: AiErrorCategory) => NEXT_STEP[c];

/** Explicit user action only (Settings). Downloads only the chosen backend's variant; never a second variant automatically. */
export async function installModel(chosen?: AiBackend) {
  const p = supportProblem();
  if (p) return set({ kind: "unsupported", reason: p });
  let backend: AiBackend = chosen ?? getBackendPreference();
  if (backend === "webgpu" && !(await detectGpu())) backend = "wasm";
  const { free } = await storageHeadroom();
  if (free !== null && free < estimateBytes(backend) * 1.1) {
    const message = `Not enough browser storage: about ${Math.round(free / 1e6)} MB free, about ${Math.round(estimateBytes(backend) / 1e6)} MB needed.`;
    return set({ kind: "error", backend, message, diag: makeDiagnostic(backend, "start", message) });
  }
  killWorker();
  endInstall();
  let w: WorkerLike;
  try {
    w = makeWorker();
  } catch (e) {
    const message = `Could not start the AI worker: ${(e as Error)?.message ?? String(e)}`;
    return set({ kind: "error", backend, message: sanitize(message), diag: makeDiagnostic(backend, "start", message) });
  }
  worker = w;
  let stage: AiStage = "download";
  let lastFile = "";
  const files = new Map<string, { loaded: number; total: number }>();
  set({ kind: "downloading", backend, loaded: 0, total: estimateBytes(backend), file: "" });

  await new Promise<void>((resolve) => {
    installDone = resolve;
    const fail = (message: string, st: AiStage = stage, file = lastFile) => {
      if (worker !== w) return endInstall();
      killWorker();
      const diag = makeDiagnostic(backend, st, message, file);
      set({ kind: "error", backend, message: diag.message, diag });
      endInstall();
    };
    const arm = () => {
      clearWatchdog();
      const ms = stage === "download" ? INSTALL_TIMEOUTS.stallMs : INSTALL_TIMEOUTS.initMs;
      watchdog = setTimeout(() => fail(stage === "download" ? `No download progress for ${Math.round(ms / 1000)} s (stalled).` : `Timed out after ${Math.round(ms / 1000)} s during ${stage}.`), ms);
    };
    arm();
    w.onerror = (e) => fail(`Worker error: ${e?.message || "worker crashed or failed to load"}`);
    w.onmessage = (e) => {
      if (worker !== w) return endInstall(); // cancelled or replaced
      const m = e.data;
      if (m.type === "progress") {
        lastFile = m.file;
        files.set(m.file, { loaded: m.loaded, total: m.total });
        let loaded = 0;
        let total = 0;
        files.forEach((f) => {
          loaded += f.loaded;
          total += f.total;
        });
        arm();
        set({ kind: "downloading", backend, loaded, total: Math.max(total, loaded), file: basename(m.file) });
      } else if (m.type === "phase" && m.phase !== "downloading") {
        stage = m.phase === "verifying" ? "verify" : "initialize";
        arm();
        set({ kind: "initializing", backend, phase: m.phase });
      } else if (m.type === "installed") {
        clearWatchdog();
        workerLoaded = true; // warm in memory; cold reopen re-reads from the dedicated cache
        set({ kind: "ready", manifest: m.manifest });
        endInstall();
      } else if (m.type === "error") {
        fail(m.message, (m.stage as AiStage | undefined) ?? stage, m.file ?? lastFile);
      }
    };
    try {
      w.postMessage({ type: "install", backend });
    } catch (e) {
      fail(`Could not start the AI worker: ${(e as Error)?.message ?? String(e)}`, "start");
    }
  });
}

/** Stops the worker, settles the pending install and returns to a real state. Downloaded cache files are kept. */
export async function cancelInstall() {
  killWorker();
  endInstall();
  await refreshAiState(true);
}

/** Deletes only the dedicated model cache. Encounter records (IndexedDB) are never touched. */
export async function removeModel() {
  killWorker();
  endInstall();
  await caches.delete(AI_MODEL.cacheName);
  set({ kind: "checking" });
  await refreshAiState(true);
}

export interface AiRun {
  promise: Promise<ExtractionResult>;
  cancel: () => void;
}

/** Run on-device extraction. Rejects with a human-readable reason on any failure (fail closed). */
export function runOnDeviceExtraction(narrative: string, language: InputLanguage = "mixed"): AiRun {
  let cancel = () => {};
  const promise = new Promise<ExtractionResult>((resolve, reject) => {
    if (state.kind !== "ready") return reject(new AiExtractionError("On-device AI is not installed. Install it in Settings."));
    const manifest = state.manifest;
    let segs;
    let messages;
    let rules: ReturnType<typeof runRules>;
    try {
      segs = segmentNarrative(narrative);
      rules = runRules(segs, narrative); // deterministic, not AI
      messages = buildMessages(segs);
    } catch (e) {
      return reject(e);
    }
    if (!worker) {
      worker = makeWorker();
      workerLoaded = false;
    }
    const w = worker;
    const id = crypto.randomUUID();
    const t0 = performance.now();
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => {
        killWorker();
        reject(new AiExtractionError("On-device AI timed out."));
      });
    }, AI_TIMEOUT_MS[manifest.backend] + (workerLoaded ? 0 : 120_000));
    cancel = () =>
      finish(() => {
        killWorker(); // terminating stops inference immediately
        reject(new AiExtractionError("Cancelled."));
      });
    w.onerror = (e) => finish(() => {
      killWorker();
      reject(new AiExtractionError(`On-device AI crashed: ${e.message || "unknown error"}`));
    });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "loaded") {
        workerLoaded = true;
        w.postMessage({ type: "generate", id, messages });
      } else if (m.type === "generated" && m.id === id) {
        finish(() => {
          try {
            resolve(
              combineHybrid(m.text, narrative, segs, language, rules, {
                modelId: manifest.modelId,
                modelRevision: manifest.revision,
                backend: manifest.backend,
                dtype: manifest.dtype,
                durationMs: Math.round(performance.now() - t0),
              }),
            );
          } catch (err) {
            reject(err instanceof AiExtractionError ? err : new AiExtractionError("Model output rejected."));
          }
        });
      } else if (m.type === "error") {
        finish(() => {
          killWorker();
          reject(new AiExtractionError(`On-device AI failed: ${m.message}`));
        });
      }
    };
    if (workerLoaded) w.postMessage({ type: "generate", id, messages });
    else w.postMessage({ type: "load", backend: manifest.backend });
  });
  return { promise, cancel: () => cancel() };
}

/** Test hook. */
export function __setReadyForTest(m: AiInstallManifest | null) {
  killWorker();
  set(m ? { kind: "ready", manifest: m } : { kind: "checking" });
}
