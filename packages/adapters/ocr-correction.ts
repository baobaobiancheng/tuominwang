import {applyActiveRulesetCandidates} from "../core/user-memory-rules.ts";
import {runtimeWhitelistCandidates} from "../core/runtime-rule-update.ts";
import {verifiedDocumentSource} from "./document-source.ts";
import {contextualDocumentMarks,contextualDocumentType} from "./recognition-context.ts";
import { activeDictionary, enabledProfileMarks } from "../core/profile-recognition.ts";
import { applyDocumentRoute } from '../core/document-route.ts';
import { documentSpatialMarks } from './reference-spatial.ts';
import { detectComplete, filterCompleteNer, recognitionVersion } from "../core/recognition-pipeline.ts";
import { randomUUID } from "node:crypto";
import type { Anchor, ParsedPage } from "../contracts/index.ts";
import type { OcrCorrectionInput, OcrTextView } from "../contracts/ocr.ts";
import type { Glyph } from "../core/ocr.ts";
import { correctPageText, resetOcrMarks, shiftOcrAnchors } from "../core/ocr-correction.ts";
import { mergeCandidates } from "../core/redaction.ts";
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
  const complete = detectComplete(nextText, nextAnchors, activeDictionary(dictionary, doc.presetPolicy), {ocr:true, screenshot:['png','jpg','jpeg'].includes(doc.source_format), filename: doc.source_name ? unseal(doc.source_name, `${aad}:name`) : ""});let candidates=complete.marks,nerVersion:string|null=null;
  candidates = applyDocumentRoute(nextText,nextAnchors,candidates,doc.documentPolicy?.configuration);
  candidates = mergeCandidates(nextText,candidates,await documentSpatialMarks(nextText,nextAnchors,doc.page_data,new Map([[index,corrected.glyphs]])));
  const bytes=doc.source_id?await verifiedDocumentSource(doc):Buffer.alloc(0),overrides=new Map([[index,corrected.glyphs]]);
  if (doc.ner_enabled) {
    const ner = await (await import("../core/ner.ts")).createNer();
    try { candidates = mergeCandidates(nextText, candidates, filterCompleteNer(nextText, await ner.detect(nextText, nextAnchors), nextAnchors)); nerVersion = `${ner.version}:${ner.weights}`;candidates=await contextualDocumentMarks(bytes,nextText,nextAnchors,doc.page_data,doc.source_format,candidates,{ner:(t,a)=>ner.detect(t,a),overrides,configuration:doc.documentPolicy?.configuration,documentType:contextualDocumentType(complete.classification.type,doc.documentPolicy?.configuration)}); }
    finally { await ner.close(); }
  }
  if(!doc.ner_enabled)candidates=await contextualDocumentMarks(bytes,nextText,nextAnchors,doc.page_data,doc.source_format,candidates,{overrides,configuration:doc.documentPolicy?.configuration,documentType:contextualDocumentType(complete.classification.type,doc.documentPolicy?.configuration)});
  // Fresh automatic findings follow the enabled profile. Unaffected human
  // choices and replacements survive correction, while every decision resets.
  candidates=enabledProfileMarks(candidates,doc.presetPolicy?.profile?.settings);
  candidates=mergeCandidates(nextText,candidates,runtimeWhitelistCandidates(nextText,nextAnchors,candidates,doc.runtimeWhitelists??[]));
  candidates=enabledProfileMarks(applyActiveRulesetCandidates(nextText,nextAnchors,candidates,doc.presetPolicy?.ruleset?.settings,contextualDocumentType(complete.classification.type,doc.documentPolicy?.configuration)),doc.presetPolicy?.profile?.settings);
  const retained=resetOcrMarks(doc.marks, anchor.start + corrected.start, anchor.start + corrected.end, corrected.delta);
  const marks = mergeCandidates(nextText,candidates,retained).map(m => ({ ...m, decision: "pending" as const }));
  const mapId = randomUUID(), mapHash = await writeArtifact(mapId, JSON.stringify(corrected.glyphs), doc.id);
  const pages = doc.page_data.map((p: ParsedPage) => p.index === index ? { ...p, mapId, mapHash, ocrRevision: (page.ocrRevision ?? 0) + 1 } : p);
  return { changed: true, content: seal(nextText, aad), hash: hash(nextText), marks, anchors: nextAnchors, pages,
    recognition: { rules: recognitionVersion, dictionaryRevision: doc.dictionary_revision ?? 0, presetRevision:doc.presetPolicy?.revision??0, documentPolicyRevision:doc.documentPolicy?.revision??0, documentType:doc.documentPolicy?.configuration.documentType??'auto', ner: nerVersion, ai: null }, correctionRevision: (page.ocrRevision ?? 0) + 1 };
}
