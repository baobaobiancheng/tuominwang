import type {FastifyInstance} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {id} from '../../packages/contracts/index.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {hash,writeOriginal} from '../../packages/adapters/storage.ts';
import {runProcessing} from '../../packages/adapters/processing.ts';
import {projectScope} from './access.ts';
function fail(code:string,statusCode=409):never{throw Object.assign(new Error(code),{statusCode});}
export function registerDocumentUnlockRoutes(app:FastifyInstance){
 app.post('/api/documents/:id/unlock',async req=>{
  const doc=id.parse((req.params as any).id),input=z.object({revision:z.number().int().nonnegative(),password:z.string().min(1).max(4096).refine(s=>s.isWellFormed()&&!s.includes('\0'))}).strict().parse(req.body);
  return projectScope(req,{document:doc},['view_original','review'],async db=>{
   const [scope]=await rows(db,sql`SELECT project_id FROM documents WHERE id=${doc}`);if(!scope)fail('NOT_FOUND',404);
   await rows(db,sql`SELECT id FROM projects WHERE id=${scope.project_id} FOR UPDATE`);
   const [d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc} FOR UPDATE`);if(!d)fail('NOT_FOUND',404);
   if(d.revision!==input.revision)fail('VERSION_CONFLICT');
   if(!d.source_id||!['pdf','docx','xlsx'].includes(d.source_format))fail('DOCUMENT_UNLOCK_UNSUPPORTED',400);
   if(d.unlocked_source_id)fail('DOCUMENT_ALREADY_UNLOCKED');
   if((await rows(db,sql`SELECT id FROM jobs WHERE document_id=${doc} AND status IN ('queued','running')`)).length)fail('JOB_ALREADY_ACTIVE');
   let result:{bytes:Uint8Array;sourceHash:string;derivedHash:string;format:string};
   try{result=await runProcessing({kind:'document-unlock',doc:d,password:input.password});}catch(e){fail((e as Error).message,400);}finally{input.password='';}
   const bytes=Buffer.from(result.bytes);if(result.sourceHash!==d.source_hash||result.format!==d.source_format||hash(bytes)!==result.derivedHash)fail('SOURCE_MISMATCH');
   const derived=randomUUID(),job=randomUUID();
   await rows(db,sql`UPDATE documents SET unlocked_source_id=${derived},unlocked_source_hash=${result.derivedHash},unlock_source_hash=${d.source_hash},quota_bytes=quota_bytes+${bytes.length},revision=revision+1,state='queued' WHERE id=${doc}`);
   await writeOriginal(derived,bytes,d.id);
   await rows(db,sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind,revision,required_permissions) VALUES(${job},${d.tenant_id},${d.project_id},${doc},${req.user.id},'detect',${d.revision+1},ARRAY['view_original','review'])`);
   await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'document_unlocked',${doc})`);
   return {revision:d.revision+1,jobId:job};
  });
 });
}
