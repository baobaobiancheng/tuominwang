import { expect, test } from "vitest";
import { officeFixture, officeImageFixture } from "./office-fixtures.ts";
import { readZip, writeZip } from "../packages/core/office-zip.ts";
import { parseOffice, exportOffice } from "../packages/core/office.ts";
import { buildDocxLayout } from "../packages/core/docx-layout.ts";
import { detect } from "../packages/core/redaction.ts";
import { docxRunSegments, docxHighlights } from "../apps/web/docx-review.tsx";
import type { DocxBlock, DocxParagraph } from "../packages/contracts/docx-layout.ts";
import sharp from "sharp";
import type { Mark } from "../packages/contracts/index.ts";
function paragraphs(blocks: DocxBlock[]): DocxParagraph[] { return blocks.flatMap(b => b.kind === "paragraph" ? [b] : b.rows.flatMap(r => r.cells.flatMap(c => paragraphs(c.blocks)))); }
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
test("Word layout preserves run text offsets, table placement and header/textbox supplemental paragraphs without touching original export", async () => {
  const source = await officeFixture("docx"), before = Buffer.from(source), parsed = await parseOffice(source, "docx");
  const layout = await buildDocxLayout(source, parsed.text, parsed.anchors);
  const all = [...paragraphs(layout.blocks), ...layout.supplements.flatMap(p => paragraphs(p.blocks))];
  expect(layout.blocks.some(b => b.kind === "table")).toBe(true);
  expect(layout.supplements.some(p => p.label === "页眉")).toBe(true);
  expect(layout.supplements.some(p => p.label === "文本框及其他段落")).toBe(true);
  const pAnchors = parsed.anchors.filter(a => a.object?.startsWith("paragraph:"));
  expect(all.filter(p => p.start !== undefined)).toHaveLength(pAnchors.length);
  for (const p of all) {
    const runs = p.runs.filter(r => r.kind === "text");
    expect(runs.map(r => r.text).join("")).toBe(p.start === undefined ? "" : parsed.text.slice(p.start, p.end));
    for (const r of runs) expect(parsed.text.slice(r.start, r.end)).toBe(r.text);
  }
  const marks = detect(parsed.text).map(m => ({ ...m, decision: "redact" as const }));
  const phone = marks.find(m => parsed.text.slice(m.start, m.end) === "13800138000")!;
  const segments = all.flatMap(p => p.runs.flatMap(r => r.kind === "text" ? docxRunSegments(r, [phone]) : [])).filter(s => s.mark);
  expect(segments.length).toBeGreaterThan(1);
  expect(segments.map(s => s.text).join("")).toBe("13800138000");
  expect(segments[0].start).toBe(phone.start); expect(segments.at(-1)!.end).toBe(phone.end);
  expect(source.equals(before)).toBe(true);
  const output = await exportOffice(source, "docx", parsed.text, parsed.anchors, parsed.coverage, marks);
  expect(output).not.toEqual(source);
});
test("OOXML paragraph styles inherit, direct false overrides bold, geometry is bounded, and same-text paragraphs map by identity", async () => {
  const parts = await readZip(await officeFixture("docx"));
  parts.set('word/document.xml', Buffer.from(`<w:document xmlns:w="${W}"><w:body><w:p><w:pPr><w:pStyle w:val="Child"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b w:val="0"/><w:sz w:val="32"/></w:rPr><w:t>😀重复文字</w:t></w:r></w:p><w:p/><w:p><w:r><w:t>😀重复文字</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:left="1440" w:right="1440"/></w:sectPr></w:body></w:document>`));
  parts.set('word/styles.xml', Buffer.from(`<w:styles xmlns:w="${W}"><w:style w:styleId="Parent"><w:rPr><w:b/><w:rFonts w:eastAsia="宋体"/></w:rPr><w:pPr><w:spacing w:after="240"/></w:pPr></w:style><w:style w:styleId="Child"><w:basedOn w:val="Parent"/></w:style></w:styles>`));
  const bytes = await writeZip(parts), parsed = await parseOffice(bytes, "docx"), layout = await buildDocxLayout(bytes, parsed.text, parsed.anchors);
  const ps = paragraphs(layout.blocks); expect(ps).toHaveLength(3);
  expect(ps[0].style).toMatchObject({ align: "center", after: 12 });
  expect(ps[0].runs[0]).toMatchObject({ kind: "text", text: "😀重复文字", style: { bold: false, font: "宋体", size: 16 } });
  expect(ps[0].start).not.toBe(ps[2].start); expect(ps[1].start).toBeUndefined();
  expect(layout.page.width).toBe(595.3);
  const altered = parsed.anchors.map(a => a.object === 'paragraph:1' && a.part === 'word/document.xml' ? { ...a, start: a.start + 1 } : a);
  await expect(buildDocxLayout(bytes, parsed.text, altered)).rejects.toThrow('SOURCE_MISMATCH');
});
test("preview images reference only processed local page indices, never external links or original relationship URLs", async () => {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'white' } }).png().toBuffer();
  const bytes = await officeImageFixture(png), parsed = await parseOffice(bytes, 'docx', { 'word/media/customer-13800138000.jpg': '' });
  const layout = await buildDocxLayout(bytes, parsed.text, parsed.anchors, [{ index: 2, part: 'word/media/customer-13800138000.jpg' }]);
  expect(paragraphs(layout.blocks).flatMap(p => p.runs).filter(r => r.kind === 'image')).toMatchObject([{ kind: 'image', page: 2 }]);
  expect(JSON.stringify(layout)).not.toContain('https://');
  const missing = await buildDocxLayout(bytes, parsed.text, parsed.anchors);
  expect(paragraphs(missing.blocks).flatMap(p => p.runs).filter(r => r.kind === 'image')).toEqual([]);
  expect(missing.warnings.some(w => w.includes('图片'))).toBe(true);
});
test("layout rejects untrusted XML entities and preserves explicit preview budget failures", async () => {
  const parts = await readZip(await officeFixture('docx'));
  parts.set('word/document.xml', Buffer.from(`<!DOCTYPE x [<!ENTITY bad SYSTEM "file:///etc/passwd">]><w:document xmlns:w="${W}"><w:body/></w:document>`));
  await expect(buildDocxLayout(await writeZip(parts), '', [])).rejects.toThrow('UNSAFE_XML');
  await expect(buildDocxLayout(Buffer.alloc(0), 'x'.repeat(2_000_001), [])).rejects.toThrow('DOCX_LAYOUT_LIMIT');
});

test("Word highlight sweep preserves ignore fallback and overlapping candidate identity without run-by-mark scans", () => {
  const marks: Mark[] = [{ start: 2, end: 12, kind: "自定义" as const, decision: "ignore" as const }, { start: 4, end: 8, kind: "手机号" as const, decision: "pending" as const }, { start: 6, end: 14, kind: "邮箱" as const, decision: "redact" as const }];
  expect(docxHighlights(marks).map(h => [h.start, h.end, marks.indexOf(h.mark)])).toEqual([[2,4,0],[4,8,1],[8,14,2]]);
  expect(docxRunSegments({ kind: "text", text: "😀abcdef", start: 0, end: 8, style: {} }, marks).map(s => s.text).join("")).toBe("😀abcdef");
  const many = Array.from({ length: 32768 }, (_, i) => ({ start: i * 3, end: i * 3 + 2, kind: "自定义" as const, decision: "pending" as const }));
  expect(docxHighlights(many)).toHaveLength(32768);
});
