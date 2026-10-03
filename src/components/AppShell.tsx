import { Link } from "@tanstack/react-router";
import { Home, List, RefreshCw, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useOnline } from "@/lib/hooks";
import { useI18n, type Key } from "@/lib/i18n";
import { backendConfig } from "@/domain/sync";
import { StatusPill } from "./StatusPill";

const NAV: { to: "/" | "/encounters" | "/sync" | "/settings"; key: Key; Icon: typeof Home }[] = [
  { to: "/", key: "home", Icon: Home },
  { to: "/encounters", key: "encounters", Icon: List },
  { to: "/sync", key: "sync", Icon: RefreshCw },
  { to: "/settings", key: "settings", Icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const online = useOnline();
  const backend = backendConfig().configured;
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link to="/" className="text-2xl font-bold tracking-tight text-primary">
            Hutano
          </Link>
          <nav className="ml-6 hidden gap-1 md:flex">
            {NAV.map(({ to, key }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
                activeProps={{ className: "bg-secondary text-secondary-foreground" }}
              >
                {t(key)}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <StatusPill tone={online ? "success" : "pending"}>
              {online ? t("online") : t("offline")}
              {!backend && ` · ${t("localOnly")}`}
            </StatusPill>
            <div className="flex overflow-hidden rounded-md border border-input" role="group" aria-label="Interface language">
              {(["en", "sn"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`min-h-10 px-3 text-sm font-bold ${lang === l ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="bg-pending px-4 py-1.5 text-center text-xs font-semibold text-pending-foreground">
          {t("prototype")}
        </p>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-card md:hidden">
        {NAV.map(({ to, key, Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted-foreground"
            activeProps={{ className: "text-primary bg-secondary" }}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {t(key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
