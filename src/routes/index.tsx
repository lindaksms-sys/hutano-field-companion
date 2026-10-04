import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EncounterCard } from "@/components/EncounterCard";
import { useEncounters } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { InstallApp } from "@/components/InstallApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hutano — Field companion for Village Health Workers" },
      { name: "description", content: "Offline-first encounter documentation with human review. Prototype, synthetic data only." },
      { property: "og:title", content: "Hutano — VHW field companion" },
      { property: "og:description", content: "Capture Shona/English encounter notes, review, and verify locally." },
      { property: "og:image", content: "https://hutano.creativehauz.space/og-image.jpg" },
      { name: "twitter:image", content: "https://hutano.creativehauz.space/og-image.jpg" },
    ],
  }),
  component: Home,
});

import { StorageErrorPanel } from "@/components/StorageErrorPanel";
import { resetDBConnection } from "@/domain/db";

function Home() {
  const { t, tl } = useI18n();
  const { records, error, reload } = useEncounters();
  const count = (s: string) => records?.filter((r) => r.reviewStatus === s).length ?? 0;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-primary p-6 text-primary-foreground">
        <h1 className="text-2xl font-bold">{tl("Hello. Record an encounter.")}</h1>
        <p className="mt-1 max-w-prose text-sm opacity-90">
          {tl("Type the visit in Shona, English or both. It is saved on this device first. You review and verify every field — Hutano makes no clinical decisions.")}
        </p>
        <Button asChild size="lg" variant="secondary" className="mt-4 h-12 text-base">
          <Link to="/encounters/new">{t("newEncounter")}</Link>
        </Button>
      </section>
      <InstallApp />
      {error && (
        <StorageErrorPanel error={error} onRetry={async () => { resetDBConnection(); await reload(); }} />
      )}
      <section className="grid grid-cols-3 gap-3">
        {[
          [tl("Drafts"), count("draft")],
          [tl("Need review"), count("in_review")],
          [tl("Verified"), count("verified")],
        ].map(([l, n]) => (
          <div key={l} className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xl font-bold">{records ? n : "–"}</div>
            <div className="text-xs font-semibold text-muted-foreground">{l}</div>
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{tl("Recent")}</h2>
        {records?.length === 0 && <p className="text-sm text-muted-foreground">{tl("No encounters on this device yet.")}</p>}
        {records?.slice(0, 3).map((r) => <EncounterCard key={r.id} r={r} />)}
      </section>
    </div>
  );
}
