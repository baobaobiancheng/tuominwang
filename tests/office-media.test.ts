import { test, expect } from 'vitest';
import sharp from 'sharp';
import { decodeOfficeBmp, normalizeOfficeMedia, sniffOfficeMedia } from '../packages/core/office-media.ts';
import { writeZip, readZip } from '../packages/core/office-zip.ts';
import { parseOffice, exportOffice, officeImagePart } from '../packages/core/office.ts';
import { prepareDocxPreview } from '../packages/core/docx-preview.ts';
import { officeImageFixture } from './office-fixtures.ts';
import {bmpFixture,multiFrameFixture} from './office-media-fixtures.ts';
test('BMP RGB palettes 1/4/8, 24 RGB, 16 RGB555, 32RGB, core headers, offsets and orientation decode checked pixels',async()=>{
 for(const bits of [1,4,8]){const stride=Math.ceil(2*bits/32)*4,data=Buffer.alloc(stride*2);data[0]=bits===1?0x40:bits===4?0x01:0;data[bits===8?1:0]=bits===8?1:data[0];const result=await decodeOfficeBmp(bmpFixture(bits,0,data));expect([...result.rgb.subarray(6,12)]).toEqual([0,0,0,0,0,255]);}
 const raw=Buffer.from([255,0,0,0,255,0,0,0,0,0,255,255,255,255,0,0]);for(const core of [false,true]){const result=await decodeOfficeBmp(bmpFixture(24,0,raw,{core,gap:13}));expect([...result.rgb]).toEqual([255,0,0,255,255,255,0,0,255,0,255,0]);}
 const top=await decodeOfficeBmp(bmpFixture(24,0,raw,{topDown:true}));expect([...top.rgb.subarray(0,6)]).toEqual([0,0,255,0,255,0]);
 const sixteen=await decodeOfficeBmp(bmpFixture(16,0,Buffer.from([0,124,31,0,224,3,255,127])));expect([...sixteen.rgb]).toEqual([0,255,0,255,255,255,255,0,0,0,0,255]);
 const thirtytwo=await decodeOfficeBmp(bmpFixture(32,0,Buffer.from([255,0,0,0,0,255,0,0,0,0,255,0,255,255,255,0])));expect([...thirtytwo.rgb.subarray(0,6)]).toEqual([255,0,0,255,255,255]);
 const paletteCore=await decodeOfficeBmp(bmpFixture(1,0,Buffer.from([64,0,0,0]),{width:2,height:1,core:true,gap:5}));expect([...paletteCore.rgb]).toEqual([0,0,0,0,0,255]);
});
test('BMP bitfields alpha, RLE4/RLE8 encoded/absolute/delta streams and embedded PNG preserve all pixels',async()=>{
 const bit=await decodeOfficeBmp(bmpFixture(16,3,Buffer.from([224,7,0,248]),{height:1,masks:[0xf800,0x7e0,0x1f]}));expect([...bit.rgb]).toEqual([0,255,0,255,0,0]);
 const alpha=await decodeOfficeBmp(bmpFixture(32,6,Buffer.from([0,0,255,128,0,0,0,0]),{height:1,masks:[0xff0000,0xff00,0xff,0xff000000]}));expect([...alpha.rgb]).toEqual([255,127,127,255,255,255]);
 for(const compression of [1,2]){const result=await decodeOfficeBmp(bmpFixture(compression===1?8:4,compression,Buffer.from([2,compression===1?1:0x11,0,0,2,compression===1?2:0x22,0,1])));expect([...result.rgb]).toEqual([0,255,0,0,255,0,0,0,255,0,0,255]);}
 const abs8=await decodeOfficeBmp(bmpFixture(8,1,Buffer.from([0,3,1,2,3,0,0,1]),{width:3,height:1}));expect([...abs8.rgb]).toEqual([0,0,255,0,255,0,255,0,0]);
 const abs4=await decodeOfficeBmp(bmpFixture(4,2,Buffer.from([0,3,0x12,0x30,0,1]),{width:3,height:1}));expect(abs4.rgb).toEqual(abs8.rgb);
 const delta=await decodeOfficeBmp(bmpFixture(8,1,Buffer.from([0,2,1,0,1,1,0,1])));expect([...delta.rgb.subarray(6)]).toEqual([0,0,0,0,0,255]);
 const png=await sharp({create:{width:2,height:2,channels:3,background:'#ff0000'}}).png().toBuffer(),embedded=await decodeOfficeBmp(bmpFixture(0,5,png));expect([...embedded.rgb]).toEqual(Array(4).fill([255,0,0]).flat());
});
test('BMP malformed dimensions, masks, palette indices, missing pixels, RLE bounds/end and unknown formats fail instead of partial output',async()=>{
 const input=bmpFixture();await expect(decodeOfficeBmp(input.subarray(0,-1))).rejects.toThrow('INVALID_IMAGE');const huge=Buffer.from(input);huge.writeInt32LE(100000,18);await expect(decodeOfficeBmp(huge)).rejects.toThrow();
 await expect(decodeOfficeBmp(bmpFixture(16,3,Buffer.alloc(4),{height:1,masks:[0xf800,0xf800,0x1f]}))).rejects.toThrow('INVALID_IMAGE');
 await expect(decodeOfficeBmp(bmpFixture(8,0,Buffer.from([2,0,0,0]),{height:1,paletteCount:2}))).rejects.toThrow('INVALID_IMAGE');
 for(const bytes of [Buffer.from([3,1,0,1]),Buffer.from([2,1]),Buffer.from([0,2,0,3,0,1])])await expect(decodeOfficeBmp(bmpFixture(8,1,bytes))).rejects.toThrow('INVALID_IMAGE');
 expect(()=>sniffOfficeMedia(Buffer.from('<svg/>'))).toThrow('INVALID_IMAGE');
});
test('every GIF and TIFF frame survives canonical atlas, source hash, full pixel verification and native DOCX export',async()=>{
 for(const format of ['gif','tiff'] as const){const {bytes,raw}=await multiFrameFixture(format),normalized=await normalizeOfficeMedia(bytes);expect(normalized.frames.map(f=>[f.index,f.x,f.y,f.width,f.height])).toEqual([[0,0,0,4,3],[1,0,3,4,3]]);expect(await sharp(normalized.png).removeAlpha().raw().toBuffer()).toEqual(raw);
 const parts=await readZip(await officeImageFixture(bytes)),old='word/media/customer-13800138000.jpg',part=`word/media/frames.${format}`;parts.set('[Content_Types].xml',Buffer.from(parts.get('[Content_Types].xml')!.toString().replace(old,part)));parts.set(part,parts.get(old)!);parts.delete(old);parts.set('word/_rels/document.xml.rels',Buffer.from(parts.get('word/_rels/document.xml.rels')!.toString().replace('customer-13800138000.jpg',`frames.${format}`)));const source=await writeZip(parts),parsed=await parseOffice(source,'docx',{[part]:'FRAMEONE\nFRAMETWO'}),preview=await prepareDocxPreview(source,parsed.text,parsed.anchors);expect(preview.warnings.some(w=>w.includes('多帧'))).toBe(true);expect(await sharp((await readZip(preview.bytes)).get('word/media/tmw-preview-0.png')!).raw().toBuffer()).toEqual(raw);
 const output=await exportOffice(source,'docx',parsed.text,parsed.anchors,parsed.coverage,[],{[part]:{text:'FRAMEONE\nFRAMETWO',output:normalized.png,outputText:'FRAMEONE\nFRAMETWO'}}),result=await readZip(output),images=[...result.keys()].filter(officeImagePart);expect(images).toHaveLength(1);expect(images[0]).toMatch(/\.png$/);expect(await sharp(result.get(images[0])!).raw().toBuffer()).toEqual(raw);expect(result.has(part)).toBe(false);
 }
});
test('Word internal MIME/path mistakes are decoded by reliable signature and BMP is an offline preview PNG',async()=>{const bytes=bmpFixture(),parts=await readZip(await officeImageFixture(bytes)),source=await writeZip(parts),parsed=await parseOffice(source,'docx',{'word/media/customer-13800138000.jpg':''}),preview=await prepareDocxPreview(source,parsed.text,parsed.anchors),safe=await readZip(preview.bytes);expect((await sharp(safe.get('word/media/tmw-preview-0.png')!).metadata()).format).toBe('png');expect((await normalizeOfficeMedia(bytes)).format).toBe('bmp');});
