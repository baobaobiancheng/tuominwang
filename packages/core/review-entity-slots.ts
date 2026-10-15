import{isDeepStrictEqual}from'node:util';
import type{Mark}from'../contracts/index.ts';import{entitySpanKey}from'./entity-identity.ts';import type{ReviewProvenance,ReviewEntityMetadata}from'./review-provenance.ts';
export type ReviewEntityHint=Mark&{reviewEntityId?:string};
export type ReviewEntityLink={beforeIndex:number;afterIndex:number};
function fail(code='REVIEW_ENTITY_ID_INVALID'):never{throw Object.assign(new Error(code),{statusCode:409});}
export function stripReviewEntityHint(mark:ReviewEntityHint):Mark{const{reviewEntityId:_,...stored}=mark;return stored;}
/** The frame is server authenticated. An ID is only an identity hint, never a
 * capability: it must be an active slot of this exact current document frame. */
export function activeReviewEntitySlots(previous:ReviewProvenance,before:Mark[]){const slots=new Map<number,ReviewEntityMetadata>(),ids=new Set<string>();for(const entry of previous.entries.filter(e=>e.active)){if(!Number.isSafeInteger(entry.markIndex)||!before[entry.markIndex]||entry.key!==entitySpanKey(before[entry.markIndex])||slots.has(entry.markIndex)||ids.has(entry.id))fail('REVIEW_PROVENANCE_INVALID');slots.set(entry.markIndex,entry);ids.add(entry.id);}if(slots.size!==before.length)fail('REVIEW_PROVENANCE_INVALID');return slots;}
export function addReviewEntityHints(previous:ReviewProvenance,marks:Mark[]):ReviewEntityHint[]{const slots=activeReviewEntitySlots(previous,marks);return marks.map((mark,index)=>({...stripReviewEntityHint(mark),reviewEntityId:slots.get(index)!.id}));}
/** Exact producer links bypass inference and remain one-to-one. No equality of
 * original text is used to prove a changed entity's identity. */
export function explicitReviewEntitySlots(previous:ReviewProvenance,before:Mark[],after:Mark[],links:ReviewEntityLink[]){const slots=activeReviewEntitySlots(previous,before),used=new Set<number>(),priorByAfter=new Map<number,ReviewEntityMetadata>();for(const link of links){if(!Number.isSafeInteger(link.beforeIndex)||!Number.isSafeInteger(link.afterIndex)||!before[link.beforeIndex]||!after[link.afterIndex]||used.has(link.beforeIndex)||priorByAfter.has(link.afterIndex))fail('REVIEW_PROVENANCE_REBIND_INVALID');used.add(link.beforeIndex);priorByAfter.set(link.afterIndex,slots.get(link.beforeIndex)!);}return priorByAfter;}
/** Older callers without hints remain compatible when identity is provable.
 * Completely identical duplicate records with a deletion/change require a
 * current opaque ID rather than guessing which independent history survived. */
export function matchReviewEntitySlots(previous:ReviewProvenance,before:Mark[],incoming:ReviewEntityHint[]){const slots=activeReviewEntitySlots(previous,before),byId=new Map([...slots].map(([index,e])=>[e.id,{index,entry:e}])),marks=incoming.map(stripReviewEntityHint),priorByAfter=new Map<number,ReviewEntityMetadata>(),used=new Set<number>();const bind=(index:number,oldIndex:number)=>{if(used.has(oldIndex)||priorByAfter.has(index))fail();used.add(oldIndex);priorByAfter.set(index,slots.get(oldIndex)!);};
 for(const[index,mark]of incoming.entries())if(mark.reviewEntityId!==undefined){if(!/^entity_[a-f0-9]{32}$/u.test(mark.reviewEntityId))fail();const match=byId.get(mark.reviewEntityId);if(!match)fail();bind(index,match.index);}
 const equal=(a:Mark,b:Mark)=>isDeepStrictEqual(stripReviewEntityHint(a),stripReviewEntityHint(b));
 if(before.length===marks.length&&before.every((m,i)=>equal(m,marks[i]))){for(let i=0;i<marks.length;i++)if(!priorByAfter.has(i)&&!used.has(i))bind(i,i);}
 // Full-record and entity-key indexes make a full legitimate bulk review
 // linear in record count instead of repeatedly scanning the entire document.
 const stable=(value:unknown):unknown=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):value;
 const signature=(mark:Mark)=>JSON.stringify(stable(stripReviewEntityHint(mark))),recordBefore=new Map<string,number[]>(),recordAfter=new Map<string,number[]>(),append=(map:Map<string,number[]>,key:string,index:number)=>{const values=map.get(key);if(values)values.push(index);else map.set(key,[index]);};
 before.forEach((mark,index)=>{if(!used.has(index))append(recordBefore,signature(mark),index);});marks.forEach((mark,index)=>{if(!priorByAfter.has(index))append(recordAfter,signature(mark),index);});
 for(const[key,afterIndices]of recordAfter){const oldIndices=recordBefore.get(key)??[];if(oldIndices.length===1&&afterIndices.length===1&&equal(before[oldIndices[0]],marks[afterIndices[0]]))bind(afterIndices[0],oldIndices[0]);}
 const keyBefore=new Map<string,number[]>(),keyAfter=new Map<string,number[]>(),allBeforeKeys=new Set(before.map(entitySpanKey));before.forEach((mark,index)=>{if(!used.has(index))append(keyBefore,entitySpanKey(mark),index);});marks.forEach((mark,index)=>{if(!priorByAfter.has(index))append(keyAfter,entitySpanKey(mark),index);});
 for(const[key,afterIndices]of keyAfter){const oldIndices=keyBefore.get(key)??[];if(!oldIndices.length)continue;if(oldIndices.length===1&&afterIndices.length===1){bind(afterIndices[0],oldIndices[0]);continue;}const oldSet=new Set(oldIndices);if(oldIndices.length===afterIndices.length&&afterIndices.every(i=>oldSet.has(i)&&equal(before[i],marks[i]))){for(const index of afterIndices)bind(index,index);continue;}fail('REVIEW_ENTITY_ID_REQUIRED');}
 // Unambiguous single retired-slot resurrection preserves the existing legacy
 // one-slot lifecycle. Multiple retired histories never get guessed by value.
 const retiredByKey=new Map<string,ReviewEntityMetadata[]>(),claimedIds=new Set([...priorByAfter.values()].map(e=>e.id));for(const entry of previous.entries)if(!entry.active){const values=retiredByKey.get(entry.key);if(values)values.push(entry);else retiredByKey.set(entry.key,[entry]);}
 for(const[index,mark]of marks.entries())if(!priorByAfter.has(index)&&!allBeforeKeys.has(entitySpanKey(mark))){const retired=retiredByKey.get(entitySpanKey(mark))??[];if(retired.length===1&&!claimedIds.has(retired[0].id)){priorByAfter.set(index,retired[0]);claimedIds.add(retired[0].id);}}
 const links=[...priorByAfter].flatMap(([afterIndex,entry])=>entry.active?[{beforeIndex:entry.markIndex,afterIndex}]:[]);return{marks,links,priorByAfter};}
