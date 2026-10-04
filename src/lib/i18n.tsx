import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SN_STRINGS } from "./sn-strings.gen";

export type Lang = "en" | "sn";

// Shona text is a USER-SUPPLIED PROPOSAL (not clinician validated). Source: docs/shona-review-overlay.csv
// -> docs/shona-translation.csv -> src/lib/sn-strings.gen.ts (scripts/shona-ui-strings.py).
// `sn` here is the legacy draft column for the inventory only; the UI uses SN_STRINGS.
const dict = {
  home: { en: "Home", sn: "Kumusha" },
  encounters: { en: "Encounters", sn: "Zvakanyorwa" },
  sync: { en: "Sync", sn: "Kutumira" },
  settings: { en: "Settings", sn: "Zvirongwa" },
  newEncounter: { en: "New encounter", sn: "Nyora kushanya kutsva" },
  online: { en: "Device online", sn: "Paindaneti" },
  offline: { en: "Offline", sn: "Hapana interneti" },
  localOnly: { en: "Local only", sn: "Pamudziyo uyu chete" },
  prototype: { en: "Prototype — synthetic demo data only. Do not enter real patient information.", sn: "Ichi chigadzirwa chekuyedza chinoshandisa data rekufungidzira chete. Musaisa ruzivo rwechokwadi rwevarwere." },
} as const;
export type Key = keyof typeof dict;

export const SN_TERM_KEYS = Object.keys(SN_STRINGS);

/** Shona for an English UI string, else the English text unchanged. */
export const translateTerm = (lang: Lang, en: string) => (lang === "sn" ? (SN_STRINGS[en] ?? en) : en);

/** Translate a template with {named} placeholders, then fill values (values are never translated). */
export const translateTemplate = (lang: Lang, en: string, vars: Record<string, string | number> = {}) =>
  translateTerm(lang, en).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Key) => string;
  tl: (en: string) => string;
  tf: (en: string, vars?: Record<string, string | number>) => string;
};
const Ctx = createContext<Ctx>({
  lang: "en",
  setLang: () => {},
  t: (k) => dict[k].en,
  tl: (en) => en,
  tf: (en, v) => translateTemplate("en", en, v),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    // UI language preference only — never encounter data.
    const s = localStorage.getItem("hutano.uiLang");
    if (s === "sn" || s === "en") {
      setLangState(s);
      document.documentElement.lang = s;
    }
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("hutano.uiLang", l);
    document.documentElement.lang = l;
  };
  const tl = (en: string) => translateTerm(lang, en);
  return (
    <Ctx.Provider value={{ lang, setLang, t: (k) => tl(dict[k].en), tl, tf: (en, v) => translateTemplate(lang, en, v) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useI18n = () => useContext(Ctx);
