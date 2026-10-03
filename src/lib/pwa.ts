// Single guarded service-worker registration wrapper. Never registers in dev/preview/iframes.

export type OfflineState =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "disabled"; reason: string }
  | { kind: "installing" }
  | { kind: "ready"; pages: number; updateWaiting: boolean }
  | { kind: "failed"; message: string };

/** App-shell pages warmed into the page cache once the worker controls the page. No /auth, no data. */
export const SHELL_ROUTES = ["/", "/encounters", "/encounters/new", "/sync", "/settings"];
const PAGE_CACHE = "hutano-pages";

let state: OfflineState = { kind: "checking" };
const listeners = new Set<(s: OfflineState) => void>();
function set(s: OfflineState) {
  state = s;
  listeners.forEach((l) => l(s));
}
export const getOfflineState = () => state;
export function onOfflineState(l: (s: OfflineState) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function refusalReason(): string | null {
  if (!import.meta.env.PROD) return "Development build";
  if (window.self !== window.top) return "Running inside a preview frame";
  const h = location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return "Lovable preview";
  if (["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"].some((d) => h === d || h.endsWith(`.${d}`)))
    return "Lovable preview";
  if (new URLSearchParams(location.search).get("sw") === "off") return "Disabled with ?sw=off";
  return null;
}

async function warmShell(): Promise<number> {
  const cache = await caches.open(PAGE_CACHE);
  let ok = 0;
  await Promise.all(
    SHELL_ROUTES.map(async (path) => {
      try {
        const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
        if (res.ok && res.type === "basic") {
          await cache.put(new URL(path, location.origin).href, res);
          ok++;
        }
      } catch {
        /* offline: keep whatever is already cached */
      }
    }),
  );
  return ok || (await cache.keys()).length;
}

export async function registerAppServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("caches" in window)) return set({ kind: "unsupported" });
  const reason = refusalReason();
  if (reason) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter((r) => r.active?.scriptURL.endsWith("/sw.js")).map((r) => r.unregister()));
    return set({ kind: "disabled", reason });
  }
  try {
    set({ kind: "installing" });
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const markUpdate = () => {
      if (state.kind === "ready") set({ ...state, updateWaiting: !!reg.waiting });
    };
    reg.addEventListener("updatefound", () => reg.installing?.addEventListener("statechange", markUpdate));
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
        setTimeout(resolve, 5000);
      });
    }
    const pages = await warmShell();
    set({ kind: "ready", pages, updateWaiting: !!reg.waiting });
  } catch (e) {
    set({ kind: "failed", message: (e as Error).message || "Service worker registration failed" });
  }
}
