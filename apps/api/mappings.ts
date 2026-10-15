import{hydrateEntityCorrections}from '../../packages/adapters/entity-corrections.ts';
import{semanticEntityValue,semanticEntityForms}from '../../packages/core/entity-corrections.ts';
import {restoreDocumentAliases} from '../../packages/core/document-alias-restoration.ts';
import {resolveUnifiedPolicyAliases} from '../../packages/adapters/unified-aliases.ts';
import {getProjectMappings,decodeProjectMapping,projectMappingNamespace} from '../../packages/adapters/alias-groups.ts';
import {MAX_MAPPING_ENTRIES} from "../../packages/contracts/mapping-limits.ts";
import {sameEntity,entityIdentity} from '../../packages/core/entity-identity.ts';
import { kindByEntityType,sourceFamilyByKind } from "../../packages/core/presets.ts";
import { resolveDocumentPolicy } from "../../packages/adapters/document-policy.ts";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { id, markSchema, paginationSchema, TEXT_MAX_BYTES, type Mark } from "../../packages/contracts/index.ts";
import { scoped, rows, sql, type DB } from "../../packages/adapters/db.ts";
import { seal, unseal } from "../../packages/adapters/storage.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
import { restoreText,mappingMatchesEntity,mappingMatchesValue, type Mapping } from "../../packages/core/mappings.ts";
import { projectScope } from "./access.ts";

function fail(message: string, statusCode = 409): never { throw Object.assign(new Error(message), { statusCode }); }
const decode=decodeProjectMapping;
function reference(m: Mapping) { return { mode: "alias" as const, mappingId: m.id, token: m.token, version: m.version }; }
function mappingContext(d:any,kind:Mark['kind']){
  const policy=resolveDocumentPolicy(d,{revision:0,profile:null,ruleset:null}).documentPolicy;
  const prefixes=policy?.configuration.pseudonymPrefixes,own=prefixes&&Object.keys(prefixes).find(k=>kindByEntityType[k]===kind||kind==='固定电话'&&k==='phone'),family=sourceFamilyByKind[kind],entity=own??(family&&prefixes?.[family]?family:undefined);
  return {scope:policy?.configuration.unifiedPseudonyms===false?d.id:undefined,prefix:entity?prefixes![entity as keyof typeof prefixes]!:["姓名","机构","地址"].includes(kind)?kind:'敏感项'};
}
async function reservedTokens(db:DB,d:any){const[p]=await rows(db,sql`SELECT portable_state FROM projects WHERE id=${d.project_id}`);if(!p?.portable_state)return new Set<string>();const state=JSON.parse(unseal(p.portable_state,`${d.tenant_id}:${d.project_id}:portable-state`));return new Set<string>(state.reviewInheritance?.pseudonyms?.reservedTokens??[]);}
function nextToken(prefix:string,all:Pick<Mapping,'token'>[],reserved:Set<string>){const used=new Set([...all.map(m=>m.token),...reserved]),max=all.reduce((n,m)=>Math.max(n,Number(m.token.match(/_(\d+)】$/u)?.[1]??0)),0);for(let i=0;i<999999;i++){const ordinal=(max+i)%999999+1,token=`【${prefix}_${String(ordinal).padStart(6,'0')}】`;if(!used.has(token))return token;}fail('MAPPING_NAMESPACE_EXHAUSTED',400);}
function nextOrdinal(all:Pick<Mapping,'ordinal'>[]){const used=new Set(all.map(m=>m.ordinal));let value=1;while(value<=MAX_MAPPING_ENTRIES&&used.has(value))value++;if(value>MAX_MAPPING_ENTRIES)fail('MAPPING_LIMIT',400);return value;}
// Called inside a projectScope transaction holding the project lock; mappings are immutable.
export async function resolvePolicyMappings(db: DB, d: any, user: string, needed: {kind: Mark["kind"];rawEntityType?:string; value: string;recognizedValue?:string}[]) {
  d=hydrateEntityCorrections(d);
  const unified=await resolveUnifiedPolicyAliases(db,d,user,needed);if(unified)return unified;
  const all = await getProjectMappings(db,d.project_id);
  const reservedNamespace=await projectMappingNamespace(db,d.project_id);
  const namespace=mappingContext(d,'姓名').scope;
  const list=all.filter(m=>m.scope===namespace);
  const reserved=await reservedTokens(db,d);
  const resolved: Mapping[]=[];
  for (const request of needed) {
    const prefix=mappingContext(d,request.kind).prefix;
    const existing = list.filter(m => mappingMatchesEntity(m,request) && mappingMatchesValue(m,request.value) && (m.inherited||m.token.startsWith(`【${prefix}_`)));
    if (existing.length > 1) fail("AMBIGUOUS_MAPPING", 400);
    if (existing.length) {resolved.push(existing[0]);continue;}
    if (new Set(reservedNamespace.map(m=>m.token)).size >= MAX_MAPPING_ENTRIES) fail("MAPPING_LIMIT", 400);
    const mappingId = randomUUID(), rowOrdinal=nextOrdinal(reservedNamespace),token=nextToken(prefix,reservedNamespace,reserved);
    if (token.includes(request.value)) fail("INVALID_REPLACEMENT", 400);
    const payload = seal(JSON.stringify({...request,...request.recognizedValue?{forms:[...new Set([request.value,request.recognizedValue])]}:{},...(namespace ? {scope:namespace} : {})}), `${d.tenant_id}:${d.project_id}:${mappingId}:mapping:1`);
    await rows(db, sql`INSERT INTO entity_mappings(id,tenant_id,project_id,request_id,ordinal,token,payload,created_by) VALUES(${mappingId},${d.tenant_id},${d.project_id},${randomUUID()},${rowOrdinal},${token},${payload},${user})`);
    await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${user},'mapping_created',${mappingId})`);
    const mapping: Mapping={id:mappingId,token,version:1,ordinal:rowOrdinal,...request,...request.recognizedValue?{forms:[...new Set([request.value,request.recognizedValue])]}:{},...(namespace?{scope:namespace}:{})};
    list.push(mapping);all.push(mapping);reservedNamespace.push(mapping as any);resolved.push(mapping);
  }
  return resolved;
}
export async function mappingsForMarks(db: DB, d: any, marks: Mark[], user: string) {
  const ids = new Set(marks.flatMap(m => m.replacement?.mode === "alias" ? [m.replacement.mappingId] : []));
  if (!ids.size) return [];
  // ponytail: immutable project mappings are capped at 1,000; one query avoids one round trip per mark.
  const list = await getProjectMappings(db,d.project_id,{historical:true});
  const selected = list.filter(m => ids.has(m.id));
  if (selected.length !== ids.size) fail("MAPPING_MISMATCH", 400);
  return selected;
}
const spanSchema = markSchema.pick({ start: true, end: true, kind: true,rawEntityType:true }).extend({ revision: z.number().int().nonnegative(),markIndex:z.number().int().nonnegative().optional() });
async function spanValue(d: any, input: z.infer<typeof spanSchema>) {
  if (d.revision !== input.revision) fail("VERSION_CONFLICT");
  if (d.state !== "review") fail(d.state === "outdated" ? "POLICY_CHANGED" : "DETECTION_INCOMPLETE");
  try { await runProcessing<string>({ kind: "mapping-value", doc: d, marks: [{ start: input.start, end: input.end, kind: input.kind,...input.rawEntityType!==undefined?{rawEntityType:input.rawEntityType}:{}, decision: "pending" }] });if(input.markIndex!==undefined){const current=d.marks[input.markIndex];if(!current||current.start!==input.start||current.end!==input.end||!sameEntity(current,input))fail('POLICY_TARGET_NOT_FOUND');}const text=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);return semanticEntityValue(hydrateEntityCorrections(d),input,text,input.markIndex); }
  catch (e) { fail((e as Error).message, 400); }
}
export function registerMappingRoutes(app: FastifyInstance) {
  app.post("/api/documents/:id/mapping-proposals", async req => {
    const doc = id.parse((req.params as any).id), input = spanSchema.parse(req.body);
    return projectScope(req, { document: doc }, ["view_original", "view_mapping"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      const value = await spanValue(d, input);
      const context=mappingContext(d,input.kind);
      const existing = (await getProjectMappings(db,d.project_id)).filter(m => mappingMatchesValue(m,value) && mappingMatchesEntity(m,input)&&m.scope===context.scope&&(m.inherited||m.token.startsWith(`【${context.prefix}_`)));
      return { proposals: existing.map(reference) };
    });
  });
  app.post("/api/documents/:id/mappings", async req => {
    const doc = id.parse((req.params as any).id), input = spanSchema.extend({ requestId: id }).parse(req.body);
    return projectScope(req, { document: doc }, ["view_original", "view_mapping"], async db => {
      const [scope] = await rows(db, sql`SELECT project_id FROM documents WHERE id=${doc}`);
      if (!scope) fail("NOT_FOUND", 404);
      // Same lock order as project policy updates/uploads: project then document.
      const [p] = await rows(db, sql`SELECT * FROM projects WHERE id=${scope.project_id} FOR UPDATE`);
      if (!p) fail("NOT_FOUND", 404);
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc} FOR SHARE`);
      const value = await spanValue(d, input);
      const [previous] = await rows(db, sql`SELECT * FROM entity_mappings WHERE project_id=${p.id} AND request_id=${input.requestId}`);
      if (previous) { const m = decode(previous); if (!mappingMatchesEntity(m,input) || !mappingMatchesValue(m,value)) fail("IDEMPOTENCY_CONFLICT"); return reference(m); }
      const all=await getProjectMappings(db,p.id);
      const reservedNamespace=await projectMappingNamespace(db,p.id);
      if(new Set(reservedNamespace.map(m=>m.token)).size>=MAX_MAPPING_ENTRIES)fail("MAPPING_LIMIT",400);
      const ordinal=nextOrdinal(reservedNamespace),mappingId=randomUUID(),context=mappingContext(d,input.kind),prefix=context.prefix,token=nextToken(prefix,reservedNamespace,await reservedTokens(db,d));
      if (token.includes(value)) fail("INVALID_REPLACEMENT", 400);
      const text=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`),forms=semanticEntityForms(hydrateEntityCorrections(d),input,text,input.markIndex);const payload = seal(JSON.stringify({ value,...forms.length>1?{forms}:{}, kind: input.kind,...input.rawEntityType!==undefined?{rawEntityType:input.rawEntityType}:{},...(context.scope?{scope:context.scope}:{}) }), `${d.tenant_id}:${p.id}:${mappingId}:mapping:1`);
      await rows(db, sql`INSERT INTO entity_mappings(id,tenant_id,project_id,request_id,ordinal,token,payload,created_by) VALUES(${mappingId},${d.tenant_id},${p.id},${input.requestId},${ordinal},${token},${payload},${req.user.id})`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${p.id},${req.user.id},'mapping_created',${mappingId})`);
      return { mode: "alias", mappingId, token, version: 1 };
    });
  });
  app.get("/api/projects/:id/mappings", async req => {
    const project = id.parse((req.params as any).id), { offset, limit } = paginationSchema.parse(req.query);
    return projectScope(req, { project }, ["view_mapping"], async db => {
      const list = (await getProjectMappings(db,project)).slice(offset,offset+limit);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'mapping_viewed',${project})`);
      return list;
    });
  });
  app.post("/api/documents/:id/restore", async req => {
    const doc = id.parse((req.params as any).id), input = z.object({ revision: z.number().int().nonnegative(), text: z.string().min(1) }).parse(req.body);
    if (!input.text.isWellFormed() || Buffer.byteLength(input.text) > TEXT_MAX_BYTES) fail("TEXT_SIZE_LIMIT", 400);
    return projectScope(req, { document: doc }, ["restore"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc} FOR SHARE`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT");
      const [snapshot] = await rows(db, sql`SELECT * FROM review_snapshots WHERE document_id=${doc} AND revision=${d.revision}`);
      const marks = (d.marks as Mark[]).filter(m => m.decision === "redact");
      const mappings = await mappingsForMarks(db, d, marks, req.user.id);
      let text: string;
      try { await runProcessing({ kind: "gate", doc: d, snapshot }); text = restoreDocumentAliases(input.text,unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`),d.marks,mappings,true,true,{semanticValue:(m,index)=>semanticEntityValue(hydrateEntityCorrections(d),m,unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`),index)}); }
      catch (e) { fail((e as Error).message, 400); }
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'text_restored',${doc})`);
      return { revision: d.revision, text };
    });
  });
}
