import type { FieldKey, InputLanguage } from "./types";

/**
 * SYNTHETIC DEMO FIXTURES — fictional people, codes and places. No real patient data.
 * Shona text is draft, written for demonstration and awaiting native-speaker validation.
 * Each mapping value is an EXACT substring of the narrative (no translation, no inference).
 */
export interface Fixture {
  id: string;
  title: string;
  language: InputLanguage;
  narrative: string;
  mappings: Partial<Record<FieldKey, string>>;
}

export const FIXTURES: Fixture[] = [
  {
    id: "syn-en-1",
    title: "English example",
    language: "en",
    narrative:
      "SYNTHETIC DEMO. Patient SYN-0107, 34 years, Mukore village, Ward 5. Reports headache for 2 days. Denies vomiting. I recorded temperature 37.8 C. Follow-up visit planned for Friday.",
    mappings: {
      patientCode: "SYN-0107",
      age: "34 years",
      location: "Mukore village, Ward 5",
      concern: "Reports headache for 2 days. Denies vomiting.",
      duration: "2 days",
      observations: "I recorded temperature 37.8 C.",
      followUp: "Follow-up visit planned for Friday.",
    },
  },
  {
    id: "syn-sn-1",
    title: "Shona example",
    language: "sn",
    narrative:
      "SYNTHETIC DEMO. Murwere SYN-0042, ane makore 6, kuChikomo, Ward 12. Amai vanoti mwana ane chikosoro kwemazuva matatu. Hapana fivha. Ndaona mwana achifema zvakanaka.",
    mappings: {
      patientCode: "SYN-0042",
      age: "makore 6",
      location: "kuChikomo, Ward 12",
      concern: "mwana ane chikosoro kwemazuva matatu. Hapana fivha.",
      duration: "kwemazuva matatu",
      observations: "Ndaona mwana achifema zvakanaka.",
    },
  },
  {
    id: "syn-mx-1",
    title: "Mixed Shona/English example",
    language: "mixed",
    narrative:
      "SYNTHETIC DEMO. SYN-0215, makore 52, Ward 3. Akati ane dizziness kwemavhiki maviri. No chest pain. BP not measured, no cuff available.",
    mappings: {
      patientCode: "SYN-0215",
      age: "makore 52",
      location: "Ward 3",
      concern: "ane dizziness kwemavhiki maviri. No chest pain.",
      duration: "kwemavhiki maviri",
      observations: "BP not measured, no cuff available.",
    },
  },
];

export function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
