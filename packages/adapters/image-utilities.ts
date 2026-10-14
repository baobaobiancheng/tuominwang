import sharp from 'sharp';
import {createOcr,recognizePage} from '../core/ocr.ts';
import {readFile} from 'node:fs/promises';
import {platform,arch} from 'node:os';
import {createHash} from 'node:crypto';
import {readOcrText} from './ocr-correction.ts';
import {hash,readOriginal} from './storage.ts';
import {verifiedDocumentSource} from './document-source.ts';
import {canonicalImageBox,selectOcrRegion,type ImageBox} from '../core/image-utilities.ts';
export type ImageUtilityInput={kind:'image-utility';operation:'region'|'rerun'|'verify';doc:any;page:number;region:ImageBox;canvas:{width:number;height:number}}|{kind:'image-utility';operation:'health'|'diagnostic';reason?:string};
export async function imageUtility(input:ImageUtilityInput){
 if(input.operation==='health'||input.operation==='diagnostic'){
  let worker:Awaited<ReturnType<typeof createOcr>>|undefined,error:string|null=null,probe:null|{confidence:number;textLength:number}=null;
  let lock:{files:Record<string,string>}|null=null;
  try{let raw:string;try{raw=await readFile(new URL('../../scripts/ocr-lock.json',import.meta.url),'utf8');}catch{throw new Error('OCR_CONFIGURATION_REQUIRED');}try{lock=JSON.parse(raw);if(!lock||!lock.files||typeof lock.files!=='object'||Array.isArray(lock.files)||!['chi_sim.traineddata','eng.traineddata'].every(name=>typeof lock!.files[name]==='string')||!Object.values(lock.files).every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v)))throw new Error();}catch{throw new Error('OCR_CONFIGURATION_INVALID');}worker=await createOcr();const png=await sharp(Buffer.from('<svg width="200" height="70"><rect width="200" height="70" fill="white"/><text x="10" y="48" font-size="40" fill="black">TEST 123</text></svg>')).png().toBuffer(),result=await recognizePage(worker,png);probe={confidence:result.confidence,textLength:result.text.length};if(!result.text.replace(/\s/g,'').includes('123'))error='OCR_PROBE_FAILED';}catch(e){error=['OCR_MODEL_REQUIRED','OCR_MODEL_MISMATCH','OCR_PROBE_FAILED','OCR_CONFIGURATION_REQUIRED','OCR_CONFIGURATION_INVALID'].includes((e as Error).message)?(e as Error).message:'OCR_RUNTIME_UNAVAILABLE';}finally{await worker?.terminate();}
  const available=error===null,diagnosticSummary=available?'本地 OCR 模型与运行探针正常':(({OCR_CONFIGURATION_REQUIRED:'OCR 配置缺失，请联系管理员。',OCR_CONFIGURATION_INVALID:'OCR 配置无效，请联系管理员。',OCR_MODEL_REQUIRED:'OCR 模型未安装，请联系管理员。',OCR_MODEL_MISMATCH:'OCR 模型校验失败，请联系管理员。',OCR_PROBE_FAILED:'OCR 运行检查未通过，请联系管理员。'} as Record<string,string>)[error??'']??'OCR 运行环境不可用，请联系管理员。');
  if(input.operation==='health')return {available,diagnosticSummary};
  const report={version:1,collectedAt:new Date().toISOString(),reason:input.reason??'user_requested',available,error,platform:platform(),architecture:arch(),runtime:process.versions.node,modelLockHash:lock?createHash('sha256').update(JSON.stringify(lock)).digest('hex'):null,models:Object.keys(lock?.files??{}),probe,networkOutBytes:null,networkMeasurement:'not_measured',offlineConfiguration:'pinned-local-models-no-cdn-fallback'};
  return {success:true,summary:diagnosticSummary,report};
 }
 if(!('doc'in input))throw new Error('IMAGE_OPERATION_INVALID');
 const d=input.doc;await verifiedDocumentSource(d);const view=await readOcrText(d,input.page);
 if(input.operation==='verify')return {verified:true,revision:d.revision};
 if(input.operation==='region')return selectOcrRegion(view,input.region,input.canvas);
 const region=canonicalImageBox(input.region,input.canvas,view),page=d.page_data.find((p:any)=>p.index===input.page),preview=await readOriginal(page.previewId);if(hash(preview)!==page.previewHash)throw new Error('SOURCE_MISMATCH');
 const metadata=await sharp(preview).metadata();if(!metadata.width||!metadata.height)throw new Error('PAGE_NOT_READY');
 const x=Math.floor(region.x*metadata.width/view.width),y=Math.floor(region.y*metadata.height/view.height),right=Math.min(metadata.width,Math.ceil((region.x+region.width)*metadata.width/view.width)),bottom=Math.min(metadata.height,Math.ceil((region.y+region.height)*metadata.height/view.height));
 const png=await sharp(preview).extract({left:x,top:y,width:right-x,height:bottom-y}).png().toBuffer(),worker=await createOcr();
 try{const result=await recognizePage(worker,png);return {success:true,text:result.text.trim(),revision:d.revision,page:input.page,canonicalRegion:region,method:'local-region-rerun',confidence:result.confidence,glyphs:result.glyphs.map(g=>[g[0],g[1],(g[2]+x)*view.width/metadata.width!,(g[3]+y)*view.height/metadata.height!,g[4]*view.width/metadata.width!,g[5]*view.height/metadata.height!])};}finally{await worker.terminate();}
}
