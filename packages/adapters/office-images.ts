import { parseOffice, officeImagePart, type OfficeImages } from "../core/office.ts";
import { readZip } from "../core/office-zip.ts";
import { clearPixels, pageBoxes, validatePageReview } from "../core/page-redaction.ts";
import { createOcr, recognizePage } from "../core/ocr.ts";
import type { Anchor, ParsedPage, Mark } from "../contracts/index.ts";
import { parsePages } from "./page-parser.ts";
import { hash, readArtifact, readOriginal } from "./storage.ts";

export async function parseOfficeImages(bytes: Buffer) {
  const parts = await readZip(bytes), images = [...parts.keys()].filter(officeImagePart).sort();
  if (images.length > 300) throw new Error("PAGE_LIMIT");
  if (!images.length) return { ...await parseOffice(bytes, "docx"), pages: [] };
  const texts: Record<string, string> = {}, pages: ParsedPage[] = [];
  let totalGlyphs = 0;
  for (const part of images) {
    const parsed = await parsePages(parts.get(part)!, /\.png$/i.test(part) ? "png" : "jpg");
    if (parsed.pages.length !== 1) throw new Error("INVALID_IMAGE");
    totalGlyphs += parsed.glyphCount;
    if (totalGlyphs > 1000000) throw new Error("PDF_TEXT_LIMIT");
    texts[part] = parsed.text; pages.push({ ...parsed.pages[0], index: pages.length, part });
  }
  return { ...await parseOffice(bytes, "docx", texts), pages };
}
export async function officeImagePlan(d: any, text: string) {
  const pages = d.page_data as ParsedPage[], policy = validatePageReview(d.page_review, pages, true);
  if (policy.deletedPages.length || new Set(pages.map(p => p.part)).size !== pages.length) throw new Error("INVALID_PAGE_REVIEW");
  const plans = [];
  for (const page of pages) {
    const anchor = (d.anchors as Anchor[]).find(a => a.part === page.part && a.object === "image-text");
    if (!page.part || !officeImagePart(page.part) || !anchor) throw new Error("SOURCE_MISMATCH");
    const map = await readArtifact(page.mapId);
    if (hash(map) !== page.mapHash) throw new Error("SOURCE_MISMATCH");
    plans.push({ page, anchor, boxes: pageBoxes(text, d.marks, [{ ...anchor, kind: "page", page: page.index }], page, JSON.parse(map), policy) });
  }
  return plans;
}
export async function exportOfficeImages(d: any, text: string): Promise<OfficeImages> {
  const plans = await officeImagePlan(d, text), images: OfficeImages = {}, ocr = await createOcr();
  const hidden = new Set((d.marks as Mark[]).filter(m => m.decision === "redact").map(m => text.slice(m.start, m.end).replace(/\s/gu, "")).filter(Boolean));
  try {
    for (const { page, anchor, boxes } of plans) {
      const source = await readOriginal(page.previewId);
      if (hash(source) !== page.previewHash) throw new Error("SOURCE_MISMATCH");
      const { png } = await clearPixels(source, page, boxes), outputText = (await recognizePage(ocr, png)).text;
      if ([...hidden].some(value => outputText.replace(/\s/gu, "").includes(value))) throw new Error("RESIDUE_FOUND");
      images[page.part!] = { text: text.slice(anchor.start, anchor.end), output: png, outputText };
    }
  } finally { await ocr.terminate(); }
  return images;
}
