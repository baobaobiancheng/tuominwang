import {reviewEntityBirth}from'./review-entity-birth.ts';
import{matchReviewEntitySlots,explicitReviewEntitySlots,stripReviewEntityHint,type ReviewEntityLink,type ReviewEntityHint}from'./review-entity-slots.ts';
export{matchReviewEntitySlots,addReviewEntityHints,stripReviewEntityHint}from'./review-entity-slots.ts';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {Mark} from '../contracts/index.ts';
import {entitySpanKey,entityLabel} from './entity-identity.ts';

export type ReviewState='pending'|'confirmed'|'rejected'|'user-added';
export type ProvenanceEvent={phase:'detect'|'review';source:string;action:string;positionSnapshot:{start:number;end:number};timestamp?:string;actorId?:string};
export type ReviewEntityMetadata={id:string;key:string;start:number;end:number;kind:Mark['kind'];rawEntityType?:string;active:boolean;markIndex:number;meta:{userAdded?:boolean;hiddenByType?:boolean;hiddenTypeWasUserAdded?:boolean;detectionSource?:string;operationSource?:string;sourceChain:ProvenanceEvent[];reviewState:{entityId:string;status:ReviewState;operationSource?:string;editedType:string;editedRange:{start:number;end:number};note?:string;updatedAt?:string;actorId?:string}}};
/** Text is held once in the encrypted snapshot, rather than repeated for overlapping entities. */
export type ReviewProvenance={version:1;documentId:string;contentHash:string;revision:number;capturedFromRevision:number;earlierHistoryKnown:boolean;recordedAt?:string;entries:ReviewEntityMetadata[]};
export type ProvenanceContext={documentId:string;contentHash:string;revision:number};
const status=(m:Mark):ReviewState=>m.decision==='ignore'?'rejected':m.decision==='redact'?'confirmed':'pending';
function initialEntry(ctx:ProvenanceContext,m:Mark,slot=0,index=0):ReviewEntityMetadata{
 const key=entitySpanKey(m),id='entity_'+createHash('sha256').update(JSON.stringify([ctx.documentId,ctx.contentHash,key,slot])).digest('hex').slice(0,32),source=m.sources?.find(s=>s.layer!=='manual')?.code,manual=m.sources?.some(s=>s.layer==='manual');
 return{id,key,start:m.start,end:m.end,kind:m.kind,...m.rawEntityType!==undefined?{rawEntityType:m.rawEntityType}:{},active:true,markIndex:index,meta:{userAdded:reviewEntityBirth(m),...m.hiddenByType?{hiddenByType:true,hiddenTypeWasUserAdded:m.hiddenTypeWasUserAdded??reviewEntityBirth(m)}:{},...source?{detectionSource:source}:{},...manual?{operationSource:'manual'}:{},sourceChain:[{phase:'detect',source:source??(manual?'manual':'unknown'),action:'observed-current-state',positionSnapshot:{start:m.start,end:m.end}}],reviewState:{entityId:id,status:status(m),editedType:entityLabel(m),editedRange:{start:m.start,end:m.end},note:'来源为当前状态；未推定此前操作人或时间'}}};
}
export function freshReviewProvenanceEntry(ctx:ProvenanceContext,mark:Mark,index:number,reserved:Set<string>,nextSlots=new Map<string,number>()){const key=entitySpanKey(mark);let slot=nextSlots.get(key)??0,entry=initialEntry(ctx,mark,slot,index);while(reserved.has(entry.id))entry=initialEntry(ctx,mark,++slot,index);nextSlots.set(key,slot+1);reserved.add(entry.id);return entry;}
export function deriveReviewProvenance(ctx:ProvenanceContext,marks:Mark[]):ReviewProvenance{
 const counts=new Map<string,number>();return{version:1,...ctx,capturedFromRevision:ctx.revision,earlierHistoryKnown:false,entries:marks.map((m,index)=>{const key=entitySpanKey(m),slot=counts.get(key)??0;counts.set(key,slot+1);return initialEntry(ctx,m,slot,index);})};
}
export function assertReviewProvenance(frame:ReviewProvenance,ctx:ProvenanceContext){
 if(frame?.version!==1||frame.documentId!==ctx.documentId||frame.contentHash!==ctx.contentHash||frame.revision!==ctx.revision||!Array.isArray(frame.entries)||new Set(frame.entries.map(e=>e.id)).size!==frame.entries.length)throw new Error('REVIEW_PROVENANCE_INVALID');
 const activeIndices=new Set<number>();for(const entry of frame.entries.filter(e=>e.active)){if(activeIndices.has(entry.markIndex))throw new Error('REVIEW_PROVENANCE_INVALID');activeIndices.add(entry.markIndex);}
 for(const e of frame.entries)if(!/^entity_[a-f0-9]{32}$/u.test(e.id)||!Number.isInteger(e.markIndex)||e.markIndex<0||!Number.isInteger(e.start)||!Number.isInteger(e.end)||e.start<0||e.end<=e.start||e.key!==entitySpanKey(e)||e.meta?.reviewState?.entityId!==e.id||e.meta.reviewState.editedRange?.start!==e.start||e.meta.reviewState.editedRange?.end!==e.end||!['pending','confirmed','rejected','user-added'].includes(e.meta.reviewState.status)||!Array.isArray(e.meta.sourceChain))throw new Error('REVIEW_PROVENANCE_INVALID');
}
export function transitionReviewProvenance(previous:ReviewProvenance,ctx:ProvenanceContext,before:Mark[],incoming:ReviewEntityHint[],actorId:string,now:string,links?:ReviewEntityLink[]):ReviewProvenance{
 assertReviewProvenance(previous,{...ctx,revision:ctx.revision-1});
 const after=incoming.map(stripReviewEntityHint),matched=links===undefined?matchReviewEntitySlots(previous,before,incoming).priorByAfter:explicitReviewEntitySlots(previous,before,after,links),reserved=new Set(previous.entries.map(e=>e.id)),nextSlots=new Map<string,number>(),used=new Set<string>(),entries:ReviewEntityMetadata[]=[];
 // Legacy single-tombstone resurrection is unambiguous. Index historical
 // keys once so a large fresh review does not scan the entire old frame per row.
 const beforeKeys=new Set(before.map(entitySpanKey)),retiredByKey=new Map<string,ReviewEntityMetadata[]>(),claimed=new Set([...matched.values()].map(e=>e.id));for(const entry of previous.entries)if(!entry.active){const values=retiredByKey.get(entry.key);if(values)values.push(entry);else retiredByKey.set(entry.key,[entry]);}
 for(const[index,mark]of after.entries())if(!matched.has(index)&&!beforeKeys.has(entitySpanKey(mark))){const retired=retiredByKey.get(entitySpanKey(mark))??[];if(retired.length===1&&!claimed.has(retired[0].id)){matched.set(index,retired[0]);claimed.add(retired[0].id);}}
 for(const[index,mark]of after.entries()){
  const prior=matched.get(index),old=prior?.active?before[prior.markIndex]:undefined,entry=structuredClone(prior??freshReviewProvenanceEntry(ctx,mark,index,reserved,nextSlots));if(used.has(entry.id))throw new Error('REVIEW_ENTITY_ID_INVALID');used.add(entry.id);
  entry.key=entitySpanKey(mark);entry.start=mark.start;entry.end=mark.end;entry.kind=mark.kind;delete entry.rawEntityType;if(mark.rawEntityType!==undefined)entry.rawEntityType=mark.rawEntityType;entry.active=true;entry.markIndex=index;
  const identityChanged=!!old&&(old.start!==mark.start||old.end!==mark.end||entitySpanKey(old)!==entitySpanKey(mark)),changed=!old||identityChanged||old.decision!==mark.decision||!isDeepStrictEqual(old.replacement,mark.replacement)||old.replacementOrigin!==mark.replacementOrigin||old.rasterReplacement!==mark.rasterReplacement||!!old.hiddenByType!==!!mark.hiddenByType;
  const birth=old?reviewEntityBirth(old,prior):reviewEntityBirth(mark);entry.meta.userAdded=birth;delete entry.meta.hiddenByType;delete entry.meta.hiddenTypeWasUserAdded;if(mark.hiddenByType){entry.meta.hiddenByType=true;entry.meta.hiddenTypeWasUserAdded=birth;}
  if(changed){const action=old&&!!old.hiddenByType!==!!mark.hiddenByType?mark.hiddenByType?'type-hidden':'type-restored':!old?'entity-added':identityChanged?'entity-edited':old.decision!==mark.decision?mark.decision==='ignore'?'entity-rejected':mark.decision==='redact'?'entity-confirmed':'review-reset':'replacement-changed';entry.meta.operationSource='user';entry.meta.reviewState={entityId:entry.id,status:mark.decision==='pending'&&(!old||action==='type-restored')&&birth?'user-added':status(mark),operationSource:'user',editedType:entityLabel(mark),editedRange:{start:mark.start,end:mark.end},note:action,updatedAt:now,actorId};entry.meta.sourceChain=[...entry.meta.sourceChain,{phase:'review' as const,source:'user',action,positionSnapshot:{start:mark.start,end:mark.end},timestamp:now,actorId}];}
  entries.push(entry);
 }
 for(const old of previous.entries){if(used.has(old.id))continue;const entry=structuredClone(old);if(entry.active){entry.active=false;entry.meta.operationSource='user';entry.meta.reviewState={...entry.meta.reviewState,status:'rejected',operationSource:'user',note:'entity-removed',updatedAt:now,actorId};entry.meta.sourceChain=[...entry.meta.sourceChain,{phase:'review' as const,source:'user',action:'entity-removed',positionSnapshot:{start:entry.start,end:entry.end},timestamp:now,actorId}];}entries.push(entry);}
 const frame={...previous,...ctx,recordedAt:now,entries};assertReviewProvenance(frame,ctx);return frame;
}
export function referenceReviewMetadata(entry:ReviewEntityMetadata,text:string){
 if(entry.end>text.length)throw new Error('REVIEW_PROVENANCE_INVALID');
 const {editedRange,...state}=entry.meta.reviewState;
 return{...entry.meta,reviewState:{...state,editedText:text.slice(editedRange.start,editedRange.end)}};
}
