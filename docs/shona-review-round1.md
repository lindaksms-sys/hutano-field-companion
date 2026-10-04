# Shona review — round 1

**Status of everything below: user-supplied proposal, not clinician validated.** This is not a native-speaker certification. Raw clinical notes are never translated or changed.

## Where the review lives
- `docs/shona-review-overlay.csv` is the durable record. Columns: `key`, `reviewer_proposed_shona`, `review_status` (adopted / provisional / question), `attribution`, `review_note`, `round`. Rows are keyed by the stable inventory IDs. Rows whose key starts with `term.` are reviewer terms that have no current UI string.
- `scripts/shona-inventory.py` merges the overlay into `docs/shona-translation.csv` (same 7 columns: `reviewer_proposed_shona` plus a `[review r1: …]` tag in `notes`) **every time it regenerates**, so reviewer text can't be lost. If an English source string changes, its key changes and the script stops with an error until the overlay is updated.
- `src/test/shona-overlay.test.ts` checks that every overlay entry is merged and that regenerating reproduces the committed CSV.
- Full templates with values: see "Messages with values" in [shona-review.md](shona-review.md).

## Counts
- Overlay: **98 entries**: 82 adopted, 15 provisional, 1 question. 90 of them map to inventory rows and 8 are `term.*` entries.
- CSV: **478 rows** (up from 464 because the new cue words are now listed), **90 rows with reviewer text**, **98 `[P1]` rows** (unchanged).

## Adopted and shown in the Shona interface (language switch = Shona)
| English | Shona |
|---|---|
| Home | Kumusha |
| Encounters | Zvakanyorwa |
| Settings | Zvirongwa |
| Device online | Paindaneti |
| Offline | Hapana interneti |
| Local only | Pamudziyo uyu chete |
| Prototype warning | Ichi chigadzirwa chekuyedza chinoshandisa data rekufungidzira chete. Musaisa ruzivo rwechokwadi rwevarwere. |
| Patient code | Kodhi yemurwere |
| Encounter date | Zuva rekushanya (patient visit) |
| Reported concern | Dambudziko rataurwa |
| Worker-recorded observations | Zvakaonekwa kana kuyerwa nemushandi wehutano |
| Empty / Suggestion pending / Accepted / Edited by worker / Not recorded | Hapana chakanyorwa / Zano richiri kumirira kuongororwa / Ragamuchirwa / Ragadziridzwa nemushandi / Hazvina kunyorwa |
| Draft / Needs review / Verified | Gwaro risati rapera / Rinoda kuongororwa / Rasimbiswa |
| Save changes / Cancel / Delete | Chengetedza shanduko / Kanzura / Dzima |
| New encounter *(provisional, replaces older draft)* | Nyora kushanya kutsva |

**Where they appear:** the bottom navigation and header (core words), the review screen (record status, field names, field states, Save changes), status in the record list, the Cancel/Delete buttons in Settings and the AI download Cancel button.

**Grammar note:** the ra-/ri- forms (Rasimbiswa, Ragamuchirwa, Zano richiri…) agree with class-5 nouns (gwaro = record, zano = suggestion), so they're only used where that's the subject.

**Still English:**
- "Go home" and "Try again" are adopted in the overlay but stay English on the error pages, which show outside the language setting.
- Sync statuses, the Sync-page "Offline", and everything else not listed above.

## Provisional (in overlay, NOT shown in UI)
- Age (with units if stated): *Zera, riine zviyero kana zvataurwa*. Needs clarity on age units.
- Village / ward: *Musha / Wadhi*. Musha is fine; still to decide between *Wadhi* and keeping *Ward*.
- Stated duration: *Nguva yataurwa*. May be too vague.
- Follow-up notes: *Zvinyorwa zvekutevera*. Possibly vague; *kuongororazve* or *kudzoka kuzoona* may fit better depending on the task.
- Sign in / Sign out: *Pinda muakaundi* / *Buda muakaundi*.
- Loading: *Zviri kuvhurwa*. Opening vs processing is unclear. VHW title: *Mushandi Wehutano Wemumusha* (official title unverified).
- Rash: *mapundu paganda*. Dizziness: *dzungu / kutenderera musoro*. Swelling: *kuzvimba*. None of these are used in symptom rules. *anorwadza* is contextual (*zvinorwadza* / *ari kurwadziwa*).

## Rule and cue changes (deterministic, not AI)
- **mukadzi / murume** are no longer automatic "another person" blockers:
  - **another person** only with an explicit relationship word (e.g. *mukadzi wake*);
  - **abstain** when the word appears with another person (e.g. *mwana*) and the relationship is unclear;
  - **otherwise** the age is kept (*Mukadzi ane makore 25* gives *makore 25*).
- **Compound numbers:** *gumi nemaviri* (12) is matched whole and never cut to *gumi*. Values are kept exactly as written.
- **Headache:** bare *musoro* (head) is no longer a problem cue; *kurwadziwa* (e.g. *kurwadziwa nemusoro*) is. *anorwadza* was removed.
- **Follow-up:** *tichaona* alone is no longer a follow-up cue. Added *tichadzoka*, *tichaongorora*, *ndichauya zvakare*, *ndichadzokera* and *vhiki rinouya*.
- **Worker observation:** added *ndakacherechedza* and *ndakaongorora*.
- **Report and carer:** added *anenge achiti*, *muchengeti* and *mbuya*. *anoti* doesn't assume the speaker is the patient.
- **Duration:** added *kwevhiki*. Age (*ane makore matatu*) and duration (*kwemakore matatu*) stay distinct.
- **Negation:** *Hapana fivha* keeps the absence word for word, but it doesn't make a sentence a worker observation; report and observation cues decide that. The vague *Hapana chakaonekwa* is never turned into a specific negative finding.

## Reviewer examples (new, versioned)
- `eval/cases.reviewer-r1.dev.json` holds the 5 reviewer sentences (R1-1…R1-5) plus 3 mukadzi/murume regressions (R1-6…R1-8), with exact expected spans. They are **user-reviewed development examples, not held-out accuracy evidence**.
- `eval/cases.heldout.json`, `eval/cases.dev.json` and all results in `eval/results/` are unchanged. The original D2 is preserved; R1-1 is its reviewer-worded version.
- On these examples the rules produce the expected value or abstain for every rule field (focused tests).
- The rules-only score on the earlier practice set was unchanged. The AI was not re-run, so no accuracy figure changed.

## Open questions for the reviewer
1. **kwemwedzi:** your line compared *kwemwedzi* with an identical *kwemwedzi* (likely a typo). What distinction did you mean?
2. **Ward:** *Wadhi* or keep *Ward*?
3. **Age label:** should it name units (*makore* / *mwedzi*)?
4. **Duration and follow-up labels:** do you have more specific wording?
5. **Loading:** opening (*kuvhurwa*) or processing?
6. **VHW title:** the official title?
7. **Symptom words:** please confirm *kuzvimba*, *mapundu paganda* and *dzungu* before they are used in any rule.
