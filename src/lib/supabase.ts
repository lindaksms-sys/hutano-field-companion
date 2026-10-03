import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public frontend configuration for the external Hutano Supabase project (not secrets).
const DEFAULT_URL = "https://cqggulderafbyvzjvobr.supabase.co";
const DEFAULT_KEY = "sb_publishable_fow49kw5SGDHWvCslji-eg_UpBdrZTb";

export function supabaseConfig() {
  const url = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) || DEFAULT_URL;
  const key = (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) || DEFAULT_KEY;
  return { url, key, configured: Boolean(url && key) };
}

let client: SupabaseClient | null = null;
/** Browser-only. Auth session persisted by supabase-js in localStorage (standard convention); no encounter data goes there. */
export function getSupabase(): SupabaseClient {
  if (typeof window === "undefined") throw new Error("Supabase client is browser-only");
  if (!client) {
    const { url, key } = supabaseConfig();
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
