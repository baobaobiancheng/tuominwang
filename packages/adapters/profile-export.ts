import{resolveEntityGeometry}from'./entity-geometry.ts';
import type { Profile } from "../contracts/presets.ts";
import type { Anchor, Mark, ParsedPage } from "../contracts/index.ts";
import type { Glyph } from "../core/ocr.ts";
import { applyDocxProfile, rasterPdfToDocx, safeExportName } from "../core/profile-export.ts";
import { profileForFormat } from "../core/presets.ts";
import { parseOffice } from "../core/office.ts";
import { validatePageReview } from "../core/page-redaction.ts";
import { visualReplacementPlan,visibleVisualReplacementDraws,rectangleTouchesBox } from "../core/visual-replacement.ts";
import { readArtifact, hash } from "./storage.ts";

export type ProfileArtifact = { role: "primary" | "markdown" | "pdf-docx" | "word-docx"; name: string; format: string; bytes: Buffer };
export type ProfileExportInput = {
  document: { source_format?: string; anchors: Anchor[]; marks: Mark[]; page_data?: ParsedPage[]; page_review?: unknown };
  // Supplied only after the existing source/snapshot/coverage/mapping and artifact verification gates succeed.
  text: string; verifiedOutput: Buffer; outputFormat: string; filename: string;
  profile: Profile; batch?: boolean; outputImageTexts?: Record<string, string>;
};
export function escapePlainMarkdown(text: string) {
  // These inputs are plain parsed paragraphs/OCR, never authored Markdown.
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/([\\`*_{}\[\]()#+.!|~=-])/gu, "\\$1");
}
function guardResidual(text: string, marks: Mark[], output: string) {
  const clean = output.replace(/\s/gu, "");
  for (const m of marks) if (m.decision === "redact") { const value = text.slice(m.start, m.end).replace(/\s/gu, ""); if (value && clean.includes(value)) throw new Error("RESIDUE_FOUND"); }
}
export async function safePageMarkdown(document: ProfileExportInput["document"], text: string) {
  const pages = document.page_data ?? [], policy = validatePageReview(document.page_review, pages, true), paragraphs: string[] = [];
  for (const page of pages) {
    if (policy.deletedPages.includes(page.index)) continue;
    const anchor = document.anchors.find(a => a.kind === "page" && a.page === page.index);
    if (!anchor) throw new Error("PAGE_POSITION_MISSING");
    const rawMap = await readArtifact(page.mapId); if (hash(rawMap) !== page.mapHash) throw new Error("SOURCE_MISMATCH");
    const glyphs: Glyph[] = JSON.parse(rawMap), plan = visualReplacementPlan(text, document.marks, document.anchors, page, glyphs, policy,resolveEntityGeometry(document,document.marks,policy,page,glyphs,text)), boxes = plan.erase, hidden = new Uint8Array(anchor.end - anchor.start);
    // Include every glyph touched by a manual/automatic clearing box, even if no text mark was created.
    for (const glyph of glyphs) if (boxes.some(b => rectangleTouchesBox({x:glyph[2],y:glyph[3],width:glyph[4],height:glyph[5]},b))) hidden.fill(1, glyph[0], glyph[1]);
    for (const m of document.marks) if (m.decision === "redact" && m.start < anchor.end && m.end > anchor.start) hidden.fill(1, Math.max(m.start, anchor.start) - anchor.start, Math.min(m.end, anchor.end) - anchor.start);
    const labels = new Map<number, string>();
    for (const draw of visibleVisualReplacementDraws(plan)) { const at = draw.mark.start - anchor.start; labels.set(at, (labels.get(at) ?? "") + draw.text); }
    const pageText = text.slice(anchor.start, anchor.end); let safe = "";
    for (let i = 0; i < pageText.length;) {
      // Only fragments actually rasterized by the common visual plan are emitted.
      if (labels.has(i)) safe += labels.get(i)!;
      const char = String.fromCodePoint(pageText.codePointAt(i)!); if (![...Array(char.length)].some((_, n) => hidden[i + n])) safe += char; i += char.length;
    }
    guardResidual(text, document.marks, safe);
    paragraphs.push(`## 第 ${page.index + 1} 页\n\n${escapePlainMarkdown(safe)}`);
  }
  const output = paragraphs.join("\n\n"); guardResidual(text, document.marks, output); return output;
}
export async function buildProfileArtifacts(input: ProfileExportInput): Promise<ProfileArtifact[]> {
  const { document, text, profile } = input, sourceFormat = document.source_format ?? "txt", settings = profileForFormat(profile, sourceFormat, input.batch);
  let primary: Buffer = Buffer.from(input.verifiedOutput), officeText: { text: string; anchors: Anchor[] } | undefined;
  if (sourceFormat === "docx") {
    const processed = await applyDocxProfile(primary, profile.docx, { imageTexts: input.outputImageTexts });
    primary = processed.bytes; officeText = processed;
    guardResidual(text, document.marks, processed.text);
  }
  const artifacts: ProfileArtifact[] = [{ role: "primary", name: input.filename, format: input.outputFormat, bytes: primary }];
  if (settings.exportMarkdown && ["docx", "pdf", "png", "jpg", "jpeg"].includes(sourceFormat)) {
    let content: string;
    if (sourceFormat === "docx") {
      const parsed = officeText ?? await parseOffice(primary, "docx", input.outputImageTexts);
      content = parsed.anchors.filter(a => a.object?.startsWith("paragraph:") || a.object === "image-text").map(a => escapePlainMarkdown(parsed.text.slice(a.start, a.end))).join("\n\n");
    } else content = await safePageMarkdown(document, text);
    guardResidual(text, document.marks, content);
    artifacts.push({ role: "markdown", name: safeExportName("{fileName}", input.filename, ".md"), format: "md", bytes: Buffer.from(content, "utf8") });
  }
  if (sourceFormat === "pdf" && profile.pdf.exportPdfAsDocx) {
    const converted = await rasterPdfToDocx(primary);
    artifacts.push({ role: "pdf-docx", name: safeExportName("{fileName}", input.filename, ".docx"), format: "docx", bytes: converted.bytes });
  }
  return artifacts;
}
export function pseudonymTableNames(profile: Profile, filenames: string[], batchMode: "singleDocument" | "unifiedBatch" | "independentBatch", extension = ".xlsx") {
  if (!filenames.length || batchMode === "singleDocument" && filenames.length !== 1) throw new Error("INVALID_EXPORT_NAME");
  const template = profile.batch.pseudonymTableNameTemplates[batchMode], wanted = batchMode === "unifiedBatch" ? [safeExportName(template, filenames[0], extension)] : filenames.map(name => safeExportName(template, name, extension));
  // Deterministic collision suffixes preserve every independent table rather than overwriting one.
  const used = new Set<string>();
  return wanted.map(original => { let result = original, suffix = 2; while (used.has(result.toLocaleLowerCase("zh-CN"))) result = original.slice(0, -extension.length) + `_${suffix++}` + extension; used.add(result.toLocaleLowerCase("zh-CN")); return result; });
}
