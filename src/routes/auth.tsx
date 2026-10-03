import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Account — Hutano" },
      { name: "description", content: "Sign in to sync verified synthetic records. Optional for offline capture." },
      { property: "og:title", content: "Account — Hutano" },
      { property: "og:description", content: "Optional account for cloud sync of verified synthetic records." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, ready, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  if (!ready) return <p className="text-muted-foreground">Checking account…</p>;

  if (user)
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Account</h1>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="font-bold break-all">{user.email}</p>
        </div>
        <Button size="lg" variant="outline" className="h-12 w-full" onClick={signOut}>Sign out</Button>
        <p className="text-xs text-muted-foreground">Signing out hides this account's records on this device. They stay stored locally until cleared.</p>
        <Link to="/sync" className="block text-center font-semibold text-primary underline">Go to Sync</Link>
      </div>
    );

  if (confirmFor)
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Confirm your email</h1>
        <p className="rounded-xl border border-pending-border bg-pending/50 p-4 text-sm">
          Account created for <b className="break-all">{confirmFor}</b>. Open the confirmation link sent to that address, then sign in here. You can keep capturing offline meanwhile.
        </p>
        <Button variant="outline" className="h-12 w-full" onClick={() => { setConfirmFor(null); setMode("in"); }}>Back to sign in</Button>
      </div>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "in") await signIn(email.trim(), password);
      else {
        const r = await signUp(email.trim(), password);
        if (r.needsConfirmation) setConfirmFor(email.trim());
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{mode === "in" ? "Sign in" : "Create account"}</h1>
      <p className="text-sm text-muted-foreground">Optional. Needed only for cloud sync of verified synthetic records. Offline capture works without an account.</p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1 text-sm font-bold">
          Email
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 bg-card text-base" />
        </label>
        <label className="block space-y-1 text-sm font-bold">
          Password
          <Input type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 bg-card text-base" />
        </label>
        {err && <p role="alert" className="text-sm font-semibold text-destructive">{err}</p>}
        <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <button className="min-h-11 w-full text-sm font-semibold text-primary underline" onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); }}>
        {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
