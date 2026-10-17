import{hydrateEntityCorrections,assertEntityCorrections,sealEntityCorrections,archiveEntityCorrections}from './entity-corrections.ts';
import{applyEntityCorrections,materializeEntityCorrections,semanticEntityValue}from '../core/entity-corrections.ts';
import{readPageRotationState,validateRotationPages}from"./page-rotation-state.ts";
import{normalizeStoredDocument}from'./document-normalization.ts';
import{isBinaryFormat,isLegacyWordFormat,isWordFormat,originalDocumentFormat}from'../core/document-format.ts';
import{legacyOutputArtifacts,verifyLegacyDoc,wantsLegacyDoc}from'./legacy-office-output.ts';
import {storeMarkdownSource,loadMarkdownSource,readMarkdownBlockerReview} from './markdown-source.ts';
import {markdownSourceReady,createMarkdownMatchPublisher} from '../core/reference-markdown-progress.ts';
import type {ReferenceMarkdown} from '../core/reference-markdown.ts';
import {eventEnvelope,type ProcessingEvent} from "../core/processing-events.ts";
import {runtimeWhitelistCandidates} from "../core/runtime-rule-update.ts";
import {readLiveRuntimeRules} from './runtime-rules-control.ts';
import {verifiedDocumentSource} from "./document-source.ts";
import {contextualDocumentMarks,contextualDocumentType} from "./recognition-context.ts";
import { profileForFormat } from "../core/presets.ts";
import {fullStarEffectiveMarks} from '../core/full-star-effective.ts';
import { documentSpatialMarks } from './reference-spatial.ts';
import { applyDocumentRoute, rulesetMaterialRoute } from "../core/document-route.ts";
import { renderDocumentVisualPage } from "./visual-replacement.ts";
import { activeDictionary, enabledProfileMarks } from "../core/profile-recognition.ts";
import { detectComplete, filterCompleteNer, recognitionVersion } from "../core/recognition-pipeline.ts";
import { applyReplacementPolicies } from "../core/replacement-policies.ts";
import { parentPort, workerData } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { mergeCandidates } from "../core/redaction.ts";
import { parseFile, exportFile, verifyFile, validateFileMarks, FILE_ERRORS } from "../core/files.ts";
import { assertExportable } from "../core/export-gate.ts";
import {assertTrustedSignatureGroups} from './signature-source-gate.ts';
import {applySignatureLogicalRules,applyRulesPreservingSignatureGroups,assertSignaturePolicyGroups} from '../core/signature-group-policy.ts';
import { textWindow } from "../core/text-window.ts";
import { checkKnownEntities, previewText, searchText } from "../core/review-tools.ts";
import { validateMappingMarks } from "../core/mappings.ts";
import { parseOffice, exportOffice, verifyOffice } from "../core/office.ts";
import { parsePages } from "./page-parser.ts";
import type {PdfOcrCheckpoint} from "./pdf-ocr-checkpoints.ts";
import { exportPages, validatePageExport } from "./page-export.ts";
import { parseOfficeImages, officeImagePlan, exportOfficeImages } from "./office-images.ts";
import { PAGED_FORMATS, validatePageReview, pageBoxes, clearPixels } from "../core/page-redaction.ts";
import type { ParsedPage, Anchor } from "../contracts/index.ts";
import { hash, unseal, seal, readOriginal, readArtifact, writeArtifact, setObjectOwner } from "./storage.ts";
import {scanVisualCandidates} from './visual-scan.ts';
import {pdfSealPauseRequested} from './pdf-seal-control.ts';
import type { ProcessingInput } from "./processing.ts";

let eventSequence=0,eventStage='initializing';
const eventsEnabled=!!workerData.processingEventStream;
function processingEvent(event:ProcessingEvent){if(!eventsEnabled)return;eventStage=event.stage;parentPort!.postMessage(eventEnvelope(event,++eventSequence));}
function pageProcessed(page:ParsedPage,text:string,glyphs:import('../core/ocr.ts').Glyph[],totalPages:number,matches?:import('../contracts/index.ts').Mark[]){processingEvent({type:'page-processed',stage:'ocr',pageNumber:page.index+1,totalPages,ocrCompleted:true,ocrCachePage:{text,width:page.width,height:page.height,previewHash:page.previewHash,mapHash:page.mapHash,glyphs},...matches?{matches,provisional:true as const}:{},coordinateSpace:'canonical-raster'});processingEvent({type:'progress',stage:'ocr',percent:Math.round(50*(page.index+1)/totalPages),message:`已完成 ${page.index+1} / ${totalPages} 页图像文字读取`});}
function effectiveFullStar(d:any){
  if(!isWordFormat(d.source_format)&&d.source_format!=='md')return false;
  const mode=d.documentPolicy?.configuration.exportMode??(d.presetPolicy?.profile?.settings?profileForFormat(d.presetPolicy.profile.settings,d.source_format,d.batchMode).defaultMode:undefined);
  return mode==='full_star';
}
async function profileOutputs(d: any, text: string, bytes: Buffer, format: string, imageTexts?: Record<string,string>,convertLegacy=true) {
  if (!d.presetPolicy?.profile) {const outputs=[{role:"primary" as const,name:`redacted.${format}`,format,bytes}];return convertLegacy?legacyOutputArtifacts(d,text,outputs):outputs;}
  const {buildProfileArtifacts} = await import("./profile-export.ts");
  const outputs=await buildProfileArtifacts({document:d,text,verifiedOutput:bytes,outputFormat:format,filename:`redacted.${format}`,profile:d.presetPolicy.profile.settings,batch:d.batchMode,outputImageTexts:imageTexts});
  if(d.source_format==="txt" && d.documentPolicy?.configuration.outputFormats?.includes("md")) {
    // Literal text is escaped so derived Markdown cannot acquire raw HTML or active source syntax.
    const escaped=bytes.toString("utf8").replace(/([\\`*_[\]{}()#+.!<>|~-])/gu,"\\$1");
    outputs.push({role:"markdown",name:"redacted.md",format:"md",bytes:Buffer.from(escaped)});
  }
  return convertLegacy?legacyOutputArtifacts(d,text,outputs):outputs;
}
async function verifyExpected(d: any, text: string, bytes: Buffer, format: string, artifact: {id:string;hash:string;output_role?:string}, imageTexts?:Record<string,string>) {
  const expected = (await profileOutputs(d,text,bytes,format,imageTexts,false)).find(a => a.role === (artifact.output_role === "word-docx"?"primary":artifact.output_role ?? "primary"));
  if(!expected) throw new Error("ARTIFACT_MISMATCH");
  if(originalDocumentFormat(d)==="doc"&&wantsLegacyDoc(d)&&(artifact.output_role??"primary")==="primary"){const actual=await readOriginal(artifact.id);if(hash(actual)!==artifact.hash)throw new Error("ARTIFACT_MISMATCH");await verifyLegacyDoc(actual,expected.bytes,d,text);return;}
  const actual = isBinaryFormat(expected.format) ? await readOriginal(artifact.id) : Buffer.from(await readArtifact(artifact.id));
  if(hash(actual)!==artifact.hash || !actual.equals(expected.bytes))throw new Error("ARTIFACT_MISMATCH");
}
async function publishOutputs(d: any,text: string,bytes: Buffer,format: string,digest: string,imageTexts?:Record<string,string>) {
  const outputs=await profileOutputs(d,text,bytes,format,imageTexts), artifacts=[];
  for(const output of outputs){
    const id=randomUUID();
    await writeArtifact(id,isBinaryFormat(output.format) ? output.bytes.toString("base64") : output.bytes.toString("utf8"));
    artifacts.push({id,hash:hash(output.bytes),format:output.format,role:output.role,name:output.name,...("legacyVerification" in output?{legacyVerification:output.legacyVerification}:{})});
  }
  return {artifact:artifacts[0],additionalArtifacts:artifacts.slice(1),textLength:text.length,textHash:digest};
}
async function execute(input: ProcessingInput): Promise<any> {
  if(input.kind==='page-rotation')return(await import("./page-rotation.ts")).applyPageRotation(input.doc,input.request,d=>execute({kind:"detect",doc:d}));
  if(input.kind==='legacy-office-normalize')return normalizeStoredDocument(input.doc,input.password);
  let normalizedSource:any;
  if("doc" in input&&input.doc&&input.kind==="detect"&&isLegacyWordFormat(originalDocumentFormat(input.doc))&&!input.doc.normalized_source_id){processingEvent({type:"progress",stage:"parse",message:"正在读取旧版 Word 文档"});normalizedSource=await normalizeStoredDocument(input.doc);input={...input,doc:{...input.doc,...normalizedSource}};}
  if ("doc" in input && ["detect", "export"].includes(input.kind)) setObjectOwner(input.doc.id);
  if(input.kind==='folder-output')return (await import('./folder-output.ts')).writeFolderOutput(input);
  if(input.kind==='folder-output-read')return (await import('./folder-output.ts')).readFolderOutput(input);
  if(input.kind==='entity-filter')return (await import('./review-mark-filter.ts')).filterDocumentEntities(input.doc,input.input,input.marks,input.sourceSlots);
  if(input.kind==='manual-occurrences')return(await import('./manual-occurrences.ts')).planDocumentManualOccurrences(input.doc,input.query);
  if(input.kind==='document-route')return (await import('./reference-route.ts')).detectDocumentRoute(input.doc,input.overrideDocType);
  if(input.kind==='docx-image-ocr')return (await import('./docx-image-ocr.ts')).recognizeDocumentDocxImages(input.doc,d=>execute({kind:'detect',doc:d}) as any);
  if(input.kind==='restoration-batch-file'&&isLegacyWordFormat(input.file.format))return (await import('./legacy-restoration.ts')).restoreLegacyFile({...input.file,bytes:Buffer.from(input.file.bytes)},input.plan);
  if(input.kind==='restoration-batch-file')return (await import("../core/restoration-batch.ts")).restoreBatch([{...input.file,bytes:Buffer.from(input.file.bytes)}],input.plan,progress=>processingEvent({type:"progress",stage:"restore",percent:progress.percent,message:`已完成 ${progress.completed} / ${progress.total} 个文件还原`}));
  if(input.kind==='image-batch-search')return (await import("./image-batch-search.ts")).imageBatchSearch(input.doc,input.query,input.pageIndex);
  if(input.kind==='image-utility')return (await import("./image-utilities.ts")).imageUtility(input);
  if(input.kind==='document-unlock'){
    const source=await readOriginal(input.doc.source_id);if(hash(source)!==input.doc.source_hash)throw new Error('SOURCE_MISMATCH');
    const result=input.doc.source_format==='pdf'?await(await import('../core/document-unlock.ts')).unlockPdfDocument(source,input.password):await(await import('../core/document-unlock-word.ts')).unlockWordDocument(source,input.password);
    if(result.format!==input.doc.source_format)throw new Error('DOCUMENT_UNLOCK_FORMAT_MISMATCH');
    return {bytes:result.bytes,sourceHash:result.sourceHash,derivedHash:hash(result.bytes),format:result.format};
  }
  if (input.kind === "dictionary-import") return (await import("../core/dictionary-workbook.ts")).importDictionary(Buffer.from(input.bytes));
  if (input.kind === "dictionary-export") return (await import("../core/dictionary-workbook.ts")).exportDictionary(input.entries);
  if (input.kind === "download") {
    const output = isBinaryFormat(input.artifact.format??"") ? await readOriginal(input.artifact.id) : await readArtifact(input.artifact.id);
    if (hash(output) !== input.artifact.hash) throw new Error("ARTIFACT_MISMATCH");
    return output;
  }
  if (input.kind === "office-faces") return (await import("./office-visual.ts")).detectDocumentOfficeFaces(input.doc);
  if (input.kind === "docx-layout") return (await import("./docx-layout.ts")).documentDocxLayout(input.doc);
  if (input.kind === "docx-preview") return (await import("./docx-preview.ts")).documentDocxPreview(input.doc);
  if (input.kind === "ocr-text") return (await import("./ocr-correction.ts")).readOcrText(input.doc, input.page!);
  if (input.kind === "ocr-correct") return (await import("./ocr-correction.ts")).correctOcrText(input.doc, input.page!, input.correction!);
  const d = input.kind==='detect'?{...input.doc}:hydrateEntityCorrections(input.doc), aad = `${d.tenant_id}:${d.project_id}:${d.id}`;
  const office = ["docx", "xlsx"].includes(d.source_format);
  const paged = PAGED_FORMATS.includes(d.source_format);
  const embedded = d.source_format === "docx" && !!d.page_data?.length;
  if (input.kind === "page" || input.kind === "visual-detect") {
    const page = (d.page_data as ParsedPage[]).find(p => p.index === input.page);
    if (!page) throw new Error("PAGE_NOT_READY");
    const bytes = await readOriginal(page.previewId);
    if (hash(bytes) !== page.previewHash) throw new Error("SOURCE_MISMATCH");
    if (input.kind === "visual-detect") {
      const visual = await import("../core/visual-detection.ts");
      const result = visual.canonicalVisualResult(await visual.detectVisual(bytes, input.detectors!), page);
      if (d.source_format === "pdf" && input.detectors!.includes("seal")) {
        const source = await verifiedDocumentSource(d);
        const { detectPdfImageSeals } = await import("../core/visual-pdf.ts");
        result.candidates = visual.suppressOverlaps([...result.candidates, ...await detectPdfImageSeals(source, page.index, bytes,readPageRotationState(d).rotations[String(page.index)]??0)]);
      }
      if (["png", "jpg", "jpeg"].includes(d.source_format)) {
        const { filterCertificateSealCandidates } = await import("../core/visual-morphology.ts");
        return { ...result, ...filterCertificateSealCandidates(result.candidates, { text: unseal(d.content, aad), filename: unseal(d.source_name, `${aad}:name`) }, page) };
      }
      return result;
    }
    return bytes;
  }
  let text = unseal(d.content, aad);
  if (input.kind === "replacement-policies") {
    validateFileMarks(text, input.marks!.map(m => ({ ...m, decision: "pending" })), d.source_format, d.anchors);
    return applyReplacementPolicies(text, input.marks!, input.replacementPolicies!, input.mappings,{semanticValue:(mark,index)=>semanticEntityValue(d,mark,text,index)});
  }
  if (input.kind === "page-preview" || input.kind === "partial-page-preview") {
    if(input.kind==='partial-page-preview'&&(d.source_format!=='pdf'||input.page!==0||d.page_data?.length!==1||d.page_data[0]?.index!==0||d.anchors?.length!==1||d.anchors[0]?.kind!=='page'||d.anchors[0]?.page!==0))throw new Error('PDF_OCR_DRAFT_INVALID');
    const policy = validatePageReview(d.page_review, d.page_data), page = (d.page_data as ParsedPage[]).find(p => p.index === input.page);
    if ((!paged && !embedded) || !page || policy.deletedPages.includes(page.index)) throw new Error("PAGE_NOT_READY");
    const source = await readOriginal(page.previewId), map = await readArtifact(page.mapId);
    if (hash(source) !== page.previewHash || hash(map) !== page.mapHash) throw new Error("SOURCE_MISMATCH");
    const marks = input.marks!.map(m => m.decision === "pending" ? { ...m, decision: "ignore" as const } : m);
    const anchors = embedded ? d.anchors.filter((a: Anchor) => a.part === page.part && a.object === "image-text").map((a: Anchor) => ({ ...a, kind: "page", page: page.index })) : d.anchors;
    const boxes = pageBoxes(text, marks, anchors, page, JSON.parse(map), policy);
    return (await renderDocumentVisualPage(d,text,page.index,marks,policy)).png;
  }
  if (input.kind === "entity-seeds") {
    validateFileMarks(text, d.marks.map((m: any) => ({...m,decision:"pending"})), d.source_format, d.anchors);
    const seeds = new Map<string, {value:string;kind:any;replacement?:any}>();
    for (const m of d.marks as import("../contracts/index.ts").Mark[]) {
      if (m.decision === "ignore" || m.sources?.some(s => s.code === "project-whitelist")) continue;
      const value = text.slice(m.start,m.end); if(value.length>2000)throw new Error("KNOWN_ENTITY_VALUE_LIMIT");
      const seed = {value,kind:m.kind,...m.rawEntityType?{rawEntityType:m.rawEntityType}:{},replacement:m.replacement}; seeds.set(JSON.stringify(seed),seed);
    }
    return [...seeds.values()];
  }
  if (input.kind === "mapping-value") {
    if (input.marks?.length !== 1) throw new Error("INVALID_MARKS");
    validateFileMarks(text, input.marks, d.source_format, d.anchors);
    const mark = input.marks[0], value = text.slice(mark.start, mark.end);
    return value;
  }
  if (input.kind === "search") return searchText(text, input.query!, input.offset ?? 0, input.searchScope, input.searchSpans);
  if (input.kind === "known-entities") {
    validateMappingMarks(text, input.marks!, input.mappings ?? []);
    return checkKnownEntities(text, input.marks!, d.source_format, d.anchors, input.entitySeeds);
  }
  if (input.kind === "preview") {
    validateFileMarks(text, input.marks!, d.source_format, d.anchors);
    validateMappingMarks(text, input.marks!, input.mappings ?? []);
    return previewText(text, effectiveFullStar(d)?fullStarEffectiveMarks(input.marks!):input.marks!, input.offset ?? 0);
  }
  if (input.kind === "view") return { ...textWindow(text, input.offset ?? 0), markTexts: Object.fromEntries(d.marks.map((m: any) => [`${m.start}:${m.end}`, text.slice(m.start, Math.min(m.end, m.start + 120)) + (m.end - m.start > 120 ? "…" : "")])) };
  if (input.kind === "review") {
    if (d.page_review != null) { if (!paged && !embedded) throw new Error("INVALID_PAGE_REVIEW"); const policy = validatePageReview(d.page_review, d.page_data); if (embedded && policy.deletedPages.length) throw new Error("INVALID_PAGE_REVIEW"); }
    validateFileMarks(text, input.marks!, d.source_format, d.anchors);
    validateMappingMarks(text, input.marks!, input.mappings ?? []);
    return {};
  }
  if (input.kind === "detect") {
    let anchors: Anchor[] = [{ kind: "text", start: 0, end: text.length }], coverage: any[] = [{ id: "text", status: "complete" }], pages: ParsedPage[] = [];
    let detectBytes:Buffer=Buffer.alloc(0),markdown:ReferenceMarkdown|undefined;
    const dictionary = d.dictionary ? JSON.parse(unseal(d.dictionary, `${d.tenant_id}:${d.project_id}:dictionary`)) : [];
    const sourceName=d.source_name?unseal(d.source_name,`${aad}:name`):"";
    const manualOnlyPages=new Set<number>(d.source_format==='pdf'?readPageRotationState(d).manualOnlyPages:[]);
    const pdfPageMatches=(pageIndex:number,pageText:string)=>{
      if(manualOnlyPages.has(pageIndex))return [];
      const pageAnchors:Anchor[]=[{kind:'page',page:pageIndex,start:0,end:pageText.length}];
      const preview=detectComplete(pageText,pageAnchors,activeDictionary(dictionary,d.presetPolicy),{filename:sourceName,ocr:true,sourceFormat:'pdf',configuration:d.documentPolicy?.configuration});
      return applyDocumentRoute(pageText,pageAnchors,preview.marks,d.documentPolicy?.configuration,{suppressEvidenceScene:preview.evidenceScene.controlled});
    };
    const pdfPageProcessed=(page:ParsedPage,pageText:string,glyphs:import('../core/ocr.ts').Glyph[],totalPages:number)=>{
      pageProcessed(page,pageText,glyphs,totalPages,pdfPageMatches(page.index,pageText));
    };
    if (d.source_id) {
      const bytes = await verifiedDocumentSource(d);detectBytes=bytes;
      if(["docx","xlsx"].includes(d.source_format)&&bytes.subarray(0,8).equals(Buffer.from("d0cf11e0a1b11ae1","hex")))throw new Error("ENCRYPTED_OFFICE");
      if (d.reuseParsedPages===true || (d.page_data ?? []).some((p: any) => (p.ocrRevision ?? 0) > 0)) {
        if (hash(text) !== d.content_hash) throw new Error("SOURCE_MISMATCH");
        anchors = d.anchors; coverage = d.coverage; pages = d.page_data;
        for (const page of pages) if (hash(await readArtifact(page.mapId)) !== page.mapHash || hash(await readOriginal(page.previewId)) !== page.previewHash) throw new Error("SOURCE_MISMATCH");
      } else {
      const paged = d.source_format === "docx" ? await parseOfficeImages(bytes,pageProcessed) : ["pdf", "png", "jpg", "jpeg"].includes(d.source_format) ? await parsePages(bytes, d.source_format,d.source_format==='pdf'?pdfPageProcessed:pageProcessed,{rotations:d.source_format==="pdf"?readPageRotationState(d).rotations:undefined,manualOnlyPages:d.source_format==="pdf"?readPageRotationState(d).manualOnlyPages:undefined,cachedPages:d.source_format==="pdf"?input.pdfOcrCheckpointPages:undefined,onCheckpoint:d.source_format==="pdf"?(frame:PdfOcrCheckpoint)=>parentPort!.postMessage({type:"pdf-ocr-checkpoint",frame:{...frame,provisionalMatches:pdfPageMatches(frame.page.index,frame.text)}}):undefined}) : undefined;
      const parsed = paged ?? (office ? await parseOffice(bytes, d.source_format) : parseFile(bytes, d.source_format,{fileName:d.source_name?unseal(d.source_name,`${aad}:name`):undefined}));
      text = parsed.text; anchors = parsed.anchors; coverage = parsed.coverage;
      if("markdown" in parsed)markdown=parsed.markdown as ReferenceMarkdown|undefined;
      if(markdown)processingEvent(markdownSourceReady(markdown));
      pages = paged?.pages ?? [];
      }
    }
    if(d.source_format==='pdf')validateRotationPages(readPageRotationState(d),pages);
    processingEvent({type:'progress',stage:'recognize',message:'正在核对文字中的敏感信息',processedTextEnd:0,totalTextLength:text.length});
    const complete = detectComplete(text, anchors, activeDictionary(dictionary, d.presetPolicy), { filename: d.source_name ? unseal(d.source_name, `${aad}:name`) : "", ocr: pages.length > 0, sourceFormat:d.source_format,configuration:d.documentPolicy?.configuration });
    let marks = applyDocumentRoute(text, anchors, complete.marks, d.documentPolicy?.configuration,{suppressEvidenceScene:complete.evidenceScene.controlled}), nerVersion: string | null = null;
    if(markdown)await createMarkdownMatchPublisher(text.length,"rules",processingEvent)({processedTextEnd:text.length,totalTextLength:text.length,matches:marks});
    const markdownNer=markdown?createMarkdownMatchPublisher(text.length,"ner",processingEvent):undefined;
    const pdfNer=d.source_format==='pdf'&&pages.length&&eventsEnabled?async(event:{processedTextEnd:number;totalTextLength:number;matches:import('../contracts/index.ts').Mark[]})=>{
      for(const page of pages){const anchor=anchors.find(a=>a.kind==='page'&&a.page===page.index);if(!anchor||manualOnlyPages.has(page.index))continue;
        const matches=event.matches.filter(m=>m.start>=anchor.start&&m.end<=anchor.end);
        if(matches.length)processingEvent({type:'page-processed',stage:'recognize',pageNumber:page.index+1,totalPages:pages.length,ocrCompleted:true,matches,coordinateSpace:'canonical-raster'});
      }
    }:undefined;
    if(pages.length) marks = mergeCandidates(text,marks,await documentSpatialMarks(text,anchors,pages));
    if (d.ner_enabled) {
      const ner = await (await import("../core/ner.ts")).createNer();
      try { marks = mergeCandidates(text, marks, filterCompleteNer(text, await ner.detect(text, anchors,markdownNer||pdfNer?{onProgress:markdownNer??pdfNer}:{}), anchors)); nerVersion = `${ner.version}:${ner.weights}`; marks=await contextualDocumentMarks(detectBytes,text,anchors,pages,d.source_format,marks,{ner:(t,a)=>ner.detect(t,a),configuration:d.documentPolicy?.configuration,documentType:contextualDocumentType(complete.classification.type,d.documentPolicy?.configuration)}); }
      finally { await ner.close(); }
    }
    if(!d.ner_enabled)marks=await contextualDocumentMarks(detectBytes,text,anchors,pages,d.source_format,marks,{configuration:d.documentPolicy?.configuration,documentType:contextualDocumentType(complete.classification.type,d.documentPolicy?.configuration)});
    marks = applySignatureLogicalRules(text,marks,d.presetPolicy?.ruleset?.settings,rulesetMaterialRoute(complete.classification.type,d.documentPolicy?.configuration));
    marks = enabledProfileMarks(marks, d.presetPolicy?.profile?.settings);
    const liveRules=await readLiveRuntimeRules();
    marks=mergeCandidates(text,marks,runtimeWhitelistCandidates(text,anchors,marks,[...(d.runtimeWhitelists??[]),...liveRules]));
    marks=enabledProfileMarks(applyRulesPreservingSignatureGroups(text,anchors,marks,d.presetPolicy?.ruleset?.settings,rulesetMaterialRoute(complete.classification.type,d.documentPolicy?.configuration)),d.presetPolicy?.profile?.settings);
    if(manualOnlyPages.size)marks=marks.filter(mark=>!anchors.some(anchor=>anchor.kind==='page'&&manualOnlyPages.has(anchor.page!)&&mark.start>=anchor.start&&mark.end<=anchor.end));
    assertSignaturePolicyGroups(marks);
    let entityCorrectionsStale=false;try{Object.assign(d,hydrateEntityCorrections({...d,content_hash:hash(text)}));if(d.entityCorrections){assertEntityCorrections(d.entityCorrections,{...d,content_hash:hash(text)});const materialized=materializeEntityCorrections(d,text,marks);marks=materialized.marks;d.entityCorrections=materialized.frame;d.entity_corrections=sealEntityCorrections({...d,content_hash:hash(text)},materialized.frame!);}}catch(error){if((error as Error).message!=='ENTITY_CORRECTION_STALE')throw error;const archived=archiveEntityCorrections(d);if(!archived||archived.frame.sourceHash!==d.source_hash)throw Error('ENTITY_CORRECTION_INVALID');entityCorrectionsStale=true;d.entityCorrections=null;coverage.push({id:'entity-corrections',status:'blocked',reason:'ENTITY_CORRECTION_STALE'});}
    if(markdown)await createMarkdownMatchPublisher(text.length,"contextual",processingEvent)({processedTextEnd:text.length,totalTextLength:text.length,matches:marks});
    const profile=d.presetPolicy?.profile?.settings, style=profile ? profileForFormat(profile, d.source_format === "docx" ? "png" : d.source_format, d.batchMode) : undefined;
    const visual=await scanVisualCandidates(d,text,pages,profile,{sealPaused:pdfSealPauseRequested,onSealPage:(page,candidates,warnings,totalPages)=>processingEvent({type:'pdf-seal-page',stage:'visual',pageNumber:page.index+1,totalPages,previewHash:page.previewHash,candidates:candidates.map(c=>({...c,page:page.index})),warnings})}),visualCandidates=visual.visualCandidates.filter(candidate=>!manualOnlyPages.has(candidate.page)),visualPages=visual.visualPages;
    for(const page of pages){const anchor=anchors.find(a=>d.source_format==='docx'?a.kind==='object'&&a.object==='image-text'&&a.part===page.part:a.kind==='page'&&a.page===page.index);if(anchor)processingEvent({type:'page-processed',stage:'recognize',pageNumber:page.index+1,totalPages:pages.length,ocrCompleted:true,matches:marks.filter(m=>m.start>=anchor.start&&m.end<=anchor.end),canonicalHash:hash(text),coordinateSpace:'canonical-raster'});}
    processingEvent({type:'progress',stage:'recognize',percent:100,message:'识别已完成，请人工复核',processedTextEnd:text.length,totalTextLength:text.length});
    const pageReview=pages.length && style && "maskStyle" in style ? {mode:"unselected",maskStyle:style.maskStyle,regions:[],deletedPages:[]} : null;
    const markdownMetadata=markdown?await storeMarkdownSource(markdown,d.id):undefined;
    return { ...normalizedSource?{normalizedSource}:{},entityCorrectionsStale,entityCorrectionsStored:d.entity_corrections??null,parseVersion:markdown?2:d.parse_version,visualCandidates, pageReview, content: seal(text, aad), hash: hash(text), marks, anchors, coverage, pages, classification: complete.classification, recognition: { ...markdownMetadata?{markdown:markdownMetadata}:{}, rules: recognitionVersion, dictionaryRevision: d.dictionary_revision ?? 0, presetRevision: d.presetPolicy?.revision ?? 0, documentPolicyRevision:d.documentPolicy?.revision??0, documentType:d.documentPolicy?.configuration.documentType??"auto", classification: complete.classification, visual:{complete:visualPages.every(p=>!p.warnings.length),pages:visualPages,...visual.sealProgress?{sealProgress:visual.sealProgress}:{}}, ner: nerVersion, ai: null } };
  }
  if(d.entityCorrections?.entries.some((e:any)=>e.active===false))throw Error('ENTITY_CORRECTION_UNRESOLVED');
  const digest = hash(text);
  if(d.source_format==="md"&&d.parse_version<2&&input.kind!=="verify")throw new Error("MARKDOWN_RECOGNITION_REQUIRED");
  const markdown=d.source_format==="md"&&d.parse_version===2?await loadMarkdownSource(d,text):undefined;
  assertExportable(d, d.revision, text.length, digest, "snapshot" in input?input.snapshot:undefined,
    "automaticBinding" in input?input.automaticBinding:undefined);
  if(input.kind!=="verify")await assertTrustedSignatureGroups(d);
  if (input.kind === "gate") { validateFileMarks(text, d.marks, d.source_format, d.anchors, true); if (paged) await validatePageExport(d, text); if (embedded) await officeImagePlan(d, text); return {}; }
  // Source rr2/ur2 applies full stars to the effective export entities while
  // iy2 keeps the review draft (including manual replacements) for later modes.
  // Project only after the signed snapshot gate so stored marks and revision stay bound.
  const outputDoc=effectiveFullStar(d)
    ? {...d,marks:fullStarEffectiveMarks(d.marks)}
    : d;
  if (paged) {
    const {output,format}=await exportPages(d,text);
    if(input.kind==="verify"){await verifyExpected(d,text,output,format,input.artifact!);return {};}
    return publishOutputs(d,text,output,format,digest);
  }
  if (office) {
    const original=await verifiedDocumentSource(d);
    const images=embedded?await exportOfficeImages(outputDoc,text):undefined;
    const output=await exportOffice(original,d.source_format,text,d.anchors,d.coverage,outputDoc.marks,images);
    const imageTexts=images ? Object.fromEntries(Object.keys(images).sort().map((part,i)=>[`word/media/redacted-${i+1}.png`,images[part].outputText])) : undefined;
    if(input.kind==="verify"){await verifyExpected(outputDoc,text,output,d.source_format,input.artifact!,imageTexts);return {};}
    return publishOutputs(outputDoc,text,output,d.source_format,digest,imageTexts);
  }
  const context={markdown,blockerReview:markdown?await readMarkdownBlockerReview(d):undefined};
  const output=exportFile(text,outputDoc.marks,d.source_format,d.anchors,context);
  verifyFile(text,outputDoc.marks,output,d.source_format,d.anchors,context);
  if(input.kind==="verify"){await verifyExpected(outputDoc,text,Buffer.from(output),d.source_format,input.artifact!);return {};}
  return publishOutputs(outputDoc,text,Buffer.from(output),d.source_format,digest);
}

const heartbeat=eventsEnabled?setInterval(()=>processingEvent({type:'heartbeat',stage:eventStage}),5000):undefined;
try { processingEvent({type:'progress',stage:workerData.kind==='export'?'export':'initializing',message:workerData.kind==='export'?'正在生成并核验副本':'开始读取材料'});const value=await execute(workerData);if(heartbeat)clearInterval(heartbeat);parentPort!.postMessage({type:'processing-result',ok:true,value}); }
catch (error) {
  if(heartbeat)clearInterval(heartbeat);
  const message = (error as Error).message;
  const known = [...FILE_ERRORS, "POLICY_TARGET_NOT_FOUND", "POLICY_VALUE_CONFLICT", "AMBIGUOUS_MAPPING", "DOCX_LAYOUT_LIMIT", "OCR_TEXT_CONFLICT", "OCR_POSITION_REQUIRED", "VISUAL_MODEL_REQUIRED", "VISUAL_MODEL_MISMATCH", "VISUAL_OUTPUT_INVALID", "VISUAL_INPUT_INVALID", "INVALID_SEARCH", "IMAGE_SEARCH_INVALID", "OCR_MAP_INVALID", "KNOWN_ENTITY_VALUE_LIMIT", "KNOWN_ENTITY_SCAN_LIMIT", "INVALID_MARKS", "SIGNATURE_GROUP_INVALID", "SIGNATURE_GROUP_RECOGNITION_REQUIRED", "SIGNATURE_GROUP_RULE_CONFLICT", "OVERLAPPING_MARKS", "RESIDUE_FOUND", "ARTIFACT_MISMATCH", "VERSION_CONFLICT", "DETECTION_INCOMPLETE", "COVERAGE_INCOMPLETE", "SNAPSHOT_MISMATCH", "EXPORT_POLICY_FAILED"];
  parentPort!.postMessage({ type:"processing-result", ok: false, code: known.includes(message) ? message : "PROCESSING_FAILED" });
}
