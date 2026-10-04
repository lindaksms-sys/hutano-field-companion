import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusPill } from "@/components/StatusPill";
import { useAuth } from "@/lib/auth";
import { EncounterHistory } from "@/components/EncounterHistory";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { adoptRecord, deleteEncounter, getEncounter, saveFields, verificationBlockers, verify, missingFields } from "@/domain/repository";
import { FIELD_KEYS, type EncounterRecord, type FieldKey, type FieldValue } from "@/domain/types";
import { useI18n } from "@/lib/i18n";
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
  const { tl, tf } = useI18n();
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
  const [editing, setEditing] = useState(false);
  const [delReason, setDelReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const load = (r: EncounterRecord | undefined) => {
    setRec(r ?? null);
    if (r) {
      if (r.reviewStatus === "verified") setEditing(false);
      setFields(structuredClone(r.fields));
      setNarrative(r.rawNarrative);
      setDirty(false);
    }
  };
  useEffect(() => {
    getEncounter(id).then(load, (e) => setLoadErr((e as Error).message));
  }, [id, user?.id]);

  const blockers = useMemo(() => (fields ? verificationBlockers(fields) : null), [fields]);

  if (loadErr) return <p role="alert" className="font-semibold text-destructive">{tf("Could not read local storage: {errorMessage}", { errorMessage: loadErr })}</p>;
  if (rec === undefined || (rec && !fields)) return <p className="text-muted-foreground">{tl("Loading…")}</p>;
  if (rec === null || !fields || !blockers)
    return (
      <div className="space-y-3">
        <p className="font-semibold">{tl("Record not found on this device.")}</p>
        <Link to="/encounters" className="font-semibold text-primary underline">{tl("Back to encounters")}</Link>
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
      setSave({ kind: "error", msg: tf("Not verified: {errorMessage}", { errorMessage: (e as Error).message }) });
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await deleteEncounter(id, delReason);
      navigate({ to: "/encounters" });
    } catch (e) {
      setDeleting(false);
      setSave({ kind: "error", msg: tf("Delete failed: {errorMessage}", { errorMessage: (e as Error).message }) });
    }
  }

  const locked = rec.reviewStatus === "verified" && !editing;
  const missing = missingFields(fields);
  const highlight = focus ? fields[focus].source : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">{tl("Review encounter")}</h1>
        <StatusPill tone={rec.reviewStatus === "verified" ? "success" : "pending"}>{tl(REVIEW_LABELS[rec.reviewStatus])}</StatusPill>
        <StatusPill>{tl(SYNC_LABELS[rec.syncStatus])}</StatusPill>
        <StatusPill>{tf("Rev {revision}", { revision: rec.localRevision })}</StatusPill>
        {rec.ownerId === null && <StatusPill tone="pending">{tl("Unowned demo")}</StatusPill>}
      </div>
      {rec.ownerId === null && user && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-pending-border bg-pending/40 p-3 text-sm">
          <span className="mr-auto">{tf("Captured without an account. It will not sync unless you adopt it into {email}.", { email: user.email ?? "" })}</span>
          <Button variant="outline" className="h-10" onClick={async () => {
            try { load(await adoptRecord(rec.id, user.id)); } catch (e) { setSave({ kind: "error", msg: tf("Adopt failed: {errorMessage}", { errorMessage: (e as Error).message }) }); }
          }}>{tl("Adopt into my account")}</Button>
        </div>
      )}
      {rec.reviewStatus === "verified" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-success p-3 text-sm font-semibold text-success-foreground">
          <span className="mr-auto">{tf("Verified {date}. Any edit will remove verification and require review again.", { date: new Date(rec.verifiedAt!).toLocaleString() })}</span>
          {!editing && <Button variant="outline" className="h-11 bg-card text-foreground" onClick={() => setEditing(true)}>{tl("Edit record")}</Button>}
          {editing && !dirty && <Button variant="outline" className="h-11 bg-card text-foreground" onClick={() => setEditing(false)}>{tl("Stop editing")}</Button>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <aside className="space-y-3 lg:sticky lg:top-32 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{tl("Original narrative")}</h2>
              <span className="text-xs text-muted-foreground">{tl(LANG_LABELS[rec.inputLanguage])}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">
              <Highlighted text={rec.rawNarrative} part={highlight} />
            </p>
            {!locked && <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-primary">{tl("Edit narrative")}</summary>
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
            </details>}
            <p className="mt-3 text-xs font-semibold text-pending-foreground">
              {!rec.extraction
                ? tl("No extraction run — manual entry.")
                : rec.extraction.failure
                  ? tf("{adapterLabel} · no suggestions ({failureReason}) — fill fields manually", { adapterLabel: rec.extraction.adapterLabel, failureReason: rec.extraction.failure })
                  : rec.extraction.isAI
                    ? tf("{adapterLabel} · {modelId} ({backend}/{dtype}) · {seconds} s · rules: {ruleCount} field(s), AI: {aiCount} field(s) · check each against the note", {
                        adapterLabel: rec.extraction.adapterLabel,
                        modelId: rec.extraction.modelId ?? "",
                        backend: rec.extraction.backend ?? "?",
                        dtype: rec.extraction.dtype ?? "?",
                        seconds: Math.round((rec.extraction.durationMs ?? 0) / 1000),
                        ruleCount: rec.extraction.ruleFields?.length ?? 0,
                        aiCount: rec.extraction.modelFields?.length ?? 0,
                      }) + (rec.extraction.warning ? tf(" · {warning}", { warning: rec.extraction.warning }) : "") + (rec.extraction.rejectedFields?.length ? tf(" · {count} invalid selection(s) discarded", { count: rec.extraction.rejectedFields.length }) : "")
                    : `${rec.extraction.adapterLabel}${rec.extraction.matchedFixtureId ? tl("· matched synthetic example") : tl("no example matched; fill fields manually")}`}
            </p>
          </div>

          <div className="rounded-xl border border-pending-border bg-pending/40 p-4">
            <h2 className="font-bold">{tf("Missing documentation ({count})", { count: missing.length })}</h2>
            <p className="text-xs text-muted-foreground">{tl("Documentation completeness only — not clinical advice. If information was not recorded, mark it as such.")}</p>
            {missing.length === 0 ? (
              <p className="mt-2 text-sm font-semibold">{tl("All fields filled or acknowledged.")}</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {missing.map((k) => (
                  <li key={k}>
                    <a href={`#f-${k}`} className="text-sm font-semibold underline">{tl(FIELD_LABELS[k])}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="space-y-3">
          {FIELD_KEYS.map((k) => (
            <FieldEditor key={k} k={k} f={fields[k]} locked={locked} onChange={(p) => update(k, p)} onFocus={() => setFocus(k)} />
          ))}
        </div>
      </div>

      {!locked && <section className="z-10 space-y-3 md:sticky md:bottom-4 rounded-xl border border-border bg-card p-4 shadow-lg">
        {save.kind === "error" && <p role="alert" className="text-sm font-bold text-destructive">{save.msg}</p>}
        {save.kind === "saved" && !dirty && <p className="text-sm font-semibold text-success-foreground">{tf("Saved on this device · {time}", { time: new Date(save.at).toLocaleTimeString() })}</p>}
        {dirty && <p className="text-sm font-semibold text-pending-foreground">{tl("Unsaved changes")}</p>}
        {!blockers.ok && (
          <p className="text-xs text-muted-foreground">
            {tl("Before verifying:")} {blockers.pending.length > 0 && tf("{count} suggestion(s) to accept or edit. ", { count: blockers.pending.length })}
            {blockers.missing.length > 0 && tf('{count} field(s) empty — fill or mark "not recorded". ', { count: blockers.missing.length })}
            {blockers.noReason.length > 0 && tf('{count} "not recorded" without reason.', { count: blockers.noReason.length })}
          </p>
        )}
        <label className="flex min-h-11 items-start gap-3 text-sm font-semibold">
          <Checkbox className="mt-0.5 h-6 w-6" checked={confirmed} disabled={!blockers.ok} onCheckedChange={(v) => setConfirmed(v === true)} />
          {tl("I reviewed every field against the original narrative and confirm this record is accurate.")}
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" size="lg" className="h-12" disabled={!dirty || save.kind === "saving"} onClick={persist}>
            {save.kind === "saving" ? tl("Saving…") : tl("Save changes")}
          </Button>
          <Button size="lg" className="h-12" disabled={!blockers.ok || !confirmed || save.kind === "saving"} onClick={doVerify}>
            {tl("Verify record")}
          </Button>
        </div>
      </section>}

      <div className="grid gap-3 lg:grid-cols-2">
      <EncounterHistory encounterId={rec.id} refreshKey={`${rec.localRevision}-${rec.updatedAt}-${rec.syncStatus}`} />
      <div className="rounded-xl border border-destructive/40 bg-card p-4">
        <h2 className="font-bold">{tl("Delete encounter")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {rec.serverRevision !== null
            ? tl("Removes it from this device. Copies already uploaded stay on the server (uploads are never changed or deleted).")
            : tl("Removes it from this device. It has not been uploaded.")}{" "}
          {tl("The deletion is kept in the device history.")}
        </p>
        <AlertDialog onOpenChange={(o) => { if (!o) setDelReason(""); }}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-3 h-12 w-full sm:w-auto">{tl("Delete encounter")}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tl("Delete this encounter?")}</AlertDialogTitle>
              <AlertDialogDescription>{tl("This cannot be undone on this device. Export first if you need a copy.")}</AlertDialogDescription>
            </AlertDialogHeader>
            <Input className="min-h-11" placeholder={tl("Reason (optional, e.g. duplicate entry)")} value={delReason} maxLength={200} onChange={(e) => setDelReason(e.target.value)} />
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">{tl("Cancel")}</AlertDialogCancel>
              <AlertDialogAction className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting} onClick={(e) => { e.preventDefault(); void doDelete(); }}>
                {tl("Delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      </div>
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

function FieldEditor({ k, f, locked, onChange, onFocus }: { k: FieldKey; f: FieldValue; locked: boolean; onChange: (p: Partial<FieldValue>) => void; onFocus: () => void }) {
  const { tl } = useI18n();
  const notRec = f.state === "not_recorded";
  const tone = f.state === "pending" ? "pending" : f.state === "accepted" || f.state === "edited" ? "success" : "neutral";
  const Comp = LONG.includes(k) ? Textarea : Input;
  return (
    <div id={`f-${k}`} onFocus={onFocus} className={`rounded-xl border bg-card p-4 ${f.state === "pending" ? "border-pending-border" : "border-border"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`in-${k}`} className="mr-auto font-bold">{tl(FIELD_LABELS[k])}</label>
        <StatusPill tone={tone}>{tl(STATE_LABELS[f.state])}</StatusPill>
      </div>
      {f.source && (
        <p className="mt-2 text-sm text-muted-foreground">
          {tl("Source")}{f.state === "pending" && f.suggestedBy ? ` (${f.suggestedBy === "rule" ? tl("rule, not AI") : f.suggestedBy === "model" ? tl("on-device AI") : tl("demo example")})` : ""}: <q className="font-semibold text-foreground">{f.source}</q>
        </p>
      )}
      {!notRec && (
        <Comp
          id={`in-${k}`}
          className="mt-2 min-h-11 bg-background text-base"
          type={k === "encounterDate" ? "date" : undefined}
          readOnly={locked}
          value={f.value ?? ""}
          placeholder={tl("Unknown — leave empty if not stated")}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const v = e.target.value;
            onChange({ value: v === "" ? null : v, state: v === "" ? (f.source ? "edited" : "empty") : "edited", origin: "worker" });
          }}
        />
      )}
      {notRec && (
        <Input
          className="mt-2 min-h-11 bg-background"
          placeholder={tl("Reason (e.g. not stated by client)")}
          value={f.notRecordedReason ?? ""}
          readOnly={locked}
          onChange={(e) => onChange({ notRecordedReason: e.target.value })}
        />
      )}
      {!locked && <div className="mt-3 flex flex-wrap gap-2">
        {f.state === "pending" && (
          <Button size="sm" className="h-10" onClick={() => onChange({ state: "accepted" })}>{tl("Accept suggestion")}</Button>
        )}
        {!notRec ? (
          <Button size="sm" variant="outline" className="h-10" onClick={() => onChange({ state: "not_recorded", value: null, notRecordedReason: f.notRecordedReason ?? "" })}>
            {tl("Mark not recorded")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-10" onClick={() => onChange({ state: "empty", notRecordedReason: null })}>
            {tl("Enter a value instead")}
          </Button>
        )}
      </div>}
    </div>
  );
}
