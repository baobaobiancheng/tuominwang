import{explicitReviewEntitySlots}from'./review-entity-slots.ts';
import type{Mark}from'../contracts/index.ts';import{entitySpanKey,entityLabel}from'./entity-identity.ts';import{freshReviewProvenanceEntry,assertReviewProvenance,type ReviewProvenance,type ProvenanceContext}from'./review-provenance.ts';
export type ProvenanceRebinding={beforeIndex:number;afterIndex:number};
/** Trusted mutation code supplies exact old/new indices. Equal text alone is
 * never an identity proof. Historical text domains stay in immutable history. */
export function rebindReviewProvenance(previous:ReviewProvenance,oldText:string,ctx:ProvenanceContext,newText:string,before:Mark[],after:Mark[],links:ProvenanceRebinding[],actorId:string,operation:string,now:string):ReviewProvenance{
 assertReviewProvenance(previous,{documentId:ctx.documentId,contentHash:previous.contentHash,revision:ctx.revision-1});
 const fail=():never=>{throw Error('REVIEW_PROVENANCE_REBIND_INVALID');},matched=explicitReviewEntitySlots(previous,before,after,links),reserved=new Set(previous.entries.map(e=>e.id)),nextSlots=new Map<string,number>();
 const entries=after.map((mark,index)=>{const old=matched.get(index);if(!old)return freshReviewProvenanceEntry(ctx,mark,index,reserved,nextSlots);const retained=structuredClone(old),status=mark.decision==='ignore'?'rejected':mark.decision==='pending'?'pending':old.meta.reviewState.status==='user-added'?'user-added':'confirmed',entry={key:entitySpanKey(mark)};
  retained.key=entry.key;retained.start=mark.start;retained.end=mark.end;retained.kind=mark.kind;retained.markIndex=index;retained.active=true;delete retained.rawEntityType;if(mark.rawEntityType!==undefined)retained.rawEntityType=mark.rawEntityType;
  const changed=old.start!==mark.start||old.end!==mark.end||old.kind!==mark.kind||old.rawEntityType!==mark.rawEntityType||oldText.slice(old.start,old.end)!==newText.slice(mark.start,mark.end)||old.meta.reviewState.status!==status;
  retained.meta.reviewState={...retained.meta.reviewState,editedType:entityLabel(mark),editedRange:{start:mark.start,end:mark.end},status,...changed?{note:operation,updatedAt:now,actorId}:{}};
  retained.meta.sourceChain.push({phase:'review',source:operation,action:'entity-rebound',positionSnapshot:{start:mark.start,end:mark.end},timestamp:now,actorId});return retained;
 });
 const ids=new Set(entries.map(e=>e.id));if(ids.size!==entries.length)fail();if(ctx.contentHash===previous.contentHash)for(const old of previous.entries.filter(e=>!e.active&&!ids.has(e.id)))entries.push(structuredClone(old));
 const frame={...previous,...ctx,recordedAt:now,entries};assertReviewProvenance(frame,ctx);return frame;
}
