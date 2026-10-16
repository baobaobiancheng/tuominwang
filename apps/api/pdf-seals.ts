import type {FastifyInstance} from 'fastify';
import {id,revisionSchema} from '../../packages/contracts/index.ts';
import {rows,sql,type DB} from '../../packages/adapters/db.ts';
import {projectScope,requirePermission} from './access.ts';
import {readProcessingEvent} from '../../packages/adapters/processing-events.ts';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {runProcessing} from '../../packages/adapters/processing.ts';
import {openPageReview} from '../../packages/adapters/page-review-storage.ts';
import {resolveDocumentPolicy} from '../../packages/adapters/document-policy.ts';
import {readProjectPresets} from '../../packages/adapters/project-presets.ts';

const fail=(code:string,statusCode=409):never=>{throw Object.assign(new Error(code),{statusCode});};

// The original incremental merge identifies a visual hit by its page, type,
// and exact box. Detector metadata and score may change on a repeat scan.
export function mergePdfSealCandidates(existing:any[],incoming:any[]){
 const key=(candidate:any)=>JSON.stringify([candidate.reason,candidate.page,candidate.x,candidate.y,candidate.width,candidate.height]);
 const seen=new Set(existing.map(key)),merged=[...existing];
 for(const candidate of incoming){const identity=key(candidate);if(!seen.has(identity)){seen.add(identity);merged.push(candidate);}}
 return merged;
}

// A saved human review increments the document revision without changing the
// source scan. Only that exact, uninterrupted snapshot chain may reuse the
// original detector's completed-page witness.
async function sameHumanSourceLineage(db:DB,target:any){
 if(target.status!=='succeeded'||target.revision>target.current_revision)fail('VERSION_CONFLICT');
 const [latest]=await rows(db,sql`SELECT id FROM jobs WHERE document_id=${target.document_id} AND kind='detect' ORDER BY created_at DESC,id DESC LIMIT 1`);
 if(latest?.id!==target.id)fail('SEAL_SOURCE_CHANGED');
 const snapshots=await rows(db,sql`SELECT revision,review_mode,content_hash,parse_version,recognition,page_data FROM review_snapshots WHERE document_id=${target.document_id} AND revision>=${target.revision} AND revision<=${target.current_revision} ORDER BY revision`);
 if(snapshots.length!==target.current_revision-target.revision+1||snapshots[0]?.revision!==target.revision||!snapshots.every((row,index)=>row.revision===target.revision+index&&row.content_hash===target.content_hash&&row.parse_version===target.parse_version&&isDeepStrictEqual(row.page_data,snapshots[0].page_data)&&isDeepStrictEqual(row.recognition,snapshots[0].recognition)&&(index===0||row.review_mode==='human_review')))fail('SEAL_SOURCE_CHANGED');
 if(!isDeepStrictEqual(target.page_data,snapshots[0].page_data)||!isDeepStrictEqual(target.recognition,snapshots[0].recognition))fail('SEAL_SOURCE_CHANGED');
 const [event]=await rows(db,sql`SELECT source_hash FROM processing_events WHERE job_id=${target.id} ORDER BY sequence LIMIT 1`);
 if(!event||event.source_hash!==target.source_hash)fail('SEAL_SOURCE_CHANGED');
}
export async function readPdfSealState(db:DB,d:any){
 const published=d.source_format==='pdf'?d.recognition?.visual?.sealProgress:null;
 if(!published||!Array.isArray(d.page_data)||!d.page_data.length)return null;
 const [job]=await rows(db,sql`SELECT id,user_id,tenant_id,project_id,document_id,kind,collab_task_id,status,generation,revision,pdf_seal_pause_requested FROM jobs WHERE document_id=${d.id} AND kind='detect' ORDER BY created_at DESC,id DESC LIMIT 1`);
 if(!job||job.status!=='succeeded'||job.collab_task_id)return null;
 const target={...job,current_revision:d.revision,recognition:d.recognition,source_format:d.source_format,source_hash:d.source_hash,content_hash:d.content_hash,parse_version:d.parse_version,page_data:d.page_data};
 try{await sameHumanSourceLineage(db,target);}catch{
  // Project export members cannot read the detector owner's private events.
  // Project members cannot read the detector owner's private events. The
  // database witness checks the same human source chain and current deleted
  // pages without exposing event payloads or supplement matches.
  const [witness]=await rows(db,sql`SELECT pdf_seal_lineage_witness(${d.id}::uuid,${d.revision}::integer,true) AS complete,pdf_seal_lineage_witness(${d.id}::uuid,${d.revision}::integer,false) AS valid`);
  return witness?.valid?{detectJobId:job.id,ownerId:job.user_id,paused:job.pdf_seal_pause_requested===true,sealProgress:{status:witness.complete?'complete' as const:'deferred' as const,completedPageNumbers:published.completedPageNumbers??[]}}:null;
 }
 const completed=new Set<number>(published.completedPageNumbers??[]),runs=await rows(db,sql`SELECT completed_pages,seal_warning FROM pdf_seal_supplements WHERE document_id=${d.id} AND detect_job_id=${job.id} AND source_hash=${d.source_hash} ORDER BY created_at,request_id`);
 for(const row of runs)for(const page of row.completed_pages)completed.add(page);
 const deleted=new Set(openPageReview(d)?.deletedPages??[]),complete=d.page_data.every((page:any)=>completed.has(page.index+1)||deleted.has(page.index));
 const warning=runs.length?runs.at(-1).seal_warning:published.sealWarning;
 return{detectJobId:job.id,ownerId:job.user_id,paused:job.pdf_seal_pause_requested===true,sealProgress:{status:complete?'complete':'deferred',completedPageNumbers:[...completed].sort((a,b)=>a-b),...warning?{sealWarning:warning}:{}}};
}

export function registerPdfSealRoutes(app:FastifyInstance){
 app.get('/api/jobs/:id/pdf-seals/progress',async req=>{
  const job=id.parse((req.params as {id:string}).id);
  return projectScope(req,{job},['view_original'],async db=>{
   const [target]=await rows(db,sql`SELECT j.id,j.user_id,j.tenant_id,j.project_id,j.document_id,j.kind,j.collab_task_id,j.status,j.generation,j.revision,j.pdf_seal_pause_requested,d.revision AS current_revision,d.recognition,d.source_format,d.source_hash,d.content_hash,d.parse_version,d.page_data,d.page_review FROM jobs j JOIN documents d ON d.id=j.document_id WHERE j.id=${job}`);
   if(!target||target.user_id!==req.user.id||target.tenant_id!==req.user.tenant_id||target.kind!=='detect'||target.collab_task_id||target.source_format!=='pdf')fail('NOT_FOUND',404);
   if(target.revision!==target.current_revision)await sameHumanSourceLineage(db,target);
   const events=await rows(db,sql`SELECT * FROM processing_events WHERE job_id=${job} AND generation=${target.generation} ORDER BY sequence`);
   const completed=new Set<number>();for(const row of events){const event=readProcessingEvent(row).event;if(event.type==='pdf-seal-page')completed.add(event.pageNumber);}
   const published=(target.recognition as any)?.visual?.sealProgress;
   for(const page of published?.completedPageNumbers??[])completed.add(page);
   const supplemental=await rows(db,sql`SELECT completed_pages,seal_warning FROM pdf_seal_supplements WHERE document_id=${target.document_id} AND detect_job_id=${job} AND source_hash=${target.source_hash} ORDER BY created_at,request_id`);
   for(const row of supplemental)for(const page of row.completed_pages)completed.add(page);
   const count=(target.page_data as any[]).length,deleted=new Set(openPageReview({...target,id:target.document_id,revision:target.current_revision})?.deletedPages??[]);
   const complete=count>0&&Array.from({length:count},(_,index)=>index+1).every(page=>completed.has(page)||deleted.has(page-1));
   const [document]=await rows(db,sql`SELECT d.*,p.preset_policy,p.preset_revision FROM documents d JOIN projects p ON p.id=d.project_id WHERE d.id=${target.document_id}`);
   const policy=resolveDocumentPolicy(document,readProjectPresets({id:document.project_id,tenant_id:document.tenant_id,preset_policy:document.preset_policy,preset_revision:document.preset_revision}));
   const enabled=policy.presetPolicy?.profile?.settings?.enabledEntityTypeIds?.includes('seal')===true;
   const warning=supplemental.length?supplemental.at(-1).seal_warning:published?.sealWarning;
   return{jobId:job,detectRevision:target.revision,revision:target.current_revision,sourceHash:target.source_hash,jobStatus:target.status,enabled,paused:target.pdf_seal_pause_requested===true,sealProgress:{status:complete?'complete':'deferred',completedPageNumbers:[...completed].sort((a,b)=>a-b),...warning?{sealWarning:warning}:{}}};
  });
 });
 app.post('/api/jobs/:id/pdf-seals/supplement',async req=>{
  const job=id.parse((req.params as {id:string}).id),input=z.object({revision:z.number().int().nonnegative(),requestId:id}).strict().parse(req.body);
  return projectScope(req,{job},['review','view_original'],async db=>{
   const [target]=await rows(db,sql`SELECT j.id,j.user_id,j.tenant_id,j.project_id,j.document_id,j.kind,j.collab_task_id,j.status,j.generation,j.revision,j.pdf_seal_pause_requested,d.revision AS current_revision,d.recognition,d.source_format,d.source_hash,d.content_hash,d.parse_version,d.page_data,d.state FROM jobs j JOIN documents d ON d.id=j.document_id WHERE j.id=${job} FOR UPDATE OF d`);
   if(!target||target.user_id!==req.user.id||target.tenant_id!==req.user.tenant_id||target.kind!=='detect'||target.collab_task_id||target.source_format!=='pdf')fail('NOT_FOUND',404);
   if(target.current_revision!==input.revision)fail('VERSION_CONFLICT');
   if(target.status!=='succeeded'||target.state!=='review'||target.recognition?.visual?.sealProgress?.status!=='deferred')fail('PDF_SEAL_SUPPLEMENT_UNAVAILABLE');
   await sameHumanSourceLineage(db,target);
   const [prior]=await rows(db,sql`SELECT * FROM pdf_seal_supplements WHERE request_id=${input.requestId}`);
   if(prior){if(prior.document_id!==target.document_id||prior.detect_job_id!==job||prior.owner_id!==req.user.id||prior.revision!==input.revision||prior.source_hash!==target.source_hash)fail('PDF_SEAL_REQUEST_CONFLICT');return{documentId:target.document_id,revision:input.revision,requestId:input.requestId,sourceHash:target.source_hash,matches:prior.matches,sealProgress:{status:prior.seal_status,completedPageNumbers:prior.completed_pages,...prior.seal_warning?{sealWarning:prior.seal_warning}:{}}};}
   const [document]=await rows(db,sql`SELECT * FROM documents WHERE id=${target.document_id} FOR UPDATE`);
   const pages=document.page_data as any[],deleted=new Set(openPageReview(document)?.deletedPages??[]),completed=new Set<number>(target.recognition.visual.sealProgress.completedPageNumbers);
   const priorRuns=await rows(db,sql`SELECT completed_pages FROM pdf_seal_supplements WHERE document_id=${target.document_id} AND detect_job_id=${job} AND source_hash=${target.source_hash}`);
   for(const row of priorRuns)for(const page of row.completed_pages)completed.add(page);
   const matches:any[]=[];let warning=false,sealWarning:string|null=null;
   for(const page of pages){if(completed.has(page.index+1)||deleted.has(page.index))continue;
    let result:any;
    try{result=await runProcessing<any>({kind:'visual-detect',doc:document,page:page.index,detectors:['seal']});}
    catch(error){const code=(error as Error).message;if(['SOURCE_MISMATCH','VISUAL_INPUT_INVALID','PROCESSING_BUSY','VERSION_CONFLICT','PERMISSION_REVOKED'].includes(code))throw error;warning=true;sealWarning=['VISUAL_MODEL_REQUIRED','VISUAL_MODEL_MISMATCH','VISUAL_OUTPUT_INVALID'].includes(code)?code:'SEAL_DETECT_FAILED';break;}
    if(result.complete===false||result.warnings?.length){warning=true;sealWarning=typeof result.warnings?.[0]==='string'&&result.warnings[0].length<=80?result.warnings[0]:'SEAL_DETECT_INCOMPLETE';break;}
    matches.push(...result.candidates.map((candidate:any)=>({...candidate,page:page.index})));completed.add(page.index+1);
   }
   const merged=mergePdfSealCandidates(document.visual_candidates??[],matches);
   if(merged.length>3000)fail('VISUAL_CANDIDATE_LIMIT');
   await rows(db,sql`UPDATE documents SET visual_candidates=${JSON.stringify(merged)}::jsonb WHERE id=${document.id} AND revision=${input.revision}`);
   const numbers=[...completed].sort((a,b)=>a-b),complete=!warning&&pages.every((page:any)=>completed.has(page.index+1)||deleted.has(page.index));
   const completedPages=sql`ARRAY[${sql.join(numbers.map(page=>sql`${page}`),sql`, `)}]::integer[]`;
   await rows(db,sql`INSERT INTO pdf_seal_supplements(request_id,tenant_id,project_id,owner_id,document_id,detect_job_id,revision,source_hash,completed_pages,seal_status,seal_warning,matches) VALUES(${input.requestId},${target.tenant_id},${target.project_id},${req.user.id},${target.document_id},${job},${input.revision},${target.source_hash},${completedPages},${complete?'complete':'deferred'},${sealWarning},${JSON.stringify(matches)}::jsonb)`);
   await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${target.tenant_id},${target.project_id},${req.user.id},'pdf_seals_supplemented',${target.document_id})`);
   return{documentId:target.document_id,revision:input.revision,requestId:input.requestId,sourceHash:target.source_hash,matches,sealProgress:{status:complete?'complete':'deferred',completedPageNumbers:numbers,...sealWarning?{sealWarning}:{}}};
  });
 });
 app.post('/api/jobs/:id/pdf-seals/pause',async req=>{
  const job=id.parse((req.params as {id:string}).id),{revision}=revisionSchema.parse(req.body);
  return projectScope(req,{job},[],async(db,project)=>{
   const [target]=await rows(db,sql`SELECT j.id AS job_id,j.user_id,j.tenant_id,j.project_id,j.document_id,j.kind,j.collab_task_id,j.status,j.lease_until,j.revision AS job_revision,j.required_permissions,j.pdf_seal_pause_requested,
     d.revision AS document_revision,d.source_format,d.state
     FROM jobs j JOIN documents d ON d.id=j.document_id AND d.project_id=j.project_id AND d.tenant_id=j.tenant_id
     WHERE j.id=${job} FOR UPDATE OF j,d`);
   if(!target||target.user_id!==req.user.id||target.tenant_id!==req.user.tenant_id||target.project_id!==project)fail('NOT_FOUND',404);
   await requirePermission(db,project,target.required_permissions);
   if(target.kind!=='detect'||target.collab_task_id||target.source_format!=='pdf')fail('PDF_SEAL_CONTROL_UNAVAILABLE');
   const [document]=await rows(db,sql`SELECT d.*,p.preset_policy,p.preset_revision FROM documents d JOIN projects p ON p.id=d.project_id WHERE d.id=${target.document_id}`);
   const policy=resolveDocumentPolicy(document,readProjectPresets({id:document.project_id,tenant_id:document.tenant_id,preset_policy:document.preset_policy,preset_revision:document.preset_revision}));
   if(policy.presetPolicy?.profile?.settings?.enabledEntityTypeIds?.includes('seal')!==true)fail('PDF_SEAL_CONTROL_UNAVAILABLE');
   if(target.document_revision!==revision||target.job_revision!==revision)fail('VERSION_CONFLICT');
   const [latest]=await rows(db,sql`SELECT id FROM jobs WHERE document_id=${target.document_id} ORDER BY created_at DESC,id DESC LIMIT 1`);
   if(latest?.id!==job||target.state!=='queued'||target.status!=='running'||!target.lease_until||new Date(target.lease_until)<=new Date())fail('PDF_SEAL_CONTROL_UNAVAILABLE');
   const [authorized]=await rows(db,sql`SELECT job_authorized(${job}::uuid) AS allowed`);
   if(!authorized?.allowed)fail('PERMISSION_REVOKED',403);
   if(!target.pdf_seal_pause_requested){
    const [changed]=await rows(db,sql`UPDATE jobs SET pdf_seal_pause_requested=true WHERE id=${job} AND status='running' AND lease_until>now() RETURNING id`);
    if(!changed)fail('PDF_SEAL_CONTROL_UNAVAILABLE');
    await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'pdf_seals_paused',${target.document_id})`);
   }
   return {jobId:job,revision,status:'deferred' as const,paused:true};
  });
 });
}
