import { describe, expect, it } from "vitest";
import { buildMessages, checkNarrativeSelections, combineHybrid, segmentNarrative } from "@/domain/ai-extraction";
import { runRules } from "@/domain/rules";
import { checkSmokeOutput } from "@/lib/ai-config";
import dev from "../../eval/cases.dev.json";
import held from "../../eval/cases.heldout.json";

const rules = (n: string) => runRules(segmentNarrative(n), n);
const meta = { modelId: "m", modelRevision: "r", backend: "wasm", dtype: "q8", durationMs: 1 };

describe("segmentation keeps decimals, dotted dates and abbreviations", () => {
  it("does not split 37.5 or 25.03.2026 or Dr.", () => {
    const n = "Temp 37.5 C. Seen 25.03.2026 by Dr. moyo. No fever.";
    const t = segmentNarrative(n).map((s) => s.text);
    expect(t).toEqual(["Temp 37.5 C.", "Seen 25.03.2026 by Dr. moyo.", "No fever."]);
  });
});

describe("rules (regressions for real model failures)", () => {
  it("location is never a date (previous model picked the date sentence)", () => {
    const r = rules("SYN-0001. Date 2026-03-02. Village: Chikore.");
    expect(r.location).toMatchObject({ value: "Chikore", by: "rule" });
    expect(r.encounterDate!.value).toBe("2026-03-02");
    expect(rules("Seen on 3 March 2026.").location).toBeUndefined();
  });
  it("age with units, distinct from duration", () => {
    const r = rules("Child 4 years old. Cough for 3 days.");
    expect(r.age!.value).toBe("4 years old");
    expect(r.duration!.value).toBe("for 3 days");
  });
  it("another person's age is not the patient's; conflicting ages abstain", () => {
    expect(rules("Grandmother, 70 years old, brought the child.").age).toBeUndefined();
    expect(rules("Child is 3 years old. Card says 4 years old.").age).toBeUndefined();
  });
  it("ambiguous numeric dates and return dates are not encounter dates; no 'today' invented", () => {
    expect(rules("Date 03/04/2026.").encounterDate).toBeUndefined();
    expect(rules("Seen 2026-05-06. Return 2026-05-13.").encounterDate!.value).toBe("2026-05-06");
    expect(rules("Seen today.").encounterDate).toBeUndefined();
  });
  it("conflicting durations abstain", () => {
    expect(rules("Cough for 3 days, later said for 5 days.").duration).toBeUndefined();
  });
  it("draft Shona cues keep original words", () => {
    const r = rules("Mwana SYN-0042 ane makore 4. Anogara Mutasa. Amai vanoti ane chikosoro kwemazuva matatu.");
    expect(r.age!.value).toBe("makore 4");
    expect(r.location!.value).toBe("Mutasa");
    expect(r.duration!.value).toBe("kwemazuva matatu");
  });
  it("every rule value is an exact substring of its whole-sentence source", () => {
    for (const c of [...dev.cases, ...held.cases]) {
      for (const s of Object.values(rules(c.narrative))) {
        expect(s!.source).toContain(s!.value);
        expect(c.narrative).toContain(s!.source);
      }
    }
  });
});

describe("hybrid narrative checks", () => {
  const n = "SYN-0003. Date 2026-01-02. Mother says cough. No fever. I saw fast breathing. Will return Monday.";
  const segs = segmentNarrative(n);
  const r = runRules(segs, n);
  it("drops a trailing negation finding from concern and keeps it whole elsewhere", () => {
    const v = checkNarrativeSelections('{"concern":[3,4],"observations":[4,5],"followUp":6}', n, segs, r);
    expect(v.suggestions.concern!.value).toBe("Mother says cough.");
    expect(v.suggestions.observations!.value).toBe("No fever. I saw fast breathing.");
    expect(v.suggestions.followUp!.value).toBe("Will return Monday.");
  });
  it("rejects date-only sentences and non-plan follow-ups", () => {
    const v = checkNarrativeSelections('{"concern":2,"observations":null,"followUp":5}', n, segs, r);
    expect(v.suggestions.concern).toBeUndefined();
    expect(v.suggestions.followUp).toBeUndefined();
  });
  it("model may not answer structured fields in hybrid mode", () => {
    expect(() => checkNarrativeSelections('{"location":2}', n, segs, r)).toThrow();
  });
  it("provenance separates rule and model; Shona gets a warning", () => {
    const res = combineHybrid('{"concern":3}', n, segs, "sn", r, meta);
    expect(res.suggestions.patientCode!.by).toBe("rule");
    expect(res.suggestions.concern!.by).toBe("model");
    expect(res.ai!.warning).toMatch(/Shona/);
    expect(res.ai!.ruleFields).toContain("encounterDate");
  });
  it("prompt never contains evaluation narratives", () => {
    const p = JSON.stringify(buildMessages(segs));
    for (const c of [...dev.cases, ...held.cases]) expect(p).not.toContain(c.narrative.slice(0, 30));
  });
});

describe("install smoke check", () => {
  it("accepts only the expected answer", () => {
    expect(checkSmokeOutput('{"patientCode": 1}').ok).toBe(true);
    expect(checkSmokeOutput('<think>\n</think>\n{"patientCode":1}').ok).toBe(true);
    for (const bad of [null, "", "not json", '{"patientCode": null}', '{"patientCode": 2}', '{"patientCode":1,"x":1}', "[1]"])
      expect(checkSmokeOutput(bad).ok).toBe(false);
  });
});
