import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { adoptRecord } from "@/domain/repository";
import { lastSuccessfulSync, pendingOutbox, type DrainOutcome } from "@/domain/sync";
import { useAuth } from "@/lib/auth";
import { useEncounters, useOnline } from "@/lib/hooks";
import { supabaseConfig } from "@/lib/supabase";
import { lastOutcome, onSyncChange, runSyncNow } from "@/lib/sync-runner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/sync")({
  head: () => ({
    meta: [
      { title: "Sync — Hutano" },
      { name: "description", content: "Upload verified synthetic snapshots to the Hutano backend." },
      { property: "og:title", content: "Sync — Hutano" },
      { property: "og:description", content: "Store-and-forward upload of verified synthetic records." },
    ],
  }),
  component: SyncPage,
});

function describe(o: DrainOutcome | null, tl: (en: string) => string, tf: (en: string, vars?: Record<string, string | number>) => string): string {
  if (!o) return "";
  switch (o.status) {
    case "busy": return tl("A sync is already running.");
    case "not_signed_in": return tl("Sign in to sync. Nothing was sent.");
    case "offline": return tf("Offline — {sent} sent, {remaining} kept in queue.", { sent: o.sent, remaining: o.remaining });
    case "auth_paused": return tf("Paused: sign-in required ({errorMessage}). {remaining} kept in queue; retries after sign-in.", { errorMessage: o.message, remaining: o.remaining });
    case "account_changed": return "Account changed during sync; stopped without touching the new account's records.";
    case "done": {
      const rejectedPart = o.rejected ? tf(", {rejected} rejected", { rejected: o.rejected }) : "";
      const lastErrorPart = o.lastError ? tf(" — last error: {errorMessage}", { errorMessage: o.lastError }) : "";
      return tf("Server acknowledged {sent}. {remaining} still queued", { sent: o.sent, remaining: o.remaining }) + rejectedPart + lastErrorPart + ".";
    }
  }
}

function SyncPage() {
  const { tl, tf } = useI18n();
  const online = useOnline();
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const { records, reload } = useEncounters();
  const [queued, setQueued] = useState<number | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<DrainOutcome | null>(lastOutcome());
  const [msg, setMsg] = useState<string | null>(null);
  const cfg = supabaseConfig();

  useEffect(() => {
    pendingOutbox(uid).then((o) => setQueued(o.length), () => setQueued(null));
    lastSuccessfulSync(uid).then(setLast, () => setLast(null));
  }, [records, uid]);
  useEffect(() => onSyncChange((o) => { setRunning(o === null); if (o) setOutcome(o); }), []);

  const unowned = records?.filter((r) => r.ownerId === null) ?? [];
  const unownedVerified = unowned.filter((r) => r.reviewStatus === "verified");
  const notVerified = records?.filter((r) => r.reviewStatus !== "verified").length ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{tl("Sync")}</h1>
      <dl className="divide-y divide-border rounded-xl border border-border bg-card">
        <Row k={tl("Backend")} v={<StatusPill tone={cfg.configured ? "success" : "pending"}>{cfg.configured ? tl("Configured") : tl("Not configured")}</StatusPill>} />
        <Row k={tl("Account")} v={user ? <StatusPill tone="success">Signed in · {user.email}</StatusPill> : <StatusPill tone="pending">{tl("Not signed in")}</StatusPill>} />
        <Row k={tl("Device connectivity")} v={online ? tl("Online") : tl("Offline")} />
        <Row k={tl("Verified snapshots queued (this account)")} v={uid ? queued ?? "–" : "—"} />
        <Row k={tl("Drafts / in review (never uploaded)")} v={notVerified} />
        <Row k={tl("Last server acknowledgement")} v={last ? new Date(last).toLocaleString() : tl("Never")} />
      </dl>

      {!user ? (
        <Button asChild size="lg" className="h-12 w-full"><Link to="/auth">{tl("Sign in to sync")}</Link></Button>
      ) : (
        <Button size="lg" className="h-12 w-full" disabled={running || !online} onClick={() => void runSyncNow()}>
          {running ? tl("Syncing…") : online ? tl("Sync now") : tl("Offline — queue kept")}
        </Button>
      )}
      {outcome && <p role="status" className="text-sm font-semibold">{describe(outcome, tl, tf)}</p>}

      {unowned.length > 0 && (
        <section className="rounded-xl border border-pending-border bg-pending/40 p-4">
          <h2 className="font-bold">Unowned demo records on this device ({unowned.length})</h2>
          <p className="text-xs text-muted-foreground">These were captured without an account. They never sync unless you explicitly adopt them into the signed-in account. {unownedVerified.length} verified.</p>
          {user && (
            <ul className="mt-3 space-y-2">
              {unowned.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-card p-3 text-sm">
                  <span className="truncate font-semibold">{r.fields.patientCode.value ?? tl("No patient code")} · {r.reviewStatus}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10"
                    onClick={async () => {
                      try { await adoptRecord(r.id, user.id); setMsg(tl("Adopted into your account.")); await reload(); }
                      catch (e) { setMsg(tf("Adopt failed: {errorMessage}", { errorMessage: (e as Error).message })); }
                    }}
                  >
                    {tl("Adopt")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {msg && <p className="mt-2 text-sm font-semibold">{msg}</p>}
        </section>
      )}

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Sync runs only while the app is open: when you press Sync now, when the device comes back online, or after sign-in. There is no background sync.</p>
        <p>Each verified revision is uploaded once as an immutable snapshot. Revisions from other devices are kept on the server; full two-way conflict resolution is not implemented and server records are not downloaded to this device yet.</p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}
