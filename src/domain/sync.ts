import { getDB, inFlight } from "./db";
import { writeAudit } from "./repository";
import { getCurrentUserId, getEpoch } from "./session";
import type { OutboxEntry, RevisionPayload } from "./types";

export type StoreError = { kind: "network" | "auth" | "duplicate" | "other"; message: string };
export type InsertResult = { ok: true; receivedAt: string } | { ok: false; error: StoreError };
export type SelectResult =
  | { ok: true; row: (RevisionPayload & { received_at: string }) | null }
  | { ok: false; error: StoreError };

/** Append-only remote store. Implemented for Supabase in src/lib/supabase-store.ts. */
export interface RevisionStore {
  insert(p: RevisionPayload): Promise<InsertResult>;
  selectById(id: string): Promise<SelectResult>;
}

export function pendingOutbox(uid: string | null) {
  if (!uid) return Promise.resolve([] as OutboxEntry[]);
  return getDB().outbox.where("ownerId").equals(uid).filter((e) => e.status === "pending").toArray();
}

/** Canonical JSON (sorted keys) for payload comparison against jsonb round-trips. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
const sameTime = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

export function samePayload(local: RevisionPayload, remote: RevisionPayload): boolean {
  return (
    local.id === remote.id &&
    local.owner_id === remote.owner_id &&
    local.encounter_id === remote.encounter_id &&
    local.device_id === remote.device_id &&
    local.local_revision === remote.local_revision &&
    local.language === remote.language &&
    local.raw_narrative === remote.raw_narrative &&
    remote.review_status === "verified" &&
    remote.is_synthetic === true &&
    canon(local.fields) === canon(remote.fields) &&
    sameTime(local.verified_at, remote.verified_at) &&
    sameTime(local.client_updated_at, remote.client_updated_at)
  );
}

export type DrainOutcome =
  | { status: "busy" }
  | { status: "not_signed_in" }
  | { status: "offline"; sent: number; remaining: number }
  | { status: "auth_paused"; sent: number; remaining: number; message: string }
  | { status: "account_changed"; sent: number }
  | { status: "done"; sent: number; rejected: number; remaining: number; lastError: string | null };

let draining = false;
export const isDraining = () => draining;

/** Acknowledge one entry — only if the same account is still active (epoch unchanged). */
async function acknowledge(entry: OutboxEntry, receivedAt: string, uid: string, epoch: number) {
  const db = getDB();
  return db.transaction("rw", db.encounters, db.outbox, db.audit, async () => {
    if (getEpoch() !== epoch || getCurrentUserId() !== uid) return false;
    const e = await db.outbox.get(entry.revisionId);
    if (e) {
      e.status = "acked";
      e.ackedAt = receivedAt;
      e.lastError = null;
      await db.outbox.put(e);
    }
    const r = await db.encounters.get(entry.encounterId);
    // Only the exact acknowledged revision becomes synced; later edits stay pending.
    if (r && r.ownerId === uid && r.localRevision === entry.localRevision && r.reviewStatus === "verified") {
      r.syncStatus = "synced";
      r.serverRevision = entry.localRevision;
      r.lastSyncedAt = receivedAt;
      await db.encounters.put(r);
    }
    await writeAudit(db, { encounterId: entry.encounterId, ownerId: uid, action: "synced", fromRevision: entry.localRevision, toRevision: entry.localRevision });
    return true;
  });
}

async function noteFailure(entry: OutboxEntry, msg: string, uid: string, epoch: number, reject = false) {
  const db = getDB();
  await db.transaction("rw", db.outbox, async () => {
    if (getEpoch() !== epoch || getCurrentUserId() !== uid) return;
    const e = await db.outbox.get(entry.revisionId);
    if (!e) return;
    e.attempts += 1;
    e.lastError = msg;
    if (reject) e.status = "rejected";
    await db.outbox.put(e);
  });
}

/** Single-flight drain of the signed-in account's outbox. App must be open; no background sync. */
export async function drainOutbox(store: RevisionStore, isOnline: () => boolean = () => (typeof navigator === "undefined" ? true : navigator.onLine)): Promise<DrainOutcome> {
  if (draining) return { status: "busy" };
  const uid = getCurrentUserId();
  if (!uid) return { status: "not_signed_in" };
  draining = true;
  const epoch = getEpoch();
  let sent = 0;
  let rejected = 0;
  let lastError: string | null = null;
  try {
    const entries = await pendingOutbox(uid);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      if (getEpoch() !== epoch) return { status: "account_changed", sent };
      if (!isOnline()) return { status: "offline", sent, remaining: entries.length - i };
      inFlight.add(entry.revisionId);
      try {
        const res = await store.insert(entry.payload); // same id + payload on every retry
        if (getEpoch() !== epoch) return { status: "account_changed", sent };
        let receivedAt: string | null = null;
        if (res.ok) receivedAt = res.receivedAt;
        else if (res.error.kind === "duplicate") {
          const sel = await store.selectById(entry.revisionId);
          if (getEpoch() !== epoch) return { status: "account_changed", sent };
          if (sel.ok && sel.row && samePayload(entry.payload, sel.row)) receivedAt = sel.row.received_at;
          else if (sel.ok) {
            lastError = sel.row ? "Server copy differs from local snapshot" : "Conflicting revision already on server";
            await noteFailure(entry, lastError, uid, epoch, true);
            rejected++;
            continue;
          } else {
            lastError = sel.error.message;
            if (sel.error.kind === "network") return { status: "offline", sent, remaining: entries.length - i };
            if (sel.error.kind === "auth") return { status: "auth_paused", sent, remaining: entries.length - i, message: sel.error.message };
            await noteFailure(entry, lastError, uid, epoch);
            continue;
          }
        } else {
          lastError = res.error.message;
          await noteFailure(entry, lastError, uid, epoch);
          if (res.error.kind === "network") return { status: "offline", sent, remaining: entries.length - i };
          if (res.error.kind === "auth") return { status: "auth_paused", sent, remaining: entries.length - i, message: res.error.message };
          continue;
        }
        if (await acknowledge(entry, receivedAt, uid, epoch)) sent++;
        else return { status: "account_changed", sent };
      } finally {
        inFlight.delete(entry.revisionId);
      }
    }
    const remaining = (await pendingOutbox(uid)).length;
    return { status: "done", sent, rejected, remaining, lastError };
  } finally {
    draining = false;
  }
}

export async function lastSuccessfulSync(uid: string | null): Promise<string | null> {
  if (!uid) return null;
  const acked = await getDB().outbox.where("ownerId").equals(uid).filter((e) => e.status === "acked").toArray();
  return acked.map((e) => e.ackedAt!).sort().at(-1) ?? null;
}
