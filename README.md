# Hutano

Offline-first field companion prototype for Zimbabwean Village Health Workers (VHWs).
Solo project by Linda Kisimisi — World Bank Small AI for Development (Health) hackathon.

> **Prototype. Synthetic demo data only.** Do not enter real patient information.
> Live (Vercel): https://hutano.creativehauz.space · Source: https://github.com/lindaksms-sys/hutano-field-companion (branch `main`)
>
> Hutano does not diagnose, prescribe, recommend treatment, classify urgency or make any clinical decision.

## Flow

Shona/English narrative → draft saved to IndexedDB → extraction adapter (swappable) →
missing-documentation check → human review (source beside editable fields) → explicit verification →
verified local record → outbox upload of verified synthetic snapshots to the external Supabase project (signed-in, app open).

## Backend (external Supabase)

- Project: `cqggulderafbyvzjvobr` — https://supabase.com/dashboard/project/cqggulderafbyvzjvobr
- URL `https://cqggulderafbyvzjvobr.supabase.co`, publishable key in `.env.example` (public config; no server secrets in this repo).
- Not Lovable Cloud. No Edge Functions, no server code — the browser talks to Supabase directly under RLS.
- Schema: `docs/backend/0001_encounter_revisions.sql` is an exact copy of the migration **already applied**. Do not re-run it.
- Database constraints: synthetic-only (`is_synthetic = true`), verified-only, owner-scoped RLS, `authenticated` gets `select, insert` only (no update/delete/upsert). Anonymous auth is off.
- Auth: email/password with email confirmation. In Supabase → Authentication → URL Configuration, add the preview/published origins (path `/auth`) as redirect URLs so the confirmation link returns to the app.

## Setup

```bash
bun install
cp .env.example .env   # optional; same values are built in
bun run dev            # http://localhost:8080
bun run test           # vitest
bun run build
```

## Accounts and local data

- Signing in is optional. Offline capture works signed-out; cloud sync needs an account.
- IndexedDB records carry `ownerId`. Signed-out capture creates **unowned demo records** (`ownerId = null`).
- Each account sees only its own records plus unowned ones. Records are never moved between accounts on sign-in. Unowned records sync only after an explicit **Adopt** into the signed-in account.
- The Supabase auth session is stored by supabase-js in localStorage (standard browser convention). Encounter payloads are never stored there.

## Sync semantics (store-and-forward, initial MVP)

- Verifying a record (owned by the signed-in account) writes, **in the same IndexedDB transaction**, an outbox entry with a stable revision UUID and the full immutable snapshot payload. Device id is a UUID stored in IndexedDB.
- Drain = single-flight lock; uploads the current account's pending entries with `insert` only.
- Lost acknowledgement: retry sends the same id and payload. On duplicate (`23505`), the row is selected by id and compared field by field; it is accepted only if identical, otherwise marked rejected.
- Only the exact acknowledged local revision becomes `synced`. Edits made during an in-flight request remove verification and stay unsynced.
- Sign-out/account change bumps an epoch; responses arriving afterwards do not touch local state.
- Offline/network errors keep the queue. Auth errors pause; retry happens after sign-in.
- Drafts and in-review records are never uploaded. No simulated success.
- Triggers: **Sync now**, the browser `online` event, sign-in. **The app must be open** — no background sync.
- Revisions from multiple devices are all retained on the server. Full two-way conflict resolution and downloading server records are **not** implemented.

## GitHub and deployment

- Public repository: https://github.com/lindaksms-sys/hutano-field-companion — Lovable syncs commits to `main`.
- Vercel deploys `main` automatically to https://hutano.creativehauz.space. Nitro auto-detects Vercel and writes the browser bundle to `.vercel/output/static`.
- Lovable hosting is not used for this deployment.

## Offline scope

- **Requires one online load first.** On that visit the service worker installs, precaches the hashed JS/CSS/icons/manifest, and stores the app pages `/`, `/encounters`, `/encounters/new`, `/sync`, `/settings`. Settings shows "Offline app: Ready" only once this has finished.
- After that, those pages reload and navigate offline; capture, review and verification work offline against IndexedDB. Record pages (`/encounters/<id>`) open offline via in-app navigation; a hard reload of a record page that was never opened online is not guaranteed.
- Not cached: `/auth` and its callbacks, any URL carrying tokens/codes, `/api`, and every Supabase request (cross-origin). Encounter data lives only in IndexedDB, never in caches. Google Fonts fall back to the system font offline.
- Sync needs internet. On-device AI works offline only after it has been installed in Settings (see below).
- Updates are non-destructive: a new worker waits until all Hutano tabs are closed; Settings shows when an update is waiting. Kill switch: open any page with `?sw=off`.
- The worker is generated by `scripts/service-worker-plugin.ts` (Workbox `generateSW`) into the client environment's real output dir. vite-plugin-pwa was removed because under TanStack Start + Nitro it wrote `sw.js` to `dist/` (not deployed) with `client/`-prefixed precache URLs, causing the production `/sw.js` 404.

## Architecture

| Path | Role |
| --- | --- |
| `src/domain/types.ts` | Record schema (v1): UUID, timestamps, raw narrative, input language, fields with source/state, review & sync status, local/server revision, verification time |
| `src/domain/db.ts` | Dexie IndexedDB database (lazy, browser-only) |
| `src/domain/repository.ts` | Draft creation, transactional mutations (edit after verification invalidates it), verification rules, export/clear demo |
| `src/domain/extraction.ts` | `ExtractionAdapter` interface; deterministic **Demo extraction — not AI**; adapter choice Manual / Demo / On-device AI |
| `src/domain/ai-extraction.ts` | Segmentation, prompt, strict output validator (pure, tested) |
| `src/lib/ai-model.ts`, `src/lib/ai-config.ts`, `src/workers/ai-extraction.worker.ts` | Pinned model config, install/cancel/remove/extract manager, dedicated inference Web Worker |
| `src/domain/fixtures.ts` | Labelled synthetic fixtures with exact source mappings |
| `src/domain/sync.ts` | Outbox drain (lock, retry, duplicate compare, epoch guard) against a `RevisionStore` interface |
| `src/domain/session.ts` | Current account id + epoch for partitioning and stale-response protection |
| `src/lib/supabase.ts`, `src/lib/supabase-store.ts` | Browser Supabase client; insert/select-only `RevisionStore` |
| `src/lib/auth.tsx` | Email/password auth, confirmation state, sign-out |
| `src/lib/pwa.ts` | Single guarded service-worker registration (never in dev/preview/iframe; `?sw=off` kill switch), offline-readiness state, app-shell page warm-up |
| `scripts/service-worker-plugin.ts` | Build-time Workbox worker generation into the client output dir |

Field states: `empty`, `pending` (suggestion), `accepted`, `edited`, `not_recorded` (requires a reason).
Unknown values stay `null`. Verification requires: no pending suggestions, every field filled or marked not recorded with a reason, and an explicit confirmation checkbox.

## Phase boundaries

- **Works now:** local capture, draft-before-extraction, demo extraction on fixtures (plus literal `SYN-####` codes and ISO dates), manual entry of all fields, missing-documentation panel, review/verify, invalidation on edit, persistence across reloads, JSON export, clear demo data, truthful status pages, installable manifest, production app-shell service worker (offline after first load).
- **Also works:** email/password auth with confirmation state, per-account partitioning, explicit adopt, upload of verified synthetic snapshots.
- **Experimental:** on-device AI extraction (see below).
- **Not implemented:** cloud AI, background sync, downloading server records, two-way conflict resolution, encryption at rest, remote wipe, Shona UI validation.

## Privacy limitations

- Records are stored **unencrypted** in browser IndexedDB. Anyone with the unlocked device/browser profile can read them. A lost or shared device exposes all records.
- Signing out hides but does not delete an account's local records. No remote wipe. Browser may evict data if persistent storage is not granted (shown in Settings).
- Encounter data is never written to localStorage or telemetry (only the UI language preference is).

## Tests

`src/test/sync.test.ts` (fake store): no sync signed-out, draft exclusion, offline keeps queue, lost-ack retry with identical id/payload, differing duplicate rejected, auth pause, parallel-drain lock, edit during in-flight upload, account change mid-request, user isolation and explicit adopt.


`src/test/domain.test.ts` (uses `fake-indexeddb`): draft persistence across reconnects, failed writes reject, verification invalidation, pending blocks verification, negation and Shona text preserved verbatim, arbitrary text leaves fields null, not-recorded acknowledgement, not-recorded acknowledgement.

## On-device AI extraction (experimental)

> Held-out synthetic evaluation (14 cases): hybrid v2 precision 96% (55/57), recall 80% (55/69), 2 false positives, vs baseline v1 32% / 26% / 39. Small sample; Shona gold provisional; real phones untested. Details and failures: [docs/evaluation/README.md](docs/evaluation/README.md).

- **Model:** [`onnx-community/Qwen3-0.6B-ONNX`](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX), pinned revision `da1453100cf3ff33ef56d17983fc7a8648706db6`. License: Apache-2.0 (Qwen3-0.6B base model).
- **Library:** `@huggingface/transformers` **4.3.0** (exact pin, in `bun.lock`), which uses `onnxruntime-web 1.31.0-dev.20260914-8d85527a0`. The ONNX Runtime WebAssembly files load from jsDelivr at that exact version.
- **Variants:** WebGPU with `shader-f16` → `q4f16` (`model_q4f16.onnx`, 570 MB). Otherwise WebAssembly → `q8` (`model_quantized.onnx`, 618 MB). Total download incl. tokenizer and runtime: about 606 MB (WebGPU) / 654 MB (WASM). Sizes come from the model's published file list. **Only the WASM path has been tested**; the WebGPU path is untested.
- **Install:** Settings → *On-device AI extraction* → **Download on-device AI** → confirm. Nothing downloads on page load or when choosing an extractor. Before downloading, Settings shows the size and free browser storage. During download you get progress and **Cancel**, which stops the download. If it fails you get the error and **Retry**. **Remove model files** deletes only the `hutano-ai-v1` cache and never touches records. The app shows **Ready** only after every required file (configs, tokenizer, ONNX weights, runtime `.wasm`/`.mjs`) is confirmed in that cache *and* a real test inference returned exactly the expected answer (`{"patientCode":1}`); any other output fails the install. Installs from before this check must be re-downloaded. Model files live in their own cache and are not part of the app's offline file cache.
- **Hybrid (v2, current):** deterministic rules (not AI) suggest patient code, age with units, unambiguous dates, labelled village/ward and duration, abstaining on conflicts, other people's ages, ambiguous dates and unknown cues. The model only picks sentences for concern, observations and follow-up, and deterministic checks discard date-only, report-vs-observation and non-plan selections. Each suggestion shows whether it came from a rule or the AI. Shona/mixed results carry a warning. Evaluation: see [docs/evaluation/README.md](docs/evaluation/README.md).
- **How it works:** the draft is saved first. The note is split into numbered sentences, and lines that look like instructions to the AI are withheld from it. Qwen3 runs in no-thinking mode, deterministic, with at most 96 new tokens and 1500 input tokens. It may only answer with sentence numbers per field. A strict validator rejects anything else: non-JSON, prose, unknown keys, strings, out-of-range or non-consecutive numbers, oversized output, and withheld lines. Values are rebuilt from the **exact whole sentences**, so negation like "Hapana fivha" / "No fever" stays intact. Patient code must literally appear in the note. Every suggestion is *pending* human review. Any failure, timeout or cancel keeps the saved draft for manual review and records the reason. Results apply only to the same record revision and account they were started on. Model output is never displayed or logged. Notes never leave the device.
- **Limits:** needs roughly 1.5 GB free memory. The test runs took about 60–100 s per note on a CPU-only container, and slow phones may take minutes or time out. **Shona ability is unvalidated.** Suggestions are whole sentences that the worker trims. Demo fixtures are never used by this extractor.

### Earlier test evidence, v1 before the hybrid (Oct 3 2026, headless Chromium, no GPU, WASM/q8, local production build)

- Install: download, cache check and test inference reached Ready (7 files, 632 MB cached; test inference 8–9 s, valid JSON).
- English synthetic note (97 s): code `SYN-0107` correct. Concern, observations and follow-up picked the right sentences, but concern also included "No fever.". Location picked the wrong sentence (the date). Age, date and duration were missed.
- Shona synthetic note (67 s): code `SYN-0042` correct. Location and concern picked the **wrong** sentences, and one invalid selection was discarded. Quality on Shona is poor; human review is essential.
- Cold offline: new browser process, network disabled. The app opened from the offline cache, showed AI Ready and ran inference (58 s, same output as online). Reloading the saved draft offline worked.
- Unit tests: `src/test/ai-extraction.test.ts` (validator, made-up values, negation, malformed JSON, injection, stale/account guards, cancellation). The full suite now has 48 tests, including `src/test/hybrid-extraction.test.ts` (rules, segmentation of decimals, hybrid checks, provenance, strict smoke check). Validator tests are not accuracy evidence.
