import type { PostgrestError } from "@supabase/supabase-js";
import type { RevisionStore, StoreError } from "@/domain/sync";
import type { RevisionPayload } from "@/domain/types";
import { getSupabase } from "./supabase";

function classify(e: PostgrestError | Error | null, status?: number): StoreError {
  const msg = e?.message ?? "Unknown error";
  const code = (e as PostgrestError | null)?.code;
  if (code === "23505") return { kind: "duplicate", message: msg };
  if (status === 401 || code === "PGRST301" || code === "PGRST303" || /jwt/i.test(msg)) return { kind: "auth", message: msg };
  if (status === 0 || /fetch|network|failed to fetch|load failed/i.test(msg)) return { kind: "network", message: msg };
  return { kind: "other", message: msg };
}

const COLS = "id, owner_id, encounter_id, device_id, local_revision, schema_version, language, raw_narrative, fields, review_status, verified_at, client_updated_at, received_at, is_synthetic";

/** Insert-only; never upsert/update/delete (the table grants don't allow it either). */
export const supabaseStore: RevisionStore = {
  async insert(p: RevisionPayload) {
    try {
      const { data, error, status } = await getSupabase().from("encounter_revisions").insert(p).select("received_at").single();
      if (error) return { ok: false, error: classify(error, status) };
      return { ok: true, receivedAt: (data as { received_at: string }).received_at };
    } catch (e) {
      return { ok: false, error: classify(e as Error, 0) };
    }
  },
  async selectById(id: string) {
    try {
      const { data, error, status } = await getSupabase().from("encounter_revisions").select(COLS).eq("id", id).maybeSingle();
      if (error) return { ok: false, error: classify(error, status) };
      return { ok: true, row: data as (RevisionPayload & { received_at: string }) | null };
    } catch (e) {
      return { ok: false, error: classify(e as Error, 0) };
    }
  },
};
