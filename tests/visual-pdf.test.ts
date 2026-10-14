import { it, expect } from "vitest";
import sharp from "sharp";
import { detectPdfImageSeals } from "../packages/core/visual-pdf.ts";
import { openPdf } from "../packages/core/pdf-reader.ts";
async function fixture({ top = false, form = false, rotate = 0, black = false } = {}) {
  const image = await sharp({ create: { width: 80, height: 80, channels: 3, background: black ? "black" : "red" } }).jpeg().toBuffer();
  const y = top ? 650 : 200;
  const stream = Buffer.from(`q 100 0 0 100 200 ${y} cm /${form ? "Fm" : "Im"} Do Q`);
  const imageObject = Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 80 /Height 80 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, Buffer.from("\nendstream")]);
  const objects: Buffer[] = [Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"), Buffer.from("<< /Type /Pages /Count 1 /Kids [3 0 R] >>"), Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Rotate ${rotate} /Resources << /XObject << /${form ? "Fm 6" : "Im 5"} 0 R >> >> /Contents 4 0 R >>`), Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from("\nendstream")]), imageObject];
  if (form) { const nested = "q /Im Do Q"; objects.push(Buffer.from(`<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << /XObject << /Im 5 0 R >> >> /Length ${nested.length} >>\nstream\n${nested}\nendstream`)); }
  let size = 9; const chunks = [Buffer.from("%PDF-1.7\n")], offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) { offsets.push(size); const object = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), objects[i], Buffer.from("\nendobj\n")]); chunks.push(object); size += object.length; }
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${size}\n%%EOF\n`));
  const bytes = Buffer.concat(chunks), pdf = await openPdf(bytes); try { return { bytes, rendered: await pdf.page(0) }; } finally { pdf.close(); }
}
it("finds embedded PDF image candidates with native bounds and color guard; nested forms use parent matrix", async () => {
  for (const form of [false, true]) {
    const f = await fixture({ form }), boxes = await detectPdfImageSeals(f.bytes, 0, f.rendered.png);
    expect(boxes).toHaveLength(1); expect(boxes[0]).toMatchObject({ x: 200, y: 500, width: 100, height: 100, detector: "pdf-image-color-v1" });
  }
});
it("filters upper-page and black embedded images, rejects absent pages, and honors native rotation", async () => {
  const top = await fixture({ top: true }), black = await fixture({ black: true });
  expect(await detectPdfImageSeals(top.bytes, 0, top.rendered.png)).toEqual([]); expect(await detectPdfImageSeals(black.bytes, 0, black.rendered.png)).toEqual([]);
  await expect(detectPdfImageSeals(top.bytes, 1, top.rendered.png)).rejects.toThrow("INVALID_PDF_PAGE");
  const rotated = await fixture({ rotate: 180, top: true }); expect((await detectPdfImageSeals(rotated.bytes, 0, rotated.rendered.png))[0]).toMatchObject({ x: 300, y: 650, width: 100, height: 100 });
});
