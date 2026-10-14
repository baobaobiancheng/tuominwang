import {validAliasToken} from "../contracts/alias-token.ts";
import {sameEntity,type EntityIdentity} from './entity-identity.ts';
import type { Mark } from "../contracts/index.ts";
import policy from "./export-policy.generated.js";
import {literalMatcher} from './literal-matcher.ts';
import {inspectRestorationTokens} from './restoration-files.ts';

export type Mapping = { id: string; token: string; version: 1; value: string; kind: Mark["kind"];rawEntityType?:string; scope?: string;ordinal?:number; inherited?:boolean; identities?:EntityIdentity[];forms?:string[] };
export function mappingMatchesEntity(mapping:Mapping,entity:EntityIdentity){return sameEntity(mapping,entity)||!!mapping.identities?.some(identity=>sameEntity(identity,entity));}
export function mappingMatchesValue(mapping:Mapping,value:string){return mapping.value===value||!!mapping.forms?.includes(value);}
export function validateMappingMarks(text: string, marks: Mark[], mappings: Mapping[]) {
  const byId = new Map(mappings.map(m => [m.id, m]));
  for (const mark of marks) if (mark.replacement?.mode === "alias") {
    const ref = mark.replacement, mapping = byId.get(ref.mappingId);
    if (!mapping || mapping.version !== ref.version || mapping.token !== ref.token || !mappingMatchesEntity(mapping,mark) || !mappingMatchesValue(mapping,text.slice(mark.start,mark.end))) throw new Error("MAPPING_MISMATCH");
  }
}
export function restoreText(text: string, mappings: Mapping[], authorized: boolean, current: boolean) {
  const tokens = new Map<string, Mapping>();
  let unambiguous = true;
  for (const mapping of mappings) {
    const previous = tokens.get(mapping.token);
    if (previous && (previous.id !== mapping.id || previous.value !== mapping.value)) unambiguous = false;
    tokens.set(mapping.token, mapping);
  }
  for(const token of tokens.keys())if(!validAliasToken(token))throw new Error('UNKNOWN_ALIAS');
  const literal=literalMatcher(tokens),matches=[...literal.matches(text)],remainder=text.replace(/【[^【】]*】/gu, "");
  let known=matches.length>0&&inspectRestorationTokens(text,[...tokens.keys()],false).length===0&&!/(?:姓名|机构|地址|敏感项)[\s_＿-]*[\d０-９]{1,8}/u.test(remainder.normalize("NFKC"));
  if (policy.restoreAllowed(authorized, current, known, unambiguous) !== true) throw new Error(!authorized ? "MAPPING_ACCESS_DENIED" : !current ? "VERSION_CONFLICT" : !unambiguous ? "AMBIGUOUS_ALIAS" : "UNKNOWN_ALIAS");
  // One pass: an original value containing token-like text is not recursively expanded.
  return literal.replace(text, match => match.value.value);
}
