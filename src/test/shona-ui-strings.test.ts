import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { SN_STRINGS } from "@/lib/sn-strings.gen";

const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
const entries = Object.entries(SN_STRINGS);

describe("published Shona UI strings", () => {
  it("keeps every placeholder exactly", () => {
    for (const [en, sn] of entries) expect(ph(sn), en).toBe(ph(en));
  });

  it("avoids literal mistranslations and inconsistent spellings", () => {
    const banned = [/negore/i, /wemunda/i, /\bminda\b/i, /\bmunda\b/i, /mutengi/i, /interneti/i, /tumiranis/i, /kubvisa mashoko/i, /mushandi weAI/i];
    for (const [en, sn] of entries) for (const b of banned) expect(b.test(sn), `${en} -> ${sn}`).toBe(false);
  });

  it("keeps not recorded distinct from a negative finding", () => {
    expect(SN_STRINGS["Not recorded"]).toBe("Hazvina kunyorwa");
    expect(Object.values(SN_STRINGS).some((s) => /^Hapana fivha/.test(s))).toBe(false);
  });

  it("does not publish review-only alternatives", () => {
    expect(Object.values(SN_STRINGS)).not.toContain("Zvinyorwa zvekuzodzoka kuzoona murwere");
  });

  const py = spawnSync("python3", ["--version"]);
  it.skipIf(py.status !== 0)("generator output matches the committed file (no conflicts)", () => {
    const r = spawnSync("python3", ["scripts/shona-ui-strings.py", "--stdout"], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(readFileSync("src/lib/sn-strings.gen.ts", "utf8"));
  });
});
