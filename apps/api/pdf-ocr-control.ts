import type {FastifyInstance} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {id,revisionSchema} from '../../packages/contracts/index.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {verifiedDocumentSource} from '../../packages/adapters/document-source.ts';
import {hash} from '../../packages/adapters/storage.ts';
import {pdfOcrRotationPlanHash,pdfOcrParserFingerprint,loadPdfOcrCheckpointPages} from '../../packages/adapters/pdf-ocr-checkpoints.ts';
import {projectScope,requirePermission,textArray} from './access.ts';

const fail=(message:string,statusCode=409):never=>{throw Object.assign(new Error(message),{statusCode});};

async function pauseIdentity(d:any){
 const bytes=await verifiedDocumentSource(d);
 return {sourceId:d.source_id,sourceHash:d.source_hash,contentHash:d.content_hash,processingHash:hash(bytes),rotationPlanHash:pdfOcrRotationPlanHash(d),parserFingerprint:await pdfOcrParserFingerprint(),parseVersion:d.parse_version};
}
function sameIdentity(saved:any,current:Awaited<ReturnType<typeof pauseIdentity>>){
 return !!saved&&Object.keys(current).every(key=>saved[key as keyof typeof current]===current[key as keyof typeof current]);
}

// A PDF OCR pause preserves the detect revision and its durable page checkpoints.
// Ordinary job cancellation intentionally has different semantics.
export function registerPdfOcrControlRoutes(app:FastifyInstance){
 app.get('/api/jobs/:id/pdf-ocr/progress',async req=>{
  const job=id.parse((req.params as {id:string}).id);
  return projectScope(req,{job},['view_original'],async(db,project)=>{
   const [target]=await rows(db,sql`SELECT j.id AS job_id,j.kind,j.status,j.error_code,j.revision AS job_revision,j.user_id,j.collab_task_id,d.*
     FROM jobs j JOIN documents d ON d.id=j.document_id AND d.project_id=j.project_id AND d.tenant_id=j.tenant_id WHERE j.id=${job}`);
   if(!target||target.user_id!==req.user.id||target.tenant_id!==req.user.tenant_id||target.project_id!==project||target.kind!=='detect'||target.collab_task_id||target.source_format!=='pdf'||target.job_revision!==target.revision||target.state!=='queued')fail('NOT_FOUND',404);
   const bytes=await verifiedDocumentSource(target);
   const pages=await loadPdfOcrCheckpointPages(db,target,hash(bytes));
   return {jobId:job,revision:target.revision,status:target.status==='cancelled'&&target.error_code==='PDF_OCR_PAUSED'?'paused':target.status,completedPageNumbers:pages.map(page=>page.page.index+1),totalPages:pages[0]?.totalPages??null};
  });
 });
 app.post('/api/jobs/:id/pdf-ocr/pause',async req=>{
  const job=id.parse((req.params as {id:string}).id),{revision}=revisionSchema.parse(req.body);
  return projectScope(req,{job},[],async(db,project)=>{
   const [target]=await rows(db,sql`SELECT j.*,d.*,j.revision AS job_revision,d.revision AS current_revision,d.state AS current_state,d.source_format AS current_format
     FROM jobs j JOIN documents d ON d.id=j.document_id AND d.project_id=j.project_id AND d.tenant_id=j.tenant_id
     WHERE j.id=${job} FOR UPDATE OF j,d`);
   if(!target||target.user_id!==req.user.id||target.tenant_id!==req.user.tenant_id||target.project_id!==project)fail('NOT_FOUND',404);
   await requirePermission(db,project,target.required_permissions);
   if(target.kind!=='detect'||target.collab_task_id||target.current_format!=='pdf')fail('PDF_OCR_CONTROL_UNAVAILABLE');
   if(target.current_revision!==revision||target.job_revision!==revision)fail('VERSION_CONFLICT');
   const [latest]=await rows(db,sql`SELECT id FROM jobs WHERE document_id=${target.document_id} ORDER BY created_at DESC,id DESC LIMIT 1`);
   if(latest?.id!==job||target.current_state!=='queued')fail('PDF_OCR_CONTROL_UNAVAILABLE');
   if(target.status==='cancelled'&&target.error_code==='PDF_OCR_PAUSED')return{jobId:job,revision,status:'paused'};
   if(!['queued','running'].includes(target.status))fail('JOB_NOT_ACTIVE');
   const binding=await pauseIdentity(target);
   const [updated]=await rows(db,sql`UPDATE jobs SET status='cancelled',error_code='PDF_OCR_PAUSED',lease_until=NULL,pdf_ocr_pause_binding=${JSON.stringify(binding)}::jsonb
     WHERE id=${job} AND status IN ('queued','running') RETURNING id`);
   if(!updated)fail('JOB_NOT_ACTIVE');
   await rows(db,sql`UPDATE attempts SET finished_at=now(),outcome='paused' WHERE job_id=${job} AND finished_at IS NULL`);
   await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'pdf_ocr_paused',${target.document_id})`);
   return{jobId:job,revision,status:'paused'};
  });
 });
 app.post('/api/jobs/:id/pdf-ocr/prioritize',async req=>{
  const job=id.parse((req.params as {id:string}).id);
  const {revision,requestId}=z.object({revision:z.number().int().nonnegative(),requestId:id}).strict().parse(req.body);
  return projectScope(req,{job},[],async(db,project)=>{
   // claim_job holds the same transaction lock. The selected continuation,
   // preempted continuation and complete queue tuple swap commit together.
   await rows(db,sql`SELECT pg_advisory_xact_lock(7843,1)`);
   const [target]=await rows(db,sql`SELECT j.*,d.*,j.id AS job_id,j.revision AS job_revision,d.revision AS current_revision,d.state AS current_state,d.source_format AS current_format,d.source_hash AS current_source_hash,d.content_hash AS current_content_hash
     FROM jobs j JOIN documents d ON d.id=j.document_id AND d.project_id=j.project_id AND d.tenant_id=j.tenant_id
     WHERE j.id=${job} FOR UPDATE OF j,d`);
   if(!target||target.user_id!==req.user.id||target.tenant_id!==req.user.tenant_id||target.project_id!==project)fail('NOT_FOUND',404);
   await requirePermission(db,project,target.required_permissions);
   if(target.kind!=='detect'||target.collab_task_id||target.current_format!=='pdf')fail('PDF_OCR_CONTROL_UNAVAILABLE');
   if(target.current_revision!==revision||target.job_revision!==revision)fail('VERSION_CONFLICT');
   if(target.pdf_ocr_priority_request_id===requestId){
    if(target.pdf_ocr_priority_source_hash!==target.current_source_hash||target.pdf_ocr_priority_content_hash!==target.current_content_hash)fail('PDF_OCR_SOURCE_CHANGED');
    const [selected]=await rows(db,sql`SELECT status FROM jobs WHERE id=${target.pdf_ocr_priority_selected_job_id} AND document_id=${target.document_id} AND revision=${revision}`);
    if(!selected||!['queued','running','succeeded'].includes(selected.status))fail('PDF_OCR_CONTROL_UNAVAILABLE');
    return{jobId:target.pdf_ocr_priority_selected_job_id,revision,status:selected.status,continuationJobId:target.pdf_ocr_priority_continuation_job_id??null,replayed:true};
   }
   const waiting=target.status==='queued'&&!!target.pdf_ocr_parent_job_id;
   if(target.current_state!=='queued'||!(target.status==='cancelled'&&target.error_code==='PDF_OCR_PAUSED'||waiting))fail('PDF_OCR_CONTROL_UNAVAILABLE');
   if((await rows(db,sql`SELECT id FROM jobs WHERE pdf_ocr_priority_request_id=${requestId} AND tenant_id=${req.user.tenant_id} AND project_id=${project} AND user_id=${req.user.id} AND id<>${job}`)).length)fail('PDF_OCR_PRIORITY_REQUEST_CONFLICT');
   const [parent]=waiting?await rows(db,sql`SELECT p.id AS parent_id,p.tenant_id AS parent_tenant_id,p.project_id AS parent_project_id,p.user_id AS parent_user_id,p.document_id AS parent_document_id,p.revision AS parent_revision,p.pdf_ocr_root_job_id AS parent_root_job_id,p.status AS parent_status,p.error_code AS parent_error_code,p.pdf_ocr_pause_binding AS parent_pause_binding,d.*
     FROM jobs p JOIN documents d ON d.id=p.document_id AND d.project_id=p.project_id AND d.tenant_id=p.tenant_id WHERE p.id=${target.pdf_ocr_parent_job_id} FOR UPDATE OF p,d`):[null];
   if(waiting&&(!parent||parent.parent_status!=='cancelled'||parent.parent_error_code!=='PDF_OCR_PRIORITY_PREEMPTED'||parent.parent_tenant_id!==target.tenant_id||parent.parent_project_id!==project||parent.parent_user_id!==target.user_id||parent.parent_document_id!==target.document_id||parent.parent_revision!==revision||target.pdf_ocr_root_job_id!==(parent.parent_root_job_id??parent.parent_id)))fail('PDF_OCR_CONTROL_UNAVAILABLE');
   const currentIdentity=await pauseIdentity(waiting?parent:target).catch(()=>fail('PDF_OCR_SOURCE_CHANGED'));
   if(!sameIdentity(waiting?parent.parent_pause_binding:target.pdf_ocr_pause_binding,currentIdentity))fail('PDF_OCR_SOURCE_CHANGED');
   const [latest]=await rows(db,sql`SELECT id FROM jobs WHERE document_id=${target.document_id} ORDER BY created_at DESC,id DESC LIMIT 1`);
   if(latest?.id!==job)fail('JOB_NOT_LATEST');
   const [authorized]=await rows(db,sql`SELECT job_authorized(${job}::uuid) AS allowed`);
   if(!authorized?.allowed)fail('PERMISSION_REVOKED',403);
   // A paused source has no active slot. Its new continuation initially takes
   // a tail slot; a running same-scope PDF or first queued same-scope PDF
   // exchanges that exact tuple with it, leaving every other job untouched.
   const selectedJobId=waiting?job:randomUUID();
   if(!waiting)await rows(db,sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind,revision,required_permissions,pdf_ocr_root_job_id,pdf_ocr_parent_job_id)
     VALUES(${selectedJobId},${target.tenant_id},${project},${target.document_id},${target.user_id},'detect',${revision},${textArray(target.required_permissions)},${target.pdf_ocr_root_job_id??job},${job})`);
   const [selected]=await rows(db,sql`SELECT available_at,pdf_ocr_slot_id FROM jobs WHERE id=${selectedJobId}`);
   const [running]=await rows(db,sql`SELECT j.id AS job_id,j.document_id,j.tenant_id,j.project_id,j.user_id,j.kind,j.collab_task_id,j.status,j.lease_until,j.generation,j.revision AS job_revision,j.available_at,j.pdf_ocr_slot_id,j.pdf_ocr_root_job_id,j.required_permissions,d.*,d.revision AS current_revision,d.state AS current_state,d.source_format AS current_format
     FROM jobs j JOIN documents d ON d.id=j.document_id AND d.project_id=j.project_id AND d.tenant_id=j.tenant_id
     WHERE j.tenant_id=${req.user.tenant_id} AND j.project_id=${project} AND j.user_id=${req.user.id}
       AND j.id<>${selectedJobId} AND j.kind='detect' AND j.collab_task_id IS NULL AND j.status='running' AND j.lease_until>now()
       AND d.source_format='pdf' AND d.state='queued' AND d.revision=j.revision
     ORDER BY j.available_at,COALESCE(j.pdf_ocr_slot_id,j.id) LIMIT 1 FOR UPDATE OF j,d`);
   let continuationJobId:string|null=null;
   if(running){
    await requirePermission(db,project,running.required_permissions);
    const [runningLatest]=await rows(db,sql`SELECT id FROM jobs WHERE document_id=${running.document_id} ORDER BY created_at DESC,id DESC LIMIT 1`);
    if(runningLatest?.id!==running.job_id)fail('JOB_NOT_LATEST');
    const [runningAuthorized]=await rows(db,sql`SELECT job_authorized(${running.job_id}::uuid) AS allowed`);
    if(!runningAuthorized?.allowed)fail('PERMISSION_REVOKED',403);
    const binding=await pauseIdentity(running);
    const [paused]=await rows(db,sql`UPDATE jobs SET status='cancelled',error_code='PDF_OCR_PRIORITY_PREEMPTED',lease_until=NULL,pdf_ocr_pause_binding=${JSON.stringify(binding)}::jsonb
      WHERE id=${running.job_id} AND generation=${running.generation} AND status='running' RETURNING id`);
    if(!paused)fail('JOB_NOT_ACTIVE');
    await rows(db,sql`UPDATE attempts SET finished_at=now(),outcome='priority-preempt' WHERE job_id=${running.job_id} AND generation=${running.generation} AND finished_at IS NULL`);
    continuationJobId=randomUUID();
    await rows(db,sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind,revision,required_permissions,available_at,pdf_ocr_slot_id,pdf_ocr_root_job_id,pdf_ocr_parent_job_id)
      VALUES(${continuationJobId},${running.tenant_id},${project},${running.document_id},${running.user_id},'detect',${running.job_revision},${textArray(running.required_permissions)},${selected.available_at},${selected.pdf_ocr_slot_id??selectedJobId},${running.pdf_ocr_root_job_id??running.job_id},${running.job_id})`);
    await rows(db,sql`UPDATE jobs SET available_at=${running.available_at},pdf_ocr_slot_id=${running.pdf_ocr_slot_id??running.job_id} WHERE id=${selectedJobId}`);
    await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'pdf_ocr_priority_preempted',${running.document_id})`);
   }else{
    const [first]=await rows(db,sql`SELECT j.id,j.available_at,j.pdf_ocr_slot_id FROM jobs j JOIN documents d ON d.id=j.document_id AND d.project_id=j.project_id AND d.tenant_id=j.tenant_id
      WHERE j.tenant_id=${req.user.tenant_id} AND j.project_id=${project} AND j.user_id=${req.user.id}
       AND j.kind='detect' AND j.collab_task_id IS NULL AND j.status='queued' AND j.available_at<=now()
       AND d.source_format='pdf' AND d.state='queued' AND d.revision=j.revision AND job_authorized(j.id)
      ORDER BY j.available_at,COALESCE(j.pdf_ocr_slot_id,j.id) LIMIT 1 FOR UPDATE OF j`);
    if(first&&first.id!==selectedJobId){
     await rows(db,sql`UPDATE jobs SET available_at=${selected.available_at},pdf_ocr_slot_id=${selected.pdf_ocr_slot_id??selectedJobId} WHERE id=${first.id}`);
     await rows(db,sql`UPDATE jobs SET available_at=${first.available_at},pdf_ocr_slot_id=${first.pdf_ocr_slot_id??first.id} WHERE id=${selectedJobId}`);
    }
   }
   await rows(db,sql`UPDATE jobs SET pdf_ocr_priority_request_id=${requestId},pdf_ocr_priority_selected_job_id=${selectedJobId},pdf_ocr_priority_continuation_job_id=${continuationJobId},pdf_ocr_priority_source_hash=${target.current_source_hash},pdf_ocr_priority_content_hash=${target.current_content_hash} WHERE id=${job}`);
   await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'pdf_ocr_prioritized',${target.document_id})`);
   return{jobId:selectedJobId,revision,status:'queued',continuationJobId,replayed:false};
  });
 });
 app.post('/api/jobs/:id/pdf-ocr/resume',async req=>{
  const job=id.parse((req.params as {id:string}).id),{revision}=revisionSchema.parse(req.body);
  return projectScope(req,{job},[],async(db,project)=>{
   const [target]=await rows(db,sql`SELECT j.*,d.*,j.revision AS job_revision,d.revision AS current_revision,d.state AS current_state,d.source_format AS current_format
     FROM jobs j JOIN documents d ON d.id=j.document_id AND d.project_id=j.project_id AND d.tenant_id=j.tenant_id
     WHERE j.id=${job} FOR UPDATE OF j,d`);
   if(!target||target.user_id!==req.user.id||target.tenant_id!==req.user.tenant_id||target.project_id!==project)fail('NOT_FOUND',404);
   await requirePermission(db,project,target.required_permissions);
   if(target.kind!=='detect'||target.collab_task_id||target.current_format!=='pdf'||target.current_state!=='queued'||target.status!=='cancelled'||target.error_code!=='PDF_OCR_PAUSED')fail('PDF_OCR_CONTROL_UNAVAILABLE');
   if(target.current_revision!==revision||target.job_revision!==revision)fail('VERSION_CONFLICT');
   const currentIdentity=await pauseIdentity(target).catch(()=>fail('PDF_OCR_SOURCE_CHANGED'));
   if(!sameIdentity(target.pdf_ocr_pause_binding,currentIdentity))fail('PDF_OCR_SOURCE_CHANGED');
   const [latest]=await rows(db,sql`SELECT id FROM jobs WHERE document_id=${target.document_id} ORDER BY created_at DESC,id DESC LIMIT 1`);
   if(latest?.id!==job)fail('JOB_NOT_LATEST');
   const [authorized]=await rows(db,sql`SELECT job_authorized(${job}::uuid) AS allowed`);
   if(!authorized?.allowed)fail('PERMISSION_REVOKED',403);
   const next=randomUUID();
   await rows(db,sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind,revision,required_permissions,pdf_ocr_root_job_id,pdf_ocr_parent_job_id)
     VALUES(${next},${target.tenant_id},${project},${target.document_id},${target.user_id},'detect',${revision},${textArray(target.required_permissions)},${target.pdf_ocr_root_job_id??job},${job})`);
   await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'pdf_ocr_resumed',${target.document_id})`);
   return{jobId:next,revision,status:'queued'};
  });
 });
}
