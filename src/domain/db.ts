import Dexie, { type Table } from "dexie";
import type { EncounterRecord, OutboxEntry } from "./types";

export interface MetaRow {
  key: string;
  value: string;
}

export class HutanoDB extends Dexie {
  encounters!: Table<EncounterRecord, string>;
  outbox!: Table<OutboxEntry, string>;
  meta!: Table<MetaRow, string>;
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
  }
}

let instance: HutanoDB | null = null;
/** Lazily created so SSR never touches IndexedDB. */
export function getDB(): HutanoDB {
  if (!instance) instance = new HutanoDB();
  return instance;
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
