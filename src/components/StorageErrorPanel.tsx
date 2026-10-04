import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

/** Builds a diagnostic with browser/storage facts only — never record contents. */
async function buildDiagnostic(error: string) {
  const n = navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[]; mobile?: boolean } };
  const brands = n.userAgentData?.brands?.map((b) => `${b.brand} ${b.version}`).join(", ");
  let free = "unknown";
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota != null && est.usage != null) free = `${Math.round((est.quota - est.usage) / 1e6)} MB free of ${Math.round(est.quota / 1e6)} MB`;
  } catch { /* ignore */ }
  let framed = "unknown";
  try { framed = window.self !== window.top ? "yes" : "no"; } catch { framed = "yes"; }
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => null) : null;
  return [
    "Hutano storage diagnostic (no patient data)",
    `error: ${error.slice(0, 200)}`,
    `browser: ${brands || n.userAgent}${n.userAgentData?.mobile ? " · mobile" : ""}`,
    `indexedDB available: ${typeof indexedDB !== "undefined" ? "yes" : "no"}`,
    `storage: ${free}`,
    `persistent storage: ${persisted === null ? "unknown" : persisted ? "granted" : "not granted"}`,
    `inside another page (frame): ${framed}`,
    `time: ${new Date().toISOString()}`,
  ].join("\n");
}

export function StorageErrorPanel({ error, onRetry }: { error: string; onRetry: () => void | Promise<void> }) {
  const { tl } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm">
      <p className="font-bold text-destructive">{tl("This browser refused to open on-device storage, so records can't be saved here right now.")}</p>
      <p className="text-xs text-muted-foreground">Browser message: {error}</p>
      <p className="font-semibold">{tl("Try, in order:")}</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>{tl("Close every Hutano tab, then open one again.")}</li>
        <li>Open the app directly in its own tab (not inside a preview or another page).</li>
        <li>{tl("Leave private/incognito mode and check the device has free storage.")}</li>
        <li>{tl("Last resort: clear this site's data in browser settings. This deletes records saved in this browser.")}</li>
      </ol>
      <p className="text-xs text-muted-foreground">{tl("Hutano never deletes your records automatically.")}</p>
      <div className="flex flex-wrap gap-2">
        <Button className="h-11" disabled={busy} onClick={async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } }}>
          {busy ? tl("Retrying…") : tl("Retry")}
        </Button>
        <Button variant="outline" className="h-11" onClick={async () => {
          const text = await buildDiagnostic(error);
          try { await navigator.clipboard.writeText(text); setCopied(tl("Copied.")); } catch { setCopied(text); }
        }}>
          {tl("Copy diagnostic (no patient data)")}
        </Button>
      </div>
      {copied && <pre className="whitespace-pre-wrap text-xs">{copied}</pre>}
    </div>
  );
}
