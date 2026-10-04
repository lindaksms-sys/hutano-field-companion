import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusPill } from "@/components/StatusPill";
import { demoAdapter } from "@/domain/extraction";
import { clearDemoData, exportDemoRecords } from "@/domain/repository";
import { supabaseConfig } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useStorageStatus } from "@/lib/hooks";
import { StorageErrorPanel } from "@/components/StorageErrorPanel";
import { resetDBConnection } from "@/domain/db";
import { useOfflineState } from "@/lib/use-offline";
import { useI18n } from "@/lib/i18n";
import { AiModelPanel } from "@/components/AiModelPanel";
import { useAiState } from "@/lib/use-ai";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Hutano" },
      { name: "description", content: "Storage, backend and extraction readiness; demo data tools." },
      { property: "og:title", content: "Settings — Hutano" },
      { property: "og:description", content: "Honest readiness status and demo data management." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { status, requestPersist, recheck } = useStorageStatus();
  const { lang, setLang, tl, tf } = useI18n();
  const [msg, setMsg] = useState<string | null>(null);
  const cfg = supabaseConfig();
  const offline = useOfflineState();
  const { user } = useAuth();
  const ai = useAiState();

  const mb = (n: number | null) => (n == null ? tl("unknown") : `${(n / 1024 / 1024).toFixed(1)} MB`);

  async function doExport() {
    try {
      const json = await exportDemoRecords();
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `hutano-synthetic-demo-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMsg(tf("Export failed: {errorMessage}", { errorMessage: (e as Error).message }));
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">{tl("Settings")}</h1>

      <Section title={tl("Readiness")}>
        <Row k={tl("Local storage (IndexedDB)")} v={status.indexedDB === "ok" ? <StatusPill tone="success">{tl("Working")}</StatusPill> : status.indexedDB === "failed" ? <StatusPill tone="danger">{tl("Failed")}</StatusPill> : tl("Checking…")} />
        {status.error && <div className="px-4 pb-3"><StorageErrorPanel error={status.error} onRetry={async () => { resetDBConnection(); await recheck(); }} /></div>}
        <Row k={tl("Persistent storage")} v={status.persisted === true ? <StatusPill tone="success">{tl("Granted")}</StatusPill> : status.persisted === false ? <StatusPill tone="pending">{tl("Not granted — browser may clear data")}</StatusPill> : tl("Unsupported")} />
        <Row k={tl("Storage used / quota")} v={`${mb(status.usage)} / ${mb(status.quota)}`} />
        <Row k={tl("Backend")} v={<StatusPill tone={cfg.configured ? "success" : "pending"}>{cfg.configured ? tl("Configured (external Supabase)") : tl("Not configured")}</StatusPill>} />
        <Row k={tl("Account")} v={<StatusPill tone={user ? "success" : "pending"}>{user ? tl("Signed in") : tl("Not signed in")}</StatusPill>} />
        <Row k={tl("Cloud sync")} v={tl("Manual / on reconnect, app must be open")} />
        <Row k={tl("Extraction")} v={<StatusPill tone="pending">{demoAdapter.label}</StatusPill>} />
        <Row k={tl("On-device AI (experimental)")} v={<StatusPill tone={ai.kind === "ready" ? "success" : "pending"}>{ai.kind === "ready" ? `${tl("Installed")} · ${ai.manifest.backend}` : ai.kind === "unsupported" ? tl("Not supported here") : tl("Not installed")}</StatusPill>} />
        <Row k={tl("Offline app (after first online load)")} v={
          offline.kind === "ready" ? <StatusPill tone="success">{tl("Ready")} · {offline.pages} {tl("pages cached")}{offline.updateWaiting ? <> {tl("· update after closing tabs")}</> : ""}</StatusPill>
          : offline.kind === "installing" || offline.kind === "checking" ? <StatusPill tone="pending">{tl("Preparing — not ready yet")}</StatusPill>
          : offline.kind === "disabled" ? <StatusPill>{tl("Off here")} ({tl(offline.reason)})</StatusPill>
          : offline.kind === "failed" ? <StatusPill tone="danger">{tl("Failed")}: {offline.message}</StatusPill>
          : <StatusPill tone="danger">{tl("Not supported by this browser")}</StatusPill>
        } />
        <Row k={tl("Offline capture")} v={tl("Saved on this device; sync needs internet")} />
        <Row k={tl("Offline AI")} v={ai.kind === "ready" ? tl("Works offline on this device once installed") : tl("Install the model below first")} />
        {status.persisted === false && (
          <div className="p-4"><Button variant="outline" className="h-11" onClick={requestPersist}>{tl("Request persistent storage")}</Button></div>
        )}
      </Section>

      <Section title={tl("On-device AI extraction (experimental)")}>
        <AiModelPanel />
      </Section>

      <Section title={tl("Interface language")}>
        <div className="flex gap-2 p-4">
          {(["en", "sn"] as const).map((l) => (
            <Button key={l} variant={lang === l ? "default" : "outline"} className="h-11" onClick={() => setLang(l)}>
              {l === "en" ? tl("English") : tl("Shona")}
            </Button>
          ))}
        </div>
        <p className="px-4 pb-4 text-xs text-muted-foreground">{tl("Shona interface approved by the project's Shona reviewer.")}</p>
      </Section>

      <Section title={tl("Synthetic demo data")}>
        <div className="flex flex-col gap-2 p-4 sm:flex-row">
          <Button variant="outline" className="h-12" onClick={doExport}>{tl("Export synthetic records (JSON)")}</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="h-12">{tl("Clear demo data")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tl("Delete all synthetic records?")}</AlertDialogTitle>
                <AlertDialogDescription>{tl("This permanently removes every demo record from this device. It cannot be undone.")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tl("Cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      const n = await clearDemoData();
                      setMsg(`Deleted ${n} record(s).`);
                    } catch (e) {
                      setMsg(tf("Delete failed: {errorMessage}", { errorMessage: (e as Error).message }));
                    }
                  }}
                >
                  {tl("Delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {msg && <p role="status" className="px-4 pb-4 text-sm font-semibold">{msg}</p>}
      </Section>

      <p className="text-xs text-muted-foreground">
        {tl("Privacy: local records are unencrypted in this browser. Anyone with access to this unlocked device and browser profile can read them. Avoid shared devices.")}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 font-bold">{title}</h2>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-semibold">{v}</span>
    </div>
  );
}
