import { test, expect } from "vitest";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { clearPixels, pageBoxes, RasterPdf, validatePageReview } from "../packages/core/page-redaction.ts";
import { openPdf } from "../packages/core/pdf-reader.ts";
import { pdfFixture } from "./pdf-fixtures.ts";

test("pixel clearing destroys source pixels; fresh PDF contains only verified image pages", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const source = await openPdf(pdfFixture({ rotation, author: "private author" }));
    const original = await source.page(0); source.close();
    const page = { index: 0, width: original.width, height: original.height }, start = original.text.indexOf("13800138000");
    const marks = [{ start, end: start + 11, kind: "手机号" as const, decision: "redact" as const }];
    const policy = { mode: "raster" as const, regions: [], deletedPages: [] };
    const boxes = pageBoxes(original.text, marks, [{ kind: "page", page: 0, start: 0, end: original.text.length }], page, original.glyphs, policy);
    const cleared = await clearPixels(original.png, page, boxes), builder = new RasterPdf();
    builder.add(page, cleared.rgb, cleared.width, cleared.height);
    const output = builder.finish();
    expect(output.includes(Buffer.from("private author"))).toBe(false);
    const reopened = await openPdf(output);
    try {
      expect(reopened.meta).toEqual({}); expect(reopened.attachments).toBe(0); expect(reopened.scripts).toBe(0);
      const rendered = await reopened.page(0);
      expect(rendered.text).toBe("");
      const pixels = await sharp(rendered.png).removeAlpha().raw().toBuffer();
      expect(pixels.equals(cleared.rgb), `rotation ${rotation}: ${pixels.length} versus ${cleared.rgb.length}`).toBe(true);
    } finally { reopened.close(); }
    expect(() => pageBoxes(original.text, marks, [{ kind: "page", page: 0, start: 0, end: original.text.length }], page, [], policy)).toThrow("PAGE_POSITION_MISSING");
  }
}, 30000);
test("region and deletion validation requires explicit conversion and a nonempty in-bounds result", () => {
  const pages = [{ index: 0, width: 100, height: 200 }, { index: 1, width: 50, height: 80 }];
  const region = { id: randomUUID(), page: 0, x: 10, y: 20, width: 30, height: 40, reason: "印章" as const };
  const policy = { mode: "raster", regions: [region], deletedPages: [1] };
  expect(validatePageReview(policy, pages, true).deletedPages).toEqual([1]);
  for (const change of [{ deletedPages: [0, 1] }, { deletedPages: [1, 1] }, { regions: [region, region] }, { regions: [{ ...region, x: 90 }] }, { regions: [{ ...region, page: 2 }] }]) expect(() => validatePageReview({ ...policy, ...change }, pages)).toThrow("INVALID_PAGE_REVIEW");
  expect(() => validatePageReview({ ...policy, mode: "unselected" }, pages, true)).toThrow("PAGE_CONVERSION_REQUIRED");
});
