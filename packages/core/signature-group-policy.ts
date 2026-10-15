import type {Anchor,Mark} from '../contracts/index.ts';
import type {Profile,RuleSet} from '../contracts/presets.ts';
import {sameEntity,sourceEntityMark} from './entity-identity.ts';
import {enabledProfileMarks} from './profile-recognition.ts';
import {applyActiveRulesetCandidates} from './user-memory-rules.ts';
import {assertSignatureGroups} from './review-groups.ts';
const conflict=():never=>{throw Object.assign(new Error('SIGNATURE_GROUP_RULE_CONFLICT'),{statusCode:409});};
/** Full-name rules operate on a transient logical value reconstructed from
 * source spans. Neither the rule match nor the complete name is persisted in
 * signatureGroup. A one-character forceSkip never approves the other member. */
export function applySignatureLogicalRules(text:string,marks:Mark[],ruleset?:RuleSet|null,materialRoute='general'):Mark[]{
 if(!ruleset)return marks;
 assertSignatureGroups(marks);
 const active=ruleset.entries.filter(e=>e.enabled&&(!e.materialRouteKeys||e.materialRouteKeys.includes(materialRoute as any)));
 const groups=new Map<string,Mark[]>();for(const mark of marks)if(mark.signatureGroup){const list=groups.get(mark.signatureGroup.id)??[];list.push(mark);groups.set(mark.signatureGroup.id,list);}
 const removed=new Set<string>(),forced=new Map<string,string[]>();
 for(const [id,list] of groups){const ordered=[...list].sort((a,b)=>a.signatureGroup!.memberIndex-b.signatureGroup!.memberIndex),value=ordered.map(m=>text.slice(m.start,m.end)).join('');
  for(const rule of active){if(rule.pattern!==value||!sameEntity(sourceEntityMark(rule.entityType,rule.pattern),{kind:'姓名'}))continue;
   if(rule.kind==='forceSkip')removed.add(id);
   else if(rule.kind==='forceDetect'){const codes=forced.get(id)??[];codes.push('ruleset-force-detect:'+rule.id);forced.set(id,codes);}
  }
 }
 return marks.flatMap(mark=>{const id=mark.signatureGroup?.id;if(!id)return[mark];if(removed.has(id))return[];
  const codes=forced.get(id)??[];return codes.length?[{...mark,sources:[...(mark.sources??[]).filter(s=>!codes.includes(s.code)),...codes.map(code=>({layer:'rules' as const,code,score:1}))]}]:[mark];
 });
}
export function assertSignaturePolicyGroups(marks:Mark[]):void{try{assertSignatureGroups(marks);}catch{conflict();}}
/** The source ruleset compares a detected entity's complete original value.
 * Its physical fragments are storage targets, not separate source entities. */
export function applyRulesPreservingSignatureGroups(text:string,anchors:Anchor[],marks:Mark[],ruleset?:RuleSet|null,route='general'):Mark[]{
 const groups=marks.filter(m=>m.signatureGroup);
 const ruled=applyActiveRulesetCandidates(text,anchors,marks,ruleset,route);
 if(!groups.length)return ruled;
 return [...ruled.filter(m=>!m.signatureGroup),...groups].sort((a,b)=>a.start-b.start||a.end-b.end||a.kind.localeCompare(b.kind,'zh'));
}
/** Mirrors the worker's profile/ruleset removal sequence for source-derived
 * signature marks. Runtime whitelist only adds candidates and cannot remove a
 * signature member. The worker invokes the same logical rule and final gate. */
export function effectiveSignatureGroups(text:string,anchors:Anchor[],raw:Mark[],profile?:Profile,ruleset?:RuleSet|null,route='general'):Mark[]{
 const logical=applySignatureLogicalRules(text,raw,ruleset,route);
 const enabled=enabledProfileMarks(logical,profile);
 const final=enabledProfileMarks(applyRulesPreservingSignatureGroups(text,anchors,enabled,ruleset,route),profile);
 assertSignaturePolicyGroups(final);
 return final.filter(m=>m.signatureGroup);
}
