# Shona review handoff (volunteer translator)

Thank you for reviewing Hutano's Shona. Everything here is **synthetic**. Please never add real patient notes, names or places tied to real people.

> Round 1 review: see [shona-review-round1.md](shona-review-round1.md). Reviewer text is stored in `docs/shona-review-overlay.csv` (keyed by `key`) and merged on every regeneration.

## What we're asking for
- **Natural wording a rural Village Health Worker would actually use or write.** Not textbook Shona, and not medical advice.
- **Common spellings and code-switch variants**, e.g. `kwemazuva matatu` / `kwemazuva 3` / `for 3 days`, `fivha` / `fever`, `ku-` / `mu-` place prefixes.
- **Corrections to meanings** in the cue dictionary, especially where a word is ambiguous.
- Leave a cell blank if you're unsure. Add a comment in `notes` instead of guessing.

## What this does and does not change
- Your translations improve the **interface wording** and the **deterministic rules** that find age, duration, place, date and code.
- They **do not retrain the AI model**. The model's behaviour only changes if we change its prompt, and that is re-measured on a new evaluation version.
- **Out of scope:** model prompt text (rows in category `out_of_scope_model_prompt`, kept for completeness) and any free-form text written by a worker or produced by the model. Hutano never translates notes. Original text is always kept exactly as typed.

## Files
- `docs/shona-translation.csv`: UTF-8, one row per string. Columns:
  - `key`: stable ID, `<category>.<file>.<hash>`. Don't edit it.
  - `category`: one of `i18n_core`, `ui`, `auth`, `sync`, `offline_ai_install`, `error`, `review_states`, `safety_privacy`, `meaning_distinction`, `cue_dictionary`, `synthetic_example_demo|dev|heldout`, `out_of_scope_model_prompt`.
  - `english_source_meaning`: the English text, or the meaning for cue words.
  - `current_shona_draft`: the existing draft, where one exists (unvalidated).
  - `reviewer_proposed_shona`: **fill this in**.
  - `context_placeholders`: where the text appears; `{name}` placeholders must be kept exactly.
  - `notes`: guidance; `[P1]` marks the first batch.
- Regenerate from the code with `python3 scripts/shona-inventory.py`. Keys stay stable while the English text is unchanged.

## Start here: priority batch 1 (rows marked `[P1]`, sorted to the top of the CSV)
1. **Core words** (`i18n_core`): Home, Encounters, Sync, Settings, New encounter, Online/Offline, Local only, and the prototype warning.
2. **Field names and states:** Patient code, Age, Village/ward, Encounter date, Reported concern, Stated duration, Observations, Follow-up; Empty, Suggestion pending, Accepted, Edited by worker, Not recorded, Draft, Needs review, Verified.
3. **Review actions:** Accept suggestion, Mark not recorded, Verify record, Save changes, Reason, the verification statement, and "Use synthetic data only".
4. **Meaning distinctions** (`meaning_distinction`). Please explain how VHWs express each one:
   - missing (not written) vs **not recorded** (worker confirms it wasn't recorded) vs **negative finding** (checked, absent: "Hapana fivha");
   - **patient** vs **carer** vs **health worker**;
   - **age** (`ane makore 4`) vs **duration** (`kwemazuva matatu`, `kwemakore 2`);
   - **woman vs wife** (`mukadzi`) and **man vs husband** (`murume`). The rules currently treat these as "another person" and wrongly skip the patient's age (held-out case H13);
   - yes/no and negation forms (ehe, hongu, kwete, hapana, hakuna, haana);
   - time words (nhasi, nezuro, mangwana, svondo rinouya);
   - place forms (anogara, anobva, ku-/mu-, musha, dunhu, Ward);
   - patient-reported problem vs worker-observed finding vs explicit worker follow-up plan.
5. **Key cue words** (`cue_dictionary` rows marked `[P1]`).

Then continue with the full inventory.

## Synthetic examples and the frozen benchmark
- Rows `synthetic_example_dev` and `synthetic_example_heldout` are the Shona/mixed notes from `eval/cases.dev.json` and `eval/cases.heldout.json`. **These originals are frozen** (`eval/HELDOUT.sha256`).
- Put proposed natural rewordings in `reviewer_proposed_shona`. We'll publish them as a **new versioned set** (e.g. `cases.heldout.v2.json`) with corrected gold answers, and report results for both. Existing metrics are never silently changed.
- `synthetic_example_demo` rows are the in-app demo examples (`src/domain/fixtures.ts`). Rewording them also means updating their exact field mappings.

## Inventory summary (generated)
- **478 rows** total (round 1 added new cue words; 90 rows now carry reviewer text). Earlier breakdown before round 1: ui 141, cue_dictionary 81, offline_ai_install 48, review_states 40, auth 35, sync 31, error 25, meaning_distinction 18, out_of_scope_model_prompt 17, safety_privacy 13, i18n_core 9, synthetic examples 11 (demo 2, dev 3, held-out 6). **98 rows are `[P1]`**: the original 84 first-batch rows (all kept) plus 6 core full-sentence messages and 8 error-advice messages.
- Some English strings repeat in different places (e.g. "Verified" on several screens). Each place has its own row because the context can need different wording.

## Messages with values (hand-written, complete)
- Every app message that inserts a value is now one complete row with a stable `manual.*` key and **named placeholders** such as `{email}`, `{count}`, `{seconds}`, `{errorMessage}`. These were written by hand from the code, not extracted automatically, so none are cut off. Keep each `{placeholder}` exactly as written; move it wherever Shona word order needs.
- The former split sentences are now whole: `manual.auth.account_created` ("Account created for {email}. Open the confirmation link…") and `manual.auth.signed_in_as`. The old fragment rows were removed.
- Messages with optional parts list them as separate rows (e.g. `manual.sync.done` + `manual.sync.done_rejected` + `manual.sync.done_last_error`; `manual.review.extraction_summary` + its two suffix rows). The context column says where each part is inserted.
- Technical values inside placeholders (`{modelId}`, `{backend}`, `{dtype}`, `{stage}`) stay in English.

## Third-party error text (cannot be translated exhaustively)
- Raw error text from the browser, the sign-in service, the network and the AI library is open-ended and changes with each browser and version, so it cannot be listed or translated in full. Wherever it appears it fills an `{errorMessage}` placeholder inside an app sentence that *is* translated (e.g. "Not saved. Local storage write failed: {errorMessage}").
- For AI download failures the app also shows a fixed advice sentence per error group. These 8 rows (`manual.ai.next_step.network`, `.cache`, `.quota`, `.worker`, `.model_init`, `.verification`, `.timeout`, `.unknown`) are complete and marked `[P1]`. The raw text stays only in the copied diagnostic, which is meant for support and stays in English.

## Known remaining limits
- **Text built at runtime** from short labels (field names, status words) reuses their own rows.
- Single-quoted strings in code aren't scanned (none are user-facing today). Technical labels (WebGPU, q8, JSON, Supabase, IndexedDB) are included but usually stay in English.
- The Shona interface shows the 9 `i18n_core` strings plus the round-1 adopted field/state/button terms (see round-1 report). Wiring the rest into the language switch is a follow-up once your translations arrive.
