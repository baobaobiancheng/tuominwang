import { describe, expect, it } from "vitest";
import { correctPageText, resetOcrMarks, shiftOcrAnchors } from "../packages/core/ocr-correction.ts";
import sharp from "sharp";
import { clearPixels, pageBoxes } from "../packages/core/page-redaction.ts";
import { ocrCorrectionSchema } from "../packages/contracts/ocr.ts";
import type { Glyph } from "../packages/core/ocr.ts";
const input = (expectedText: string, text: string, start = 0) => ({ revision: 2, start, end: start + expectedText.length, expectedText, text });
const glyphs: Glyph[] = [[0, 1, 5, 8, 8, 12], [1, 2, 15, 8, 8, 12], [2, 3, 25, 8, 8, 12]];
describe("OCR text and original pixel association", () => {
  it("remaps a changed glyph conservatively and shifts subsequent positions", () => {
    const r = correctPageText("张三王", glyphs, input("张三王", "张小三王"), 100, 60);
    expect(r.text).toBe("张小三王"); expect(r.delta).toBe(1);
    const boxes = pageBoxes(r.text, [{ start: 1, end: 2, kind: "姓名", decision: "redact" }], [{ kind: "page", page: 0, start: 0, end: 4 }], { index: 0, width: 100, height: 60 }, r.glyphs, { mode: "raster", regions: [], deletedPages: [] });
    expect(boxes.length).toBeGreaterThan(0); expect(boxes.every(b => b.x >= 0 && b.x + b.width <= 100)).toBe(true);
    expect(r.glyphs.some(g => g[0] === 3 && g[1] === 4 && g[2] === 25)).toBe(true);
  });
  it("does not guess narrow subdivisions for a longer replacement", () => {
    const r = correctPageText("张三王", glyphs, input("三", "小明", 1), 100, 60);
    expect(r.glyphs).toContainEqual([1, 3, 15, 8, 8, 12]);
    expect(r.glyphs).toContainEqual([3, 4, 25, 8, 8, 12]);
    const r2 = correctPageText(r.text, r.glyphs, input("小明", "李", 1), 100, 60);
    expect(r2.glyphs).toContainEqual([1, 2, 15, 8, 8, 12]);
  });
  it("keeps UTF16 offsets aligned and rejects surrogate splits and stale originals", () => {
    expect(() => correctPageText("😀三", [[0, 2, 5, 8, 8, 12], [2, 3, 15, 8, 8, 12]], input("\ud83d", "李"), 100, 60)).toThrow("OCR_TEXT_CONFLICT");
    expect(() => correctPageText("张三王", glyphs, input("李", "王"), 100, 60)).toThrow("OCR_TEXT_CONFLICT");
    const r = correctPageText("😀三", [[0, 2, 5, 8, 8, 12], [2, 3, 15, 8, 8, 12]], input("😀", "李"), 100, 60);
    expect(r.text).toBe("李三"); expect(r.glyphs[1].slice(0, 2)).toEqual([1, 2]);
  });
  it("rejects unmapped new text and shifts all later page/metadata anchors, invalidating marks", () => {
    expect(() => correctPageText(" ", [], input(" ", "秘密"), 100, 60)).toThrow("OCR_POSITION_REQUIRED");
    const anchor = { kind: "page" as const, page: 0, start: 0, end: 3 };
    expect(shiftOcrAnchors([anchor, { kind: "page", page: 1, start: 4, end: 10 }, { kind: "object", part: "metadata", object: "author", start: 11, end: 14 }], anchor, 2).map(a => [a.start, a.end])).toEqual([[0, 5], [6, 12], [13, 16]]);
    expect(resetOcrMarks([{ start: 0, end: 2, kind: "姓名", decision: "redact" }, { start: 4, end: 6, kind: "姓名", decision: "ignore" }], 1, 2, 2)).toEqual([{ start: 6, end: 8, kind: "姓名", decision: "pending" }]);
  });
  it("clears deleted original characters when the corrected word is redacted", async () => {
    for (const replacement of ["", " "]) {
      const r = correctPageText("张三王", glyphs, input("三", replacement, 1), 100, 60);
      const page = { index: 0, width: 100, height: 60 }, boxes = pageBoxes(r.text, [{ start: 0, end: r.text.length, kind: "姓名", decision: "redact" }], [{ kind: "page", page: 0, start: 0, end: r.text.length }], page, r.glyphs, { mode: "raster", regions: [], deletedPages: [] });
      const source = await sharp({ create: { width: 100, height: 60, channels: 3, background: "red" } }).png().toBuffer();
      const result = await clearPixels(source, page, boxes), at = (12 * 100 + 18) * 3;
      expect([...result.rgb.subarray(at, at + 3)]).toEqual([0, 0, 0]);
    }
  });
  it("does not create a new revision for unchanged text, supports deletion, validates contract", () => {
    expect(correctPageText("张三王", glyphs, input("三", "三", 1), 100, 60).changed).toBe(false);
    const r = correctPageText("张三王", glyphs, input("三", "", 1), 100, 60);
    expect(r.text).toBe("张王"); expect(r.glyphs).toContainEqual([0, 1, 15, 8, 8, 12]);
    expect(() => correctPageText("张三王", glyphs, input("张三王", ""), 100, 60)).toThrow("OCR_POSITION_REQUIRED");
    expect(() => correctPageText("张三王", glyphs, input("张三王", "   "), 100, 60)).toThrow("OCR_POSITION_REQUIRED");
    expect(ocrCorrectionSchema.safeParse(input("三", "\u0000", 1)).success).toBe(false);
  });
});
