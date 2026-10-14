import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { id, markSchema, paginationSchema, TEXT_MAX_BYTES, type Mark } from "../../packages/contracts/index.ts";
import { scoped, rows, sql, type DB } from "../../packages/adapters/db.ts";
import { seal, unseal } from "../../packages/adapters/storage.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
import { restoreText, type Mapping } from "../../packages/core/mappings.ts";
import { projectScope } from "./access.ts";

function fail(message: string, statusCode = 409): never { throw Object.assign(new Error(message), { statusCode }); }
function decode(row: any): Mapping {
  const payload = JSON.parse(unseal(row.payload, `${row.tenant_id}:${row.project_id}:${row.id}:mapping:${row.version}`));
  return { id: row.id, token: row.token, version: row.version, ...payload };
}
function reference(m: Mapping) { return { mode: "alias" as const, mappingId: m.id, token: m.token, version: m.version }; }
export async function mappingsForMarks(db: DB, d: any, marks: Mark[], user: string) {
  const ids = new Set(marks.flatMap(m => m.replacement?.mode === "alias" ? [m.replacement.mappingId] : []));
  if (!ids.size) return [];
  // ponytail: immutable project mappings are capped at 1,000; one query avoids one round trip per mark.
  const list = await rows(db, sql`SELECT * FROM entity_mappings WHERE project_id=${d.project_id}`);
  const selected = list.filter(m => ids.has(m.id)).map(decode);
  if (selected.length !== ids.size) fail("MAPPING_MISMATCH", 400);
  return selected;
}
const spanSchema = markSchema.pick({ start: true, end: true, kind: true }).extend({ revision: z.number().int().nonnegative() });
async function spanValue(d: any, input: z.infer<typeof spanSchema>) {
  if (d.revision !== input.revision) fail("VERSION_CONFLICT");
  if (d.state !== "review") fail(d.state === "outdated" ? "POLICY_CHANGED" : "DETECTION_INCOMPLETE");
  try { return await runProcessing<string>({ kind: "mapping-value", doc: d, marks: [{ start: input.start, end: input.end, kind: input.kind, decision: "pending" }] }); }
  catch (e) { fail((e as Error).message, 400); }
}
export function registerMappingRoutes(app: FastifyInstance) {
  app.post("/api/documents/:id/mapping-proposals", async req => {
    const doc = id.parse((req.params as any).id), input = spanSchema.parse(req.body);
    return projectScope(req, { document: doc }, ["view_original", "view_mapping"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      const value = await spanValue(d, input);
      const existing = (await rows(db, sql`SELECT * FROM entity_mappings WHERE project_id=${d.project_id} ORDER BY ordinal`)).map(decode).filter(m => m.value === value && m.kind === input.kind);
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
      if (previous) { const m = decode(previous); if (m.kind !== input.kind || m.value !== value) fail("IDEMPOTENCY_CONFLICT"); return reference(m); }
      const [count] = await rows(db, sql`SELECT COUNT(*)::int AS n FROM entity_mappings WHERE project_id=${p.id}`);
      if (count.n >= 1000) fail("MAPPING_LIMIT", 400);
      const ordinal = count.n + 1, mappingId = randomUUID(), prefix = ["姓名", "机构", "地址"].includes(input.kind) ? input.kind : "敏感项";
      const token = `【${prefix}_${String(ordinal).padStart(6, "0")}】`;
      if (token.includes(value)) fail("INVALID_REPLACEMENT", 400);
      const payload = seal(JSON.stringify({ value, kind: input.kind }), `${d.tenant_id}:${p.id}:${mappingId}:mapping:1`);
      await rows(db, sql`INSERT INTO entity_mappings(id,tenant_id,project_id,request_id,ordinal,token,payload,created_by) VALUES(${mappingId},${d.tenant_id},${p.id},${input.requestId},${ordinal},${token},${payload},${req.user.id})`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${p.id},${req.user.id},'mapping_created',${mappingId})`);
      return { mode: "alias", mappingId, token, version: 1 };
    });
  });
  app.get("/api/projects/:id/mappings", async req => {
    const project = id.parse((req.params as any).id), { offset, limit } = paginationSchema.parse(req.query);
    return projectScope(req, { project }, ["view_mapping"], async db => {
      const list = (await rows(db, sql`SELECT * FROM entity_mappings WHERE project_id=${project} ORDER BY ordinal LIMIT ${limit} OFFSET ${offset}`)).map(decode);
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
      try { await runProcessing({ kind: "gate", doc: d, snapshot }); text = restoreText(input.text, mappings, true, true); }
      catch (e) { fail((e as Error).message, 400); }
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'text_restored',${doc})`);
      return { revision: d.revision, text };
    });
  });
}
