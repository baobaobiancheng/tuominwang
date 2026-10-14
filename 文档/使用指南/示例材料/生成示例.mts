import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { pdfFixture } from "../../../tests/pdf-fixtures.ts";
import { readZip, writeZip } from "../../../packages/core/office-zip.ts";
import { exportDictionary, importDictionary } from "../../../packages/core/dictionary-workbook.ts";
import { parseOffice } from "../../../packages/core/office.ts";
import { openPdf } from "../../../packages/core/pdf-reader.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const save = (name: string, bytes: string | Buffer) => writeFile(join(dir, name), bytes);
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const R = "http://schemas.openxmlformats.org/package/2006/relationships";
const C = "http://schemas.openxmlformats.org/package/2006/content-types";
const xml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const docx = await writeZip(new Map(Object.entries({
  "[Content_Types].xml": `<Types xmlns="${C}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  "_rels/.rels": `<Relationships xmlns="${R}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  "word/document.xml": `<w:document xmlns:w="${W}"><w:body>${["公开合成演示材料（非真实客户）", "合成客户甲与合成机构乙仅用于演示。", "电话：13800138000；邮箱：demo@example.com。", "重复电话：13800138000。", "本文件不含业务数据，识别结果仍需逐项人工复核。"].map(t => `<w:p><w:r><w:t>${xml(t)}</w:t></w:r></w:p>`).join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
}).map(([name, text]) => [name, Buffer.from(text)])));
await save("合成合同.docx", docx);
const dictionary = await exportDictionary([{ value: "合成客户甲", kind: "姓名" }, { value: "合成机构乙", kind: "机构" }, { value: "公开演示用语", kind: "自定义", action: "exclude" }]);
await save("合成黑白名单.xlsx", dictionary);
const workbook = await readZip(dictionary);
const table = [["姓名", "手机号", "说明"], ["合成客户甲", "13800138000", "公开合成材料，非真实客户"], ["合成客户乙", "13900139000", "仅用于演示，不含业务数据"]];
workbook.set("xl/workbook.xml", Buffer.from(workbook.get("xl/workbook.xml")!.toString().replace('name="名单"', 'name="合成通讯录"')));
workbook.set("xl/worksheets/sheet1.xml", Buffer.from(`<worksheet xmlns="${S}"><sheetData>${table.map((row, i) => `<row r="${i + 1}">${row.map((text, j) => `<c r="${"ABC"[j]}${i + 1}" t="inlineStr"><is><t>${xml(text)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`));
const xlsx = await writeZip(workbook);
await save("合成通讯录.xlsx", xlsx);
await save("合成通讯录.csv", "姓名,手机号,说明\r\n合成客户甲,13800138000,公开合成材料非真实客户\r\n合成客户乙,13900139000,仅用于演示不含业务数据\r\n");
await save("合成说明.md", "# 公开合成演示材料\n\n**以下信息仅用于演示，不代表真实客户或真实联系方式。**\n\n- 合成客户甲，电话：13800138000\n- 合成机构乙，邮箱：demo@example.com\n- 重复电话：13800138000\n- 项目词表白名单演示值：公开演示用语\n\n请人工复核敏感标记后再导出。\n");
const pdf = pdfFixture({ pages: 2, text: "SYNTHETIC ONLY: Phone 13800138000", author: "PUBLIC SYNTHETIC DEMO - NO CUSTOMER DATA" });
await save("合成双页.pdf", pdf);
const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="white"/><g font-family="Arial,sans-serif" fill="black"><text x="60" y="90" font-size="36">PUBLIC SYNTHETIC DEMO - NO CUSTOMER DATA</text><text x="60" y="190" font-size="54">Phone: 13800138000</text><text x="60" y="290" font-size="48">Email: demo@example.com</text></g></svg>')).png().toBuffer();
await save("合成截图.png", png);
const checks: Record<string, unknown> = {};
for (const [name, bytes, format] of [["合成合同.docx", docx, "docx"], ["合成通讯录.xlsx", xlsx, "xlsx"]] as const) {
  const parsed = await parseOffice(bytes, format);
  if (!parsed.text.includes("13800138000") || parsed.coverage.some(c => c.status === "blocked")) throw new Error(`Invalid sample: ${name}`);
  checks[name] = { parse: "passed", textLength: parsed.text.length, coverage: parsed.coverage };
}
checks["合成黑白名单.xlsx"] = { entries: (await importDictionary(dictionary)).length };
const reader = await openPdf(pdf);
try { checks["合成双页.pdf"] = { pages: reader.count, text: (await reader.page(0)).text }; } finally { reader.close(); }
const metadata = await sharp(png).metadata();
checks["合成截图.png"] = { width: metadata.width, height: metadata.height };
await save("示例结构核验.json", JSON.stringify({ note: "仅文件结构和解析核验；非浏览器实操记录。", checks }, null, 2));
console.log(JSON.stringify(checks, null, 2));
