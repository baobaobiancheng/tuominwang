import {entityIdentity,entityValueKey,sameEntity} from './entity-identity.ts';
import type { Mark } from "../contracts/index.ts";
import { replacementPoliciesSchema, type PolicyDirective, type ReplacementPolicies } from "../contracts/policies.ts";
import { validateMarks, replacementFor } from "./redaction.ts";
import type { Mapping } from "./mappings.ts";
const key = entityValueKey;
export type PolicyAliasRequest = { kind: Mark["kind"];rawEntityType?:string; value: string;recognizedValue?:string };
export function applyReplacementPolicies(text: string, marks: Mark[], input: ReplacementPolicies, mappings: Mapping[] = [], options:{semanticValue?:(mark:Mark,markIndex:number)=>string}={}) {
  const policies = replacementPoliciesSchema.parse(input);
  validateMarks(text, marks.map(m => ({ ...m, decision: "pending" })));
  const types = new Map(policies.types.map(t => [entityIdentity(t), t.rule])), values = new Map<string, PolicyDirective>();
  for (const value of policies.values) {
    const slots=marks.flatMap((m,index)=>m.start===value.start&&m.end===value.end&&sameEntity(m,value)?[index]:[]);if(!slots.length)throw new Error("POLICY_TARGET_NOT_FOUND");const semanticValues=new Set(slots.map(index=>options.semanticValue?.(marks[index],index)??text.slice(value.start,value.end)));if(value.semanticValue!==undefined&&!semanticValues.has(value.semanticValue))throw new Error('POLICY_TARGET_NOT_FOUND');if(value.semanticValue===undefined&&semanticValues.size!==1)throw Error('POLICY_VALUE_CONFLICT');
    const id = key(value,value.semanticValue??[...semanticValues][0]), previous = values.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(value.rule)) throw new Error("POLICY_VALUE_CONFLICT");
    values.set(id, value.rule);
  }
  const relevant = new Set(marks.map((m,index) => key(m, options.semanticValue?.(m,index)??text.slice(m.start, m.end))));
  const available = new Map<string, Mapping>();
  for (const mapping of mappings) {
    for(const identity of [mapping,...mapping.identities??[]])for(const form of new Set([mapping.value,...mapping.forms??[]])){const id = key(identity, form); if (!relevant.has(id)) continue;
    const previous = available.get(id);
    if (previous && previous.token !== mapping.token) throw new Error("AMBIGUOUS_MAPPING");
    available.set(id, mapping);}
  }
  const needed = new Map<string, PolicyAliasRequest>();
  const result = marks.map((mark,index) => {
    if (mark.decision === "ignore" || policies.keepExplicit && mark.replacement && (!mark.replacementOrigin || mark.replacementOrigin === "manual")) return mark;
    const recognizedValue=text.slice(mark.start,mark.end),value = options.semanticValue?.(mark,index)??recognizedValue, id = key(mark, value), byValue = values.get(id), byType = types.get(entityIdentity(mark)), rule = byValue ?? byType ?? policies.overall;
    if (!rule) return mark;
    const origin = byValue ? "value" : byType ? "type" : "overall";
    if (rule.mode === "alias") {
      const mapping = available.get(id);
      if (!mapping) { needed.set(id, { kind: mark.kind,...mark.rawEntityType!==undefined?{rawEntityType:mark.rawEntityType}:{}, value,...value!==recognizedValue?{recognizedValue}:{} }); return mark; }
      const next: Mark = { ...mark, rasterReplacement:undefined,replacementOrigin: origin, replacement: { mode: "alias", mappingId: mapping.id, version: mapping.version, token: mapping.token } };
      replacementFor(text, next); return next;
    }
    let replacement=rule;
    if(value!==recognizedValue&&rule.mode!=='clear'){
      const corrected={...mark,start:0,end:value.length,replacement:rule};
      const computed=rule.mode==='reference-mask'&&['detected','detected-raster'].includes(rule.variant)?mark.kind==='姓名'?value.charAt(0)+'*'.repeat(Math.max(1,[...value].length-1)):'*'.repeat(Math.max(1,[...value].length)):replacementFor(value,corrected);
      replacement={mode:'custom',value:computed};
    }
    const next: Mark = { ...mark, rasterReplacement:undefined,replacementOrigin: origin, replacement };
    replacementFor(text, next); return next;
  });
  return { marks: result, aliasRequests: [...needed.values()] };
}
