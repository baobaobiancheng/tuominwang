import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';

import {test} from 'vitest';
test('machine-selected visual regions clear actual PNG, PDF and embedded Word pixels',async()=>{
const root=process.cwd(),previousDir=process.env.DATA_DIR,previousKey=process.env.DATA_KEY;
const isolated=await mkdtemp(join(tmpdir(),'tmw-automatic-visual-'));
process.env.DATA_DIR=isolated;process.env.DATA_KEY='11'.repeat(32);
try{
const [{automaticVisualPageReview},{clearPixels,RasterPdf},{openPdf},{officeImageFixture},{parseOfficeImages,exportOfficeImages},{exportOffice,officeImagePart},{readZip},{hash}]=await Promise.all([
 import(root+'/packages/core/automatic-visual.ts'),
 import(root+'/packages/core/page-redaction.ts'),import(root+'/packages/core/pdf-reader.ts'),import(root+'/tests/office-fixtures.ts'),
 import(root+'/packages/adapters/office-images.ts'),import(root+'/packages/core/office.ts'),
 import(root+'/packages/core/office-zip.ts'),import(root+'/packages/adapters/storage.ts')]);
const width=700,height=180,red=await sharp({create:{width,height,channels:3,background:{r:230,g:20,b:25}}}).png().toBuffer();
const pixel=async(bytes:Buffer,x:number,y:number)=>[...(await sharp(bytes).flatten({background:'white'}).removeAlpha().raw().toBuffer()).subarray((y*width+x)*3,(y*width+x)*3+3)];
const candidate={page:0,x:20,y:20,width:100,height:70,reason:'人脸',score:.61,detector:'face-v1'};
const visual={complete:true,pages:[{page:0,detectors:['face'],warnings:[]}]};
const empty={mode:'unselected',regions:[],deletedPages:[],maskStyle:'black'};
const page={index:0,width,height,previewHash:hash(red)};
const policy=automaticVisualPageReview([page] as any,[candidate] as any,visual,['face'],empty as any)!;
assert.equal(policy.regions.length,1);
const png=await clearPixels(red,page,policy.regions,'black');
assert.deepEqual(await pixel(png.png,30,30),[0,0,0]);
assert.deepEqual(await pixel(png.png,300,100),[230,20,25]);
const pdf=new RasterPdf();pdf.add(page,png.rgb,png.width,png.height);
const pdfBytes=pdf.finish();assert.ok(pdfBytes.subarray(0,8).toString().startsWith('%PDF-1.7'));
const pdfReader=await openPdf(pdfBytes);
try{
 const rendered=await pdfReader.page(0,1);
 assert.deepEqual(await pixel(rendered.png,30,30),[0,0,0]);
 assert.deepEqual(await pixel(rendered.png,300,100),[230,20,25]);
}finally{pdfReader.close();}

const source=await officeImageFixture(red),parsed=await parseOfficeImages(source);
assert.equal(parsed.pages.length,1);
const wordPolicy=automaticVisualPageReview(parsed.pages,[candidate] as any,visual,['face'],empty as any)!;
const d={id:randomUUID(),source_format:'docx',page_data:parsed.pages,anchors:parsed.anchors,content_hash:hash(parsed.text),marks:[],page_review:wordPolicy};
const images=await exportOfficeImages(d,parsed.text),output=await exportOffice(source,'docx',parsed.text,parsed.anchors,parsed.coverage,[],images),parts=await readZip(output),media=[...parts].filter(([name])=>officeImagePart(name));
assert.equal(media.length,1);
assert.deepEqual(await pixel(media[0][1],30,30),[0,0,0]);
assert.deepEqual(await pixel(media[0][1],300,100),[230,20,25]);
assert.deepEqual(await pixel(red,30,30),[230,20,25]);
}finally{
  if(previousDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previousDir;
  if(previousKey===undefined)delete process.env.DATA_KEY;else process.env.DATA_KEY=previousKey;
  await rm(isolated,{recursive:true,force:true});
}
},60000);
