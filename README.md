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
- Sync needs internet. **Offline AI is not implemented** (no AI extraction at all yet).
- Updates are non-destructive: a new worker waits until all Hutano tabs are closed; Settings shows when an update is waiting. Kill switch: open any page with `?sw=off`.
- The worker is generated by `build/service-worker-plugin.ts` (Workbox `generateSW`) into the client environment's real output dir. vite-plugin-pwa was removed because under TanStack Start + Nitro it wrote `sw.js` to `dist/` (not deployed) with `client/`-prefixed precache URLs, causing the production `/sw.js` 404.

## Architecture

| Path | Role |
| --- | --- |
| `src/domain/types.ts` | Record schema (v1): UUID, timestamps, raw narrative, input language, fields with source/state, review & sync status, local/server revision, verification time |
| `src/domain/db.ts` | Dexie IndexedDB database (lazy, browser-only) |
| `src/domain/repository.ts` | Draft creation, transactional mutations (edit after verification invalidates it), verification rules, export/clear demo |
| `src/domain/extraction.ts` | `ExtractionAdapter` interface; deterministic **Demo extraction — not AI**; unconfigured AI adapter boundary (no calls, no keys) |
| `src/domain/fixtures.ts` | Labelled synthetic fixtures with exact source mappings |
| `src/domain/sync.ts` | Outbox drain (lock, retry, duplicate compare, epoch guard) against a `RevisionStore` interface |
| `src/domain/session.ts` | Current account id + epoch for partitioning and stale-response protection |
| `src/lib/supabase.ts`, `src/lib/supabase-store.ts` | Browser Supabase client; insert/select-only `RevisionStore` |
| `src/lib/auth.tsx` | Email/password auth, confirmation state, sign-out |
| `src/lib/pwa.ts` | Single guarded service-worker registration (never in dev/preview/iframe; `?sw=off` kill switch), offline-readiness state, app-shell page warm-up |
| `build/service-worker-plugin.ts` | Build-time Workbox worker generation into the client output dir |

Field states: `empty`, `pending` (suggestion), `accepted`, `edited`, `not_recorded` (requires a reason).
Unknown values stay `null`. Verification requires: no pending suggestions, every field filled or marked not recorded with a reason, and an explicit confirmation checkbox.

## Phase boundaries

- **Works now:** local capture, draft-before-extraction, demo extraction on fixtures (plus literal `SYN-####` codes and ISO dates), manual entry of all fields, missing-documentation panel, review/verify, invalidation on edit, persistence across reloads, JSON export, clear demo data, truthful status pages, installable manifest, production app-shell service worker (offline after first load).
- **Also works:** email/password auth with confirmation state, per-account partitioning, explicit adopt, upload of verified synthetic snapshots.
- **Not implemented:** AI extraction (online or offline), background sync, downloading server records, two-way conflict resolution, encryption at rest, remote wipe, Shona UI validation.

## Privacy limitations

- Records are stored **unencrypted** in browser IndexedDB. Anyone with the unlocked device/browser profile can read them. A lost or shared device exposes all records.
- Signing out hides but does not delete an account's local records. No remote wipe. Browser may evict data if persistent storage is not granted (shown in Settings).
- Encounter data is never written to localStorage or telemetry (only the UI language preference is).

## Tests

`src/test/sync.test.ts` (fake store): no sync signed-out, draft exclusion, offline keeps queue, lost-ack retry with identical id/payload, differing duplicate rejected, auth pause, parallel-drain lock, edit during in-flight upload, account change mid-request, user isolation and explicit adopt.


`src/test/domain.test.ts` (uses `fake-indexeddb`): draft persistence across reconnects, failed writes reject, verification invalidation, pending blocks verification, negation and Shona text preserved verbatim, arbitrary text leaves fields null, not-recorded acknowledgement, not-recorded acknowledgement.
