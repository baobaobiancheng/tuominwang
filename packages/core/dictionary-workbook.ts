import { dictionarySchema, type DictionaryEntry } from "../contracts/index.ts";
import { parseOffice } from "./office.ts";
import { writeZip } from "./office-zip.ts";

const headers = ["名称或代号", "信息类型", "名单"];
function checked(entries: unknown): DictionaryEntry[] {
  const result = dictionarySchema.shape.entries.safeParse(entries);
  if (!result.success) throw new Error("INVALID_DICTIONARY_TABLE");
  const keys = result.data.map(e => `${e.kind}:${e.value}`);
  if (keys.length !== new Set(keys).size) throw new Error("DUPLICATE_DICTIONARY_ENTRY");
  return result.data;
}
export async function importDictionary(bytes: Buffer) {
  if (bytes.length > 5 * 1024 * 1024) throw new Error("DICTIONARY_FILE_LIMIT");
  const parsed = await parseOffice(bytes, "xlsx");
  if (parsed.coverage.some(c => c.status !== "complete")) throw new Error("COVERAGE_INCOMPLETE");
  const sheets = new Map<string, Map<number, Map<number, string>>>();
  for (const a of parsed.anchors) if (a.object?.startsWith("cell:") && a.row && a.column) {
    if (a.column > 3 || a.row > 1001) throw new Error("INVALID_DICTIONARY_TABLE");
    const sheet = sheets.get(a.part!) ?? new Map<number, Map<number, string>>(), row = sheet.get(a.row) ?? new Map<number, string>();
    row.set(a.column, parsed.text.slice(a.start, a.end)); sheet.set(a.row, row); sheets.set(a.part!, sheet);
  }
  if (!sheets.size) throw new Error("INVALID_DICTIONARY_TABLE");
  const entries: unknown[] = [];
  for (const sheet of sheets.values()) {
    const header = sheet.get(1);
    if (!headers.every((h, i) => header?.get(i + 1) === h)) throw new Error("INVALID_DICTIONARY_TABLE");
    for (const [n, row] of [...sheet.entries()].sort(([a], [b]) => a - b)) if (n !== 1) {
      const value = row.get(1), kind = row.get(2), list = row.get(3);
      if (![value, kind, list].some(Boolean)) continue;
      if (list !== "黑名单" && list !== "白名单") throw new Error("INVALID_DICTIONARY_TABLE");
      entries.push({ value, kind, ...(list === "白名单" ? { action: "exclude" } : {}) });
    }
  }
  return checked(entries);
}
export async function exportDictionary(entries: DictionaryEntry[]) {
  entries = checked(entries);
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
  const table = [headers, ...entries.map(e => [e.value, e.kind, e.action === "exclude" ? "白名单" : "黑名单"])];
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${table.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${"ABC"[c]}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const parts = new Map<string, Buffer>(Object.entries({
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="名单" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": sheet,
  }).map(([name, value]) => [name, Buffer.from(value)]));
  const bytes = await writeZip(parts);
  // Re-import our exact deliverable; do not ship a malformed or semantically changed list.
  const roundtrip = await importDictionary(bytes);
  if (JSON.stringify(roundtrip.map(e => [e.value, e.kind, e.action ?? "include"])) !== JSON.stringify(entries.map(e => [e.value, e.kind, e.action ?? "include"]))) throw new Error("ARTIFACT_MISMATCH");
  return bytes;
}
