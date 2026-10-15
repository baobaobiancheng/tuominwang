import {literalMatcher} from "./literal-matcher.ts";
import {MAX_MAPPING_ENTRIES} from "../contracts/mapping-limits.ts";
import {validAliasToken,normalizedWordAlias} from "../contracts/alias-token.ts";
import type { Element, Node } from "@xmldom/xmldom";
import { readZip, writeZip, xml, xmlBytes, elements } from "./office-zip.ts";
import { readProtectedPortable, type PortableCredentials, type PortableObject } from "./workspace-portable.ts";
import { FILE_MAX_BYTES } from "../contracts/index.ts";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships", RELS = "http://schemas.openxmlformats.org/package/2006/relationships", X = "http://www.w3.org/XML/1998/namespace";
export type RestorationPlan = { mappings: Record<string, string>; occurrenceQueues: Record<string, string[]>; entityTypes: Record<string, string>; ambiguities: { token: string; originals: string[]; suggestedOriginal: string }[]; strategy: "token-canonical" | "occurrence"; sourceVersion: string };
export type RestorationOptions = { strategy?: "token-canonical" | "occurrence"; choices?: Record<string, string>; allowCanonicalSelection?: boolean; allowNoMatches?: boolean; preserveUnknownTokens?: boolean };
export type RestorationStats = { mappingEntries: number; tokensInDocument: number; totalReplacements: number; crossRunReplacements: number; normalizedMatches: number; storyReplacements: Record<string, number>; unknownTokens: string[]; residualTokens: string[]; hyperlinkReplacements: number };
const fail = (code: string): never => { throw new Error(code); };
const record = (v: any): v is PortableObject => !!v && typeof v === "object" && !Array.isArray(v);
const normalizeToken = (token: string) => token.replace(/[\s\u200B-\u200D\uFEFF]/gu, "");
const tokenIdentity = normalizedWordAlias;
function rank(value: string) { const full = (value.match(/[\uFF01-\uFF60\uFFE0-\uFFE6\u3000-\u303F]/gu) ?? []).length, half = (value.match(/[\x21-\x7E\uFF61-\uFFDC]/gu) ?? []).length; return [Number(!/[\s\u200B-\u200D\uFEFF]/u.test(value)), full / Math.max(1, full + half), Number(!/\p{P}/u.test(value)), Array.from(value).length]; }
export function parseRestorationMapping(data: any, options: RestorationOptions = {}): RestorationPlan {
  if (!record(data) && !Array.isArray(data)) return fail("RESTORE_MAPPING_INVALID");
  const originals = new Map<string, string[]>(), types = Object.create(null) as Record<string, string>, occurrences = Object.create(null) as Record<string, string[]>;
  function add(token: any, value: any, type?: any) { if (typeof token !== "string" || !token.trim() || typeof value !== "string" || !value.trim()) return; if(!validAliasToken(token)||!value.isWellFormed())fail("RESTORE_MAPPING_INVALID"); const values = originals.get(token) ?? []; values.push(value); originals.set(token, values); if (typeof type === "string") types[token] ??= type; }
  if (Array.isArray(data)) { for (const item of data) if (record(item)) add(item.pseudonym ?? item.token, item.normalized ?? item.value ?? item.original, item.entityType ?? item.kind); }
  else {
    for (const [token, value] of Object.entries(data.mappings ?? {})) add(token, value);
    for (const item of data.details ?? []) { if (!record(item)) continue; add(item.pseudonym, item.normalized, item.entityType); for (const form of item.forms ?? []) if (record(form)) add(item.pseudonym, form.original, item.entityType); }
    for (const item of data.occurrences ?? []) { if (!record(item)) continue; add(item.token, item.original, item.entityType); if (typeof item.token === "string" && typeof item.original === "string" && item.token.trim() && item.original.trim()) (occurrences[item.token] ??= []).push(item.original); }
    for (const [token, item] of Object.entries(data.entityMap ?? {}) as [string, any][]) if (record(item)) { add(token, item.canonical, item.entityType); add(token, item.restoreChoice, item.entityType); for (const form of item.forms ?? []) if (record(form)) add(token, form.original, item.entityType); }
  }
  if (!originals.size || originals.size > MAX_MAPPING_ENTRIES) fail("RESTORE_MAPPING_INVALID");
  const mappings = Object.create(null) as Record<string, string>, ambiguities: RestorationPlan["ambiguities"] = [];
  for (const [token, values] of originals) {
    const unique = [...new Set(values)].sort((a, b) => { const aa = rank(a), bb = rank(b); for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return bb[i] - aa[i]; return a < b ? -1 : a > b ? 1 : 0; });
    const choice = options.choices && Object.hasOwn(options.choices, token) ? options.choices[token] : undefined; if (choice !== undefined && !unique.includes(choice)) fail("RESTORE_CHOICE_INVALID");
    if (unique.length > 1 && choice === undefined && options.strategy !== "occurrence") ambiguities.push({ token, originals: unique, suggestedOriginal: unique[0] });
    mappings[token] = choice ?? (options.strategy === "occurrence" && record(data) && typeof (data as PortableObject).mappings?.[token] === "string" ? (data as PortableObject).mappings[token] : unique[0]);
  }
  // Source Ad preserves every raw mapping key and adds a trimmed canonical
  // spelling. Keep the full literal so longest matching consumes its whitespace;
  // do not normalize internal plain text or silently merge conflicting queues.
  // MAX_MAPPING_ENTRIES applies to supplied keys, before derived spellings.
  for(const [raw,original] of Object.entries(mappings)){
    const canonical=raw.trim();if(canonical===raw)continue;
    if(Object.hasOwn(mappings,canonical)){
      if(mappings[canonical]!==original||options.strategy==='occurrence'&&JSON.stringify(occurrences[canonical]??[])!==JSON.stringify(occurrences[raw]??[]))fail("RESTORE_NORMALIZED_TOKEN_COLLISION");
    }else{mappings[canonical]=original;if(types[raw]!==undefined)types[canonical]=types[raw];if(occurrences[raw])occurrences[canonical]=[...occurrences[raw]];}
  }
  const normalizedTokens = new Map<string, string>(), normalizedQueues = new Map<string, string>();
  for (const [token, original] of Object.entries(mappings)) { const normalized = tokenIdentity(token), previous = normalizedTokens.get(normalized); if (previous !== undefined && previous !== original) fail("RESTORE_NORMALIZED_TOKEN_COLLISION"); normalizedTokens.set(normalized, original); if(options.strategy === "occurrence") { const signature=JSON.stringify([original,occurrences[token]??[]]), previousQueue=normalizedQueues.get(normalized); if(previousQueue!==undefined&&previousQueue!==signature)fail("RESTORE_NORMALIZED_TOKEN_COLLISION");normalizedQueues.set(normalized,signature); } }
  if (options.allowCanonicalSelection) ambiguities.length = 0;
  return { mappings, occurrenceQueues: occurrences, entityTypes: types, ambiguities, strategy: options.strategy ?? "token-canonical", sourceVersion: Array.isArray(data) ? "legacy-array" : String(data._meta?.version ?? "0.5") };
}
export async function readRestorationMapping(bytes: Buffer, credentials: PortableCredentials = {}, options: RestorationOptions = {}) {
  if (bytes.length > FILE_MAX_BYTES + 65552 + 28 * Math.ceil(FILE_MAX_BYTES / 4194304)) fail("FILE_SIZE_LIMIT"); let plain = bytes, protectedData = false;
  if (bytes.subarray(0, 8).toString("ascii") === "LBTSC001") { const result = await readProtectedPortable(bytes, credentials); if (result.header.objectType !== "pseudonym-mapping") fail("RESTORE_MAPPING_CONTAINER_TYPE"); plain = result.plaintext; protectedData = true; }
  try { let data: any; try { data = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(plain)); } catch { return fail("RESTORE_MAPPING_INVALID"); } return { data, plan: parseRestorationMapping(data, options) }; } finally { if (protectedData) plain.fill(0); }
}
function stats(plan: RestorationPlan): RestorationStats { return { mappingEntries: Object.keys(plan.mappings).length, tokensInDocument: 0, totalReplacements: 0, crossRunReplacements: 0, normalizedMatches: 0, storyReplacements: {}, unknownTokens: [], residualTokens: [], hyperlinkReplacements: 0 }; }
function assertPlan(plan: RestorationPlan) { if (plan.ambiguities.length) fail("RESTORE_AMBIGUOUS_MAPPING"); if (!Object.keys(plan.mappings).length) fail("RESTORE_MAPPING_INVALID"); }
function resolver(plan: RestorationPlan, initialCounts: Map<string, number> = new Map()) { const identity=(token:string)=>tokenIdentity(token.trim()),cursors=new Map<string,number>();for(const[token,count]of initialCounts){const key=identity(token);cursors.set(key,(cursors.get(key)??0)+count);}return (token: string) => { if (plan.strategy === "occurrence") { const key=identity(token),index = cursors.get(key) ?? 0, queue = plan.occurrenceQueues[token]; cursors.set(key, index + 1); return queue?.[index] ?? plan.mappings[token]; } return plan.mappings[token]; }; }
function tokenInspector(tokens: string[], flexible = true) {
  const wrappers=tokens.filter(t=>t.includes('【'));
  const matchKnown=flexible?wordTokenMatcher(wrappers):literalMatcher(wrappers.map(t=>[t,t]as const));
  const components=[...new Set(wrappers.flatMap(t=>t.match(/【[^【】]+】/gu)??[]).map(normalizeToken))];
  const componentSet=new Set(components),families=[...new Set(components.map(t=>t.match(/^【(.+?)(?:[_-]?[0-9０-９]+)?】$/u)?.[1]).filter((v):v is string=>!!v))];
  function resemblesAlias(token: string) {
    const normalized=normalizeToken(token),body=normalized.slice(1,-1);
    if(componentSet.has(normalized)||/^.+?[_-]?[0-9０-９]+$/u.test(body))return true;
    return families.some(prefix=>body===prefix||body.startsWith(prefix)&&/^[_-]?[0-9０-９?]/u.test(body.slice(prefix.length)));
  }
  return (text: string) => {
    // Remove only complete registered aliases. Knowing a composite never grants
    // independent recognition to its component wrappers.
    const rest=matchKnown.replace(text,()=>''),wrapped=[...rest.matchAll(/【[^【】]+】/gu)].map(m=>m[0]);
    const unknown=wrapped.filter(resemblesAlias),remainder=rest.replace(/【[^【】]+】/gu,'');
    return [...new Set([...unknown,...remainder.match(/[【】]/gu)??[]])];
  };
}
/** Read-only token policy shared with sanitized delivery validation; no mapping values required. */
/** Actual emitted aliases, retaining whole plain/mixed/composite keys. This
 * is distinct from unknown-token inspection, which intentionally recognizes
 * bracket-shaped families without granting their component tokens. */
export function emittedRestorationTokens(text:string,knownTokens:string[],flexible=false):string[]{
 const tokens=flexible?wordTokenMatcher(knownTokens).matches(text).map(m=>m.token):[...literalMatcher(knownTokens.map(t=>[t,t]as const)).matches(text)].map(m=>m.value);
 return [...new Set(tokens)];
}
export function inspectRestorationTokens(text: string, knownTokens: string[], flexible = true): string[] {
  return tokenInspector(knownTokens, flexible)(text);
}
function checkRestorationTokens(texts: string[], plan: RestorationPlan, accepted = Object.keys(plan.mappings), flexible = true, preserveUnknownTokens = false) {
  const inspect = tokenInspector(accepted, flexible), unknown = new Set<string>();
  for (const text of texts) for (const token of inspect(text)) {
    if (!preserveUnknownTokens) fail("RESTORE_UNKNOWN_TOKEN");
    unknown.add(token);
  }
  return [...unknown];
}
type WordTokenMatch = { index: number; 0: string; token: string };
/** Whole balanced wrapper sequences use the same compressed radix matcher as
 * plain aliases. Normalize whitespace/zero-width characters only for this Word
 * surface, retaining raw UTF16 positions through compact gap offsets. */
function wordTokenMatcher(tokens: string[]) {
  const wrappers=tokens.filter(t=>t.includes('【'));
  const normalized=wrappers.length?literalMatcher(wrappers.map(t=>[tokenIdentity(t),t]as const)):null;
  const plain=tokens.filter(t=>!t.includes('【'));
  const exact=plain.length?literalMatcher(plain.map(t=>[t,t]as const)):null;
  const matches=(text:string):WordTokenMatch[]=>{
    const found:WordTokenMatch[]=[];
    if(normalized){
      const removals:{start:number;length:number}[]=[];
      for(const wrapper of text.matchAll(/【[^【】]+】/gu))for(const gap of wrapper[0].matchAll(/[\s\u200B-\u200D\uFEFF]+/gu))removals.push({start:wrapper.index+gap.index,length:gap[0].length});
      for(const gap of text.matchAll(/(?<=】)[\s\u200B-\u200D\uFEFF]+(?=【)/gu))removals.push({start:gap.index,length:gap[0].length});
      removals.sort((a,b)=>a.start-b.start);const gaps:{at:number;total:number}[]=[],pieces:string[]=[];let removed=0,from=0;
      for(const gap of removals){pieces.push(text.slice(from,gap.start));gaps.push({at:gap.start-removed,total:removed+gap.length});removed+=gap.length;from=gap.start+gap.length;}pieces.push(text.slice(from));const compact=pieces.join('');
      const rawOffset=(index:number,start:boolean)=>{let low=0,high=gaps.length;while(low<high){const mid=(low+high)>>>1;if(start?gaps[mid].at<=index:gaps[mid].at<index)low=mid+1;else high=mid;}return index+(low?gaps[low-1].total:0);};
      for(const match of normalized.matches(compact)){const start=rawOffset(match.index,true),end=rawOffset(match.index+match.text.length,false);found.push({index:start,0:text.slice(start,end),token:match.value});}
    }
    if(exact)for(const match of exact.matches(text))found.push({index:match.index,0:match.text,token:match.value});
    found.sort((a,b)=>a.index-b.index||b[0].length-a[0].length);let end=-1;
    return found.filter(match=>{if(match.index<end)return false;end=match.index+match[0].length;return true;});
  };
  return {matches,replace(text:string,replacement:(raw:string,token:string)=>string){const output:string[]=[];let offset=0;for(const match of matches(text)){output.push(text.slice(offset,match.index),replacement(match[0],match.token));offset=match.index+match[0].length;}output.push(text.slice(offset));return output.join('');}};
}
export function restoreMarkdown(bytes: Buffer, plan: RestorationPlan, options: RestorationOptions = {}) {
  assertPlan(plan); if (bytes.length > FILE_MAX_BYTES) fail("FILE_SIZE_LIMIT"); let text: string; try { text = new TextDecoder("utf8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return fail("RESTORE_TEXT_ENCODING_INVALID"); }
  const variants = new Map<string, string>();
  const tokens = Object.keys(plan.mappings), exact = new Set(tokens);
  // Source Td installs exact mapping keys before adding escaped/HTML forms with ??=.
  // A derived form never replaces a caller-supplied exact key.
  for (const token of tokens) variants.set(token, token);
  const constant = (token: string) => plan.strategy !== "occurrence" || (plan.occurrenceQueues[token] ?? []).every(value => value === plan.mappings[token]);
  function derived(form: string, token: string) {
    if (exact.has(form)) return;
    const previous = variants.get(form);
    if (previous !== undefined && previous !== token && (plan.mappings[previous] !== plan.mappings[token] || !constant(previous) || !constant(token))) fail("RESTORE_NORMALIZED_TOKEN_COLLISION");
    if (previous === undefined) variants.set(form, token);
  }
  for (const token of tokens) {
    derived(token.replace(/([\\`*_{}\[\]()#+.!>|~<>-])/g, "\\$1"), token);
    derived(token.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"), token);
  }
  const unknownTokens = checkRestorationTokens([text.replaceAll("\\【", "【").replaceAll("\\】", "】")], plan, [...variants.keys()], false, options.preserveUnknownTokens);
  const matcher = literalMatcher(variants), value = resolver(plan), result = stats(plan), found = new Set<string>();
  result.unknownTokens = unknownTokens;
  const output = matcher.replace(text, match => { const token = match.value; found.add(token); result.totalReplacements++; return value(token); });
  result.tokensInDocument = found.size; result.storyReplacements.markdown = result.totalReplacements;
  if (!result.totalReplacements && !options.allowNoMatches) fail("RESTORE_NO_TOKENS");
  // The public external-file path treats an ordinary no-op as a successful
  // byte-preserving copy. Managed callers retain the strict default.
  const bytesOut = !result.totalReplacements && options.allowNoMatches ? Buffer.from(bytes) : Buffer.from(output);
  // One-pass replacement intentionally leaves token-shaped text that was itself part of an original value.
  return { output: bytesOut, stats: result, ambiguities: plan.ambiguities, residualTokens: result.residualTokens };
}
type TextNode = { node: Element; text: string; start: number; end: number; run: Element | null };
function parentElement(node: Node | null, local: string): Element | null { for (let p = node; p; p = p.parentNode) if (p.nodeType === 1 && (p as Element).namespaceURI === W && (p as Element).localName === local) return p as Element; return null; }
function paragraphNodes(paragraph: Element) {
  const nodes: TextNode[] = []; const pending: Node[] = [paragraph]; let offset = 0;
  while (pending.length) { const n = pending.pop()!; if (n !== paragraph && n.nodeType === 1 && (n as Element).namespaceURI === W && (n as Element).localName === "p") continue;
    if (n.nodeType === 1 && (n as Element).namespaceURI === W && ["t", "delText"].includes((n as Element).localName ?? "")) { const text = n.textContent ?? ""; nodes.push({ node: n as Element, text, start: offset, end: offset + text.length, run: parentElement(n.parentNode, "r") }); offset += text.length; }
    else for (let child = n.lastChild; child; child = child.previousSibling) pending.push(child);
  }
  return nodes;
}
function setText(node: Element, value: string) { node.textContent = value; if (/^\s|\s$/.test(value)) node.setAttributeNS(X, "xml:space", "preserve"); }
function hyperlinkTarget(value: string, type?: string) { if (type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `mailto:${value}` : null; if (["website_url", "url", "网址"].includes(type ?? "")) { const target = /^https?:\/\//i.test(value) ? value : `https://${value}`; try { const url = new URL(target); return ["http:", "https:"].includes(url.protocol) && !/[\x00-\x20]/.test(value) ? target : null; } catch { return null; } } return null; }
function relationshipPath(story: string) { const slash = story.lastIndexOf("/"); return `${story.slice(0, slash)}/_rels/${story.slice(slash + 1)}.rels`; }
function createHyperlink(story: string, parts: Map<string, Buffer>, run: Element, value: string, target: string) {
  const relPath = relationshipPath(story), rel = parts.has(relPath) ? xml(parts.get(relPath)!) : xml(Buffer.from(`<Relationships xmlns="${RELS}"/>`)), ids = new Set(elements(rel, RELS, "Relationship").map(e => e.getAttribute("Id"))); let n = 1; while (ids.has(`restore${n}`)) n++;
  const relationship = rel.createElementNS(RELS, "Relationship"); relationship.setAttribute("Id", `restore${n}`); relationship.setAttribute("Type", `${R}/hyperlink`); relationship.setAttribute("Target", target); relationship.setAttribute("TargetMode", "External"); rel.documentElement!.appendChild(relationship); parts.set(relPath, restorationXmlBytes(rel));
  const doc = run.ownerDocument!, link = doc.createElementNS(W, "w:hyperlink"); link.setAttributeNS(R, "r:id", `restore${n}`); const newRun = run.cloneNode(false) as Element, properties = Array.from(run.childNodes).find(n => n.nodeType === 1 && (n as Element).namespaceURI === W && (n as Element).localName === "rPr"); if (properties) newRun.appendChild(properties.cloneNode(true)); const text = doc.createElementNS(W, "w:t"); setText(text, value); newRun.appendChild(text); link.appendChild(newRun); return link;
}
function restorationXmlBytes(document: Parameters<typeof xmlBytes>[0]) {
  try { return xmlBytes(document); }
  catch (error) { if (error instanceof Error && error.message === "OFFICE_XML_VALUE_INVALID") fail("RESTORE_XML_VALUE_INVALID"); throw error; }
}
function restorationXml(bytes: Buffer) { if(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/u.test(bytes.toString("utf8")))fail("RESTORE_XML_VALUE_INVALID");return xml(bytes); }
type MetadataField = { text: string; set: (value: string) => void };
/** The same non-namespace attribute/remaining-text surface inventoried by the
 * office adapter, plus package relationship attributes. Never fetch targets. */
function metadataFields(document: ReturnType<typeof xml>, consumed: Set<Node>): MetadataField[] {
  const fields: MetadataField[] = [], pending: Node[] = [document];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.nodeType === 1) for (const attr of Array.from((node as Element).attributes)) {
      if (attr.name === "xmlns" || attr.prefix === "xmlns") continue;
      fields.push({ text: attr.value, set: value => { attr.value = value; attr.nodeValue = value; } });
    }
    if ((node.nodeType === 3 || node.nodeType === 4) && !consumed.has(node)) fields.push({ text: node.nodeValue ?? "", set: value => { node.nodeValue = value; } });
    for (let child = node.lastChild; child; child = child.previousSibling) pending.push(child);
  }
  return fields;
}
function paragraphTextNodes(document: ReturnType<typeof xml>) {
  const consumed = new Set<Node>();
  for (const p of elements(document, W, "p")) for (const text of paragraphNodes(p)) {
    const pending: Node[] = [text.node];
    while (pending.length) { const node = pending.pop()!; consumed.add(node); for (let child = node.lastChild; child; child = child.previousSibling) pending.push(child); }
  }
  return consumed;
}
export async function restoreDocx(bytes: Buffer, plan: RestorationPlan, options: RestorationOptions = {}) {
  assertPlan(plan); const parts = await readZip(bytes); if (!parts.has("word/document.xml")) fail("RESTORE_DOCX_REQUIRED");
  // Inspect every XML part, including docProps, author attributes and hidden
  // text. ZIP paths, XML entities, depth and node limits are checked by helpers.
  const parsed = [...parts.keys()].filter(name => /\.(?:xml|rels)$/i.test(name)).sort((a, b) => a.localeCompare(b)).map(story => ({ story, document: restorationXml(parts.get(story)!) }));
  const paragraphs = parsed.flatMap(({ story, document }) => elements(document, W, "p").map(p => ({ story, paragraph: p, nodes: paragraphNodes(p) })));
  const metadata = parsed.map(part => ({ ...part, fields: metadataFields(part.document, paragraphTextNodes(part.document)) }));
  const unknownTokens = checkRestorationTokens([...paragraphs.map(p => p.nodes.map(n => n.text).join("")), ...metadata.flatMap(p => p.fields.map(f => f.text))], plan, undefined, true, options.preserveUnknownTokens);
  const matcher = wordTokenMatcher(Object.keys(plan.mappings)), value = resolver(plan), result = stats(plan), found = new Set<string>();
  result.unknownTokens = unknownTokens;
  // The office canonical order is paragraph content followed by metadata.
  // Resolve metadata first to avoid cloned run properties being restored twice,
  // but begin its occurrence cursor after all original paragraph matches.
  const bodyCounts = new Map<string, number>();
  for (const p of paragraphs) { for (const match of matcher.matches(p.nodes.map(n => n.text).join(""))) { const token = match.token; bodyCounts.set(token, (bodyCounts.get(token) ?? 0) + 1); } }
  const metadataValue = resolver(plan, bodyCounts);
  for (const { story, document, fields } of metadata) {
    const expected = fields.map(field => { const output = matcher.replace(field.text, (matched, token) => { found.add(token); result.totalReplacements++; result.storyReplacements[story] = (result.storyReplacements[story] ?? 0) + 1; if (matched !== token) result.normalizedMatches++; return metadataValue(token); }); field.set(output); return output; });
    const serialized = restorationXmlBytes(document), check = restorationXml(serialized), actual = metadataFields(check, paragraphTextNodes(check));
    if (actual.length !== expected.length || actual.some((field, i) => field.text !== expected[i])) fail("RESTORE_LAYOUT_MISMATCH");
    parts.set(story, serialized);
  }
  for (const { story, paragraph, nodes } of paragraphs) {
    const expectedEdits: { start: number; end: number; value: string }[] = [];
    const text = nodes.map(n => n.text).join(""), edits = new Map<Element, { start: number; end: number; value: string; target: string | null }[]>();
    for (const match of matcher.matches(text)) {
      const token = match.token; if (!token) fail("RESTORE_MAPPING_INVALID"); const replacement = value(token), start = match.index, end = start + match[0].length, affected = nodes.filter(n => n.start < end && n.end > start);
      if (!affected.length) continue; expectedEdits.push({ start, end, value: replacement }); found.add(token); result.totalReplacements++; result.storyReplacements[story] = (result.storyReplacements[story] ?? 0) + 1; if (new Set(affected.map(n => n.run)).size > 1) result.crossRunReplacements++; if (match[0] !== token) result.normalizedMatches++;
      for (const [i, n] of affected.entries()) { const list = edits.get(n.node) ?? []; list.push({ start: Math.max(0, start - n.start), end: Math.min(n.text.length, end - n.start), value: i === 0 ? replacement : "", target: i === 0 ? hyperlinkTarget(replacement, plan.entityTypes[token]) : null }); edits.set(n.node, list); }
    }
    const hyperlinkRuns = new Set<Element>();
    for (const n of nodes) if (n.run && n.node.parentNode === n.run && n.node.localName === "t" && edits.get(n.node)?.some(e => e.target)) hyperlinkRuns.add(n.run);
    for (const n of nodes) {
      const changes = edits.get(n.node); if (!changes || n.run && hyperlinkRuns.has(n.run)) continue;
      let output = n.text; for (const e of changes.sort((a, b) => b.start - a.start)) output = output.slice(0, e.start) + e.value + output.slice(e.end); setText(n.node, output);
    }
    // Process every text node and nontext sibling of a run together. Moving untouched children preserves nested textbox paragraph identities.
    for (const run of hyperlinkRuns) {
      const doc = run.ownerDocument!, oldLink = parentElement(run.parentNode, "hyperlink");
      if (oldLink?.parentNode) { const parent = oldLink.parentNode; for (let child = oldLink.firstChild; child;) { const next = child.nextSibling; parent.insertBefore(child, oldLink); child = next; } parent.removeChild(oldLink); }
      const parent = run.parentNode ?? fail("RESTORE_LAYOUT_MISMATCH");
      const properties = Array.from(run.childNodes).find(c => c.nodeType === 1 && (c as Element).localName === "rPr"), makeRun = () => { const r = run.cloneNode(false) as Element; if (properties) r.appendChild(properties.cloneNode(true)); return r; };
      let current = makeRun(); const flush = () => { if (current.childNodes.length > (properties ? 1 : 0)) parent.insertBefore(current, run); current = makeRun(); };
      for (const child of Array.from(run.childNodes)) {
        if (child === properties) continue;
        const changes = child.nodeType === 1 ? edits.get(child as Element) : undefined;
        if (!changes) { current.appendChild(child); continue; }
        const source = child.textContent ?? ""; let at = 0;
        const emit = (value: string, target: string | null) => { if (!value) return; if (target && (child as Element).localName === "t") { flush(); parent.insertBefore(createHyperlink(story, parts, run, value, target), run); result.hyperlinkReplacements++; } else { const text = child.cloneNode(false) as Element; setText(text, value); current.appendChild(text); } };
        for (const e of changes.sort((a, b) => a.start - b.start)) { emit(source.slice(at, e.start), null); emit(e.value, e.target); at = e.end; } emit(source.slice(at), null);
      }
      flush(); parent.removeChild(run);
    }
    let expected = text; for (const e of expectedEdits.sort((a, b) => b.start - a.start)) expected = expected.slice(0, e.start) + e.value + expected.slice(e.end);
    if (paragraphNodes(paragraph).map(n => n.node.textContent ?? "").join("") !== expected) fail("RESTORE_LAYOUT_MISMATCH");
  }
  result.tokensInDocument = found.size;
  if (!result.totalReplacements) {
    if (!options.allowNoMatches) fail("RESTORE_NO_TOKENS");
    return { output: Buffer.from(bytes), stats: result, ambiguities: plan.ambiguities, residualTokens: result.residualTokens };
  }
  // Relationship parts may have been updated by createHyperlink. Only body
  // parts need a second serialization after paragraph edits.
  for (const { story, document } of parsed) if (elements(document, W, "p").length) parts.set(story, restorationXmlBytes(document));
  // Independently serialize and reparse every changed story; corrupted OOXML never falls back to the input file.
  const output = await writeZip(parts), verified = await readZip(output); for (const { story } of parsed) restorationXml(verified.get(story)!);
  return { output, stats: result, ambiguities: plan.ambiguities, residualTokens: result.residualTokens };
}
