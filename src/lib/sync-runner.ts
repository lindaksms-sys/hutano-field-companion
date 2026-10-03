import { drainOutbox, type DrainOutcome } from "@/domain/sync";
import { supabaseStore } from "./supabase-store";

type Listener = (o: DrainOutcome | null) => void;
const listeners = new Set<Listener>();
let last: DrainOutcome | null = null;

export const lastOutcome = () => last;
export function onSyncChange(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Foreground-only sync (manual button, `online` event, sign-in). App must be open. */
export async function runSyncNow(): Promise<DrainOutcome> {
  listeners.forEach((l) => l(null)); // "running"
  const o = await drainOutbox(supabaseStore);
  if (o.status !== "busy") last = o;
  listeners.forEach((l) => l(o));
  return o;
}
