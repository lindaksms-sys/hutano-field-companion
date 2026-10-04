// Conservative explicit-source rules (deterministic, NOT AI).
// Each rule returns an exact substring of the narrative (value) plus the whole sentence (source),
// or abstains (null) when a cue is missing, ambiguous, conflicting or about another person.
// No normalization: "4 years" stays "4 years"; dates are never invented or reformatted.
// Shona cues are a small DRAFT dictionary awaiting native-speaker validation (see SHONA_CUES).
import type { Segment } from "./ai-extraction";
import type { Suggestion } from "./extraction";
import type { FieldKey } from "./types";

export type RuleField = "patientCode" | "age" | "encounterDate" | "location" | "duration";
export const RULE_FIELDS: RuleField[] = ["patientCode", "age", "encounterDate", "location", "duration"];

/** Draft Shona cue dictionary — unvalidated; documented in docs/evaluation/README.md. */
export const SHONA_CUES = {
  status: "draft — awaiting native-speaker validation",
  ageYears: ["makore"], // "ane makore 4" = has 4 years
  ageMonths: ["mwedzi"],
  numbers: { rimwe: 1, mumwe: 1, maviri: 2, mbiri: 2, matatu: 3, mana: 4, mashanu: 5, matanhatu: 6, manomwe: 7, masere: 8, mapfumbamwe: 9, gumi: 10 } as Record<string, number>,
  durationPrefixes: ["kwemazuva", "kwemavhiki", "kwevhiki", "kwesvondo", "kwemasvondo", "kwemwedzi", "kwemakore", "kwenguva"],
  livesIn: ["anogara", "anobva"],
  otherPerson: ["amai", "baba", "mbuya", "mukoma", "hanzvadzi", "sekuru", "ambuya", "tete", "babamunini", "muchengeti"],
  // mukadzi = woman OR wife, murume = man OR husband (review round 1). Other person only with an explicit
  // relationship word ("mukadzi wake"); with several people in the sentence and no relation → abstain.
  ambiguousPerson: ["mukadzi", "murume"],
  followUp: ["ndichadzoka", "dzoka", "achadzoka", "svondo rinouya", "vhiki rinouya", "ndichauya zvakare", "ndichadzokera", "tichadzoka"],
} as const;

const EN_NUM = "one|two|three|four|five|six|seven|eight|nine|ten|a|an";
// "gumi nemaviri" (12) must be matched whole, never truncated to "gumi" (10). Values are kept as written.
const SN_UNITS = Object.keys(SHONA_CUES.numbers).filter((w) => w !== "gumi");
const SN_NUM = `gumi(?:\\s+ne(?:${SN_UNITS.join("|")}))?|${SN_UNITS.join("|")}`;
const AMBIG_PERSON = new RegExp(`\\b(${SHONA_CUES.ambiguousPerson.join("|")})\\b`, "i");
const AMBIG_RELATION = new RegExp(`\\b(?:${SHONA_CUES.ambiguousPerson.join("|")})\\s+(?:wake|wangu|wako|wavo|wedu|wa[A-Z]\\w*)\\b`, "i");
const PERSON_NOUN = /\b(mwana|mukomana|musikana|murwere|child|baby|boy|girl|patient)\b/i;
/** "other" = explicit relationship; "unresolved" = ambiguous word alongside another person; null = not involved. */
function ambiguousPerson(seg: Segment, idx: number): "other" | "unresolved" | null {
  const before = seg.text.slice(0, idx);
  if (!AMBIG_PERSON.test(before)) return null;
  if (AMBIG_RELATION.test(seg.text)) return "other";
  return PERSON_NOUN.test(seg.text) ? "unresolved" : null;
}
const OTHER_PERSON = new RegExp(
  `\\b(mother|father|mum|mom|dad|sister|brother|husband|wife|grandmother|grandfather|aunt|uncle|caregiver|carer|neighbou?r|${SHONA_CUES.otherPerson.join("|")})\\b`,
  "i",
);
const FOLLOWUP = /\b(return|review|revisit|come back|follow[- ]?up|next visit|next week|due|ndichadzoka|achadzoka|dzoka|ndichadzokera|tichadzoka|ndichauya zvakare|rinouya)\b/i;
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

interface Hit {
  value: string;
  seg: Segment;
  start: number; // absolute offset of value
}

function scan(segs: Segment[], re: RegExp, pick: (m: RegExpExecArray) => { text: string; idx: number } | null, keep?: (m: RegExpExecArray, seg: Segment) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const seg of segs) {
    if (seg.withheld) continue;
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = r.exec(seg.text))) {
      if (keep && !keep(m, seg)) continue;
      const p = pick(m);
      if (!p) continue;
      hits.push({ value: p.text, seg, start: seg.start + m.index + p.idx });
    }
  }
  return hits;
}

/** One unambiguous value, or abstain. Same value repeated is fine; different values conflict. */
function single(hits: Hit[], narrative: string): Suggestion | null {
  const distinct = new Set(hits.map((h) => h.value.toLowerCase()));
  if (distinct.size !== 1) return null;
  const h = hits[0]!;
  if (narrative.slice(h.start, h.start + h.value.length) !== h.value) return null; // exact-offset guard
  return { value: h.value, source: h.seg.text, by: "rule" };
}

/** Text in the same clause before the match (for "mother, 30 years" style other-person checks). */
function clauseBefore(seg: Segment, idx: number) {
  return seg.text.slice(Math.max(0, idx - 30), idx);
}

export function rulePatientCode(segs: Segment[], narrative: string) {
  return single(scan(segs, /\b[A-Z]{2,5}-\d{2,6}\b/, (m) => ({ text: m[0], idx: 0 })), narrative);
}

export function ruleAge(segs: Segment[], narrative: string) {
  let unresolved = false;
  const notOther = (m: RegExpExecArray, seg: Segment) => {
    if (OTHER_PERSON.test(clauseBefore(seg, m.index) + m[0])) return false;
    const a = ambiguousPerson(seg, m.index);
    if (a === "unresolved") unresolved = true;
    return a === null;
  };
  const hits = [
    // "4 years old", "18 months old", "4-year-old", "4 yrs old"
    ...scan(segs, /\b(\d{1,3}(?:\.\d)?)[- ](years?|yrs?|months?|weeks?)[- ]old\b/i, (m) => ({ text: m[0], idx: 0 }), notOther),
    // "aged 4 years", "age 34", "age: 2 years"
    ...scan(segs, /\bage[d]?\s*:?\s*(\d{1,3}(?:\s*(?:years?|yrs?|months?|weeks?))?)\b/i, (m) => ({ text: m[1]!, idx: m[0].indexOf(m[1]!) }), notOther),
    // "34 y/o", "34yo"
    ...scan(segs, /\b(\d{1,3})\s?(?:y\/o|yo)\b/i, (m) => ({ text: m[0], idx: 0 }), notOther),
    // Shona (draft): "ane makore 4", "ane makore mana", "ane mwedzi 9"
    ...scan(segs, new RegExp(`\\bane\\s+((?:makore|mwedzi)\\s+(?:\\d{1,3}|${SN_NUM}))\\b`, "i"), (m) => ({ text: m[1]!, idx: m[0].indexOf(m[1]!) }), notOther),
  ];
  if (unresolved) return null; // woman/wife or man/husband next to another person: abstain
  return single(hits, narrative);
}

export function ruleEncounterDate(segs: Segment[], narrative: string) {
  const notFollowOrBirth = (_m: RegExpExecArray, seg: Segment) => !FOLLOWUP.test(seg.text) && !/\b(born|birth|dob|akazvarwa)\b/i.test(seg.text);
  const hits = [
    ...scan(segs, /\b\d{4}-\d{2}-\d{2}\b/, (m) => ({ text: m[0], idx: 0 }), notFollowOrBirth),
    ...scan(segs, new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?\\s+\\d{4}\\b`, "i"), (m) => ({ text: m[0], idx: 0 }), notFollowOrBirth),
    ...scan(segs, new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "i"), (m) => ({ text: m[0], idx: 0 }), notFollowOrBirth),
    // dd/mm/yyyy only when unambiguous (day > 12); otherwise abstain
    ...scan(segs, /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/, (m) => (Number(m[1]) > 12 && Number(m[2]) <= 12 ? { text: m[0], idx: 0 } : null), notFollowOrBirth),
  ];
  // Any ambiguous numeric date present → abstain entirely (conflict risk).
  const ambiguous = segs.some((s) => /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/.test(s.text) && (() => { const m = s.text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/)!; return Number(m[1]) <= 12 && Number(m[2]) <= 12; })());
  if (ambiguous) return null;
  return single(hits, narrative);
}

const NOT_PLACE = new RegExp(`^(?:${MONTHS}|today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|nhasi|nezuro|the|a|home|clinic)$`, "i");
export function ruleLocation(segs: Segment[], narrative: string) {
  const place = "([A-Z][a-zA-Z'-]+(?:\\s[A-Z][a-zA-Z'-]+)?)";
  const okPlace = (t: string) => !NOT_PLACE.test(t) && !/\d{4}/.test(t);
  const hits = [
    // "Village: Chikore", "Ward: Mutasa", "Location - Nyanga"
    ...scan(segs, new RegExp(`\\b(?:[Vv]illage|[Ww]ard|[Ll]ocation|[Mm]usha|[Dd]unhu)\\s*[:-]\\s*${place}`), (m) => (okPlace(m[1]!) ? { text: m[1]!, idx: m[0].lastIndexOf(m[1]!) } : null)),
    // "Ward 12"
    ...scan(segs, /\bWard\s+\d{1,3}\b/, (m) => ({ text: m[0], idx: 0 })),
    // "Chikore village", "Mutasa ward"
    ...scan(segs, new RegExp(`${place}\\s+(?:village|ward)\\b`), (m) => (okPlace(m[1]!) && !/^(The|In|At|From|Of)$/.test(m[1]!) ? { text: m[0], idx: 0 } : null)),
    // "lives in Mutasa", "from Chikore" (English); "Anogara Mutasa", "anogara kuMutasa" (draft Shona)
    ...scan(segs, new RegExp(`\\b(?:[Ll]ives in|[Ll]ives at|[Rr]esides in|[Ff]rom|${SHONA_CUES.livesIn.map((w) => `[${w[0]!.toUpperCase()}${w[0]}]${w.slice(1)}`).join("|")})\\s+(?:ku|mu|kwa)?${place}`), (m) => (okPlace(m[1]!) && !/\s(village|ward)$/i.test(m[1]!) ? { text: m[1]!, idx: m[0].lastIndexOf(m[1]!) } : null), (m, seg) => !OTHER_PERSON.test(clauseBefore(seg, m.index))),
  ];
  // "Chikore village" and "Chikore" for the same place: keep the longer labelled form.
  const merged = hits.filter((h) => !hits.some((o) => o !== h && o.value.length > h.value.length && o.value.toLowerCase().includes(h.value.toLowerCase())));
  return single(merged, narrative);
}

export function ruleDuration(segs: Segment[], narrative: string) {
  const notFollow = (_m: RegExpExecArray, seg: Segment) => !FOLLOWUP.test(seg.text);
  const notOther = (m: RegExpExecArray, seg: Segment) => !/\b(mother|father|amai|baba)\b.*\b(also|too)\b/i.test(clauseBefore(seg, m.index));
  const keep = (m: RegExpExecArray, s: Segment) => notFollow(m, s) && notOther(m, s);
  const hits = [
    // "for 3 days", "for the past two weeks", "for a week"
    ...scan(segs, new RegExp(`\\bfor\\s+(?:the\\s+(?:last|past)\\s+)?(?:\\d{1,3}|${EN_NUM})\\s+(?:hours?|days?|weeks?|months?|years?)\\b`, "i"), (m) => ({ text: m[0], idx: 0 }), keep),
    // "since yesterday", "since last week"
    ...scan(segs, /\bsince\s+(?:yesterday|last\s+(?:night|week|month))\b/i, (m) => ({ text: m[0], idx: 0 }), keep),
    // "3 days ago" (onset)
    ...scan(segs, new RegExp(`\\b(?:started|began)\\s+(?:\\d{1,3}|${EN_NUM})\\s+(?:days?|weeks?|months?)\\s+ago\\b`, "i"), (m) => ({ text: m[0], idx: 0 }), keep),
    // Shona (draft): "kwemazuva matatu", "kwesvondo rimwe", "kwemazuva 3"
    ...scan(segs, new RegExp(`\\b(?:${SHONA_CUES.durationPrefixes.join("|")})\\s+(?:\\d{1,3}|${SN_NUM})\\b`, "i"), (m) => ({ text: m[0], idx: 0 }), keep),
    ...scan(segs, /\bkubva\s+nezuro\b/i, (m) => ({ text: m[0], idx: 0 }), keep),
  ];
  return single(hits, narrative);
}

export function runRules(segs: Segment[], narrative: string): Partial<Record<FieldKey, Suggestion>> {
  const out: Partial<Record<FieldKey, Suggestion>> = {};
  const fns: Record<RuleField, (s: Segment[], n: string) => Suggestion | null> = {
    patientCode: rulePatientCode,
    age: ruleAge,
    encounterDate: ruleEncounterDate,
    location: ruleLocation,
    duration: ruleDuration,
  };
  for (const k of RULE_FIELDS) {
    const s = fns[k](segs, narrative);
    if (s) out[k] = s;
  }
  return out;
}
