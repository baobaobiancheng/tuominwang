import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {Mark} from '../contracts/index.ts';
import {entitySpanKey} from './entity-identity.ts';
import {MAX_MARKS} from '../contracts/index.ts';
import type {ReviewEntityLink} from './review-entity-slots.ts';
const fail=():never=>{throw Object.assign(new Error('SIGNATURE_GROUP_INVALID'),{statusCode:409});};
/** Location binds equal names appearing in separate rows to separate groups. */
export function countLiteral(text:string,value:string):number{let count=0,from=0;while(value&&(from=text.indexOf(value,from))>=0){count++;from+=value.length;}return count;}
/** Only an explicit, complete, ignored signature member can permit an equal
 * fragment in output. A selected non-group mark retains zero-residue policy. */
export function signatureResidueAllowance(text:string,marks:readonly Mark[],value:string):number{
 const selected=marks.filter(m=>m.decision==='redact'&&text.slice(m.start,m.end)===value);
 if(!selected.length||selected.some(m=>!m.signatureGroup))return 0;
 return marks.filter(m=>m.signatureGroup&&m.decision==='ignore'&&text.slice(m.start,m.end)===value).length;
}
export function signatureGroupId(members:readonly Pick<Mark,'start'|'end'|'kind'>[]):string{
 return 'sig_'+createHash('sha256').update(JSON.stringify(['signature-fragment-v2',members.map(m=>[m.start,m.end,m.kind])])).digest('hex').slice(0,32);
}
/** Pure structural gate. Source-format span validity is checked separately. */
export function assertSignatureGroups(marks:readonly Mark[]):void{
 const groups=new Map<string,Mark[]>();
 for(const mark of marks){if(!mark||typeof mark!=='object')fail();const group=mark.signatureGroup;if(Object.hasOwn(mark,'signatureGroup')&&group==null)fail();if(!group)continue;
  if(typeof group!=='object'||typeof group.id!=='string'||!/^sig_[a-f0-9]{32}$/u.test(group.id)||Object.keys(group).sort().join(',')!=='id,memberCount,memberIndex'||!Number.isSafeInteger(group.memberIndex)||!Number.isSafeInteger(group.memberCount)||mark.kind!=='姓名'||group.memberIndex<0||group.memberIndex>=group.memberCount||group.memberCount<2||group.memberCount>MAX_MARKS||!Number.isSafeInteger(mark.start)||!Number.isSafeInteger(mark.end)||mark.start<0||mark.end<=mark.start)fail();
  const list=groups.get(group.id)??[];list.push(mark);groups.set(group.id,list);
 }
 for(const [id,list] of groups){const sorted=[...list].sort((a,b)=>a.signatureGroup!.memberIndex-b.signatureGroup!.memberIndex),first=sorted[0].signatureGroup!;
  if(list.length!==first.memberCount||sorted.some((m,i)=>m.signatureGroup!.memberCount!==first.memberCount||m.signatureGroup!.memberIndex!==i||m.decision!==sorted[0].decision||i>0&&m.start<sorted[i-1].end)||signatureGroupId(sorted)!==id)fail();
 }
}
/** Previous marks are the authenticated detection state; client metadata is a
 * claim. Provenance links bind every old member to one current slot. No partial
 * delete, retype, relocation, re-grouping, or fresh client-supplied group. */
export function assertSignatureReviewTransition(before:readonly Mark[],after:readonly Mark[],links:readonly ReviewEntityLink[]):void{
 assertSignatureGroups(before);assertSignatureGroups(after);
 const oldByAfter=new Map<number,number>(),usedBefore=new Set<number>();for(const link of links){if(!Number.isSafeInteger(link.beforeIndex)||!Number.isSafeInteger(link.afterIndex)||link.beforeIndex<0||link.beforeIndex>=before.length||link.afterIndex<0||link.afterIndex>=after.length||oldByAfter.has(link.afterIndex)||usedBefore.has(link.beforeIndex))fail();oldByAfter.set(link.afterIndex,link.beforeIndex);usedBefore.add(link.beforeIndex);}
 const seen=new Set<number>();for(const [afterIndex,mark] of after.entries()){
  const oldIndex=oldByAfter.get(afterIndex),old=oldIndex===undefined?undefined:before[oldIndex];
  if(mark.signatureGroup&&!old?.signatureGroup)fail();
  if(!old?.signatureGroup)continue;
  if(!mark.signatureGroup||!isDeepStrictEqual(mark.signatureGroup,old.signatureGroup)||entitySpanKey(mark)!==entitySpanKey(old))fail();
  seen.add(oldIndex!);
 }
 for(const[index,mark]of before.entries())if(mark.signatureGroup&&!seen.has(index))fail();
}
