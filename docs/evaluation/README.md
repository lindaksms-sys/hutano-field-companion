# Extraction evaluation (synthetic only)

No real patient data. All notes are invented. Shona and mixed gold annotations are **provisional** until a native speaker reviews them. Shona cue words in `src/domain/rules.ts` (`SHONA_CUES`) are a **draft** dictionary, also unvalidated.

## Data
- `eval/cases.dev.json` — 6 development cases (2 en, 2 sn, 1 mixed, 1 nonclinical en). Used to tune the prompt and checks.
- `eval/cases.heldout.json` — 14 held-out cases (7 en, 4 sn, 3 mixed) covering complete notes, missing data, conflicting ages/durations, other people's ages, ambiguous and return dates, decimals (37.5, 23.5, 36.8), negation, prompt injection and a nonclinical note. Frozen with `eval/HELDOUT.sha256`; the runner refuses to score a changed file.
- Each field is `null` (not stated → correct answer is to abstain) or a list of accepted exact substrings. Accepted spans are strict: narrative fields need the **whole** gold sentence(s); a partial span counts as wrong.
- Honest timeline: the v2 prompt was drafted and tuned on the dev set only; the held-out set was written and hashed before any held-out run, and nothing was changed after seeing held-out results. The prompt's two examples are separate invented notes, not from either set (a unit test checks prompts contain no evaluation narrative).

## Modes (same cases)
- **rules** — deterministic rules only (`src/domain/rules.ts`). Not AI.
- **baseline** — v1: model labels all 8 fields with the old prompt and old segmenter (which split "37.5").
- **hybrid** — v2 (shipped): rules for patientCode/age/encounterDate/location/duration; model labels only concern/observations/followUp; deterministic checks drop negation-led findings from concern, report-only sentences from observations, non-plan sentences from followUp, and sentences that only hold code/date/age/place.

## Metrics (per case × field)
- TP: predicted value exactly equals an accepted span. FP: predicted and (gold null or wrong). FN: gold present and (missing or wrong). A wrong value is both FP and FN.
- Precision = TP/(TP+FP); recall = TP/(TP+FN). **Empty fields are never counted as correct in precision**; correct abstention (gold null, nothing predicted) is reported separately.
- Latency = model `generate()` time only, CPU.

## Runner
```
bun ./scripts/eval-extraction.ts heldout            # rules + baseline + hybrid, real model
bun ./scripts/eval-extraction.ts heldout --rules-only
bun ./scripts/eval-extraction.ts dev
```
Uses the pinned model/revision (`src/lib/ai-config.ts`) with dtype q8 via `onnxruntime-node` on CPU (same weights as the browser WASM path; different runtime build, so numbers can differ slightly). Outputs `eval/results/<split>.md|json` including raw model text for each synthetic case.

## Held-out results (Oct 4 2026, 14 cases, 112 field slots: 69 stated, 43 not stated)

| mode | precision | recall | false positives | correct abstentions |
|---|---|---|---|---|
| rules only | 95% (39/41) | 57% (39/69) | 2 | 95% (41/43) |
| baseline v1 (model, 8 fields) | 32% (18/57) | 26% (18/69) | 39 | 67% (29/43) |
| hybrid v2 | 96% (55/57) | 80% (55/69) | 2 | 95% (41/43) |

Per language (hybrid vs baseline):

| language | baseline P / R / FP | hybrid P / R / FP |
|---|---|---|
| en (7 cases) | 32% (10/31) / 29% (10/35) / 21 | 94% (31/33) / 89% (31/35) / 2 |
| sn (4, provisional gold) | 33% (5/15) / 26% (5/19) / 10 | 100% (14/14) / 74% (14/19) / 0 |
| mixed (3, provisional gold) | 27% (3/11) / 20% (3/15) / 8 | 100% (10/10) / 67% (10/15) / 0 |

Model contribution (concern + observations + followUp, 29 stated): baseline 5 TP / 16 FP; hybrid 16 TP / 0 FP (rules contribute 0 here). Model latency median 4.4 s / p95 18.7 s (hybrid) vs 11.6 s / 16.0 s (baseline), n=14 each.

Small n: one case changes a language's numbers by 5–25 points. These are not field-quality guarantees.

## Unresolved failures (hybrid, held-out)
- H7 nonclinical meeting note: rules suggested location "Mupfure ward" and date "3 May 2026" (both FPs — rules cannot tell a meeting from a visit).
- followUp recall 0/5: the model answered null for every follow-up sentence (likely biased by the prompt example with null follow-up). Not retuned on held-out.
- H1: model output was not JSON (echoed the note) → all narrative fields abstained.
- H13: age "makore 25" abstained because "mukadzi" (woman/wife) is on the other-person list; concern/observations missed.
- Shona concern recall 1/4; H11 observations missed.
- A source-backed suggestion can still be wrong; exact substrings do not prevent wrong choices.

## Cold offline check (browser, Oct 4 2026)
Local production build (node-server), headless Chromium, no GPU, WASM/q8. Install reached Ready (strict smoke check passed). New browser process with network disabled: H2-style English note → 34 s, rules 5 fields + AI 2 fields, draft reload OK; Shona note → 33 s, rules 4 + AI 1, reload OK.

## Phone test (not yet done — real devices are untested)
1. Online, open https://hutano.creativehauz.space, wait for Settings → Offline: Ready.
2. Settings → Download on-device AI (~654 MB, Wi‑Fi). Wait for "Ready · installed and tested".
3. Close the browser fully, turn on airplane mode, reopen the app.
4. New encounter → paste a synthetic note → On-device AI → Save. Record time taken and which fields are marked "rule, not AI" vs "on-device AI".
5. Reload the record page. Note phone model, RAM, browser version, and any error text.
