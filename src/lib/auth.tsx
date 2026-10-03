import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setCurrentUser } from "@/domain/session";
import { getSupabase } from "./supabase";
import { runSyncNow } from "./sync-runner";

interface AuthState {
  ready: boolean;
  user: User | null;
  signIn(email: string, password: string): Promise<void>;
  /** Returns true when the account needs email confirmation before sign-in. */
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    const apply = (u: User | null) => {
      setCurrentUser(u?.id ?? null); // bumps epoch: in-flight sync can't touch the new account's state
      setUser(u);
    };
    sb.auth.getSession().then(({ data }) => {
      apply(data.session?.user ?? null);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      apply(session?.user ?? null);
      if (event === "SIGNED_IN" && session) void runSyncNow(); // resume auth-paused queue
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    ready,
    user,
    async signIn(email, password) {
      const { error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUp(email, password) {
      const { data, error } = await getSupabase().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
      return { needsConfirmation: !data.session };
    },
    async signOut() {
      setCurrentUser(null); // detach local state first
      setUser(null);
      await getSupabase().auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
