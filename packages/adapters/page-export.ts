import{resolveEntityGeometry}from'./entity-geometry.ts';
import {verifiedDocumentSource} from "./document-source.ts";
import { renderDocumentVisualPage } from "./visual-replacement.ts";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { clearPixels, pageBoxes, RasterPdf, validatePageReview, OUTPUT_MAX_BYTES } from "../core/page-redaction.ts";
import { openPdf } from "../core/pdf-reader.ts";
import { createOcr, recognizePage, type Glyph } from "../core/ocr.ts";
import type { Mark, ParsedPage } from "../contracts/index.ts";
import { hash, readArtifact, readOriginal } from "./storage.ts";
import { validateFileMarks } from "../core/files.ts";

export async function validatePageExport(d: any, text: string) {
  const pages = d.page_data as ParsedPage[], policy = validatePageReview(d.page_review, pages, true);
  validateFileMarks(text, d.marks, d.source_format, d.anchors, true);
  const boxes = new Map<number, ReturnType<typeof pageBoxes>>();
  for (const page of pages) if (!policy.deletedPages.includes(page.index)) {
    const map = await readArtifact(page.mapId);
    if (hash(map) !== page.mapHash) throw new Error("SOURCE_MISMATCH");
    let glyphs: Glyph[];
    try { glyphs = JSON.parse(map); if (!Array.isArray(glyphs) || glyphs.some(g => !Array.isArray(g))) throw new Error(); }
    catch { throw new Error("PAGE_POSITION_MISSING"); }
    boxes.set(page.index, pageBoxes(text, d.marks, d.anchors, page, glyphs, policy,resolveEntityGeometry(d,d.marks,policy,page,glyphs,text)));
  }
  return { pages, policy, boxes };
}
export async function exportPages(d: any, text: string) {
  const { pages, policy, boxes } = await validatePageExport(d, text);
  const original = await verifiedDocumentSource(d);
  const pdf = d.source_format === "pdf" ? new RasterPdf() : undefined;
  let image: Buffer | undefined;
  const selected = new Set((d.marks as Mark[]).filter(m => m.decision === "redact").map(m => text.slice(m.start, m.end).replace(/\s/gu, "")).filter(Boolean));
  const ocr = await createOcr(), hashes: string[] = [], kept = pages.filter(p => !policy.deletedPages.includes(p.index));
  try {
    for (const page of kept) {
      const source = await readOriginal(page.previewId);
      if (hash(source) !== page.previewHash) throw new Error("SOURCE_MISMATCH");
      const cleared = await renderDocumentVisualPage(d, text, page.index, d.marks, policy);
      const recognized = (await recognizePage(ocr, cleared.png)).text.replace(/\s/gu, "");
      if ([...selected].some(value => recognized.includes(value))) throw new Error("RESIDUE_FOUND");
      hashes.push(createHash("sha256").update(cleared.rgb).digest("hex"));
      if (pdf) pdf.add(page, cleared.rgb, cleared.width, cleared.height); else image = cleared.png;
    }
  } finally { await ocr.terminate(); }
  const output = pdf ? pdf.finish() : image!;
  if (output.length > OUTPUT_MAX_BYTES) throw new Error("OUTPUT_SIZE_LIMIT");
  if (pdf) {
    const reopened = await openPdf(output);
    try {
      if (reopened.count !== kept.length || reopened.attachments || reopened.scripts || Object.keys(reopened.meta).length) throw new Error("PIXEL_VERIFICATION_FAILED");
      for (let i = 0; i < kept.length; i++) {
        const page = await reopened.page(i);
        if (page.text || page.width !== kept[i].width || page.height !== kept[i].height) throw new Error("PIXEL_VERIFICATION_FAILED");
        const rgb = await sharp(page.png).removeAlpha().raw().toBuffer();
        if (createHash("sha256").update(rgb).digest("hex") !== hashes[i]) throw new Error("PIXEL_VERIFICATION_FAILED");
      }
    } finally { reopened.close(); }
  } else {
    const meta = await sharp(output).metadata();
    if (meta.exif || meta.xmp || meta.icc || meta.iptc || (meta.pages ?? 1) !== 1) throw new Error("PIXEL_VERIFICATION_FAILED");
  }
  return { output, format: pdf ? "pdf" : "png" };
}
