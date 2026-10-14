import { init } from "@embedpdf/pdfium";
import sharp from "sharp";
import type { Glyph } from "./ocr.ts";
import { FILE_MAX_BYTES } from "../contracts/index.ts";

export const PAGE_MAX_PIXELS = 25000000;
export const PDF_MAX_PAGES = 300;
export function checkPixels(width: number, height: number) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0 && n <= 20000) || width * height > PAGE_MAX_PIXELS) throw new Error("PIXEL_LIMIT");
}
export async function openPdf(bytes: Buffer) {
  if (bytes.length > FILE_MAX_BYTES) throw new Error("FILE_SIZE_LIMIT");
  if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("INVALID_PDF");
  // Emscripten's environment encoder requires an ASCII executable label, not the Chinese workspace path.
  const p = await init({ thisProgram: "tuominwang-pdf" } as Parameters<typeof init>[0]); p.PDFiumExt_Init();
  const heap = () => (p.pdfium as typeof p.pdfium & { HEAPU8: Uint8Array<ArrayBuffer> }).HEAPU8;
  const alloc = (size: number) => p.pdfium.wasmExports.malloc(size);
  const free = (ptr: number) => p.pdfium.wasmExports.free(ptr);
  const source = alloc(bytes.length); heap().set(bytes, source);
  const doc = p.FPDF_LoadMemDocument(source, bytes.length, "");
  const close = () => { if (doc) p.FPDF_CloseDocument(doc); free(source); p.FPDF_DestroyLibrary(); };
  if (!doc) { const code = p.FPDF_GetLastError(); close(); throw new Error(code === 4 ? "ENCRYPTED_PDF" : "INVALID_PDF"); }
  const count = p.FPDF_GetPageCount(doc);
  if (count < 1 || count > PDF_MAX_PAGES) { close(); throw new Error("PAGE_LIMIT"); }
  const meta: Record<string, string> = {};
  for (const key of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"]) {
    const length = p.FPDF_GetMetaText(doc, key, 0, 0);
    if (length > 100000) { close(); throw new Error("PDF_TEXT_LIMIT"); }
    if (length > 2) { const ptr = alloc(length); try { p.FPDF_GetMetaText(doc, key, ptr, length); meta[key] = Buffer.from(heap().slice(ptr, ptr + length - 2)).toString("utf16le"); } finally { free(ptr); } }
  }
  return {
    module: p, doc, count, meta, close,
    attachments: p.FPDFDoc_GetAttachmentCount(doc), scripts: p.FPDFDoc_GetJavaScriptActionCount(doc),
    async page(index: number, scale = 2) {
      const page = p.FPDF_LoadPage(doc, index); if (!page) throw new Error("INVALID_PDF_PAGE");
      let textPage = 0, bitmap = 0;
      const scratch = alloc(40);
      try {
        const width = Math.ceil(p.FPDF_GetPageWidthF(page)), height = Math.ceil(p.FPDF_GetPageHeightF(page));
        const pixelWidth = Math.ceil(width * scale), pixelHeight = Math.ceil(height * scale); checkPixels(pixelWidth, pixelHeight);
        textPage = p.FPDFText_LoadPage(page); if (!textPage) throw new Error("INVALID_PDF_PAGE");
        const chars = p.FPDFText_CountChars(textPage); if (chars > 100000) throw new Error("PDF_TEXT_LIMIT");
        let text = ""; const glyphs: Glyph[] = [];
        for (let i = 0; i < chars; i++) {
          const unicode = p.FPDFText_GetUnicode(textPage, i);
          if (!unicode) continue;
          if (unicode > 0x10ffff || unicode >= 0xd800 && unicode <= 0xdfff) throw new Error("INVALID_PDF_TEXT");
          const value = String.fromCodePoint(unicode), start = text.length; text += value;
          if (!p.FPDFText_GetCharBox(textPage, i, scratch, scratch + 8, scratch + 16, scratch + 24)) continue;
          const view = new DataView(heap().buffer);
          const left = view.getFloat64(scratch, true), right = view.getFloat64(scratch + 8, true), bottom = view.getFloat64(scratch + 16, true), top = view.getFloat64(scratch + 24, true);
          const corners = [[left, bottom], [left, top], [right, bottom], [right, top]].map(([x, y]) => {
            if (!p.FPDF_PageToDevice(page, 0, 0, width, height, 0, x, y, scratch + 32, scratch + 36)) throw new Error("INVALID_PDF_PAGE");
            const current = new DataView(heap().buffer); return [current.getInt32(scratch + 32, true), current.getInt32(scratch + 36, true)];
          });
          const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
          glyphs.push([start, text.length, Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]);
        }
        bitmap = p.FPDFBitmap_Create(pixelWidth, pixelHeight, 1); if (!bitmap) throw new Error("PIXEL_LIMIT");
        p.FPDFBitmap_FillRect(bitmap, 0, 0, pixelWidth, pixelHeight, 0xffffffff);
        // ANNOT + REVERSE_BYTE_ORDER: render annotations, get RGBA rather than BGRA.
        p.FPDF_RenderPageBitmap(bitmap, page, 0, 0, pixelWidth, pixelHeight, 0, 1 | 16);
        const ptr = p.FPDFBitmap_GetBuffer(bitmap), stride = p.FPDFBitmap_GetStride(bitmap);
        if (stride !== pixelWidth * 4) throw new Error("INVALID_PDF_PAGE");
        const raw = Buffer.from(heap().slice(ptr, ptr + stride * pixelHeight));
        const png = await sharp(raw, { raw: { width: pixelWidth, height: pixelHeight, channels: 4 }, limitInputPixels: PAGE_MAX_PIXELS }).png().toBuffer();
        return { text, glyphs, width, height, scale, png, rotation: p.FPDFPage_GetRotation(page) * 90 };
      } finally { if (bitmap) p.FPDFBitmap_Destroy(bitmap); if (textPage) p.FPDFText_ClosePage(textPage); free(scratch); p.FPDF_ClosePage(page); }
    },
  };
}
