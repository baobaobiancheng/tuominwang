import {lstat,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import type {DB} from './db.ts';
import {rows,sql} from './db.ts';
import {hash,readArtifact,readOriginal,seal,unseal} from './storage.ts';
import {verifiedDocumentSource} from './document-source.ts';
import {readPageRotationState} from './page-rotation-state.ts';
import {markSchema,MAX_MARKS,type Mark,type ParsedPage} from '../contracts/index.ts';
import type {Glyph} from '../core/ocr.ts';

export type PdfOcrPage = ParsedPage & {nativeTextLength:number;textSource:'native'|'ocr'|'hybrid'};
export type PdfOcrCheckpointIdentity = {processingHash:string;rotationPlanHash:string;parserFingerprint:string};
export type PdfOcrCheckpoint = PdfOcrCheckpointIdentity & {page:PdfOcrPage;text:string;glyphs:Glyph[];totalPages:number;provisionalMatches?:Mark[]};
export const PDF_OCR_PARSER_VERSION=1;
let fingerprintPromise:Promise<string>|undefined;
export function pdfOcrParserFingerprint(){
 fingerprintPromise??=(async()=>{
  const require=createRequire(import.meta.url),tesseractPackage=require.resolve('tesseract.js/package.json');
  const corePackage=createRequire(tesseractPackage).resolve('tesseract.js-core/package.json'),coreDir=dirname(corePackage),tesseractDir=dirname(tesseractPackage);
  const relative=['../../scripts/ocr-lock.json','./page-parser.ts','../core/ocr.ts','../core/pdf-reader.ts','../core/page-rotation.ts','./pdf-ocr-checkpoints.ts'];
  const packages=['tesseract.js/package.json','sharp/package.json','@embedpdf/pdfium/package.json','pdfjs-dist/package.json'];
  const variants=['tesseract-core-lstm','tesseract-core-simd-lstm','tesseract-core-relaxedsimd-lstm'];
  const files:[string,string|URL][]=[
   ...relative.map(path=>[path,new URL(path,import.meta.url)] as [string,URL]),
   ...packages.map(name=>[name,new URL(`../../node_modules/${name}`,import.meta.url)] as [string,URL]),
   ['tesseract.js-core/package.json',corePackage],
   ['tesseract.js/src/createWorker.js',join(tesseractDir,'src/createWorker.js')],
   ['tesseract.js/src/worker/node/index.js',join(tesseractDir,'src/worker/node/index.js')],
   ['tesseract.js/src/worker-script/node/getCore.js',join(tesseractDir,'src/worker-script/node/getCore.js')],
   ['tesseract.js/src/worker-script/node/index.js',join(tesseractDir,'src/worker-script/node/index.js')],
   ['tesseract.js/src/worker-script/index.js',join(tesseractDir,'src/worker-script/index.js')],
   ...variants.flatMap(name=>[[`${name}.js`,join(coreDir,`${name}.js`)], [`${name}.wasm`,join(coreDir,`${name}.wasm`)]] as [string,string][]),
   ['@embedpdf/pdfium/dist/pdfium.wasm',new URL('../../node_modules/@embedpdf/pdfium/dist/pdfium.wasm',import.meta.url)],
  ];
  const digest=createHash('sha256');digest.update(`pdf-ocr-parser:${PDF_OCR_PARSER_VERSION}:${process.platform}:${process.arch}:${process.versions.node}\0`);
  for(const [label,file] of files){
   const before=await stat(file);digest.update(JSON.stringify([label,before.size]));digest.update('\0');
   for await(const chunk of createReadStream(file))digest.update(chunk);
   const after=await stat(file);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('PDF_OCR_PARSER_FINGERPRINT_CHANGED');
  }
  return digest.digest('hex');
 })();
 return fingerprintPromise;
}
export type PdfOcrBinding = {jobId:string;generation:number;tenantId:string;projectId:string;userId:string;documentId:string;revision:number;sourceHash:string;contentHash:string;processingHash:string;rotationPlanHash:string;parserFingerprint:string;parseVersion:number};
export const pdfOcrRotationPlanHash=(d:any)=>hash(JSON.stringify(readPageRotationState(d)));
const aad=(b:Pick<PdfOcrBinding,'tenantId'|'projectId'|'documentId'|'revision'|'sourceHash'|'contentHash'|'processingHash'|'rotationPlanHash'|'parserFingerprint'|'parseVersion'>,index:number)=>`pdf-ocr:v1:${b.tenantId}:${b.projectId}:${b.documentId}:${b.revision}:${b.sourceHash}:${b.contentHash}:${b.processingHash}:${b.rotationPlanHash}:${b.parserFingerprint}:${b.parseVersion}:${index}`;
const hex=/^[a-f0-9]{64}$/u, uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
export function validPdfOcrCheckpointFrame(frame:PdfOcrCheckpoint,index:number){
 const p=frame?.page;
 return !!p&&p.index===index&&Number.isSafeInteger(index)&&index>=0&&Number.isSafeInteger(frame.totalPages)&&frame.totalPages>index&&Number.isFinite(p.width)&&p.width>0&&p.width<=20000&&Number.isFinite(p.height)&&p.height>0&&p.height<=20000&&[0,90,180,270].includes(p.rotation)&&Number.isFinite(p.confidence)&&p.confidence>=0&&p.confidence<=100&&Number.isInteger(p.nativeTextLength)&&p.nativeTextLength>=0&&typeof frame.text==='string'&&p.nativeTextLength<=frame.text.length&&['native','ocr','hybrid'].includes(p.textSource)&&hex.test(frame.processingHash)&&hex.test(frame.rotationPlanHash)&&hex.test(frame.parserFingerprint)&&uuid.test(p.previewId)&&uuid.test(p.mapId)&&hex.test(p.previewHash)&&hex.test(p.mapHash)&&typeof frame.text==='string'&&frame.text.length<=200000&&Array.isArray(frame.glyphs)&&frame.glyphs.length<=1000000&&frame.glyphs.every(g=>Array.isArray(g)&&g.length===6&&g.every(Number.isFinite)&&Number.isInteger(g[0])&&Number.isInteger(g[1])&&g[0]>=0&&g[1]<=frame.text.length&&g[0]<g[1]&&g[4]>=0&&g[5]>=0)&&(frame.provisionalMatches===undefined||Array.isArray(frame.provisionalMatches)&&frame.provisionalMatches.length<=MAX_MARKS&&frame.provisionalMatches.every(m=>markSchema.safeParse(m).success&&m.start>=0&&m.end<=frame.text.length&&m.start<m.end&&m.decision==='pending'));
}
async function exactOwned(id:string,owner:string){
 const root=resolve(process.env.DATA_DIR??'.data/files');
 const [registry,flat]=await Promise.all([lstat(resolve(root,'.owners',owner,id),{bigint:true}),lstat(resolve(root,id),{bigint:true})]);
 if(!registry.isFile()||!flat.isFile()||registry.size===0n||registry.dev!==flat.dev||registry.ino!==flat.ino)throw Error('PDF_OCR_CHECKPOINT_OWNER');
}
async function verifyObjects(frame:PdfOcrCheckpoint,owner:string){
 await Promise.all([exactOwned(frame.page.previewId,owner),exactOwned(frame.page.mapId,owner)]);
 const [preview,map]=await Promise.all([readOriginal(frame.page.previewId),readArtifact(frame.page.mapId)]);
 if(hash(preview)!==frame.page.previewHash||hash(map)!==frame.page.mapHash||map!==JSON.stringify(frame.glyphs))throw Error('PDF_OCR_CHECKPOINT_OBJECT');
}
export async function savePdfOcrCheckpoint(db:DB,b:PdfOcrBinding,frame:PdfOcrCheckpoint){
 if(!validPdfOcrCheckpointFrame(frame,frame.page.index)||frame.processingHash!==b.processingHash||frame.rotationPlanHash!==b.rotationPlanHash||frame.parserFingerprint!==b.parserFingerprint||b.parserFingerprint!==await pdfOcrParserFingerprint())throw Error('PDF_OCR_CHECKPOINT_INVALID');
 const [live]=await rows(db,sql`SELECT j.id FROM jobs j JOIN documents d ON d.id=j.document_id AND d.project_id=j.project_id AND d.tenant_id=j.tenant_id WHERE j.id=${b.jobId} AND j.kind='detect' AND j.status='running' AND j.generation=${b.generation} AND j.lease_until>now() AND j.user_id=${b.userId} AND j.tenant_id=${b.tenantId} AND j.project_id=${b.projectId} AND j.document_id=${b.documentId} AND j.revision=${b.revision} AND d.revision=${b.revision} AND d.source_format='pdf' AND d.source_hash=${b.sourceHash} AND d.content_hash=${b.contentHash} AND d.parse_version=${b.parseVersion} AND job_authorized(j.id) FOR SHARE OF j,d`);
 if(!live)throw Error('PDF_OCR_CHECKPOINT_STALE');
 await verifyObjects(frame,b.documentId);
 const plaintext=JSON.stringify(frame),payload=seal(plaintext,aad(b,frame.page.index));
 const [saved]=await rows(db,sql`SELECT save_owned_pdf_ocr_checkpoint(${JSON.stringify({...b,pageIndex:frame.page.index,totalPages:frame.totalPages,previewId:frame.page.previewId,previewHash:frame.page.previewHash,mapId:frame.page.mapId,mapHash:frame.page.mapHash,payload,payloadHash:hash(plaintext)})}::jsonb) AS outcome`);
 if(saved?.outcome!=='inserted')throw Error('PDF_OCR_CHECKPOINT_STALE');
}
// A rotation starts a new detect revision. Re-encrypt only pages whose old
// checkpoint and new preview/map bytes were both verified by this process.
export async function rebasePdfOcrCheckpointForRotation(db:DB,oldDoc:any,newDoc:any,oldJobId:string,newJobId:string,oldFrame:PdfOcrCheckpoint,newFrame:PdfOcrCheckpoint){
 const index=oldFrame.page.index,oldPlan=pdfOcrRotationPlanHash(oldDoc),newPlan=pdfOcrRotationPlanHash(newDoc);
 const processingHash=hash(await verifiedDocumentSource(oldDoc)),fingerprint=await pdfOcrParserFingerprint();
 if(newDoc.revision!==oldDoc.revision+1||oldDoc.id!==newDoc.id||oldDoc.tenant_id!==newDoc.tenant_id||oldDoc.project_id!==newDoc.project_id||oldDoc.source_hash!==newDoc.source_hash||oldDoc.content_hash!==newDoc.content_hash||oldDoc.parse_version!==newDoc.parse_version||oldFrame.processingHash!==processingHash||oldFrame.rotationPlanHash!==oldPlan||oldFrame.parserFingerprint!==fingerprint||newFrame.processingHash!==processingHash||newFrame.rotationPlanHash!==newPlan||newFrame.parserFingerprint!==fingerprint||oldFrame.totalPages!==newFrame.totalPages||index!==newFrame.page.index||!validPdfOcrCheckpointFrame(newFrame,index))throw Error('PDF_OCR_ROTATION_REBASE_INVALID');
 await verifyObjects(oldFrame,oldDoc.id);await verifyObjects(newFrame,newDoc.id);
 const binding={tenantId:newDoc.tenant_id,projectId:newDoc.project_id,documentId:newDoc.id,revision:newDoc.revision,sourceHash:newDoc.source_hash,contentHash:newDoc.content_hash,processingHash,rotationPlanHash:newPlan,parserFingerprint:fingerprint,parseVersion:newDoc.parse_version};
 const raw=JSON.stringify(newFrame),payload=seal(raw,aad(binding,index));
 const [saved]=await rows(db,sql`SELECT rebase_owned_pdf_ocr_checkpoint(${oldJobId}::uuid,${newJobId}::uuid,${JSON.stringify({pageIndex:index,sourceHash:newDoc.source_hash,contentHash:newDoc.content_hash,parseVersion:newDoc.parse_version,processingHash,oldRotationPlanHash:oldPlan,rotationPlanHash:newPlan,parserFingerprint:fingerprint,totalPages:newFrame.totalPages,oldPreviewId:oldFrame.page.previewId,oldPreviewHash:oldFrame.page.previewHash,oldMapId:oldFrame.page.mapId,oldMapHash:oldFrame.page.mapHash,previewId:newFrame.page.previewId,previewHash:newFrame.page.previewHash,mapId:newFrame.page.mapId,mapHash:newFrame.page.mapHash,payload,payloadHash:hash(raw)})}::jsonb) AS outcome`);
 if(saved?.outcome!=='inserted')throw Error('PDF_OCR_ROTATION_REBASE_STALE');
}
export async function loadPdfOcrCheckpointPages(db:DB,d:any,processingHash:string,rotationPlanHash=pdfOcrRotationPlanHash(d),job?:Pick<PdfOcrBinding,'jobId'|'generation'>):Promise<PdfOcrCheckpoint[]>{
 if(d.source_format!=='pdf'||!hex.test(processingHash))return [];
 const records=job?await rows(db,sql`SELECT * FROM read_owned_pdf_ocr_checkpoints(${job.jobId},${job.generation},${processingHash},${rotationPlanHash},${await pdfOcrParserFingerprint()})`):await rows(db,sql`SELECT * FROM pdf_ocr_checkpoints WHERE document_id=${d.id} AND revision=${d.revision} AND tenant_id=${d.tenant_id} AND project_id=${d.project_id} AND source_hash=${d.source_hash} AND content_hash=${d.content_hash} AND processing_hash=${processingHash} AND rotation_plan_hash=${rotationPlanHash} AND parser_fingerprint=${await pdfOcrParserFingerprint()} AND parse_version=${d.parse_version} ORDER BY page_index`);
 const parserFingerprint=await pdfOcrParserFingerprint();
 const binding={tenantId:d.tenant_id,projectId:d.project_id,documentId:d.id,revision:d.revision,sourceHash:d.source_hash,contentHash:d.content_hash,processingHash,rotationPlanHash,parserFingerprint,parseVersion:d.parse_version};
 const good:PdfOcrCheckpoint[]=[];
 for(const row of records){try{
  const plaintext=unseal(row.payload,aad(binding,row.page_index));
  if(hash(plaintext)!==row.payload_hash)continue;
  const frame=JSON.parse(plaintext) as PdfOcrCheckpoint;
  if(!validPdfOcrCheckpointFrame(frame,row.page_index)||frame.processingHash!==processingHash||frame.rotationPlanHash!==rotationPlanHash||frame.parserFingerprint!==parserFingerprint||frame.totalPages!==row.total_pages||frame.page.previewId!==row.preview_id||frame.page.previewHash!==row.preview_hash||frame.page.mapId!==row.map_id||frame.page.mapHash!==row.map_hash)continue;
  await verifyObjects(frame,d.id);good.push(frame);
 }catch{/* Missing or altered objects are recomputed on retry. */}}
 if(good.length&&good.some(f=>f.totalPages!==good[0].totalPages))return [];
 return good;
}
export async function listRecoverablePdfOcrCheckpoints(db:DB,userId:string,projectId:string):Promise<Array<{projectId:string;documentId:string;revision:number;jobId:string;totalPages:number;completedPages:number[];stage:'ocr_incomplete'|'recognition_interrupted'}>>{
 const candidates=await rows(db,sql`SELECT DISTINCT ON (d.id) d.*,j.id AS checkpoint_job_id FROM documents d JOIN jobs j ON j.document_id=d.id AND j.project_id=d.project_id AND j.tenant_id=d.tenant_id AND j.revision=d.revision WHERE d.project_id=${projectId} AND d.source_format='pdf' AND d.state='queued' AND j.user_id=${userId} AND j.kind='detect' AND j.status IN ('failed','cancelled') AND NOT EXISTS(SELECT 1 FROM jobs active WHERE active.document_id=d.id AND active.kind='detect' AND active.revision=d.revision AND active.status IN ('queued','running')) AND project_permission(d.project_id,'view_original') AND j.id=(SELECT latest.id FROM jobs latest WHERE latest.document_id=d.id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) AND NOT EXISTS(SELECT 1 FROM unnest(j.required_permissions) permission WHERE NOT project_permission(d.project_id,permission)) ORDER BY d.id,j.created_at DESC,j.id DESC`);
 const results:Array<{projectId:string;documentId:string;revision:number;jobId:string;totalPages:number;completedPages:number[];stage:'ocr_incomplete'|'recognition_interrupted'}>=[];
 for(const d of candidates){try{
  const bytes=await verifiedDocumentSource(d),pages=await loadPdfOcrCheckpointPages(db,d,hash(bytes));
  if(!pages.length)continue;
  results.push({projectId:d.project_id,documentId:d.id,revision:d.revision,jobId:d.checkpoint_job_id,totalPages:pages[0].totalPages,completedPages:pages.map(p=>p.page.index),stage:pages.length>=pages[0].totalPages?'recognition_interrupted':'ocr_incomplete'});
 }catch{/* A stale, inaccessible or broken original cannot be offered for resume. */}}
 return results;
}
