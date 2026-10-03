export const SCHEMA_VERSION = 1 as const;

export const FIELD_KEYS = [
  "patientCode",
  "age",
  "location",
  "encounterDate",
  "concern",
  "duration",
  "observations",
  "followUp",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export type InputLanguage = "sn" | "en" | "mixed";

/**
 * empty        – no value, nothing suggested
 * pending      – extraction suggested a value; worker has not acted
 * accepted     – worker accepted the suggestion unchanged
 * edited       – worker typed/changed the value
 * not_recorded – worker explicitly acknowledged the information was not recorded
 */
export type FieldState = "empty" | "pending" | "accepted" | "edited" | "not_recorded";

export interface FieldValue {
  value: string | null;
  /** Exact substring of rawNarrative supporting the suggestion, or null. */
  source: string | null;
  state: FieldState;
  origin: "extraction" | "worker" | null;
  /** Original suggested value, kept so worker corrections are auditable. */
  suggestedValue: string | null;
  notRecordedReason: string | null;
}

export type ReviewStatus = "draft" | "in_review" | "verified";
/** local_only: never queued. queued: verified & waiting for a backend. synced: server acknowledged. */
export type SyncStatus = "local_only" | "queued" | "synced";

export interface ExtractionMeta {
  adapterId: string;
  adapterLabel: string;
  isAI: boolean;
  ranAt: string;
  matchedFixtureId: string | null;
}

export interface EncounterRecord {
  id: string;
  schemaVersion: typeof SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
  rawNarrative: string;
  inputLanguage: InputLanguage;
  isSynthetic: boolean;
  /** Supabase auth user id, or null for an unowned local demo record. */
  ownerId: string | null;
  fields: Record<FieldKey, FieldValue>;
  extraction: ExtractionMeta | null;
  reviewStatus: ReviewStatus;
  syncStatus: SyncStatus;
  localRevision: number;
  serverRevision: number | null;
  verifiedAt: string | null;
  /** serverRevision = the local revision the server acknowledged. Only ever set from a real server acknowledgement. */
  lastSyncedAt: string | null;
}

export function emptyField(): FieldValue {
  return {
    value: null,
    source: null,
    state: "empty",
    origin: null,
    suggestedValue: null,
    notRecordedReason: null,
  };
}

export function emptyFields(): Record<FieldKey, FieldValue> {
  return Object.fromEntries(FIELD_KEYS.map((k) => [k, emptyField()])) as Record<
    FieldKey,
    FieldValue
  >;
}

/** Immutable snapshot payload, created once when a record is verified (or adopted). */
export interface RevisionPayload {
  id: string;
  owner_id: string;
  encounter_id: string;
  device_id: string;
  local_revision: number;
  schema_version: 1;
  language: InputLanguage;
  raw_narrative: string;
  fields: Record<FieldKey, FieldValue>;
  review_status: "verified";
  verified_at: string;
  client_updated_at: string;
  is_synthetic: true;
}

export interface OutboxEntry {
  revisionId: string;
  ownerId: string;
  encounterId: string;
  localRevision: number;
  payload: RevisionPayload;
  status: "pending" | "acked" | "rejected";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  ackedAt: string | null;
}
