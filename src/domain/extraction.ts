import { FIXTURES, normalize } from "./fixtures";
import type { FieldKey, InputLanguage } from "./types";

export interface Suggestion {
  value: string;
  /** Exact substring of the narrative. */
  source: string;
}

export interface ExtractionResult {
  adapterId: string;
  adapterLabel: string;
  isAI: boolean;
  matchedFixtureId: string | null;
  suggestions: Partial<Record<FieldKey, Suggestion>>;
  ai?: { modelId: string; modelRevision: string; backend: string; dtype: string; durationMs: number; rejectedFields?: FieldKey[] };
}

export type AdapterChoice = "manual" | "demo" | "ondevice";

/** Swappable async extraction boundary. */
export interface ExtractionAdapter {
  id: string;
  label: string;
  isAI: boolean;
  configured: boolean;
  extract(narrative: string, language: InputLanguage): Promise<ExtractionResult>;
}

/**
 * Deterministic demo adapter — NOT AI.
 * 1. Exact synthetic fixture match → returns the fixture's exact source mappings.
 * 2. Otherwise only literal patterns: SYN-#### codes and ISO dates (YYYY-MM-DD).
 * Everything else stays null. No translation, no inference.
 */
export const demoAdapter: ExtractionAdapter = {
  id: "demo-deterministic-v1",
  label: "Demo extraction — not AI",
  isAI: false,
  configured: true,
  async extract(narrative) {
    const n = normalize(narrative);
    const fixture = FIXTURES.find((f) => normalize(f.narrative) === n);
    const suggestions: ExtractionResult["suggestions"] = {};
    if (fixture) {
      for (const [k, v] of Object.entries(fixture.mappings)) {
        if (v && narrative.includes(v)) suggestions[k as FieldKey] = { value: v, source: v };
      }
    } else {
      const code = narrative.match(/\bSYN-\d{3,6}\b/);
      if (code) suggestions.patientCode = { value: code[0], source: code[0] };
      const date = narrative.match(/\b\d{4}-\d{2}-\d{2}\b/);
      if (date) suggestions.encounterDate = { value: date[0], source: date[0] };
    }
    return {
      adapterId: this.id,
      adapterLabel: this.label,
      isAI: false,
      matchedFixtureId: fixture?.id ?? null,
      suggestions,
    };
  },
};

/** Placeholder boundary for a future AI adapter. Makes no network calls, holds no keys. */
export const aiAdapter: ExtractionAdapter = {
  id: "ai-unconfigured",
  label: "AI extraction (not configured)",
  isAI: true,
  configured: false,
  async extract() {
    throw new Error("AI extraction is not configured in this prototype.");
  },
};

export const activeAdapter: ExtractionAdapter = demoAdapter;
