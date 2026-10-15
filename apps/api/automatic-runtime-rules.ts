import {wordManualOccurrences,pdfManualOccurrences,imageManualOccurrences} from '../../packages/contracts/manual-selection.ts';
import {documentProcessingFormat} from '../../packages/core/document-format.ts';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {id,reviewMarkSchema,FILE_MAX_BYTES} from '../../packages/contracts/index.ts';
import {automaticRuntimeRules} from '../../packages/core/reference-runtime-rule-producer.ts';
import type {ReviewFeedbackEntity} from '../../packages/core/reference-review-feedback.ts';
import {matchReviewEntitySlots,activeReviewEntitySlots} from '../../packages/core/review-entity-slots.ts';
import {reviewMarks} from '../../packages/core/redaction.ts';
import {validateFileMarks} from '../../packages/core/files.ts';
import {entityIdentity} from '../../packages/core/entity-identity.ts';
import {canonicalRuleEntityType} from '../../packages/core/presets.ts';
import {semanticEntityValue} from '../../packages/core/entity-corrections.ts';
import {hydrateEntityCorrections} from '../../packages/adapters/entity-corrections.ts';
import {readReviewProvenance} from '../../packages/adapters/review-provenance.ts';
import {verifiedDocumentSource} from '../../packages/adapters/document-source.ts';
import {queueAutomaticRuntimeRules} from '../../packages/adapters/automatic-runtime-rules.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {hash,unseal} from '../../packages/adapters/storage.ts';
import {projectScope} from './access.ts';
function fail(message:string,statusCode=409):never{throw Object.assign(new Error(message),{statusCode});}
export function registerAutomaticRuntimeRuleRoutes(app:FastifyInstance){
 app.post('/api/documents/:id/runtime-rules/automatic',{bodyLimit:FILE_MAX_BYTES},async req=>{
  const document=id.parse((req.params as any).id),input=z.object({revision:z.number().int().nonnegative(),producer:z.enum(['manual-add','audit-add','one-click-add']),before:z.array(reviewMarkSchema),after:z.array(reviewMarkSchema),scope:z.enum(['file','project','spot']).default('file'),selection:z.object({start:z.number().int().nonnegative(),end:z.number().int().positive(),entityType:z.string().trim().min(1).refine(v=>v.isWellFormed()&&!v.includes('\0')),pattern:z.string().trim().min(1).refine(v=>v.isWellFormed()&&!v.includes('\0'))}).strict().optional()}).strict().parse(req.body);
  return projectScope(req,{document},['view_original','review'],async db=>{
   const[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${document} FOR SHARE`);if(!d)fail('NOT_FOUND',404);if(input.revision!==d.revision)fail('VERSION_CONFLICT');
   if(input.scope==='spot'&&input.producer!=='audit-add')return{success:true,appliedToTasks:0,whitelistApplied:0,added:false,immediateOnly:true};
   if(d.source_id){try{await verifiedDocumentSource(d);}catch{fail('SOURCE_MISMATCH');}}else if(d.source_format!=='txt'||d.source_hash!==null)fail('SOURCE_MISMATCH');const canonical=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);if(hash(canonical)!==d.content_hash)fail('SOURCE_MISMATCH');
   const frame=await readReviewProvenance(db,d),slots=activeReviewEntitySlots(frame,d.marks),semantic=hydrateEntityCorrections(d);
   const entities=(incoming:typeof input.before):ReviewFeedbackEntity[]=>{
    const matched=matchReviewEntitySlots(frame,d.marks,incoming),byAfter=new Map(matched.links.map(link=>[link.afterIndex,link.beforeIndex])),marks=matched.marks.map((m,index)=>reviewMarks(byAfter.has(index)?[d.marks[byAfter.get(index)!]]:[],[m])[0]);
    try{validateFileMarks(canonical,marks,d.source_format,d.anchors);}catch{fail('INVALID_MARKS',400);}
    return marks.map((m,index)=>{const old=byAfter.get(index),entry=old===undefined?undefined:slots.get(old),value=old===undefined?canonical.slice(m.start,m.end):semanticEntityValue(semantic,m,canonical,old);return{id:entry?.id??`draft:${JSON.stringify([entityIdentity(m),m.start,m.end])}`,type:m.rawEntityType??canonicalRuleEntityType(m.kind),...m.rawEntityType!==undefined?{rawEntityType:m.rawEntityType}:{},text:value,startOffset:m.start,endOffset:m.end,deleted:m.hiddenByType===true||m.decision==='ignore'};});
   };
   const before=entities(input.before),after=entities(input.after),scope=input.producer==='audit-add'?'file':input.scope,rules=automaticRuntimeRules({producer:input.producer,before,after,scope});
   if(input.selection){const selection=input.selection;if((input.producer!=='manual-add'&&!(input.producer==='one-click-add'&&documentProcessingFormat(d)==='pdf'))||selection.end<=selection.start||selection.end>canonical.length)fail('RUNTIME_RULE_SELECTION_INVALID',400);const covering=before.find(e=>!e.deleted&&e.startOffset<=selection.start&&e.endOffset>=selection.end&&after.some(a=>!a.deleted&&a.id===e.id));if(!covering)fail('RUNTIME_RULE_SELECTION_INVALID',400);const actual=canonical.slice(selection.start,selection.end).trim(),corrected=covering.startOffset===selection.start&&covering.endOffset===selection.end?covering.text.trim():undefined;const format=documentProcessingFormat(d),matcher=format==='pdf'?pdfManualOccurrences:['png','jpg','jpeg'].includes(format)?imageManualOccurrences:wordManualOccurrences,equals=(value:string)=>matcher(value,selection.pattern).some(m=>m.start===0&&m.end===value.length);if(!equals(actual)&&!(corrected!==undefined&&equals(corrected)))fail('RUNTIME_RULE_SELECTION_INVALID',400);if(!rules.some(r=>r.entityType===selection.entityType&&r.pattern===selection.pattern))rules.push({entityType:selection.entityType,pattern:selection.pattern});}

   return{...await queueAutomaticRuntimeRules(db,{tenant:req.user.tenant_id,project:d.project_id,user:req.user.id,document:d.id,revision:d.revision,scope,rules}),deliveryMode:'active-task-only'};
  });
 });
}
