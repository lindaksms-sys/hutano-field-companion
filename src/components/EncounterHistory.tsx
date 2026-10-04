import { useEffect, useState } from "react";
import { listAudit } from "@/domain/repository";
import type { AuditAction, AuditEntry, FieldKey } from "@/domain/types";
import { FIELD_LABELS } from "@/lib/labels";
import { useI18n } from "@/lib/i18n";

const ACTION_LABELS: Record<AuditAction, string> = {
  created: "Draft created",
  edited: "Edited",
  extraction: "Suggestions added",
  extraction_failed: "Extraction failed",
  verified: "Verified",
  adopted: "Adopted into account",
  synced: "Uploaded (server confirmed)",
  deleted: "Deleted from this device",
  cleared: "Cleared with demo data",
};

/** Local audit trail for one record. Shows actions and field names only — never note text. */
export function EncounterHistory({ encounterId, refreshKey }: { encounterId: string; refreshKey: string }) {
  const { tl, tf } = useI18n();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listAudit(encounterId).then(setRows, (e) => setErr((e as Error).message));
  }, [encounterId, refreshKey]);

  return (
    <details className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-bold">{tf("History ({count})", { count: rows?.length ?? 0 })}</summary>
      <p className="mt-1 text-xs text-muted-foreground">{tl("Audit log kept on this device. Records actions and field names only, not note text.")}</p>
      {err && <p role="alert" className="mt-2 text-sm text-destructive">{err}</p>}
      {rows && rows.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{tl("No history recorded yet (records made before history was added).")}</p>}
      <ol className="mt-3 space-y-2">
        {rows?.map((a) => (
          <li key={a.id} className="border-l-2 border-primary pl-3 text-sm">
            <span className="font-semibold">{tl(ACTION_LABELS[a.action])}</span>
            {a.toRevision !== null && a.fromRevision !== a.toRevision && <span className="text-muted-foreground"> · {tf("Rev {revision}", { revision: a.toRevision })}</span>}
            <span className="block text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</span>
            {a.changed.length > 0 && (
              <span className="block text-xs">
                {tl("Changed:")} {a.changed.map((k) => (k === "narrative" ? tl("Original narrative") : tl(FIELD_LABELS[k as FieldKey] ?? k))).join(", ")}
              </span>
            )}
            {a.verificationRemoved && <span className="block text-xs font-semibold text-pending-foreground">{tl("Verification removed — needs review again")}</span>}
            {a.reason && <span className="block text-xs">{tf("Reason: {reason}", { reason: a.reason })}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}
