import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { parseOffice } from "../../packages/core/office.ts";
import { readZip } from "../../packages/core/office-zip.ts";
import { openPdf } from "../../packages/core/pdf-reader.ts";
import { createOcr, recognizePage } from "../../packages/core/ocr.ts";
import { importDictionary } from "../../packages/core/dictionary-workbook.ts";
import { parse as parseCsv } from "csv-parse/sync";
import { DOMParser } from "@xmldom/xmldom";

const base = dirname(fileURLToPath(import.meta.url));
const samples = join(base, "示例材料");
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function artifact(name: string) {
  const mapped = ["合成双页-处理结果.pdf", "合成截图-处理结果.png", "合成通讯录-处理结果.xlsx", "合成通讯录-处理结果.csv", "合成说明-词表处理结果.md"].includes(name) ? "v2-" + name : name;
  const path = join(samples, mapped), bytes = await readFile(path);
  return { path, bytes, sha256: sha256(bytes), size: bytes.length };
}
const fileInfo = ({ path, sha256, size }: Awaited<ReturnType<typeof artifact>>) => ({ path, sha256, bytes: size });
const result: Record<string, unknown> = {
  verifiedAt: new Date().toISOString(),
  provenance: "处理结果文件由子代理从Edge实际下载，主代理按文件哈希留存并核验。此脚本只读取这些文件，未生成、替换或改写下载产物；输入fixture单独记录。",
  scope: "仅核验下面列出的实际产物及指定原敏感值，不代表所有业务内容均已脱敏，也不代表整个产品已完成验收。",
};

const pdfInput = await artifact("合成双页.pdf"), pdfOutput = await artifact("合成双页-处理结果.pdf");
const inputPdf = await openPdf(pdfInput.bytes), outputPdf = await openPdf(pdfOutput.bytes);
const pages = [];
await mkdir(join(base, "核验图-v2"), { recursive: true });
try {
  for (let i = 0; i < outputPdf.count; i++) {
    const before = await inputPdf.page(i), after = await outputPdf.page(i);
    const native = outputPdf.module, page = native.FPDF_LoadPage(outputPdf.doc, i);
    const objectTypes: number[] = [];
    let annotations = 0;
    try {
      annotations = native.FPDFPage_GetAnnotCount(page);
      for (let n = 0; n < native.FPDFPage_CountObjects(page); n++) objectTypes.push(native.FPDFPageObj_GetType(native.FPDFPage_GetObject(page, n)));
    } finally { native.FPDF_ClosePage(page); }
    const start = before.text.indexOf("13800138000"), end = start + 11;
    const glyphs = before.glyphs.filter(g => g[0] < end && g[1] > start);
    if (start < 0 || !glyphs.length) throw new Error("Original phone glyphs missing");
    const left = Math.floor(Math.min(...glyphs.map(g => g[2])) * after.scale) + 1;
    const top = Math.floor(Math.min(...glyphs.map(g => g[3])) * after.scale) + 1;
    const right = Math.ceil(Math.max(...glyphs.map(g => g[2] + g[4])) * after.scale) - 1;
    const bottom = Math.ceil(Math.max(...glyphs.map(g => g[3] + g[5])) * after.scale) - 1;
    const { data, info } = await sharp(after.png).removeAlpha().extract({ left, top, width: right - left, height: bottom - top }).raw().toBuffer({ resolveWithObject: true });
    let black = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) if (data[offset] <= 8 && data[offset + 1] <= 8 && data[offset + 2] <= 8) black++;
    const renderPath = join(base, "核验图-v2", `PDF处理结果第${i + 1}页.png`);
    await writeFile(renderPath, after.png);
    pages.push({ page: i + 1, sourcePhoneOccurrences: before.text.split("13800138000").length - 1, selectableText: after.text, glyphCount: after.glyphs.length, objectTypes, imageObjectsOnly: objectTypes.length > 0 && objectTypes.every(type => type === 3), annotations, originalPhonePixelBox: { left, top, right, bottom }, blackPixelRatioInPhoneBox: black / (info.width * info.height), renderPath });
  }
  result.pdf = {
    inputFixture: fileInfo(pdfInput), downloadedArtifact: fileInfo(pdfOutput),
    sourcePageCount: inputPdf.count, outputPageCount: outputPdf.count, expectedTwoPages: outputPdf.count === 2,
    metadata: outputPdf.meta, attachments: outputPdf.attachments, scripts: outputPdf.scripts, pages,
    limitation: "核验了下载PDF本体的图片对象、空文字层、附件/脚本/注释和原手机号区域像素；不把仅删除文字层当作完成像素脱敏。",
  };
} finally { inputPdf.close(); outputPdf.close(); }
const pngInput = await artifact("合成截图.png"), pngOutput = await artifact("合成截图-处理结果.png");
const inputMeta = await sharp(pngInput.bytes).metadata(), outputMeta = await sharp(pngOutput.bytes).metadata();
const ocr = await createOcr();
try {
  const before = await recognizePage(ocr, pngInput.bytes), after = await recognizePage(ocr, pngOutput.bytes);
  const regions = [];
  for (const value of ["13800138000", "demo@example.com"]) {
    const start = before.text.indexOf(value);
    const glyphs = start < 0 ? [] : before.glyphs.filter(g => g[0] < start + value.length && g[1] > start);
    let black = 0, pixels = 0;
    for (const glyph of glyphs) {
      const left = Math.ceil(glyph[2]), top = Math.ceil(glyph[3]);
      const width = Math.floor(glyph[2] + glyph[4]) - left, height = Math.floor(glyph[3] + glyph[5]) - top;
      if (width <= 0 || height <= 0) continue;
      const { data, info } = await sharp(pngOutput.bytes).removeAlpha().extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
      pixels += width * height;
      for (let offset = 0; offset < data.length; offset += info.channels) if (data[offset] <= 8 && data[offset + 1] <= 8 && data[offset + 2] <= 8) black++;
    }
    regions.push({ value, sourceOcrContainsValue: start >= 0, outputOcrContainsValue: after.text.includes(value), sourceGlyphCount: glyphs.length, checkedPixels: pixels, blackPixelRatioInSourceGlyphs: pixels ? black / pixels : null });
  }
  result.png = {
    status: "verified_download", inputFixture: fileInfo(pngInput), downloadedArtifact: fileInfo(pngOutput),
    dimensionsPreserved: inputMeta.width === outputMeta.width && inputMeta.height === outputMeta.height,
    dimensions: { width: outputMeta.width, height: outputMeta.height },
    metadata: { exif: !!outputMeta.exif, icc: !!outputMeta.icc, iptc: !!outputMeta.iptc, xmp: !!outputMeta.xmp },
    sourceOcrText: before.text, outputOcrText: after.text, sensitiveRegions: regions,
    visualReview: "已查看实际下载PNG：电话和邮箱字形位置被黑色清除，标题及Phone/Email标签保留。",
    limitation: "OCR复测不能单独证明无残留，因此另按输入OCR字形坐标核验输出像素；此结论仅覆盖样例中的指定手机号与邮箱。",
  };
} finally { await ocr.terminate(); }
const contactValues = ["合成客户甲", "合成客户乙", "13800138000", "13900139000"];
const contactReplacement = (value: string) => contactValues.includes(value) ? (value.startsWith("合成") ? "【姓名】" : "【手机号】") : value;
const occurrences = (text: string, value: string) => text.split(value).length - 1;
function cells(parsed: Awaited<ReturnType<typeof parseOffice>>) {
  return parsed.anchors.filter(a => a.object?.startsWith("cell:")).map(a => ({ part: a.part, row: a.row, column: a.column, value: parsed.text.slice(a.start, a.end) }));
}
const xlsxInput = await artifact("合成通讯录.xlsx"), xlsxOutput = await artifact("合成通讯录-处理结果.xlsx");
const beforeXlsx = await parseOffice(xlsxInput.bytes, "xlsx"), afterXlsx = await parseOffice(xlsxOutput.bytes, "xlsx");
const xlsxParts = await readZip(xlsxOutput.bytes);
const expectedCells = cells(beforeXlsx).map(cell => ({ ...cell, value: contactReplacement(cell.value) }));
result.xlsx = {
  inputFixture: fileInfo(xlsxInput), downloadedArtifact: fileInfo(xlsxOutput),
  zipCrcPassed: execFileSync("unzip", ["-t", xlsxOutput.path], { encoding: "utf8" }).includes("No errors detected"),
  parserCoverageComplete: afterXlsx.coverage.every(part => part.status === "complete"),
  exactExpectedCellsAndCoordinates: JSON.stringify(cells(afterXlsx)) === JSON.stringify(expectedCells),
  sheetCount: [...xlsxParts.keys()].filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).length,
  cellCount: cells(afterXlsx).length, outputCells: cells(afterXlsx),
  originalValues: contactValues.map(value => ({ value, inputOccurrences: occurrences(beforeXlsx.text, value), outputOccurrences: occurrences(afterXlsx.text, value), matchingPackageParts: [...xlsxParts].filter(([name, bytes]) => name.includes(value) || bytes.toString("utf8").includes(value)).map(([name]) => name) })),
  replacements: { names: occurrences(afterXlsx.text, "【姓名】"), phones: occurrences(afterXlsx.text, "【手机号】") },
  limitation: "单张表9个单元格的位置、表头和说明文字保留；两个人名和两处手机号替换。核验ZIP与OOXML，不代表在Microsoft Excel内验证了视觉版式。",
};
const csvInput = await artifact("合成通讯录.csv"), csvOutput = await artifact("合成通讯录-处理结果.csv");
const inputRows = parseCsv(csvInput.bytes.toString("utf8")) as string[][], outputRows = parseCsv(csvOutput.bytes.toString("utf8")) as string[][];
result.csv = {
  inputFixture: fileInfo(csvInput), downloadedArtifact: fileInfo(csvOutput),
  exactExpectedRows: JSON.stringify(outputRows) === JSON.stringify(inputRows.map(row => row.map(contactReplacement))),
  rowCountIncludingHeader: outputRows.length, columnCounts: outputRows.map(row => row.length), outputRows,
  originalValues: contactValues.map(value => ({ value, inputOccurrences: occurrences(csvInput.bytes.toString("utf8"), value), outputOccurrences: occurrences(csvOutput.bytes.toString("utf8"), value) })),
  limitation: "比较解析后的3行3列，允许导出CSV增加标准引号；表头及合成说明原样保留，仅姓名和手机号替换。",
};

const mdNew = await artifact("合成说明-词表处理结果.md");
const mdPrior = await readFile(join(samples,"合成说明-词表处理结果.md"));
result.markdown = { downloadedArtifact: fileInfo(mdNew), identicalToPreviouslyVerifiedDictionaryOutput: mdNew.sha256 === sha256(mdPrior), limitation: "本轮文件字节与此前独立验证的词表处理结果一致；不将旧UI操作冒充本轮操作。" };
const failed = [!result.pdf.expectedTwoPages, ...result.pdf.pages.map(p => p.blackPixelRatioInPhoneBox < .99 || !p.imageObjectsOnly || p.selectableText.length > 0), !result.png.dimensionsPreserved, ...result.png.sensitiveRegions.map(r => !r.sourceOcrContainsValue || r.outputOcrContainsValue || r.blackPixelRatioInSourceGlyphs < .99), !result.xlsx.exactExpectedCellsAndCoordinates, !result.csv.exactExpectedRows, !result.markdown.identicalToPreviouslyVerifiedDictionaryOutput].some(Boolean);
result.status = failed ? "failed" : "passed";
await writeFile(join(base,"导出核验-v2.json"),JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({status:result.status,formats:["pdf","png","xlsx","csv","md"]}));
if(failed) process.exitCode=1;
