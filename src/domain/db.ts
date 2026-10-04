import Dexie, { type Table } from "dexie";
import type { AuditEntry, EncounterRecord, OutboxEntry } from "./types";

export interface MetaRow {
  key: string;
  value: string;
}

export class HutanoDB extends Dexie {
  encounters!: Table<EncounterRecord, string>;
  outbox!: Table<OutboxEntry, string>;
  meta!: Table<MetaRow, string>;
  audit!: Table<AuditEntry, string>;
  constructor(name = "hutano") {
    super(name);
    this.version(1).stores({
      encounters: "id, updatedAt, reviewStatus, syncStatus, isSynthetic",
    });
    this.version(2)
      .stores({
        encounters: "id, updatedAt, reviewStatus, syncStatus, isSynthetic, ownerId",
        outbox: "revisionId, ownerId, encounterId, status",
        meta: "key",
      })
      .upgrade((tx) =>
        tx
          .table("encounters")
          .toCollection()
          .modify((r) => {
            if (r.ownerId === undefined) r.ownerId = null; // pre-auth records become unowned demo
          }),
      );
    // v3: append-only local audit log (actions + field names only, never note text).
    this.version(3).stores({
      encounters: "id, updatedAt, reviewStatus, syncStatus, isSynthetic, ownerId",
      outbox: "revisionId, ownerId, encounterId, status",
      meta: "key",
      audit: "id, encounterId, ownerId, at",
    });
  }
}

let instance: HutanoDB | null = null;
/** Lazily created so SSR never touches IndexedDB. */
export function getDB(): HutanoDB {
  if (!instance) instance = new HutanoDB();
  return instance;
}
/** Close and drop the cached connection so the next getDB() reopens. Never deletes data. */
export function resetDBConnection() {
  try { instance?.close(); } catch { /* ignore */ }
  instance = null;
}

/** Run a storage read; on failure reset the connection, wait, and retry once. */
export async function withStorageRetry<T>(fn: () => Promise<T>, delayMs = 500): Promise<T> {
  try {
    return await fn();
  } catch {
    resetDBConnection();
    await new Promise((r) => setTimeout(r, delayMs));
    return fn();
  }
}

/** Test hook. */
export function setDB(db: HutanoDB | null) {
  instance = db;
}

/** Stable per-browser device id, stored in IndexedDB (not localStorage). */
export async function getDeviceId(db: HutanoDB = getDB()): Promise<string> {
  const row = await db.meta.get("deviceId");
  if (row) return row.value;
  const value = crypto.randomUUID();
  await db.meta.put({ key: "deviceId", value });
  return value;
}

/** Revision ids currently being uploaded; their outbox rows must not be deleted. */
export const inFlight = new Set<string>();
