import { expect, test } from "vitest";
import sharp from "sharp";
import { openPdf, checkPixels } from "../packages/core/pdf-reader.ts";
import { createOcr, recognizePage } from "../packages/core/ocr.ts";
import { pdfFixture } from "./pdf-fixtures.ts";

test("PDFium reads and renders local PDFs; glyph coordinates follow page rotation", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const pdf = await openPdf(pdfFixture({ rotation }));
    try {
      const page = await pdf.page(0);
      expect(page.text).toContain("13800138000");
      expect(page.rotation).toBe(rotation);
      expect(page.glyphs.length).toBe(page.text.length);
      expect(page.glyphs.every(g => g[2] >= 0 && g[3] >= 0 && g[2] + g[4] <= page.width + 1 && g[3] + g[5] <= page.height + 1)).toBe(true);
      const image = await sharp(page.png).metadata();
      expect(image.width).toBe(page.width * 2); expect(image.height).toBe(page.height * 2);
    } finally { pdf.close(); }
  }
  await expect(openPdf(pdfFixture({ pages: 301 }))).rejects.toThrow("PAGE_LIMIT");
  await expect(openPdf(Buffer.from("bad PDF"))).rejects.toThrow("INVALID_PDF");
  expect(() => checkPixels(5001, 5000)).toThrow("PIXEL_LIMIT");
});
test("local checksum-locked OCR identifies a public synthetic phone and returns character boxes", async () => {
  const pdf = await openPdf(pdfFixture()), worker = await createOcr();
  try {
    const page = await pdf.page(0), ocr = await recognizePage(worker, page.png, page.scale);
    expect(ocr.text).toContain("13800138000");
    expect(ocr.glyphs.length).toBeGreaterThan(10);
    expect(ocr.glyphs.every(g => g[2] >= 0 && g[3] >= 0 && g[2] + g[4] <= page.width && g[3] + g[5] <= page.height)).toBe(true);
  } finally { await worker.terminate(); pdf.close(); }
}, 30000);
