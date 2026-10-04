# Handle the "UnknownError: Internal error" storage failure

## What the message means
The home screen shows this when the browser's on-device database (where records are saved) refuses to open. "UnknownError: Internal error" comes from the browser itself, not from Hutano. The usual causes are:

- **Damaged browser site data.** This often follows a browser crash, an update, or a forced phone restart. It's the most common cause in Chrome and Edge.
- **Device storage almost full**, so the browser can't write its database files.
- **Private or incognito window, or strict privacy settings.** Firefox private mode and some Samsung Internet or Brave settings block or break on-device storage.
- **Opened inside another page**, such as the Lovable preview frame, where some browsers limit storage. Opening the app directly in its own tab usually works.
- **Another Hutano tab is stuck**, holding the database while it updates.

Quick things to try now:
1. Close all Hutano tabs and reopen one.
2. Open the published link directly rather than the preview.
3. Leave private mode and check free device storage.
4. As a last resort, clear site data for the app. This deletes records on that browser, so export first if Settings still works.

## Proposed app changes
1. **Retry once automatically.** If the database fails to open, the app closes it and tries again a moment later. This often clears a temporary stuck state.
2. **A plain-language error panel** instead of the raw text:
   - the likely cause and the steps above;
   - a "Retry" button;
   - "Copy diagnostic": browser, private-mode hint, free storage, whether it runs inside a frame, and the error name. It contains no records.
3. **Show the same storage check in Settings**, with the Retry button, so it can be checked any time.
4. **Never delete or reset the database automatically.** Clearing data stays a manual step with a clear warning.

## Technical details
- In `src/domain/db.ts`, add `resetDBConnection()` to close and drop the cached Dexie instance. `getDB()` then reopens on its next call.
- In `src/lib/hooks.ts`, change `useEncounters` and `useStorageStatus` to catch an open failure, call reset, wait about 500 ms, retry once, then show the error. Detect "inside a frame" with `window.self !== window.top`, and read free storage from `navigator.storage.estimate()`.
- Add a new `StorageErrorPanel` component, used by `src/routes/index.tsx` and Settings. The diagnostic text is built locally, with no encounter data.
- Add a test: a database that fails to open once, then works, shows the records. One that keeps failing shows the panel and never deletes anything.
