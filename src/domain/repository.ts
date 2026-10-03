import { getDB, getDeviceId, inFlight, type HutanoDB } from "./db";
import type { ExtractionResult } from "./extraction";
import { getCurrentUserId, getEpoch } from "./session";
import {
  emptyFields,
  FIELD_KEYS,
  SCHEMA_VERSION,
  type EncounterRecord,
  type FieldKey,
  type FieldValue,
  type InputLanguage,
  type OutboxEntry,
} from "./types";

const now = () => new Date().toISOString();

/** Records visible to an account: its own plus unowned local demo records. */
export const visibleTo = (r: EncounterRecord, uid: string | null) =>
  r.ownerId === null || r.ownerId === uid;

export async function createDraft(input: {
  rawNarrative: string;
  inputLanguage: InputLanguage;
  isSynthetic: boolean;
  ownerId?: string | null;
}): Promise<EncounterRecord> {
  const t = now();
  const rec: EncounterRecord = {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    createdAt: t,
    updatedAt: t,
    rawNarrative: input.rawNarrative,
    inputLanguage: input.inputLanguage,
    isSynthetic: input.isSynthetic,
    ownerId: input.ownerId === undefined ? getCurrentUserId() : input.ownerId,
    fields: emptyFields(),
    extraction: null,
    reviewStatus: "draft",
    syncStatus: "local_only",
    localRevision: 1,
    serverRevision: null,
    verifiedAt: null,
    lastSyncedAt: null,
  };
  await getDB().encounters.add(rec); // throws on failure; caller must surface it
  return rec;
}

/** Returns the record only if visible to the current account. */
export async function getEncounter(id: string, uid: string | null = getCurrentUserId()) {
  const r = await getDB().encounters.get(id);
  return r && visibleTo(r, uid) ? r : undefined;
}

export async function listEncounters(uid: string | null = getCurrentUserId()) {
  const all = await getDB().encounters.orderBy("updatedAt").reverse().toArray();
  return all.filter((r) => visibleTo(r, uid));
}

async function enqueueSnapshot(db: HutanoDB, r: EncounterRecord) {
  if (!r.ownerId || r.reviewStatus !== "verified" || !r.verifiedAt || !r.isSynthetic) return;
  if (!r.rawNarrative.trim()) return;
  const deviceId = await getDeviceId(db);
  const revisionId = crypto.randomUUID(); // generated once, persisted in this transaction
  const entry: OutboxEntry = {
    revisionId,
    ownerId: r.ownerId,
    encounterId: r.id,
    localRevision: r.localRevision,
    payload: {
      id: revisionId,
      owner_id: r.ownerId,
      encounter_id: r.id,
      device_id: deviceId,
      local_revision: r.localRevision,
      schema_version: 1,
      language: r.inputLanguage,
      raw_narrative: r.rawNarrative,
      fields: structuredClone(r.fields),
      review_status: "verified",
      verified_at: r.verifiedAt,
      client_updated_at: r.updatedAt,
      is_synthetic: true,
    },
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt: now(),
    ackedAt: null,
  };
  await db.outbox.add(entry);
}

/** All mutations go through here: bumps revision and invalidates verification. */
async function mutate(
  id: string,
  fn: (r: EncounterRecord) => void,
  opts: { keepVerification?: boolean; afterWrite?: (db: HutanoDB, r: EncounterRecord) => Promise<void> } = {},
): Promise<EncounterRecord> {
  const db = getDB();
  return db.transaction("rw", db.encounters, db.outbox, db.meta, async () => {
    const r = await db.encounters.get(id);
    if (!r || !visibleTo(r, getCurrentUserId())) throw new Error("Record not found");
    fn(r);
    if (!opts.keepVerification) {
      if (r.reviewStatus === "verified") {
        r.reviewStatus = "in_review";
        r.verifiedAt = null;
        r.syncStatus = "local_only";
      }
      // Drop not-yet-sent snapshots of older revisions; in-flight ones finish but won't mark this revision synced.
      const stale = await db.outbox.where("encounterId").equals(id).filter((e) => e.status === "pending" && !inFlight.has(e.revisionId)).primaryKeys();
      await db.outbox.bulkDelete(stale);
    }
    r.localRevision += 1;
    r.updatedAt = now();
    await db.encounters.put(r);
    if (opts.afterWrite) await opts.afterWrite(db, r);
    return r;
  });
}

/** Guards for slow (AI) extraction: a result is applied only to the exact revision/account it was computed for. */
export interface ExtractionGuard {
  localRevision: number;
  ownerId: string | null;
  epoch: number;
}
export const guardFor = (r: EncounterRecord): ExtractionGuard => ({ localRevision: r.localRevision, ownerId: r.ownerId, epoch: getEpoch() });

function checkGuard(r: EncounterRecord, g?: ExtractionGuard) {
  if (!g) return;
  if (getEpoch() !== g.epoch || r.ownerId !== g.ownerId) throw new Error("Stale extraction: account changed; result discarded.");
  if (r.localRevision !== g.localRevision) throw new Error("Stale extraction: record changed while extraction ran; result discarded.");
}

/** Record a failed/cancelled extraction on the saved draft (fields untouched). */
export function recordExtractionFailure(id: string, meta: { adapterId: string; adapterLabel: string; isAI: boolean; failure: string; ai?: ExtractionResult["ai"] }, guard?: ExtractionGuard) {
  return mutate(id, (r) => {
    checkGuard(r, guard);
    r.extraction = { adapterId: meta.adapterId, adapterLabel: meta.adapterLabel, isAI: meta.isAI, ranAt: now(), matchedFixtureId: null, ...(meta.ai ?? {}), failure: meta.failure };
  });
}

export function applyExtraction(id: string, result: ExtractionResult, guard?: ExtractionGuard) {
  return mutate(id, (r) => {
    checkGuard(r, guard);
    for (const k of FIELD_KEYS) {
      const s = result.suggestions[k];
      if (!s || r.fields[k].origin === "worker") continue;
      if (!r.rawNarrative.includes(s.source)) continue;
      r.fields[k] = { value: s.value, source: s.source, state: "pending", origin: "extraction", suggestedValue: s.value, notRecordedReason: null };
    }
    r.extraction = { adapterId: result.adapterId, adapterLabel: result.adapterLabel, isAI: result.isAI, ranAt: now(), matchedFixtureId: result.matchedFixtureId, ...(result.ai ?? {}), failure: null };
    if (r.reviewStatus === "draft") r.reviewStatus = "in_review";
  });
}

export function saveFields(id: string, fields: Record<FieldKey, FieldValue>, rawNarrative?: string) {
  return mutate(id, (r) => {
    r.fields = fields;
    if (rawNarrative !== undefined) r.rawNarrative = rawNarrative;
    if (r.reviewStatus === "draft") r.reviewStatus = "in_review";
  });
}

export function missingFields(fields: Record<FieldKey, FieldValue>): FieldKey[] {
  return FIELD_KEYS.filter((k) => {
    const f = fields[k];
    return f.state !== "not_recorded" && (f.value === null || f.value.trim() === "");
  });
}

export function verificationBlockers(fields: Record<FieldKey, FieldValue>) {
  const pending = FIELD_KEYS.filter((k) => fields[k].state === "pending");
  const missing = missingFields(fields);
  const noReason = FIELD_KEYS.filter((k) => fields[k].state === "not_recorded" && !fields[k].notRecordedReason?.trim());
  return { pending, missing, noReason, ok: !pending.length && !missing.length && !noReason.length };
}

export function verify(id: string, confirmed: boolean) {
  if (!confirmed) return Promise.reject(new Error("Human verification not confirmed"));
  return mutate(
    id,
    (r) => {
      if (!verificationBlockers(r.fields).ok) throw new Error("Record has unresolved fields");
      r.reviewStatus = "verified";
      r.verifiedAt = now();
      r.syncStatus = "queued";
    },
    { keepVerification: true, afterWrite: enqueueSnapshot },
  );
}

/** Explicitly attach an unowned demo record to the signed-in account. Never moves records between accounts. */
export async function adoptRecord(id: string, uid: string) {
  if (!uid || getCurrentUserId() !== uid) throw new Error("Sign in to adopt records");
  const db = getDB();
  return db.transaction("rw", db.encounters, db.outbox, db.meta, async () => {
    const r = await db.encounters.get(id);
    if (!r) throw new Error("Record not found");
    if (r.ownerId !== null) throw new Error("Record already belongs to an account");
    r.ownerId = uid;
    r.updatedAt = now();
    await db.encounters.put(r);
    await enqueueSnapshot(db, r);
    return r;
  });
}

export async function exportDemoRecords(): Promise<string> {
  const recs = (await listEncounters()).filter((r) => r.isSynthetic);
  return JSON.stringify({ app: "hutano", schemaVersion: SCHEMA_VERSION, exportedAt: now(), synthetic: true, records: recs }, null, 2);
}

/** Clears synthetic records visible to the current account (its own + unowned) and their outbox rows. */
export async function clearDemoData() {
  const db = getDB();
  return db.transaction("rw", db.encounters, db.outbox, async () => {
    const uid = getCurrentUserId();
    const ids = (await db.encounters.toArray()).filter((r) => r.isSynthetic && visibleTo(r, uid)).map((r) => r.id);
    await db.outbox.where("encounterId").anyOf(ids).delete();
    await db.encounters.bulkDelete(ids);
    return ids.length;
  });
}
