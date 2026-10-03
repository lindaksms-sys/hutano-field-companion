<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Hutano architecture rules
- All encounter persistence goes through `src/domain/repository.ts` mutate(); it bumps localRevision and invalidates verification — keeps audit/verification guarantees in one place.
- Extraction is behind the `ExtractionAdapter` interface; adapters must return exact narrative substrings as sources and never infer/translate — prevents hallucinated clinical data.
- Sync goes through the `SyncTransport` interface; records become `synced` only from a real server ack — no simulated sync.
- Dexie DB is created lazily via getDB() — SSR must never touch IndexedDB.
- Service worker is registered only from `src/lib/pwa.ts` (guarded) — avoids stale caches in preview.
- Encounter data never goes to localStorage or telemetry.
