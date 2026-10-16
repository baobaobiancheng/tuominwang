import {deflateSync} from 'node:zlib';

// Public synthetic PDF with an actual embedded red stamp image on every page.
// The fixture makes the real PDF image-seal path observable between pages.
export function pdfSealImageFixture(pages=20){
 const width=256,height=256,rgb=Buffer.alloc(width*height*3,255);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const radius=Math.hypot(x-128,y-128),stroke=radius>74&&radius<84||Math.abs(x-y)<3&&radius<57;
  if(stroke){const offset=(y*width+x)*3;rgb[offset]=210;rgb[offset+1]=20;rgb[offset+2]=32;}
 }
 const image=deflateSync(rgb),objects:Buffer[]=[];
 const add=(body:Buffer|string)=>{objects.push(Buffer.isBuffer(body)?body:Buffer.from(body));return objects.length;};
 add('<< /Type /Catalog /Pages 2 0 R >>');
 add('');
 add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 add('<< /Author (public synthetic seal fixture) >>');
 add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`),image,Buffer.from('\nendstream')]));
 const kids:string[]=[];
 for(let page=0;page<pages;page++){
  const pageId=objects.length+1,streamId=pageId+1;
  kids.push(`${pageId} 0 R`);
  const content=`BT /F1 16 Tf 40 720 Td (Phone 13800138000 public page ${page+1}) Tj ET\nq 230 0 0 230 190 370 cm /Im1 Do Q`;
  add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 5 0 R >> >> /Contents ${streamId} 0 R >>`);
  add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
 }
 objects[1]=Buffer.from(`<< /Type /Pages /Count ${pages} /Kids [${kids.join(' ')}] >>`);
 const pieces=[Buffer.from('%PDF-1.7\n')],offsets=[0];let bytes=pieces[0].length;
 for(let i=0;i<objects.length;i++){offsets.push(bytes);const part=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),objects[i],Buffer.from('\nendobj\n')]);pieces.push(part);bytes+=part.length;}
 const xref=bytes,table=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Root 1 0 R /Info 4 0 R /Size ${objects.length+1} >>\nstartxref\n${xref}\n%%EOF\n`;
 pieces.push(Buffer.from(table));return Buffer.concat(pieces);
}
