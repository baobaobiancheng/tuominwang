import { expect, test } from "vitest";
import { parseOffice, exportOffice, verifyOffice, validateOfficeMarks } from "../packages/core/office.ts";
import { readZip, writeZip, xml } from "../packages/core/office-zip.ts";
import { detect } from "../packages/core/redaction.ts";
import { coverageComplete } from "../packages/core/export-gate.ts";
import { officeFixture, officeImageFixture } from "./office-fixtures.ts";
import sharp from "sharp";

test("DOCX text, tables, split runs, headers, footers, revisions, comments, text boxes and properties are covered", async () => {
  const source = await officeFixture("docx"), parsed = await parseOffice(source, "docx");
  const marks = detect(parsed.text).map(m => ({ ...m, decision: "redact" as const }));
  expect(marks.map(m => [m.kind, parsed.text.slice(m.start, m.end)])).toEqual([
    ["手机号", "13300133000"], ["手机号", "13800138000"], ["邮箱", "demo@example.com"], ["手机号", "13600136000"], ["手机号", "13700137000"],
    ["手机号", "13400134000"], ["手机号", "13500135000"], ["手机号", "13200132000"], ["手机号", "13900139000"], ["网址", "https://example.com"],
  ]);
  const url = marks.find(m => m.kind === "网址")!;
  expect(parsed.anchors.find(a => a.start <= url.start && a.end >= url.end)).toMatchObject({ part: "word/document.xml", object: expect.stringMatching(/^text:/) });
  expect(parsed.coverage.every(c => c.status === "complete")).toBe(true);
  const output = await exportOffice(source, "docx", parsed.text, parsed.anchors, parsed.coverage, marks);
  expect(output).not.toEqual(source);
  const zip = await readZip(output), body = zip.get("word/document.xml")!.toString();
  expect(body).toContain("合成客户电话【手机号】");
  expect(body).not.toContain("instrText");
  expect(body).toContain("w:tbl");
  for (const m of marks) for (const bytes of zip.values()) expect(bytes.toString()).not.toContain(parsed.text.slice(m.start, m.end));
  await expect(verifyOffice(source, "docx", output, parsed.text, marks)).resolves.toBeUndefined();
  await expect(exportOffice(source, "docx", parsed.text + "x", parsed.anchors, parsed.coverage, marks)).rejects.toThrow("SOURCE_MISMATCH");
  await expect(verifyOffice(source, "docx", source, parsed.text, marks)).rejects.toThrow("RESIDUE_FOUND");
});
test("XLSX shared strings become independent literal cells; hidden sheets, comments, caches and unreferenced strings are handled", async () => {
  const source = await officeFixture("xlsx"), parsed = await parseOffice(source, "xlsx");
  const marks = detect(parsed.text).map(m => ({ ...m, decision: "redact" as const }));
  expect(marks.map(m => [m.kind, parsed.text.slice(m.start, m.end)])).toEqual([
    ["手机号", "13800138000"], ["网址", "https://example.com"], ["手机号", "13800138000"], ["手机号", "13900139000"], ["手机号", "13200132000"], ["手机号", "13100131000"], ["网址", "https://example.com"],
  ]);
  expect(marks.filter(m => m.kind === "网址").map(m => {
    const a = parsed.anchors.find(a => a.start <= m.start && a.end >= m.end)!; return [a.part, a.object];
  })).toEqual([["xl/worksheets/sheet1.xml", "cell:B1"], ["xl/workbook.xml", expect.stringMatching(/^text:/)]]);
  expect(parsed.anchors.filter(a => a.object?.startsWith("cell:"))).toHaveLength(5);
  expect(parsed.text).not.toContain("13300133000"); // Orphan shared strings are discarded, not silently preserved.
  const output = await exportOffice(source, "xlsx", parsed.text, parsed.anchors, parsed.coverage, marks);
  const zip = await readZip(output);
  expect(zip.has("xl/sharedStrings.xml")).toBe(false);
  expect(zip.get("xl/workbook.xml")!.toString()).toContain('state="veryHidden"');
  expect(zip.get("xl/workbook.xml")!.toString()).not.toContain("definedNames");
  expect(zip.get("xl/worksheets/sheet1.xml")!.toString()).toContain("=HYPERLINK");
  expect(zip.get("xl/worksheets/sheet1.xml")!.toString()).not.toContain("<f>");
  expect(zip.get("xl/worksheets/sheet2.xml")!.toString()).not.toContain("13900139000");
  for (const bytes of zip.values()) expect(bytes.toString()).not.toContain("https://example.com");
  await expect(verifyOffice(source, "xlsx", output, parsed.text, marks)).resolves.toBeUndefined();
});
test("partial masks and custom replacement survive Word split runs and workbook literal cells without old value residue", async () => {
  for (const format of ["docx", "xlsx"] as const) {
    const source = await officeFixture(format), parsed = await parseOffice(source, format);
    const marks = detect(parsed.text).map(m => ({ ...m, decision: "redact" as const, replacement: parsed.text.slice(m.start, m.end) !== "13800138000" ? { mode: "custom" as const, value: "联系号码" } : { mode: "mask" as const, prefix: 3, suffix: 4 } }));
    const output = await exportOffice(source, format, parsed.text, parsed.anchors, parsed.coverage, marks);
    const reread = await parseOffice(output, format);
    expect(reread.text).toContain("138***8000"); expect(reread.text).toContain("联系号码");
    for (const m of marks) expect(reread.text).not.toContain(parsed.text.slice(m.start, m.end));
    await expect(verifyOffice(source, format, output, parsed.text, marks)).resolves.toBeUndefined();
  }
});
test("DOCX image export retains its protocol URI while business URLs are redacted and manually selected protocol residue still blocks", async () => {
  const pictureUri = "http://schemas.openxmlformats.org/drawingml/2006/picture", businessUrl = "https://example.invalid/private", imagePart = "word/media/customer-13800138000.jpg";
  const blank = sharp({ create: { width: 24, height: 24, channels: 3, background: "white" } });
  const parts = await readZip(await officeImageFixture(await blank.clone().jpeg().toBuffer()));
  parts.set("word/document.xml", Buffer.from(parts.get("word/document.xml")!.toString().replace('name="Picture"', `name="Picture" descr="${businessUrl}"`)));
  const source = await writeZip(parts), parsed = await parseOffice(source, "docx", { [imagePart]: "" });
  const marks = detect(parsed.text, parsed.anchors).map(m => ({ ...m, decision: "redact" as const }));
  expect(marks.filter(m => m.kind === "网址").map(m => parsed.text.slice(m.start, m.end))).toEqual([businessUrl]);
  expect(parsed.coverage.every(c => c.status === "complete")).toBe(true);
  const images = { [imagePart]: { text: "", output: await blank.clone().png().toBuffer(), outputText: "" } };
  const output = await exportOffice(source, "docx", parsed.text, parsed.anchors, parsed.coverage, marks, images), zip = await readZip(output);
  expect(zip.get("word/document.xml")!.toString()).toContain(`uri="${pictureUri}"`);
  expect(zip.get("word/document.xml")!.toString()).toContain('descr="【网址】"');
  expect(zip.has("word/media/redacted-1.png")).toBe(true);
  for (const m of marks) for (const bytes of zip.values()) expect(bytes.toString()).not.toContain(parsed.text.slice(m.start, m.end));
  await expect(verifyOffice(source, "docx", output, parsed.text, marks, { "word/media/redacted-1.png": "" })).resolves.toBeUndefined();
  const protocol = parsed.anchors.find(a => /^attribute:\d+:uri$/u.test(a.object ?? "") && parsed.text.slice(a.start, a.end) === pictureUri)!;
  const manual = { start: protocol.start, end: protocol.end, kind: "网址" as const, decision: "redact" as const };
  expect(() => validateOfficeMarks(parsed.text, [...marks, manual], parsed.anchors, true)).not.toThrow();
  await expect(exportOffice(source, "docx", parsed.text, parsed.anchors, parsed.coverage, [...marks, manual], images)).rejects.toThrow("RESIDUE_FOUND");
});
test("unknown Office parts block export; package inventory and anchors cannot omit parts", async () => {
  const source = await officeFixture("docx", { "word/media/image1.png": Buffer.from("unprocessed-image") }), parsed = await parseOffice(source, "docx");
  expect(parsed.coverage.find(c => c.id === "word/media/image1.png")?.status).toBe("blocked");
  await expect(exportOffice(source, "docx", parsed.text, parsed.anchors, parsed.coverage, [])).rejects.toThrow("COVERAGE_INCOMPLETE");
  const valid = await parseOffice(await officeFixture("docx"), "docx");
  const doc = { id: "d", tenant_id: "t", project_id: "p", revision: 0, state: "review", source_id: "s", source_format: "docx", parse_version: 1, content_hash: "hash", marks: [], anchors: valid.anchors, coverage: valid.coverage };
  expect(coverageComplete(doc, valid.text.length)).toBe(true);
  expect(coverageComplete({ ...doc, coverage: valid.coverage.slice(0, -1) }, valid.text.length)).toBe(false);
  expect(coverageComplete({ ...doc, anchors: valid.anchors.slice(1) }, valid.text.length)).toBe(false);
  expect(() => validateOfficeMarks(valid.text, [{ start: valid.anchors[0].start, end: valid.anchors[1].end, kind: "自定义", decision: "redact" }], valid.anchors)).toThrow("CROSS_OBJECT_MARK");
});
test("malformed archives, XML entities, excessive expansion and nesting fail closed", async () => {
  await expect(readZip(Buffer.from("fake zip"))).rejects.toThrow("INVALID_OFFICE");
  expect(() => xml(Buffer.from('<!DOCTYPE x [<!ENTITY v "secret">]><x>&v;</x>'))).toThrow("UNSAFE_XML");
  expect(() => xml(Buffer.from("<x>".repeat(130) + "</x>".repeat(130)))).toThrow("XML_LIMIT");
  expect(() => xml(Buffer.from("<x><y></x>"))).toThrow("INVALID_OFFICE");
  const bomb = await writeZip(new Map([["huge.xml", Buffer.alloc(50 * 1024 * 1024 + 1)]]));
  await expect(readZip(bomb)).rejects.toThrow("ZIP_LIMIT");
  const missingCache = await officeFixture("xlsx", { "xl/worksheets/sheet2.xml": '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>1+1</f></c></row></sheetData></worksheet>' });
  expect((await parseOffice(missingCache, "xlsx")).coverage.find(c => c.id === "xl/worksheets/sheet2.xml")?.reason).toBe("MISSING_FORMULA_CACHE");
});
