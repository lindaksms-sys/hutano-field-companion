import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDB, HutanoDB, setDB } from "@/domain/db";
import { adoptRecord, createDraft, getEncounter, listEncounters, saveFields, verify } from "@/domain/repository";
import { setCurrentUser } from "@/domain/session";
import { drainOutbox, pendingOutbox, type RevisionStore } from "@/domain/sync";
import { FIELD_KEYS, type RevisionPayload } from "@/domain/types";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
let n = 0;

class FakeStore implements RevisionStore {
  rows = new Map<string, RevisionPayload & { received_at: string }>();
  inserts: RevisionPayload[] = [];
  mode: "ok" | "lose-ack" | "network" | "auth" = "ok";
  onInsert?: () => Promise<void> | void;
  async insert(p: RevisionPayload) {
    this.inserts.push(structuredClone(p));
    if (this.mode === "network") return { ok: false as const, error: { kind: "network" as const, message: "Failed to fetch" } };
    if (this.mode === "auth") return { ok: false as const, error: { kind: "auth" as const, message: "JWT expired" } };
    await this.onInsert?.();
    if (this.rows.has(p.id)) return { ok: false as const, error: { kind: "duplicate" as const, message: "dup" } };
    const row = { ...structuredClone(p), received_at: new Date().toISOString() };
    this.rows.set(p.id, row);
    if (this.mode === "lose-ack") return { ok: false as const, error: { kind: "network" as const, message: "Failed to fetch" } };
    return { ok: true as const, receivedAt: row.received_at };
  }
  async selectById(id: string) {
    return { ok: true as const, row: this.rows.get(id) ?? null };
  }
}

beforeEach(() => {
  setDB(new HutanoDB(`sync-${n++}`));
  setCurrentUser(null);
});

async function verified(owner: string | null) {
  const rec = await createDraft({ rawNarrative: "SYNTHETIC test note", inputLanguage: "en", isSynthetic: true, ownerId: owner });
  const f = structuredClone(rec.fields);
  for (const k of FIELD_KEYS) f[k] = { ...f[k], state: "not_recorded", notRecordedReason: "Not stated" };
  await saveFields(rec.id, f);
  return verify(rec.id, true);
}

describe("no sync without account", () => {
  it("returns not_signed_in and sends nothing", async () => {
    await verified(null);
    const s = new FakeStore();
    expect((await drainOutbox(s, () => true)).status).toBe("not_signed_in");
    expect(s.inserts).toHaveLength(0);
  });
});

describe("draft exclusion", () => {
  it("never uploads drafts or in-review records", async () => {
    setCurrentUser(A);
    await createDraft({ rawNarrative: "draft", inputLanguage: "en", isSynthetic: true });
    const v = await verified(A);
    const s = new FakeStore();
    const o = await drainOutbox(s, () => true);
    expect(o.status).toBe("done");
    expect(s.inserts.map((p) => p.encounter_id)).toEqual([v.id]);
    expect(s.inserts[0]!.review_status).toBe("verified");
  });
});

describe("retries", () => {
  it("offline preserves queue", async () => {
    setCurrentUser(A);
    await verified(A);
    const s = new FakeStore();
    expect((await drainOutbox(s, () => false)).status).toBe("offline");
    s.mode = "network";
    expect((await drainOutbox(s, () => true)).status).toBe("offline");
    expect(await pendingOutbox(A)).toHaveLength(1);
  });

  it("lost acknowledgement retries same id/payload and accepts after comparing", async () => {
    setCurrentUser(A);
    const v = await verified(A);
    const s = new FakeStore();
    s.mode = "lose-ack";
    await drainOutbox(s, () => true);
    expect((await getEncounter(v.id))!.syncStatus).toBe("queued");
    s.mode = "ok";
    const o = await drainOutbox(s, () => true);
    expect(o).toMatchObject({ status: "done", sent: 1 });
    expect(s.inserts[0]).toEqual(s.inserts[1]);
    const r = (await getEncounter(v.id))!;
    expect(r.syncStatus).toBe("synced");
    expect(r.serverRevision).toBe(v.localRevision);
  });

  it("rejects a duplicate id whose server payload differs", async () => {
    setCurrentUser(A);
    await verified(A);
    const s = new FakeStore();
    const [e] = await pendingOutbox(A);
    s.rows.set(e!.revisionId, { ...e!.payload, raw_narrative: "tampered", received_at: new Date().toISOString() });
    const o = await drainOutbox(s, () => true);
    expect(o).toMatchObject({ status: "done", sent: 0, rejected: 1 });
  });

  it("auth failure pauses and keeps queue", async () => {
    setCurrentUser(A);
    await verified(A);
    const s = new FakeStore();
    s.mode = "auth";
    expect((await drainOutbox(s, () => true)).status).toBe("auth_paused");
    expect(await pendingOutbox(A)).toHaveLength(1);
  });

  it("lock prevents parallel drains", async () => {
    setCurrentUser(A);
    await verified(A);
    const s = new FakeStore();
    const [a, b] = await Promise.all([drainOutbox(s, () => true), drainOutbox(s, () => true)]);
    expect([a.status, b.status]).toContain("busy");
    expect(s.inserts).toHaveLength(1);
  });
});

describe("stale acknowledgements", () => {
  it("edit during in-flight upload stays pending and loses verification", async () => {
    setCurrentUser(A);
    const v = await verified(A);
    const s = new FakeStore();
    s.onInsert = async () => {
      const f = structuredClone((await getEncounter(v.id))!.fields);
      f.concern = { ...f.concern, state: "edited", value: "changed", notRecordedReason: null };
      await saveFields(v.id, f);
    };
    const o = await drainOutbox(s, () => true);
    expect(o).toMatchObject({ status: "done", sent: 1 });
    const r = (await getEncounter(v.id))!;
    expect(r.reviewStatus).toBe("in_review");
    expect(r.verifiedAt).toBeNull();
    expect(r.syncStatus).toBe("local_only");
    expect(r.lastSyncedAt).toBeNull();
  });

  it("account change mid-request does not touch local state", async () => {
    setCurrentUser(A);
    const v = await verified(A);
    const s = new FakeStore();
    s.onInsert = () => setCurrentUser(B);
    const o = await drainOutbox(s, () => true);
    expect(o.status).toBe("account_changed");
    const raw = await getDB().encounters.get(v.id);
    expect(raw!.syncStatus).toBe("queued");
    expect((await getDB().outbox.toArray())[0]!.status).toBe("pending");
  });
});

describe("user isolation", () => {
  it("partitions records and outbox by account; unowned needs explicit adopt", async () => {
    setCurrentUser(A);
    const a = await verified(A);
    setCurrentUser(null);
    const demo = await verified(null);
    setCurrentUser(B);
    const list = await listEncounters();
    expect(list.map((r) => r.id)).toEqual([demo.id]); // A's record hidden from B
    expect(await getEncounter(a.id)).toBeUndefined();
    expect(await pendingOutbox(B)).toHaveLength(0); // demo not auto-transferred
    const s = new FakeStore();
    await drainOutbox(s, () => true);
    expect(s.inserts).toHaveLength(0);
    await adoptRecord(demo.id, B);
    await drainOutbox(s, () => true);
    expect(s.inserts.map((p) => [p.encounter_id, p.owner_id])).toEqual([[demo.id, B]]);
    await expect(adoptRecord(a.id, B)).rejects.toThrow();
    expect((await getDB().encounters.get(a.id))!.ownerId).toBe(A);
  });
});
