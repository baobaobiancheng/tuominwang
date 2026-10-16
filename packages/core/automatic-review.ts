import type {Mark} from '../contracts/index.ts';
import {assertSignatureGroups} from './review-groups.ts';

export const AUTOMATIC_DECISION_POLICY_VERSION = 'automatic-source-decisions-1';
type Suppression={loser:number;winner:number;reason:'organization-specificity'|'same-kind-length'|'source-priority'|'confidence'|'length'|'original-length'|'stable-order';loserSource:string[];winnerSource:string[];loserGroup?:string;winnerGroup?:string};
type Logical={mark:Mark;original:string;members:number[]};

// Public 0.5.9 main.js:16371-16404 (sm/om/cm), applied only to automatic
// output. The full detected candidates remain in the original snapshot.
const sourcePriority:Partial<Record<Mark['kind'],number>>={
  '身份证号':100,'证照/许可证号':96,'银行账号':95,'信用代码':90,'手机号':85,'固定电话':85,
  '网址':84,'邮箱':82,'金额':78,'案号':74,'专利号':73,'备案号':73,'姓名':70,'机构':66,'地址':62,
};
function priority(mark:Mark){
  if(mark.sources?.some(s=>s.code.startsWith('workspace-correction:')))return 1200;
  if(mark.sources?.some(s=>s.code.startsWith('ruleset-force-detect:')))return 1100;
  return sourcePriority[mark.kind]??50;
}
function confidence(mark:Mark){return Math.max(0,...(mark.sources??[]).map(s=>s.score??0));}
const organizationSuffix=/^[\u4e00-\u9fa5A-Za-z0-9（）()·\-]{2,40}(?:公司|集团|银行|法院|检察院|公安局|事务所|律所|委员会|研究院|学校|医院|中心|厂|店)$/u;
function special(a:Mark,b:Mark,text:string):{result:number;reason:Suppression['reason']}|null{
  if(a.kind==='机构'&&b.kind==='机构'&&text){
    const aText=text.slice(a.start,a.end).replace(/\s+/gu,''),bText=text.slice(b.start,b.end).replace(/\s+/gu,'');
    if(a.start>=b.start&&a.end<=b.end&&organizationSuffix.test(aText)&&!organizationSuffix.test(bText))return{result:1,reason:'organization-specificity'};
    if(b.start>=a.start&&b.end<=a.end&&organizationSuffix.test(bText)&&!organizationSuffix.test(aText))return{result:-1,reason:'organization-specificity'};
  }
  if(a.kind===b.kind&&['金额','身份证号','银行账号','信用代码'].includes(a.kind)&&a.end-a.start!==b.end-b.start)
    return{result:(a.end-a.start)-(b.end-b.start),reason:'same-kind-length'};
  return null;
}
function reason(a:Logical,b:Logical,text:string):Suppression['reason']{
  const specific=special(a.mark,b.mark,text);if(specific)return specific.reason;
  if(priority(a.mark)!==priority(b.mark))return 'source-priority';
  if(Math.abs(confidence(a.mark)-confidence(b.mark))>=.03)return 'confidence';
  if(a.mark.end-a.mark.start!==b.mark.end-b.mark.start)return 'length';
  if(a.original.length!==b.original.length)return 'original-length';
  return 'stable-order';
}
function compare(a:Logical,b:Logical,text:string):number{
  const specific=special(a.mark,b.mark,text);if(specific)return specific.result;
  const p=priority(a.mark)-priority(b.mark);if(p)return p;
  const c=confidence(a.mark)-confidence(b.mark);if(Math.abs(c)>=.03)return c;
  const n=(a.mark.end-a.mark.start)-(b.mark.end-b.mark.start);if(n)return n;
  return a.original.length-b.original.length;
}
const codes=(mark:Mark)=>[...new Set((mark.sources??[]).map(s=>`${s.layer}:${s.code}`))];

/** Machine decisions over fresh detector candidates, with an overlap receipt.
 * No candidate is removed from the original detection snapshot. */
export function automaticReviewMarks(input:readonly Mark[],text=''):{marks:Mark[];suppressed:Suppression[]}{
  assertSignatureGroups(input);
  input.forEach(mark=>{
    if(mark.decision!=='pending'||mark.hiddenByType||mark.userAdded||mark.replacementOrigin==='manual')
      throw new Error('AUTOMATIC_REVIEW_REQUIRES_FRESH_DETECTION');
    if(!mark.sources?.length||mark.sources.some(source=>source.layer==='manual'))
      throw new Error('AUTOMATIC_REVIEW_SOURCE_REQUIRED');
  });
  const output=input.map(mark=>({...mark,decision:mark.sources!.some(s=>s.code==='project-whitelist')?'ignore' as const:'redact' as const}));
  const groups=new Map<string,number[]>();
  for(const [index,mark] of input.entries())if(mark.signatureGroup){
    const members=groups.get(mark.signatureGroup.id)??[];members.push(index);groups.set(mark.signatureGroup.id,members);
  }
  const logical:Logical[]=[],seen=new Set<string>();
  for(const [index,mark] of input.entries()){
    const id=mark.signatureGroup?.id;
    if(id&&seen.has(id))continue;
    if(!id){logical.push({mark:output[index],original:text.slice(mark.start,mark.end),members:[index]});continue;}
    seen.add(id);
    const members=groups.get(id)!.sort((a,b)=>input[a].signatureGroup!.memberIndex-input[b].signatureGroup!.memberIndex);
    const first=input[members[0]],last=input[members.at(-1)!];
    const original=members.map(i=>text.slice(input[i].start,input[i].end).replace(/\s/gu,'')).join('');
    const full=text.slice(first.start,last.end);
    if(!text||full.replace(/\s/gu,'')!==original||
        !/^(?:[\u4e00-\u9fa5]{2,4}|[\u4e00-\u9fa5]{1,3}·[\u4e00-\u9fa5]{1,4})$/u.test(original))
      throw new Error('AUTOMATIC_SIGNATURE_LOGICAL_SPAN_UNPROVEN');
    const ignored=members.filter(i=>output[i].decision==='ignore').length;
    if(ignored>0&&ignored<members.length)throw new Error('AUTOMATIC_SIGNATURE_MIXED_WHITELIST');
    logical.push({mark:{...first,start:first.start,end:last.end,sources:members.flatMap(i=>input[i].sources??[]),decision:ignored?'ignore':'redact'},original,members});
  }
  const winners:number[]=[],suppressed:Suppression[]=[];
  for(let index=0;index<logical.length;index++){
    const item=logical[index],mark=item.mark;if(mark.decision==='ignore')continue;
    let keep=true;
    for(let j=0;j<winners.length;j++){
      const oldIndex=winners[j],old=logical[oldIndex].mark;
      if(mark.start>=old.end||mark.end<=old.start)continue;
      const cmp=compare(item,logical[oldIndex],text),loser=cmp>0?oldIndex:index,winner=cmp>0?index:oldIndex;
      for(const member of logical[loser].members){
        suppressed.push({loser:member,winner:logical[winner].members[0],reason:reason(logical[loser],logical[winner],text),
          loserSource:codes(logical[loser].mark),winnerSource:codes(logical[winner].mark),
          ...(logical[loser].mark.signatureGroup?{loserGroup:logical[loser].mark.signatureGroup.id}:{}),
          ...(logical[winner].mark.signatureGroup?{winnerGroup:logical[winner].mark.signatureGroup.id}:{})});
        output[member]={...output[member],decision:'ignore'};
      }
      logical[loser].mark={...logical[loser].mark,decision:'ignore'};
      if(cmp>0){winners.splice(j--,1);}else{keep=false;break;}
    }
    if(keep)winners.push(index);
  }
  assertSignatureGroups(output);
  return{marks:output,suppressed};
}
