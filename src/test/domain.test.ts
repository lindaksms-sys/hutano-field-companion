import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { HutanoDB, setDB } from "@/domain/db";
import { demoAdapter } from "@/domain/extraction";
import { FIXTURES } from "@/domain/fixtures";
import {
  applyExtraction,
  createDraft,
  getEncounter,
  missingFields,
  saveFields,
  verificationBlockers,
  verify,
} from "@/domain/repository";
import { setCurrentUser } from "@/domain/session";
import { FIELD_KEYS } from "@/domain/types";

let n = 0;
beforeEach(() => {
  setDB(new HutanoDB(`test-${n++}`));
  setCurrentUser(null);
});

async function verifiedRecord() {
  const rec = await createDraft({ rawNarrative: "free text", inputLanguage: "en", isSynthetic: true });
  const fields = structuredClone(rec.fields);
  for (const k of FIELD_KEYS) {
    fields[k] = { ...fields[k], state: "not_recorded", notRecordedReason: "Not stated" };
  }
  fields.concern = { ...fields.concern, value: "x", state: "edited", origin: "worker", notRecordedReason: null };
  await saveFields(rec.id, fields);
  return verify(rec.id, true);
}

describe("draft persistence", () => {
  it("saves draft before extraction and survives a new DB connection", async () => {
    const name = `persist-${n++}`;
    setDB(new HutanoDB(name));
    const rec = await createDraft({ rawNarrative: "Mwana ane chikosoro", inputLanguage: "sn", isSynthetic: true });
    expect(rec.reviewStatus).toBe("draft");
    expect(rec.extraction).toBeNull();
    setDB(new HutanoDB(name)); // simulate reload
    const again = await getEncounter(rec.id);
    expect(again?.rawNarrative).toBe("Mwana ane chikosoro");
    expect(again?.schemaVersion).toBe(1);
    expect(again?.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("rejects duplicate writes instead of pretending to save", async () => {
    const rec = await createDraft({ rawNarrative: "a", inputLanguage: "en", isSynthetic: true });
    const { getDB } = await import("@/domain/db");
    await expect(getDB().encounters.add(rec)).rejects.toThrow();
  });
});

describe("verification invalidation", () => {
  it("requires explicit confirmation", async () => {
    const rec = await createDraft({ rawNarrative: "a", inputLanguage: "en", isSynthetic: true });
    await expect(verify(rec.id, false)).rejects.toThrow();
  });

  it("editing after verification clears verification and dequeues", async () => {
    const v = await verifiedRecord();
    expect(v.reviewStatus).toBe("verified");
    expect(v.syncStatus).toBe("queued");
    const f = structuredClone(v.fields);
    f.concern.value = "changed";
    const edited = await saveFields(v.id, f);
    expect(edited.reviewStatus).toBe("in_review");
    expect(edited.verifiedAt).toBeNull();
    expect(edited.syncStatus).toBe("local_only");
    expect(edited.localRevision).toBeGreaterThan(v.localRevision);
  });

  it("blocks verification while suggestions are pending", async () => {
    const fx = FIXTURES[0]!;
    const rec = await createDraft({ rawNarrative: fx.narrative, inputLanguage: "en", isSynthetic: true });
    const r = await applyExtraction(rec.id, await demoAdapter.extract(fx.narrative, "en"));
    expect(verificationBlockers(r.fields).pending.length).toBeGreaterThan(0);
    await expect(verify(rec.id, true)).rejects.toThrow();
  });
});

describe("unknown and negation preservation", () => {
  it("keeps negation and original Shona text verbatim", async () => {
    for (const fx of FIXTURES) {
      const res = await demoAdapter.extract(fx.narrative, fx.language);
      for (const s of Object.values(res.suggestions)) expect(fx.narrative).toContain(s!.source);
    }
    const en = await demoAdapter.extract(FIXTURES[0]!.narrative, "en");
    expect(en.suggestions.concern?.value).toContain("Denies vomiting");
    const sn = await demoAdapter.extract(FIXTURES[1]!.narrative, "sn");
    expect(sn.suggestions.concern?.value).toContain("Hapana fivha");
    expect(sn.suggestions.encounterDate).toBeUndefined();
  });

  it("arbitrary text leaves fields null and narrative intact", async () => {
    const text = "Ndashanyira mhuri nhasi, hapana chakanyorwa.";
    const rec = await createDraft({ rawNarrative: text, inputLanguage: "sn", isSynthetic: true });
    const r = await applyExtraction(rec.id, await demoAdapter.extract(text, "sn"));
    expect(r.rawNarrative).toBe(text);
    for (const k of FIELD_KEYS) expect(r.fields[k].value).toBeNull();
    expect(missingFields(r.fields)).toHaveLength(FIELD_KEYS.length);
  });

  it("allows verification with explicit not-recorded acknowledgement", async () => {
    const v = await verifiedRecord();
    expect(v.fields.age.value).toBeNull();
    expect(v.fields.age.state).toBe("not_recorded");
  });
});

