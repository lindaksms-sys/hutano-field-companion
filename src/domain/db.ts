import Dexie, { type Table } from "dexie";
import type { EncounterRecord } from "./types";

export class HutanoDB extends Dexie {
  encounters!: Table<EncounterRecord, string>;
  constructor(name = "hutano") {
    super(name);
    this.version(1).stores({
      encounters: "id, updatedAt, reviewStatus, syncStatus, isSynthetic",
    });
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
