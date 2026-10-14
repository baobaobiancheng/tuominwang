import { randomUUID } from "node:crypto";
import type { Anchor, ParsedPage } from "../contracts/index.ts";
import type { OcrCorrectionInput, OcrTextView } from "../contracts/ocr.ts";
import type { Glyph } from "../core/ocr.ts";
import { correctPageText, resetOcrMarks, shiftOcrAnchors } from "../core/ocr-correction.ts";
import { detect, mergeCandidates, RULES_VERSION } from "../core/redaction.ts";
import { hash, seal, unseal, readArtifact, writeArtifact } from "./storage.ts";
async function load(doc: any, index: number) {
  const page = (doc.page_data as (ParsedPage & { ocrRevision?: number })[] ?? []).find(p => p.index === index);
  if (!page || !["pdf", "png", "jpg", "jpeg", "docx"].includes(doc.source_format)) throw new Error("PAGE_NOT_READY");
  const anchors = doc.anchors as Anchor[], anchor = anchors.find(a => doc.source_format === "docx" ? a.kind === "object" && a.object === "image-text" && a.part === page.part : a.kind === "page" && a.page === index);
  if (!anchor) throw new Error("PAGE_POSITION_MISSING");
  const aad = `${doc.tenant_id}:${doc.project_id}:${doc.id}`, text = unseal(doc.content, aad), map = await readArtifact(page.mapId);
  if (hash(text) !== doc.content_hash || hash(map) !== page.mapHash) throw new Error("SOURCE_MISMATCH");
  return { page, anchor, anchors, aad, text, glyphs: JSON.parse(map) as Glyph[] };
}
export async function readOcrText(doc: any, index: number): Promise<OcrTextView> {
  const { page, anchor, text, glyphs } = await load(doc, index);
  return { revision: doc.revision, page: index, text: text.slice(anchor.start, anchor.end), width: page.width, height: page.height, correctionRevision: page.ocrRevision ?? 0, glyphs };
}
export async function correctOcrText(doc: any, index: number, input: OcrCorrectionInput) {
  const { page, anchor, anchors, aad, text, glyphs } = await load(doc, index);
  const corrected = correctPageText(text.slice(anchor.start, anchor.end), glyphs, input, page.width, page.height);
  if (!corrected.changed) return { changed: false };
  const nextText = text.slice(0, anchor.start) + corrected.text + text.slice(anchor.end), nextAnchors = shiftOcrAnchors(anchors, anchor, corrected.delta);
  const dictionary = doc.dictionary ? JSON.parse(unseal(doc.dictionary, `${doc.tenant_id}:${doc.project_id}:dictionary`)) : [];
  let candidates = detect(nextText, nextAnchors, dictionary), nerVersion: string | null = null;
  if (doc.ner_enabled) {
    const ner = await (await import("../core/ner.ts")).createNer();
    try { candidates = mergeCandidates(nextText, candidates, await ner.detect(nextText, nextAnchors)); nerVersion = `${ner.version}:${ner.weights}`; }
    finally { await ner.close(); }
  }
  const marks = mergeCandidates(nextText, resetOcrMarks(doc.marks, anchor.start + corrected.start, anchor.start + corrected.end, corrected.delta), candidates).map(m => ({ ...m, decision: "pending" as const }));
  const mapId = randomUUID(), mapHash = await writeArtifact(mapId, JSON.stringify(corrected.glyphs), doc.id);
  const pages = doc.page_data.map((p: ParsedPage) => p.index === index ? { ...p, mapId, mapHash, ocrRevision: (page.ocrRevision ?? 0) + 1 } : p);
  return { changed: true, content: seal(nextText, aad), hash: hash(nextText), marks, anchors: nextAnchors, pages,
    recognition: { rules: RULES_VERSION, dictionaryRevision: doc.dictionary_revision ?? 0, ner: nerVersion, ai: null }, correctionRevision: (page.ocrRevision ?? 0) + 1 };
}
