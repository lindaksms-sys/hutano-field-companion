import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "sn";

// Shona strings are DRAFT and awaiting native-speaker validation.
const dict = {
  home: { en: "Home", sn: "Kumba" },
  encounters: { en: "Encounters", sn: "Zvakanyorwa" },
  sync: { en: "Sync", sn: "Kutumira" },
  settings: { en: "Settings", sn: "Zvirongwa" },
  newEncounter: { en: "New encounter", sn: "Kunyora kutsva" },
  online: { en: "Device online", sn: "Paindaneti" },
  offline: { en: "Offline", sn: "Hapana indaneti" },
  localOnly: { en: "Local only", sn: "Pafoni chete" },
  prototype: {
    en: "Prototype — synthetic demo data only. Do not enter real patient information.",
    sn: "Muedzo — data yekuedza chete. Musaisa ruzivo rwechokwadi rwevarwere.",
  },
} as const;
export type Key = keyof typeof dict;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({
  lang: "en",
  setLang: () => {},
  t: (k) => dict[k].en,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    // UI language preference only — never encounter data.
    const s = localStorage.getItem("hutano.uiLang");
    if (s === "sn" || s === "en") setLangState(s);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("hutano.uiLang", l);
    document.documentElement.lang = l;
  };
  return (
    <Ctx.Provider value={{ lang, setLang, t: (k) => dict[k][lang] }}>{children}</Ctx.Provider>
  );
}

export const useI18n = () => useContext(Ctx);
