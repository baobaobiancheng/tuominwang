import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createNer, characterTokens } from "../packages/core/ner.ts";

// Only fixed public/synthetic fixtures from the offline exporter; no input filename or network calls.
const ner = await createNer();
try {
  const reference = JSON.parse(await readFile(resolve(ner.directory, "reference.json"), "utf8"));
  let maxDelta = 0; const started = performance.now();
  for (const sample of reference) {
    const ids = [101, ...characterTokens(sample.text, ner.vocab).map(t => t.id), 102];
    assert.deepEqual(ids, sample.ids, "TS/Python tokenizer mismatch");
    const result = await ner.logits(ids);
    for (const key of ["start", "end"] as const) {
      const expected = sample[key].flat();
      result[key].forEach((value, i) => { maxDelta = Math.max(maxDelta, Math.abs(value - expected[i])); });
    }
    assert.ok(maxDelta < 0.001, "ONNX/reference logits diverged");
    const marks = await ner.detect(sample.text);
    console.log(JSON.stringify({ synthetic: sample.text, candidates: marks.map(m => ({ type: m.kind, text: sample.text.slice(m.start, m.end), start: m.start, end: m.end })) }));
  }
  const long = "甲".repeat(120) + "张三在北京工作。" + "乙".repeat(250);
  const marks = await ner.detect(long);
  assert.ok(marks.every(m => m.end <= long.length && m.start < m.end));
  await assert.rejects(ner.detect("字".repeat(200001)), /NER_TEXT_LIMIT/);
  console.log(JSON.stringify({ model: ner.version, weights: ner.weights, referenceCases: reference.length, maxLogitDelta: maxDelta, elapsedMs: Math.round(performance.now() - started), peakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024), accuracyAcceptance: "not_evaluated" }));
} finally { await ner.close(); }
