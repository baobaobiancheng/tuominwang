import {getProjectMappingRows} from '../../packages/adapters/alias-groups.ts';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createHmac,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {id} from '../../packages/contracts/index.ts';
import {rows,scoped,sql,type DB} from '../../packages/adapters/db.ts';
import {hash,unseal,readArtifact} from '../../packages/adapters/storage.ts';
import {createReadStream} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readOriginalToPrivateFile,TMM_V3_SOURCE_MAX_BYTES} from '../../packages/adapters/workspace-original-stream.ts';
import {persistWorkspaceSaveFile,decodeWorkspaceSavePayload,openWorkspaceSaveFile,releaseWorkspaceSavePayload} from '../../packages/adapters/workspace-save-payload.ts';
import {isLegacyWordFormat,originalDocumentFormat} from '../../packages/core/document-format.ts';
import {readNormalizationMetadata} from '../../packages/adapters/document-normalization.ts';
import {produceWorkspaceArchive} from './workspace-export-stream.ts';
import {projectScope,denied} from './access.ts';
import {rememberWorkspaceRecent} from '../../packages/adapters/workspace-recents.ts';
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
  const garbage:any[]=[];
  const result=await projectScope(req,{project},['view_original','view_mapping','export'],async db=>{
   garbage.push(...await rows(db,sql`DELETE FROM workspace_save_receipts WHERE expires_at<=now() RETURNING *`));
   const existing=(await rows(db,sql`SELECT * FROM workspace_save_receipts WHERE request_hash=${requestHash} FOR UPDATE`))[0];
   if(existing){if(existing.session_hash!==sessionHash||existing.input_hash!==inputHash||existing.project_id!==project)denied('WORKSPACE_SAVE_REQUEST_CONFLICT',409);if(existing.state==='running'&&existing.run_instance!==instance){await rows(db,sql`UPDATE workspace_save_receipts SET state='failed',error_code='WORKSPACE_SAVE_INTERRUPTED' WHERE id=${existing.id} AND state='running'`);existing.state='failed';existing.error_code='WORKSPACE_SAVE_INTERRUPTED';}return{row:existing,fresh:false};}
   const receipt=randomUUID(),snapshot=await workspaceSaveFingerprint(db,project);
   await rows(db,sql`INSERT INTO workspace_save_receipts(id,tenant_id,owner_id,project_id,run_instance,request_hash,session_hash,input_hash,snapshot_hash,format,state) VALUES(${receipt},${req.user.tenant_id},${req.user.id},${project},${instance},${requestHash},${sessionHash},${inputHash},${snapshot},${input.format},'running') ON CONFLICT(tenant_id,owner_id,request_hash) DO NOTHING`);
   const [row]=await rows(db,sql`SELECT * FROM workspace_save_receipts WHERE request_hash=${requestHash} FOR UPDATE`);
   if(row.id!==receipt){if(row.session_hash!==sessionHash||row.input_hash!==inputHash||row.project_id!==project)denied('WORKSPACE_SAVE_REQUEST_CONFLICT',409);return{row,fresh:false};}
   garbage.push(...await rows(db,sql`DELETE FROM workspace_save_receipts WHERE id IN(SELECT id FROM workspace_save_receipts ORDER BY created_at DESC,id DESC OFFSET 100) RETURNING *`));
   return{row,fresh:true};
  });
  // Release only committed deletions, and only their authenticated owner links.
  for(const old of garbage)try{await releaseWorkspaceSavePayload(old.payload,aad(old),old.output_hash,old.id);}catch{app.log.error('WORKSPACE_SAVE_CLEANUP_FAILED');}
  if(result.fresh){const row=result.row;const work=new Promise<void>(resolve=>setImmediate(resolve)).then(async()=>{
    let directory:string|undefined,stored:Awaited<ReturnType<typeof persistWorkspaceSaveFile>>|undefined,committed=false;
    try{
     directory=await mkdtemp(join(tmpdir(),'tmw-workspace-save-'));
     const archivePath=join(directory,'workspace');
     await projectScope(req,{project},['view_original','view_mapping','export'],async db=>{
      // A queued save must observe logout/disable and current permissions just
      // as the former authenticated export request did.
      const cookieName=(process.env.APP_BASE_PATH??'/')==='/'?'session':'tuominwang_session';
      const [actor]=await rows(db,sql`SELECT * FROM auth_session(${hash(req.cookies[cookieName]??'')}) WHERE EXISTS(SELECT 1 FROM sessions WHERE token_hash=${hash(req.cookies[cookieName]??'')} AND expires_at>clock_timestamp())`);
      if(!actor||actor.id!==row.owner_id||actor.tenant_id!==row.tenant_id)denied('LOGIN_REQUIRED',401);
      const [live]=await rows(db,sql`SELECT id FROM workspace_save_receipts WHERE id=${row.id} AND state='running' AND expires_at>now() FOR UPDATE`);
      if(!live)throw Error('WORKSPACE_SAVE_INTERRUPTED');
      if(await workspaceSaveFingerprint(db,project)!==row.snapshot_hash)denied('VERSION_CONFLICT',409);
      const generated=await produceWorkspaceArchive(db,actor,project,input.password,archivePath,undefined,input.format);
      if(await workspaceSaveFingerprint(db,project)!==row.snapshot_hash)denied('VERSION_CONFLICT',409);
      stored=await persistWorkspaceSaveFile(archivePath,row.id,aad(row));
      const [currentActor]=await rows(db,sql`SELECT * FROM auth_session(${hash(req.cookies[cookieName]??'')}) WHERE EXISTS(SELECT 1 FROM sessions WHERE token_hash=${hash(req.cookies[cookieName]??'')} AND expires_at>clock_timestamp())`);
      if(!currentActor||currentActor.id!==row.owner_id||currentActor.tenant_id!==row.tenant_id)denied('LOGIN_REQUIRED',401);
      // now() is transaction-start time; wall-clock expiry must also hold after
      // a long archive write before publishing its download receipt.
      const updated=await rows(db,sql`UPDATE workspace_save_receipts SET state='completed',completed_at=clock_timestamp(),payload=${stored.payload},output_hash=${stored.outputHash} WHERE id=${row.id} AND state='running' AND expires_at>clock_timestamp() RETURNING id`);
      if(!updated.length)throw Error('WORKSPACE_SAVE_INTERRUPTED');
      await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${actor.tenant_id},${project},${actor.id},'workspace_backup_exported',${project})`);
      await rememberWorkspaceRecent(db,actor,project,{saved:true,reusable:generated.reusable});
     });
     committed=true;
    }catch(error){const message=(error as Error).message,code=/^[A-Z][A-Z0-9_]{0,100}$/.test(message)?message:'WORKSPACE_SAVE_FAILED';await scoped(row.owner_id,row.tenant_id,async db=>{await rows(db,sql`UPDATE workspace_save_receipts SET state='failed',error_code=${code} WHERE id=${row.id} AND state='running'`);});}
    finally{try{if(stored&&!committed)await releaseWorkspaceSavePayload(stored.payload,aad(row),stored.outputHash,row.id);}finally{if(directory)await rm(directory,{recursive:true,force:true});}}
   }).catch(()=>{}).finally(()=>pending.delete(work));pending.add(work);}
  return state(result.row);
 });
 app.post('/api/projects/:id/portable/save-result',async req=>{const project=id.parse((req.params as any).id),input=z.object({requestId}).strict().parse(req.body);return projectScope(req,{project},['view_original','view_mapping','export'],async db=>{const[r]=await rows(db,sql`SELECT * FROM workspace_save_receipts WHERE request_hash=${digest(input.requestId)} AND project_id=${project} AND expires_at>now()`);if(!r||r.session_hash!==session(req))return{state:'missing'};if(r.state==='running'&&r.run_instance!==instance){await rows(db,sql`UPDATE workspace_save_receipts SET state='failed',error_code='WORKSPACE_SAVE_INTERRUPTED' WHERE id=${r.id} AND state='running'`);r.state='failed';r.error_code='WORKSPACE_SAVE_INTERRUPTED';}return state(r);});});
 app.get('/api/projects/:id/portable/saves/:receipt/download',async(req,reply)=>{const project=id.parse((req.params as any).id),receipt=id.parse((req.params as any).receipt);return projectScope(req,{project},['view_original','view_mapping','export'],async db=>{const[r]=await rows(db,sql`SELECT * FROM workspace_save_receipts WHERE id=${receipt} AND project_id=${project} AND expires_at>now()`);if(!r||r.session_hash!==session(req))denied('WORKSPACE_SAVE_NOT_FOUND',404);if(r.state!=='completed')denied('WORKSPACE_SAVE_NOT_COMPLETE',409);if(await workspaceSaveFingerprint(db,project)!==r.snapshot_hash)denied('VERSION_CONFLICT',409);
   const directory=await mkdtemp(join(tmpdir(),'tmw-workspace-download-'));let sent=false;
   try{
    const verify=async(storageId:string,expectedHash:string,bytes?:unknown)=>{const path=join(directory,randomUUID());await readOriginalToPrivateFile(storageId,path,expectedHash,{purpose:'tmm-v3-source',maxBytes:TMM_V3_SOURCE_MAX_BYTES,expectedBytes:bytes==null?undefined:Number(bytes)});await rm(path);};
    try{for(const d of await rows(db,sql`SELECT * FROM documents WHERE project_id=${project}`)){
     const content=unseal(d.content,`${d.tenant_id}:${project}:${d.id}`);if(hash(content)!==d.content_hash)denied('SOURCE_MISMATCH',409);
     if(d.source_id)await verify(d.source_id,d.source_hash,d.source_bytes);
     if(d.unlocked_source_id||d.normalized_source_id){if(isLegacyWordFormat(originalDocumentFormat(d))){
      if(d.unlocked_source_id||!d.normalized_source_id||d.normalization_source_hash!==d.source_hash||!d.normalized_source_hash)denied('SOURCE_MISMATCH',409);
      readNormalizationMetadata(d);await verify(d.normalized_source_id,d.normalized_source_hash);
     }else{
      if(d.normalized_source_id||d.normalized_source_hash||d.normalization_source_hash||d.normalization_metadata)denied('SOURCE_MISMATCH',409);
      if(d.unlocked_source_id){if(d.unlock_source_hash!==d.source_hash||!d.unlocked_source_hash)denied('SOURCE_MISMATCH',409);await verify(d.unlocked_source_id,d.unlocked_source_hash);}
      else if(d.unlocked_source_hash||d.unlock_source_hash)denied('SOURCE_MISMATCH',409);
     }}
     for(const page of d.page_data??[]){await verify(page.previewId,page.previewHash);if(hash(await readArtifact(page.mapId))!==page.mapHash)denied('SOURCE_MISMATCH',409);}
    }
    }catch{denied('SOURCE_MISMATCH',409);}
    let decoded:ReturnType<typeof decodeWorkspaceSavePayload>;
    try{decoded=decodeWorkspaceSavePayload(r.payload,aad(r),r.output_hash);}catch{denied('WORKSPACE_SAVE_HASH_MISMATCH',409);}
    reply.type('application/octet-stream').header('Cache-Control','no-store').header('Content-Disposition',`attachment; filename="tuominwang-workspace.${r.format==='native'?'tmw':'tmm'}"`);
    if(decoded.kind==='inline')return reply.send(decoded.bytes);
    const path=join(directory,'workspace');
    try{await openWorkspaceSaveFile(decoded,path);}catch{denied('WORKSPACE_SAVE_HASH_MISMATCH',409);}
    const stream=createReadStream(path);stream.once('close',()=>{void rm(directory,{recursive:true,force:true}).catch(()=>{});});
    sent=true;return reply.header('Content-Length',decoded.bytes).send(stream);
   }finally{if(!sent)await rm(directory,{recursive:true,force:true});}
 });});
}
