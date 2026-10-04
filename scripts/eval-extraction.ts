// Reproducible extraction evaluation (synthetic data only).
//   bun scripts/eval-extraction.ts [heldout|dev] [--rules-only]
// Modes scored on the SAME cases: rules-only, baseline (v1: model labels all 8 fields, old segmenter),
// hybrid (v2: rules for structured fields + model for concern/observations/followUp with type checks).
// Real model: pinned Qwen3-0.6B ONNX q8 via @huggingface/transformers on onnxruntime-node (CPU).
// Never logs anything except synthetic case text and scores.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  buildMessages,
  buildMessagesBaseline,
  combineHybrid,
  segmentNarrative,
  validateModelOutput,
  AI_LIMITS,
  type Segment,
} from "../src/domain/ai-extraction";
import { runRules } from "../src/domain/rules";
import { AI_MAX_NEW_TOKENS, AI_MODEL } from "../src/lib/ai-config";
import { FIELD_KEYS, type FieldKey } from "../src/domain/types";
import type { Suggestion } from "../src/domain/extraction";

type Expected = Record<FieldKey, string[] | null>;
interface Case { id: string; language: "en" | "sn" | "mixed"; narrative: string; expected: Expected }
type Pred = Partial<Record<FieldKey, Suggestion>>;

const split = process.argv[2] === "dev" ? "dev" : "heldout";
const rulesOnly = process.argv.includes("--rules-only");
const file = `eval/cases.${split}.json`;
const raw = readFileSync(file, "utf8");
if (split === "heldout") {
  const want = readFileSync("eval/HELDOUT.sha256", "utf8").split(/\s+/)[0];
  const got = createHash("sha256").update(raw).digest("hex");
  if (want !== got) throw new Error("Held-out set changed after freezing (sha256 mismatch).");
}
const cases: Case[] = JSON.parse(raw).cases;

/** v1 segmenter (split on every . ! ? ;) — reproduces the baseline exactly. */
function segmentV1(narrative: string): Segment[] {
  const segs: Segment[] = [];
  const re = /[^.!?;\n]+[.!?;]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(narrative))) {
    const lead = m[0].length - m[0].trimStart().length;
    const text = m[0].trim();
    if (!text) continue;
    const start = m.index + lead;
    segs.push({ n: segs.length + 1, start, end: start + text.length, text, withheld: segmentNarrative(text + (/[.!?;]$/.test(text) ? "" : "."))[0]!.withheld });
  }
  if (segs.length > AI_LIMITS.maxSegments) throw new Error("too many segments");
  return segs;
}

// ---- model ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tok: any, model: any;
async function loadModel() {
  const { AutoModelForCausalLM, AutoTokenizer, env } = await import("@huggingface/transformers");
  env.cacheDir = process.env.HF_CACHE ?? "/tmp/ev/hf";
  tok = await AutoTokenizer.from_pretrained(AI_MODEL.id, { revision: AI_MODEL.revision });
  model = await AutoModelForCausalLM.from_pretrained(AI_MODEL.id, { revision: AI_MODEL.revision, dtype: "q8", device: "cpu" });
}
async function generate(messages: { role: string; content: string }[]) {
  const inputs = tok.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true, enable_thinking: false });
  const n = inputs.input_ids.dims[1];
  const t0 = performance.now();
  const out = await model.generate({ ...inputs, max_new_tokens: AI_MAX_NEW_TOKENS, do_sample: false });
  const text: string = tok.batch_decode(out.slice(null, [n, null]), { skip_special_tokens: true })[0];
  return { text, ms: performance.now() - t0 };
}

// ---- scoring ----
// Per (case, field):
//  TP  predicted, gold non-null, value exactly equals one accepted span
//  FP  predicted and (gold null OR value not accepted)          -> false positives
//  FN  gold non-null and (no prediction OR value not accepted)
//  CA  gold null and no prediction (correct abstention; NOT counted in precision)
// precision = TP/(TP+FP), recall = TP/(TP+FN). A wrong value counts as both FP and FN.
type Tally = { tp: number; fp: number; fn: number; ca: number; goldNull: number; goldPos: number };
const blank = (): Tally => ({ tp: 0, fp: 0, fn: 0, ca: 0, goldNull: 0, goldPos: 0 });
function score(pred: Pred, exp: Expected, t: Record<string, Tally>, keyPrefix: string) {
  for (const f of FIELD_KEYS) {
    for (const key of [`${keyPrefix}|${f}`, `${keyPrefix}|ALL`]) {
      const x = (t[key] ??= blank());
      const g = exp[f];
      const p = pred[f]?.value?.trim();
      if (g) x.goldPos++;
      else x.goldNull++;
      const ok = !!(p && g && g.some((s) => s.trim() === p));
      if (ok) x.tp++;
      else {
        if (p) x.fp++;
        if (g) x.fn++;
        if (!p && !g) x.ca++;
      }
    }
  }
}
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}% (${a}/${b})` : "n/a (0/0)");
function q(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]!;
}

async function main() {
  const modes = rulesOnly ? ["rules"] : ["rules", "baseline", "hybrid"];
  if (!rulesOnly) await loadModel();
  const tallies: Record<string, Record<string, Tally>> = Object.fromEntries(modes.map((m) => [m, {}]));
  const lat: Record<string, number[]> = { baseline: [], hybrid: [] };
  const detail: unknown[] = [];
  for (const c of cases) {
    const segs = segmentNarrative(c.narrative);
    const rules = runRules(segs, c.narrative);
    const row: Record<string, unknown> = { id: c.id, language: c.language };
    const preds: Record<string, Pred> = { rules };
    if (!rulesOnly) {
      // baseline v1
      try {
        const s1 = segmentV1(c.narrative);
        const g = await generate(buildMessagesBaseline(s1));
        lat.baseline!.push(g.ms);
        row.baselineRaw = g.text;
        try {
          preds.baseline = validateModelOutput(g.text, c.narrative, s1).suggestions;
        } catch (e) {
          preds.baseline = {};
          row.baselineError = (e as Error).message;
        }
      } catch (e) {
        preds.baseline = {};
        row.baselineError = (e as Error).message;
      }
      // hybrid v2
      const g2 = await generate(buildMessages(segs));
      lat.hybrid!.push(g2.ms);
      row.hybridRaw = g2.text;
      try {
        preds.hybrid = combineHybrid(g2.text, c.narrative, segs, c.language, rules, { modelId: "", modelRevision: "", backend: "cpu", dtype: "q8", durationMs: 0 }).suggestions;
      } catch (e) {
        preds.hybrid = { ...rules }; // fail closed to rules (same as app: model failure keeps rule-free draft; see report)
        row.hybridError = (e as Error).message;
      }
    }
    for (const m of modes) {
      score(preds[m]!, c.expected, tallies[m]!, c.language);
      score(preds[m]!, c.expected, tallies[m]!, "ALL");
      row[m] = Object.fromEntries(Object.entries(preds[m]!).map(([k, v]) => [k, { value: v!.value, by: v!.by }]));
    }
    detail.push(row);
    process.stderr.write(`${c.id} done\n`);
  }
  const lines: string[] = [`# ${split} results (${cases.length} cases)`, ""];
  for (const m of modes) {
    lines.push(`## ${m}`, "", "| slice | precision | recall | false positives | correct abstentions |", "|---|---|---|---|---|");
    for (const [k, t] of Object.entries(tallies[m]!).sort()) {
      lines.push(`| ${k} | ${pct(t.tp, t.tp + t.fp)} | ${pct(t.tp, t.tp + t.fn)} | ${t.fp} | ${pct(t.ca, t.goldNull)} |`);
    }
    if (lat[m]?.length) lines.push("", `latency (model generate only, ms): median ${q(lat[m]!, 0.5).toFixed(0)}, p95 ${q(lat[m]!, 0.95).toFixed(0)}, n=${lat[m]!.length}`);
    lines.push("");
  }
  mkdirSync("eval/results", { recursive: true });
  const tag = rulesOnly ? `${split}.rules-only` : split;
  writeFileSync(`eval/results/${tag}.md`, lines.join("\n"));
  writeFileSync(`eval/results/${tag}.json`, JSON.stringify({ model: AI_MODEL.id, revision: AI_MODEL.revision, runtime: "onnxruntime-node cpu q8", ranAt: new Date().toISOString(), tallies, latencyMs: lat, cases: detail }, null, 1));
  console.log(lines.join("\n"));
}
void main();
