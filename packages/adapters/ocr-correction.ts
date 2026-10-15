import {rebindPdfTextOrigins} from '../core/pdf-text-origin.ts';
import {runtimeWhitelistCandidates} from "../core/runtime-rule-update.ts";
import {verifiedDocumentSource} from "./document-source.ts";
import {contextualDocumentMarks,contextualDocumentType} from "./recognition-context.ts";
import { activeDictionary, enabledProfileMarks } from "../core/profile-recognition.ts";
import { applyDocumentRoute, rulesetMaterialRoute } from '../core/document-route.ts';
import {applySignatureLogicalRules,applyRulesPreservingSignatureGroups,assertSignaturePolicyGroups} from '../core/signature-group-policy.ts';
import { documentSpatialMarks } from './reference-spatial.ts';
import { detectComplete, filterCompleteNer, recognitionVersion } from "../core/recognition-pipeline.ts";
import { randomUUID } from "node:crypto";
import type { Anchor, Mark, ParsedPage } from "../contracts/index.ts";
import type { OcrCorrectionInput, OcrTextView } from "../contracts/ocr.ts";
import type { Glyph } from "../core/ocr.ts";
import { correctPageText, resetOcrMarks, shiftOcrAnchors } from "../core/ocr-correction.ts";
import { mergeCandidates } from "../core/redaction.ts";
import {entitySpanKey} from '../core/entity-identity.ts';
import { hash, seal, unseal, readArtifact, writeArtifact } from "./storage.ts";
import {scanVisualCandidates} from './visual-scan.ts';
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
export async function correctOcrText(doc: any, index: number, input: OcrCorrectionInput):Promise<{changed:boolean;marks?:Mark[];anchors?:Anchor[];[key:string]:unknown}> {
  const { page, anchor, anchors, aad, text, glyphs } = await load(doc, index);
  const corrected = correctPageText(text.slice(anchor.start, anchor.end), glyphs, input, page.width, page.height);
  if (!corrected.changed) return { changed: false };
  const nextText = text.slice(0, anchor.start) + corrected.text + text.slice(anchor.end), nextAnchors = shiftOcrAnchors(anchors, anchor, corrected.delta);
  const dictionary = doc.dictionary ? JSON.parse(unseal(doc.dictionary, `${doc.tenant_id}:${doc.project_id}:dictionary`)) : [];
  const complete = detectComplete(nextText, nextAnchors, activeDictionary(dictionary, doc.presetPolicy), {ocr:true, sourceFormat:doc.source_format,configuration:doc.documentPolicy?.configuration, filename: doc.source_name ? unseal(doc.source_name, `${aad}:name`) : ""});let candidates=complete.marks,nerVersion:string|null=null;
  candidates = applyDocumentRoute(nextText,nextAnchors,candidates,doc.documentPolicy?.configuration,{suppressEvidenceScene:complete.evidenceScene.controlled});
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
  const materialRoute=rulesetMaterialRoute(complete.classification.type,doc.documentPolicy?.configuration);
  candidates=applySignatureLogicalRules(nextText,candidates,doc.presetPolicy?.ruleset?.settings,materialRoute);
  candidates=enabledProfileMarks(candidates,doc.presetPolicy?.profile?.settings);
  candidates=mergeCandidates(nextText,candidates,runtimeWhitelistCandidates(nextText,nextAnchors,candidates,doc.runtimeWhitelists??[]));
  candidates=enabledProfileMarks(applyRulesPreservingSignatureGroups(nextText,nextAnchors,candidates,doc.presetPolicy?.ruleset?.settings,materialRoute),doc.presetPolicy?.profile?.settings);
  assertSignaturePolicyGroups(candidates);
  const evidence=new Map(candidates.map(mark=>[entitySpanKey(mark),mark.sources??[]])),retained:import('../contracts/index.ts').Mark[]=[],bindings:{beforeIndex:number;mark:import('../contracts/index.ts').Mark}[]=[];
  for(const[beforeIndex,mark]of(doc.marks as import('../contracts/index.ts').Mark[]).entries())for(const next of resetOcrMarks([mark],anchor.start+corrected.start,anchor.start+corrected.end,corrected.delta)){next.sources=[...new Map([...evidence.get(entitySpanKey(next))??[],...next.sources??[]].map(source=>[source.layer+':'+source.code,source])).values()];retained.push(next);bindings.push({beforeIndex,mark:next});}
  // Automatic evidence can merge. Independently reviewed duplicate slots must
  // retain their own policies and histories through this exact edit transform.
  const retainedKeys=new Set(retained.map(entitySpanKey)),marks=[...candidates.filter(m=>!retainedKeys.has(entitySpanKey(m))).map(m=>({...m,decision:'pending' as const})),...retained].sort((a,b)=>a.start-b.start||a.end-b.end),indices=new Map(marks.map((m,index)=>[m,index]));
  // Preview pixels do not change with OCR text, but image certificate filtering
  // does. Re-observe raw candidates with the same detect path before writing.
  const visual=await scanVisualCandidates(doc,nextText,doc.page_data,doc.presetPolicy?.profile?.settings);
  const mapId = randomUUID(), mapHash = await writeArtifact(mapId, JSON.stringify(corrected.glyphs), doc.id);
  const origin = doc.source_format === 'pdf' ? rebindPdfTextOrigins(page,text.slice(anchor.start,anchor.end),corrected.text,doc.source_hash,corrected.start,corrected.end) : null;
  const pages = doc.page_data.map((p: ParsedPage) => p.index === index ? { ...p, ...origin, mapId, mapHash, ocrRevision: (page.ocrRevision ?? 0) + 1 } : p);
  return { changed: true, content: seal(nextText, aad), hash: hash(nextText), marks, anchors: nextAnchors, pages,retainedBindings:bindings.map(binding=>({beforeIndex:binding.beforeIndex,afterIndex:indices.get(binding.mark)!})),
    recognition: { rules: recognitionVersion, dictionaryRevision: doc.dictionary_revision ?? 0, presetRevision:doc.presetPolicy?.revision??0, documentPolicyRevision:doc.documentPolicy?.revision??0, documentType:doc.documentPolicy?.configuration.documentType??'auto', classification:complete.classification, ...(visual.scanned?{visual:{complete:visual.visualPages.every(p=>!p.warnings.length),pages:visual.visualPages}}:{}), ner: nerVersion, ai: null },
    ...(visual.scanned?{visualCandidates:visual.visualCandidates}:{}),correctionRevision: (page.ocrRevision ?? 0) + 1 };
}
