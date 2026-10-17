import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {id,markSchema,pageReviewSchema,MAX_MARKS,REVIEW_BODY_BYTES,type Anchor} from '../../packages/contracts/index.ts';
import {rows,sql,type DB} from '../../packages/adapters/db.ts';
import {verifiedDocumentSource} from '../../packages/adapters/document-source.ts';
import {hash,readOriginal,seal,unseal} from '../../packages/adapters/storage.ts';
import {loadPdfOcrCheckpointPages,pdfOcrParserFingerprint,pdfOcrRotationPlanHash,type PdfOcrCheckpoint} from '../../packages/adapters/pdf-ocr-checkpoints.ts';
import {mergePdfOcrDraft,replacePdfOcrDraftAtReview,validatePdfOcrDraftPage,type PdfOcrDraftPage} from '../../packages/core/pdf-ocr-draft.ts';
import {runProcessing} from '../../packages/adapters/processing.ts';
import {openPageReview} from '../../packages/adapters/page-review-storage.ts';
import {projectScope,requirePermission,textArray} from './access.ts';
import {saveReview} from './reviews.ts';

const fail=(name:string,statusCode=409):never=>{throw Object.assign(new Error(name),{statusCode});};
const local=markSchema.pick({start:true,end:true,kind:true,rawEntityType:true,decision:true,replacement:true}).refine(m=>m.decision!=='pending'&&m.replacement?.mode!=='alias');
const removal=markSchema.pick({start:true,end:true,kind:true,rawEntityType:true});
const region=pageReviewSchema.shape.regions.element.omit({page:true,meta:true});
const put=z.object({revision:z.number().int().nonnegative(),draftRevision:z.number().int().nonnegative(),pageIndex:z.number().int().nonnegative(),marks:z.array(local).max(MAX_MARKS),removed:z.array(removal).max(MAX_MARKS),regions:z.array(region).max(3000).default([]),pageDeleted:z.boolean().default(false)}).strict();
const completePut=put.extend({previewHash:z.string().regex(/^[a-f0-9]{64}$/),mapHash:z.string().regex(/^[a-f0-9]{64}$/),textHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const aad=(r:any)=>JSON.stringify(['pdf-ocr-review-draft',r.tenant_id,r.project_id,r.owner_id,r.document_id,r.root_job_id,r.revision,r.source_hash,r.content_hash,r.processing_hash,r.rotation_plan_hash,r.parser_fingerprint,r.parse_version,r.page_index,r.text_hash,r.preview_hash,r.map_hash]);
const root=(j:any)=>j.pdf_ocr_root_job_id??j.job_id;
const identity=async(d:any)=>({processingHash:hash(await verifiedDocumentSource(d)),rotationPlanHash:pdfOcrRotationPlanHash(d),parserFingerprint:await pdfOcrParserFingerprint()});

export async function assertPdfOcrJobLineage(db:DB,job:any){
 const rootId=job.pdf_ocr_root_job_id??job.job_id??job.id,seen=new Set<string>();
 let current=job;
 while(true){
  const currentId=current.job_id??current.id;
  if(seen.has(currentId)||current.kind!=='detect'||current.collab_task_id||current.user_id!==job.user_id||current.tenant_id!==job.tenant_id||current.project_id!==job.project_id||current.document_id!==job.document_id||current.revision!==job.job_revision&&current.revision!==job.revision)fail('PDF_OCR_DRAFT_LINEAGE_INVALID');
  seen.add(currentId);
  if(currentId===rootId){if(current.pdf_ocr_parent_job_id||current.pdf_ocr_root_job_id)fail('PDF_OCR_DRAFT_LINEAGE_INVALID');return rootId;}
  if(current.pdf_ocr_root_job_id!==rootId||!current.pdf_ocr_parent_job_id)fail('PDF_OCR_DRAFT_LINEAGE_INVALID');
  const[parent]=await rows(db,sql`SELECT * FROM jobs WHERE id=${current.pdf_ocr_parent_job_id}`);
  if(!parent)fail('PDF_OCR_DRAFT_LINEAGE_INVALID');current=parent;
 }
}

async function context(db:DB,jobId:string,userId:string,tenantId:string,projectId:string,lock:boolean){
 const [j]=await rows(db,sql`SELECT j.id AS job_id,j.document_id,j.kind,j.status,j.error_code,j.revision AS job_revision,j.user_id,j.collab_task_id,j.required_permissions,j.pdf_ocr_root_job_id,j.pdf_ocr_parent_job_id,d.*
 FROM jobs j JOIN documents d ON d.id=j.document_id AND d.project_id=j.project_id AND d.tenant_id=j.tenant_id WHERE j.id=${jobId} ${lock?sql`FOR UPDATE OF j,d`:sql``}`);
 if(lock&&j&&j.user_id===userId&&j.tenant_id===tenantId&&j.project_id===projectId&&j.kind==='detect'&&!j.collab_task_id&&j.source_format==='pdf'&&j.revision===j.job_revision&&j.state==='review'){
  await requirePermission(db,projectId,['review','view_original',...j.required_permissions]);
  const[latest]=await rows(db,sql`SELECT * FROM jobs WHERE document_id=${j.id} ORDER BY created_at DESC,id DESC LIMIT 1`);
  if(latest?.status==='succeeded'&&latest.kind==='detect'&&!latest.collab_task_id&&latest.user_id===userId&&latest.tenant_id===tenantId&&latest.project_id===projectId&&latest.revision===j.revision&&await assertPdfOcrJobLineage(db,latest)===await assertPdfOcrJobLineage(db,j))fail('PDF_OCR_DRAFT_COMPLETED');
 }
 if(!j||j.user_id!==userId||j.tenant_id!==tenantId||j.project_id!==projectId||j.kind!=='detect'||j.collab_task_id||j.source_format!=='pdf'||j.revision!==j.job_revision||j.state!=='queued'||!['queued','running','cancelled'].includes(j.status)||j.status==='cancelled'&&!['PDF_OCR_PAUSED','PDF_OCR_PRIORITY_PREEMPTED'].includes(j.error_code))fail('NOT_FOUND',404);
 const [latest]=await rows(db,sql`SELECT id FROM jobs WHERE document_id=${j.id} ORDER BY created_at DESC,id DESC LIMIT 1`);
 if(latest?.id!==jobId)fail('JOB_NOT_LATEST');
 await requirePermission(db,projectId,['review','view_original',...j.required_permissions]);
 await assertPdfOcrJobLineage(db,j);
 const ids=await identity(j).catch(()=>fail('PDF_OCR_SOURCE_CHANGED')),pages=await loadPdfOcrCheckpointPages(db,j,ids.processingHash,ids.rotationPlanHash);
 return{j,ids,pages};
}

/** Reuse the existing owner, lineage, source and checkpoint verification when
 * an in-progress page participates in a unified batch preview. */
export async function verifiedPdfOcrPartialPreview(db:DB,jobId:string,userId:string,tenantId:string,projectId:string,pageIndex:number){
 const {j,pages}=await context(db,jobId,userId,tenantId,projectId,false);
 findPage(pages,pageIndex);
 return {documentId:j.id,revision:j.revision,contentHash:j.content_hash};
}

function findPage(pages:PdfOcrCheckpoint[],index:number){const frame=pages.find(p=>p.page.index===index);if(!frame)fail('PDF_OCR_PAGE_NOT_READY');return frame!;}
function readDraft(row:any,frame:PdfOcrCheckpoint):PdfOcrDraftPage{
 if(row.text_hash!==hash(frame.text)||row.preview_hash!==frame.page.previewHash||row.map_hash!==frame.page.mapHash)fail('PDF_OCR_DRAFT_PAGE_CHANGED');
 const raw=unseal(row.payload,aad(row));if(hash(raw)!==row.payload_hash)fail('PDF_OCR_DRAFT_STORAGE_INVALID');
 const draft=JSON.parse(raw) as PdfOcrDraftPage;
 if(draft.pageIndex!==row.page_index||draft.previewHash!==row.preview_hash||draft.mapHash!==row.map_hash||draft.textHash!==row.text_hash)fail('PDF_OCR_DRAFT_STORAGE_INVALID');
 validatePdfOcrDraftPage(draft,frame.text,frame.page);return draft;
}

async function readRotationDeletedCarry(db:DB,job:any,totalPages:number){
 const rootId=await assertPdfOcrJobLineage(db,job);
 const[origin]=await rows(db,sql`SELECT pdf_ocr_rotation_deleted_pages FROM jobs WHERE id=${rootId}`);
 const carried=origin?.pdf_ocr_rotation_deleted_pages??[];
 const pageLimit=totalPages;
 if(!origin||!Array.isArray(carried)||new Set(carried).size!==carried.length||carried.some((index:unknown)=>!Number.isInteger(index)||Number(index)<0||Number(index)>=pageLimit))fail('PDF_OCR_DRAFT_ROTATION_BINDING_INVALID');
 return new Set<number>(carried);
}
export function effectiveDeletedPages(carry:ReadonlySet<number>,drafts:readonly PdfOcrDraftPage[],override?:PdfOcrDraftPage){
 const deleted=new Set(carry);
 for(const draft of drafts){if(draft.pageDeleted)deleted.add(draft.pageIndex);else deleted.delete(draft.pageIndex);}
 if(override){if(override.pageDeleted)deleted.add(override.pageIndex);else deleted.delete(override.pageIndex);}
 return deleted;
}
function carriedDraft(frame:PdfOcrCheckpoint):PdfOcrDraftPage{return{pageIndex:frame.page.index,textHash:hash(frame.text),previewHash:frame.page.previewHash,mapHash:frame.page.mapHash,marks:[],removed:[],regions:[],pageDeleted:true};}

export function registerPdfOcrDraftRoutes(app:FastifyInstance){
 app.post('/api/jobs/:id/pdf-ocr/draft/pages/:page/preview',{bodyLimit:REVIEW_BODY_BYTES},async(req,reply)=>{
  const jobId=id.parse((req.params as {id:string}).id),pageIndex=z.coerce.number().int().nonnegative().parse((req.params as {page:string}).page),input=completePut.parse(req.body);
  if(input.pageIndex!==pageIndex)fail('PDF_OCR_DRAFT_PAGE_CHANGED');
  const image=await projectScope(req,{job:jobId},['review','view_original'],async(db,project)=>{
   const {j,ids,pages}=await context(db,jobId,req.user.id,req.user.tenant_id,project,false);
   if(input.revision!==j.revision)fail('VERSION_CONFLICT');
   const frame=findPage(pages,pageIndex);
   if(input.previewHash!==frame.page.previewHash||input.mapHash!==frame.page.mapHash||input.textHash!==hash(frame.text))fail('PDF_OCR_DRAFT_PAGE_CHANGED');
   const draft:PdfOcrDraftPage={pageIndex,textHash:input.textHash,previewHash:input.previewHash,mapHash:input.mapHash,marks:input.marks,removed:input.removed,regions:input.regions,pageDeleted:input.pageDeleted};
   try{validatePdfOcrDraftPage(draft,frame.text,frame.page);}catch{fail('PDF_OCR_DRAFT_INVALID',400);}
   if(draft.pageDeleted)fail('PAGE_NOT_READY');
   for(const mark of [...draft.marks,...draft.removed])if(!frame.glyphs.some(g=>g[0]<mark.end&&g[1]>mark.start&&g[4]>0&&g[5]>0))fail('PDF_OCR_DRAFT_POSITION_INVALID');
   const [saved]=await rows(db,sql`SELECT draft_revision FROM pdf_ocr_review_drafts WHERE document_id=${j.id} AND revision=${j.revision} AND page_index=${pageIndex} AND owner_id=${req.user.id} AND root_job_id=${root(j)} AND source_hash=${j.source_hash} AND content_hash=${j.content_hash} AND processing_hash=${ids.processingHash} AND rotation_plan_hash=${ids.rotationPlanHash} AND parser_fingerprint=${ids.parserFingerprint} AND parse_version=${j.parse_version}`);
   if((saved?.draft_revision??0)!==input.draftRevision)fail('VERSION_CONFLICT');
   // The established page-preview worker accepts a single zero-based page. The
   // verified checkpoint remains immutable; only this in-memory view is local.
   const page={...frame.page,index:0},anchors:Anchor[]=[{kind:'page',page:0,start:0,end:frame.text.length}];
   const marks=mergePdfOcrDraft(frame.text,anchors,[page],(frame.provisionalMatches??[]).map(mark=>({...mark})),[{...draft,pageIndex:0}]);
   const review={mode:'unselected' as const,regions:(draft.regions??[]).map(region=>({...region,page:0})),deletedPages:[]};
   const doc={...j,content:seal(frame.text,`${j.tenant_id}:${project}:${j.id}`),content_hash:hash(frame.text),anchors,page_data:[page],page_review:review,entity_corrections:null};
   return runProcessing<Uint8Array>({kind:'partial-page-preview',doc,page:0,marks});
  });
  return reply.header('Cache-Control','no-store').type('image/png').send(Buffer.from(image));
 });
 app.get('/api/jobs/:id/pdf-ocr/draft/pages/:page',async(req,reply)=>{
  const jobId=id.parse((req.params as {id:string}).id),page=z.coerce.number().int().nonnegative().parse((req.params as {page:string}).page);
  const image=await projectScope(req,{job:jobId},['review','view_original'],async(db,project)=>{
   const{pages}=await context(db,jobId,req.user.id,req.user.tenant_id,project,false);
   const frame=findPage(pages,page);
   return readOriginal(frame.page.previewId);
  });
  return reply.header('Cache-Control','no-store').type('image/png').send(Buffer.from(image));
 });
 app.get('/api/jobs/:id/pdf-ocr/draft',async req=>{
  const jobId=id.parse((req.params as {id:string}).id);
  return projectScope(req,{job:jobId},['review','view_original'],async(db,project)=>{
   const{j,ids,pages}=await context(db,jobId,req.user.id,req.user.tenant_id,project,false);
   const stored=await rows(db,sql`SELECT * FROM pdf_ocr_review_drafts WHERE document_id=${j.id} AND revision=${j.revision} AND owner_id=${req.user.id} AND root_job_id=${root(j)} AND source_hash=${j.source_hash} AND content_hash=${j.content_hash} AND processing_hash=${ids.processingHash} AND rotation_plan_hash=${ids.rotationPlanHash} AND parser_fingerprint=${ids.parserFingerprint} AND parse_version=${j.parse_version}`);
   if(stored.some(row=>!pages.some(page=>page.page.index===row.page_index)))fail('PDF_OCR_DRAFT_PAGE_CHANGED');
   const byPage=new Map(stored.map(row=>[row.page_index,row])),carry=await readRotationDeletedCarry(db,j,pages[0]?.totalPages??0);
   return{jobId,documentId:j.id,revision:j.revision,totalPages:pages[0]?.totalPages??0,pages:pages.map(frame=>{const row=byPage.get(frame.page.index);return{pageIndex:frame.page.index,width:frame.page.width,height:frame.page.height,rotation:frame.page.rotation,text:frame.text,textHash:hash(frame.text),previewHash:frame.page.previewHash,mapHash:frame.page.mapHash,machineCandidates:(frame.provisionalMatches??[]).map(m=>({start:m.start,end:m.end,kind:m.kind,...m.rawEntityType?{rawEntityType:m.rawEntityType}:{},decision:m.decision})),machineCandidatesStage:'provisional-rules' as const,draftRevision:row?.draft_revision??0,draft:row?readDraft(row,frame):carry.has(frame.page.index)?carriedDraft(frame):null};})};
  });
 });
 app.put('/api/jobs/:id/pdf-ocr/draft',async req=>{
  const jobId=id.parse((req.params as {id:string}).id),input=put.parse(req.body);
  return projectScope(req,{job:jobId},['review','view_original'],async(db,project)=>{
   const{j,ids,pages}=await context(db,jobId,req.user.id,req.user.tenant_id,project,true);
   if(input.revision!==j.revision)fail('VERSION_CONFLICT');
   const frame=findPage(pages,input.pageIndex);
   const draft:PdfOcrDraftPage={pageIndex:input.pageIndex,textHash:hash(frame.text),previewHash:frame.page.previewHash,mapHash:frame.page.mapHash,marks:input.marks,removed:input.removed,regions:input.regions,pageDeleted:input.pageDeleted};
   try{validatePdfOcrDraftPage(draft,frame.text,frame.page);}catch{fail('PDF_OCR_DRAFT_INVALID',400);}
   if(draft.pageDeleted){
    const rowsForDocument=await rows(db,sql`SELECT * FROM pdf_ocr_review_drafts WHERE document_id=${j.id} AND revision=${j.revision} AND owner_id=${req.user.id} AND root_job_id=${root(j)} AND source_hash=${j.source_hash} AND content_hash=${j.content_hash} AND processing_hash=${ids.processingHash} AND rotation_plan_hash=${ids.rotationPlanHash} AND parser_fingerprint=${ids.parserFingerprint} AND parse_version=${j.parse_version}`);
    const carry=await readRotationDeletedCarry(db,j,frame.totalPages);
    const deleted=effectiveDeletedPages(carry,rowsForDocument.map(row=>readDraft(row,findPage(pages,row.page_index))),draft);
    if(deleted.size>=frame.totalPages)fail('PDF_OCR_DRAFT_ALL_PAGES_DELETED');
   }
   for(const mark of [...draft.marks,...draft.removed])if(!frame.glyphs.some(g=>g[0]<mark.end&&g[1]>mark.start&&g[4]>0&&g[5]>0))fail('PDF_OCR_DRAFT_POSITION_INVALID');
   const[old]=await rows(db,sql`SELECT * FROM pdf_ocr_review_drafts WHERE document_id=${j.id} AND revision=${j.revision} AND page_index=${input.pageIndex} FOR UPDATE`);
   if((old?.draft_revision??0)!==input.draftRevision)fail('VERSION_CONFLICT');
   if(old&&(old.owner_id!==req.user.id||old.root_job_id!==root(j)||old.source_hash!==j.source_hash||old.content_hash!==j.content_hash||old.processing_hash!==ids.processingHash||old.rotation_plan_hash!==ids.rotationPlanHash||old.parser_fingerprint!==ids.parserFingerprint||old.parse_version!==j.parse_version))fail('PDF_OCR_DRAFT_BINDING_INVALID');
   const required=[...new Set([...j.required_permissions,'review','view_original'])];
   await rows(db,sql`UPDATE jobs SET required_permissions=${textArray(required)} WHERE id=${jobId}`);
   const row={tenant_id:j.tenant_id,project_id:project,owner_id:req.user.id,document_id:j.id,root_job_id:root(j),revision:j.revision,source_hash:j.source_hash,content_hash:j.content_hash,processing_hash:ids.processingHash,rotation_plan_hash:ids.rotationPlanHash,parser_fingerprint:ids.parserFingerprint,parse_version:j.parse_version,page_index:input.pageIndex,text_hash:draft.textHash,preview_hash:draft.previewHash,map_hash:draft.mapHash};
   const raw=JSON.stringify(draft),payload=seal(raw,aad(row));
   if(old)await rows(db,sql`UPDATE pdf_ocr_review_drafts SET draft_revision=draft_revision+1,payload=${payload},payload_hash=${hash(raw)},updated_at=now() WHERE document_id=${j.id} AND revision=${j.revision} AND page_index=${input.pageIndex}`);
   else await rows(db,sql`INSERT INTO pdf_ocr_review_drafts(document_id,revision,page_index,tenant_id,project_id,owner_id,root_job_id,source_hash,content_hash,processing_hash,rotation_plan_hash,parser_fingerprint,parse_version,text_hash,preview_hash,map_hash,payload,payload_hash) VALUES(${j.id},${j.revision},${input.pageIndex},${j.tenant_id},${project},${req.user.id},${root(j)},${j.source_hash},${j.content_hash},${ids.processingHash},${ids.rotationPlanHash},${ids.parserFingerprint},${j.parse_version},${draft.textHash},${draft.previewHash},${draft.mapHash},${payload},${hash(raw)})`);
   await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${j.tenant_id},${project},${req.user.id},'pdf_ocr_draft_saved',${j.id})`);
   return{jobId,revision:j.revision,pageIndex:input.pageIndex,draftRevision:input.draftRevision+1};
  });
 });
 app.put('/api/jobs/:id/pdf-ocr/draft/complete',async req=>{
  const jobId=id.parse((req.params as {id:string}).id),input=completePut.parse(req.body);
  return projectScope(req,{job:jobId},['review','view_original'],async(db,project)=>{
   const[requested]=await rows(db,sql`SELECT j.id AS job_id,j.document_id,j.kind,j.status AS job_status,j.error_code,j.revision AS job_revision,j.user_id,j.collab_task_id,j.required_permissions,j.pdf_ocr_root_job_id,j.pdf_ocr_parent_job_id,d.* FROM jobs j JOIN documents d ON d.id=j.document_id AND d.project_id=j.project_id AND d.tenant_id=j.tenant_id WHERE j.id=${jobId} FOR UPDATE OF j,d`);
   if(!requested||requested.user_id!==req.user.id||requested.tenant_id!==req.user.tenant_id||requested.project_id!==project||requested.kind!=='detect'||requested.collab_task_id||requested.source_format!=='pdf')fail('NOT_FOUND',404);
   if(requested.state!=='review'||requested.revision!==requested.job_revision||input.revision!==requested.revision||
      requested.job_status!=='succeeded'&&!(requested.job_status==='cancelled'&&requested.error_code==='PDF_OCR_PRIORITY_PREEMPTED'))fail('PDF_OCR_DRAFT_FINAL_CHANGED');
   await requirePermission(db,project,['review','view_original',...requested.required_permissions]);
   const requestedRoot=await assertPdfOcrJobLineage(db,requested);
   const[latest]=await rows(db,sql`SELECT j.id AS job_id,j.document_id,j.kind,j.status AS job_status,j.revision AS job_revision,j.user_id,j.collab_task_id,j.required_permissions,j.pdf_ocr_root_job_id,j.pdf_ocr_parent_job_id,d.* FROM jobs j JOIN documents d ON d.id=j.document_id AND d.project_id=j.project_id AND d.tenant_id=j.tenant_id WHERE j.document_id=${requested.id} ORDER BY j.created_at DESC,j.id DESC LIMIT 1 FOR UPDATE OF j`);
   if(!latest||latest.kind!=='detect'||latest.collab_task_id||latest.job_status!=='succeeded'||latest.user_id!==req.user.id||latest.tenant_id!==req.user.tenant_id||latest.project_id!==project||latest.document_id!==requested.document_id||latest.job_revision!==requested.job_revision||latest.revision!==requested.revision||latest.source_format!=='pdf'||await assertPdfOcrJobLineage(db,latest)!==requestedRoot)fail('PDF_OCR_DRAFT_FINAL_CHANGED');
   const j=latest;
   await requirePermission(db,project,['review','view_original',...j.required_permissions]);
   const rootId=await assertPdfOcrJobLineage(db,j);
   const[snapshot]=await rows(db,sql`SELECT content_hash FROM review_snapshots WHERE document_id=${j.id} AND revision=${j.revision}`);
   if(!snapshot||snapshot.content_hash!==j.content_hash)fail('PDF_OCR_DRAFT_FINAL_CHANGED');
   const bindingRows=await rows(db,sql`SELECT DISTINCT content_hash,processing_hash,rotation_plan_hash,parser_fingerprint,parse_version,owner_id FROM pdf_ocr_checkpoints WHERE document_id=${j.id} AND revision=${j.revision} AND tenant_id=${j.tenant_id} AND project_id=${j.project_id} AND source_hash=${j.source_hash}`);
   if(bindingRows.length!==1||bindingRows[0].owner_id!==req.user.id||bindingRows[0].parse_version!==j.parse_version)fail('PDF_OCR_DRAFT_FINAL_CHANGED');
   const binding=bindingRows[0],ids=await identity(j).catch(()=>fail('PDF_OCR_SOURCE_CHANGED'));
   if(binding.processing_hash!==ids.processingHash||binding.rotation_plan_hash!==ids.rotationPlanHash||binding.parser_fingerprint!==ids.parserFingerprint)fail('PDF_OCR_DRAFT_FINAL_CHANGED');
   const checkpointOwners=await rows(db,sql`SELECT DISTINCT job_id FROM pdf_ocr_checkpoints WHERE document_id=${j.id} AND revision=${j.revision} AND tenant_id=${j.tenant_id} AND project_id=${j.project_id} AND source_hash=${j.source_hash}`);
   for(const owner of checkpointOwners){const[producer]=await rows(db,sql`SELECT * FROM jobs WHERE id=${owner.job_id}`);if(!producer||producer.user_id!==req.user.id||producer.document_id!==j.id||producer.revision!==j.revision||await assertPdfOcrJobLineage(db,producer)!==rootId)fail('PDF_OCR_DRAFT_FINAL_CHANGED');}
   const oldBindingDocument={...j,content_hash:binding.content_hash};
   const pages=await loadPdfOcrCheckpointPages(db,oldBindingDocument,ids.processingHash,ids.rotationPlanHash),frame=findPage(pages,input.pageIndex);
   if(pages.length!==j.page_data.length)fail('PDF_OCR_DRAFT_FINAL_CHANGED');
   if(frame.page.previewHash!==input.previewHash||frame.page.mapHash!==input.mapHash||hash(frame.text)!==input.textHash)fail('PDF_OCR_DRAFT_PAGE_CHANGED');
   const full=unseal(j.content,`${j.tenant_id}:${j.project_id}:${j.id}`),anchor=j.anchors.find((a:any)=>a.kind==='page'&&a.page===input.pageIndex),page=j.page_data.find((p:any)=>p.index===input.pageIndex);
   if(hash(full)!==j.content_hash||!anchor||!page||full.slice(anchor.start,anchor.end)!==frame.text||page.previewHash!==frame.page.previewHash||page.mapHash!==frame.page.mapHash)fail('PDF_OCR_DRAFT_FINAL_CHANGED');
   const[stored]=await rows(db,sql`SELECT * FROM pdf_ocr_review_drafts WHERE document_id=${j.id} AND revision=${j.revision} AND page_index=${input.pageIndex} FOR UPDATE`);
   if((stored?.draft_revision??0)!==input.draftRevision)fail('VERSION_CONFLICT');
   if(stored&&(stored.owner_id!==req.user.id||stored.root_job_id!==rootId||stored.source_hash!==j.source_hash||stored.content_hash!==binding.content_hash||stored.processing_hash!==ids.processingHash||stored.rotation_plan_hash!==ids.rotationPlanHash||stored.parser_fingerprint!==ids.parserFingerprint||stored.parse_version!==j.parse_version))fail('PDF_OCR_DRAFT_BINDING_INVALID');
   const oldDraft=stored?readDraft(stored,frame):null,nextDraft:PdfOcrDraftPage={pageIndex:input.pageIndex,textHash:input.textHash,previewHash:input.previewHash,mapHash:input.mapHash,marks:input.marks,removed:input.removed,regions:input.regions,pageDeleted:input.pageDeleted};
   for(const mark of [...nextDraft.marks,...nextDraft.removed])if(!frame.glyphs.some(g=>g[0]<mark.end&&g[1]>mark.start&&g[4]>0&&g[5]>0))fail('PDF_OCR_DRAFT_POSITION_INVALID');
   const merged=replacePdfOcrDraftAtReview(full,j.anchors,j.page_data,j.marks,openPageReview(j),oldDraft,nextDraft);
   const saved=await saveReview(db,req.user.id,j,merged.marks,undefined,false,merged.pageReview??undefined);
   return{...saved,pageIndex:input.pageIndex,reviewRequired:true};
  });
 });
}

export async function readPdfOcrDraftPagesForCommit(db:DB,job:any,d:any,ids:{processingHash:string;rotationPlanHash:string;parserFingerprint:string},pages:PdfOcrCheckpoint[]){
 const records=await rows(db,sql`SELECT * FROM pdf_ocr_review_drafts WHERE document_id=${d.id} AND revision=${d.revision} AND owner_id=${job.user_id} ORDER BY page_index`);
 const drafts:PdfOcrDraftPage[]=[];
 for(const row of records){if(row.root_job_id!==(job.pdf_ocr_root_job_id??job.id)||row.tenant_id!==d.tenant_id||row.project_id!==d.project_id||row.source_hash!==d.source_hash||row.content_hash!==d.content_hash||row.processing_hash!==ids.processingHash||row.rotation_plan_hash!==ids.rotationPlanHash||row.parser_fingerprint!==ids.parserFingerprint||row.parse_version!==d.parse_version)fail('PDF_OCR_DRAFT_BINDING_INVALID');drafts.push(readDraft(row,findPage(pages,row.page_index)));}
 const carried=await readRotationDeletedCarry(db,job,pages[0]?.totalPages??0);
 const effective=effectiveDeletedPages(carried,drafts);
 for(const index of carried){if(drafts.some(draft=>draft.pageIndex===index))continue;const frame=findPage(pages,index);drafts.push(carriedDraft(frame));}
 if(effective.size>=pages[0]?.totalPages)fail('PDF_OCR_DRAFT_ALL_PAGES_DELETED');
 return drafts;
}

// Called only inside the owner-scoped rotation transaction, after unchanged
// checkpoints have been resealed under the new revision/rotation plan.
export async function rebasePdfOcrDraftPagesForRotation(db:DB,oldDoc:any,newDoc:any,oldRootJob:any,newRootJob:any,oldFrames:PdfOcrCheckpoint[],selectedPages:ReadonlySet<number>){
 if(oldDoc.id!==newDoc.id||oldDoc.tenant_id!==newDoc.tenant_id||oldDoc.project_id!==newDoc.project_id||newDoc.revision!==oldDoc.revision+1||oldDoc.source_hash!==newDoc.source_hash||oldDoc.content_hash!==newDoc.content_hash||oldDoc.parse_version!==newDoc.parse_version||oldDoc.source_format!=='pdf'||newDoc.source_format!=='pdf')fail('PDF_OCR_DRAFT_ROTATION_BINDING_INVALID');
 if(oldRootJob.kind!=='detect'||newRootJob.kind!=='detect'||oldRootJob.id===newRootJob.id||oldRootJob.user_id!==newRootJob.user_id||oldRootJob.document_id!==oldDoc.id||newRootJob.document_id!==newDoc.id||oldRootJob.revision!==oldDoc.revision||newRootJob.revision!==newDoc.revision||oldRootJob.collab_task_id||newRootJob.collab_task_id||newRootJob.pdf_ocr_root_job_id||newRootJob.pdf_ocr_parent_job_id)fail('PDF_OCR_DRAFT_ROTATION_BINDING_INVALID');
 const oldIds=await identity(oldDoc),newIds=await identity(newDoc);
 if(oldIds.processingHash!==newIds.processingHash||oldIds.parserFingerprint!==newIds.parserFingerprint)fail('PDF_OCR_DRAFT_ROTATION_BINDING_INVALID');
 const newFrames=await loadPdfOcrCheckpointPages(db,newDoc,newIds.processingHash,newIds.rotationPlanHash);
 const records=await rows(db,sql`SELECT * FROM pdf_ocr_review_drafts WHERE document_id=${oldDoc.id} AND revision=${oldDoc.revision} AND owner_id=${oldRootJob.user_id} AND root_job_id=${oldRootJob.id} AND source_hash=${oldDoc.source_hash} AND content_hash=${oldDoc.content_hash} AND processing_hash=${oldIds.processingHash} AND rotation_plan_hash=${oldIds.rotationPlanHash} AND parser_fingerprint=${oldIds.parserFingerprint} AND parse_version=${oldDoc.parse_version} ORDER BY page_index FOR UPDATE`);
 const oldCarry=oldRootJob.pdf_ocr_rotation_deleted_pages??[],previousDraftPages=new Set(records.map(row=>row.page_index));
 if(!oldFrames.length||!Array.isArray(oldCarry)||new Set(oldCarry).size!==oldCarry.length||oldCarry.some((index:unknown)=>!Number.isSafeInteger(index)||Number(index)<0||Number(index)>=oldFrames[0].totalPages))fail('PDF_OCR_DRAFT_ROTATION_BINDING_INVALID');
 let copied=0;const selectedDeletedPages=new Set<number>(oldCarry.filter((index:number)=>!previousDraftPages.has(index)));
 for(const old of records){
  const previous=findPage(oldFrames,old.page_index),prior=readDraft(old,previous),selected=selectedPages.has(old.page_index),next=newFrames.find(frame=>frame.page.index===old.page_index);
  if(selected&&!prior.pageDeleted)continue;
  if(selected&&!next){selectedDeletedPages.add(old.page_index);continue;}
  if(!next)throw Object.assign(new Error('PDF_OCR_DRAFT_ROTATION_PAGE_CHANGED'),{statusCode:409});
  if(!selected&&(previous.page.rotation!==next.page.rotation||previous.text!==next.text||previous.page.previewHash!==next.page.previewHash||previous.page.mapHash!==next.page.mapHash))fail('PDF_OCR_DRAFT_ROTATION_PAGE_CHANGED');
  const draft:PdfOcrDraftPage=selected?{pageIndex:old.page_index,textHash:hash(next.text),previewHash:next.page.previewHash,mapHash:next.page.mapHash,marks:[],removed:[],regions:[],pageDeleted:true}:prior;
  const row={tenant_id:newDoc.tenant_id,project_id:newDoc.project_id,owner_id:newRootJob.user_id,document_id:newDoc.id,root_job_id:newRootJob.id,revision:newDoc.revision,source_hash:newDoc.source_hash,content_hash:newDoc.content_hash,processing_hash:newIds.processingHash,rotation_plan_hash:newIds.rotationPlanHash,parser_fingerprint:newIds.parserFingerprint,parse_version:newDoc.parse_version,page_index:old.page_index,text_hash:draft.textHash,preview_hash:draft.previewHash,map_hash:draft.mapHash};
  const raw=JSON.stringify(draft),payload=seal(raw,aad(row));
  await rows(db,sql`INSERT INTO pdf_ocr_review_drafts(document_id,revision,page_index,tenant_id,project_id,owner_id,root_job_id,source_hash,content_hash,processing_hash,rotation_plan_hash,parser_fingerprint,parse_version,text_hash,preview_hash,map_hash,draft_revision,payload,payload_hash) VALUES(${row.document_id},${row.revision},${row.page_index},${row.tenant_id},${row.project_id},${row.owner_id},${row.root_job_id},${row.source_hash},${row.content_hash},${row.processing_hash},${row.rotation_plan_hash},${row.parser_fingerprint},${row.parse_version},${row.text_hash},${row.preview_hash},${row.map_hash},${old.draft_revision},${payload},${hash(raw)})`);
  copied++;
 }
 return{copied,selectedDeletedPages:[...selectedDeletedPages].sort((a,b)=>a-b)};
}
