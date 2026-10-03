import { getDB } from "./db";
import type { ExtractionResult } from "./extraction";
import {
  emptyFields,
  FIELD_KEYS,
  SCHEMA_VERSION,
  type EncounterRecord,
  type FieldKey,
  type FieldValue,
  type InputLanguage,
} from "./types";

const now = () => new Date().toISOString();

export async function createDraft(input: {
  rawNarrative: string;
  inputLanguage: InputLanguage;
  isSynthetic: boolean;
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

export const getEncounter = (id: string) => getDB().encounters.get(id);

export const listEncounters = () => getDB().encounters.orderBy("updatedAt").reverse().toArray();

/** All mutations go through here: bumps revision and invalidates verification. */
async function mutate(
  id: string,
  fn: (r: EncounterRecord) => void,
  opts: { keepVerification?: boolean } = {},
): Promise<EncounterRecord> {
  const db = getDB();
  return db.transaction("rw", db.encounters, async () => {
    const r = await db.encounters.get(id);
    if (!r) throw new Error("Record not found");
    fn(r);
    if (!opts.keepVerification && r.reviewStatus === "verified") {
      r.reviewStatus = "in_review";
      r.verifiedAt = null;
      r.syncStatus = "local_only";
    }
    r.localRevision += 1;
    r.updatedAt = now();
    await db.encounters.put(r);
    return r;
  });
}

export function applyExtraction(id: string, result: ExtractionResult) {
  return mutate(id, (r) => {
    for (const k of FIELD_KEYS) {
      const s = result.suggestions[k];
      // Never overwrite worker-entered data; source must exist verbatim.
      if (!s || r.fields[k].origin === "worker") continue;
      if (!r.rawNarrative.includes(s.source)) continue;
      r.fields[k] = {
        value: s.value,
        source: s.source,
        state: "pending",
        origin: "extraction",
        suggestedValue: s.value,
        notRecordedReason: null,
      };
    }
    r.extraction = {
      adapterId: result.adapterId,
      adapterLabel: result.adapterLabel,
      isAI: result.isAI,
      ranAt: now(),
      matchedFixtureId: result.matchedFixtureId,
    };
    if (r.reviewStatus === "draft") r.reviewStatus = "in_review";
  });
}

export function saveFields(
  id: string,
  fields: Record<FieldKey, FieldValue>,
  rawNarrative?: string,
) {
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
  const noReason = FIELD_KEYS.filter(
    (k) => fields[k].state === "not_recorded" && !fields[k].notRecordedReason?.trim(),
  );
  return { pending, missing, noReason, ok: !pending.length && !missing.length && !noReason.length };
}

export function verify(id: string, confirmed: boolean) {
  if (!confirmed) return Promise.reject(new Error("Human verification not confirmed"));
  return mutate(
    id,
    (r) => {
      const b = verificationBlockers(r.fields);
      if (!b.ok) throw new Error("Record has unresolved fields");
      r.reviewStatus = "verified";
      r.verifiedAt = now();
      r.syncStatus = "queued";
    },
    { keepVerification: true },
  );
}

export const deleteEncounter = (id: string) => getDB().encounters.delete(id);

export async function exportDemoRecords(): Promise<string> {
  const recs = await getDB().encounters.filter((r) => r.isSynthetic).toArray();
  return JSON.stringify(
    { app: "hutano", schemaVersion: SCHEMA_VERSION, exportedAt: now(), synthetic: true, records: recs },
    null,
    2,
  );
}

export const clearDemoData = () =>
  getDB().encounters.filter((r) => r.isSynthetic).delete();
