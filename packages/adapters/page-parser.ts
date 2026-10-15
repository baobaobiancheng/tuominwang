import{quarterTurn,rotatePageGlyphs}from"../core/page-rotation.ts";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import type { Worker } from "tesseract.js";
import { createOcr, recognizePage, type Glyph } from "../core/ocr.ts";
import { openPdf, checkPixels, PAGE_MAX_PIXELS } from "../core/pdf-reader.ts";
import type { Anchor, Coverage, ParsedPage, SourceFormat } from "../contracts/index.ts";
import { writeArtifact, writeOriginal, hash } from "./storage.ts";

export async function parsePages(bytes: Buffer, format: SourceFormat, onPage?: (page: ParsedPage, text: string, glyphs: Glyph[], totalPages: number) => void | Promise<void>, options: {rotations?:Record<string,number>;selectedPages?:number[];manualOnlyPages?:number[]} = {}) {
  if (format !== "pdf" && !(format === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))) throw new Error("INVALID_IMAGE");
  const pdf = format === "pdf" ? await openPdf(bytes) : undefined;
  let ocr: Worker | undefined;
  const pages: (ParsedPage&{nativeTextLength:number;textSource:'native'|'ocr'|'hybrid'})[] = [], anchors: Anchor[] = [], coverage: Coverage[] = [], fragments: string[] = [];
  let offset = 0, totalGlyphs = 0;
  try {
    ocr = await createOcr();
    if (pdf?.attachments) coverage.push({ id: "attachments", status: "blocked", reason: "PDF_ATTACHMENT" });
    if (pdf?.scripts) coverage.push({ id: "actions", status: "blocked", reason: "PDF_ACTION" });
    const count=pdf?.count??1,indices=options.selectedPages??Array.from({length:count},(_,i)=>i),manualPages=options.manualOnlyPages??[];if(new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=count)||new Set(manualPages).size!==manualPages.length||manualPages.some(i=>!Number.isInteger(i)||i<0||i>=count)||Object.entries(options.rotations??{}).some(([key,value])=>!/^\d+$/u.test(key)||Number(key)>=count||![0,90,180,270].includes(value)))throw Error("PAGE_ROTATION_INVALID");
    for (const index of indices) {
      let page: { text: string; glyphs: Glyph[]; width: number; height: number; scale: number; png: Buffer; rotation: number };
      if (pdf) page = await pdf.page(index);
      else {
        const image = sharp(bytes, { limitInputPixels: PAGE_MAX_PIXELS, animated: true, failOn: "warning" });
        let metadata;
        try { metadata = await image.metadata(); } catch (error) { throw new Error(/pixel limit/i.test((error as Error).message) ? "PIXEL_LIMIT" : "INVALID_IMAGE"); }
        if ((metadata.pages ?? 1) !== 1) throw new Error("MULTIPAGE_IMAGE");
        checkPixels(metadata.width ?? 0, metadata.height ?? 0);
        const normalized = await image.autoOrient().flatten({ background: "white" }).png().toBuffer({ resolveWithObject: true });
        page = { text: "", glyphs: [], width: normalized.info.width, height: normalized.info.height, scale: 1, png: normalized.data, rotation: 0 };
      }
      const rotation=quarterTurn(options.rotations?.[String(index)]??0),manualOnly=options.manualOnlyPages?.includes(index)===true;if(rotation&&!manualOnly){const previous={width:page.width,height:page.height},image=await sharp(page.png).rotate(rotation).png().toBuffer({resolveWithObject:true});page={...page,png:image.data,width:rotation%180?previous.height:previous.width,height:rotation%180?previous.width:previous.height,glyphs:rotatePageGlyphs(page.glyphs,previous.width,previous.height,rotation),rotation:quarterTurn(page.rotation+rotation)};}
      const result = await recognizePage(ocr, page.png, page.scale);
      let text = page.text; const glyphs = [...page.glyphs];
      // Suppress an OCR duplicate only when both its text and physical location match native text.
      for (const word of result.words) {
        const wordText = result.text.slice(word[0], word[1]);
        const underneath = page.glyphs.filter(g => g[2] + g[4] / 2 >= word[2] - 2 && g[2] + g[4] / 2 <= word[2] + word[4] + 2 && g[3] + g[5] / 2 >= word[3] - 2 && g[3] + g[5] / 2 <= word[3] + word[5] + 2).map(g => page.text.slice(g[0], g[1])).join("");
        if (underneath.replace(/\s/g, "").includes(wordText.replace(/\s/g, ""))) continue;
        if (text) text += "\n";
        const start = text.length; text += wordText;
        for (const g of result.glyphs) if (g[0] >= word[0] && g[1] <= word[1]) glyphs.push([start + g[0] - word[0], start + g[1] - word[0], g[2], g[3], g[4], g[5]]);
      }
      if(rotation&&manualOnly){const previous={width:page.width,height:page.height},image=await sharp(page.png).rotate(rotation).png().toBuffer({resolveWithObject:true}),rotated=rotatePageGlyphs(glyphs,previous.width,previous.height,rotation);for(let i=0;i<rotated.length;i++)glyphs[i]=rotated[i];page={...page,png:image.data,width:rotation%180?previous.height:previous.width,height:rotation%180?previous.width:previous.height,rotation:quarterTurn(page.rotation+rotation)};}
      totalGlyphs += glyphs.length;
      if (totalGlyphs > 1000000 || text.length > 200000) throw new Error("PDF_TEXT_LIMIT");
      const previewId = randomUUID(), mapId = randomUUID(), map = JSON.stringify(glyphs);
      await writeOriginal(previewId, page.png); await writeArtifact(mapId, map);
      pages.push({ index, width: page.width, height: page.height, rotation: page.rotation, confidence: result.confidence, nativeTextLength:page.text.length,textSource:page.text.length?text.length>page.text.length?'hybrid':'native':'ocr',previewId, previewHash: hash(page.png), mapId, mapHash: hash(map) });
      anchors.push({ kind: "page", page: index, start: offset, end: offset + text.length });
      fragments.push(text); offset += text.length + 1;
      coverage.push({ id: `page:${index}`, status: "complete" });
      await onPage?.(pages.at(-1)!,text,glyphs,pdf?.count??1);
    }
    if (pdf) for (const [key, value] of Object.entries(pdf.meta)) {
      anchors.push({ kind: "object", part: "metadata", object: key, start: offset, end: offset + value.length });
      fragments.push(value); offset += value.length + 1;
    }
    if (pdf) coverage.push({ id: "metadata", status: "complete" });
    return { text: fragments.join("\n"), anchors, coverage, pages, glyphCount: totalGlyphs };
  } finally { await ocr?.terminate(); pdf?.close(); }
}
