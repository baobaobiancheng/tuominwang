import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { detect, mergeCandidates, RULES_VERSION } from "../packages/core/redaction.ts";
import { createNer } from "../packages/core/ner.ts";
import type { Mark } from "../packages/contracts/index.ts";

const root = resolve(import.meta.dirname, ".."), bytes = await readFile(resolve(root, "tests/fixtures/recognition-eval.json"));
const datasetHash = createHash("sha256").update(bytes).digest("hex"), dataset = JSON.parse(bytes.toString());
let ai: { datasetHash: string; elapsedMs: number; results: { id: string; marks: Mark[] }[] } | undefined;
try { ai = JSON.parse(await readFile(resolve(root, ".data/evals/codex-public-result.json"), "utf8")); if (ai!.datasetHash !== datasetHash) throw new Error("EVAL_DATASET_MISMATCH"); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
const ner = await createNer(), rows: any[] = [];
const key = (m: Pick<Mark, "kind" | "start" | "end">) => `${m.kind}:${m.start}:${m.end}`;
function score(gold: Mark[], actual: Mark[]) {
  const expected = new Set(gold.map(key)), confirmed = new Set(actual.filter(m => !m.sources?.every(s => s.uncertain)).map(key));
  const tp = [...confirmed].filter(k => expected.has(k)).length;
  return { tp, fp: confirmed.size - tp, fn: expected.size - tp, candidates: actual.length, uncertain: actual.filter(m => m.sources?.every(s => s.uncertain)).length };
}
try {
  for (const sample of dataset.cases) {
    const gold = sample.gold.map((g: { quote: string; kind: Mark["kind"] }) => {
      const start = sample.text.indexOf(g.quote); if (start < 0 || sample.text.indexOf(g.quote, start + 1) !== -1) throw new Error("INVALID_GOLD_SPAN");
      return { start, end: start + g.quote.length, kind: g.kind, decision: "pending" };
    });
    let started = performance.now(); const rules = detect(sample.text), ruleMs = performance.now() - started;
    started = performance.now(); const entities = await ner.detect(sample.text), nerMs = performance.now() - started;
    const combined = mergeCandidates(sample.text, rules, entities), aiMarks = ai?.results.find(r => r.id === sample.id)?.marks;
    if (ai && !aiMarks) throw new Error("EVAL_SAMPLE_MISSING");
    const modes = { rules, rulesNer: combined, ...(aiMarks ? { threeLayers: mergeCandidates(sample.text, combined, aiMarks) } : {}) };
    rows.push({ id: sample.id, ruleMs, nerMs, modes: Object.fromEntries(Object.entries(modes).map(([name, marks]) => [name, { ...score(gold, marks), spans: marks.map(m => ({ start: m.start, end: m.end, kind: m.kind, sources: m.sources })) }])) });
  }
  const summary = Object.fromEntries(["rules", "rulesNer", ...(ai ? ["threeLayers"] : [])].map(mode => {
    const total = rows.reduce((sum, row) => { const r = row.modes[mode]; for (const k of Object.keys(sum)) sum[k] += r[k]; return sum; }, { tp: 0, fp: 0, fn: 0, candidates: 0, uncertain: 0 });
    return [mode, { ...total, precision: total.tp / (total.tp + total.fp || 1), recall: total.tp / (total.tp + total.fn || 1) }];
  }));
  const report = { dataset: dataset.version, datasetHash, humanVerified: false, accuracyAcceptance: "not_evaluated", rules: RULES_VERSION, ner: ner.version, weights: ner.weights, ai: ai ? "codex-public-development-only" : "not_run", aiMs: ai?.elapsedMs, summary, rows };
  await mkdir(resolve(root, ".data/evals"), { recursive: true, mode: 0o700 });
  await writeFile(resolve(root, ".data/evals/recognition-report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ datasetHash, humanVerified: false, accuracyAcceptance: report.accuracyAcceptance, ai: report.ai, summary }, null, 2));
} finally { await ner.close(); }
