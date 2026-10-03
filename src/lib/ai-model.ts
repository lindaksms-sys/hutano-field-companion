// Browser-side manager for the on-device model: explicit install, cancel, remove, extract.
// No narrative is ever sent to the worker before the user installed the model in Settings.
import {
  AiExtractionError,
  buildMessages,
  segmentNarrative,
  toExtractionResult,
  validateModelOutput,
} from "@/domain/ai-extraction";
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

export type AiState =
  | { kind: "checking" }
  | { kind: "unsupported"; reason: string }
  | { kind: "not_downloaded"; backend: AiBackend; estimateBytes: number }
  | { kind: "downloading"; backend: AiBackend; loaded: number; total: number; file: string }
  | { kind: "initializing"; backend: AiBackend; phase: "initializing" | "verifying" }
  | { kind: "ready"; manifest: AiInstallManifest }
  | { kind: "error"; message: string; backend: AiBackend | null };

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
let backendCache: AiBackend | null = null;

function killWorker() {
  worker?.terminate();
  worker = null;
  workerLoaded = false;
}

export const estimateBytes = (b: AiBackend) => AI_VARIANTS[b].bytes + AI_SHARED_BYTES;

export async function detectBackend(): Promise<{ backend: AiBackend | null; reason?: string }> {
  if (backendCache) return { backend: backendCache };
  if (typeof window === "undefined" || typeof Worker === "undefined") return { backend: null, reason: "Web Workers not available" };
  if (!("caches" in window)) return { backend: null, reason: "Cache storage not available" };
  if (typeof WebAssembly === "undefined") return { backend: null, reason: "WebAssembly not available" };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gpu = (navigator as any).gpu;
    const adapter = gpu ? await gpu.requestAdapter() : null;
    backendCache = adapter && adapter.features?.has("shader-f16") ? "webgpu" : "wasm";
  } catch {
    backendCache = "wasm";
  }
  return { backend: backendCache };
}

async function readManifest(): Promise<AiInstallManifest | null> {
  const cache = await caches.open(AI_MODEL.cacheName);
  const res = await cache.match(new URL(AI_MODEL.manifestKey, location.origin).href);
  if (!res) return null;
  const m = (await res.json()) as AiInstallManifest;
  if (m.modelId !== AI_MODEL.id || m.revision !== AI_MODEL.revision) return null;
  // Every recorded file must still be present (browser may have evicted some).
  const keys = new Set((await cache.keys()).map((r) => r.url));
  if (!m.cachedKeys.every((k) => keys.has(k))) return null;
  const need = [...AI_REQUIRED_FILES, AI_VARIANTS[m.backend].file];
  if (!need.every((f) => m.cachedKeys.some((k) => k.endsWith(`/${f}`)))) return null;
  return m;
}

export async function refreshAiState() {
  if (typeof window === "undefined") return;
  if (state.kind === "downloading" || state.kind === "initializing") return;
  const { backend, reason } = await detectBackend();
  if (!backend) return set({ kind: "unsupported", reason: reason ?? "Unsupported browser" });
  try {
    const m = await readManifest();
    set(m ? { kind: "ready", manifest: m } : { kind: "not_downloaded", backend, estimateBytes: estimateBytes(backend) });
  } catch (e) {
    set({ kind: "error", message: `Could not read model storage: ${(e as Error).message}`, backend });
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

/** Explicit user action only (Settings). */
export async function installModel() {
  const { backend, reason } = await detectBackend();
  if (!backend) return set({ kind: "unsupported", reason: reason ?? "Unsupported" });
  const { free } = await storageHeadroom();
  if (free !== null && free < estimateBytes(backend) * 1.1) {
    return set({ kind: "error", backend, message: `Not enough browser storage: about ${Math.round(free / 1e6)} MB free, about ${Math.round(estimateBytes(backend) / 1e6)} MB needed.` });
  }
  killWorker();
  const w = makeWorker();
  worker = w;
  const files = new Map<string, { loaded: number; total: number }>();
  set({ kind: "downloading", backend, loaded: 0, total: estimateBytes(backend), file: "" });
  await new Promise<void>((resolve) => {
    w.onerror = (e) => {
      if (worker !== w) return resolve();
      killWorker();
      set({ kind: "error", backend, message: e.message || "Model worker crashed" });
      resolve();
    };
    w.onmessage = (e) => {
      if (worker !== w) return resolve(); // cancelled
      const m = e.data;
      if (m.type === "progress") {
        files.set(m.file, { loaded: m.loaded, total: m.total });
        let loaded = 0;
        let total = 0;
        files.forEach((f) => {
          loaded += f.loaded;
          total += f.total;
        });
        set({ kind: "downloading", backend, loaded, total: Math.max(total, loaded), file: m.file });
      } else if (m.type === "phase" && m.phase !== "downloading") {
        set({ kind: "initializing", backend, phase: m.phase });
      } else if (m.type === "installed") {
        workerLoaded = true; // warm in memory; cold reopen re-reads from the dedicated cache
        set({ kind: "ready", manifest: m.manifest });
        resolve();
      } else if (m.type === "error") {
        killWorker();
        set({ kind: "error", backend, message: m.message });
        resolve();
      }
    };
    w.postMessage({ type: "install", backend });
  });
}

export function cancelInstall() {
  killWorker();
  void refreshAiState();
}

/** Deletes only the dedicated model cache. Encounter records (IndexedDB) are never touched. */
export async function removeModel() {
  killWorker();
  await caches.delete(AI_MODEL.cacheName);
  set({ kind: "checking" });
  await refreshAiState();
}

export interface AiRun {
  promise: Promise<ExtractionResult>;
  cancel: () => void;
}

/** Run on-device extraction. Rejects with a human-readable reason on any failure (fail closed). */
export function runOnDeviceExtraction(narrative: string): AiRun {
  let cancel = () => {};
  const promise = new Promise<ExtractionResult>((resolve, reject) => {
    if (state.kind !== "ready") return reject(new AiExtractionError("On-device AI is not installed. Install it in Settings."));
    const manifest = state.manifest;
    let segs;
    let messages;
    try {
      segs = segmentNarrative(narrative);
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
            const v = validateModelOutput(m.text, narrative, segs);
            resolve(
              toExtractionResult(v, {
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
