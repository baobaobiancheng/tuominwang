import { posix } from "node:path";
import { createHash } from "node:crypto";
import type { Profile } from "../contracts/presets.ts";
import { readZip, writeZip, xml, xmlBytes, elements } from "./office-zip.ts";
import { parseOffice } from "./office.ts";
import { openPdf } from "./pdf-reader.ts";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", R = "http://schemas.openxmlformats.org/package/2006/relationships", C = "http://schemas.openxmlformats.org/package/2006/content-types";
const remove = (node: { parentNode: any }) => node.parentNode?.removeChild(node);
export async function applyDocxProfile(bytes: Buffer, settings: Profile["docx"], options: { imageTexts?: Record<string, string> } = {}) {
  const originalHash = createHash("sha256").update(bytes).digest("hex"), parts = await readZip(bytes), removed = new Set<string>(), anonymizedParts: string[] = [];
  for (const name of parts.keys()) {
    if (settings.removeHeaderFooter && /^word\/(header|footer)\d+\.xml$/iu.test(name)) removed.add(name);
    if (settings.removeImages && /^word\/media\//iu.test(name)) removed.add(name);
    if (settings.commentHandlingMode === "remove" && /^word\/comments[^/]*\.xml$/iu.test(name)) removed.add(name);
  }
  for (const name of [...removed]) { const related = posix.join(posix.dirname(name), "_rels", posix.basename(name) + ".rels"); if (parts.has(related)) removed.add(related); }
  for (const name of removed) parts.delete(name);
  for (const [name, value] of parts) if (name.endsWith(".xml") || name.endsWith(".rels")) {
    const doc = xml(value);
    if (name.endsWith(".rels")) {
      const base = name === "_rels/.rels" ? "" : posix.dirname(posix.dirname(name));
      for (const relation of elements(doc, R, "Relationship")) {
        if (relation.getAttribute("TargetMode") === "External") continue;
        let target: string; try { target = posix.normalize(posix.join(base, decodeURIComponent(relation.getAttribute("Target") ?? ""))); } catch { throw new Error("INVALID_OFFICE"); }
        if (removed.has(target)) remove(relation);
      }
    }
    if (name === "[Content_Types].xml") for (const item of elements(doc, C, "Override")) if (removed.has((item.getAttribute("PartName") ?? "").replace(/^\//u, ""))) remove(item);
    if (settings.removeHeaderFooter) for (const tag of ["headerReference", "footerReference"]) for (const item of elements(doc, W, tag)) remove(item);
    if (settings.removeImages) for (const tag of ["drawing", "pict"]) for (const item of elements(doc, W, tag)) remove(item);
    if (settings.commentHandlingMode === "remove") for (const tag of ["commentRangeStart", "commentRangeEnd", "commentReference"]) for (const item of elements(doc, W, tag)) remove(item);
    if (settings.commentHandlingMode === "anonymize" && /^word\/(comments[^/]*|people)\.xml$/iu.test(name)) {
      for (const item of elements(doc, "*", "*")) for (const attr of Array.from(item.attributes)) {
        if (["author", "initials", "userId", "email"].includes(attr.localName ?? attr.name)) item.setAttributeNS(attr.namespaceURI, attr.name, attr.localName === "initials" ? "N" : ["userId", "email"].includes(attr.localName ?? "") ? "" : "匿名");
      }
      anonymizedParts.push(name);
    }
    parts.set(name, xmlBytes(doc));
  }
  const output = await writeZip(parts), imageTexts = options.imageTexts && Object.fromEntries(Object.entries(options.imageTexts).filter(([name]) => !removed.has(name)));
  const parsed = await parseOffice(output, "docx", imageTexts);
  if (parsed.coverage.some(c => c.status !== "complete")) throw new Error("COVERAGE_INCOMPLETE");
  const outputParts = await readZip(output);
  if ([...removed].some(name => outputParts.has(name))) throw new Error("ARTIFACT_MISMATCH");
  if (createHash("sha256").update(bytes).digest("hex") !== originalHash) throw new Error("SOURCE_MISMATCH");
  return { bytes: output, removedParts: [...removed].sort(), anonymizedParts, text: parsed.text, anchors: parsed.anchors, coverage: parsed.coverage, sourceHash: originalHash };
}
export function safeExportName(template: string, filename: string, extension: string) {
  if (![".md", ".docx", ".xlsx", ".json", ".csv", ".lpm"].includes(extension)) throw new Error("UNSUPPORTED_FORMAT");
  const base = filename.replace(/\.[^.]*$/u, ""), rendered = template.replaceAll("{fileName}", base);
  const sanitized = rendered.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/gu, "_").replace(/\.{2,}/gu, "_").trim();
  let clean = ""; for (const char of sanitized) { if (Buffer.byteLength(clean + char) > 200) break; clean += char; }
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(clean)) clean = "_" + clean;
  if (!clean || !clean.isWellFormed()) throw new Error("INVALID_EXPORT_NAME");
  return clean + extension;
}
// This creates a faithful page-image Word wrapper from an already verified redacted raster PDF.
// It intentionally does not fabricate editable text or include the original PDF as an embedded object.
export async function rasterPdfToDocx(bytes: Buffer) {
  const pdf = await openPdf(bytes), parts = new Map<string, Buffer>(), pages: { index: number; width: number; height: number; imageHash: string }[] = [];
  const pageNodes: string[] = [], relationships: string[] = [];
  try {
    if (pdf.attachments || pdf.scripts) throw new Error("COVERAGE_INCOMPLETE");
    for (let index = 0; index < pdf.count; index++) {
      const page = await pdf.page(index, 2);
      // The upstream raster export should have removed all original text layers. Refuse arbitrary input PDFs.
      if (page.text.trim()) throw new Error("PDF_NOT_REDACTED_RASTER");
      const path = `word/media/page-${index + 1}.png`, cx = Math.round(page.width * 12700), cy = Math.round(page.height * 12700);
      parts.set(path, page.png); pages.push({ index, width: page.width, height: page.height, imageHash: createHash("sha256").update(page.png).digest("hex") });
      relationships.push(`<Relationship Id="img${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page-${index + 1}.png"/>`);
      const section = `<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${Math.round(page.width * 20)}" w:h="${Math.round(page.height * 20)}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
      pageNodes.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${index < pdf.count - 1 ? section : ""}</w:pPr><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:wrapNone/><wp:docPr id="${index + 1}" name="脱敏页 ${index + 1}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${index + 1}" name="page-${index + 1}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="img${index + 1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>${index === pdf.count - 1 ? section : ""}`);
    }
  } finally { pdf.close(); }
  parts.set("[Content_Types].xml", Buffer.from(`<Types xmlns="${C}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`));
  parts.set("_rels/.rels", Buffer.from(`<Relationships xmlns="${R}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`));
  parts.set("word/_rels/document.xml.rels", Buffer.from(`<Relationships xmlns="${R}">${relationships.join("")}</Relationships>`));
  parts.set("word/document.xml", Buffer.from(`<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${pageNodes.join("")}</w:body></w:document>`));
  const output = await writeZip(parts), checked = await parseOffice(output, "docx", Object.fromEntries(pages.map(p => [`word/media/page-${p.index + 1}.png`, ""])));
  if (checked.coverage.some(c => c.status !== "complete")) throw new Error("COVERAGE_INCOMPLETE");
  const reread = await readZip(output); for (const page of pages) if (createHash("sha256").update(reread.get(`word/media/page-${page.index + 1}.png`)!).digest("hex") !== page.imageHash) throw new Error("ARTIFACT_MISMATCH");
  return { bytes: output, pages, coverage: checked.coverage, imageOnly: true as const };
}
