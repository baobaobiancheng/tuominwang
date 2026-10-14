import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import sharp from "sharp";
import { officeImageFixture, officeFixture } from "../tests/office-fixtures.ts";
import { pdfFixture } from "../tests/pdf-fixtures.ts";
import { parseOffice, exportOffice } from "../packages/core/office.ts";
import { parseOfficeImages, exportOfficeImages } from "../packages/adapters/office-images.ts";
import { detect } from "../packages/core/redaction.ts";
import { openPdf } from "../packages/core/pdf-reader.ts";
import { createOcr, recognizePage } from "../packages/core/ocr.ts";

// Public synthetic fixtures only. No business DB, credentials, original user documents or model egress.
const directory = resolve(".data/evals/office-render"); await mkdir(directory, { recursive: true });
const output = await mkdtemp(join(directory, "run-"));
process.env.DATA_KEY = randomBytes(32).toString("hex"); process.env.DATA_DIR = join(output, "encrypted");
const pdf = await openPdf(pdfFixture()); let jpeg: Buffer;
try { jpeg = await sharp((await pdf.page(0)).png).jpeg().withExif({ IFD0: { Artist: "13800138000" } }).toBuffer(); } finally { pdf.close(); }
for (const format of ["docx", "xlsx"] as const) {
  const source = format === "docx" ? await officeImageFixture(jpeg) : await officeFixture(format);
  const parsed = format === "docx" ? await parseOfficeImages(source) : { ...await parseOffice(source, format), pages: [] };
  assert.ok(parsed.coverage.every(c => c.status === "complete"));
  const marks = detect(parsed.text, parsed.anchors).map(m => ({ ...m, decision: "redact" as const }));
  const images = format === "docx" ? await exportOfficeImages({ page_data: parsed.pages, page_review: { mode: "raster", regions: [], deletedPages: [] }, anchors: parsed.anchors, marks }, parsed.text) : undefined;
  const exported = await exportOffice(source, format, parsed.text, parsed.anchors, parsed.coverage, marks, images);
  const filename = join(output, `redacted.${format}`), renderDir = join(output, format); await mkdir(renderDir); await writeFile(filename, exported);
  const executable = process.env.SOFFICE_BIN;
  if (!executable) throw new Error("Set SOFFICE_BIN to a local LibreOffice executable");
  const args = [executable, "--headless", "--convert-to", "pdf", "--outdir", renderDir, filename];
  const result = process.platform === "darwin" ? spawnSync("/usr/bin/sandbox-exec", ["-p", "(version 1)(allow default)(deny network*)", ...args], { timeout: 60000, encoding: "utf8" }) : spawnSync(executable, args.slice(1), { timeout: 60000, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const rendered = await openPdf(await readFile(join(renderDir, "redacted.pdf"))), ocr = await createOcr();
  try {
    let text = "";
    for (let i = 0; i < rendered.count; i++) { const page = await rendered.page(i); if (i === 0) await writeFile(join(renderDir, "first-page.png"), page.png); text += page.text + "\n" + (await recognizePage(ocr, page.png)).text; }
    for (const mark of marks) assert.ok(!text.replace(/\s/gu, "").includes(parsed.text.slice(mark.start, mark.end).replace(/\s/gu, "")), `residue in ${format}`);
    if (format === "docx") assert.ok(text.includes("Public image fixture"));
    console.log(`${format}: LibreOffice opened and rendered ${rendered.count} page(s), text/OCR residue check passed`);
  } finally { await ocr.terminate(); rendered.close(); }
}
console.log(`Synthetic render artifacts: ${output}`);
