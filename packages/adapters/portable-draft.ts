import {verifiedDocumentSource} from './document-source.ts';
import {runProcessing} from './processing.ts';
import {reviewEntityWasUserAdded} from '../core/review-type-hide.ts';
import {reviewEntityBirth} from '../core/review-entity-birth.ts';
import {mappingMatchesEntity,mappingMatchesValue} from "../core/mappings.ts";
import {sameEntity,entitySpanKey} from '../core/entity-identity.ts';
import { randomUUID } from "node:crypto";
import type { Anchor, Mark } from "../contracts/index.ts";
import{isWordFormat}from'../core/document-format.ts';
import type { Glyph } from "../core/ocr.ts";
import type {RuntimeWhitelist} from "../core/runtime-rule-update.ts";
import { correctPageText, shiftOcrAnchors } from "../core/ocr-correction.ts";
import { validateMarks, mergeCandidates } from "../core/redaction.ts";
import type {DocumentPolicy} from '../contracts/document-policy.ts';
import { validatePageReview } from "../core/page-redaction.ts";
import { hash, readArtifact, readOriginal, removeOwnedArtifact, seal, unseal, writeArtifact } from "./storage.ts";
import sharp from "sharp";
import { PAGE_MAX_PIXELS } from "../core/pdf-reader.ts";
async function previewPixels(bytes: Buffer) { try { return await sharp(bytes, { limitInputPixels: PAGE_MAX_PIXELS, failOn: "warning" }).flatten({ background: "white" }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true }); } catch { throw new Error("PORTABLE_DRAFT_PREVIEW_INVALID"); } }
function glyphMap(source: string): Glyph[] { try { const value = JSON.parse(source); if (!Array.isArray(value) || value.length > 200000 || value.some(g => !Array.isArray(g))) throw new Error(); return value; } catch { throw new Error("PORTABLE_DRAFT_MAP_INVALID"); } }
export async function restorePortableDraft(d: any, old: any, assets: any[], mappings: any[], dictionary: any[], presetPolicy: any, documentPolicy:DocumentPolicy|null, runtimeWhitelists:readonly RuntimeWhitelist[]=[], dictionaryRevision=0) {
  const aad = `${d.tenant_id}:${d.project_id}:${d.id}`, source = await readOriginal(d.source_id), original = unseal(d.content, aad);
  if (hash(source) !== d.source_hash || hash(source) !== old.sourceHash || hash(original) !== d.content_hash || old.format !== d.source_format || !old.content.isWellFormed() || hash(old.content) !== old.contentHash) throw new Error("PORTABLE_DRAFT_SOURCE_MISMATCH");
  await verifiedDocumentSource(d);
  let text = original, anchors = (d.anchors as Anchor[]).map(a => ({ ...a })); const pages = (d.page_data ?? []).map((p: any) => ({ ...p })); const rebuilt: number[] = [],createdArtifactIds:string[]=[];
  try {
  if (assets.length !== pages.length || new Set(assets.map(p => p.index)).size !== assets.length) throw new Error("PORTABLE_DRAFT_PAGE_MISMATCH");
  if (!Array.isArray(old.anchors) || old.anchors.some((a: any) => !Number.isSafeInteger(a.start) || !Number.isSafeInteger(a.end) || a.start < 0 || a.end < a.start || a.end > old.content.length)) throw new Error("PORTABLE_DRAFT_ANCHOR_INVALID");
  for (const page of pages) {
    const saved = assets.find((p: any) => p.index === page.index); if (!saved || saved.width !== page.width || saved.height !== page.height || saved.rotation !== page.rotation || saved.part !== page.part) throw new Error("PORTABLE_DRAFT_PAGE_MISMATCH");
    const actualPreview = await readOriginal(page.previewId), oldPreview = await readOriginal(saved.previewId), actualMap = await readArtifact(page.mapId), oldMap = await readArtifact(saved.mapId);
    if (hash(actualPreview) !== page.previewHash || hash(oldPreview) !== saved.previewHash || hash(actualMap) !== page.mapHash || hash(oldMap) !== saved.mapHash) throw new Error("PORTABLE_DRAFT_SOURCE_MISMATCH");
    const raw = await previewPixels(actualPreview), other = await previewPixels(oldPreview);
    if (raw.info.width !== other.info.width || raw.info.height !== other.info.height || !raw.data.equals(other.data)) throw new Error("PORTABLE_DRAFT_PREVIEW_MISMATCH");
    const findAnchor = (list: Anchor[]) => list.find(a => isWordFormat(d.source_format) ? a.kind === "object" && a.object === "image-text" && a.part === page.part : a.kind === "page" && a.page === page.index), target = findAnchor(anchors), savedAnchor = findAnchor(old.anchors);
    if (!target || !savedAnchor) throw new Error("PORTABLE_DRAFT_ANCHOR_INVALID");
    const freshText = text.slice(target.start, target.end), desiredText = old.content.slice(savedAnchor.start, savedAnchor.end), glyphs = glyphMap(actualMap), oldGlyphs = glyphMap(oldMap);
    const physical = new Set(glyphs.map(g => g.slice(2).join(":"))), recovered = new Set<string>();
    if (!Array.isArray(oldGlyphs) || oldGlyphs.length > 200000) throw new Error("PORTABLE_DRAFT_MAP_INVALID");
    const boundary = (i: number) => !(i > 0 && i < desiredText.length && /[\uD800-\uDBFF]/u.test(desiredText[i - 1]) && /[\uDC00-\uDFFF]/u.test(desiredText[i]));
    for (const g of oldGlyphs) {
      if (g.length !== 6 || !g.every(Number.isFinite) || !Number.isInteger(g[0]) || !Number.isInteger(g[1]) || g[0] < 0 || g[1] <= g[0] || g[1] > desiredText.length || g[2] < 0 || g[3] < 0 || g[4] < 0 || g[5] < 0 || g[2] + g[4] > page.width || g[3] + g[5] > page.height || !physical.has(g.slice(2).join(":"))) throw new Error("PORTABLE_DRAFT_MAP_INVALID");
      recovered.add(g.slice(2).join(":"));
      if (!boundary(g[0]) || !boundary(g[1])) throw new Error("PORTABLE_DRAFT_MAP_INVALID");
    }
    if (glyphs.some(g => g[4] > 0 && g[5] > 0 && !recovered.has(g.slice(2).join(":")))) throw new Error("PORTABLE_DRAFT_MAP_INCOMPLETE");
    if (freshText === desiredText) continue;
    if (!saved.ocrRevision || !freshText.length) throw new Error("PORTABLE_DRAFT_TEXT_CHANGED");
    const corrected = correctPageText(freshText, glyphs, { revision: 0, start: 0, end: freshText.length, expectedText: freshText, text: desiredText }, page.width, page.height);
    if (JSON.stringify(corrected.glyphs) !== JSON.stringify(oldGlyphs)) rebuilt.push(page.index);
    text = text.slice(0, target.start) + corrected.text + text.slice(target.end); anchors = shiftOcrAnchors(anchors, target, corrected.delta); const mapId = randomUUID();createdArtifactIds.push(mapId);const mapHash = await writeArtifact(mapId, JSON.stringify(corrected.glyphs), d.id); Object.assign(page, { mapId, mapHash, ocrRevision: saved.ocrRevision });
  }
  if (text !== old.content) throw new Error("PORTABLE_DRAFT_TEXT_CHANGED");
  const signature = (a: Anchor) => JSON.stringify([a.kind, a.part ?? null, a.object ?? null, a.page ?? null, a.row ?? null, a.column ?? null, a.start, a.end]);
  // Migration 002 pasted TXT has no parse anchors/coverage. Exact source+text
  // equivalence permits canonicalizing only that documented legacy shape.
  const legacyText = d.source_format === "txt" && old.anchors.length === 0 && Array.isArray(old.coverage) && old.coverage.length === 0 && Array.isArray(old.pages) && old.pages.length === 0 && anchors.length === 1 && anchors[0].kind === "text" && anchors[0].start === 0 && anchors[0].end === text.length;
  if (!legacyText && (anchors.length !== old.anchors.length || anchors.some((a, i) => signature(a) !== signature(old.anchors[i])))) throw new Error("PORTABLE_DRAFT_ANCHOR_MISMATCH");
  const byId = new Map(mappings.map(m => [m.id, m])), imported = (old.marks as Mark[]).map((m,index) => {
    let replacement = m.replacement; if (replacement?.mode === "alias") { const ref=replacement;const direct=byId.get(ref.mappingId),matches=mappings.filter(candidate=>candidate.token===ref.token&&candidate.version===ref.version&&mappingMatchesValue(candidate,text.slice(m.start,m.end))&&mappingMatchesEntity(candidate,m)),mapping=direct??(matches.length===1?matches[0]:undefined); if (!mapping || mapping.version!==ref.version||mapping.token!==ref.token||!mappingMatchesValue(mapping,text.slice(m.start,m.end)) || !mappingMatchesEntity(mapping,m)) throw new Error("PORTABLE_DRAFT_MAPPING_MISMATCH"); replacement = { ...replacement, mappingId: mapping.id, version: mapping.version }; }
    const {signatureGroup:_foreignGroup,...portable}=m;
    return { ...portable, userAdded:m.hiddenByType?reviewEntityWasUserAdded(m):reviewEntityBirth(m,old.reviewProvenance?.entries.find((e:any)=>e.active&&e.markIndex===index)),decision: m.hiddenByType===true?"ignore" as const:"pending" as const, ...(replacement ? { replacement } : {}), sources: m.hiddenByType===true?m.sources:[{ layer: "manual" as const, code: "imported-draft-requires-review" }] };
  });
  validateMarks(text, imported);
  // Reuse the complete isolated recognizer against the already verified canonical
  // text and authenticated page maps. It produces fresh candidates only: neither
  // the imported review decisions nor any current correction frame enters it.
  const freshDoc={...d,content:seal(text,aad),content_hash:hash(text),anchors,page_data:pages,reuseParsedPages:true,
    dictionary:seal(JSON.stringify(dictionary),`${d.tenant_id}:${d.project_id}:dictionary`),dictionary_revision:dictionaryRevision,presetPolicy,documentPolicy,
    runtimeWhitelists,entity_corrections:null,entityCorrections:null,page_review:null,marks:[]};
  const detected=await runProcessing<any>({kind:'detect',doc:freshDoc},{timeoutMs:1800000});
  if(detected.hash!==hash(text)||unseal(detected.content,aad)!==text||JSON.stringify(detected.anchors)!==JSON.stringify(anchors)||JSON.stringify(detected.pages)!==JSON.stringify(pages))throw new Error('PORTABLE_DRAFT_SOURCE_MISMATCH');
  const fresh=detected.marks as Mark[],signatureMarks=fresh.filter(m=>m.signatureGroup);
  validateMarks(text,fresh);
  const base=fresh.map(m=>m.signatureGroup?{...m,decision:'pending' as const,replacement:undefined,replacementOrigin:undefined,hiddenByType:undefined,hiddenTypeWasUserAdded:undefined}:m),safeImported=imported.filter(m=>!signatureMarks.some(s=>m.start<s.end&&m.end>s.start)),importedKeys=new Set(safeImported.map(entitySpanKey)),marks=[...base.filter(m=>!importedKeys.has(entitySpanKey(m))),...safeImported].sort((a,b)=>a.start-b.start||a.end-b.end);const restoredMarkIndices=imported.map(mark=>safeImported.includes(mark)?marks.indexOf(mark):-1);const unresolved=imported.filter(m=>!safeImported.includes(m)).map(m=>({category:'signature-group',reason:'PORTABLE_SIGNATURE_REVIEW_REQUIRED',source:{start:m.start,end:m.end,kind:m.kind}}));
  const regionCandidates = old.pageReview ? validatePageReview(old.pageReview, pages).regions : [], deletedPageCandidates = old.pageReview ? validatePageReview(old.pageReview, pages).deletedPages : [];
  return { content: seal(text, aad), hash: hash(text), anchors, pages, marks, restoredMarkIndices,entityCorrections:null,unresolved,createdArtifactIds,visualCandidates:detected.visualCandidates??[],recognition:{...d.recognition,...detected.recognition,...d.recognition?.markdown?{markdown:d.recognition.markdown}:{}},pageReview: pages.length ? { mode: "unselected", regions: [], deletedPages: [], ...(old.pageReview?.maskStyle ? { maskStyle: old.pageReview.maskStyle } : {}) } : null, regionCandidates, deletedPageCandidates, rebuiltMapPages: rebuilt };
  } catch(error) { await Promise.allSettled(createdArtifactIds.map(id=>removeOwnedArtifact(id,d.id))); throw error; }
}
