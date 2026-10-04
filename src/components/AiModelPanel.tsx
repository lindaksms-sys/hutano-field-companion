import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { AI_MODEL, AI_VARIANTS } from "@/lib/ai-config";
import { cancelInstall, diagnosticText, estimateBytes, getBackendPreference, installModel, nextStep, removeModel, setBackendPreference, storageHeadroom } from "@/lib/ai-model";
import type { AiBackend } from "@/lib/ai-config";
import { useAiState } from "@/lib/use-ai";

const mb = (n: number) => `${Math.round(n / 1e6)} MB`;

export function AiModelPanel() {
  const { tl } = useI18n();
  const ai = useAiState();
  const [free, setFree] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [mode, setMode] = useState<AiBackend>("wasm");
  const [copied, setCopied] = useState(false);
  useEffect(() => setMode(getBackendPreference()), []);
  const gpuAvailable = ai.kind === "not_downloaded" ? ai.gpuAvailable : null;
  useEffect(() => {
    void storageHeadroom().then((s) => setFree(s.free));
  }, [ai.kind]);

  const backend = ai.kind === "not_downloaded" || ai.kind === "downloading" || ai.kind === "initializing" ? ai.backend : ai.kind === "error" ? ai.backend : ai.kind === "ready" ? ai.manifest.backend : null;

  return (
    <div className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto font-semibold">{tl("Status")}</span>
        {ai.kind === "checking" && <StatusPill>{tl("Checking…")}</StatusPill>}
        {ai.kind === "unsupported" && <StatusPill tone="danger">Not supported: {ai.reason}</StatusPill>}
        {ai.kind === "not_downloaded" && <StatusPill>{tl("Not downloaded")}</StatusPill>}
        {ai.kind === "downloading" && <StatusPill tone="pending">Downloading {mb(ai.loaded)} / {mb(ai.total)}</StatusPill>}
        {ai.kind === "initializing" && <StatusPill tone="pending">{ai.phase === "verifying" ? tl("Testing a real inference…") : tl("Initializing…")}</StatusPill>}
        {ai.kind === "ready" && <StatusPill tone="success">{tl("Ready · installed and tested")}</StatusPill>}
        {ai.kind === "error" && <StatusPill tone="danger">{tl("Error")}</StatusPill>}
      </div>

      {ai.kind === "error" && (
        <div role="alert" className="space-y-2">
          <p className="font-semibold text-destructive">{ai.message}</p>
          {ai.diag && (
            <>
              <p>{tl(nextStep(ai.diag.category))} Manual capture still works.</p>
              <pre className="whitespace-pre-wrap break-all rounded-lg bg-muted p-2 text-xs">{diagnosticText(ai.diag)}</pre>
              <Button variant="outline" className="h-11" onClick={() => { void navigator.clipboard?.writeText(diagnosticText(ai.diag!)).then(() => setCopied(true), () => setCopied(false)); }}>
                {copied ? tl("Copied") : tl("Copy diagnostic (no patient data)")}
              </Button>
            </>
          )}
        </div>
      )}

      {(ai.kind === "not_downloaded" || ai.kind === "error") && (
        <fieldset className="space-y-2">
          <legend className="font-semibold">{tl("Mode")}</legend>
          {([
            ["wasm", tl("Compatibility / CPU (tested in desktop browser)"), tl("Slower. The only mode tested so far.")],
            ["webgpu", tl("GPU (experimental)"), gpuAvailable === false ? tl("No suitable GPU found in this browser.") : tl("Untested. May fail or give different results.")],
          ] as const).map(([id, label, note]) => (
            <label key={id} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 ${mode === id ? "border-primary" : "border-border"}`}>
              <input type="radio" name="ai-mode" className="mt-1 h-5 w-5" checked={mode === id} disabled={id === "webgpu" && gpuAvailable === false}
                onChange={() => { setMode(id); setBackendPreference(id); setConfirm(false); }} />
              <span><span className="block font-semibold">{label} · about {mb(estimateBytes(id))}</span><span className="text-muted-foreground">{note}</span></span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">{tl("Only the chosen mode is downloaded. Switching later means a separate download. Not yet verified on any phone.")}</p>
        </fieldset>
      )}

      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Experimental. Suggests whole sentences from your note for each field; you check and accept each one. Never diagnoses or advises.</li>
        <li>Shona ability is not validated. Original text is always kept as written; nothing is translated.</li>
        <li>{tl("Runs only on this device. Notes are never sent anywhere for AI.")}</li>
        <li>Needs a recent desktop or high-end phone with about 1.5 GB free memory. Slow devices may take minutes per note or fail; manual capture always works.</li>
      </ul>

      {backend && (
        <p>
          Download for this device ({backend === "webgpu" ? tl("WebGPU, q4f16") : tl("WebAssembly, q8")}): about <strong>{mb(estimateBytes(backend))}</strong> (from the model's published file sizes).
          {free !== null && <> Browser storage free: about {mb(free)}.</>} Use Wi-Fi.
        </p>
      )}

      {ai.kind === "downloading" && (
        <div className="space-y-2">
          <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round((ai.loaded / Math.max(ai.total, 1)) * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary" style={{ width: `${Math.min(100, (ai.loaded / Math.max(ai.total, 1)) * 100)}%` }} />
          </div>
          <p className="truncate text-xs text-muted-foreground">{ai.file}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(ai.kind === "not_downloaded" || ai.kind === "error") && backend && !confirm && (
          <Button className="h-12" onClick={() => setConfirm(true)}>{ai.kind === "error" ? tl("Retry download") : tl("Download on-device AI")}</Button>
        )}
        {confirm && (ai.kind === "not_downloaded" || ai.kind === "error") && backend && (
          <div className="w-full space-y-2 rounded-lg border border-pending-border bg-pending/40 p-3">
            <p>Download about {mb(estimateBytes(mode))} ({mode === "webgpu" ? tl("GPU, experimental") : tl("Compatibility / CPU")}) and store it in this browser? Nothing from your notes is used for this step.</p>
            <div className="flex gap-2">
              <Button className="h-11" onClick={() => { setConfirm(false); setCopied(false); void installModel(mode); }}>{tl("Yes, download")}</Button>
              <Button variant="outline" className="h-11" onClick={() => setConfirm(false)}>{tl("Not now")}</Button>
            </div>
          </div>
        )}
        {(ai.kind === "downloading" || ai.kind === "initializing") && (
          <Button variant="outline" className="h-12" onClick={() => void cancelInstall()}>{tl("Cancel")}</Button>
        )}
        {(ai.kind === "ready" || ai.kind === "error" || ai.kind === "not_downloaded") && (
          <Button variant="outline" className="h-12" onClick={() => void removeModel()}>{tl("Remove model files")}</Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{tl("Removing deletes only the model files. Your encounter records are not touched.")}</p>

      <details>
        <summary className="cursor-pointer font-semibold text-primary">{tl("Diagnostics")}</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt>{tl("Model")}</dt><dd className="break-all">{AI_MODEL.id}</dd>
          <dt>{tl("Revision")}</dt><dd className="break-all">{AI_MODEL.revision}</dd>
          <dt>{tl("License")}</dt><dd>{AI_MODEL.license}</dd>
          <dt>{tl("Library")}</dt><dd>{AI_MODEL.library}</dd>
          <dt>{tl("Runtime")}</dt><dd className="break-all">{AI_MODEL.runtime}</dd>
          <dt>{tl("Variants")}</dt><dd>WebGPU {AI_VARIANTS.webgpu.dtype} · WASM {AI_VARIANTS.wasm.dtype}</dd>
          {ai.kind === "ready" && (
            <>
              <dt>{tl("Installed")}</dt><dd>{new Date(ai.manifest.installedAt).toLocaleString()} · {ai.manifest.backend}/{ai.manifest.dtype}</dd>
              <dt>{tl("Cached")}</dt><dd>{ai.manifest.cachedKeys.length} files · {mb(ai.manifest.cachedBytes)}</dd>
              <dt>{tl("Test run")}</dt><dd>{Math.round(ai.manifest.smokeMs / 1000)} s · {ai.manifest.smokeParsed ? tl("valid JSON") : tl("ran, output not JSON")}</dd>
            </>
          )}
        </dl>
      </details>
    </div>
  );
}
