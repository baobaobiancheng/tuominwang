import type {FastifyRequest} from 'fastify';
import {isDeepStrictEqual} from 'node:util';
import {rows,sql,type DB} from '../../packages/adapters/db.ts';
import {unseal} from '../../packages/adapters/storage.ts';
import {automaticReviewMarks,AUTOMATIC_DECISION_POLICY_VERSION} from '../../packages/core/automatic-review.ts';
import {automaticVisualPageReview} from '../../packages/core/automatic-visual.ts';
import {openPageReview} from '../../packages/adapters/page-review-storage.ts';
import {resolveDocumentPolicy} from '../../packages/adapters/document-policy.ts';
import {readProjectPresets} from '../../packages/adapters/project-presets.ts';
import {requirePermission,denied} from './access.ts';
import {saveReview} from './reviews.ts';

type Input={taskId:string;documentId:string;expectedRevision:number;expectedSourceHash:string};
type Receipt={documentId:string;fromRevision:number;toRevision:number;snapshotRevision:number;sourceHash:string;policyVersion:string;decisionOrigin:'automatic'|'human_review'};

/** Must run inside MCP change()'s project/task locked transaction. This function
 * rechecks the durable task and document; a caller-supplied mode is ignored. */
export async function resolveAutomaticReview(db:DB,req:FastifyRequest,input:Input):Promise<Receipt>{
 const[task]=await rows(db,sql`SELECT id,tenant_id,project_id,owner_id,payload FROM ai_collab_tasks WHERE id=${input.taskId} FOR UPDATE`);
 if(!task||task.tenant_id!==req.user.tenant_id||task.owner_id!==req.user.id)denied('TASK_NOT_FOUND',404);
 let payload:any;
 try{payload=JSON.parse(unseal(task.payload,`${req.user.tenant_id}:${req.user.id}:ai-collab:${task.id}`));}
 catch{denied('TASK_STORAGE_INVALID',409);}
 if(payload.executionMode!=='automatic'||payload.projectId!==task.project_id||
    !payload.authorization?.allowRedactionPath||!payload.authorization?.allowSanitizedDelivery)
   denied('AUTOMATIC_REVIEW_NOT_AUTHORIZED',403);
 const source=payload.sources?.find((s:any)=>s.documentId===input.documentId);
 if(!source||source.revision!==input.expectedRevision||source.hash!==input.expectedSourceHash)
   denied('AUTOMATIC_SOURCE_MISMATCH',409);
 await requirePermission(db,task.project_id,['view_original','review']);
 const[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${input.documentId} AND project_id=${task.project_id} FOR UPDATE`);
 if(!d||d.tenant_id!==task.tenant_id)denied('NOT_FOUND',404);
 if(d.state!=='review')denied('DETECTION_INCOMPLETE',409);
 if(d.revision<input.expectedRevision)denied('VERSION_CONFLICT',409);
 const sourceHash=d.source_hash??d.content_hash;
 if(sourceHash!==input.expectedSourceHash)denied('SOURCE_MISMATCH',409);
 const[detected]=await rows(db,sql`SELECT * FROM review_snapshots WHERE document_id=${d.id} AND revision=${input.expectedRevision}`);
 let origin=detected,originRevision=input.expectedRevision;
 const receipts=payload.reviewResolutions??[];
 const visited=new Set<number>();
 while(origin?.review_mode==='human_review'){
   if(visited.has(originRevision))denied('HUMAN_INTERVENTION_SNAPSHOT_MISMATCH',409);
   visited.add(originRevision);
   const receipt=receipts.findLast((r:any)=>r.documentId===d.id&&r.sourceHash===sourceHash&&
     r.toRevision===originRevision&&r.snapshotRevision===originRevision&&
     r.fromRevision<r.toRevision&&r.decisionOrigin==='human_review'&&r.policyVersion==='human-review');
   if(!receipt)denied('HUMAN_INTERVENTION_SNAPSHOT_MISMATCH',409);
   const chain=await rows(db,sql`SELECT revision,review_mode,content_hash,parse_version,recognition,page_data FROM review_snapshots
     WHERE document_id=${d.id} AND revision>${receipt.fromRevision} AND revision<=${receipt.toRevision} ORDER BY revision`);
   if(chain.length!==receipt.toRevision-receipt.fromRevision||chain.some((row,index)=>
      row.revision!==receipt.fromRevision+index+1||row.review_mode!=='human_review'||
      row.content_hash!==d.content_hash||row.parse_version!==d.parse_version||
      !isDeepStrictEqual(row.recognition??{},d.recognition??{})||
      !isDeepStrictEqual(row.page_data??[],d.page_data??[])))
     denied('HUMAN_INTERVENTION_SNAPSHOT_MISMATCH',409);
   originRevision=receipt.fromRevision;
   [origin]=await rows(db,sql`SELECT * FROM review_snapshots WHERE document_id=${d.id} AND revision=${originRevision}`);
 }
 const priorAutomatic=origin?.review_mode==='automatic'&&
   origin.automatic_task_id===task.id&&origin.automatic_actor_id===task.owner_id&&
   origin.automatic_source_hash===sourceHash&&
   origin.automatic_policy_version===AUTOMATIC_DECISION_POLICY_VERSION&&
   Number.isSafeInteger(origin.automatic_source_revision)&&
   origin.automatic_source_revision<originRevision;
 const detectRevision=priorAutomatic?origin.automatic_source_revision:originRevision;
 const[detectJob]=await rows(db,sql`SELECT id,collab_task_id,revision FROM jobs WHERE document_id=${d.id} AND kind='detect' AND status='succeeded' ORDER BY revision DESC,created_at DESC,id DESC LIMIT 1`);
 if(!detectJob||detectJob.collab_task_id!==task.id||detectJob.revision!==detectRevision)
   denied('AUTOMATIC_DETECTION_RECEIPT_REQUIRED',409);
 if(!origin||!(origin.review_mode==='legacy'||priorAutomatic)||origin.content_hash!==d.content_hash||
    origin.parse_version!==d.parse_version||
    !isDeepStrictEqual(origin.recognition??{},d.recognition??{})||
    !isDeepStrictEqual(origin.page_data??[],d.page_data??[]))
   denied('AUTOMATIC_DETECTION_SNAPSHOT_MISMATCH',409);
 if(originRevision!==input.expectedRevision&&d.revision===input.expectedRevision)
   denied('AUTOMATIC_REVIEW_ALREADY_RESOLVED',409);
 if(d.revision>input.expectedRevision){
   const chain=await rows(db,sql`SELECT * FROM review_snapshots WHERE document_id=${d.id} AND revision>${input.expectedRevision} AND revision<=${d.revision} ORDER BY revision`);
   const current=chain.at(-1);
   if(chain.length!==d.revision-input.expectedRevision||chain.some((row,index)=>
      row.revision!==input.expectedRevision+index+1||row.review_mode!=='human_review'||row.content_hash!==d.content_hash||
      row.parse_version!==d.parse_version)||!current||!isDeepStrictEqual(current.marks,d.marks)||
      !isDeepStrictEqual(current.recognition??{},d.recognition??{})||
      !isDeepStrictEqual(current.page_data??[],d.page_data??[])||
      !isDeepStrictEqual(current.page_review??null,d.page_review??null))
     denied('HUMAN_INTERVENTION_SNAPSHOT_MISMATCH',409);
   return{documentId:d.id,fromRevision:input.expectedRevision,toRevision:d.revision,
     snapshotRevision:d.revision,sourceHash,policyVersion:'human-review',decisionOrigin:'human_review'};
 }
 if(priorAutomatic){
   if(!isDeepStrictEqual(origin.marks,d.marks)||
      !isDeepStrictEqual(origin.page_review??null,d.page_review??null))
     denied('AUTOMATIC_SNAPSHOT_MISMATCH',409);
   return{documentId:d.id,fromRevision:detected.automatic_source_revision,toRevision:d.revision,
     snapshotRevision:d.revision,sourceHash,policyVersion:AUTOMATIC_DECISION_POLICY_VERSION,decisionOrigin:'automatic'};
 }
 if(!isDeepStrictEqual(detected.marks,d.marks)||
    !isDeepStrictEqual(detected.page_review??null,d.page_review??null))
   denied('AUTOMATIC_DETECTION_SNAPSHOT_MISMATCH',409);
 const decision=automaticReviewMarks(d.marks,unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`));
 const oldPage=openPageReview(d);
 const[project]=await rows(db,sql`SELECT id,tenant_id,preset_policy,preset_revision FROM projects WHERE id=${d.project_id}`);
 if(!project)denied('NOT_FOUND',404);
 Object.assign(d,resolveDocumentPolicy(d,readProjectPresets(project)));
 const enabled=['face','seal','signature'].filter(kind=>d.presetPolicy?.profile?.settings?.enabledEntityTypeIds?.includes(kind));
 const pageReview=automaticVisualPageReview(d.page_data??[],d.visual_candidates??[],d.recognition?.visual,
   enabled,oldPage);
 const next=await saveReview(db,req.user.id,d,decision.marks,undefined,true,pageReview,{
   mode:'automatic',taskId:task.id,actorId:req.user.id,sourceRevision:d.revision,
   sourceHash,policyVersion:AUTOMATIC_DECISION_POLICY_VERSION,suppressed:decision.suppressed});
 return{documentId:d.id,fromRevision:d.revision,toRevision:next.revision,
   snapshotRevision:next.revision,sourceHash,policyVersion:AUTOMATIC_DECISION_POLICY_VERSION,decisionOrigin:'automatic'};
}
