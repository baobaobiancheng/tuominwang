import type { Mark } from "../contracts/index.ts";
import policy from "./export-policy.generated.js";

export type Mapping = { id: string; token: string; version: 1; value: string; kind: Mark["kind"] };
export function validateMappingMarks(text: string, marks: Mark[], mappings: Mapping[]) {
  const byId = new Map(mappings.map(m => [m.id, m]));
  for (const mark of marks) if (mark.replacement?.mode === "alias") {
    const ref = mark.replacement, mapping = byId.get(ref.mappingId);
    if (!mapping || mapping.version !== ref.version || mapping.token !== ref.token || mapping.kind !== mark.kind || text.slice(mark.start, mark.end) !== mapping.value) throw new Error("MAPPING_MISMATCH");
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
  const matches = [...text.matchAll(/【[^】]*】/gu)];
  // Stray brackets, unknown tokens and altered wrappers/case/spacing are never guessed.
  let known = matches.length > 0 && matches.every(m => tokens.has(m[0]));
  const remainder = text.replace(/【[^】]*】/gu, "");
  if (/[【】]/u.test(remainder) || /(?:姓名|机构|地址|敏感项)[\s_＿-]*[\d０-９]{1,8}/u.test(remainder.normalize("NFKC"))) known = false;
  if (policy.restoreAllowed(authorized, current, known, unambiguous) !== true) throw new Error(!authorized ? "MAPPING_ACCESS_DENIED" : !current ? "VERSION_CONFLICT" : !unambiguous ? "AMBIGUOUS_ALIAS" : "UNKNOWN_ALIAS");
  // One pass: an original value containing token-like text is not recursively expanded.
  return text.replace(/【[^】]*】/gu, token => tokens.get(token)!.value);
}
