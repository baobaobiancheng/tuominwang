import {createHash} from 'node:crypto';
import {MAX_MARKS,markSchema,type Mark,type Anchor,type DictionaryEntry} from '../contracts/index.ts';
import type {RuleSet} from '../contracts/presets.ts';
import {sourceFamilyByKind} from './presets.ts';
import {sourceEntityMark,sameEntity,entityIdentity,type EntityIdentity} from './entity-identity.ts';
type LiteralRule={entity:EntityIdentity;sourceType?:string;pattern:string;action:'include'|'exclude';code:string};
function matching(rule:LiteralRule,entity:EntityIdentity){return sameEntity(rule.entity,entity)||rule.entity.rawEntityType===undefined&&entity.rawEntityType===undefined&&(rule.sourceType==='phone'&&['手机号','固定电话'].includes(entity.kind)||sourceFamilyByKind[entity.kind]===rule.sourceType&&rule.sourceType!==undefined);}
function overlap(a:LiteralRule,b:LiteralRule){return sameEntity(a.entity,b.entity)||a.entity.rawEntityType===undefined&&b.entity.rawEntityType===undefined&&markSchema.shape.kind.options.some(kind=>matching(a,{kind})&&matching(b,{kind}));}
function apply(text:string,anchors:Anchor[],fresh:Mark[],rules:LiteralRule[]){
 const skips=new Map<string,LiteralRule[]>();for(const r of rules)if(r.action==='exclude'){const list=skips.get(r.pattern)??[];list.push(r);skips.set(r.pattern,list);}
 let result=fresh.filter(m=>!(skips.get(text.slice(m.start,m.end))??[]).some(r=>matching(r,m)));
 const spans=anchors.length?anchors:[{kind:'text' as const,start:0,end:text.length}];
 for(const rule of rules){if(rule.action!=='include'||!rule.pattern||(skips.get(rule.pattern)??[]).some(s=>overlap(s,rule)))continue;
  const trace={layer:'rules' as const,code:rule.code,score:1};
  result=result.map(m=>matching(rule,m)&&text.slice(m.start,m.end)===rule.pattern?{...m,sources:[...(m.sources??[]).filter(s=>s.code!==trace.code),trace]}:m);
  for(const span of spans){let from=span.start;while(from<=span.end-rule.pattern.length){const start=text.indexOf(rule.pattern,from);if(start<0||start+rule.pattern.length>span.end)break;const end=start+rule.pattern.length;
   if(!result.some(m=>matching(rule,m)&&start<m.end&&end>m.start)){if(result.length>=MAX_MARKS)throw new Error('MARK_LIMIT');result.push({...rule.entity,start,end,decision:'pending',sources:[trace]});}
   from=start+Math.max(1,rule.pattern.length);
  }}
 }
 return result.sort((a,b)=>a.start-b.start||a.end-b.end||entityIdentity(a).localeCompare(entityIdentity(b),'zh'));
}
/** Explicit selection only: released-source legacy personal dictionaries migrate inactive. */
export function applyUserMemoryDictionary(text:string,anchors:Anchor[],fresh:Mark[],dictionary:DictionaryEntry[]):Mark[]{return apply(text,anchors,fresh,dictionary.map(e=>({entity:{kind:e.kind,...e.rawEntityType!==undefined?{rawEntityType:e.rawEntityType}:{}},pattern:e.value,action:e.action==='exclude'?'exclude':'include',code:`personal-force-detect:${createHash('sha256').update(JSON.stringify([entityIdentity(e),e.value])).digest('hex').slice(0,16)}`})));}
/** Source Wd: active exact skip before force detect; no cross-object matches or manual-mark removal. */
export function applyActiveRulesetCandidates(text:string,anchors:Anchor[],fresh:Mark[],ruleset?:RuleSet|null,materialRoute="general"):Mark[]{if(!ruleset)return fresh;return apply(text,anchors,fresh,ruleset.entries.filter(e=>e.enabled&&(!e.materialRouteKeys||e.materialRouteKeys.includes(materialRoute as any))).map(e=>({entity:sourceEntityMark(e.entityType,e.pattern),sourceType:e.entityType,pattern:e.pattern,action:e.kind==='forceSkip'?'exclude':'include',code:`ruleset-force-detect:${e.id}`})));}
