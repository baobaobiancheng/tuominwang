import{reviewFeedbackEntities}from'./review-feedback-entities.ts';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {id,markSchema,MAX_MARKS,type Mark} from '../../packages/contracts/index.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {runProcessing} from '../../packages/adapters/processing.ts';
import type {KnownEntityCheck,KnownEntitySeed} from '../../packages/core/review-tools.ts';
import {projectScope,requirePermission} from './access.ts';
import {mappingsForMarks} from './mappings.ts';
import {saveReview} from './reviews.ts';
import {readReviewProvenance} from '../../packages/adapters/review-provenance.ts';
import {openPageReview} from '../../packages/adapters/page-review-storage.ts';
import {pruneEntityGeometryRegions} from '../../packages/contracts/entity-geometry.ts';
import {addReviewEntityHints} from '../../packages/core/review-entity-slots.ts';
import {sameEntity} from '../../packages/core/entity-identity.ts';
import {findProjectEntity,normalizeProjectEntity} from '../../packages/core/reference-project-search.ts';
import {validateFileMarks} from '../../packages/core/files.ts';
import {canonicalRuleEntityType} from '../../packages/core/presets.ts';
import {queueAutomaticRuntimeRules} from '../../packages/adapters/automatic-runtime-rules.ts';
import {buildReferenceReviewFeedback,referenceFeedbackKey} from '../../packages/core/reference-review-feedback.ts';
import {automaticRuntimeRules} from '../../packages/core/reference-runtime-rule-producer.ts';
import {feedbackRecordSchema} from '../../packages/contracts/feedback.ts';
import {getHintState,saveHintState,writeFeedback,addFeedbackAudit} from '../../packages/adapters/feedback-store.ts';
import {hash,unseal} from '../../packages/adapters/storage.ts';
import {correctionDocumentFactsMany} from '../../packages/adapters/project-entity-corrections.ts';
import {correctionOverlap,type CorrectionDocument,type CorrectionEntity,type CorrectionHit} from '../../packages/core/project-entity-corrections.ts';
import {documentProcessingFormat} from '../../packages/core/document-format.ts';

const versions=z.array(z.object({id,revision:z.number().int().nonnegative()}).strict()).min(1).max(1000);
const inputSchema=z.object({documents:versions}).strict();
const targetSchema=z.object({documentId:id,value:z.string().min(1).max(2000).refine(v=>v.isWellFormed()),kind:markSchema.shape.kind,rawEntityType:z.string().min(1).refine(v=>v.isWellFormed()&&!v.includes('\0')).optional(),start:z.number().int().nonnegative(),end:z.number().int().positive(),hitId:z.string().optional()}).strict();
const actionSchema=z.object({documents:versions,target:targetSchema,action:z.enum(['add-one','replace-other-one'])}).strict();
function fail(message:string,statusCode=409):never{throw Object.assign(new Error(message),{statusCode});}
function key(entity:{value:string;kind:Mark['kind'];rawEntityType?:string}){return JSON.stringify([entity.value,entity.kind,entity.rawEntityType??null]);}
function sameTarget(a:{value:string;kind:Mark['kind'];rawEntityType?:string},b:{value:string;kind:Mark['kind'];rawEntityType?:string}){return key(a)===key(b);}
export const sourceAuditContains=(entityText:string,query:string)=>normalizeProjectEntity(entityText).includes(normalizeProjectEntity(query));
export const sourceAuditSameValue=(entityText:string,query:string)=>normalizeProjectEntity(entityText).toLocaleLowerCase()===normalizeProjectEntity(query).toLocaleLowerCase();
export type ProjectAuditOccurrence={value:string;kind:Mark['kind'];rawEntityType?:string;start:number;end:number;category:'same'|'other'|'uncovered'|'retained'|'conflict';otherIndex?:number;hitId?:string;source?:CorrectionHit['source'];page?:number};
/** Only exact-span, different-type conflicts are replaceable automatically. A
 * partial overlap stays visible as conflict and must be handled in review. */
export function auditOccurrences(seeds:KnownEntitySeed[],text:string,marks:Mark[],format:any,anchors:any[]):ProjectAuditOccurrence[]{
 const result:ProjectAuditOccurrence[]=[],seen=new Map<string,KnownEntitySeed>();
 for(const seed of seeds){const identity=key(seed);if(!seen.has(identity))seen.set(identity,seed);}
 for(const seed of seen.values())for(const hit of findProjectEntity(text,seed.value,{literalOnly:['csv','xlsx'].includes(format),maxMatches:MAX_MARKS})){
  const start=hit.start,end=hit.end,same=marks.some(m=>m.decision!=='ignore'&&m.hiddenByType!==true&&m.start<=start&&m.end>=end&&sameEntity(m,seed));
  const retained=marks.some(m=>m.decision==='ignore'&&m.start<=start&&m.end>=end);
  const otherIndex=marks.findIndex(m=>m.decision!=='ignore'&&m.hiddenByType!==true&&m.start===start&&m.end===end&&!sameEntity(m,seed));
  const overlap=marks.some(m=>m.start<end&&m.end>start);
  let category:ProjectAuditOccurrence['category']=same?'same':retained?'retained':otherIndex>=0?'other':overlap?'conflict':'uncovered';
  if(category==='uncovered'){const proposed:Mark={start,end,kind:seed.kind,...seed.rawEntityType!==undefined?{rawEntityType:seed.rawEntityType}:{},decision:'pending',sources:[{layer:'manual',code:'project-entity-add'}]};try{validateFileMarks(text,[proposed],format,anchors);}catch(error){if(['CROSS_CELL_MARK','CROSS_OBJECT_MARK'].includes((error as Error).message))category='conflict';else throw error;}}
  result.push({value:seed.value,kind:seed.kind,...seed.rawEntityType!==undefined?{rawEntityType:seed.rawEntityType}:{},start,end,category,...category==='other'?{otherIndex}: {}});
 }
 return result;
}

/** Source Tf2 matching on our authenticated page maps. No caller-provided boxes
 * participate. The project correction adapter verifies original, preview and
 * OCR map hashes before supplying glyph boxes and semantic entity values. */
async function auditVisualOccurrences(d:any,seeds:KnownEntitySeed[],deadline:number){
 const format=documentProcessingFormat(d);
 if(!['docx','md','pdf','png','jpg','jpeg'].includes(format))return{rows:[] as ProjectAuditOccurrence[],skipped:[] as string[]};
 const rows:ProjectAuditOccurrence[]=[],skipped=new Set<string>();
 if(['pdf','png','jpg','jpeg'].includes(format)&&!(d.page_data?.length))skipped.add('SPATIAL_MAP_MISSING');
 if(Date.now()>deadline)fail('PROCESSING_TIMEOUT',400);
 // All seeds use the same locked document revision and source/page hashes. The
 // adapter validates original, preview and glyph maps once for this request.
 let factsBySeed:CorrectionDocument[];
 try{factsBySeed=await correctionDocumentFactsMany(d,seeds.map(seed=>({recognizedText:seed.value,correctedText:seed.value,targetType:seed.rawEntityType??seed.kind,source:'highlight-context-menu'})));}
 catch(error){skipped.add(`SOURCE_GEOMETRY_UNAVAILABLE:${(error as Error).message}`);return{rows,skipped:[...skipped]};}
 for(const [seedIndex,seed] of seeds.entries()){
  if(Date.now()>deadline)fail('PROCESSING_TIMEOUT',400);
  const facts=factsBySeed[seedIndex];
  facts.skipReasons.forEach(reason=>skipped.add(reason));
  const query=normalizeProjectEntity(seed.value);
  // Source wf2/Xf is case sensitive and does not perform NFKC. Only rv/iv
  // lowers case for the final same-type-and-value decision.
  const active=facts.entities.filter(e=>!e.deleted&&sourceAuditContains(e.text,seed.value));
  const hits=facts.supplementHits.filter(hit=>normalizeProjectEntity(hit.recognizedText)===query&&(hit.source!=='pdf_ocr'||!facts.supplementHits.some(native=>native.source==='pdf_text'&&native.page===hit.page&&native.boxes.some(a=>hit.boxes.some(b=>correctionOverlap(a,b)>.4)))));
  for(const hit of hits){
   const overlap=(e:CorrectionEntity)=>e.boxes.some(a=>hit.boxes.some(b=>correctionOverlap(a,b)>.4));
   let candidates:CorrectionEntity[]=[];
   if(hit.source==='docx_text'||hit.source==='markdown_text')candidates=active.filter(e=>e.start<hit.end&&hit.start<e.end);
   else if(hit.source==='docx_image_ocr')candidates=active.filter(e=>e.visual&&e.imagePath===hit.imagePath&&(overlap(e)||e.lineIndex===hit.lineIndex&&e.occurrence===hit.occurrence));
   else{
    const samePage=active.filter(e=>e.page===hit.page);
    candidates=samePage.filter(overlap).sort((a,b)=>Math.min(...a.boxes.map(box=>box.width*box.height))-Math.min(...b.boxes.map(box=>box.width*box.height)));
    if(!candidates.length){
     // Tf2 uses the occurrence-th same candidate, then the occurrence-th other.
     const same=samePage.filter(e=>sameEntity((d.marks as Mark[])[e.markIndex],seed)&&sourceAuditSameValue(e.text,seed.value));
     const other=samePage.filter(e=>!same.includes(e));const nth=Math.max(0,hit.occurrence);
     const selected=same[nth]??other[nth];if(selected)candidates=[selected];
    }
   }
   const same=candidates.find(e=>sameEntity((d.marks as Mark[])[e.markIndex],seed)&&sourceAuditSameValue(e.text,seed.value)&&(hit.source!=='docx_text'&&hit.source!=='markdown_text'||e.start<=hit.start&&e.end>=hit.end));
   const other=same?undefined:candidates[0],ignored=facts.entities.filter(e=>e.deleted&&(hit.source==='docx_image_ocr'?e.imagePath===hit.imagePath:e.page===hit.page)&&e.start<hit.end&&hit.start<e.end);
   const retained=ignored.some(e=>e.start<=hit.start&&e.end>=hit.end);
   let category:ProjectAuditOccurrence['category']=same?'same':other?'other':retained?'retained':ignored.length?'conflict':'uncovered';
   if(category==='uncovered'||category==='other'){
    const proposed:Mark={start:hit.start,end:hit.end,kind:seed.kind,...seed.rawEntityType!==undefined?{rawEntityType:seed.rawEntityType}:{},decision:'pending',sources:[{layer:'manual',code:'project-entity-add'}]};
    try{validateFileMarks(unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`),[proposed],d.source_format,d.anchors);}catch{category='conflict';}
   }
   rows.push({value:seed.value,kind:seed.kind,...seed.rawEntityType!==undefined?{rawEntityType:seed.rawEntityType}:{},start:hit.start,end:hit.end,category,...other?{otherIndex:other.markIndex}:{},hitId:hit.id,source:hit.source,page:hit.page});
  }
 }
 return{rows,skipped:[...skipped]};
}

async function snapshot(db:any,project:string,input:{documents:{id:string;revision:number}[]}){
 if(new Set(input.documents.map(d=>d.id)).size!==input.documents.length)fail('INVALID_INPUT',400);
 const metadata=await rows(db,sql`SELECT id,revision,state,length(content)+length(marks::text) AS size FROM documents WHERE project_id=${project} ORDER BY id FOR UPDATE`);
 if(metadata.length!==input.documents.length||metadata.some(d=>input.documents.find(v=>v.id===d.id)?.revision!==d.revision))fail('VERSION_CONFLICT');
 if(metadata.reduce((n,d)=>n+Number(d.size),0)>80*1024*1024)fail('BULK_REVIEW_LIMIT',400);
 const ready=metadata.filter(d=>d.state==='review'),skipped=metadata.filter(d=>d.state!=='review').map(d=>({id:d.id,state:d.state}));
 if(!ready.length)fail('DETECTION_INCOMPLETE');
 const docs=await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} AND state='review' ORDER BY id`);
 return {docs,skipped};
}
async function scan(db:any,docs:any[],user:string,deadline:number){
 const all=new Map<string,KnownEntitySeed>(),results=[];
 for(const d of docs){if(Date.now()>deadline)fail('PROCESSING_TIMEOUT',400);const seeds=await runProcessing<KnownEntitySeed[]>({kind:'entity-seeds',doc:d});for(const seed of seeds)all.set(JSON.stringify(seed),seed);}
 for(const d of docs){
  if(Date.now()>deadline)fail('PROCESSING_TIMEOUT',400);
  const mappings=await mappingsForMarks(db,d,d.marks,user);
  const check=await runProcessing<KnownEntityCheck>({kind:'known-entities',doc:d,marks:d.marks,entitySeeds:[...all.values()],mappings});
  const canonical=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);if(hash(canonical)!==d.content_hash)fail('SOURCE_MISMATCH');
  const textRows=auditOccurrences([...all.values()],canonical,d.marks as Mark[],d.source_format,d.anchors),visual=await auditVisualOccurrences(d,[...all.values()],deadline);
  const visualLocations=new Set(visual.rows.map(o=>JSON.stringify([key(o),o.start,o.end])));
  results.push({d,check,occurrences:[...textRows.filter(o=>!visualLocations.has(JSON.stringify([key(o),o.start,o.end]))),...visual.rows],geometrySkipped:visual.skipped});
 }
 return {all,results};
}
function bulkAuditAdditions(d:any,check:KnownEntityCheck,occurrences:ProjectAuditOccurrence[],seeds:KnownEntitySeed[]){
 const additions:Mark[]=[...check.additions],seen=new Set(additions.map(m=>JSON.stringify([m.start,m.end,m.kind,m.rawEntityType??null])));
 const canonical=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);
 if(hash(canonical)!==d.content_hash)fail('SOURCE_MISMATCH');
 for(const row of occurrences.filter(o=>o.category==='uncovered')){
  const signature=JSON.stringify([row.start,row.end,row.kind,row.rawEntityType??null]);if(seen.has(signature))continue;
  const matching=seeds.filter(seed=>sameTarget(seed,row)),seed=matching[0];if(!seed)fail('VERSION_CONFLICT');
  const policyUnambiguous=matching.every(s=>JSON.stringify(s.replacement??null)===JSON.stringify(seed.replacement??null));
  const replacement=policyUnambiguous&&seed.replacement&&(seed.replacement.mode!=='alias'||canonical.slice(row.start,row.end)===seed.value)?seed.replacement:undefined;
  additions.push({start:row.start,end:row.end,kind:row.kind,...row.rawEntityType!==undefined?{rawEntityType:row.rawEntityType}:{},decision:'pending',...replacement?{replacement}:{},sources:[{layer:'manual',code:'project-entity-add'}]});seen.add(signature);
 }
 return additions;
}
async function prepareActionFeedback(db:any,d:any,before:Mark[],after:Mark[]){
 const aad=`${d.tenant_id}:${d.project_id}:${d.id}`,canonical=unseal(d.content,aad);
 if(hash(canonical)!==d.content_hash)fail('SOURCE_MISMATCH');
 const name=d.source_name?unseal(d.source_name,aad+':name'):d.id;
 const old=await reviewFeedbackEntities(db,d,before),next=await reviewFeedbackEntities(db,d,after);
 const added=buildReferenceReviewFeedback({producer:'audit-add',documentName:name,before:old,after:next}).records;
 const removed=buildReferenceReviewFeedback({producer:'single-delete',documentName:name,before:old,after:next}).records;
 return{canonical,beforeEntities:old,afterEntities:next,records:[...new Map([...added,...removed].map(r=>[referenceFeedbackKey(r),r])).values()]};
}
async function recordActionFeedback(db:any,req:any,d:any,plan:Awaited<ReturnType<typeof prepareActionFeedback>>){
 if(!plan.records.length)return;
 const {canonical,records}=plan,state=await getHintState(db,req);
 for(const result of records){
  if(canonical.slice(result.startOffset,result.endOffset)!==result.canonicalText)fail('SOURCE_MISMATCH');
  const record=feedbackRecordSchema.parse({id:randomUUID(),file_identifier:d.id,file_name:result.documentName,type:result.feedbackType==='FP'?'false_positive':'false_negative',entity_type:result.entityType,entity_text:result.entityText,start_offset:result.startOffset,end_offset:result.endOffset,context:canonical.slice(Math.max(0,result.startOffset-48),result.endOffset+48),note:result.notes,original_score:result.confidence,projectId:d.project_id,documentId:d.id,documentRevision:d.revision,source_content_hash:d.content_hash,canonical_text:result.canonicalText,semantic_text:result.entityText,feedback_producer:result.feedbackType==='FP'?'single-delete':'audit-add',created_at:result.reviewedAt,os_user:req.user.username});
  await writeFeedback(db,req,record);
 }
 await addFeedbackAudit(db,req,'add_feedback',`项目查漏逐项复核反馈 ${records.length} 条`);
 await saveHintState(db,req,state,state.settings);
}
export function registerProjectEntities(app:FastifyInstance){
 for(const operation of ['preview','apply'] as const)app.post(`/api/projects/:id/known-entities/${operation}`,async req=>{
  const project=id.parse((req.params as any).id),input=inputSchema.parse(req.body);
  return projectScope(req,{project},['view_original','review'],async db=>{
   const {docs,skipped}=await snapshot(db,project,input),deadline=Date.now()+120000;
   try{const {all,results}=await scan(db,docs,req.user.id,deadline),documents=[];
    for(const {d,check,occurrences,geometrySkipped} of results){
     const additions=bulkAuditAdditions(d,check,occurrences,[...all.values()]);
     if(operation==='apply'&&additions.some(m=>m.replacement?.mode==='alias'))await requirePermission(db,project,['view_mapping']);
     let revision=d.revision;
     if(operation==='apply'&&additions.length){
      const before=d.marks as Mark[],next:Mark[]=[...addReviewEntityHints(await readReviewProvenance(db,d),before),...additions],feedbackPlan=await prepareActionFeedback(db,d,before,next);
      revision=(await saveReview(db,req.user.id,d,next,Math.max(1,Math.min(15000,deadline-Date.now())),true)).revision;
      await recordActionFeedback(db,req,d,feedbackPlan);
      const rules=automaticRuntimeRules({producer:'audit-add',scope:'file',before:feedbackPlan.beforeEntities,after:feedbackPlan.afterEntities});
      await queueAutomaticRuntimeRules(db,{tenant:req.user.tenant_id,project,user:req.user.id,document:d.id,revision,scope:'file',rules});
     }
     documents.push({id:d.id,revision,check,occurrences,geometrySkipped,bulkAdditions:additions.length,appliedAdditions:operation==='apply'?additions.length:0});
    }
    return{documents,skipped,entityCount:all.size};
   }catch(e){if((e as any).statusCode||(e as Error).message==='PROCESSING_BUSY')throw e;fail((e as Error).message,400);}
  });
 });
 app.post('/api/projects/:id/known-entities/action',async req=>{
  const project=id.parse((req.params as any).id),input=actionSchema.parse(req.body);
  return projectScope(req,{project},['view_original','review'],async db=>{
   const {docs,skipped}=await snapshot(db,project,input);if(skipped.some(d=>d.id===input.target.documentId))fail('DETECTION_INCOMPLETE');
   const {all,results}=await scan(db,docs,req.user.id,Date.now()+120000),row=results.find(r=>r.d.id===input.target.documentId);if(!row)fail('NOT_FOUND',404);
   const occurrence=row.occurrences.find(o=>sameTarget(o,input.target)&&o.start===input.target.start&&o.end===input.target.end&&(o.hitId??undefined)===input.target.hitId);if(!occurrence)fail('VERSION_CONFLICT');
   if(input.action==='add-one'&&occurrence.category!=='uncovered'||input.action==='replace-other-one'&&occurrence.category!=='other')fail('PROJECT_AUDIT_ACTION_CONFLICT');
   const d=row.d,matchingSeeds=[...all.values()].filter(s=>sameTarget(s,input.target)),seed=matchingSeeds[0];if(!seed)fail('VERSION_CONFLICT');
   const text=unseal(d.content,`${d.tenant_id}:${project}:${d.id}`);if(hash(text)!==d.content_hash||input.target.end>text.length)fail('SOURCE_MISMATCH');
   const policyUnambiguous=matchingSeeds.every(s=>JSON.stringify(s.replacement??null)===JSON.stringify(seed.replacement??null));
   const replacement=policyUnambiguous&&seed.replacement&& (seed.replacement.mode!=='alias'||text.slice(input.target.start,input.target.end)===seed.value)?seed.replacement:undefined;
   if(replacement?.mode==='alias')await requirePermission(db,project,['view_mapping']);
   const added:Mark={start:input.target.start,end:input.target.end,kind:seed.kind,...seed.rawEntityType!==undefined?{rawEntityType:seed.rawEntityType}:{},decision:'pending',...replacement?{replacement}:{},sources:[{layer:'manual',code:'project-entity-add'}]};
   const before=d.marks as Mark[],removed=occurrence.category==='other'?before[occurrence.otherIndex!]:undefined;
   const beforeWithIds=addReviewEntityHints(await readReviewProvenance(db,d),before);
   const next:Mark[]=[...beforeWithIds.filter((_,index)=>index!==occurrence.otherIndex),added];
   const oldPagePolicy=removed?openPageReview(d):null;
   const pagePolicy=oldPagePolicy?pruneEntityGeometryRegions(beforeWithIds,next,oldPagePolicy):undefined;
   const feedbackPlan=await prepareActionFeedback(db,d,before,next);
   const revision=(await saveReview(db,req.user.id,d,next,15000,true,pagePolicy)).revision;
   await recordActionFeedback(db,req,d,feedbackPlan);
   // The official semantic hydration path also feeds the active-task rule
   // producer. A corrected OCR value must not become a rule for raw glyph text.
   const rules=automaticRuntimeRules({producer:'audit-add',scope:'file',before:feedbackPlan.beforeEntities,after:feedbackPlan.afterEntities});
   const runtime=await queueAutomaticRuntimeRules(db,{tenant:req.user.tenant_id,project,user:req.user.id,document:d.id,revision,scope:'file',rules});
   return{documentId:d.id,revision,action:input.action,added,removed:removed??null,runtime,skipped};
  });
 });
}
