import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { mergeCandidates } from "../packages/core/redaction.ts";
import { detectComplete, filterCompleteNer, recognitionVersion } from "../packages/core/recognition-pipeline.ts";
import { createNer } from "../packages/core/ner.ts";
import { markSchema } from "../packages/contracts/index.ts";

export type EvalSpan = { start: number; end: number; kind: string };
const spanSchema = markSchema.pick({ start: true, end: true, kind: true }).strict();
const datasetSchema = z.object({
  schema: z.literal("redaction-evaluation/v1"),
  id: z.string().min(1),
  origin: z.enum(["real-human-annotated", "synthetic"]),
  permission: z.object({ basis: z.string().min(1), source: z.string().min(1), reviewed: z.literal(true) }).strict(),
  annotation: z.object({ completeForKinds: z.array(markSchema.shape.kind).min(1), annotator: z.string().min(1), independentlyReviewed: z.boolean() }).strict(),
  cases: z.array(z.object({ id: z.string().min(1), text: z.string().max(200_000), gold: z.array(spanSchema).max(2048) }).strict()).min(1).max(100_000),
}).strict();

function key(span: EvalSpan, typed: boolean) { return `${span.start}:${span.end}${typed ? `:${span.kind}` : ""}`; }
function unique(spans: EvalSpan[], typed = true) { return [...new Map(spans.map(s => [key(s, typed), s])).values()]; }
function validateSpans(text: string, spans: EvalSpan[]) {
  if (!text.isWellFormed()) throw new Error("INVALID_EVAL_TEXT");
  for (const s of spans) if (!Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < 0 || s.end <= s.start || s.end > text.length || !text.slice(0, s.start).isWellFormed() || !text.slice(0, s.end).isWellFormed()) throw new Error("INVALID_EVAL_SPAN");
}
export function metrics(tp: number, fp: number, fn: number) {
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  // F1 is zero if positives exist but none is found; undefined only for a wholly empty universe.
  const f1 = 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null;
  return { tp, fp, fn, precision, recall, f1 };
}
function exact(gold: EvalSpan[], predicted: EvalSpan[], typed = true) {
  const g = new Set(gold.map(s => key(s, typed))), p = new Set(predicted.map(s => key(s, typed)));
  const tp = [...p].filter(k => g.has(k)).length;
  return metrics(tp, p.size - tp, g.size - tp);
}
// Maximum cardinality matching ensures one broad candidate cannot claim several gold spans.
function overlap(gold: EvalSpan[], predicted: EvalSpan[], threshold: number) {
  const edges = predicted.map(p => gold.flatMap((g, i) => {
    const intersection = Math.max(0, Math.min(g.end, p.end) - Math.max(g.start, p.start));
    const union = Math.max(g.end, p.end) - Math.min(g.start, p.start);
    return p.kind === g.kind && intersection / union >= threshold ? [i] : [];
  }));
  const owner = new Map<number, number>();
  function assign(p: number, seen: Set<number>): boolean {
    for (const g of edges[p]) {
      if (seen.has(g)) continue;
      seen.add(g); const previous = owner.get(g);
      if (previous === undefined || assign(previous, seen)) { owner.set(g, p); return true; }
    }
    return false;
  }
  for (let p = 0; p < predicted.length; p++) assign(p, new Set());
  return metrics(owner.size, predicted.length - owner.size, gold.length - owner.size);
}
export function scoreSpans(text: string, goldSpans: EvalSpan[], predictedSpans: EvalSpan[]) {
  validateSpans(text, goldSpans); validateSpans(text, predictedSpans);
  const gold = unique(goldSpans), predicted = unique(predictedSpans);
  if (gold.length > 2048 || predicted.length > 2048) throw new Error("EVAL_CASE_SPAN_LIMIT");
  const g = new Uint8Array(text.length), p = new Uint8Array(text.length);
  for (const s of gold) g.fill(1, s.start, s.end);
  for (const s of predicted) p.fill(1, s.start, s.end);
  let sensitiveUnits = 0, coveredUnits = 0, extraUnits = 0;
  for (let i = 0; i < text.length; i++) { sensitiveUnits += g[i]; coveredUnits += g[i] && p[i] ? 1 : 0; extraUnits += p[i] && !g[i] ? 1 : 0; }
  return {
    exactTypeSpan: exact(gold, predicted), exactSpanIgnoringType: exact(gold, predicted, false),
    overlapTypeIoU50: overlap(gold, predicted, 0.5),
    sensitiveUtf16Coverage: { sensitiveUnits, coveredUnits, uncoveredUnits: sensitiveUnits - coveredUnits, extraUnits, recall: sensitiveUnits ? coveredUnits / sensitiveUnits : null },
    byKind: Object.fromEntries([...new Set([...gold, ...predicted].map(s => s.kind))].sort().map(kind => [kind, exact(gold.filter(s => s.kind === kind), predicted.filter(s => s.kind === kind))])),
  };
}

export async function evaluateDataset(inputPath: string, outputPath: string, withNer = false) {
  const bytes = await readFile(inputPath);
  if (bytes.length > 50 * 1024 * 1024) throw new Error("EVAL_DATASET_SIZE");
  const dataset = datasetSchema.parse(JSON.parse(bytes.toString("utf8")));
  const ids = new Set<string>();
  for (const sample of dataset.cases) { if (ids.has(sample.id)) throw new Error("DUPLICATE_EVAL_CASE"); ids.add(sample.id); validateSpans(sample.text, sample.gold); }
  if (dataset.cases.some(c => c.gold.some(g => !dataset.annotation.completeForKinds.includes(g.kind)))) throw new Error("GOLD_KIND_OUTSIDE_ANNOTATION_SCOPE");
  const coreDirectory = resolve(import.meta.dirname, "../packages/core");
  // Pin actual detection dependencies. Unrelated UI/format work cannot invalidate this benchmark.
  const sourceFiles = ["recognition-pipeline.ts", "redaction.ts", "reference-rules.ts", "ner.ts", "reference/rule-data.json", "reference/blacklists.json"];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, createHash("sha256").update(await readFile(resolve(coreDirectory, name))).digest("hex")])));
  const nerLockBytes = await readFile(resolve(coreDirectory, "../../scripts/ner-runtime-lock.json"));
  const nerRuntimeLockSha256 = createHash("sha256").update(nerLockBytes).digest("hex");
  const ner = withNer ? await createNer() : undefined;
  const rows = [], totals = new Map<string, { tp: number; fp: number; fn: number }>();
  try {
    for (const sample of dataset.cases) {
      const rules = detectComplete(sample.text, []).marks;
      const modes = { completeRules: rules, ...(ner ? { completeRulesNer: mergeCandidates(sample.text, rules, filterCompleteNer(sample.text, await ner.detect(sample.text))) } : {}) };
      const scored: Record<string, ReturnType<typeof scoreSpans>> = {};
      for (const [mode, actual] of Object.entries(modes)) {
        // Unannotated classes are excluded, counted separately rather than treated as false positives.
        const evaluated = actual.filter(m => dataset.annotation.completeForKinds.includes(m.kind));
        scored[mode] = scoreSpans(sample.text, sample.gold, evaluated);
        const total = totals.get(mode) ?? { tp: 0, fp: 0, fn: 0 };
        const s = scored[mode].exactTypeSpan; total.tp += s.tp; total.fp += s.fp; total.fn += s.fn; totals.set(mode, total);
      }
      rows.push({ id: sample.id, scores: scored, candidatesOutsideAnnotatedKinds: Object.fromEntries(Object.entries(modes).map(([mode, actual]) => [mode, actual.filter(m => !dataset.annotation.completeForKinds.includes(m.kind)).length])) });
      if (rows.length % 100 === 0) {
        console.log(JSON.stringify({ progress: rows.length, total: dataset.cases.length, origin: dataset.origin }));
        await mkdir(resolve(outputPath, ".."), { recursive: true });
        await writeFile(outputPath + ".checkpoint.json", JSON.stringify({ schema: "redaction-evaluation-checkpoint/v1", dataset: dataset.id, origin: dataset.origin, completedCases: rows.length, totalCases: dataset.cases.length, sourceHashes, nerRuntimeLockSha256, partial: true, trueProductAccuracyAccepted: false, totals: Object.fromEntries(totals), rows }, null, 2) + "\n", { mode: 0o600 });
      }
    }
    for (const name of sourceFiles) if (createHash("sha256").update(await readFile(resolve(coreDirectory, name))).digest("hex") !== sourceHashes[name]) throw new Error("SOURCE_CHANGED_DURING_EVAL");
    const report = {
      schema: "redaction-evaluation-report/v1", dataset: dataset.id, origin: dataset.origin, datasetSha256: createHash("sha256").update(bytes).digest("hex"),
      permission: dataset.permission, annotation: dataset.annotation, sourceHashes, kindOptions: markSchema.shape.kind.options, rulesVersion: recognitionVersion, nerRuntimeLockSha256, ner: ner ? { version: ner.version, weights: ner.weights } : null,
      cases: rows.length, exactTypeSpanMicro: Object.fromEntries([...totals].map(([mode, s]) => [mode, metrics(s.tp, s.fp, s.fn)])), rows,
      resultScope: "Candidate detection on all supplied cases; no sampled truncation. UTF-16 offsets, exact type+span as primary, overlap only secondary.",
      trueProductAccuracyAccepted: false, referenceProductRun: "R0", formatResidue: "not_evaluated", pixelResidue: "not_evaluated",
      remaining: ["真实业务语料独立复核/全类别覆盖", "真实保存复核后的导出副本及 ZIP/XML/PDF 文本/像素残留评估", "竞品正版许可运行对照"],
    };
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify({ dataset: report.dataset, origin: report.origin, cases: report.cases, exactTypeSpanMicro: report.exactTypeSpanMicro, formatResidue: report.formatResidue }));
    return report;
  } finally { await ner?.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output, option] = process.argv.slice(2);
  if (!input || !output || (option && option !== "--ner")) throw new Error("Usage: pnpm exec tsx scripts/eval-porting.ts input.json output.json [--ner]");
  await evaluateDataset(resolve(input), resolve(output), option === "--ner");
}
