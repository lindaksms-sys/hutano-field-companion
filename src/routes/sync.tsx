import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { backendConfig, getOutbox, lastSuccessfulSync, runSync, transport } from "@/domain/sync";
import { useEncounters, useOnline } from "@/lib/hooks";

export const Route = createFileRoute("/sync")({
  head: () => ({
    meta: [
      { title: "Sync — Hutano" },
      { name: "description", content: "Sync status for verified encounter records." },
      { property: "og:title", content: "Sync — Hutano" },
      { property: "og:description", content: "Truthful local-only sync status and outbox." },
    ],
  }),
  component: SyncPage,
});

function SyncPage() {
  const online = useOnline();
  const { records } = useEncounters();
  const [queued, setQueued] = useState<number | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const cfg = backendConfig();
  useEffect(() => {
    getOutbox().then((o) => setQueued(o.length), () => setQueued(null));
    lastSuccessfulSync().then(setLast, () => setLast(null));
  }, [records]);
  const drafts = records?.filter((r) => r.reviewStatus !== "verified").length ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Sync</h1>
      <div className="rounded-xl border border-pending-border bg-pending/50 p-4">
        <StatusPill tone="pending">Local only — backend not configured</StatusPill>
        <p className="mt-2 text-sm">
          Records are stored only in this browser on this device. No server connection exists in this prototype, so nothing has been uploaded.
        </p>
      </div>
      <dl className="divide-y divide-border rounded-xl border border-border bg-card">
        <Row k="Verified records queued" v={queued ?? "–"} />
        <Row k="Drafts / in review (never sync)" v={drafts} />
        <Row k="Device connectivity" v={online ? "Online" : "Offline"} />
        <Row k="Backend" v={cfg.configured ? "Environment variables present, transport not implemented" : "Not configured"} />
        <Row k="Last successful sync" v={last ? new Date(last).toLocaleString() : "Never — no server acknowledgement"} />
      </dl>
      <Button
        size="lg"
        variant="outline"
        className="h-12 w-full"
        onClick={async () => setMsg((await runSync()).ok ? "Synced" : "Sync unavailable: backend not configured. Nothing was sent.")}
      >
        Try sync
      </Button>
      {msg && <p role="status" className="text-sm font-semibold">{msg}</p>}
      <p className="text-xs text-muted-foreground">
        Transport configured: {String(transport.configured)}. Future sync will push the verified outbox and check server revisions before overwriting.
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex justify-between gap-4 p-4 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}
