import sharp from "sharp";
export function bmpFixture(bits=24,compression=0,payload?:Buffer,opts:{width?:number;height?:number;topDown?:boolean;masks?:number[];core?:boolean;gap?:number;paletteCount?:number}={}) {
 const width=opts.width??2,height=opts.height??2,header=opts.core?12:40,paletteCount=bits<=8?opts.paletteCount??2**bits:0,paletteSize=paletteCount*(opts.core?3:4),masks=opts.masks??[],offset=14+header+paletteSize+masks.length*4+(opts.gap??0),stride=Math.ceil(width*bits/32)*4,data=payload??Buffer.alloc(stride*height),bytes=Buffer.alloc(offset+data.length);
 bytes.write('BM');bytes.writeUInt32LE(bytes.length,2);bytes.writeUInt32LE(offset,10);bytes.writeUInt32LE(header,14);
 if(opts.core){bytes.writeUInt16LE(width,18);bytes.writeUInt16LE(height,20);bytes.writeUInt16LE(1,22);bytes.writeUInt16LE(bits,24);}else{bytes.writeInt32LE(width,18);bytes.writeInt32LE(opts.topDown?-height:height,22);bytes.writeUInt16LE(1,26);bytes.writeUInt16LE(bits,28);bytes.writeUInt32LE(compression,30);bytes.writeUInt32LE(data.length,34);bytes.writeUInt32LE(paletteCount,46);}
 for(let i=0;i<paletteCount;i++){const at=14+header+i*(opts.core?3:4);bytes[at]=i===1?255:0;bytes[at+1]=i===2?255:0;bytes[at+2]=i===3?255:0;}
 masks.forEach((m,i)=>bytes.writeUInt32LE(m>>>0,14+header+paletteSize+i*4));data.copy(bytes,offset);return bytes;
}
export async function multiFrameFixture(format:'gif'|'tiff') { const raw=Buffer.concat([Buffer.alloc(4*3*3,0),Buffer.alloc(4*3*3,255)]);for(let i=0;i<12;i++)raw[i*3]=255;for(let i=12;i<24;i++)raw[i*3]=0;const image=sharp(raw,{raw:{width:4,height:6,channels:3,pageHeight:3}});return {bytes:await (format==='gif'?image.gif():image.tiff({compression:'none'})).toBuffer(),raw}; }
