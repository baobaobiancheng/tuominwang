import type {Anchor,Mark} from '../contracts/index.ts';
import {MAX_MARKS} from '../contracts/index.ts';
import {sourceEntityMark,sameEntity} from './entity-identity.ts';
export type RuntimeWhitelist={entityType:string;pattern:string};
export function runtimeRuleKind(entityType:string):Mark['kind']|undefined {try{return sourceEntityMark(entityType).kind;}catch{return undefined;}}
/** Independent applyLearnedWhitelist (main.js:9439–9463). It is a literal whitelist,
 * including source bracket/Chinese-space variants, not a regular-expression evaluator. */
export function runtimeWhitelistCandidates(text:string,anchors:readonly Anchor[],existing:readonly Mark[],rules:readonly RuntimeWhitelist[]):Mark[]{
 if(!text.isWellFormed())throw new Error('RUNTIME_RULE_INVALID');const marks:Mark[]=[],bound=(a:number,b:number)=>!anchors.length||anchors.some(p=>p.start<=a&&p.end>=b),safe=(n:number)=>!(n>0&&n<text.length&&/[\uD800-\uDBFF]/u.test(text[n-1])&&/[\uDC00-\uDFFF]/u.test(text[n]));
 for(const r of rules){if(!r.pattern.trim()||!r.pattern.isWellFormed())throw new Error('RUNTIME_RULE_INVALID');let identity;try{identity=sourceEntityMark(r.entityType,r.pattern);}catch{throw new Error('RUNTIME_RULE_INVALID');}const normalized=r.pattern.replace(/([\u2e80-\u9fff])\s+([\u2e80-\u9fff])/gu,'$1$2').replace(/([0-9])\s+([\u2e80-\u9fff])/gu,'$1$2').replace(/([\u2e80-\u9fff])\s+([0-9])/gu,'$1$2'),variants=new Set([r.pattern,normalized].flatMap(v=>[v,v.replace(/[()]/gu,c=>c==='('? '（':'）'),v.replace(/[（）]/gu,c=>c==='（'?'(':')')]));for(const value of variants)for(let start=text.indexOf(value);start>=0;start=text.indexOf(value,start+1)){const end=start+value.length;if(!bound(start,end)||!safe(start)||!safe(end)||[...existing,...marks].some(m=>sameEntity(m,identity)&&start<m.end&&end>m.start))continue;marks.push({start,end,...identity,decision:'pending',sources:[{layer:'rules',code:'runtime-whitelist',score:.99},{layer:'rules',code:r.entityType==='org_name'?'runtime-mask-org': ['address','address_label','address_inline'].includes(r.entityType)?'runtime-mask-address':'runtime-mask-default',score:.99}]});if(existing.length+marks.length>MAX_MARKS)throw new Error('MARK_LIMIT');}}
 return marks;
}
