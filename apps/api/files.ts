import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { batchSchema, FILE_MAX_BYTES, id, paginationSchema, revisionSchema, type UploadBatchView, type UploadEntry } from "../../packages/contracts/index.ts";
import { fileFormat } from "../../packages/core/files.ts";
import { hash, seal, unseal, writeOriginal } from "../../packages/adapters/storage.ts";
import { scoped, rows, sql, type DB } from "../../packages/adapters/db.ts";
import { projectScope, requirePermission, textArray } from "./access.ts";

function fail(message: string, statusCode = 400): never { throw Object.assign(new Error(message), { statusCode }); }
async function batchViews(db: DB, tenant: string, project: string, batches: any[]): Promise<UploadBatchView[]> {
  const manifests = batches.map(batch => ({
    id: batch.id as string, createdAt: new Date(batch.created_at).toISOString(),
    files: JSON.parse(unseal(batch.manifest, `${tenant}:${project}:${batch.id}:manifest`)) as UploadEntry[],
  }));
  if (!manifests.length) return [];
  const requests = manifests.flatMap(batch => batch.files.map(file => file.requestId));
  const saved = await rows(db, sql`SELECT id,request_id,source_hash,source_bytes,source_name FROM documents WHERE project_id=${project} AND request_id IN (${sql.join(requests.map(request => sql`${request}::uuid`), sql`, `)})`);
  const documents = new Map(saved.map(doc => [doc.request_id, doc]));
  return manifests.map(batch => ({ ...batch, files: batch.files.map(file => {
    const doc = documents.get(file.requestId);
    const matches = doc?.source_name && Number(doc.source_bytes) === file.size && (!file.sha256 || file.sha256 === doc.source_hash)
      && unseal(doc.source_name, `${tenant}:${project}:${doc.id}:name`) === file.path;
    return { ...file, documentId: matches ? doc.id as string : null };
  }) }));
}
export function registerFileRoutes(app: FastifyInstance) {
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
  app.get("/api/projects/:id/upload-batches", async req => {
    const project = id.parse((req.params as any).id), { offset, limit } = paginationSchema.parse(req.query);
    return projectScope(req, { project }, ["upload"], async db => {
      if (!(await rows(db, sql`SELECT id FROM projects WHERE id=${project}`)).length) fail("NOT_FOUND", 404);
      const batches = await rows(db, sql`SELECT id,manifest,created_at FROM upload_batches WHERE project_id=${project} AND (created_by=${req.user.id} OR project_permission(${project}::uuid,'view_original')) ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`);
      return batchViews(db, req.user.tenant_id, project, batches);
    });
  });
  app.get("/api/projects/:id/upload-batches/:batchId", async req => {
    const { id: project, batchId } = z.object({ id, batchId: id }).parse(req.params);
    return projectScope(req, { project }, ["upload"], async db => {
      const batches = await rows(db, sql`SELECT id,manifest,created_at FROM upload_batches WHERE id=${batchId} AND project_id=${project} AND (created_by=${req.user.id} OR project_permission(${project}::uuid,'view_original'))`);
      if (!batches.length) fail("NOT_FOUND", 404);
      return (await batchViews(db, req.user.tenant_id, project, batches))[0];
    });
  });
  app.post("/api/projects/:id/upload-batches", async req => {
    const project = id.parse((req.params as any).id), input = batchSchema.parse(req.body);
    const paths = new Set<string>(), requests = new Set<string>();
    for (const entry of input.files) {
      try { fileFormat(entry.path); } catch (e) { fail((e as Error).message); }
      if (paths.has(entry.path) || requests.has(entry.requestId)) fail("DUPLICATE_FILE");
      paths.add(entry.path); requests.add(entry.requestId);
    }
    const manifest = JSON.stringify(input.files);
    return projectScope(req, { project }, ["upload"], async db => {
      if (!(await rows(db, sql`SELECT id FROM projects WHERE id=${project} FOR UPDATE`)).length) fail("NOT_FOUND", 404);
      const [previous] = await rows(db, sql`SELECT project_id,manifest_hash,created_by,project_permission(${project}::uuid,'view_original') AS can_view FROM upload_batches WHERE id=${input.id}`);
      if (previous) {
        if (previous.created_by !== req.user.id && !previous.can_view) fail("NOT_FOUND", 404);
        if (previous.project_id !== project || previous.manifest_hash !== hash(manifest)) fail("IDEMPOTENCY_CONFLICT", 409);
        return { id: input.id };
      }
      const encrypted = seal(manifest, `${req.user.tenant_id}:${project}:${input.id}:manifest`);
      await rows(db, sql`INSERT INTO upload_batches(id,tenant_id,project_id,manifest,manifest_hash,created_by) VALUES(${input.id},${req.user.tenant_id},${project},${encrypted},${hash(manifest)},${req.user.id})`);
      return { id: input.id };
    });
  });
  app.post("/api/projects/:id/files", { bodyLimit: FILE_MAX_BYTES }, async req => {
    const project = id.parse((req.params as any).id);
    const input = z.object({ batchId: id, requestId: id }).parse(req.query);
    if (!Buffer.isBuffer(req.body) || !req.body.length) fail("EMPTY_FILE");
    const bytes = req.body as Buffer, digest = hash(bytes);
    return projectScope(req, { project }, ["upload"], async db => {
      if (!(await rows(db, sql`SELECT id FROM projects WHERE id=${project} FOR UPDATE`)).length) fail("NOT_FOUND", 404);
      const [batch] = await rows(db, sql`SELECT manifest FROM upload_batches WHERE id=${input.batchId} AND project_id=${project} AND (created_by=${req.user.id} OR project_permission(${project}::uuid,'view_original'))`);
      if (!batch) fail("NOT_FOUND", 404);
      const manifest = JSON.parse(unseal(batch.manifest, `${req.user.tenant_id}:${project}:${input.batchId}:manifest`)) as z.infer<typeof batchSchema>["files"];
      const entry = manifest.find(f => f.requestId === input.requestId);
      if (!entry || entry.size !== bytes.length) fail("FILE_SIZE_MISMATCH");
      if (entry.sha256 && entry.sha256 !== digest) fail("FILE_HASH_MISMATCH");
      const [previous] = await rows(db, sql`SELECT id,source_hash,source_name FROM documents WHERE project_id=${project} AND request_id=${input.requestId}`);
      if (previous) {
        if (previous.source_hash !== digest || unseal(previous.source_name, `${req.user.tenant_id}:${project}:${previous.id}:name`) !== entry.path) fail("IDEMPOTENCY_CONFLICT", 409);
        return { id: previous.id };
      }
      const doc = randomUUID(), source = randomUUID(), aad = `${req.user.tenant_id}:${project}:${doc}`;
      await rows(db, sql`INSERT INTO documents(id,tenant_id,project_id,request_id,content,content_hash,source_id,source_name,source_format,source_hash,source_bytes,is_batch)
        VALUES(${doc},${req.user.tenant_id},${project},${input.requestId},${seal("", aad)},${hash("")},${source},${seal(entry.path, aad + ":name")},${fileFormat(entry.path)},${digest},${bytes.length},${manifest.length > 1})`);
      await writeOriginal(source, bytes, doc);
      await rows(db, sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind) VALUES(${randomUUID()},${req.user.tenant_id},${project},${doc},${req.user.id},'detect')`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'file_uploaded',${doc})`);
      return { id: doc };
    });
  });
  app.post("/api/jobs/:id/retry", async req => {
    const job = id.parse((req.params as any).id), { revision } = revisionSchema.parse(req.body);
    return projectScope(req, { job }, [], async (db, project) => {
      const [target] = await rows(db, sql`SELECT * FROM jobs WHERE id=${job}`);
      if (!target) fail("NOT_FOUND", 404);
      await requirePermission(db, project, target.required_permissions);
      const [doc] = await rows(db, sql`SELECT * FROM documents WHERE id=${target.document_id} FOR UPDATE`);
      if (doc.revision !== revision || target.revision !== revision) fail("VERSION_CONFLICT", 409);
      const [latest] = await rows(db, sql`SELECT * FROM jobs WHERE document_id=${doc.id} ORDER BY created_at DESC,id DESC LIMIT 1`);
      if (latest.id !== job || !["failed", "cancelled"].includes(latest.status)) fail("JOB_NOT_RETRYABLE", 409);
      if (target.kind === "detect" && doc.state !== "queued") fail("JOB_NOT_RETRYABLE", 409);
      const next = randomUUID();
      await rows(db, sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind,revision,required_permissions) VALUES(${next},${req.user.tenant_id},${doc.project_id},${doc.id},${req.user.id},${target.kind},${revision},${textArray(target.required_permissions)})`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${doc.project_id},${req.user.id},'job_retried',${next})`);
      return { id: next };
    });
  });
  app.get("/api/documents/:id/revisions", async req => {
    const doc = id.parse((req.params as any).id);
    return projectScope(req, { document: doc }, ["view_original"], db => rows(db, sql`SELECT revision,content_hash,parse_version,rule_version,created_at FROM review_snapshots WHERE document_id=${doc} ORDER BY revision DESC`));
  });
}
