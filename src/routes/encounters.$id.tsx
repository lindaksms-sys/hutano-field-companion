import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/StatusPill";
import { useAuth } from "@/lib/auth";
import { adoptRecord, getEncounter, saveFields, verificationBlockers, verify, missingFields } from "@/domain/repository";
import { FIELD_KEYS, type EncounterRecord, type FieldKey, type FieldValue } from "@/domain/types";
import { FIELD_LABELS, LANG_LABELS, REVIEW_LABELS, STATE_LABELS, SYNC_LABELS } from "@/lib/labels";

export const Route = createFileRoute("/encounters/$id")({
  head: () => ({
    meta: [
      { title: "Review encounter — Hutano" },
      { name: "description", content: "Review suggested fields against the source narrative and verify." },
      { property: "og:title", content: "Review encounter — Hutano" },
      { property: "og:description", content: "Human review and verification of an encounter record." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Review,
});

const LONG: FieldKey[] = ["concern", "observations", "followUp"];
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; msg: string };

function Review() {
  const { id } = Route.useParams();
  const [rec, setRec] = useState<EncounterRecord | null | undefined>(undefined);
  const [fields, setFields] = useState<Record<FieldKey, FieldValue> | null>(null);
  const [narrative, setNarrative] = useState("");
  const [dirty, setDirty] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [confirmed, setConfirmed] = useState(false);
  const [focus, setFocus] = useState<FieldKey | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const { user } = useAuth();

  const load = (r: EncounterRecord | undefined) => {
    setRec(r ?? null);
    if (r) {
      setFields(structuredClone(r.fields));
      setNarrative(r.rawNarrative);
      setDirty(false);
    }
  };
  useEffect(() => {
    getEncounter(id).then(load, (e) => setLoadErr((e as Error).message));
  }, [id, user?.id]);

  const blockers = useMemo(() => (fields ? verificationBlockers(fields) : null), [fields]);

  if (loadErr) return <p role="alert" className="font-semibold text-destructive">Could not read local storage: {loadErr}</p>;
  if (rec === undefined || (rec && !fields)) return <p className="text-muted-foreground">Loading…</p>;
  if (rec === null || !fields || !blockers)
    return (
      <div className="space-y-3">
        <p className="font-semibold">Record not found on this device.</p>
        <Link to="/encounters" className="font-semibold text-primary underline">Back to encounters</Link>
      </div>
    );

  const update = (k: FieldKey, patch: Partial<FieldValue>) => {
    setFields((f) => (f ? { ...f, [k]: { ...f[k], ...patch } } : f));
    setDirty(true);
    setConfirmed(false);
    setSave({ kind: "idle" });
  };

  async function persist(): Promise<EncounterRecord | null> {
    setSave({ kind: "saving" });
    try {
      const r = await saveFields(id, fields!, narrative);
      load(r);
      setSave({ kind: "saved", at: r.updatedAt });
      return r;
    } catch (e) {
      setSave({ kind: "error", msg: (e as Error).message });
      return null;
    }
  }

  async function doVerify() {
    if (dirty && !(await persist())) return;
    setSave({ kind: "saving" });
    try {
      const r = await verify(id, confirmed);
      load(r);
      setConfirmed(false);
      setSave({ kind: "saved", at: r.updatedAt });
    } catch (e) {
      setSave({ kind: "error", msg: `Not verified: ${(e as Error).message}` });
    }
  }

  const missing = missingFields(fields);
  const highlight = focus ? fields[focus].source : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">Review encounter</h1>
        <StatusPill tone={rec.reviewStatus === "verified" ? "success" : "pending"}>{REVIEW_LABELS[rec.reviewStatus]}</StatusPill>
        <StatusPill>{SYNC_LABELS[rec.syncStatus]}</StatusPill>
        <StatusPill>Rev {rec.localRevision}</StatusPill>
        {rec.ownerId === null && <StatusPill tone="pending">Unowned demo</StatusPill>}
      </div>
      {rec.ownerId === null && user && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-pending-border bg-pending/40 p-3 text-sm">
          <span className="mr-auto">Captured without an account. It will not sync unless you adopt it into {user.email}.</span>
          <Button variant="outline" className="h-10" onClick={async () => {
            try { load(await adoptRecord(rec.id, user.id)); } catch (e) { setSave({ kind: "error", msg: `Adopt failed: ${(e as Error).message}` }); }
          }}>Adopt into my account</Button>
        </div>
      )}
      {rec.reviewStatus === "verified" && (
        <p className="rounded-lg bg-success p-3 text-sm font-semibold text-success-foreground">
          Verified {new Date(rec.verifiedAt!).toLocaleString()}. Any edit will remove verification and require review again.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <aside className="space-y-3 lg:sticky lg:top-32 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Original narrative</h2>
              <span className="text-xs text-muted-foreground">{LANG_LABELS[rec.inputLanguage]}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">
              <Highlighted text={rec.rawNarrative} part={highlight} />
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-primary">Edit narrative</summary>
              <Textarea
                className="mt-2 bg-background"
                rows={6}
                value={narrative}
                onChange={(e) => {
                  setNarrative(e.target.value);
                  setDirty(true);
                  setConfirmed(false);
                }}
              />
            </details>
            <p className="mt-3 text-xs font-semibold text-pending-foreground">
              {!rec.extraction
                ? "No extraction run — manual entry."
                : rec.extraction.failure
                  ? `${rec.extraction.adapterLabel} · no suggestions (${rec.extraction.failure}) — fill fields manually`
                  : rec.extraction.isAI
                    ? `${rec.extraction.adapterLabel} · ${rec.extraction.modelId ?? ""} (${rec.extraction.backend ?? "?"}/${rec.extraction.dtype ?? "?"}) · ${Math.round((rec.extraction.durationMs ?? 0) / 1000)} s · whole-sentence suggestions, check each against the note${rec.extraction.rejectedFields?.length ? ` · ${rec.extraction.rejectedFields.length} invalid selection(s) discarded` : ""}`
                    : `${rec.extraction.adapterLabel}${rec.extraction.matchedFixtureId ? " · matched synthetic example" : " · no example matched; fill fields manually"}`}
            </p>
          </div>

          <div className="rounded-xl border border-pending-border bg-pending/40 p-4">
            <h2 className="font-bold">Missing documentation ({missing.length})</h2>
            <p className="text-xs text-muted-foreground">Documentation completeness only — not clinical advice. If information was not recorded, mark it as such.</p>
            {missing.length === 0 ? (
              <p className="mt-2 text-sm font-semibold">All fields filled or acknowledged.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {missing.map((k) => (
                  <li key={k}>
                    <a href={`#f-${k}`} className="text-sm font-semibold underline">{FIELD_LABELS[k]}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="space-y-3">
          {FIELD_KEYS.map((k) => (
            <FieldEditor key={k} k={k} f={fields[k]} onChange={(p) => update(k, p)} onFocus={() => setFocus(k)} />
          ))}
        </div>
      </div>

      <section className="sticky bottom-16 z-10 space-y-3 rounded-xl border border-border bg-card p-4 shadow-lg md:bottom-4">
        {save.kind === "error" && <p role="alert" className="text-sm font-bold text-destructive">{save.msg}</p>}
        {save.kind === "saved" && !dirty && <p className="text-sm font-semibold text-success-foreground">Saved on this device · {new Date(save.at).toLocaleTimeString()}</p>}
        {dirty && <p className="text-sm font-semibold text-pending-foreground">Unsaved changes</p>}
        {!blockers.ok && (
          <p className="text-xs text-muted-foreground">
            Before verifying: {blockers.pending.length > 0 && `${blockers.pending.length} suggestion(s) to accept or edit. `}
            {blockers.missing.length > 0 && `${blockers.missing.length} field(s) empty — fill or mark "not recorded". `}
            {blockers.noReason.length > 0 && `${blockers.noReason.length} "not recorded" without reason.`}
          </p>
        )}
        <label className="flex min-h-11 items-start gap-3 text-sm font-semibold">
          <Checkbox className="mt-0.5 h-6 w-6" checked={confirmed} disabled={!blockers.ok} onCheckedChange={(v) => setConfirmed(v === true)} />
          I reviewed every field against the original narrative and confirm this record is accurate.
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" size="lg" className="h-12" disabled={!dirty || save.kind === "saving"} onClick={persist}>
            {save.kind === "saving" ? "Saving…" : "Save changes"}
          </Button>
          <Button size="lg" className="h-12" disabled={!blockers.ok || !confirmed || save.kind === "saving"} onClick={doVerify}>
            Verify record
          </Button>
        </div>
      </section>
    </div>
  );
}

function Highlighted({ text, part }: { text: string; part: string | null }) {
  const i = part ? text.indexOf(part) : -1;
  if (!part || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="source-hl">{part}</mark>
      {text.slice(i + part.length)}
    </>
  );
}

function FieldEditor({ k, f, onChange, onFocus }: { k: FieldKey; f: FieldValue; onChange: (p: Partial<FieldValue>) => void; onFocus: () => void }) {
  const notRec = f.state === "not_recorded";
  const tone = f.state === "pending" ? "pending" : f.state === "accepted" || f.state === "edited" ? "success" : "neutral";
  const Comp = LONG.includes(k) ? Textarea : Input;
  return (
    <div id={`f-${k}`} onFocus={onFocus} className={`rounded-xl border bg-card p-4 ${f.state === "pending" ? "border-pending-border" : "border-border"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`in-${k}`} className="mr-auto font-bold">{FIELD_LABELS[k]}</label>
        <StatusPill tone={tone}>{STATE_LABELS[f.state]}</StatusPill>
      </div>
      {f.source && (
        <p className="mt-2 text-sm text-muted-foreground">
          Source: <q className="font-semibold text-foreground">{f.source}</q>
        </p>
      )}
      {!notRec && (
        <Comp
          id={`in-${k}`}
          className="mt-2 min-h-11 bg-background text-base"
          type={k === "encounterDate" ? "date" : undefined}
          value={f.value ?? ""}
          placeholder="Unknown — leave empty if not stated"
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const v = e.target.value;
            onChange({ value: v === "" ? null : v, state: v === "" ? (f.source ? "edited" : "empty") : "edited", origin: "worker" });
          }}
        />
      )}
      {notRec && (
        <Input
          className="mt-2 min-h-11 bg-background"
          placeholder="Reason (e.g. not stated by client)"
          value={f.notRecordedReason ?? ""}
          onChange={(e) => onChange({ notRecordedReason: e.target.value })}
        />
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {f.state === "pending" && (
          <Button size="sm" className="h-10" onClick={() => onChange({ state: "accepted" })}>Accept suggestion</Button>
        )}
        {!notRec ? (
          <Button size="sm" variant="outline" className="h-10" onClick={() => onChange({ state: "not_recorded", value: null, notRecordedReason: f.notRecordedReason ?? "" })}>
            Mark not recorded
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-10" onClick={() => onChange({ state: "empty", notRecordedReason: null })}>
            Enter a value instead
          </Button>
        )}
      </div>
    </div>
  );
}
