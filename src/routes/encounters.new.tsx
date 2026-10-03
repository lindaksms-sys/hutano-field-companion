import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FIXTURES } from "@/domain/fixtures";
import { activeAdapter } from "@/domain/extraction";
import { applyExtraction, createDraft } from "@/domain/repository";
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

type Phase = "idle" | "saving" | "extracting";

function NewEncounter() {
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [lang, setLang] = useState<InputLanguage>("sn");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

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
        const res = await activeAdapter.extract(text, lang);
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

      <div className="space-y-2">
        <Button size="lg" className="h-14 w-full text-base" disabled={!text.trim() || phase !== "idle" || !!savedId} onClick={() => save(true)}>
          {phase === "saving" ? "Saving draft…" : phase === "extracting" ? "Draft saved · extracting…" : "Save draft & run demo extraction"}
        </Button>
        <p className="text-center text-xs font-semibold text-pending-foreground">
          {activeAdapter.label}. Only exact synthetic examples and literal codes/dates are recognised.
        </p>
        <Button size="lg" variant="outline" className="h-12 w-full" disabled={!text.trim() || phase !== "idle" || !!savedId} onClick={() => save(false)}>
          Save draft & fill in manually
        </Button>
      </div>
    </div>
  );
}
