import {reviewEntityBirth} from '../../packages/core/review-entity-birth.ts';
import type {Mark} from '../../packages/contracts/index.ts';
import type {ReviewFeedbackEntity} from '../../packages/core/reference-review-feedback.ts';
import {matchReviewEntitySlots,activeReviewEntitySlots} from '../../packages/core/review-entity-slots.ts';
import {reviewMarks} from '../../packages/core/redaction.ts';
import {validateFileMarks} from '../../packages/core/files.ts';
import {entityIdentity} from '../../packages/core/entity-identity.ts';
import {canonicalRuleEntityType} from '../../packages/core/presets.ts';
import {semanticEntityValue} from '../../packages/core/entity-corrections.ts';
import {hydrateEntityCorrections} from '../../packages/adapters/entity-corrections.ts';
import {readReviewProvenance} from '../../packages/adapters/review-provenance.ts';
import {hash,unseal} from '../../packages/adapters/storage.ts';

/** Shared, source-bound entity view for formal review feedback and project audit.
 * Matching against the saved slots preserves corrected semantic text separately
 * from immutable canonical text, including OCR entity corrections. */
export async function reviewFeedbackEntities(db:any,d:any,incoming:Mark[]):Promise<ReviewFeedbackEntity[]>{
 const aad=`${d.tenant_id}:${d.project_id}:${d.id}`,canonical=unseal(d.content,aad);
 if(hash(canonical)!==d.content_hash)throw Error('SOURCE_MISMATCH');
 const frame=await readReviewProvenance(db,d),slots=activeReviewEntitySlots(frame,d.marks),semantic=hydrateEntityCorrections(d);
 const matched=matchReviewEntitySlots(frame,d.marks,incoming),byAfter=new Map(matched.links.map(link=>[link.afterIndex,link.beforeIndex]));
 const marks=matched.marks.map((m,index)=>reviewMarks(byAfter.has(index)?[d.marks[byAfter.get(index)!]]:[],[m])[0]);
 validateFileMarks(canonical,marks,d.source_format,d.anchors);
 return marks.map((m,index)=>{const old=byAfter.get(index),entry=old===undefined?undefined:slots.get(old),value=old===undefined?canonical.slice(m.start,m.end):semanticEntityValue(semantic,m,canonical,old);
  return{id:entry?.id??`draft:${JSON.stringify([entityIdentity(m),m.start,m.end])}`,type:m.rawEntityType??canonicalRuleEntityType(m.kind),...m.rawEntityType!==undefined?{rawEntityType:m.rawEntityType}:{},text:value,canonicalText:canonical.slice(m.start,m.end),startOffset:m.start,endOffset:m.end,score:m.sources?.reduce((best,s)=>Math.max(best,s.score??0),0)??0,deleted:m.hiddenByType===true,userAdded:old===undefined?true:reviewEntityBirth(d.marks[old],entry),markIndex:index};});
}
