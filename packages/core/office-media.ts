import bmp from "bmp-js";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { checkPixels, PAGE_MAX_PIXELS } from "./pdf-reader.ts";
import { FILE_MAX_BYTES } from "../contracts/index.ts";
export type OfficeMediaFormat = "png" | "jpeg" | "gif" | "tiff" | "bmp";
export type OfficeMediaFrame = { index: number; x: number; y: number; width: number; height: number; rgbHash: string };
export type OfficeMedia = { png: Buffer; width: number; height: number; format: OfficeMediaFormat; sourceHash: string; frames: OfficeMediaFrame[] };
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const fail = (): never => { throw new Error("INVALID_IMAGE"); };
export function sniffOfficeMedia(bytes: Buffer): OfficeMediaFormat {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (/^GIF8[79]a$/u.test(bytes.subarray(0,6).toString("ascii"))) return "gif";
  if (bytes.subarray(0,4).equals(Buffer.from([73,73,42,0])) || bytes.subarray(0,4).equals(Buffer.from([77,77,0,42])) || bytes.subarray(0,4).equals(Buffer.from([73,73,43,0])) || bytes.subarray(0,4).equals(Buffer.from([77,77,0,43]))) return "tiff";
  if (bytes.subarray(0,2).toString("ascii") === "BM") return "bmp"; return fail();
}
/** Bounds before allocation; normalize OS/2 palettes and offsets for the pinned MIT decoder. */
export async function decodeOfficeBmp(bytes: Buffer) {
  if (bytes.length < 26 || bytes.length > FILE_MAX_BYTES || bytes.subarray(0,2).toString() !== "BM") return fail();
  const header = bytes.readUInt32LE(14), core = header === 12;
  if (![12,40,52,56,64,108,124].includes(header) || 14 + header > bytes.length) return fail();
  const offset = bytes.readUInt32LE(10), size = bytes.readUInt32LE(2), width = core ? bytes.readUInt16LE(18) : bytes.readInt32LE(18), signedHeight = core ? bytes.readUInt16LE(20) : bytes.readInt32LE(22), height = Math.abs(signedHeight), planes = bytes.readUInt16LE(core ? 22 : 26), bits = bytes.readUInt16LE(core ? 24 : 28), compression = core ? 0 : bytes.readUInt32LE(30), colors = core ? 0 : bytes.readUInt32LE(46);
  checkPixels(width, height); if (planes !== 1 || offset < 14 + header || offset >= bytes.length || size && size > bytes.length) return fail();
  if ([4,5].includes(compression) && header !== 64) { const embedded = bytes.subarray(offset), expected = compression === 4 ? "jpeg" : "png"; if (sniffOfficeMedia(embedded) !== expected) return fail(); const decoded = await sharp(embedded, { limitInputPixels: PAGE_MAX_PIXELS, failOn: "warning" }).flatten({background:"white"}).toColourspace("srgb").removeAlpha().raw().toBuffer({resolveWithObject:true}); if (decoded.info.width !== width || decoded.info.height !== height) return fail(); return { rgb: decoded.data, width, height }; }
  if (![1,4,8,16,24,32].includes(bits) || ![0,1,2,3,6].includes(compression) || [1,2].includes(compression) && signedHeight < 0 || compression === 1 && bits !== 8 || compression === 2 && bits !== 4 || [3,6].includes(compression) && ![16,32].includes(bits) || header === 64 && compression > 2) return fail();
  const stride = Math.ceil(width * bits / 32) * 4; if ([0,3,6].includes(compression) && offset + stride * height > bytes.length) return fail();
  if ([16,32].includes(bits)) {
    let masks = bits === 16 ? [0x7c00,0x3e0,0x1f,0] : [0xff0000,0xff00,0xff,0];
    if ([3,6].includes(compression)) { const start = 54, count = header >= 56 || compression === 6 ? 4 : 3; if (start + count * 4 > offset) return fail(); masks = Array.from({length:4},(_,i)=>i<count?bytes.readUInt32LE(start+i*4):0); }
    const channels = masks.map((mask,i)=> { if (!mask) { if (i < 3) return fail(); return {mask:0,shift:0,max:0}; } let shift=0; while (((mask>>>shift)&1)===0 && shift<32) shift++; const max=mask>>>shift; if ((max & (max+1))!==0 || bits===16 && mask>0xffff) return fail(); return {mask,shift,max}; });
    if (masks.some((m,i)=>masks.some((n,j)=>i<j && (m&n)!==0))) return fail(); const rgb = Buffer.alloc(width*height*3);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const src=offset+(signedHeight<0?y:height-y-1)*stride+x*(bits/8), value=bits===16?bytes.readUInt16LE(src):bytes.readUInt32LE(src), alpha=channels[3].mask?((value&channels[3].mask)>>>channels[3].shift)/channels[3].max:1;for(let c=0;c<3;c++){const v=((value&channels[c].mask)>>>channels[c].shift)*255/channels[c].max;rgb[(y*width+x)*3+c]=Math.round(v*alpha+255*(1-alpha));}}
    return {rgb,width,height};
  }
  let palette = Buffer.alloc(0), count = 0;
  if (bits<=8) { count=colors||2**bits; if(count>2**bits || 14+header+count*(core?3:4)>offset)return fail(); palette=Buffer.alloc(count*4);for(let i=0;i<count;i++)bytes.copy(palette,i*4,14+header+i*(core?3:4),14+header+i*(core?3:4)+3); }
  // A complete validated RLE stream avoids the historical decoder's unchecked palette/bounds defaults.
  if ([1,2].includes(compression)) {
    const indices = Buffer.alloc(width*height);let x=0,y=height-1,at=offset,ended=false;
    const put=(index:number)=>{if(index>=count||x<0||x>=width||y<0||y>=height)return fail();indices[y*width+x++]=index;};
    const read=()=>{if(at>=bytes.length)return fail();return bytes[at++];};
    while(at<bytes.length){const a=read(),b=read();if(a){for(let i=0;i<a;i++)put(compression===1?b:i%2?b&15:b>>>4);}else if(b===0){x=0;y--;}else if(b===1){ended=true;break;}else if(b===2){x+=read();y-=read();if(x>width||y<0)return fail();}else{const n=b,size= compression===1?n:Math.ceil(n/2);for(let i=0;i<size;i++){const v=read();if(compression===1)put(v);else {put(v>>>4);if(i*2+1<n)put(v&15);}}if(size%2)read();}}
    if(!ended)return fail();const rgb=Buffer.alloc(width*height*3);for(let i=0;i<indices.length;i++){const p=indices[i]*4;rgb[i*3]=palette[p+2];rgb[i*3+1]=palette[p+1];rgb[i*3+2]=palette[p];}return{rgb,width,height};
  }
  if(bits<=8)for(let y=0;y<height;y++)for(let x=0;x<width;x++){const row=offset+y*stride,index=bits===8?bytes[row+x]:bits===4?(bytes[row+(x>>>1)]>>((x%2?0:4)))&15:(bytes[row+(x>>>3)]>>(7-x%8))&1;if(index>=count)return fail();}
  const data=bytes.subarray(offset,offset+stride*height), canonical=Buffer.alloc(54+palette.length+data.length);bytes.copy(canonical,0,0,Math.min(54,bytes.length));canonical.writeUInt32LE(canonical.length,2);canonical.writeUInt32LE(54+palette.length,10);canonical.writeUInt32LE(40,14);canonical.writeInt32LE(width,18);canonical.writeInt32LE(signedHeight,22);canonical.writeUInt16LE(1,26);canonical.writeUInt16LE(bits,28);canonical.writeUInt32LE(0,30);canonical.writeUInt32LE(data.length,34);canonical.writeUInt32LE(count,46);palette.copy(canonical,54);data.copy(canonical,54+palette.length);
  let decoded;try{decoded=bmp.decode(canonical);}catch{return fail();}if(decoded.width!==width||decoded.height!==height||decoded.data.length!==width*height*4)return fail();const rgb=Buffer.alloc(width*height*3);for(let i=0;i<width*height;i++){rgb[i*3]=decoded.data[i*4+3];rgb[i*3+1]=decoded.data[i*4+2];rgb[i*3+2]=decoded.data[i*4+1];}return{rgb,width,height};
}
/** Every GIF/TIFF frame is converted into a canonical atlas; no frame is silently dropped. */
export async function normalizeOfficeMedia(bytes: Buffer): Promise<OfficeMedia> {
  if(!bytes.length||bytes.length>FILE_MAX_BYTES)throw new Error("FILE_SIZE_LIMIT");const format=sniffOfficeMedia(bytes), decoded:{rgb:Buffer;width:number;height:number}[]=[];
  if(format==='bmp')decoded.push(await decodeOfficeBmp(bytes));else{
    if(format==='png'){let at=8;while(at+12<=bytes.length){const size=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8);if(at+12+size>bytes.length)return fail();if(type==='acTL'&&bytes.readUInt32BE(at+8)>1)throw new Error('MULTIPAGE_IMAGE');at+=size+12;if(type==='IEND')break;}}
    let metadata;try{metadata=await sharp(bytes,{animated:true,limitInputPixels:PAGE_MAX_PIXELS,failOn:'warning'}).metadata();}catch{return fail();}const count=metadata.pages??1;if(!Number.isSafeInteger(count)||count<1||count>300)throw new Error('PAGE_LIMIT');if(metadata.format!==format)return fail();
    for(let index=0;index<count;index++){let result;try{result=await sharp(bytes,{page:index,pages:1,limitInputPixels:PAGE_MAX_PIXELS,failOn:'warning'}).autoOrient().flatten({background:'white'}).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});}catch{return fail();}checkPixels(result.info.width,result.info.height);if(result.info.channels!==3||result.data.length!==result.info.width*result.info.height*3)return fail();decoded.push({rgb:result.data,width:result.info.width,height:result.info.height});}
  }
  const width=Math.max(...decoded.map(d=>d.width)),height=decoded.reduce((n,d)=>n+d.height,0);checkPixels(width,height);const rgb=Buffer.alloc(width*height*3,255),frames:OfficeMediaFrame[]=[];let y=0;
  for(const [index,frame] of decoded.entries()){for(let row=0;row<frame.height;row++)frame.rgb.copy(rgb,((y+row)*width)*3,row*frame.width*3,(row+1)*frame.width*3);frames.push({index,x:0,y,width:frame.width,height:frame.height,rgbHash:hash(frame.rgb)});y+=frame.height;}
  const png=await sharp(rgb,{raw:{width,height,channels:3}}).png().toBuffer(),verified=await sharp(png).removeAlpha().raw().toBuffer();if(!verified.equals(rgb))throw new Error('PIXEL_VERIFICATION_FAILED');return{png,width,height,format,sourceHash:hash(bytes),frames};
}
