import { Link } from "@tanstack/react-router";
import type { EncounterRecord } from "@/domain/types";
import { LANG_LABELS, REVIEW_LABELS, SYNC_LABELS } from "@/lib/labels";
import { StatusPill } from "./StatusPill";

export function EncounterCard({ r }: { r: EncounterRecord }) {
  return (
    <Link
      to="/encounters/$id"
      params={{ id: r.id }}
      className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{r.fields.patientCode.value ?? "No patient code"}</span>
        <StatusPill tone={r.reviewStatus === "verified" ? "success" : r.reviewStatus === "draft" ? "neutral" : "pending"}>
          {REVIEW_LABELS[r.reviewStatus]}
        </StatusPill>
        {r.isSynthetic && <StatusPill>Synthetic</StatusPill>}
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.rawNarrative || "(empty narrative)"}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {LANG_LABELS[r.inputLanguage]} · {SYNC_LABELS[r.syncStatus]} · updated{" "}
        {new Date(r.updatedAt).toLocaleString()}
      </p>
    </Link>
  );
}
