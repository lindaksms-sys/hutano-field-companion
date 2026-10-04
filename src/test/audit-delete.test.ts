import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDB, HutanoDB, setDB } from "@/domain/db";
import { createDraft, deleteEncounter, getEncounter, listAudit, saveFields, verify } from "@/domain/repository";
import { setCurrentUser } from "@/domain/session";
import { FIELD_KEYS } from "@/domain/types";

let n = 0;
beforeEach(() => {
  setDB(new HutanoDB(`audit-${n++}`));
  setCurrentUser(null);
});

async function verified(owner: string | null = null) {
  const rec = await createDraft({ rawNarrative: "SYNTHETIC secret note text", inputLanguage: "en", isSynthetic: true, ownerId: owner });
  const f = structuredClone(rec.fields);
  for (const k of FIELD_KEYS) f[k] = { ...f[k], state: "not_recorded", notRecordedReason: "Not stated" };
  f.concern = { ...f.concern, value: "cough", state: "edited", origin: "worker", notRecordedReason: null };
  await saveFields(rec.id, f);
  return verify(rec.id, true);
}

describe("audit log", () => {
  it("records create, edit, verify and edit-after-verify without note text or values", async () => {
    const r = await verified();
    const f = structuredClone(r.fields);
    f.concern = { ...f.concern, value: "fever" };
    await saveFields(r.id, f);
    const log = await listAudit(r.id);
    expect(log.map((a) => a.action).reverse()).toEqual(["created", "edited", "verified", "edited"]);
    expect(log[0]!.verificationRemoved).toBe(true);
    expect(log[0]!.changed).toEqual(["concern"]);
    const dump = JSON.stringify(log);
    expect(dump).not.toContain("secret note");
    expect(dump).not.toContain("fever");
    expect(dump).not.toContain("cough");
  });

  it("is partitioned by account", async () => {
    setCurrentUser("user-a");
    const r = await verified("user-a");
    setCurrentUser("user-b");
    expect(await listAudit(r.id)).toEqual([]);
  });
});

describe("deleteEncounter", () => {
  it("removes the record and unsent queue entries, keeps a deletion audit entry", async () => {
    setCurrentUser("user-a");
    const r = await verified("user-a");
    expect(await getDB().outbox.where("encounterId").equals(r.id).count()).toBe(1);
    await deleteEncounter(r.id, "duplicate entry");
    expect(await getEncounter(r.id)).toBeUndefined();
    expect(await getDB().outbox.where("encounterId").equals(r.id).count()).toBe(0);
    const log = await listAudit(r.id);
    expect(log[0]!.action).toBe("deleted");
    expect(log[0]!.reason).toBe("duplicate entry");
  });

  it("refuses to delete another account's record", async () => {
    setCurrentUser("user-a");
    const r = await verified("user-a");
    setCurrentUser("user-b");
    await expect(deleteEncounter(r.id, "")).rejects.toThrow("Record not found");
    setCurrentUser("user-a");
    expect(await getEncounter(r.id)).toBeDefined();
  });
});
