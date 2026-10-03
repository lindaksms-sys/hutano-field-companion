# Hutano

Offline-first field companion prototype for Zimbabwean Village Health Workers (VHWs).
Solo project by Linda Kisimisi — World Bank Small AI for Development (Health) hackathon.

> **Prototype. Synthetic demo data only.** Do not enter real patient information.
> Hutano does not diagnose, prescribe, recommend treatment, classify urgency or make any clinical decision.

## Flow

Shona/English narrative → draft saved to IndexedDB → extraction adapter (swappable) →
missing-documentation check → human review (source beside editable fields) → explicit verification →
verified local record → *(future)* outbox sync to an external Supabase project.

## Setup

```bash
bun install
bun run dev      # http://localhost:8080
bun run test     # vitest
bun run build
```

Copy `.env.example` to `.env` only once a backend exists. Placeholders:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

They are currently **not used for any network call** — the sync transport is unimplemented.

## Architecture

| Path | Role |
| --- | --- |
| `src/domain/types.ts` | Record schema (v1): UUID, timestamps, raw narrative, input language, fields with source/state, review & sync status, local/server revision, verification time |
| `src/domain/db.ts` | Dexie IndexedDB database (lazy, browser-only) |
| `src/domain/repository.ts` | Draft creation, transactional mutations (edit after verification invalidates it), verification rules, export/clear demo |
| `src/domain/extraction.ts` | `ExtractionAdapter` interface; deterministic **Demo extraction — not AI**; unconfigured AI adapter boundary (no calls, no keys) |
| `src/domain/fixtures.ts` | Labelled synthetic fixtures with exact source mappings |
| `src/domain/sync.ts` | Outbox (verified + queued only), `SyncTransport` interface, not-configured transport; no network code |
| `src/lib/pwa.ts` | Single guarded service-worker registration (never in dev/preview/iframe; `?sw=off` kill switch) |

Field states: `empty`, `pending` (suggestion), `accepted`, `edited`, `not_recorded` (requires a reason).
Unknown values stay `null`. Verification requires: no pending suggestions, every field filled or marked not recorded with a reason, and an explicit confirmation checkbox.

## Phase boundaries

- **Works now:** local capture, draft-before-extraction, demo extraction on fixtures (plus literal `SYN-####` codes and ISO dates), manual entry of all fields, missing-documentation panel, review/verify, invalidation on edit, persistence across reloads, JSON export, clear demo data, truthful status pages, installable manifest, production app-shell service worker.
- **Not implemented:** AI extraction (online or offline), backend sync, authentication, conflict resolution, encryption at rest, Shona UI validation.

## Privacy limitations

- Records are stored **unencrypted** in browser IndexedDB. Anyone with the unlocked device/browser profile can read them. A lost or shared device exposes all records.
- No authentication, no remote wipe. Browser may evict data if persistent storage is not granted (shown in Settings).
- Encounter data is never written to localStorage or telemetry (only the UI language preference is).

## Tests

`src/test/domain.test.ts` (uses `fake-indexeddb`): draft persistence across reconnects, failed writes reject, verification invalidation, pending blocks verification, negation and Shona text preserved verbatim, arbitrary text leaves fields null, not-recorded acknowledgement, no sync without backend and drafts excluded from outbox.
