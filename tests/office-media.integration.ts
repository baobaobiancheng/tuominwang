import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { parseOfficeImages, exportOfficeImages } from '../packages/adapters/office-images.ts';
import { officeImageFixture } from './office-fixtures.ts';
import { readZip, writeZip } from '../packages/core/office-zip.ts';
import { readArtifact, readOriginal, hash } from '../packages/adapters/storage.ts';
import { detect } from '../packages/core/redaction.ts';
import { exportOffice, officeImagePart, verifyOffice } from '../packages/core/office.ts';
import { normalizeOfficeMedia } from '../packages/core/office-media.ts';
import { bmpFixture } from './office-media-fixtures.ts';
test('real offline OCR and immutable native DOCX export cover both GIF/TIFF frames and mislabelled BMP/PNG',async()=>{
 const width=700,height=180,numbers=['13800138000','13900139000'],raws=[];
 for(const number of numbers)raws.push(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><text x="30" y="105" font-family="Arial" font-size="60" fill="black">${number}</text></svg>`)).flatten({background:'white'}).removeAlpha().raw().toBuffer());
 for(const format of ['gif','tiff','png','bmp'] as const){const raw=Buffer.concat(raws),bgr=Buffer.from(raws[0]);for(let i=0;i<bgr.length;i+=3)[bgr[i],bgr[i+2]]=[bgr[i+2],bgr[i]];const image=sharp(raw,{raw:{width,height:height*2,channels:3,pageHeight:height}}),bytes=format==='gif'?await image.gif().toBuffer():format==='tiff'?await image.tiff({compression:'none'}).toBuffer():format==='png'?await sharp(raws[0],{raw:{width,height,channels:3}}).png().toBuffer():bmpFixture(24,0,bgr,{width,height,topDown:true}),parts=await readZip(await officeImageFixture(bytes)),old='word/media/customer-13800138000.jpg',part=format==='png'?old:`word/media/fullframes.${format}`;if(part!==old){parts.set('[Content_Types].xml',Buffer.from(parts.get('[Content_Types].xml')!.toString().replace(old,part)));parts.set(part,parts.get(old)!);parts.delete(old);parts.set('word/_rels/document.xml.rels',Buffer.from(parts.get('word/_rels/document.xml.rels')!.toString().replace('customer-13800138000.jpg',`fullframes.${format}`)));}
 const source=await writeZip(parts),saved=Buffer.from(source),parsed=await parseOfficeImages(source);assert.equal(parsed.pages.length,1);const page=parsed.pages[0],anchor=parsed.anchors.find(a=>a.part===part&&a.object==='image-text')!;assert.equal(page.mediaFormat,format);assert.equal(page.mediaFrames.length,['gif','tiff'].includes(format)?2:1);
 const local=parsed.text.slice(anchor.start,anchor.end);assert.ok(local.includes(numbers[0]),local);if(['gif','tiff'].includes(format))assert.ok(local.includes(numbers[1]),local);const glyphs=JSON.parse(await readArtifact(page.mapId));if(['gif','tiff'].includes(format)){assert.ok(glyphs.some((g:number[])=>g[3]<height));assert.ok(glyphs.some((g:number[])=>g[3]>=height));}
 const marks=detect(parsed.text,parsed.anchors).map(m=>({...m,decision:'redact' as const})),d={id:randomUUID(),source_format:'docx',page_data:parsed.pages,anchors:parsed.anchors,content_hash:hash(parsed.text),marks,page_review:{mode:'raster',regions:[],deletedPages:[],maskStyle:'black'}};const images=await exportOfficeImages(d,parsed.text);const output=await exportOffice(source,'docx',parsed.text,parsed.anchors,parsed.coverage,marks,images),out=await readZip(output),outparts=[...out.keys()].filter(officeImagePart);assert.equal(outparts.length,1);assert.ok(!out.has(part));assert.ok(!images[part].outputText.includes(numbers[0]));assert.ok(!images[part].outputText.includes(numbers[1]));const normalized=await normalizeOfficeMedia(out.get(outparts[0])!);assert.equal(normalized.height,['gif','tiff'].includes(format)?height*2:height);await verifyOffice(source,'docx',output,parsed.text,marks,{[outparts[0]]:images[part].outputText});assert.ok(source.equals(saved));assert.equal(hash(await readOriginal(page.previewId)),page.previewHash);
 }
});
