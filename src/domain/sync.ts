import { getDB } from "./db";
import type { EncounterRecord } from "./types";

/** Outbox = verified + queued. Drafts / in-review records never sync. */
export const getOutbox = () =>
  getDB()
    .encounters.where("syncStatus")
    .equals("queued")
    .filter((r) => r.reviewStatus === "verified")
    .toArray();

export interface ServerAck {
  id: string;
  serverRevision: number;
  acknowledgedAt: string;
}

/** Future transport (e.g. external Supabase). Must check serverRevision before overwriting. */
export interface SyncTransport {
  configured: boolean;
  push(records: EncounterRecord[]): Promise<ServerAck[]>;
}

export function backendConfig() {
  const url = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
  const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string | undefined;
  return { url: url || null, configured: Boolean(url && key) };
}

/** No backend is wired in this prototype. There is no network code here by design. */
export const transport: SyncTransport = {
  configured: false,
  async push() {
    throw new Error("Backend not configured");
  },
};

export type SyncOutcome =
  | { ok: false; reason: "backend_not_configured" | "offline" | "error"; message: string }
  | { ok: true; acknowledged: number };

export async function runSync(t: SyncTransport = transport): Promise<SyncOutcome> {
  if (!t.configured)
    return { ok: false, reason: "backend_not_configured", message: "Backend not configured" };
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return { ok: false, reason: "offline", message: "Device offline" };
  const outbox = await getOutbox();
  try {
    const acks = await t.push(outbox);
    const db = getDB();
    await db.transaction("rw", db.encounters, async () => {
      for (const a of acks) {
        const r = await db.encounters.get(a.id);
        // Only mark synced if the record wasn't changed after being queued.
        if (r && r.reviewStatus === "verified" && r.syncStatus === "queued") {
          r.syncStatus = "synced";
          r.serverRevision = a.serverRevision;
          r.lastSyncedAt = a.acknowledgedAt;
          await db.encounters.put(r);
        }
      }
    });
    return { ok: true, acknowledged: acks.length };
  } catch (e) {
    return { ok: false, reason: "error", message: (e as Error).message };
  }
}

export async function lastSuccessfulSync(): Promise<string | null> {
  const recs = await getDB().encounters.filter((r) => r.lastSyncedAt !== null).toArray();
  return recs.map((r) => r.lastSyncedAt!).sort().at(-1) ?? null;
}
