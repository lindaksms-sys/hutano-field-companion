import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EncounterCard } from "@/components/EncounterCard";
import { useEncounters } from "@/lib/hooks";
import type { ReviewStatus } from "@/domain/types";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/encounters/")({
  head: () => ({
    meta: [
      { title: "Encounters — Hutano" },
      { name: "description", content: "Encounter records stored on this device." },
      { property: "og:title", content: "Encounters — Hutano" },
      { property: "og:description", content: "Drafts, records needing review and verified records." },
    ],
  }),
  component: EncountersPage,
});

const FILTERS: (ReviewStatus | "all")[] = ["all", "draft", "in_review", "verified"];
const NAMES = { all: "All", draft: "Drafts", in_review: "Needs review", verified: "Verified" };


function EncountersPage() {
  const { tl, tf } = useI18n();
  const { records, error } = useEncounters();
  const [f, setF] = useState<(typeof FILTERS)[number]>("all");
  const shown = records?.filter((r) => f === "all" || r.reviewStatus === f) ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{tl("Encounters")}</h1>
        <Button asChild size="lg" className="h-12">
          <Link to="/encounters/new">{tl("New")}</Link>
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((x) => (
          <button
            key={x}
            onClick={() => setF(x)}
            aria-pressed={f === x}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${f === x ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}
          >
            {tl(NAMES[x])}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="font-semibold text-destructive">{tf("Storage error: {error}", { error })}</p>}
      {records && shown.length === 0 && <p className="text-sm text-muted-foreground">{tl("Nothing here.")}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((r) => <EncounterCard key={r.id} r={r} />)}
      </div>
    </div>
  );
}
