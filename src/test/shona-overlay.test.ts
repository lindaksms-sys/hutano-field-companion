import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Minimal RFC 4180 CSV parser (quoted fields, embedded commas/newlines). */
function parseCsv(t: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head!.map((h, j) => [h, r[j] ?? ""])));
}

const csvRows = parseCsv(readFileSync("docs/shona-translation.csv", "utf8"));
const overlay = parseCsv(readFileSync("docs/shona-review-overlay.csv", "utf8"));

describe("Shona reviewer overlay", () => {
  it("every overlay entry is merged into the inventory by stable key", () => {
    const byKey = new Map(csvRows.map((r) => [r.key, r]));
    for (const o of overlay) {
      expect(o.attribution).toBe("user-supplied proposal, not clinician validated");
      if (o.key!.startsWith("term.")) continue;
      expect(byKey.get(o.key!)?.reviewer_proposed_shona, o.key).toBe(o.reviewer_proposed_shona);
    }
  });

  const py = spawnSync("python3", ["--version"]);
  it.skipIf(py.status !== 0)("regenerating from source reproduces the committed CSV (reviewer text kept)", () => {
    const out = join(mkdtempSync(join(tmpdir(), "inv-")), "inv.csv");
    const r = spawnSync("python3", ["scripts/shona-inventory.py"], { env: { ...process.env, HUTANO_INVENTORY_OUT: out } });
    expect(r.status, String(r.stderr)).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(readFileSync("docs/shona-translation.csv", "utf8"));
  });
});
