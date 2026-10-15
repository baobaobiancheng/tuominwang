import sharp from "sharp";
import {rotatePageBox,quarterTurn} from "./page-rotation.ts";
import { openPdf, PAGE_MAX_PIXELS } from "./pdf-reader.ts";
import type { VisualCandidate } from "./visual-detection.ts";
type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const transform = (m: Matrix, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const compose = (a: Matrix, b: Matrix): Matrix => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
export function pdfImageSealShape(box: Pick<VisualCandidate, "x" | "y" | "width" | "height">, width: number, height: number) {
  const size = Math.max(18, .03 * Math.min(width, height)), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  return [box.x, box.y, box.width, box.height, width, height].every(Number.isFinite) && cx > width * .05 && cx < width * .95 && cy > height * .45 && box.width >= size && box.height >= size && box.width <= width * .45 && box.height <= height * .35 && box.width / box.height >= .5 && box.width / box.height <= 2;
}
// PDFium replaces the observed PDF.js operator walker. Both use transformed embedded-image rectangles in page coordinates.
export async function detectPdfImageSeals(source: Buffer, pageIndex: number, preview: Buffer, additionalRotation = 0): Promise<VisualCandidate[]> {
  additionalRotation=quarterTurn(additionalRotation);if(additionalRotation)preview=await sharp(preview).rotate(-additionalRotation).png().toBuffer();
  const pdf = await openPdf(source), p = pdf.module;
  let page = 0;
  const scratch = p.pdfium.wasmExports.malloc(64), heap = () => (p.pdfium as typeof p.pdfium & { HEAPU8: Uint8Array<ArrayBuffer> }).HEAPU8;
  try {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pdf.count) throw new Error("INVALID_PDF_PAGE");
    page = p.FPDF_LoadPage(pdf.doc, pageIndex); if (!page) throw new Error("INVALID_PDF_PAGE");
    const width = Math.ceil(p.FPDF_GetPageWidthF(page)), height = Math.ceil(p.FPDF_GetPageHeightF(page)), boxes: VisualCandidate[] = [];
    let visited = 0;
    function objects(parent: number, form: boolean, ancestors: Matrix, depth: number) {
      if (depth > 16) throw new Error("VISUAL_PDF_OBJECT_LIMIT");
      const count = form ? p.FPDFFormObj_CountObjects(parent) : p.FPDFPage_CountObjects(parent);
      if (!Number.isSafeInteger(count) || count < 0 || count > 10000) throw new Error("VISUAL_PDF_OBJECT_LIMIT");
      for (let i = 0; i < count; i++) {
        if (++visited > 10000) throw new Error("VISUAL_PDF_OBJECT_LIMIT");
        const object = form ? p.FPDFFormObj_GetObject(parent, i) : p.FPDFPage_GetObject(parent, i), type = p.FPDFPageObj_GetType(object);
        if (type === 5) {
          if (!p.FPDFPageObj_GetMatrix(object, scratch)) throw new Error("INVALID_PDF_PAGE");
          const v = new DataView(heap().buffer), matrix = Array.from({ length: 6 }, (_, n) => v.getFloat32(scratch + n * 4, true)) as Matrix;
          if (!matrix.every(Number.isFinite)) throw new Error("INVALID_PDF_PAGE");
          objects(object, true, compose(ancestors, matrix), depth + 1); continue;
        }
        if (type !== 3) continue;
        if (!p.FPDFPageObj_GetBounds(object, scratch, scratch + 4, scratch + 8, scratch + 12)) throw new Error("INVALID_PDF_PAGE");
        const v = new DataView(heap().buffer), left = v.getFloat32(scratch, true), bottom = v.getFloat32(scratch + 4, true), right = v.getFloat32(scratch + 8, true), top = v.getFloat32(scratch + 12, true);
        if (![left, bottom, right, top].every(Number.isFinite)) throw new Error("INVALID_PDF_PAGE");
        const corners = [[left, bottom], [left, top], [right, bottom], [right, top]].map(([x, y]) => {
          const [px, py] = transform(ancestors, x, y);
          if (!p.FPDF_PageToDevice(page, 0, 0, width, height, 0, px, py, scratch + 32, scratch + 36)) throw new Error("INVALID_PDF_PAGE");
          const d = new DataView(heap().buffer); return [d.getInt32(scratch + 32, true), d.getInt32(scratch + 36, true)];
        });
        const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]), x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys));
        const box: VisualCandidate = { x, y, width: Math.min(width, Math.max(...xs)) - x, height: Math.min(height, Math.max(...ys)) - y, reason: "印章", score: .8, detector: "pdf-image-color-v1" };
        if (pdfImageSealShape(box, width, height)) boxes.push(box);
      }
    }
    objects(page, false, identity, 0);
    if (!boxes.length) return [];
    const rendered = sharp(preview, { limitInputPixels: PAGE_MAX_PIXELS }).flatten({ background: "white" }).toColourspace("srgb").removeAlpha(), metadata = await rendered.metadata();
    if (!metadata.width || !metadata.height) throw new Error("VISUAL_INPUT_INVALID");
    const accepted: VisualCandidate[] = [];
    for (const box of boxes) {
      const sx = metadata.width / width, sy = metadata.height / height, left = Math.max(0, Math.floor(box.x * sx) - 2), top = Math.max(0, Math.floor(box.y * sy) - 2), cw = Math.min(metadata.width - left, Math.ceil(box.width * sx) + 4), ch = Math.min(metadata.height - top, Math.ceil(box.height * sy) + 4);
      const raw = await rendered.clone().extract({ left, top, width: cw, height: ch }).raw().toBuffer(); let color = 0;
      for (let i = 0; i < raw.length; i += 3) { const r = raw[i], g = raw[i + 1], b = raw[i + 2]; if (r > 150 && r - Math.max(g, b) > 35 || b > 120 && b - Math.max(r, g) > 30) color++; }
      if (color / (cw * ch) >= .015) accepted.push(box);
    }
    return additionalRotation ? accepted.map(box=>({...box,...rotatePageBox(box,width,height,additionalRotation)})) : accepted;
  } finally { if (page) p.FPDF_ClosePage(page); p.pdfium.wasmExports.free(scratch); pdf.close(); }
}
