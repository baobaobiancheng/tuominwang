import {entityIdentity,entityValueKey,sameEntity} from './entity-identity.ts';
import type { Mark } from "../contracts/index.ts";
import { replacementPoliciesSchema, type PolicyDirective, type ReplacementPolicies } from "../contracts/policies.ts";
import { validateMarks, replacementFor } from "./redaction.ts";
import type { Mapping } from "./mappings.ts";
const key = entityValueKey;
export type PolicyAliasRequest = { kind: Mark["kind"];rawEntityType?:string; value: string };
export function applyReplacementPolicies(text: string, marks: Mark[], input: ReplacementPolicies, mappings: Mapping[] = []) {
  const policies = replacementPoliciesSchema.parse(input);
  validateMarks(text, marks.map(m => ({ ...m, decision: "pending" })));
  const types = new Map(policies.types.map(t => [entityIdentity(t), t.rule])), values = new Map<string, PolicyDirective>();
  for (const value of policies.values) {
    if (!marks.some(m => m.start === value.start && m.end === value.end && sameEntity(m,value))) throw new Error("POLICY_TARGET_NOT_FOUND");
    const id = key(value, text.slice(value.start, value.end)), previous = values.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(value.rule)) throw new Error("POLICY_VALUE_CONFLICT");
    values.set(id, value.rule);
  }
  const relevant = new Set(marks.map(m => key(m, text.slice(m.start, m.end))));
  const available = new Map<string, Mapping>();
  for (const mapping of mappings) {
    for(const identity of [mapping,...mapping.identities??[]])for(const form of new Set([mapping.value,...mapping.forms??[]])){const id = key(identity, form); if (!relevant.has(id)) continue;
    const previous = available.get(id);
    if (previous && previous.token !== mapping.token) throw new Error("AMBIGUOUS_MAPPING");
    available.set(id, mapping);}
  }
  const needed = new Map<string, PolicyAliasRequest>();
  const result = marks.map(mark => {
    if (mark.decision === "ignore" || policies.keepExplicit && mark.replacement && (!mark.replacementOrigin || mark.replacementOrigin === "manual")) return mark;
    const value = text.slice(mark.start, mark.end), id = key(mark, value), byValue = values.get(id), byType = types.get(entityIdentity(mark)), rule = byValue ?? byType ?? policies.overall;
    if (!rule) return mark;
    const origin = byValue ? "value" : byType ? "type" : "overall";
    if (rule.mode === "alias") {
      const mapping = available.get(id);
      if (!mapping) { needed.set(id, { kind: mark.kind,...mark.rawEntityType!==undefined?{rawEntityType:mark.rawEntityType}:{}, value }); return mark; }
      const next: Mark = { ...mark, rasterReplacement:undefined,replacementOrigin: origin, replacement: { mode: "alias", mappingId: mapping.id, version: mapping.version, token: mapping.token } };
      replacementFor(text, next); return next;
    }
    const next: Mark = { ...mark, rasterReplacement:undefined,replacementOrigin: origin, replacement: rule };
    replacementFor(text, next); return next;
  });
  return { marks: result, aliasRequests: [...needed.values()] };
}
