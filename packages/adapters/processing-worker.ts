import { parentPort, workerData } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { detect, mergeCandidates, RULES_VERSION } from "../core/redaction.ts";
import { parseFile, exportFile, verifyFile, validateFileMarks, FILE_ERRORS } from "../core/files.ts";
import { assertExportable } from "../core/export-gate.ts";
import { textWindow } from "../core/text-window.ts";
import { checkKnownEntities, previewText, searchText } from "../core/review-tools.ts";
import { validateMappingMarks } from "../core/mappings.ts";
import { parseOffice, exportOffice, verifyOffice } from "../core/office.ts";
import { parsePages } from "./page-parser.ts";
import { exportPages, validatePageExport } from "./page-export.ts";
import { parseOfficeImages, officeImagePlan, exportOfficeImages } from "./office-images.ts";
import { PAGED_FORMATS, validatePageReview, pageBoxes, clearPixels } from "../core/page-redaction.ts";
import type { ParsedPage, Anchor } from "../contracts/index.ts";
import { hash, unseal, seal, readOriginal, readArtifact, writeArtifact, setObjectOwner } from "./storage.ts";
import type { ProcessingInput } from "./processing.ts";

async function execute(input: ProcessingInput) {
  if ("doc" in input && ["detect", "export"].includes(input.kind)) setObjectOwner(input.doc.id);
  if (input.kind === "dictionary-import") return (await import("../core/dictionary-workbook.ts")).importDictionary(Buffer.from(input.bytes));
  if (input.kind === "dictionary-export") return (await import("../core/dictionary-workbook.ts")).exportDictionary(input.entries);
  if (input.kind === "download") {
    const output = ["docx", "xlsx", ...PAGED_FORMATS].includes(input.artifact.format ?? "") ? await readOriginal(input.artifact.id) : await readArtifact(input.artifact.id);
    if (hash(output) !== input.artifact.hash) throw new Error("ARTIFACT_MISMATCH");
    return output;
  }
  if (input.kind === "docx-layout") return (await import("./docx-layout.ts")).documentDocxLayout(input.doc);
  if (input.kind === "ocr-text") return (await import("./ocr-correction.ts")).readOcrText(input.doc, input.page!);
  if (input.kind === "ocr-correct") return (await import("./ocr-correction.ts")).correctOcrText(input.doc, input.page!, input.correction!);
  const d = input.doc, aad = `${d.tenant_id}:${d.project_id}:${d.id}`;
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
      return visual.canonicalVisualResult(await visual.detectVisual(bytes, input.detectors!), page);
    }
    return bytes;
  }
  let text = unseal(d.content, aad);
  if (input.kind === "page-preview") {
    const policy = validatePageReview(d.page_review, d.page_data), page = (d.page_data as ParsedPage[]).find(p => p.index === input.page);
    if ((!paged && !embedded) || !page || policy.deletedPages.includes(page.index)) throw new Error("PAGE_NOT_READY");
    const source = await readOriginal(page.previewId), map = await readArtifact(page.mapId);
    if (hash(source) !== page.previewHash || hash(map) !== page.mapHash) throw new Error("SOURCE_MISMATCH");
    const marks = input.marks!.map(m => m.decision === "pending" ? { ...m, decision: "ignore" as const } : m);
    const anchors = embedded ? d.anchors.filter((a: Anchor) => a.part === page.part && a.object === "image-text").map((a: Anchor) => ({ ...a, kind: "page", page: page.index })) : d.anchors;
    const boxes = pageBoxes(text, marks, anchors, page, JSON.parse(map), policy);
    return (await clearPixels(source, page, boxes)).png;
  }
  if (input.kind === "mapping-value") {
    if (input.marks?.length !== 1) throw new Error("INVALID_MARKS");
    validateFileMarks(text, input.marks, d.source_format, d.anchors);
    const mark = input.marks[0], value = text.slice(mark.start, mark.end);
    if (value.length > 2000) throw new Error("MAPPING_VALUE_LIMIT");
    return value;
  }
  if (input.kind === "search") return searchText(text, input.query!, input.offset ?? 0, input.searchScope, input.searchSpans);
  if (input.kind === "known-entities") {
    validateMappingMarks(text, input.marks!, input.mappings ?? []);
    return checkKnownEntities(text, input.marks!, d.source_format, d.anchors);
  }
  if (input.kind === "preview") {
    validateFileMarks(text, input.marks!, d.source_format, d.anchors);
    validateMappingMarks(text, input.marks!, input.mappings ?? []);
    return previewText(text, input.marks!, input.offset ?? 0);
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
    if (d.source_id) {
      const bytes = await readOriginal(d.source_id);
      if (hash(bytes) !== d.source_hash) throw new Error("SOURCE_MISMATCH");
      if ((d.page_data ?? []).some((p: any) => (p.ocrRevision ?? 0) > 0)) {
        if (hash(text) !== d.content_hash) throw new Error("SOURCE_MISMATCH");
        anchors = d.anchors; coverage = d.coverage; pages = d.page_data;
        for (const page of pages) if (hash(await readArtifact(page.mapId)) !== page.mapHash || hash(await readOriginal(page.previewId)) !== page.previewHash) throw new Error("SOURCE_MISMATCH");
      } else {
      const paged = d.source_format === "docx" ? await parseOfficeImages(bytes) : ["pdf", "png", "jpg", "jpeg"].includes(d.source_format) ? await parsePages(bytes, d.source_format) : undefined;
      const parsed = paged ?? (office ? await parseOffice(bytes, d.source_format) : parseFile(bytes, d.source_format));
      text = parsed.text; anchors = parsed.anchors; coverage = parsed.coverage;
      pages = paged?.pages ?? [];
      }
    }
    const dictionary = d.dictionary ? JSON.parse(unseal(d.dictionary, `${d.tenant_id}:${d.project_id}:dictionary`)) : [];
    let marks = detect(text, anchors, dictionary), nerVersion: string | null = null;
    if (d.ner_enabled) {
      const ner = await (await import("../core/ner.ts")).createNer();
      try { marks = mergeCandidates(text, marks, await ner.detect(text, anchors)); nerVersion = `${ner.version}:${ner.weights}`; }
      finally { await ner.close(); }
    }
    return { content: seal(text, aad), hash: hash(text), marks, anchors, coverage, pages, recognition: { rules: RULES_VERSION, dictionaryRevision: d.dictionary_revision ?? 0, ner: nerVersion, ai: null } };
  }
  const digest = hash(text);
  assertExportable(d, d.revision, text.length, digest, input.snapshot);
  if (input.kind === "gate") { validateFileMarks(text, d.marks, d.source_format, d.anchors, true); if (paged) await validatePageExport(d, text); if (embedded) await officeImagePlan(d, text); return {}; }
  if (paged) {
    const { output, format } = await exportPages(d, text);
    if (input.kind === "verify") {
      const actual = await readOriginal(input.artifact!.id);
      if (hash(actual) !== input.artifact!.hash || !actual.equals(output)) throw new Error("ARTIFACT_MISMATCH");
      return {};
    }
    const id = randomUUID(); await writeArtifact(id, output.toString("base64"));
    return { artifact: { id, hash: hash(output), format }, textLength: text.length, textHash: digest };
  }
  if (input.kind === "verify") {
    const output = office ? await readOriginal(input.artifact!.id) : await readArtifact(input.artifact!.id);
    if (hash(output) !== input.artifact!.hash) throw new Error("ARTIFACT_MISMATCH");
    if (office) {
      const original = await readOriginal(d.source_id);
      if (hash(original) !== d.source_hash) throw new Error("SOURCE_MISMATCH");
      const images = embedded ? await exportOfficeImages(d, text) : undefined;
      const expected = await exportOffice(original, d.source_format, text, d.anchors, d.coverage, d.marks, images);
      if (hash(expected) !== input.artifact!.hash) throw new Error("ARTIFACT_MISMATCH");
      if (!embedded) await verifyOffice(original, d.source_format, output as Buffer, text, d.marks);
    } else verifyFile(text, d.marks, output as string, d.source_format, d.anchors);
    return {};
  }
  if (office) {
    const original = await readOriginal(d.source_id);
    if (hash(original) !== d.source_hash) throw new Error("SOURCE_MISMATCH");
    const images = embedded ? await exportOfficeImages(d, text) : undefined;
    const output = await exportOffice(original, d.source_format, text, d.anchors, d.coverage, d.marks, images);
    const id = randomUUID(); await writeArtifact(id, output.toString("base64"));
    return { artifact: { id, hash: hash(output) }, textLength: text.length, textHash: digest };
  }
  const output = exportFile(text, d.marks, d.source_format, d.anchors);
  verifyFile(text, d.marks, output, d.source_format, d.anchors);
  const id = randomUUID();
  return { artifact: { id, hash: await writeArtifact(id, output) }, textLength: text.length, textHash: digest };
}

try { parentPort!.postMessage({ ok: true, value: await execute(workerData) }); }
catch (error) {
  const message = (error as Error).message;
  const known = [...FILE_ERRORS, "DOCX_LAYOUT_LIMIT", "OCR_TEXT_CONFLICT", "OCR_POSITION_REQUIRED", "VISUAL_MODEL_REQUIRED", "VISUAL_MODEL_MISMATCH", "VISUAL_OUTPUT_INVALID", "VISUAL_INPUT_INVALID", "INVALID_SEARCH", "KNOWN_ENTITY_VALUE_LIMIT", "KNOWN_ENTITY_SCAN_LIMIT", "INVALID_MARKS", "OVERLAPPING_MARKS", "RESIDUE_FOUND", "ARTIFACT_MISMATCH", "VERSION_CONFLICT", "DETECTION_INCOMPLETE", "COVERAGE_INCOMPLETE", "SNAPSHOT_MISMATCH", "EXPORT_POLICY_FAILED"];
  parentPort!.postMessage({ ok: false, code: known.includes(message) ? message : "PROCESSING_FAILED" });
}
