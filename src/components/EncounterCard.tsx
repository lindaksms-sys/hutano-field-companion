import { Link } from "@tanstack/react-router";
import type { EncounterRecord } from "@/domain/types";
import { FIELD_LABELS, LANG_LABELS, REVIEW_LABELS, STATE_LABELS, SYNC_LABELS } from "@/lib/labels";
import { FIELD_KEYS } from "@/domain/types";
import { StatusPill } from "./StatusPill";
import { useI18n } from "@/lib/i18n";

export function EncounterCard({ r }: { r: EncounterRecord }) {
  const { tl } = useI18n();
  return (
    <div className="rounded-xl border border-border bg-card transition-colors hover:border-primary">
    <Link
      to="/encounters/$id"
      params={{ id: r.id }}
      className="block p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{r.fields.patientCode.value ?? tl("No patient code")}</span>
        <StatusPill tone={r.reviewStatus === "verified" ? "success" : r.reviewStatus === "draft" ? "neutral" : "pending"}>
          {tl(REVIEW_LABELS[r.reviewStatus])}
        </StatusPill>
        {r.isSynthetic && <StatusPill>{tl("Synthetic")}</StatusPill>}
        {r.ownerId === null && <StatusPill tone="pending">{tl("Unowned demo")}</StatusPill>}
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.rawNarrative || tl("(empty narrative)")}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {tl(LANG_LABELS[r.inputLanguage])} · {tl(SYNC_LABELS[r.syncStatus])} · updated{" "}
        {new Date(r.updatedAt).toLocaleString()}
      </p>
    </Link>
      <details className="border-t border-border px-4 py-2">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">{tl("Show fields")}</summary>
        <dl className="grid gap-2 pb-2 sm:grid-cols-2">
          {FIELD_KEYS.map((k) => (
            <div key={k} className="rounded-md bg-muted p-2">
              <dt className="text-xs font-semibold text-muted-foreground">{tl(FIELD_LABELS[k])} · {tl(STATE_LABELS[r.fields[k].state])}</dt>
              <dd className="mt-0.5 break-words text-sm">{r.fields[k].value ?? <span className="italic text-muted-foreground">{tl("Not recorded")}</span>}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
