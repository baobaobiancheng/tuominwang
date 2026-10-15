import{recordReboundReviewProvenance}from'../../packages/adapters/review-provenance-history.ts';
import{rebindEntityCorrections}from'../../packages/adapters/entity-corrections.ts';
import{readPageRotationState}from'../../packages/adapters/page-rotation-state.ts';
import{rotatePageBox,quarterTurn}from'../../packages/core/page-rotation.ts';
import type {FastifyInstance} from 'fastify';
import {pageRotationRequestSchema} from '../../packages/contracts/page-rotation.ts';
import {id} from '../../packages/contracts/index.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {hash,unseal,readOriginal,readArtifact} from '../../packages/adapters/storage.ts';
import {verifiedDocumentSource} from '../../packages/adapters/document-source.ts';
import {readReviewProvenance} from '../../packages/adapters/review-provenance.ts';
import {sealPageReview} from '../../packages/adapters/page-review-storage.ts';
import {resolveDocumentPolicy} from '../../packages/adapters/document-policy.ts';
import {readProjectPresets} from '../../packages/adapters/project-presets.ts';
import {getRuntimeWhitelists} from '../../packages/adapters/runtime-rule-update.ts';
import {runProcessing} from '../../packages/adapters/processing.ts';
import {applyReplacementPolicies} from '../../packages/core/replacement-policies.ts';
import {profileReplacementPolicies,finalizeProfileReplacements} from '../../packages/core/profile-recognition.ts';
import {entitySpanKey} from '../../packages/core/entity-identity.ts';
import {mappingsForMarks,resolvePolicyMappings} from './mappings.ts';
import {projectScope,denied,requirePermission} from './access.ts';
/** Page angles belong to the immutable original's domain. The transaction binds
 * a new canonical review to authenticated raster/glyph resources, never edits a PDF. */
export function registerPageRotationRoutes(app:FastifyInstance){
 app.post('/api/documents/:id/page-rotations',async(req,reply)=>{
  const doc=id.parse((req.params as any).id),input=pageRotationRequestSchema.parse(req.body),controller=new AbortController();
  const closed=()=>{if(!reply.raw.writableEnded)controller.abort();},aborted=()=>controller.abort();reply.raw.on('close',closed);req.raw.on('aborted',aborted);
  try{return await projectScope(req,{document:doc},['view_original','review'],async db=>{
   const[d]=await rows(db,sql`SELECT d.*,p.dictionary,p.dictionary_revision,p.preset_policy,p.preset_revision FROM documents d JOIN projects p ON p.id=d.project_id WHERE d.id=${doc} FOR UPDATE OF d`);
   if(!d)denied('NOT_FOUND',404);if(d.revision!==input.revision)denied('VERSION_CONFLICT',409);if(d.source_format!=='pdf')denied('UNSUPPORTED_FORMAT',400);if(d.state!=='review')denied('DETECTION_INCOMPLETE',409);
   Object.assign(d,resolveDocumentPolicy(d,readProjectPresets({id:d.project_id,tenant_id:d.tenant_id,preset_revision:d.preset_revision,preset_policy:d.preset_policy})));d.runtimeWhitelists=await getRuntimeWhitelists(db,d.tenant_id,d.project_id,req.user.id,d.id);
   const provenance=await readReviewProvenance(db,d);d.rotationManualKeys=provenance.entries.filter(e=>e.active&&e.meta.operationSource==='user').map(e=>e.key);
   const verifySource=async()=>{try{await verifiedDocumentSource(d);if(hash(unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`))!==d.content_hash)throw Error();}catch{denied('SOURCE_MISMATCH',409);}};
   await verifySource();let result:any;try{result=await runProcessing({kind:'page-rotation',doc:d,request:input},{timeoutMs:1800000,signal:controller.signal});}catch(e){denied((e as Error).message,409);}
   controller.signal.throwIfAborted();await verifySource();const text=unseal(result.content,`${d.tenant_id}:${d.project_id}:${d.id}`);if(hash(text)!==result.hash)denied('SOURCE_MISMATCH',409);
   for(const p of result.pages)if(hash(await readOriginal(p.previewId))!==p.previewHash||hash(await readArtifact(p.mapId))!==p.mapHash)denied('SOURCE_MISMATCH',409);
   const retained=new Set(result.retainedKeys as string[]),old=result.marks.filter((m:any)=>retained.has(entitySpanKey(m)));let fresh=result.marks.filter((m:any)=>!retained.has(entitySpanKey(m)));
   if(d.presetPolicy?.profile){const profile=d.presetPolicy.profile.settings,policies=profileReplacementPolicies(profile,d.source_format,d.batchMode,d.documentPolicy?.configuration.exportMode);let plan=applyReplacementPolicies(text,fresh,policies);if(plan.aliasRequests.length){await requirePermission(db,d.project_id,['view_mapping']);const mappings=await resolvePolicyMappings(db,{...d,entity_corrections:null,content:result.content,content_hash:result.hash,marks:result.marks,anchors:result.anchors,page_data:result.pages},req.user.id,plan.aliasRequests);plan=applyReplacementPolicies(text,fresh,policies,mappings);if(plan.aliasRequests.length)denied('MAPPING_MISMATCH',400);}fresh=finalizeProfileReplacements(plan.marks,result.anchors,profile,d.source_format,d.batchMode,d.documentPolicy?.configuration.exportMode);}
   result.marks=[...old,...fresh].sort((a,b)=>a.start-b.start||a.end-b.end);
   const next={...d,revision:d.revision+1,content:result.content,content_hash:result.hash,anchors:result.anchors,coverage:result.coverage,page_data:result.pages,marks:result.marks,page_review:result.pageReview,page_rotation_state:result.pageRotationStateEncrypted},mappings=await mappingsForMarks(db,next,result.marks,req.user.id);
   const afterQueues=new Map<string,number[]>();result.marks.forEach((m:any,index:number)=>afterQueues.set(entitySpanKey(m),[...afterQueues.get(entitySpanKey(m))??[],index]));const links=result.retainedBindings.flatMap((binding:{beforeIndex:number;afterKey:string})=>{const afterIndex=afterQueues.get(binding.afterKey)?.shift();return afterIndex===undefined?[]:[{beforeIndex:binding.beforeIndex,afterIndex}];}),oldAngles=readPageRotationState(d),corrections=rebindEntityCorrections(d,next,{links,mapGeometry:entry=>{const page=d.page_data.find((p:any)=>p.index===entry.page);if(!page)return null;const angle=quarterTurn((result.pageRotationState.rotations[String(entry.page)]??0)-(oldAngles.rotations[String(entry.page)]??0));return{page:entry.page,boxes:entry.boxes.map(box=>rotatePageBox(box,page.width,page.height,angle))};}});next.entity_corrections=corrections.stored;
   try{await runProcessing({kind:'review',doc:next,marks:result.marks,mappings},{signal:controller.signal});}catch(e){denied((e as Error).message,409);}controller.signal.throwIfAborted();
   const review=sealPageReview(next,result.pageReview,d.revision+1);await recordReboundReviewProvenance(db,d,next,{links,actorId:req.user.id,operation:'page-rotation'});
   await rows(db,sql`UPDATE documents SET content=${result.content},content_hash=${result.hash},entity_corrections=${corrections.stored},anchors=${JSON.stringify(result.anchors)}::jsonb,coverage=${JSON.stringify(result.coverage)}::jsonb,page_data=${JSON.stringify(result.pages)}::jsonb,marks=${JSON.stringify(result.marks)}::jsonb,page_review=${JSON.stringify(review)}::jsonb,recognition=${JSON.stringify(result.recognition)}::jsonb,visual_candidates=${JSON.stringify(result.visualCandidates)}::jsonb,page_rotation_state=${result.pageRotationStateEncrypted},revision=revision+1 WHERE id=${doc}`);
   await rows(db,sql`UPDATE attempts SET finished_at=now(),outcome='page_rotation_changed' WHERE finished_at IS NULL AND job_id IN(SELECT id FROM jobs WHERE document_id=${doc} AND status IN('queued','running'))`);
   await rows(db,sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE document_id=${doc} AND status IN('queued','running')`);
   await rows(db,sql`DELETE FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id}`);
   await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'page_rotation_changed',${doc})`);
   return{success:true,revision:d.revision+1,contentHash:result.hash,pageRotationState:result.pageRotationState,warnings:result.rotationWarnings,reviewRequired:true};
  });}finally{reply.raw.off('close',closed);req.raw.off('aborted',aborted);}
 });
}
