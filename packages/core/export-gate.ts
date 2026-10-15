import{processingDocument,isLegacyWordFormat,originalDocumentFormat}from'./document-format.ts';
import {assertSignatureGroups} from './review-groups.ts';
import {createHash} from 'node:crypto';
import { z } from "zod";
import { MAX_MARKS, markSchema } from "../contracts/index.ts";
import policy from "./export-policy.generated.js";
import { isDeepStrictEqual } from "node:util";
import { PAGED_FORMATS, validatePageReview } from "./page-redaction.ts";
import type { ParsedPage } from "../contracts/index.ts";

type Document = {
  id: string; tenant_id: string; project_id: string; revision: number; state: string;
  source_id: string | null; source_hash?:string|null; source_format: string; parse_version: number; content_hash: string;
  normalized_source_id?:string|null;normalized_source_hash?:string|null;normalization_source_hash?:string|null;normalization_metadata?:string|null;
  marks: unknown; anchors: unknown; coverage: unknown; recognition?: unknown; page_review?: unknown; page_data?: ParsedPage[];
};
type Snapshot = {
  document_id: string; tenant_id: string; project_id: string; revision: number;
  parse_version: number; content_hash: string; marks: unknown; recognition?: unknown; page_review?: unknown; page_data?: unknown;
};
const anchorsSchema = z.array(z.object({
  kind: z.enum(["text", "cell", "object", "page"]), start: z.number().int().nonnegative(), end: z.number().int().nonnegative(),
  page: z.number().int().min(0).max(299).optional(),
  row: z.number().int().positive().optional(), column: z.number().int().positive().optional(),
  part: z.string().min(1).optional(), object: z.string().min(1).optional(),
})).max(20000);
const coverageSchema = z.array(z.object({ id: z.string().min(1), status: z.literal("complete"), objects: z.array(z.string().min(1)).max(10000).optional() })).max(20000);

// The TS bridge is tested separately: Bend proves the Boolean policy, not parser correctness.
export function coverageComplete(d: Document, textLength: number) {
  if(isLegacyWordFormat(originalDocumentFormat(d))&&(!d.normalized_source_id||!d.normalized_source_hash||d.normalization_source_hash!==d.source_hash||!d.normalization_metadata))return false;
  d=processingDocument(d);
  const paged = PAGED_FORMATS.includes(d.source_format);
  if (!["txt", "md", "csv", "docx", "xlsx", ...PAGED_FORMATS].includes(d.source_format) || !Number.isSafeInteger(textLength) || textLength < (paged || d.source_format === "md" && d.parse_version === 2 ? 0 : 1)) return false;
  const coverage = coverageSchema.safeParse(d.coverage), anchors = anchorsSchema.safeParse(d.anchors);
  if (!coverage.success || !anchors.success) return false;
  const seen = new Set(coverage.data.map(item => item.id));
  if (seen.size !== coverage.data.length) return false;
  if (paged) {
    const pages = d.page_data ?? [];
    try { validatePageReview(d.page_review, pages, true); } catch { return false; }
    if (!d.source_id || (d.source_format !== "pdf" && pages.length !== 1) || seen.size !== pages.length + (d.source_format === "pdf" ? 1 : 0) || pages.some(p => !seen.has(`page:${p.index}`)) || d.source_format === "pdf" && !seen.has("metadata")) return false;
    let end = -1, pageIndex = 0; const metadata = new Set<string>();
    for (const anchor of anchors.data) {
      if (anchor.start !== end + 1 || anchor.end < anchor.start || anchor.end > textLength) return false;
      if (anchor.kind === "page") { if (metadata.size || anchor.page !== pageIndex++ || !pages[anchor.page]) return false; }
      else if (d.source_format === "pdf" && anchor.kind === "object" && anchor.part === "metadata" && anchor.object && !metadata.has(anchor.object)) metadata.add(anchor.object);
      else return false;
      end = anchor.end;
    }
    return pageIndex === pages.length && end === textLength;
  }
  if (["docx", "xlsx"].includes(d.source_format)) {
    const inventory = coverage.data.find(c => c.id === "package")?.objects;
    if (!d.source_id || !inventory?.length || inventory.length !== seen.size - 1 || new Set(inventory).size !== inventory.length || inventory.some(id => id === "package" || !seen.has(id))) return false;
    let end = -1; const objects = new Set<string>();
    for (const anchor of anchors.data) {
      const key = `${anchor.part}\0${anchor.object}`;
      if (anchor.kind !== "object" || !anchor.part || !anchor.object || !inventory.includes(anchor.part) || objects.has(key) || anchor.start !== end + 1 || anchor.end < anchor.start || anchor.end > textLength) return false;
      objects.add(key); end = anchor.end;
    }
    const pages = d.page_data ?? [];
    if (pages.length) {
      try { const policy = validatePageReview(d.page_review, pages, true); if (d.source_format !== "docx" || policy.deletedPages.length) return false; } catch { return false; }
      const imageAnchors = anchors.data.filter(a => a.object === "image-text");
      if (imageAnchors.length !== pages.length || new Set(pages.map(p => p.part)).size !== pages.length || pages.some(p => !p.part || !imageAnchors.some(a => a.part === p.part))) return false;
    }
    return end === textLength;
  }
  if(d.source_format==='md'&&d.parse_version>=2){
    const metadata=z.object({version:z.literal('markdown-source-2'),parseVersion:z.literal(2),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/u),scanTextSha256:z.string().regex(/^[a-f0-9]{64}$/u),scanTextLength:z.number().int().nonnegative(),sidecarId:z.uuid(),sidecarHash:z.string().regex(/^[a-f0-9]{64}$/u),anchorsHash:z.string().regex(/^[a-f0-9]{64}$/u),coverageHash:z.string().regex(/^[a-f0-9]{64}$/u),blockerReviewId:z.uuid().optional(),blockerReviewHash:z.string().regex(/^[a-f0-9]{64}$/u).optional()}).strict().safeParse((d.recognition as any)?.markdown);
    if(!metadata.success||!!metadata.data.blockerReviewId!==!!metadata.data.blockerReviewHash||d.parse_version!==2||!d.source_id||metadata.data.sourceSha256!==d.source_hash||metadata.data.scanTextSha256!==d.content_hash||metadata.data.scanTextLength!==textLength||coverage.data.length!==1||!seen.has('markdown-source'))return false;
    const inventory=coverage.data[0].objects;if(!inventory||inventory.length!==anchors.data.length||new Set(inventory).size!==inventory.length)return false;
    let end=0;for(const [i,a]of anchors.data.entries()){if(a.kind!=='object'||a.part!=='markdown'||a.object!==`markdown-block:${i+1}`||inventory[i]!==a.object||a.start<end||a.start>end+1||i===0&&a.start!==0||a.end<=a.start||a.end>textLength||a.row!==undefined||a.column!==undefined||a.page!==undefined)return false;end=a.end;}
    const sha=(s:string)=>createHash('sha256').update(s).digest('hex'),anchorHash=sha(JSON.stringify(anchors.data.map(a=>[a.kind,a.start,a.end,a.part??null,a.object??null]))),coverageHash=sha(JSON.stringify(coverage.data.map(c=>[c.id,c.status,c.objects??null])));
    return end===textLength&&metadata.data.anchorsHash===anchorHash&&metadata.data.coverageHash===coverageHash;
  }
  // Migration 002 predates anchors for existing pasted text. Only this explicit legacy case is permitted.
  if (d.source_id === null && d.source_format === "txt" && !anchors.data.length && !coverage.data.length) return true;
  if (d.source_format !== "csv") {
    const [anchor] = anchors.data;
    return anchors.data.length === 1 && anchor.kind === "text" && anchor.start === 0 && anchor.end === textLength
      && coverage.data.length === 1 && seen.has("text");
  }
  let end = -1, row = 1, column = 0;
  const expected = new Set<string>();
  for (const anchor of anchors.data) {
    if (anchor.row === row + 1) { row++; column = 0; }
    column++;
    if (anchor.kind !== "cell" || anchor.row !== row || anchor.column !== column || anchor.start !== end + 1 || anchor.end < anchor.start || anchor.end > textLength) return false;
    expected.add(`row:${row}`); end = anchor.end;
  }
  return end === textLength && expected.size === seen.size && [...expected].every(id => seen.has(id));
}

export function assertExportable(d: Document, revision: number, textLength: number, actualHash: string, snapshot: Snapshot | undefined) {
  const marks = z.array(markSchema).max(MAX_MARKS).safeParse(d.marks);
  const ready = d.state === "review";
  const version = Number.isSafeInteger(revision) && revision >= 0 && revision === d.revision;
  const covered = coverageComplete(d, textLength);
  const reviewed = marks.success && marks.data.every(mark => mark.decision !== "pending");
  if(marks.success)assertSignatureGroups(marks.data);
  const bound = !!snapshot && snapshot.document_id === d.id && snapshot.tenant_id === d.tenant_id && snapshot.project_id === d.project_id
    && snapshot.revision === d.revision && snapshot.parse_version === d.parse_version && Number.isSafeInteger(d.parse_version) && d.parse_version >= 1
    && snapshot.content_hash === d.content_hash && actualHash === d.content_hash && isDeepStrictEqual(snapshot.marks, d.marks)
    && isDeepStrictEqual(snapshot.recognition ?? {}, d.recognition ?? {}) && isDeepStrictEqual(snapshot.page_review ?? null, d.page_review ?? null)
    && isDeepStrictEqual(snapshot.page_data ?? [], d.page_data ?? []);
  if (policy.eligible(ready, version, covered, reviewed, bound) === true) return;
  const code = !version ? "VERSION_CONFLICT" : !ready ? "DETECTION_INCOMPLETE" : !covered ? "COVERAGE_INCOMPLETE" : !reviewed ? "INVALID_MARKS" : !bound ? "SNAPSHOT_MISMATCH" : "EXPORT_POLICY_FAILED";
  throw Object.assign(new Error(code), { statusCode: code === "INVALID_MARKS" ? 400 : 409 });
}
