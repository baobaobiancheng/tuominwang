import { createWorker, OEM, type Worker } from "tesseract.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

// Coordinates are in the canonical upright page, UTF-16 offsets in the extracted page text.
export type Glyph = [start: number, end: number, x: number, y: number, width: number, height: number];
export async function createOcr(): Promise<Worker> {
  const directory = resolve(process.env.OCR_MODEL_DIR ?? ".data/models/ocr");
  const lock = JSON.parse(await readFile(new URL("../../scripts/ocr-lock.json", import.meta.url), "utf8"));
  for (const [name, expected] of Object.entries(lock.files)) {
    let data: Buffer; try { data = await readFile(resolve(directory, name)); } catch { throw new Error("OCR_MODEL_REQUIRED"); }
    if (createHash("sha256").update(data).digest("hex") !== expected) throw new Error("OCR_MODEL_MISMATCH");
  }
  // Explicit absolute local paths, no CDN fallback, no model cache writes, no source logging.
  const worker = await createWorker("chi_sim+eng", OEM.LSTM_ONLY, { langPath: directory, gzip: false, cacheMethod: "none", logger() {}, errorHandler() {} });
  await worker.setParameters({ user_defined_dpi: "150" });
  return worker;
}
export async function recognizePage(worker: Worker, png: Buffer, scale = 1) {
  const { data } = await worker.recognize(png, {}, { text: true, blocks: true });
  let text = ""; const glyphs: Glyph[] = [], words: Glyph[] = [];
  for (const block of data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
    for (const word of line.words) {
      if (text && !text.endsWith("\n")) text += " ";
      const wordStart = text.length;
      const symbols = word.symbols?.length ? word.symbols : [{ text: word.text, bbox: word.bbox }];
      for (const symbol of symbols) {
        const start = text.length; text += symbol.text;
        const b = symbol.bbox;
        glyphs.push([start, text.length, b.x0 / scale, b.y0 / scale, (b.x1 - b.x0) / scale, (b.y1 - b.y0) / scale]);
      }
      const b = word.bbox; words.push([wordStart, text.length, b.x0 / scale, b.y0 / scale, (b.x1 - b.x0) / scale, (b.y1 - b.y0) / scale]);
    }
    text += "\n";
  }
  return { text, glyphs, words, confidence: data.confidence };
}
