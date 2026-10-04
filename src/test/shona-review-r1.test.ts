import { describe, expect, it } from "vitest";
import { checkNarrativeSelections, segmentNarrative } from "@/domain/ai-extraction";
import { RULE_FIELDS, runRules } from "@/domain/rules";
import r1 from "../../eval/cases.reviewer-r1.dev.json";

// Shona review round 1 (user-supplied proposal, not clinician validated). Development examples only.
type Case = { id: string; narrative: string; expected: Record<string, string[] | null> };
const cases = r1.cases as Case[];

describe("review r1: rule fields on reviewer development examples", () => {
  for (const c of cases) {
    it(`${c.id} rules match expected or abstain`, () => {
      const r = runRules(segmentNarrative(c.narrative), c.narrative);
      for (const k of RULE_FIELDS) {
        const exp = c.expected[k];
        if (exp === null) expect(r[k], `${c.id}.${k}`).toBeUndefined();
        else expect(exp, `${c.id}.${k}`).toContain(r[k]?.value);
        if (r[k]) expect(c.narrative).toContain(r[k]!.value); // exact source substring, never normalized
      }
    });
  }
});

describe("review r1: narrative-field checks", () => {
  const sel = (n: string, raw: string) => {
    const segs = segmentNarrative(n);
    return checkNarrativeSelections(raw, n, segs, runRules(segs, n)).suggestions;
  };
  it("bare 'musoro' (head) is not a concern cue; 'kurwadziwa nemusoro' is", () => {
    expect(sel("Musoro wake wakakura.", '{"concern":1,"observations":null,"followUp":null}').concern).toBeUndefined();
    expect(sel("Ari kurwadziwa nemusoro.", '{"concern":1,"observations":null,"followUp":null}').concern?.value).toBe("Ari kurwadziwa nemusoro.");
  });
  it("'tichaona' alone is not a follow-up plan; 'tichadzoka kuzoona' is", () => {
    expect(sel("Tichaona.", '{"concern":null,"observations":null,"followUp":1}').followUp).toBeUndefined();
    expect(sel("Tichadzoka kuzoona.", '{"concern":null,"observations":null,"followUp":1}').followUp?.value).toBe("Tichadzoka kuzoona.");
  });
  it("carer report is not accepted as a worker observation; ndakacherechedza is", () => {
    expect(sel("Mbuya vanoti hapana fivha.", '{"concern":null,"observations":1,"followUp":null}').observations).toBeUndefined();
    expect(sel("Ndakacherechedza kuti akaonda.", '{"concern":null,"observations":1,"followUp":null}').observations?.value).toBe("Ndakacherechedza kuti akaonda.");
  });
  it("negation stays verbatim inside the whole sentence", () => {
    const v = sel("Amai vanoti hapana fivha asi haadyi.", '{"concern":1,"observations":null,"followUp":null}');
    expect(v.concern?.value).toBe("Amai vanoti hapana fivha asi haadyi.");
  });
});
