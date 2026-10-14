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
  const path = join(samples, name), bytes = await readFile(path);
  return { path, bytes, sha256: sha256(bytes), size: bytes.length };
}
const fileInfo = ({ path, sha256, size }: Awaited<ReturnType<typeof artifact>>) => ({ path, sha256, bytes: size });
const result: Record<string, unknown> = {
  verifiedAt: new Date().toISOString(),
  provenance: "处理结果文件由主代理从浏览器下载。此脚本只读取这些文件，未生成、替换或改写下载产物；输入fixture单独记录。",
  scope: "仅核验下面列出的实际产物及指定原敏感值，不代表所有业务内容均已脱敏，也不代表整个产品已完成验收。",
};

const textInput = await artifact("文本演示.txt"), textOutput = await artifact("文本演示-处理结果.txt");
const text = textOutput.bytes.toString("utf8");
const expected = textInput.bytes.toString("utf8").replaceAll("青禾示例公司", "【机构_000001】").replace("13800138000", "138***8000").replace("13800138000", "【手机号】").replaceAll("demo@example.com", "联系邮箱已隐藏");
result.txt = {
  inputFixture: fileInfo(textInput), downloadedArtifact: fileInfo(textOutput),
  exactExpectedContent: text === expected,
  originalValues: ["青禾示例公司", "13800138000", "demo@example.com"].map(value => ({ value, inputOccurrences: textInput.bytes.toString("utf8").split(value).length - 1, outputOccurrences: text.split(value).length - 1 })),
  intentionalRetainedContent: ["DEMO-ALPHA", "138***8000"].map(value => ({ value, present: text.includes(value) })),
  limitation: "第一处电话按部分遮盖保留前3后4位，内部编号未处理并仍保留；不能描述成清除了所有原始信息。",
};

const docxInput = await artifact("合成合同.docx"), docxOutput = await artifact("合成合同-处理结果.docx");
const parts = await readZip(docxOutput.bytes), parsed = await parseOffice(docxOutput.bytes, "docx");
const crc = execFileSync("unzip", ["-t", docxOutput.path], { encoding: "utf8" });
result.docx = {
  inputFixture: fileInfo(docxInput), downloadedArtifact: fileInfo(docxOutput),
  zipCrcPassed: crc.includes("No errors detected"), zipPartNames: [...parts.keys()],
  mainDocumentPresent: parts.has("word/document.xml"), parserCoverageComplete: parsed.coverage.every(part => part.status === "complete"),
  originalValues: ["13800138000", "demo@example.com"].map(value => ({ value, parsedTextOccurrences: parsed.text.split(value).length - 1, matchingPackageParts: [...parts].filter(([name, bytes]) => name.includes(value) || bytes.toString("utf8").includes(value)).map(([name]) => name) })),
  replacements: { phonePlaceholders: parsed.text.split("【手机号】").length - 1, emailPlaceholders: parsed.text.split("【邮箱】").length - 1 },
  retainedSyntheticNames: ["合成客户甲", "合成机构乙"].filter(value => parsed.text.includes(value)),
  limitation: "已核验ZIP完整性、OOXML解析及指定手机号/邮箱在包内无残留；合成人名/机构仍在正文中。本核验不等于已在Microsoft Word中检查原版式。",
};

const pdfInput = await artifact("合成双页.pdf"), pdfOutput = await artifact("合成双页-处理结果.pdf");
const inputPdf = await openPdf(pdfInput.bytes), outputPdf = await openPdf(pdfOutput.bytes);
const pages = [];
await mkdir(join(base, "核验图"), { recursive: true });
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
    const renderPath = join(base, "核验图", `PDF处理结果第${i + 1}页.png`);
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
const entityDocxOutput = await artifact("合成合同-实体识别处理结果.docx");
const entityDocxParts = await readZip(entityDocxOutput.bytes), entityDocxParsed = await parseOffice(entityDocxOutput.bytes, "docx"), originalDocxParsed = await parseOffice(docxInput.bytes, "docx");
const entityDocxExpected = originalDocxParsed.text.replaceAll("合成客户甲", "【姓名】").replaceAll("合成机构乙", "【机构】").replaceAll("13800138000", "【手机号】").replaceAll("demo@example.com", "【邮箱】");
const sourceDocxParts = await readZip(docxInput.bytes);
const sourceMainXml = sourceDocxParts.get("word/document.xml")!.toString("utf8"), entityMainXml = entityDocxParts.get("word/document.xml")!.toString("utf8");
const docxParagraphs = (xml: string) => Array.from(new DOMParser().parseFromString(xml, "text/xml").getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "p")).map(p => Array.from(p.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "t")).map(t => t.textContent).join(""));
const expectedParagraphs = docxParagraphs(sourceMainXml).map(text => text.replaceAll("合成客户甲", "【姓名】").replaceAll("合成机构乙", "【机构】").replaceAll("13800138000", "【手机号】").replaceAll("demo@example.com", "【邮箱】"));
result.docxAfterEntityCandidates = {
  inputFixture: fileInfo(docxInput), downloadedArtifact: fileInfo(entityDocxOutput),
  zipCrcPassed: execFileSync("unzip", ["-t", entityDocxOutput.path], { encoding: "utf8" }).includes("No errors detected"),
  mainDocumentPresent: entityDocxParts.has("word/document.xml"),
  packagePartsPreserved: JSON.stringify([...sourceDocxParts.keys()].sort()) === JSON.stringify([...entityDocxParts.keys()].sort()),
  parserCoverageComplete: entityDocxParsed.coverage.every(part => part.status === "complete"),
  paragraphCount: (entityMainXml.match(/<w:p>/g) ?? []).length,
  sourceParagraphCount: (sourceMainXml.match(/<w:p>/g) ?? []).length,
  sectionPropertiesPreserved: entityMainXml.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/)?.[0] === sourceMainXml.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/)?.[0],
  exactExpectedParsedContent: entityDocxParsed.text === entityDocxExpected,
  exactExpectedParagraphContent: JSON.stringify(docxParagraphs(entityMainXml)) === JSON.stringify(expectedParagraphs),
  parserTextDifference: "解析器还把新增xml:space属性的preserve值纳入审查文本，因此解析全文直接比较不相等；另从OOXML的w:p/w:t提取实际段落逐段比对，纸张与页边距属性单独核验。preserve不是文档正文。",
  originalValues: ["合成客户甲", "合成机构乙", "13800138000", "demo@example.com"].map(value => ({ value, inputOccurrences: occurrences(originalDocxParsed.text, value), outputOccurrences: occurrences(entityDocxParsed.text, value), matchingPackageParts: [...entityDocxParts].filter(([name, bytes]) => name.includes(value) || bytes.toString("utf8").includes(value)).map(([name]) => name) })),
  replacements: { names: occurrences(entityDocxParsed.text, "【姓名】"), organizations: occurrences(entityDocxParsed.text, "【机构】"), phones: occurrences(entityDocxParsed.text, "【手机号】"), emails: occurrences(entityDocxParsed.text, "【邮箱】") },
  uiExecutionRecord: "主代理更新词表后点击识别实体候选，完成后5候选全组脱敏，保存→生成→下载；真实Edge截图52、53。",
  limitation: "规则、词表等共同参与识别，不能把全部候选归因于NER，也不构成NER准确率验收；仅核验此下载样本5处替换、包结构、段落和纸张/页边距信息，不代表已在Microsoft Word中视觉验收。",
};
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
const mdInput = await artifact("合成说明.md"), mdOutput = await artifact("合成说明-处理结果.md");
const beforeMd = mdInput.bytes.toString("utf8"), afterMd = mdOutput.bytes.toString("utf8");
result.markdown = {
  inputFixture: fileInfo(mdInput), downloadedArtifact: fileInfo(mdOutput),
  exactExpectedContent: afterMd === beforeMd.replaceAll("13800138000", "【手机号】").replaceAll("demo@example.com", "【邮箱】"),
  originalValues: ["13800138000", "demo@example.com"].map(value => ({ value, inputOccurrences: occurrences(beforeMd, value), outputOccurrences: occurrences(afterMd, value) })),
  retainedContent: ["合成客户甲", "合成机构乙", "公开演示用语"].map(value => ({ value, present: afterMd.includes(value) })),
  limitation: "标题、粗体、列表和换行按预期保留；仅两处手机号和一处邮箱替换，合成人名、机构及白名单演示值仍保留。",
};
const dictionaryInput = await artifact("合成黑白名单.xlsx"), dictionaryOutput = await artifact("项目词表-导出结果.xlsx");
const dictionaryMdOutput = await artifact("合成说明-词表处理结果.md");
const dictionaryMdText = dictionaryMdOutput.bytes.toString("utf8");
const dictionaryMdExpected = beforeMd.replaceAll("合成客户甲", "【姓名】").replaceAll("合成机构乙", "【机构】").replaceAll("13800138000", "【手机号】").replaceAll("demo@example.com", "【邮箱】");
result.markdownAfterDictionaryRerun = {
  inputFixture: fileInfo(mdInput), downloadedArtifact: fileInfo(dictionaryMdOutput),
  ruleFixture: fileInfo(dictionaryInput),
  exactExpectedContent: dictionaryMdText === dictionaryMdExpected,
  originalValues: ["合成客户甲", "合成机构乙", "13800138000", "demo@example.com"].map(value => ({ value, inputOccurrences: occurrences(beforeMd, value), outputOccurrences: occurrences(dictionaryMdText, value) })),
  replacements: { names: occurrences(dictionaryMdText, "【姓名】"), organizations: occurrences(dictionaryMdText, "【机构】"), phones: occurrences(dictionaryMdText, "【手机号】"), emails: occurrences(dictionaryMdText, "【邮箱】") },
  whitelistValue: { value: "公开演示用语", inputOccurrences: occurrences(beforeMd, "公开演示用语"), outputOccurrences: occurrences(dictionaryMdText, "公开演示用语"), retained: dictionaryMdText.includes("公开演示用语") },
  uiExecutionRecord: "主代理现场完成本地词表重识别：6个候选，白名单1项批量保留，其余5项批量脱敏，保存→生成→下载；截图45、46。",
  limitation: "与早先只替换电话/邮箱的合成说明-处理结果.md分开记录；本产物另替换人名和机构，白名单原值仍保留。文件核验不单独证明候选来源，流程依据现场操作与截图。",
};
const originalEntries = await importDictionary(dictionaryInput.bytes), outputEntries = await importDictionary(dictionaryOutput.bytes);
const normalizeEntries = (entries: typeof outputEntries) => entries.map(e => [e.value, e.kind, e.action ?? "include"]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
result.dictionary = {
  inputFixture: fileInfo(dictionaryInput), downloadedArtifact: fileInfo(dictionaryOutput),
  artifactPurpose: "项目词表导出，保留规则原值的可再导入配置；不是脱敏后的文档。",
  zipCrcPassed: execFileSync("unzip", ["-t", dictionaryOutput.path], { encoding: "utf8" }).includes("No errors detected"),
  importParserAccepted: true, exactExpectedEntries: JSON.stringify(normalizeEntries(outputEntries)) === JSON.stringify(normalizeEntries(originalEntries)),
  entryCount: outputEntries.length, blacklistCount: outputEntries.filter(e => e.action !== "exclude").length, whitelistCount: outputEntries.filter(e => e.action === "exclude").length, entries: outputEntries,
  limitation: "三条规则与合成输入一致，两黑一白。此文件应保留合成客户甲/合成机构乙/公开演示用语原值；本核验只读调用导入解析器，没有在UI再次导入或修改项目词表。",
};
await writeFile(join(base, "导出核验.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
