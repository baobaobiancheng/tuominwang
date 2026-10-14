import {parseReferenceMarkdown,exportReferenceMarkdown,verifyReferenceMarkdownPrivacy,type ReferenceMarkdown,type MarkdownBlockerReview} from './reference-markdown.ts';
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { fromMarkdown } from "mdast-util-from-markdown";
import { sourceFormatSchema, FILE_MAX_BYTES, type SourceFormat, type Anchor, type Coverage, type Mark } from "../contracts/index.ts";
import { redact, validateMarks, verify } from "./redaction.ts";
import { validateOfficeMarks } from "./office.ts";

export const FILE_ERRORS = ["UNSUPPORTED_FORMAT", "INVALID_PATH", "INVALID_ENCODING", "FILE_SIZE_LIMIT", "MARK_LIMIT", "PROCESSING_TIMEOUT", "PROCESSING_MEMORY_LIMIT", "INVALID_CSV", "CELL_LIMIT", "UNSUPPORTED_MARKDOWN_OBJECT", "CROSS_CELL_MARK", "SOURCE_MISMATCH", "INVALID_OFFICE", "ZIP_LIMIT", "XML_LIMIT", "UNSAFE_XML", "OBJECT_LIMIT", "EMPTY_DOCUMENT", "CROSS_OBJECT_MARK", "INVALID_PDF", "ENCRYPTED_PDF", "PAGE_LIMIT", "INVALID_PDF_PAGE", "INVALID_PDF_TEXT", "PDF_TEXT_LIMIT", "PIXEL_LIMIT", "INVALID_IMAGE", "MULTIPAGE_IMAGE", "OCR_MODEL_REQUIRED", "OCR_MODEL_MISMATCH", "PAGE_NOT_READY"];
FILE_ERRORS.push("NER_MODEL_REQUIRED", "NER_MODEL_MISMATCH", "NER_TEXT_LIMIT", "NER_TOKEN_LIMIT", "NER_OUTPUT_INVALID", "CANDIDATE_SOURCE_LIMIT", "INVALID_DICTIONARY", "INVALID_REPLACEMENT", "INVALID_SEARCH");
FILE_ERRORS.push("MAPPING_MISMATCH", "MAPPING_VALUE_LIMIT");
FILE_ERRORS.push("INVALID_DICTIONARY_TABLE", "DUPLICATE_DICTIONARY_ENTRY", "DICTIONARY_FILE_LIMIT");
FILE_ERRORS.push("INVALID_PAGE_REVIEW", "PAGE_CONVERSION_REQUIRED", "PAGE_POSITION_MISSING", "PAGE_REPLACEMENT_UNSUPPORTED", "PIXEL_VERIFICATION_FAILED", "OUTPUT_SIZE_LIMIT");
export function fileFormat(path: string): SourceFormat {
  if (path !== path.normalize("NFC") || /[\\\x00-\x1f\x7f:]/.test(path) || path.startsWith("/") || path.split("/").some(p => !p || p === "." || p === ".." || p.endsWith(".") || p.endsWith(" ")))
    throw new Error("INVALID_PATH");
  const result = sourceFormatSchema.safeParse(path.split(".").at(-1)?.toLowerCase()==="markdown"?"md":path.split(".").at(-1)?.toLowerCase());
  if (!result.success) throw new Error("UNSUPPORTED_FORMAT");
  return result.data;
}
function markdownSafe(text: string) {
  const pending: any[] = [fromMarkdown(text)];
  while (pending.length) {
    const node = pending.pop();
    // Images and raw HTML need object processing before a Markdown export is safe.
    if (["image", "imageReference", "html"].includes(node.type)) throw new Error("UNSUPPORTED_MARKDOWN_OBJECT");
    for (const child of node.children ?? []) pending.push(child);
  }
}
export function parseFile(bytes: Buffer, format: SourceFormat, options:{fileName?:string}={}): { text: string; anchors: Anchor[]; coverage: Coverage[]; markdown?:ReferenceMarkdown } {
  if (!["txt", "md", "csv"].includes(format)) throw new Error("UNSUPPORTED_FORMAT");
  if (bytes.length > FILE_MAX_BYTES) throw new Error("FILE_SIZE_LIMIT");
  let input: string;
  try { input = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("INVALID_ENCODING"); }
  if (input.includes("\0") || !input.trim()) throw new Error("INVALID_ENCODING");
  if (format === "md") {const markdown=parseReferenceMarkdown(bytes,options.fileName??"source.md");return{text:markdown.scanText,anchors:markdown.anchors,coverage:markdown.coverage,markdown};}
  if (format !== "csv") return { text: input, anchors: [{ kind: "text", start: 0, end: input.length }], coverage: [{ id: "text", status: "complete" }] };
  let records: string[][];
  let cells = 0;
  try { records = parse(input, { bom: true, skip_empty_lines: false, max_record_size: FILE_MAX_BYTES, on_record(record: string[]) {
    cells += record.length;
    if (cells > 20000) throw new Error("CELL_LIMIT");
    return record;
  } }); }
  catch (e) { throw new Error((e as Error).message === "CELL_LIMIT" ? "CELL_LIMIT" : "INVALID_CSV"); }
  if (!records.length || records.reduce((n, row) => n + row.length, 0) > 20000) throw new Error("CELL_LIMIT");
  const anchors: Anchor[] = [], values: string[] = [];
  let offset = 0;
  records.forEach((row, r) => row.forEach((value, c) => {
    anchors.push({ kind: "cell", row: r + 1, column: c + 1, start: offset, end: offset + value.length });
    values.push(value); offset += value.length + 1;
  }));
  return { text: values.join("\n"), anchors, coverage: records.map((_, i) => ({ id: `row:${i + 1}`, status: "complete" as const })) };
}
export function validateFileMarks(text: string, marks: Mark[], format: SourceFormat, anchors: Anchor[], final = false) {
  if (["docx", "xlsx"].includes(format)) return validateOfficeMarks(text, marks, anchors, final);
  validateMarks(text, marks, final);
  if (format === "csv") for (const mark of marks) {
    let lo = 0, hi = anchors.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (anchors[mid].start <= mark.start) lo = mid + 1; else hi = mid; }
    const anchor = anchors[lo - 1];
    if (!anchor || anchor.end < mark.end) throw new Error("CROSS_CELL_MARK");
  }
}
export function exportFile(text: string, marks: Mark[], format: SourceFormat, anchors: Anchor[], context:{markdown?:ReferenceMarkdown;blockerReview?:MarkdownBlockerReview}={}) {
  validateFileMarks(text, marks, format, anchors, true);
  if(format==="md"&&context.markdown){if(context.markdown.scanText!==text)throw new Error("SOURCE_MISMATCH");return exportReferenceMarkdown(context.markdown,marks,{blockerReview:context.blockerReview}).buffer.toString("utf8");}
  if(format==="md"&&anchors.some(a=>a.part==="markdown"))throw new Error("MARKDOWN_SIDECAR_REQUIRED");
  if (format !== "csv") {
    const output = redact(text, marks);
    if (format === "md") markdownSafe(output);
    return output;
  }
  const records: string[][] = [];
  const selected = marks.filter(m => m.decision === "redact").sort((a, b) => a.start - b.start);
  let next = 0;
  for (const anchor of anchors) {
    const local: Mark[] = [];
    while (next < selected.length && selected[next].start < anchor.end) {
      const m = selected[next++]; local.push({ ...m, start: m.start - anchor.start, end: m.end - anchor.start });
    }
    let value = redact(text.slice(anchor.start, anchor.end), local);
    // Neutralize spreadsheet formulas, including whitespace-prefixed payloads.
    if (/^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value)) value = "'" + value;
    (records[anchor.row! - 1] ??= [])[anchor.column! - 1] = value;
  }
  return stringify(records, { record_delimiter: "\r\n", quoted: true });
}
export function verifyFile(text: string, marks: Mark[], output: string, format: SourceFormat, anchors: Anchor[], context:{markdown?:ReferenceMarkdown;blockerReview?:MarkdownBlockerReview}={}) {
  if (output !== exportFile(text, marks, format, anchors,context)) throw new Error("ARTIFACT_MISMATCH");
  if(format==="md"&&context.markdown)verifyReferenceMarkdownPrivacy(context.markdown,marks,Buffer.from(output));
  if (format === "csv") {
    const normalized = (parse(output) as string[][]).flat().join("\n");
    const hidden = new Set(marks.filter(m => m.decision === "redact").map(m => text.slice(m.start, m.end)));
    if ([...hidden].some(value => normalized.includes(value))) throw new Error("RESIDUE_FOUND");
  } else if(format!=="md"||!context.markdown) verify(text, marks, output);
}

FILE_ERRORS.push("VISUAL_FONT_REQUIRED", "VISUAL_FONT_MISMATCH", "VISUAL_FONT_GLYPH_REQUIRED", "VISUAL_TEXT_FIT_FAILED");

FILE_ERRORS.push("VISUAL_CANDIDATE_LIMIT");

FILE_ERRORS.push("DOCX_PREVIEW_RELATIONSHIP_INVALID", "REFERENCE_SPATIAL_INVALID", "REFERENCE_SPATIAL_LIMIT", "REFERENCE_POSITION_INVALID");
FILE_ERRORS.push('ENCRYPTED_OFFICE','DOCUMENT_PASSWORD_INVALID','DOCUMENT_UNLOCK_UNSUPPORTED','DOCUMENT_UNLOCK_FAILED','DOCUMENT_UNLOCK_VERIFICATION_FAILED','DOCUMENT_UNLOCK_FORMAT_MISMATCH','DOCUMENT_LEGACY_CONVERSION_REQUIRED','REFERENCE_TABLE_INVALID','REFERENCE_TABLE_POSITION','REFERENCE_TABLE_LIMIT');

FILE_ERRORS.push('DOCUMENT_ENCRYPTION_INVALID','DOCUMENT_ENCRYPTION_UNSUPPORTED','DOCUMENT_INTEGRITY_MISMATCH','DOCUMENT_NOT_ENCRYPTED','DOCUMENT_PASSWORD_INCORRECT','DOCUMENT_PASSWORD_SLOT_REQUIRED','DOCUMENT_UNLOCK_FORMAT_UNSUPPORTED','REFERENCE_TABLE_NER_INVALID');

FILE_ERRORS.push('OPENCV_RUNTIME_REQUIRED','OPENCV_RUNTIME_MISMATCH','OPENCV_RUNTIME_INVALID','REFERENCE_SEAL_INVALID','REFERENCE_SEAL_SEGMENTATION_INVALID');

FILE_ERRORS.push("PAGE_REVIEW_STORAGE_INVALID");

FILE_ERRORS.push('MARKDOWN_EXTENSION_UNSUPPORTED','MARKDOWN_TOO_LARGE','MARKDOWN_INVALID_UTF8','MARKDOWN_NUL','MARKDOWN_EXPORT_FAILED','MARKDOWN_SIDECAR_REQUIRED','MARKDOWN_RECOGNITION_REQUIRED');

FILE_ERRORS.push('MARKDOWN_SOURCE_COMPATIBILITY_FORBIDDEN','MARKDOWN_CONTENT_MISMATCH','MARKDOWN_ASSET_RESIDUE');

FILE_ERRORS.push('MARKDOWN_BLOCKERS_UNREVIEWED');

FILE_ERRORS.push("OFFICE_XML_VALUE_INVALID");
