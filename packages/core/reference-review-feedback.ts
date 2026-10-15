import type{ReviewMark}from'../contracts/index.ts';
import{referenceUiBaseType}from'./reference-alias-lifecycle.ts';
export type ReviewFeedbackCause={producer:ReviewFeedbackProducer;before:ReviewMark[];after:ReviewMark[];note?:string};
export type ReviewFeedbackProducer='manual-add'|'audit-add'|'one-click-add'|'single-delete'|'tree-delete'|'type-hide';
export type ReviewFeedbackEntity={id:string;type:string;rawEntityType?:string;text:string;canonicalText?:string;startOffset:number;endOffset:number;score?:number;deleted?:boolean;userAdded?:boolean;markIndex?:number};
export type ReferenceReviewFeedback={documentName:string;entityType:string;entityText:string;canonicalText?:string;feedbackType:'FP'|'FN';startOffset:number;endOffset:number;confidence?:number;reviewedBy:'user';reviewedAt:string;notes:string;markIndex?:number};
export const referenceFeedbackKey=(r:Pick<ReferenceReviewFeedback,'documentName'|'entityType'|'startOffset'|'endOffset'|'feedbackType'>)=>`${r.documentName}|${r.entityType}|${r.startOffset}|${r.endOffset}|${r.feedbackType}`;
const normalize=(s:string)=>s.trim().replace(/\s+/gu,'').replaceAll('（','(').replaceAll('）',')').replaceAll('，',',').replaceAll('。','.').replaceAll('：',':').replaceAll('；',';');
const family=(e:ReviewFeedbackEntity)=>e.rawEntityType!==undefined?`raw:${JSON.stringify(e.rawEntityType)}`:e.type.trim().startsWith('raw_')?'other':referenceUiBaseType(e.type);
const location=(e:ReviewFeedbackEntity)=>JSON.stringify([family(e),e.startOffset,e.endOffset]);
function record(e:ReviewFeedbackEntity,documentName:string,type:'FP'|'FN',notes:string,now:string):ReferenceReviewFeedback{return{documentName:documentName||'未命名文档',entityType:e.type,entityText:e.text,...e.canonicalText!==undefined?{canonicalText:e.canonicalText}:{},feedbackType:type,startOffset:e.startOffset,endOffset:e.endOffset,...e.score!==undefined?{confidence:e.score}:{},reviewedBy:'user',reviewedAt:now,notes,...e.markIndex!==undefined?{markIndex:e.markIndex}:{}};}
/** Source shared Word/Markdown gn2/Ql2/eu2/Co2. The cause is an explicit user
 * producer. A generic keep/ignore or replacement change is never inferred FP. */
export function buildReferenceReviewFeedback(input:{producer:ReviewFeedbackProducer;documentName:string;before:ReviewFeedbackEntity[];after:ReviewFeedbackEntity[];note?:string;now?:string;saveFeedback?:boolean;countAsFp?:boolean}){
 const {producer,before,after}=input,now=input.now??new Date().toISOString();if(producer==='type-hide'||input.saveFeedback===false)return{records:[] as ReferenceReviewFeedback[],counterDelta:{fp:0,fn:0}};
 const oldIds=new Map(before.filter(e=>!e.deleted).map(e=>[e.id,e])),newIds=new Map(after.filter(e=>!e.deleted).map(e=>[e.id,e]));
 if(producer.endsWith('-add')){const occupied=new Set(before.filter(e=>!e.deleted).map(location)),added=after.filter(e=>{if(e.deleted||oldIds.has(e.id)||occupied.has(location(e)))return false;occupied.add(location(e));return true;}),note=input.note??(producer==='manual-add'?'用户手动补录（漏报）':producer==='one-click-add'?`用户一键补录（漏报，共 ${added.length} 处）`:'用户全文检查补录（漏报）');const chosen=producer==='one-click-add'?added.slice(0,1):added;return{records:chosen.map(e=>record({...e,score:1},input.documentName,'FN',note,now)),counterDelta:{fp:0,fn:added.length}};}
 const removed=before.filter(e=>!e.deleted&&!newIds.has(e.id)),note=input.note??(producer==='single-delete'?'用户右键删除（误报）':'用户删除：按原文分组批量删除（误报）');if(!removed.length)return{records:[],counterDelta:{fp:0,fn:0}};
 if(producer==='single-delete')return{records:[record(removed[0],input.documentName,'FP',note,now)],counterDelta:{fp:removed.length,fn:0}};
 const groups=new Map<string,{entity:ReviewFeedbackEntity;count:number}>();for(const e of removed){const key=JSON.stringify([family(e),normalize(e.text)]),g=groups.get(key);if(g)g.count++;else groups.set(key,{entity:e,count:1});}
 const userCount=removed.filter(e=>e.userAdded).length;return{records:[...groups.values()].map(({entity,count})=>record(entity,input.documentName,'FP',count>1?`${note}（共 ${count} 处）`:note,now)),counterDelta:{fp:input.countAsFp===false?0:removed.length-userCount,fn:-userCount}};
}
