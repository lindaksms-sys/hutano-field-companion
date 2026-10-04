import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "sn";

// Shona strings: round-1 terms are a USER-SUPPLIED PROPOSAL (not clinician validated, not certified);
// the rest remain unvalidated drafts. See docs/shona-review-round1.md.
const dict = {
  home: { en: "Home", sn: "Kumusha" },
  encounters: { en: "Encounters", sn: "Zvakanyorwa" },
  sync: { en: "Sync", sn: "Kutumira" },
  settings: { en: "Settings", sn: "Zvirongwa" },
  newEncounter: { en: "New encounter", sn: "Nyora kushanya kutsva" },
  online: { en: "Device online", sn: "Paindaneti" },
  offline: { en: "Offline", sn: "Hapana interneti" },
  localOnly: { en: "Local only", sn: "Pamudziyo uyu chete" },
  prototype: {
    en: "Prototype — synthetic demo data only. Do not enter real patient information.",
    sn: "Ichi chigadzirwa chekuyedza chinoshandisa data rekufungidzira chete. Musaisa ruzivo rwechokwadi rwevarwere.",
  },
} as const;
export type Key = keyof typeof dict;

/**
 * Round-1 ADOPTED terms only, keyed by the exact English UI text (user-supplied proposal, not clinician validated).
 * Provisional terms (age, ward, duration, follow-up, loading, sign in/out) deliberately stay English.
 * Class-5 agreement (ra-/ri-) assumes the subject is the record (gwaro) or suggestion (zano); only used there.
 */
const SN_TERMS: Record<string, string> = {
  "Patient code": "Kodhi yemurwere",
  "Encounter date": "Zuva rekushanya",
  "Reported concern": "Dambudziko rataurwa",
  "Worker-recorded observations": "Zvakaonekwa kana kuyerwa nemushandi wehutano",
  Empty: "Hapana chakanyorwa",
  "Suggestion pending": "Zano richiri kumirira kuongororwa",
  Accepted: "Ragamuchirwa",
  "Edited by worker": "Ragadziridzwa nemushandi",
  "Not recorded": "Hazvina kunyorwa",
  Draft: "Gwaro risati rapera",
  "Needs review": "Rinoda kuongororwa",
  Verified: "Rasimbiswa",
  "Save changes": "Chengetedza shanduko",
  Cancel: "Kanzura",
  Delete: "Dzima",
  "Go home": "Enda kumusha",
  "Try again": "Edzazve",
};
export const SN_TERM_KEYS = Object.keys(SN_TERMS);


const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string; tl: (en: string) => string }>({
  lang: "en",
  setLang: () => {},
  t: (k) => dict[k].en,
  tl: (en) => en,
});

/** Shona for an adopted English UI term, else the English text unchanged. */
export const translateTerm = (lang: Lang, en: string) => (lang === "sn" ? (SN_TERMS[en] ?? en) : en);

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
    <Ctx.Provider value={{ lang, setLang, t: (k) => dict[k][lang], tl: (en) => translateTerm(lang, en) }}>{children}</Ctx.Provider>
  );
}

export const useI18n = () => useContext(Ctx);
