// Single guarded service-worker registration wrapper. Never registers in dev/preview/iframes.
function refused(): boolean {
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  const h = location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"].some((d) => h === d || h.endsWith(`.${d}`))) return true;
  if (new URLSearchParams(location.search).get("sw") === "off") return true;
  return false;
}

export async function registerAppServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (refused()) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.filter((r) => r.active?.scriptURL.endsWith("/sw.js")).map((r) => r.unregister()),
    );
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.warn("Service worker registration failed", e);
  }
}
