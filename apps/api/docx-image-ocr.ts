import{isWordFormat}from'../../packages/core/document-format.ts';
import {recordReboundReviewProvenance} from '../../packages/adapters/review-provenance-history.ts';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {openPageReview,sealPageReview} from '../../packages/adapters/page-review-storage.ts';
import {hash,seal,unseal,readOriginal,readArtifact} from '../../packages/adapters/storage.ts';
import {applyReplacementPolicies} from '../../packages/core/replacement-policies.ts';
import {profileReplacementPolicies,finalizeProfileReplacements} from '../../packages/core/profile-recognition.ts';
import {resolvePolicyMappings,mappingsForMarks} from './mappings.ts';
import {requirePermission} from './access.ts';
import {id,revisionSchema,FILE_MAX_BYTES} from '../../packages/contracts/index.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {resolveDocumentPolicy} from '../../packages/adapters/document-policy.ts';
import {readProjectPresets} from '../../packages/adapters/project-presets.ts';
import {getRuntimeWhitelists} from '../../packages/adapters/runtime-rule-update.ts';
import {runProcessing} from '../../packages/adapters/processing.ts';
import {verifiedDocumentSource} from '../../packages/adapters/document-source.ts';
import {projectScope,denied} from './access.ts';
function candidateAad(d:any,user:string){return `${d.tenant_id}:${d.project_id}:${d.id}:${user}:docx-image-ocr:${d.revision}:${d.source_hash}:${d.content_hash}:${hash(JSON.stringify([d.dictionary_revision,d.preset_revision,d.documentPolicy,d.runtimeWhitelists]))}`;}
async function context(db:any,doc:string,revision:number,user:string){
 const[d]=await rows(db,sql`SELECT d.*,p.dictionary,p.dictionary_revision,p.preset_policy,p.preset_revision FROM documents d JOIN projects p ON p.id=d.project_id WHERE d.id=${doc} FOR UPDATE OF d`);
 if(!d)denied('NOT_FOUND',404);if(d.revision!==revision)denied('VERSION_CONFLICT',409);if(!isWordFormat(d.source_format))denied('UNSUPPORTED_FORMAT',400);if(d.state!=='review')denied('DETECTION_INCOMPLETE',409);
 Object.assign(d,resolveDocumentPolicy(d,readProjectPresets({id:d.project_id,tenant_id:d.tenant_id,preset_revision:d.preset_revision,preset_policy:d.preset_policy})));d.runtimeWhitelists=await getRuntimeWhitelists(db,d.tenant_id,d.project_id,user,d.id);return d;
}
export function registerDocxImageOcrRoutes(app:FastifyInstance){
 app.post('/api/documents/:id/recognize-docx-images',async req=>{const doc=id.parse((req.params as any).id),input=revisionSchema.parse(req.body);return projectScope(req,{document:doc},['view_original','review'],async db=>{
  const d=await context(db,doc,input.revision,req.user.id);
  try{const {_state,...result}=await runProcessing<any>({kind:'docx-image-ocr',doc:d} as any);const candidateToken=seal(JSON.stringify(_state),candidateAad(d,req.user.id));await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'docx_image_ocr_completed',${doc})`);return {...result,candidateToken};}catch(e){denied((e as Error).message,409);}
 });});
 app.post('/api/documents/:id/recognize-docx-images/apply',{bodyLimit:FILE_MAX_BYTES*3},async req=>{const doc=id.parse((req.params as any).id),input=z.object({revision:z.number().int().nonnegative(),candidateToken:z.string().min(1)}).strict().parse(req.body);return projectScope(req,{document:doc},['view_original','review'],async db=>{
  const d=await context(db,doc,input.revision,req.user.id);let result:any;
  try{result=JSON.parse(unseal(input.candidateToken,candidateAad(d,req.user.id)));}catch{denied('DOCX_OCR_CANDIDATE_INVALID',409);}
  // A candidate token authenticates the prior recognition; applying it must
  // independently authenticate the still-current original, unlocked derivative
  // and canonical content before changing any review state.
  try{await verifiedDocumentSource(d);if(hash(unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`))!==d.content_hash)denied('SOURCE_MISMATCH',409);}catch{denied('SOURCE_MISMATCH',409);}
  const text=unseal(result.content,`${d.tenant_id}:${d.project_id}:${d.id}`);if(hash(text)!==result.hash)denied('SOURCE_MISMATCH',409);
  for(const p of result.pages)if(hash(await readOriginal(p.previewId))!==p.previewHash||hash(await readArtifact(p.mapId))!==p.mapHash)denied('SOURCE_MISMATCH',409);
  let review=openPageReview(d);
  if(review){for(const region of review.regions){const before=d.page_data.find((p:any)=>p.index===region.page),fresh=result.pages.find((p:any)=>p.index===region.page);if(!before||!fresh||before.part!==fresh.part||before.width!==fresh.width||before.height!==fresh.height||before.previewHash!==fresh.previewHash)denied('DOCX_OCR_REVIEW_GEOMETRY_CONFLICT',409);}review={...review,deletedPages:[]};}
  if(d.presetPolicy?.profile){const profile=d.presetPolicy.profile.settings,policies=profileReplacementPolicies(profile,d.source_format,d.batchMode,d.documentPolicy?.configuration.exportMode);let plan=applyReplacementPolicies(text,result.marks,policies);if(plan.aliasRequests.length){await requirePermission(db,d.project_id,['view_mapping']);const mappings=await resolvePolicyMappings(db,{...d,content:result.content,content_hash:result.hash,marks:result.marks,anchors:result.anchors,page_data:result.pages},req.user.id,plan.aliasRequests);plan=applyReplacementPolicies(text,result.marks,policies,mappings);if(plan.aliasRequests.length)denied('MAPPING_MISMATCH',400);}result.marks=finalizeProfileReplacements(plan.marks,result.anchors,profile,d.source_format,d.batchMode,d.documentPolicy?.configuration.exportMode);}
  result.marks=result.marks.map((m:any)=>({...m,decision:'pending'}));const next={...d,content:result.content,content_hash:result.hash,anchors:result.anchors,coverage:result.coverage,page_data:result.pages,marks:result.marks,page_review:review};
  const mappings=await mappingsForMarks(db,next,result.marks,req.user.id);
  try{await runProcessing({kind:'review',doc:next,marks:result.marks,mappings});}catch(e){denied((e as Error).message,409);}
  if(d.recognition?.visual)result.recognition={...result.recognition,visual:d.recognition.visual};
  const visualCandidates=(d.visual_candidates??[]).map((v:any)=>({...v,decision:'pending'}));
  const pageReview=sealPageReview({...d,content_hash:result.hash},review,d.revision+1);
  // Fresh OCR is a new observation, not evidence that equal text is the same
  // old entity. Keep the complete previous text domain in immutable history.
  await recordReboundReviewProvenance(db,d,{...next,revision:d.revision+1},{links:[],actorId:req.user.id,operation:'docx-image-ocr'});
  await rows(db,sql`UPDATE documents SET content=${result.content},content_hash=${result.hash},anchors=${JSON.stringify(result.anchors)}::jsonb,coverage=${JSON.stringify(result.coverage)}::jsonb,page_data=${JSON.stringify(result.pages)}::jsonb,marks=${JSON.stringify(result.marks)}::jsonb,page_review=${JSON.stringify(pageReview)}::jsonb,recognition=${JSON.stringify(result.recognition)}::jsonb,visual_candidates=${JSON.stringify(visualCandidates)}::jsonb,revision=revision+1 WHERE id=${doc}`);
  // No accepted snapshot is created. Current-version export requires a fresh manual save.
  await rows(db,sql`UPDATE attempts SET finished_at=now(),outcome='ocr_images_changed' WHERE finished_at IS NULL AND job_id IN(SELECT id FROM jobs WHERE document_id=${doc} AND status IN('queued','running'))`);
  await rows(db,sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE document_id=${doc} AND status IN('queued','running')`);
  await rows(db,sql`DELETE FROM workspace_recoveries WHERE document_id=${doc} AND user_id=${req.user.id}`);
  await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'docx_image_ocr_applied',${doc})`);
  return {success:true,revision:d.revision+1,contentHash:result.hash,reviewRequired:true};
 });});
}

