import type {FastifyInstance} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {id,reviewSchema,REVIEW_BODY_BYTES} from '../../packages/contracts/index.ts';
import {scoped,rows,sql} from '../../packages/adapters/db.ts';
import {hash,seal,unseal} from '../../packages/adapters/storage.ts';
import {verifiedDocumentSource} from '../../packages/adapters/document-source.ts';
import {validateFileMarks} from '../../packages/core/files.ts';
import {reviewMarks} from '../../packages/core/redaction.ts';
import {validatePageReview} from '../../packages/core/page-redaction.ts';
import {mappingsForMarks} from './mappings.ts';
import {projectScope,requirePermission} from './access.ts';
function fail(code:string,statusCode=409):never{throw Object.assign(new Error(code),{statusCode});}
function receipt(row:any){return {id:row.id,projectId:row.project_id,documentId:row.document_id,revision:row.revision,documentRevision:row.document_revision,savedAt:new Date(row.saved_at).toISOString()};}
export function registerWorkspaceRecoveryRoutes(app:FastifyInstance){
 app.get('/api/workspace/recent',async req=>scoped(req.user.id,req.user.tenant_id,db=>rows(db,sql`SELECT r.project_id AS "projectId",r.document_id AS "documentId",p.name,r.opened_at AS "openedAt" FROM workspace_recents r JOIN projects p ON p.id=r.project_id WHERE r.user_id=${req.user.id} ORDER BY r.opened_at DESC`)));
 app.post('/api/projects/:id/workspace/recent',async req=>{const project=id.parse((req.params as any).id),input=z.object({documentId:id.nullable().optional()}).strict().parse(req.body);return projectScope(req,{project},['view_original'],async db=>{
  if(input.documentId&&!(await rows(db,sql`SELECT id FROM documents WHERE id=${input.documentId} AND project_id=${project}`)).length)fail('NOT_FOUND',404);
  await rows(db,sql`INSERT INTO workspace_recents(tenant_id,project_id,user_id,document_id) VALUES(${req.user.tenant_id},${project},${req.user.id},${input.documentId??null}) ON CONFLICT(project_id,user_id) DO UPDATE SET document_id=excluded.document_id,opened_at=now()`);return {ok:true};
 });});
 app.delete('/api/projects/:id/workspace/recent',async req=>{const project=id.parse((req.params as any).id);return projectScope(req,{project},['view_original'],async db=>{await rows(db,sql`DELETE FROM workspace_recents WHERE project_id=${project} AND user_id=${req.user.id}`);return {ok:true};});});
 app.get('/api/workspace/recoveries',async req=>scoped(req.user.id,req.user.tenant_id,async db=>(await rows(db,sql`SELECT r.*,d.source_name,p.name AS project_name FROM workspace_recoveries r JOIN documents d ON d.id=r.document_id JOIN projects p ON p.id=r.project_id WHERE r.user_id=${req.user.id} ORDER BY r.saved_at DESC`)).map(r=>({...receipt(r),name:r.source_name?unseal(r.source_name,`${r.tenant_id}:${r.project_id}:${r.document_id}:name`):'未命名材料',projectName:r.project_name}))));
 app.get('/api/documents/:id/recovery',async req=>{const doc=id.parse((req.params as any).id);return projectScope(req,{document:doc},['view_original','review'],async db=>{const [r]=await rows(db,sql`SELECT * FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id}`);return r?receipt(r):null;});});
 app.put('/api/documents/:id/recovery',{bodyLimit:REVIEW_BODY_BYTES},async req=>{
  const doc=id.parse((req.params as any).id),body=z.object({recoveryRevision:z.number().int().nonnegative(),draft:reviewSchema}).strict().parse(req.body);
  return projectScope(req,{document:doc},['view_original','review'],async db=>{
   const [d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc} FOR SHARE`);if(d.revision!==body.draft.revision)fail('VERSION_CONFLICT');if(d.state!=='review')fail('DETECTION_INCOMPLETE');
   const text=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);if(hash(text)!==d.content_hash)fail('SOURCE_MISMATCH');
   const marks=reviewMarks(d.marks,body.draft.marks);try{validateFileMarks(text,marks.map(m=>({...m,decision:'pending'})),d.source_format,d.anchors);if(body.draft.pageReview)validatePageReview(body.draft.pageReview,d.page_data);}catch(e){fail((e as Error).message,400);}
   if(marks.some(m=>m.replacement?.mode==='alias'))await requirePermission(db,d.project_id,['view_mapping']);await mappingsForMarks(db,d,marks,req.user.id);
   const [old]=await rows(db,sql`SELECT * FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id} FOR UPDATE`);if((old?.revision??0)!==body.recoveryRevision)fail('RECOVERY_CONFLICT');
   const recovery=old?.id??randomUUID(),payload=seal(JSON.stringify({...body.draft,marks}),`${d.tenant_id}:${d.project_id}:${doc}:${recovery}:recovery`);
   const [saved]=await rows(db,sql`INSERT INTO workspace_recoveries(id,tenant_id,project_id,user_id,document_id,document_revision,source_hash,content_hash,payload) VALUES(${recovery},${d.tenant_id},${d.project_id},${req.user.id},${doc},${d.revision},${d.source_hash},${d.content_hash},${payload}) ON CONFLICT(document_id,user_id) DO UPDATE SET revision=workspace_recoveries.revision+1,document_revision=excluded.document_revision,source_hash=excluded.source_hash,content_hash=excluded.content_hash,payload=excluded.payload,saved_at=now() RETURNING *`);
   return receipt(saved);
  });
 });
 app.post('/api/documents/:id/recovery/open',async req=>{const doc=id.parse((req.params as any).id),input=z.object({recoveryRevision:z.number().int().positive()}).strict().parse(req.body);return projectScope(req,{document:doc},['view_original','review'],async db=>{
  const [d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc} FOR SHARE`),[r]=await rows(db,sql`SELECT * FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id}`);if(!r)fail('NOT_FOUND',404);if(r.revision!==input.recoveryRevision)fail('RECOVERY_CONFLICT');if(d.revision!==r.document_revision||d.content_hash!==r.content_hash||d.source_hash!==r.source_hash)fail('RECOVERY_OUTDATED');
  if(d.source_id)await verifiedDocumentSource(d);if(hash(unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`))!==r.content_hash)fail('SOURCE_MISMATCH');
  const draft=reviewSchema.parse(JSON.parse(unseal(r.payload,`${d.tenant_id}:${d.project_id}:${doc}:${r.id}:recovery`)));if(draft.marks.some(m=>m.replacement?.mode==='alias'))await requirePermission(db,d.project_id,['view_mapping']);await mappingsForMarks(db,d,draft.marks,req.user.id);return {...receipt(r),draft};
 });});
 app.delete('/api/documents/:id/recovery',async req=>{const doc=id.parse((req.params as any).id),input=z.object({recoveryRevision:z.number().int().positive()}).strict().parse(req.body);return projectScope(req,{document:doc},['view_original','review'],async db=>{
  const [r]=await rows(db,sql`DELETE FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id} AND revision=${input.recoveryRevision} RETURNING id`);if(!r)fail('RECOVERY_CONFLICT');return {ok:true};
 });});
}
