import { describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { applyDocxProfile, rasterPdfToDocx, safeExportName } from "../packages/core/profile-export.ts";
import { defaultProfile } from "../packages/core/presets.ts";
import { readZip, xml, elements } from "../packages/core/office-zip.ts";
import { parseOffice, exportOffice } from "../packages/core/office.ts";
import { detect } from "../packages/core/redaction.ts";
import { RasterPdf } from "../packages/core/page-redaction.ts";
import { buildProfileArtifacts, safePageMarkdown, pseudonymTableNames, escapePlainMarkdown } from "../packages/adapters/profile-export.ts";
import { visualReplacementPlan, renderVisualReplacement } from "../packages/core/visual-replacement.ts";
import { writeArtifact } from "../packages/adapters/storage.ts";
import { officeFixture, officeImageFixture } from "./office-fixtures.ts";
import { pdfFixture } from "./pdf-fixtures.ts";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
describe("profile export semantics on actual DOCX/PDF bytes", () => {
  it("removes header/footer/comments parts and references, keeps the source immutable", async () => {
    const source = await officeFixture("docx"), before = createHash("sha256").update(source).digest("hex"), settings = { ...defaultProfile().docx, removeHeaderFooter: true, commentHandlingMode: "remove" as const };
    const output = await applyDocxProfile(source, settings), files = await readZip(output.bytes);
    expect([...files.keys()].some(p => /^word\/(header|footer|comments)/u.test(p))).toBe(false);
    for (const bytes of files.values()) expect(bytes.toString().includes("header1.xml")).toBe(false);
    expect(output.coverage.every(c => c.status === "complete")).toBe(true); expect(createHash("sha256").update(source).digest("hex")).toBe(before);
  });
  it("anonymizes only comment identities while keeping the comment body and keeping unrelated layout", async () => {
    const source = await officeFixture("docx"), output = await applyDocxProfile(source, { ...defaultProfile().docx, commentHandlingMode: "anonymize" });
    const comments = xml((await readZip(output.bytes)).get("word/comments.xml")!); expect(elements(comments, W, "comment")[0].getAttributeNS(W, "author")).toBe("匿名");
    expect(comments.documentElement?.textContent).toContain("13300133000");
    const kept = await applyDocxProfile(source, { ...defaultProfile().docx, commentHandlingMode: "keep" }); expect((await readZip(kept.bytes)).has("word/comments.xml")).toBe(true);
  });
  it("removes every embedded image file plus drawings and relationships, then reparses coverage", async () => {
    const image = await sharp({ create: { width: 50, height: 50, channels: 3, background: "white" } }).png().toBuffer();
    const source = await officeImageFixture(image), output = await applyDocxProfile(source, { ...defaultProfile().docx, removeImages: true });
    const files = await readZip(output.bytes); expect([...files.keys()].some(p => p.startsWith("word/media/"))).toBe(false);
    expect(elements(xml(files.get("word/document.xml")!), W, "drawing")).toHaveLength(0); expect(output.coverage.every(c => c.status === "complete")).toBe(true);
  });
  it("creates a Word page-image wrapper only from raster PDF with no original text layer", async () => {
    const pdf = new RasterPdf(), rgb = await sharp({ create: { width: 200, height: 200, channels: 3, background: "white" } }).raw().toBuffer();
    pdf.add({ index: 0, width: 100, height: 100 }, rgb, 200, 200); pdf.add({ index: 1, width: 100, height: 100 }, rgb, 200, 200);
    const converted = await rasterPdfToDocx(pdf.finish()), files = await readZip(converted.bytes); expect(converted.pages).toHaveLength(2); expect(files.has("word/media/page-1.png")).toBe(true); expect(files.has("word/media/page-2.png")).toBe(true); expect(converted.coverage.every(c => c.status === "complete")).toBe(true);
    await expect(rasterPdfToDocx(pdfFixture())).rejects.toThrow("PDF_NOT_REDACTED_RASTER");
  });
  it("Word Markdown uses postprocessed redacted paragraphs, including removing requested headers", async () => {
    const source = await officeFixture("docx"), parsed = await parseOffice(source, "docx"), marks = detect(parsed.text).map(m => ({ ...m, decision: "redact" as const }));
    const verified = await exportOffice(source, "docx", parsed.text, parsed.anchors, parsed.coverage, marks), profile = defaultProfile(); profile.docx.exportMarkdown = true; profile.docx.removeHeaderFooter = true; profile.docx.commentHandlingMode = "remove";
    const artifacts = await buildProfileArtifacts({ document: { source_format: "docx", anchors: parsed.anchors, marks }, text: parsed.text, verifiedOutput: verified, outputFormat: "docx", filename: "合成材料.docx", profile });
    expect(artifacts.map(a => a.role)).toEqual(["primary", "markdown"]); const sidecar = artifacts[1].bytes.toString(); expect(sidecar).not.toContain("13800138000"); expect(sidecar).not.toContain("页眉"); expect(sidecar).not.toContain("13300133000");
  });
  it("image/PDF Markdown excludes manually cleared glyphs and all deleted pages", async () => {
    const previousDir = process.env.DATA_DIR, previousKey = process.env.DATA_KEY, directory = await mkdtemp(join(tmpdir(), "tmw-profile-test-")); process.env.DATA_DIR = directory; process.env.DATA_KEY = "ab".repeat(32);
    try {
      const mapId = randomUUID(), map = JSON.stringify([[0, 11, 10, 10, 110, 20], [12, 16, 150, 10, 40, 20]]), mapHash = await writeArtifact(mapId, map);
      const page = (index: number) => ({ index, width: 200, height: 100, rotation: 0, confidence: 1, mapId, mapHash, previewId: randomUUID(), previewHash: "0".repeat(64) });
      const document = { anchors: [{ kind: "page" as const, page: 0, start: 0, end: 16 }, { kind: "page" as const, page: 1, start: 17, end: 23 }], marks: [], page_data: [page(0), page(1)], page_review: { mode: "raster", regions: [{ id: randomUUID(), page: 0, x: 10, y: 10, width: 110, height: 20, reason: "敏感区域" }], deletedPages: [1] } };
      const markdown = await safePageMarkdown(document, "13800138000 Safe\nSECRET"); expect(markdown).toContain("Safe"); expect(markdown).not.toContain("13800138000"); expect(markdown).not.toContain("SECRET");
    } finally { if (previousDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previousDir; if (previousKey === undefined) delete process.env.DATA_KEY; else process.env.DATA_KEY = previousKey; await rm(directory, { recursive: true }); }
  });
  it("page Markdown retains exactly the alias/custom fragments actually drawn across multiple lines", async () => {
    const previousDir=process.env.DATA_DIR,previousKey=process.env.DATA_KEY,directory=await mkdtemp(join(tmpdir(),"tmw-profile-label-"));process.env.DATA_DIR=directory;process.env.DATA_KEY="ad".repeat(32);
    try{
      const value="13800138000",publicText=" Public <b>tag</b> [link](https://example.com) *literal*",text=value+publicText,mapId=randomUUID();
      const glyphs:any[]=Array.from(value,(_,i)=>[i,i+1,10+(i%6)*24,10+Math.floor(i/6)*40,20,20]);glyphs.push([value.length,text.length,180,70,180,20]);const mapHash=await writeArtifact(mapId,JSON.stringify(glyphs));
      const anchor={kind:"page" as const,page:0,start:0,end:text.length},page={index:0,width:400,height:120,rotation:0,confidence:1,mapId,mapHash,previewId:randomUUID(),previewHash:"0".repeat(64)},policy={mode:"raster" as const,regions:[],deletedPages:[]};
      const source=await sharp({create:{width:800,height:240,channels:3,background:"white"}}).png().toBuffer();
      for(const replacement of [{mode:"alias" as const,mappingId:randomUUID(),version:1 as const,token:"【敏感项_000001】"},{mode:"custom" as const,value:"REMOVED_LABEL"},{mode:"clear" as const},undefined]){
        const mark={start:0,end:value.length,kind:"手机号" as const,decision:"redact" as const,...replacement?{replacement}:{}};
        const plan=visualReplacementPlan(text,[mark],[anchor],page,glyphs,policy),rendered=await renderVisualReplacement(source,page,plan,"black");expect(rendered.png.subarray(1,4).toString()).toBe("PNG");
        const md=await safePageMarkdown({anchors:[anchor],marks:[mark],page_data:[page],page_review:policy},text),drawn=plan.draws.map(d=>d.text).join("");
        if(drawn)expect(md).toContain(escapePlainMarkdown(drawn));else{expect(md).not.toContain("敏感项");expect(md).not.toContain("REMOVED");}
        expect(md).not.toContain(value);expect(md).toContain("&lt;b&gt;tag&lt;/b&gt;");expect(md).toContain("\\[link\\]\\(https://example\\.com\\)");expect(md).toContain("\\*literal\\*");
      }
    }finally{if(previousDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previousDir;if(previousKey===undefined)delete process.env.DATA_KEY;else process.env.DATA_KEY=previousKey;await rm(directory,{recursive:true});}
  },30000);
  it("derived Word Markdown treats parsed HTML/Markdown source as literal text while keeping original bytes", async()=>{
    const markup="<script>alert('x')</script> [x](https://example.com) *bold*",source=await officeFixture("docx",{"word/document.xml":`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>&lt;script&gt;alert('x')&lt;/script&gt; [x](https://example.com) *bold*</w:t></w:r></w:p></w:body></w:document>`}),before=createHash("sha256").update(source).digest("hex"),parsed=await parseOffice(source,"docx"),profile=defaultProfile();profile.docx.exportMarkdown=true;
    const artifacts=await buildProfileArtifacts({document:{source_format:"docx",anchors:parsed.anchors,marks:[]},text:parsed.text,verifiedOutput:source,outputFormat:"docx",filename:"literal.docx",profile}),md=artifacts.find(a=>a.role==="markdown")!.bytes.toString();expect(md).toContain(escapePlainMarkdown(markup));expect(md).not.toContain("<script>");expect(md).not.toContain("[x](https:");expect(createHash("sha256").update(source).digest("hex")).toBe(before);
  });
  it("renders all three filename templates without traversal, Unicode splits or independent table overwrite", () => {
    const p = defaultProfile(); expect(pseudonymTableNames(p, ["甲.docx"], "singleDocument")).toEqual(["甲_假名表.xlsx"]);
    expect(pseudonymTableNames(p, ["甲.docx", "乙.pdf"], "unifiedBatch")).toEqual(["本次脱敏_统一假名表.xlsx"]);
    expect(pseudonymTableNames(p, ["甲.docx", "甲.pdf"], "independentBatch")).toEqual(["甲_假名表.xlsx", "甲_假名表_2.xlsx"]);
    expect(safeExportName("../{fileName}", "CON.docx", ".md")).not.toContain("/"); expect(Buffer.byteLength(safeExportName("{fileName}", "😀".repeat(200) + ".docx", ".md"))).toBeLessThan(255);
  });
});
