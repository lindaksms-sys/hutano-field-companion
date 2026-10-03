import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FIXTURES } from "@/domain/fixtures";
import { demoAdapter, type AdapterChoice } from "@/domain/extraction";
import { AI_ADAPTER_ID, AI_ADAPTER_LABEL } from "@/domain/ai-extraction";
import { applyExtraction, createDraft, guardFor, recordExtractionFailure } from "@/domain/repository";
import { runOnDeviceExtraction } from "@/lib/ai-model";
import { useAiState } from "@/lib/use-ai";
import type { InputLanguage } from "@/domain/types";
import { LANG_LABELS } from "@/lib/labels";

export const Route = createFileRoute("/encounters/new")({
  head: () => ({
    meta: [
      { title: "New encounter — Hutano" },
      { name: "description", content: "Capture an encounter narrative in Shona, English or mixed." },
      { property: "og:title", content: "New encounter — Hutano" },
      { property: "og:description", content: "Capture an encounter narrative; saved locally first." },
    ],
  }),
  component: NewEncounter,
});

type Phase = "idle" | "saving" | "extracting" | "ai";

const CHOICES: { id: AdapterChoice; label: string; note: string }[] = [
  { id: "manual", label: "Manual", note: "Fill every field yourself." },
  { id: "demo", label: "Demo (not AI)", note: "Only exact synthetic examples and literal codes/dates." },
  { id: "ondevice", label: "On-device AI (experimental)", note: "Runs on this device. Suggests whole sentences for you to check. Shona not validated." },
];

function NewEncounter() {
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [lang, setLang] = useState<InputLanguage>("sn");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [choice, setChoice] = useState<AdapterChoice>("manual");
  const ai = useAiState();
  const cancelRef = useRef<(() => void) | null>(null);

  async function run() {
    setError(null);
    setPhase("saving");
    let rec;
    try {
      rec = await createDraft({ rawNarrative: text, inputLanguage: lang, isSynthetic: true });
      setSavedId(rec.id);
    } catch (e) {
      setPhase("idle");
      setError(`Not saved. Local storage write failed: ${(e as Error).message}`);
      return;
    }
    const id = rec.id;
    if (choice === "demo") return save2(id, true);
    if (choice === "manual") return save2(id, false);
    // On-device AI: draft is saved first; result applies only to this exact revision/account.
    setPhase("ai");
    const guard = guardFor(rec);
    const r = runOnDeviceExtraction(text);
    cancelRef.current = r.cancel;
    try {
      const res = await r.promise;
      await applyExtraction(id, res, guard);
    } catch (e) {
      const reason = (e as Error).message;
      setError(`Draft saved. On-device AI gave no suggestions: ${reason} Continue with manual review.`);
      await recordExtractionFailure(id, { adapterId: AI_ADAPTER_ID, adapterLabel: AI_ADAPTER_LABEL, isAI: true, failure: reason }, guard).catch(() => {});
    } finally {
      cancelRef.current = null;
    }
    setPhase("idle");
    void nav({ to: "/encounters/$id", params: { id } });
  }

  async function save2(id: string, extract: boolean) {
    if (extract) {
      setPhase("extracting");
      try {
        const res = await demoAdapter.extract(text, lang);
        await applyExtraction(id, res);
      } catch (e) {
        setError(`Draft saved, but extraction failed: ${(e as Error).message}`);
      }
    }
    setPhase("idle");
    void nav({ to: "/encounters/$id", params: { id } });
  }

  // Legacy path kept for reference by tests of the demo flow.
  async function save(extract: boolean) {
    setError(null);
    setPhase("saving");
    let id: string;
    try {
      const rec = await createDraft({ rawNarrative: text, inputLanguage: lang, isSynthetic: true });
      id = rec.id;
      setSavedId(id);
    } catch (e) {
      setPhase("idle");
      setError(`Not saved. Local storage write failed: ${(e as Error).message}`);
      return;
    }
    if (extract) {
      setPhase("extracting");
      try {
        const res = await demoAdapter.extract(text, lang);
        await applyExtraction(id, res);
      } catch (e) {
        // Draft is already saved; continue to manual review.
        setError(`Draft saved, but extraction failed: ${(e as Error).message}`);
      }
    }
    setPhase("idle");
    void nav({ to: "/encounters/$id", params: { id } });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">New encounter</h1>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">Narrative language</legend>
        <div className="grid grid-cols-3 gap-2">
          {(["sn", "en", "mixed"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`min-h-12 rounded-lg border text-sm font-bold ${lang === l ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"}`}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="narrative" className="text-sm font-bold">
          What happened during the visit?
        </label>
        <Textarea
          id="narrative"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="bg-card text-base"
          placeholder="Use synthetic data only. Do not enter real names or identifiers."
        />
        <p className="text-xs text-muted-foreground">Original text is kept exactly as typed.</p>
      </div>

      <div className="rounded-xl border border-dashed border-border p-4">
        <p className="text-sm font-bold">Synthetic examples (fictional, for demo)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FIXTURES.map((f) => (
            <Button
              key={f.id}
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                setText(f.narrative);
                setLang(f.language);
              }}
            >
              {f.title}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">Extraction</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {CHOICES.map((c) => {
            const disabled = c.id === "ondevice" && ai.kind !== "ready";
            return (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                onClick={() => setChoice(c.id)}
                aria-pressed={choice === c.id}
                className={`min-h-14 rounded-lg border p-3 text-left text-sm disabled:opacity-50 ${choice === c.id ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"}`}
              >
                <span className="block font-bold">{c.label}</span>
                <span className="block text-xs opacity-90">{c.note}</span>
              </button>
            );
          })}
        </div>
        {ai.kind !== "ready" && (
          <p className="text-xs text-muted-foreground">
            On-device AI is not installed on this device.{" "}
            <Link to="/settings" className="font-semibold text-primary underline">Install it in Settings</Link> (large download, explicit step).
          </p>
        )}
      </fieldset>

      <div className="space-y-2">
        <Button size="lg" className="h-14 w-full text-base" disabled={!text.trim() || phase !== "idle" || !!savedId} onClick={run}>
          {phase === "saving" ? "Saving draft…" : phase === "extracting" ? "Draft saved · demo extraction…" : phase === "ai" ? "Draft saved · on-device AI running…" : choice === "manual" ? "Save draft & fill in manually" : choice === "demo" ? "Save draft & run demo extraction" : "Save draft & run on-device AI"}
        </Button>
        {choice === "demo" && <p className="text-center text-xs font-semibold text-pending-foreground">{demoAdapter.label}.</p>}
        {phase === "ai" && (
          <div className="space-y-2 rounded-lg border border-pending-border bg-pending/40 p-3 text-sm">
            <p>Your draft is saved. The model is reading it on this device; this can take a minute or more. You can keep it running or stop it and fill in fields yourself.</p>
            <Button variant="outline" className="h-11 w-full" onClick={() => cancelRef.current?.()}>Stop AI and review manually</Button>
          </div>
        )}
      </div>
    </div>
  );
}
