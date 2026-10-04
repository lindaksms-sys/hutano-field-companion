import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Home-screen install card. Uses the browser's install prompt when offered; otherwise shows iPhone steps. */
export function InstallApp() {
  const { tl } = useI18n();
  const [evt, setEvt] = useState<PromptEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as PromptEvent); };
    const onInstalled = () => { setEvt(null); setStandalone(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (standalone || window.self !== window.top || (!evt && !ios)) return null;
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <p className="flex-1 text-sm font-semibold">
        {ios ? tl("Install Hutano: tap Share, then Add to Home Screen.") : tl("Install Hutano on this phone to open it like an app, also offline.")}
      </p>
      {evt && (
        <Button className="h-12" onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}>
          {tl("Install app")}
        </Button>
      )}
    </section>
  );
}
