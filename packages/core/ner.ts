import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Mark, Anchor } from "../contracts/index.ts";
import { mergeCandidates } from "./redaction.ts";

export const NER_TEXT_MAX_CHARS = 200000;
export function characterTokens(text: string, vocab: Map<string, number>) {
  const tokens: { id: number; start: number; end: number }[] = [];
  let offset = 0;
  for (const char of text) { tokens.push({ id: vocab.get(char) ?? 100, start: offset, end: offset + char.length }); offset += char.length; }
  return tokens;
}
export async function verifyNerBundle() {
  let lock: { model: string; revision: string; files: Record<string, string> };
  try { lock = JSON.parse(await readFile(new URL("../../scripts/ner-runtime-lock.json", import.meta.url), "utf8")); }
  catch { throw new Error("NER_MODEL_REQUIRED"); }
  const directory = resolve(process.env.NER_MODEL_DIR ?? ".data/models/ner");
  for (const [name, expected] of Object.entries(lock.files)) {
    const sha = createHash("sha256");
    try { for await (const chunk of createReadStream(resolve(directory, name))) sha.update(chunk); }
    catch { throw new Error("NER_MODEL_REQUIRED"); }
    if (sha.digest("hex") !== expected) throw new Error("NER_MODEL_MISMATCH");
  }
  return { directory, version: `${lock.model}@${lock.revision}`, weights: lock.files["model.onnx"] };
}
export async function createNer() {
  // Must precede native runtime initialization; do not send model/runtime telemetry.
  process.env.ORT_DISABLE_TELEMETRY = "1";
  const { InferenceSession, Tensor } = await import("onnxruntime-node");
  const bundle = await verifyNerBundle();
  const words = (await readFile(resolve(bundle.directory, "vocab.txt"), "utf8")).split(/\r?\n/);
  const vocab = new Map(words.map((word, i) => [word, i]));
  if (vocab.get("[UNK]") !== 100 || vocab.get("[CLS]") !== 101 || vocab.get("[SEP]") !== 102) throw new Error("NER_MODEL_MISMATCH");
  const session = await InferenceSession.create(resolve(bundle.directory, "model.onnx"), { executionProviders: ["cpu"], intraOpNumThreads: 2, interOpNumThreads: 1 });
  async function logits(ids: number[]) {
    if (ids.length < 2 || ids.length > 128) throw new Error("NER_TOKEN_LIMIT");
    const tensor = (values: number[]) => new Tensor("int64", BigInt64Array.from(values, BigInt), [1, values.length]);
    const result = await session.run({ input_ids: tensor(ids), attention_mask: tensor(ids.map(() => 1)), token_type_ids: tensor(ids.map(() => 0)) });
    if (!result.start_logits || !result.end_logits || result.start_logits.data.length !== ids.length * 5 || result.end_logits.data.length !== ids.length * 5) throw new Error("NER_OUTPUT_INVALID");
    const start = Array.from(result.start_logits.data as Float32Array), end = Array.from(result.end_logits.data as Float32Array);
    if (![...start, ...end].every(Number.isFinite)) throw new Error("NER_OUTPUT_INVALID");
    return { start, end };
  }
  return { ...bundle, vocab, logits, close: () => session.release(),
    async detect(text: string, anchors: Anchor[] = [], options:{onProgress?:(event:{processedTextEnd:number;totalTextLength:number;matches:Mark[]})=>void|Promise<void>}={}) {
      if (text.length > NER_TEXT_MAX_CHARS) throw new Error("NER_TEXT_LIMIT");
      const published=new Set<string>();
      const marks: Mark[] = [], kinds: Record<number, Mark["kind"]> = { 2: "姓名", 3: "地址", 4: "机构" };
      const spans = anchors.length ? anchors : [{ start: 0, end: text.length }];
      for (const span of spans) {
        const tokens = characterTokens(text.slice(span.start, span.end), vocab);
        for (let offset = 0; offset < tokens.length; offset += 94) {
          const window = tokens.slice(offset, offset + 126), result = await logits([101, ...window.map(t => t.id), 102]);
          const argmax = (values: number[], i: number) => { let best = 0; for (let n = 1; n < 5; n++) if (values[i * 5 + n] > values[i * 5 + best]) best = n; return best; };
          const probability = (values: number[], i: number, label: number) => { const slice = values.slice(i * 5, i * 5 + 5), max = Math.max(...slice); return Math.exp(slice[label] - max) / slice.reduce((sum, n) => sum + Math.exp(n - max), 0); };
          for (let i = 0; i < window.length; i++) {
            const label = argmax(result.start, i + 1), kind = kinds[label]; if (!kind) continue;
            for (let j = i; j < window.length; j++) if (argmax(result.end, j + 1) === label) {
              marks.push({ start: span.start + window[i].start, end: span.start + window[j].end, kind, decision: "pending", sources: [{ layer: "ner", code: "bertspan-dc0de593", score: Math.min(probability(result.start, i + 1, label), probability(result.end, j + 1, label)) }] });
              break;
            }
          }
          if(options.onProgress){const processedTextEnd=offset+126>=tokens.length?span.end:span.start+tokens[offset+94].start,matches=mergeCandidates(text,marks.filter(m=>m.end<=processedTextEnd&&!published.has(`${m.start}:${m.end}:${m.kind}`)));for(const m of matches)published.add(`${m.start}:${m.end}:${m.kind}`);await options.onProgress({processedTextEnd,totalTextLength:text.length,matches});}
          if (offset + 126 >= tokens.length) break;
        }
      }
      return mergeCandidates(text, marks);
    },
  };
}
