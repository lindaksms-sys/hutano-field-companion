import type { FieldKey, FieldState, ReviewStatus, SyncStatus } from "@/domain/types";

export const FIELD_LABELS: Record<FieldKey, string> = {
  patientCode: "Patient code",
  age: "Age (with units if stated)",
  location: "Village / ward",
  encounterDate: "Encounter date",
  concern: "Reported concern",
  duration: "Stated duration",
  observations: "Worker-recorded observations",
  followUp: "Follow-up notes (worker-entered)",
};

export const STATE_LABELS: Record<FieldState, string> = {
  empty: "Empty",
  pending: "Suggestion pending",
  accepted: "Accepted",
  edited: "Edited by worker",
  not_recorded: "Not recorded",
};

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  draft: "Draft",
  in_review: "Needs review",
  verified: "Verified",
};

export const SYNC_LABELS: Record<SyncStatus, string> = {
  local_only: "On this device only",
  queued: "Queued — waiting for backend",
  synced: "Synced",
};

export const LANG_LABELS = { sn: "Shona", en: "English", mixed: "Mixed" } as const;
