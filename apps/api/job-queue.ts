import type {FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import {rows,sql,type DB} from '../../packages/adapters/db.ts';
import {runProcessing} from '../../packages/adapters/processing.ts';
import {resolveDocumentPolicy} from '../../packages/adapters/document-policy.ts';
import {readProjectPresets} from '../../packages/adapters/project-presets.ts';
import {requirePermission,textArray,denied} from './access.ts';
import {assertUnifiedAliasExportEpoch,preflightUnifiedAliasExport} from './unified-alias-export.ts';

type AliasEpoch=Awaited<ReturnType<typeof preflightUnifiedAliasExport>>;

// The caller already owns the project FOR UPDATE lock and its scoped transaction.
// A null owner is a normal document job. A task-owned job is never borrowed by
// a normal export or another task.
export async function queueExport(db:DB,req:FastifyRequest,doc:string,revision:number,epoch:AliasEpoch,collabTaskId:string|null=null){
 const[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc} FOR UPDATE`);if(!d)denied('NOT_FOUND',404);
 await requirePermission(db,d.project_id,['export']);
 if(d.revision!==revision)denied('VERSION_CONFLICT',409);
 await assertUnifiedAliasExportEpoch(db,d.project_id,epoch);
 const[p]=await rows(db,sql`SELECT id,tenant_id,preset_policy,preset_revision FROM projects WHERE id=${d.project_id}`);
 Object.assign(d,resolveDocumentPolicy(d,readProjectPresets(p)));
 const[snapshot]=await rows(db,sql`SELECT * FROM review_snapshots WHERE document_id=${doc} AND revision=${revision}`);
 try{await runProcessing({kind:'gate',doc:d,snapshot});}
 catch(e){const code=(e as Error).message;denied(code,['INVALID_MARKS','OVERLAPPING_MARKS','CROSS_CELL_MARK','SIGNATURE_GROUP_INVALID'].includes(code)?400:409);}
 const[existing]=collabTaskId
  ?await rows(db,sql`SELECT id FROM jobs WHERE document_id=${doc} AND kind='export' AND revision=${revision} AND collab_task_id=${collabTaskId} AND status IN ('queued','running','succeeded') ORDER BY created_at DESC LIMIT 1`)
  :await rows(db,sql`SELECT id FROM jobs WHERE document_id=${doc} AND kind='export' AND revision=${revision} AND collab_task_id IS NULL AND status IN ('queued','running','succeeded') ORDER BY created_at DESC LIMIT 1`);
 if(existing)return{id:existing.id as string};
 const job=randomUUID();await rows(db,sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind,revision,required_permissions,collab_task_id) VALUES(${job},${req.user.tenant_id},${d.project_id},${doc},${req.user.id},'export',${revision},ARRAY['export']::text[],${collabTaskId})`);
 await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${d.project_id},${req.user.id},'export_requested',${doc})`);
 return{id:job};
}

export async function queueRecognition(db:DB,req:FastifyRequest,doc:string,revision:number,ner:boolean,nerReady:boolean,collabTaskId:string|null=null){
 if(ner&&!nerReady)denied('NER_MODEL_REQUIRED',409);
 const[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc} FOR UPDATE`);if(!d)denied('NOT_FOUND',404);
 await requirePermission(db,d.project_id,ner?['review','manage_models']:['review']);
 if(d.revision!==revision)denied('VERSION_CONFLICT',409);
 if((await rows(db,sql`SELECT id FROM jobs WHERE document_id=${doc} AND status IN ('queued','running')`)).length)denied('JOB_ACTIVE',409);
 await rows(db,sql`UPDATE documents SET revision=revision+1,state='queued',marks='[]',ner_enabled=${ner},recognition='{}' WHERE id=${doc}`);
 const job=randomUUID();await rows(db,sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind,revision,required_permissions,collab_task_id) VALUES(${job},${d.tenant_id},${d.project_id},${doc},${req.user.id},'detect',${d.revision+1},${textArray(ner?['review','manage_models']:['review'])},${collabTaskId})`);
 await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'recognition_requested',${doc})`);
 return{revision:d.revision+1,jobId:job};
}
