import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { batchSchema, FILE_MAX_BYTES, id, paginationSchema, revisionSchema, type UploadBatchView } from "../../packages/contracts/index.ts";
import { fileFormat } from "../../packages/core/files.ts";
import { readUploadBatchManifest, writeUploadBatchManifest, validateFolderBatchPaths } from "../../packages/core/upload-batch-manifest.ts";
import { hash, seal, unseal, writeOriginal } from "../../packages/adapters/storage.ts";
import { scoped, rows, sql, type DB } from "../../packages/adapters/db.ts";
import { projectScope, requirePermission, textArray } from "./access.ts";
import { documentPolicySchema } from "../../packages/contracts/document-policy.ts";
import { readProjectPresets } from "../../packages/adapters/project-presets.ts";
import { defaultProfile } from "../../packages/core/presets.ts";
import { withOwnedJobRetry } from "./mcp.ts";

function fail(message: string, statusCode = 400): never { throw Object.assign(new Error(message), { statusCode }); }
async function batchViews(db: DB, tenant: string, project: string, batches: any[]): Promise<UploadBatchView[]> {
  const manifests = batches.map(batch => {
    const { manifest, legacy } = readUploadBatchManifest(unseal(batch.manifest, `${tenant}:${project}:${batch.id}:manifest`));
    return { id: batch.id as string, createdAt: new Date(batch.created_at).toISOString(), files: manifest.files,
      ...legacy ? {} : { sourceRootName: manifest.sourceRootName, skippedEntries: manifest.skippedEntries, emptyDirectories: manifest.emptyDirectories } };
  });
  if (!manifests.length) return [];
  const requests = manifests.flatMap(batch => batch.files.map(file => file.requestId));
  const saved = await rows(db, sql`SELECT id,request_id,source_hash,source_bytes,source_name,import_document_type FROM documents WHERE project_id=${project} AND request_id IN (${sql.join(requests.map(request => sql`${request}::uuid`), sql`, `)})`);
  const documents = new Map(saved.map(doc => [doc.request_id, doc]));
  return manifests.map(batch => ({ ...batch, files: batch.files.map(file => {
    const doc = documents.get(file.requestId);
    const matches = doc?.source_name && (doc.import_document_type??'auto')===(file.documentType??'auto') && Number(doc.source_bytes) === file.size && (!file.sha256 || file.sha256 === doc.source_hash)
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
    const folder = { files: input.files, sourceRootName: input.sourceRootName ?? '文件夹', skippedEntries: input.skippedEntries ?? [], emptyDirectories: input.emptyDirectories ?? [] };
    const legacy = !input.sourceRootName && !input.skippedEntries?.length && !input.emptyDirectories?.length;
    if (!legacy) validateFolderBatchPaths(folder);
    const manifest = writeUploadBatchManifest(folder, legacy);
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
      const manifest = readUploadBatchManifest(unseal(batch.manifest, `${req.user.tenant_id}:${project}:${input.batchId}:manifest`)).manifest.files;
      const entry = manifest.find(f => f.requestId === input.requestId);
      if (!entry || entry.size !== bytes.length) fail("FILE_SIZE_MISMATCH");
      if (entry.sha256 && entry.sha256 !== digest) fail("FILE_HASH_MISMATCH");
      const [previous] = await rows(db, sql`SELECT id,source_hash,source_name,import_document_type FROM documents WHERE project_id=${project} AND request_id=${input.requestId}`);
      if (previous) {
        if (previous.source_hash !== digest || unseal(previous.source_name, `${req.user.tenant_id}:${project}:${previous.id}:name`) !== entry.path || (previous.import_document_type ?? 'auto') !== (entry.documentType ?? 'auto')) fail("IDEMPOTENCY_CONFLICT", 409);
        return { id: previous.id };
      }
      const doc = randomUUID(), source = randomUUID(), aad = `${req.user.tenant_id}:${project}:${doc}`;
      // An import route belongs to this document before its first detect job.
      // The uploader only needs upload permission, so configuration save (review permission,
      // revision change and a second recognition) is not used here.
      const importType = entry.documentType && entry.documentType !== 'auto' ? entry.documentType : null;
      let initialPolicy:string|null=null;
      if(importType){
        const [projectRow]=await rows(db,sql`SELECT id,tenant_id,preset_policy,preset_revision FROM projects WHERE id=${project}`);
        const presets=readProjectPresets(projectRow),baseProfile=structuredClone(presets.profile?.settings??defaultProfile());
        const profile=structuredClone(baseProfile);profile.id=randomUUID();profile.source='user';profile.readonly=false;
        const policy=documentPolicySchema.parse({revision:1,profile,baseProfile,ruleset:presets.ruleset?.settings??null,configuration:{documentType:importType},batch:manifest.length>1});
        initialPolicy=seal(JSON.stringify(policy),`${aad}:document-policy`);
      }
      await rows(db, sql`INSERT INTO documents(id,tenant_id,project_id,request_id,content,content_hash,source_id,source_name,source_format,source_hash,source_bytes,is_batch,import_document_type,document_policy,document_policy_revision)
        VALUES(${doc},${req.user.tenant_id},${project},${input.requestId},${seal("", aad)},${hash("")},${source},${seal(entry.path, aad + ":name")},${fileFormat(entry.path)},${digest},${bytes.length},${manifest.length > 1},${importType},${initialPolicy},${importType?1:0})`);
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
      const retried = await withOwnedJobRetry(db, req, target, async () => {
        const [doc] = await rows(db, sql`SELECT * FROM documents WHERE id=${target.document_id} FOR UPDATE`);
        if (!doc || doc.revision !== revision || target.revision !== revision) fail("VERSION_CONFLICT", 409);
        const [latest] = await rows(db, sql`SELECT * FROM jobs WHERE document_id=${doc.id} ORDER BY created_at DESC,id DESC LIMIT 1`);
        if (latest?.id !== job || !["failed", "cancelled"].includes(latest.status)) fail("JOB_NOT_RETRYABLE", 409);
        if (target.kind === "detect" && target.error_code === "PDF_OCR_PAUSED") fail("PDF_OCR_CONTROL_REQUIRED", 409);
        if (target.kind === "detect" && doc.state !== "queued") fail("JOB_NOT_RETRYABLE", 409);
        const next = randomUUID();
        let mappingName:string|null=null;
        if(target.kind==="export"&&Boolean(target.mapping_name_ciphertext)!==Boolean(target.mapping_name_hash))fail("MAPPING_ARCHIVE_INVALID",409);
        if(target.kind==="export"&&target.mapping_name_ciphertext){
          const name=unseal(target.mapping_name_ciphertext,`${target.tenant_id}:${target.project_id}:${target.id}:mapping-name`);
          if(hash(name)!==target.mapping_name_hash)fail("MAPPING_ARCHIVE_INVALID",409);
          mappingName=seal(name,`${target.tenant_id}:${target.project_id}:${next}:mapping-name`);
        }
        await rows(db, sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind,revision,required_permissions,collab_task_id,mapping_name_ciphertext,mapping_name_hash,pdf_seal_manual_checked,pdf_seal_manual_source_hash) VALUES(${next},${req.user.tenant_id},${doc.project_id},${doc.id},${req.user.id},${target.kind},${revision},${textArray(target.required_permissions)},${target.collab_task_id},${mappingName},${target.mapping_name_hash},${target.pdf_seal_manual_checked},${target.pdf_seal_manual_source_hash})`);
        await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id,details) VALUES(${req.user.tenant_id},${doc.project_id},${req.user.id},'job_retried',${next},${JSON.stringify({parentJobId:job})}::jsonb)`);
        return { id: next, sourceHash: doc.source_hash ?? doc.content_hash };
      });
      return { id: retried.id };
    });
  });
  app.get("/api/documents/:id/revisions", async req => {
    const doc = id.parse((req.params as any).id);
    return projectScope(req, { document: doc }, ["view_original"], db => rows(db, sql`SELECT revision,content_hash,parse_version,rule_version,created_at,review_mode FROM review_snapshots WHERE document_id=${doc} ORDER BY revision DESC`));
  });
}
