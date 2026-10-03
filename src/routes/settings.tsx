import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusPill } from "@/components/StatusPill";
import { aiAdapter, demoAdapter } from "@/domain/extraction";
import { clearDemoData, exportDemoRecords } from "@/domain/repository";
import { backendConfig } from "@/domain/sync";
import { useStorageStatus } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";

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

const mb = (n: number | null) => (n == null ? "unknown" : `${(n / 1024 / 1024).toFixed(1)} MB`);

function SettingsPage() {
  const { status, requestPersist } = useStorageStatus();
  const { lang, setLang } = useI18n();
  const [msg, setMsg] = useState<string | null>(null);
  const cfg = backendConfig();

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
      setMsg(`Export failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Section title="Readiness">
        <Row k="Local storage (IndexedDB)" v={status.indexedDB === "ok" ? <StatusPill tone="success">Working</StatusPill> : status.indexedDB === "failed" ? <StatusPill tone="danger">Failed</StatusPill> : "Checking…"} />
        {status.error && <p className="px-4 pb-3 text-sm font-semibold text-destructive">{status.error}</p>}
        <Row k="Persistent storage" v={status.persisted === true ? <StatusPill tone="success">Granted</StatusPill> : status.persisted === false ? <StatusPill tone="pending">Not granted — browser may clear data</StatusPill> : "Unsupported"} />
        <Row k="Storage used / quota" v={`${mb(status.usage)} / ${mb(status.quota)}`} />
        <Row k="Backend sync" v={<StatusPill tone="pending">{cfg.configured ? "Env present, not implemented" : "Not configured"}</StatusPill>} />
        <Row k="Extraction" v={<StatusPill tone="pending">{demoAdapter.label}</StatusPill>} />
        <Row k="AI extraction" v={<StatusPill>{aiAdapter.configured ? "Configured" : "Not implemented"}</StatusPill>} />
        <Row k="Offline capture" v="Works after first load (local storage)" />
        <Row k="Offline AI" v="Not implemented" />
        {status.persisted === false && (
          <div className="p-4"><Button variant="outline" className="h-11" onClick={requestPersist}>Request persistent storage</Button></div>
        )}
      </Section>

      <Section title="Interface language">
        <div className="flex gap-2 p-4">
          {(["en", "sn"] as const).map((l) => (
            <Button key={l} variant={lang === l ? "default" : "outline"} className="h-11" onClick={() => setLang(l)}>
              {l === "en" ? "English" : "Shona (draft)"}
            </Button>
          ))}
        </div>
        <p className="px-4 pb-4 text-xs text-muted-foreground">Shona translations are drafts awaiting native-speaker validation.</p>
      </Section>

      <Section title="Synthetic demo data">
        <div className="flex flex-col gap-2 p-4 sm:flex-row">
          <Button variant="outline" className="h-12" onClick={doExport}>Export synthetic records (JSON)</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="h-12">Clear demo data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all synthetic records?</AlertDialogTitle>
                <AlertDialogDescription>This permanently removes every demo record from this device. It cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      const n = await clearDemoData();
                      setMsg(`Deleted ${n} record(s).`);
                    } catch (e) {
                      setMsg(`Delete failed: ${(e as Error).message}`);
                    }
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {msg && <p role="status" className="px-4 pb-4 text-sm font-semibold">{msg}</p>}
      </Section>

      <p className="text-xs text-muted-foreground">
        Privacy: records are unencrypted in this browser. Anyone with access to this unlocked device and browser profile can read them. Avoid shared devices.
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
