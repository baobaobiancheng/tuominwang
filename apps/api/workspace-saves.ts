import {getProjectMappingRows} from '../../packages/adapters/alias-groups.ts';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createHmac,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {id} from '../../packages/contracts/index.ts';
import {rows,scoped,sql,type DB} from '../../packages/adapters/db.ts';
import {hash,seal,unseal,readOriginal,readArtifact} from '../../packages/adapters/storage.ts';
import {verifiedDocumentSource} from '../../packages/adapters/document-source.ts';
import {projectScope,denied} from './access.ts';
const requestId=z.string().min(1).refine(v=>v.isWellFormed()&&!v.includes('\0'));
const saveInput=z.object({requestId,password:z.string().min(4).max(1024).refine(v=>!!v.trim()),format:z.enum(['native','legacy-zip','secure-v2','secure-v3']).default('native')}).strict();
const digest=(value:string)=>createHmac('sha256',Buffer.from(process.env.DATA_KEY!,'hex')).update('workspace-save\0'+value).digest('hex');
const session=(req:FastifyRequest)=>digest(req.cookies[(process.env.APP_BASE_PATH??'/')==='/'?'session':'tuominwang_session']??'');
const aad=(r:any)=>`${r.tenant_id}:${r.owner_id}:${r.project_id}:${r.id}:${r.session_hash}:${r.snapshot_hash}:workspace-save`;
export async function workspaceSaveFingerprint(db:DB,project:string){
 const [p]=await rows(db,sql`SELECT to_jsonb(p) data FROM projects p WHERE id=${project}`),docs=await rows(db,sql`SELECT to_jsonb(d) data FROM documents d WHERE project_id=${project} ORDER BY id`),mappings=await getProjectMappingRows(db,project,{historical:true}),catalog=await rows(db,sql`SELECT to_jsonb(m) data FROM mapping_library m WHERE project_id=${project} ORDER BY id`),unifiedAliases=await rows(db,sql`SELECT revision,payload FROM unified_alias_state WHERE project_id=${project}`);
 return hash(JSON.stringify({project:p.data,documents:docs.map(r=>r.data),mappings:mappings.sort((a,b)=>a.id.localeCompare(b.id)),catalog,unifiedAliases}));
}
function state(r:any){return{state:r.state,receiptId:r.id,expiresAt:new Date(r.expires_at).toISOString(),...(r.state==='completed'?{receipt:{projectId:r.project_id,savedAt:new Date(r.completed_at??r.created_at).toISOString(),snapshotHash:r.snapshot_hash,format:r.format,sha256:r.output_hash},sha256:r.output_hash,downloadPath:`/api/projects/${r.project_id}/portable/saves/${r.id}/download`}:{}),...(r.state==='failed'?{error:r.error_code}: {})};}
export function registerWorkspaceSaveRoutes(app:FastifyInstance){
 const instance=randomUUID(),pending=new Set<Promise<void>>();app.addHook('onClose',async()=>{await Promise.allSettled([...pending]);});
 app.post('/api/projects/:id/portable/save',async req=>{
  const project=id.parse((req.params as any).id),input=saveInput.parse(req.body),sessionHash=session(req),requestHash=digest(input.requestId),inputHash=digest(JSON.stringify({project,password:input.password,format:input.format}));
  const result=await projectScope(req,{project},['view_original','view_mapping','export'],async db=>{
   await rows(db,sql`DELETE FROM workspace_save_receipts WHERE expires_at<=now()`);
   const existing=(await rows(db,sql`SELECT * FROM workspace_save_receipts WHERE request_hash=${requestHash} FOR UPDATE`))[0];
   if(existing){if(existing.session_hash!==sessionHash||existing.input_hash!==inputHash||existing.project_id!==project)denied('WORKSPACE_SAVE_REQUEST_CONFLICT',409);if(existing.state==='running'&&existing.run_instance!==instance){await rows(db,sql`UPDATE workspace_save_receipts SET state='failed',error_code='WORKSPACE_SAVE_INTERRUPTED' WHERE id=${existing.id} AND state='running'`);existing.state='failed';existing.error_code='WORKSPACE_SAVE_INTERRUPTED';}return{row:existing,fresh:false};}
   const receipt=randomUUID(),snapshot=await workspaceSaveFingerprint(db,project);
   await rows(db,sql`INSERT INTO workspace_save_receipts(id,tenant_id,owner_id,project_id,run_instance,request_hash,session_hash,input_hash,snapshot_hash,format,state) VALUES(${receipt},${req.user.tenant_id},${req.user.id},${project},${instance},${requestHash},${sessionHash},${inputHash},${snapshot},${input.format},'running') ON CONFLICT(tenant_id,owner_id,request_hash) DO NOTHING`);
   const [row]=await rows(db,sql`SELECT * FROM workspace_save_receipts WHERE request_hash=${requestHash} FOR UPDATE`);
   if(row.id!==receipt){if(row.session_hash!==sessionHash||row.input_hash!==inputHash||row.project_id!==project)denied('WORKSPACE_SAVE_REQUEST_CONFLICT',409);return{row,fresh:false};}
   await rows(db,sql`DELETE FROM workspace_save_receipts WHERE id IN(SELECT id FROM workspace_save_receipts ORDER BY created_at DESC,id DESC OFFSET 100)`);
   return{row,fresh:true};
  });
  if(result.fresh){const row=result.row,cookie=req.headers.cookie??'',origin=req.headers.origin;const work=new Promise<void>(resolve=>setImmediate(resolve)).then(async()=>{
    try{const response=await app.inject({method:'POST',url:`/api/projects/${project}/portable/export`,headers:{cookie,...origin?{origin}:{}},payload:{password:input.password,format:input.format,expectedSnapshot:row.snapshot_hash}});
     if(response.statusCode!==200){let code='WORKSPACE_SAVE_FAILED';try{const error=response.json().error;if(typeof error==='string'&&/^[A-Z][A-Z0-9_]{0,100}$/.test(error))code=error;}catch{}throw new Error(code);}
     const bytes=response.rawPayload,outputHash=hash(bytes);if(!bytes.length)throw new Error('WORKSPACE_SAVE_EMPTY');
     await scoped(row.owner_id,row.tenant_id,async db=>{await rows(db,sql`UPDATE workspace_save_receipts SET state='completed',completed_at=now(),payload=${seal(bytes.toString('base64'),aad(row))},output_hash=${outputHash} WHERE id=${row.id} AND state='running' AND expires_at>now()`);});
    }catch(error){const message=(error as Error).message,code=/^[A-Z][A-Z0-9_]{0,100}$/.test(message)?message:'WORKSPACE_SAVE_FAILED';await scoped(row.owner_id,row.tenant_id,async db=>{await rows(db,sql`UPDATE workspace_save_receipts SET state='failed',error_code=${code} WHERE id=${row.id} AND state='running'`);});}
   }).catch(()=>{}).finally(()=>pending.delete(work));pending.add(work);}
  return state(result.row);
 });
 app.post('/api/projects/:id/portable/save-result',async req=>{const project=id.parse((req.params as any).id),input=z.object({requestId}).strict().parse(req.body);return projectScope(req,{project},['view_original','view_mapping','export'],async db=>{const[r]=await rows(db,sql`SELECT * FROM workspace_save_receipts WHERE request_hash=${digest(input.requestId)} AND project_id=${project} AND expires_at>now()`);if(!r||r.session_hash!==session(req))return{state:'missing'};if(r.state==='running'&&r.run_instance!==instance){await rows(db,sql`UPDATE workspace_save_receipts SET state='failed',error_code='WORKSPACE_SAVE_INTERRUPTED' WHERE id=${r.id} AND state='running'`);r.state='failed';r.error_code='WORKSPACE_SAVE_INTERRUPTED';}return state(r);});});
 app.get('/api/projects/:id/portable/saves/:receipt/download',async(req,reply)=>{const project=id.parse((req.params as any).id),receipt=id.parse((req.params as any).receipt);return projectScope(req,{project},['view_original','view_mapping','export'],async db=>{const[r]=await rows(db,sql`SELECT * FROM workspace_save_receipts WHERE id=${receipt} AND project_id=${project} AND expires_at>now()`);if(!r||r.session_hash!==session(req))denied('WORKSPACE_SAVE_NOT_FOUND',404);if(r.state!=='completed')denied('WORKSPACE_SAVE_NOT_COMPLETE',409);if(await workspaceSaveFingerprint(db,project)!==r.snapshot_hash)denied('VERSION_CONFLICT',409);
   for(const d of await rows(db,sql`SELECT * FROM documents WHERE project_id=${project}`)){const content=unseal(d.content,`${d.tenant_id}:${project}:${d.id}`);if(hash(content)!==d.content_hash)denied('SOURCE_MISMATCH',409);if(d.source_id){const source=await readOriginal(d.source_id);if(hash(source)!==d.source_hash)denied('SOURCE_MISMATCH',409);}if(d.unlocked_source_id||d.normalized_source_id){try{await verifiedDocumentSource(d);}catch{denied('SOURCE_MISMATCH',409);}}for(const page of d.page_data??[]){if(hash(await readOriginal(page.previewId))!==page.previewHash||hash(await readArtifact(page.mapId))!==page.mapHash)denied('SOURCE_MISMATCH',409);}}
   let bytes:Buffer;try{bytes=Buffer.from(unseal(r.payload,aad(r)),'base64');}catch{denied('WORKSPACE_SAVE_HASH_MISMATCH',409);}if(hash(bytes)!==r.output_hash)denied('WORKSPACE_SAVE_HASH_MISMATCH',409);return reply.type('application/octet-stream').header('Cache-Control','no-store').header('Content-Disposition',`attachment; filename="tuominwang-workspace.${r.format==='native'?'tmw':'tmm'}"`).send(bytes);
 });});
}
