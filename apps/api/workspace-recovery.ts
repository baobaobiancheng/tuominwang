import{rememberWorkspaceRecent,openWorkspaceRecent}from'../../packages/adapters/workspace-recents.ts';
import type {FastifyInstance} from 'fastify';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {id,reviewSchema,REVIEW_BODY_BYTES,FILE_MAX_BYTES} from '../../packages/contracts/index.ts';
import {scoped,rows,sql} from '../../packages/adapters/db.ts';
import {hash,seal,unseal} from '../../packages/adapters/storage.ts';
import {verifiedDocumentSource} from '../../packages/adapters/document-source.ts';
import {validateFileMarks} from '../../packages/core/files.ts';
import {reviewMarks} from '../../packages/core/redaction.ts';
import {validatePageReview} from '../../packages/core/page-redaction.ts';
import {mappingsForMarks} from './mappings.ts';
import {projectScope,requirePermission} from './access.ts';
import {listRecoverablePdfOcrCheckpoints} from '../../packages/adapters/pdf-ocr-checkpoints.ts';
import {workspaceSaveFingerprint} from './workspace-saves.ts';
import {baseContent} from './markdown-manual-draft.ts';
function fail(code:string,statusCode=409):never{throw Object.assign(new Error(code),{statusCode});}
function receipt(row:any){return {id:row.id,projectId:row.project_id,documentId:row.document_id,revision:row.revision,documentRevision:row.document_revision,savedAt:new Date(row.saved_at).toISOString()};}
const writerInput=z.object({writerId:id,token:z.string().regex(/^[0-9a-f]{64}$/u),epoch:z.number().int().positive(),sequence:z.number().int().nonnegative().safe()}).strict();
const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
function sameWriter(row:any,input:z.infer<typeof writerInput>){const actual=Buffer.from(row.token_hash,'hex'),claimed=Buffer.from(tokenHash(input.token),'hex');return row.writer_id===input.writerId&&row.writer_epoch===input.epoch&&actual.length===claimed.length&&timingSafeEqual(actual,claimed);}
async function lockedWriter(db:any,doc:string,user:string,input:z.infer<typeof writerInput>){const [writer]=await rows(db,sql`SELECT * FROM workspace_recovery_writers WHERE document_id=${doc} AND user_id=${user} FOR UPDATE`);if(!writer||!sameWriter(writer,input))fail('RECOVERY_WRITER_CONFLICT');return writer;}
const leaseSeconds=45;
const manualRecoverySchema=z.object({basis:z.object({kind:z.enum(['original-markdown','markdown-output','converted-text']),hash:z.string().regex(/^[a-f0-9]{64}$/),artifactId:id.optional()}).strict().refine(v=>v.kind==='markdown-output'?!!v.artifactId:v.artifactId===undefined),draftRevision:z.number().int().nonnegative(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/).nullable(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),content:z.string().max(FILE_MAX_BYTES).refine(v=>v.isWellFormed()&&Buffer.byteLength(v,'utf8')<=FILE_MAX_BYTES),fileName:z.string().max(1000).refine(v=>v.isWellFormed()&&!/[\\/\0\r\n]/u.test(v))}).strict();
const recoveryDraftSchema=reviewSchema.extend({manualDraft:manualRecoverySchema.nullable().optional()});
async function validateManualRecovery(db:any,d:any,text:string,user:string,manual:z.infer<typeof manualRecoverySchema>){
 if(d.source_hash!==manual.sourceHash||d.content_hash!==manual.contentHash)fail('RECOVERY_OUTDATED');
 const[head]=await rows(db,sql`SELECT revision FROM markdown_manual_draft_heads WHERE document_id=${d.id} AND owner_id=${user}`);
 if((head?.revision??0)!==manual.draftRevision)fail('MARKDOWN_DRAFT_CONFLICT');
 const base=await baseContent(db,d,text,manual.basis.kind,manual.basis.artifactId);if(hash(base)!==manual.basis.hash)fail('MARKDOWN_DRAFT_BASE_MISMATCH');
}
const projectRecoveryVersions=z.object({snapshotHash:z.string().regex(/^[a-f0-9]{64}$/),entries:z.array(z.object({documentId:id,recoveryRevision:z.number().int().positive()}).strict()).min(1)}).strict();
function exactProjectRecoveryVersions(actual:any[],expected:z.infer<typeof projectRecoveryVersions>['entries']){
 if(actual.length!==expected.length||new Set(expected.map(e=>e.documentId)).size!==expected.length)fail('RECOVERY_CONFLICT');
 const byDocument=new Map(expected.map(e=>[e.documentId,e.recoveryRevision]));
 for(const row of actual)if(byDocument.get(row.document_id)!==row.revision)fail('RECOVERY_CONFLICT');
}
async function projectRecoveryRows(db:any,project:string,user:string,lock=false){return rows(db,lock?sql`SELECT * FROM workspace_recoveries WHERE project_id=${project} AND user_id=${user} ORDER BY document_id FOR UPDATE`:sql`SELECT * FROM workspace_recoveries WHERE project_id=${project} AND user_id=${user} ORDER BY document_id`);}

export function registerWorkspaceRecoveryRoutes(app:FastifyInstance){
 // The cloud project and committed document rows are the durable part of the
 // original workspace snapshot. These routes bind every unsaved editor draft
 // to one project version and read or discard the complete set atomically.
 app.get('/api/projects/:id/workspace/recovery',async req=>{const project=id.parse((req.params as any).id);return projectScope(req,{project},['view_original','review'],async db=>{const [p]=await rows(db,sql`SELECT name FROM projects WHERE id=${project}`),drafts=await projectRecoveryRows(db,project,req.user.id),docs=await rows(db,sql`SELECT id,source_name,source_format FROM documents WHERE project_id=${project} ORDER BY id`),[recent]=await rows(db,sql`SELECT document_id FROM workspace_recents WHERE project_id=${project} AND user_id=${req.user.id}`),names=new Map(docs.map(d=>[d.id,d.source_name?unseal(d.source_name,`${req.user.tenant_id}:${project}:${d.id}:name`):'未命名材料']));return{projectId:project,projectName:p.name,documentCount:docs.length,activeDocumentId:names.has(recent?.document_id)?recent.document_id:null,snapshotHash:await workspaceSaveFingerprint(db,project),entries:drafts.map(d=>({...receipt(d),name:names.get(d.document_id)}))};});});
 app.post('/api/projects/:id/workspace/recovery/open',async req=>{const project=id.parse((req.params as any).id),input=projectRecoveryVersions.parse(req.body);return projectScope(req,{project},['view_original','review'],async db=>{
  if(await workspaceSaveFingerprint(db,project)!==input.snapshotHash)fail('VERSION_CONFLICT');const records=await projectRecoveryRows(db,project,req.user.id);exactProjectRecoveryVersions(records,input.entries);const drafts=[];
  for(const r of records){const[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${r.document_id} AND project_id=${project} FOR SHARE`);if(!d)fail('NOT_FOUND',404);if(d.revision!==r.document_revision||d.content_hash!==r.content_hash||d.source_hash!==r.source_hash)fail('RECOVERY_OUTDATED');if(d.source_id)await verifiedDocumentSource(d);const text=unseal(d.content,`${d.tenant_id}:${project}:${d.id}`);if(hash(text)!==r.content_hash)fail('SOURCE_MISMATCH');const draft=recoveryDraftSchema.parse(JSON.parse(unseal(r.payload,`${d.tenant_id}:${project}:${d.id}:${r.id}:recovery`)));if(draft.marks.some(m=>m.replacement?.mode==='alias'))await requirePermission(db,project,['view_mapping']);await mappingsForMarks(db,d,draft.marks,req.user.id);if(draft.manualDraft){await requirePermission(db,project,['export']);await validateManualRecovery(db,d,text,req.user.id,draft.manualDraft);}drafts.push({...receipt(r),draft});}
  const[recent]=await rows(db,sql`SELECT r.document_id FROM workspace_recents r JOIN documents d ON d.id=r.document_id AND d.project_id=${project} WHERE r.project_id=${project} AND r.user_id=${req.user.id}`);return{projectId:project,snapshotHash:input.snapshotHash,activeDocumentId:recent?.document_id??null,entries:drafts};
 });});
 app.delete('/api/projects/:id/workspace/recovery',async req=>{const project=id.parse((req.params as any).id),input=projectRecoveryVersions.parse(req.body);return projectScope(req,{project},['view_original','review'],async db=>{
  if(await workspaceSaveFingerprint(db,project)!==input.snapshotHash)fail('VERSION_CONFLICT');const records=await projectRecoveryRows(db,project,req.user.id,true);exactProjectRecoveryVersions(records,input.entries);await rows(db,sql`DELETE FROM workspace_recoveries WHERE project_id=${project} AND user_id=${req.user.id}`);return{ok:true,discarded:records.length};
 });});
 app.get('/api/workspace/recent',async req=>scoped(req.user.id,req.user.tenant_id,async db=>(await rows(db,sql`SELECT r.project_id AS "projectId",r.document_id AS "documentId",p.name,r.opened_at AS "openedAt",r.saved_at,r.metadata FROM workspace_recents r JOIN projects p ON p.id=r.project_id WHERE r.user_id=${req.user.id} ORDER BY r.opened_at DESC`)).map(row=>openWorkspaceRecent(req.user,row))));
 app.post('/api/projects/:id/workspace/recent',async req=>{const project=id.parse((req.params as any).id),input=z.object({documentId:id.nullable().optional()}).strict().parse(req.body);return projectScope(req,{project},['view_original'],async db=>{
  if(input.documentId&&!(await rows(db,sql`SELECT id FROM documents WHERE id=${input.documentId} AND project_id=${project}`)).length)fail('NOT_FOUND',404);
  await rememberWorkspaceRecent(db,req.user,project,input);return {ok:true};
 });});
 app.delete('/api/projects/:id/workspace/recent',async req=>{const project=id.parse((req.params as any).id);return projectScope(req,{project},['view_original'],async db=>{await rows(db,sql`DELETE FROM workspace_recents WHERE project_id=${project} AND user_id=${req.user.id}`);return {ok:true};});});
 app.get('/api/workspace/recoveries',async req=>scoped(req.user.id,req.user.tenant_id,async db=>(await rows(db,sql`SELECT r.*,d.source_name,p.name AS project_name FROM workspace_recoveries r JOIN documents d ON d.id=r.document_id JOIN projects p ON p.id=r.project_id WHERE r.user_id=${req.user.id} ORDER BY r.saved_at DESC`)).map(r=>({...receipt(r),name:r.source_name?unseal(r.source_name,`${r.tenant_id}:${r.project_id}:${r.document_id}:name`):'未命名材料',projectName:r.project_name}))));
 app.get('/api/workspace/recovery-prompts',async req=>{
  const projects=await scoped(req.user.id,req.user.tenant_id,async db=>rows(db,sql`SELECT DISTINCT project_id FROM workspace_recoveries WHERE user_id=${req.user.id} UNION SELECT DISTINCT project_id FROM jobs WHERE user_id=${req.user.id} AND kind='detect' AND status IN('failed','cancelled')`));
  const prompts:Array<Record<string,unknown>>=[];
  for(const item of projects){
   const project=item.project_id as string;
   try{await projectScope(req,{project},['view_original'],async db=>{
    const interrupted=await listRecoverablePdfOcrCheckpoints(db,req.user.id,project);
    for(const candidate of interrupted)prompts.push({kind:'pdf_ocr_interrupted',stage:candidate.stage,projectId:project,documentId:candidate.documentId,documentRevision:candidate.revision,jobId:candidate.jobId,completedPages:candidate.completedPages.length,totalPages:candidate.totalPages,action:'retry-detect'});
   });}catch(error){if(![403,404].includes((error as {statusCode?:number}).statusCode??0))throw error;}
   try{await projectScope(req,{project},['view_original','review'],async db=>{
    const drafts=await rows(db,sql`SELECT d.*,r.id AS recovery_id,r.payload AS recovery_payload,r.revision AS recovery_revision,r.document_revision AS recovery_document_revision,r.content_hash AS recovery_content_hash,r.source_hash AS recovery_source_hash FROM workspace_recoveries r JOIN workspace_recovery_writers w ON w.document_id=r.document_id AND w.user_id=r.user_id JOIN documents d ON d.id=r.document_id WHERE r.project_id=${project} AND r.user_id=${req.user.id} AND w.clean_at IS NULL AND w.lease_until<now() AND w.acked_sequence>0 AND w.acked_recovery_revision=r.revision AND d.state='review' AND d.revision=r.document_revision AND d.content_hash=r.content_hash AND d.source_hash IS NOT DISTINCT FROM r.source_hash ORDER BY r.saved_at DESC`);
    for(const row of drafts){
     try{if(row.source_id)await verifiedDocumentSource(row);const canonical=unseal(row.content,`${row.tenant_id}:${project}:${row.id}`);if(hash(canonical)!==row.recovery_content_hash)continue;const draft=recoveryDraftSchema.parse(JSON.parse(unseal(row.recovery_payload,`${row.tenant_id}:${project}:${row.id}:${row.recovery_id}:recovery`)));if(draft.marks.some(m=>m.replacement?.mode==='alias'))await requirePermission(db,project,['view_mapping']);await mappingsForMarks(db,row,draft.marks,req.user.id);if(draft.manualDraft){await requirePermission(db,project,['export']);await validateManualRecovery(db,row,canonical,req.user.id,draft.manualDraft);}prompts.push({kind:'editor_unconfirmed',projectId:project,documentId:row.id,documentRevision:row.recovery_document_revision,recoveryRevision:row.recovery_revision,action:'open-draft'});}
     catch{/* An unreadable/unauthorized draft remains in the manual list, never a recoverable prompt. */}
    }
   });}catch(error){if(![403,404].includes((error as {statusCode?:number}).statusCode??0))throw error;}
  }
  return prompts;
 });
 app.post('/api/documents/:id/recovery/writer',async req=>{const doc=id.parse((req.params as any).id),input=z.object({recoveryRevision:z.number().int().nonnegative()}).strict().parse(req.body);return projectScope(req,{document:doc},['view_original','review'],async db=>{
  const[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc} FOR SHARE`);if(!d||d.state!=='review')fail('DETECTION_INCOMPLETE');
  const[r]=await rows(db,sql`SELECT revision FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id} FOR UPDATE`);if((r?.revision??0)!==input.recoveryRevision)fail('RECOVERY_CONFLICT');
  const writerId=randomUUID(),token=randomBytes(32).toString('hex');
  const[claimed]=await rows(db,sql`INSERT INTO workspace_recovery_writers(tenant_id,project_id,user_id,document_id,writer_id,token_hash,writer_epoch,acked_recovery_revision,acked_sequence,lease_until,clean_at) VALUES(${d.tenant_id},${d.project_id},${req.user.id},${doc},${writerId},${tokenHash(token)},1,${input.recoveryRevision},0,now()+(${leaseSeconds}::integer*interval '1 second'),NULL) ON CONFLICT(document_id,user_id) DO UPDATE SET writer_id=excluded.writer_id,token_hash=excluded.token_hash,writer_epoch=workspace_recovery_writers.writer_epoch+1,acked_recovery_revision=excluded.acked_recovery_revision,acked_sequence=0,lease_until=excluded.lease_until,clean_at=NULL RETURNING writer_epoch`);
  return{writerId,token,epoch:claimed.writer_epoch,sequence:0,recoveryRevision:input.recoveryRevision,leaseSeconds};
 });});
 app.post('/api/documents/:id/recovery/writer/heartbeat',async req=>{const doc=id.parse((req.params as any).id),input=z.object({writer:writerInput,recoveryRevision:z.number().int().nonnegative()}).strict().parse(req.body);return projectScope(req,{document:doc},['view_original','review'],async db=>{const[r]=await rows(db,sql`SELECT revision FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id} FOR UPDATE`),writer=await lockedWriter(db,doc,req.user.id,input.writer);if((r?.revision??0)!==input.recoveryRevision||writer.acked_recovery_revision!==input.recoveryRevision||Number(writer.acked_sequence)!==input.writer.sequence||writer.clean_at)fail('RECOVERY_WRITER_CONFLICT');await rows(db,sql`UPDATE workspace_recovery_writers SET lease_until=now()+(${leaseSeconds}::integer*interval '1 second') WHERE document_id=${doc} AND user_id=${req.user.id}`);return{ok:true,leaseSeconds};});});
 app.post('/api/documents/:id/recovery/writer/close',async req=>{const doc=id.parse((req.params as any).id),input=z.object({writer:writerInput,recoveryRevision:z.number().int().nonnegative()}).strict().parse(req.body);return projectScope(req,{document:doc},['view_original','review'],async db=>{const[r]=await rows(db,sql`SELECT revision FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id} FOR UPDATE`),writer=await lockedWriter(db,doc,req.user.id,input.writer);if((r?.revision??0)!==input.recoveryRevision||writer.acked_recovery_revision!==input.recoveryRevision||Number(writer.acked_sequence)!==input.writer.sequence)fail('RECOVERY_WRITER_CONFLICT');await rows(db,sql`UPDATE workspace_recovery_writers SET clean_at=now(),lease_until=now() WHERE document_id=${doc} AND user_id=${req.user.id}`);return{ok:true,clean:true,ackedRevision:input.recoveryRevision,ackedSequence:input.writer.sequence};});});
 app.get('/api/documents/:id/recovery',async req=>{const doc=id.parse((req.params as any).id);return projectScope(req,{document:doc},['view_original','review'],async db=>{const [r]=await rows(db,sql`SELECT * FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id}`);return r?receipt(r):null;});});
 app.put('/api/documents/:id/recovery',{bodyLimit:REVIEW_BODY_BYTES+FILE_MAX_BYTES+2048},async req=>{
  const doc=id.parse((req.params as any).id),body=z.object({recoveryRevision:z.number().int().nonnegative(),draft:recoveryDraftSchema,writer:writerInput.optional()}).strict().parse(req.body);
  return projectScope(req,{document:doc},['view_original','review'],async db=>{
   const [d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc} FOR SHARE`);if(d.revision!==body.draft.revision)fail('VERSION_CONFLICT');if(d.state!=='review')fail('DETECTION_INCOMPLETE');
   const text=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);if(hash(text)!==d.content_hash)fail('SOURCE_MISMATCH');
   const marks=reviewMarks(d.marks,body.draft.marks);try{validateFileMarks(text,marks.map(m=>({...m,decision:'pending'})),d.source_format,d.anchors);if(body.draft.pageReview)validatePageReview(body.draft.pageReview,d.page_data);}catch(e){fail((e as Error).message,400);}
   if(marks.some(m=>m.replacement?.mode==='alias'))await requirePermission(db,d.project_id,['view_mapping']);await mappingsForMarks(db,d,marks,req.user.id);
   const [old]=await rows(db,sql`SELECT * FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id} FOR UPDATE`);if((old?.revision??0)!==body.recoveryRevision)fail('RECOVERY_CONFLICT');
   const [writer]=await rows(db,sql`SELECT * FROM workspace_recovery_writers WHERE document_id=${doc} AND user_id=${req.user.id} FOR UPDATE`);
   if(writer){if(!body.writer||!sameWriter(writer,body.writer)||writer.clean_at||writer.acked_recovery_revision!==body.recoveryRevision||Number(writer.acked_sequence)+1!==body.writer.sequence)fail('RECOVERY_WRITER_CONFLICT');}
   else if(body.writer)fail('RECOVERY_WRITER_CONFLICT');
   const previous=old?recoveryDraftSchema.parse(JSON.parse(unseal(old.payload,`${d.tenant_id}:${d.project_id}:${doc}:${old.id}:recovery`))):null;
   const manual=body.draft.manualDraft===undefined?previous?.manualDraft:body.draft.manualDraft;
   if(manual){await requirePermission(db,d.project_id,['export']);if(d.source_id)await verifiedDocumentSource(d);await validateManualRecovery(db,d,text,req.user.id,manual);}
   const recovery=old?.id??randomUUID(),payload=seal(JSON.stringify({...body.draft,marks,...(manual===undefined?{}:{manualDraft:manual})}),`${d.tenant_id}:${d.project_id}:${doc}:${recovery}:recovery`);
   const [saved]=await rows(db,sql`INSERT INTO workspace_recoveries(id,tenant_id,project_id,user_id,document_id,document_revision,source_hash,content_hash,payload) VALUES(${recovery},${d.tenant_id},${d.project_id},${req.user.id},${doc},${d.revision},${d.source_hash},${d.content_hash},${payload}) ON CONFLICT(document_id,user_id) DO UPDATE SET revision=workspace_recoveries.revision+1,document_revision=excluded.document_revision,source_hash=excluded.source_hash,content_hash=excluded.content_hash,payload=excluded.payload,saved_at=now() RETURNING *`);
   if(writer)await rows(db,sql`UPDATE workspace_recovery_writers SET acked_recovery_revision=${saved.revision},acked_sequence=${body.writer!.sequence},lease_until=now()+(${leaseSeconds}::integer*interval '1 second') WHERE document_id=${doc} AND user_id=${req.user.id}`);
   return receipt(saved);
  });
 });
 app.post('/api/documents/:id/recovery/open',async req=>{const doc=id.parse((req.params as any).id),input=z.object({recoveryRevision:z.number().int().positive()}).strict().parse(req.body);return projectScope(req,{document:doc},['view_original','review'],async db=>{
  const [d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc} FOR SHARE`),[r]=await rows(db,sql`SELECT * FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id}`);if(!r)fail('NOT_FOUND',404);if(r.revision!==input.recoveryRevision)fail('RECOVERY_CONFLICT');if(d.revision!==r.document_revision||d.content_hash!==r.content_hash||d.source_hash!==r.source_hash)fail('RECOVERY_OUTDATED');
  if(d.source_id)await verifiedDocumentSource(d);if(hash(unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`))!==r.content_hash)fail('SOURCE_MISMATCH');
  const text=unseal(d.content,`${d.tenant_id}:${d.project_id}:${doc}`),draft=recoveryDraftSchema.parse(JSON.parse(unseal(r.payload,`${d.tenant_id}:${d.project_id}:${doc}:${r.id}:recovery`)));if(draft.marks.some(m=>m.replacement?.mode==='alias'))await requirePermission(db,d.project_id,['view_mapping']);await mappingsForMarks(db,d,draft.marks,req.user.id);if(draft.manualDraft){await requirePermission(db,d.project_id,['export']);await validateManualRecovery(db,d,text,req.user.id,draft.manualDraft);}return {...receipt(r),draft};
 });});
 app.delete('/api/documents/:id/recovery',async req=>{const doc=id.parse((req.params as any).id),input=z.object({recoveryRevision:z.number().int().positive()}).strict().parse(req.body);return projectScope(req,{document:doc},['view_original','review'],async db=>{
  const [r]=await rows(db,sql`DELETE FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id} AND revision=${input.recoveryRevision} RETURNING id`);if(!r)fail('RECOVERY_CONFLICT');return {ok:true};
 });});
}
