import { entityValueKey } from "../../packages/core/entity-identity.ts";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { dictionarySchema, id, revisionSchema } from "../../packages/contracts/index.ts";
import { scoped, rows, sql } from "../../packages/adapters/db.ts";
import { seal, unseal } from "../../packages/adapters/storage.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
import { projectScope, textArray } from "./access.ts";

function fail(message: string, statusCode = 409): never { throw Object.assign(new Error(message), { statusCode }); }
export function registerRecognitionRoutes(app: FastifyInstance, nerReady: boolean) {
  app.post("/api/projects/:id/dictionary/import", { bodyLimit: 5 * 1024 * 1024 }, async req => {
    const project = id.parse((req.params as any).id), { revision } = z.object({ revision: z.coerce.number().int().nonnegative() }).parse(req.query);
    if (!Buffer.isBuffer(req.body)) fail("INVALID_DICTIONARY_TABLE", 400);
    const bytes = req.body;
    return projectScope(req, { project }, ["manage_dictionary"], async db => {
      const [p] = await rows(db, sql`SELECT dictionary_revision FROM projects WHERE id=${project}`);
      if (!p) fail("NOT_FOUND", 404);
      if (p.dictionary_revision !== revision) fail("VERSION_CONFLICT");
      try { return { revision, entries: await runProcessing({ kind: "dictionary-import", bytes }) }; }
      catch (e) { fail((e as Error).message, 400); }
    });
  });
  app.get("/api/projects/:id/dictionary.xlsx", async (req, reply) => {
    const project = id.parse((req.params as any).id), { revision } = z.object({ revision: z.coerce.number().int().nonnegative() }).parse(req.query);
    const result = await projectScope(req, { project }, ["manage_dictionary"], async db => {
      const [p] = await rows(db, sql`SELECT * FROM projects WHERE id=${project}`);
      if (!p) fail("NOT_FOUND", 404);
      if (p.dictionary_revision !== revision) fail("VERSION_CONFLICT");
      const entries = p.dictionary ? JSON.parse(unseal(p.dictionary, `${p.tenant_id}:${p.id}:dictionary`)) : [];
      const output = await runProcessing<Uint8Array>({ kind: "dictionary-export", entries });
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${p.tenant_id},${project},${req.user.id},'dictionary_exported',${project})`);
      return Buffer.from(output);
    });
    return reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", 'attachment; filename="dictionary.xlsx"').send(result);
  });
  app.get("/api/projects/:id/dictionary", async req => {
    const project = id.parse((req.params as any).id);
    return projectScope(req, { project }, ["manage_dictionary"], async db => {
      const [p] = await rows(db, sql`SELECT * FROM projects WHERE id=${project}`);
      if (!p) fail("NOT_FOUND", 404);
      return { revision: p.dictionary_revision, entries: p.dictionary ? JSON.parse(unseal(p.dictionary, `${p.tenant_id}:${p.id}:dictionary`)) : [] };
    });
  });
  app.put("/api/projects/:id/dictionary", async req => {
    const project = id.parse((req.params as any).id), input = dictionarySchema.parse(req.body);
    const keys = input.entries.map(e => entityValueKey(e,e.value));
    if (new Set(keys).size !== keys.length) fail("DUPLICATE_DICTIONARY_ENTRY", 400);
    return projectScope(req, { project }, ["manage_dictionary"], async db => {
      const [p] = await rows(db, sql`SELECT * FROM projects WHERE id=${project} FOR UPDATE`);
      if (!p) fail("NOT_FOUND", 404);
      if (p.dictionary_revision !== input.revision) fail("VERSION_CONFLICT");
      const aad = `${p.tenant_id}:${p.id}:dictionary`, previous = p.dictionary ? JSON.parse(unseal(p.dictionary, aad)) : [];
      if (isDeepStrictEqual(previous, input.entries)) return { revision: p.dictionary_revision };
      await rows(db, sql`UPDATE projects SET dictionary=${seal(JSON.stringify(input.entries), aad)},dictionary_revision=dictionary_revision+1 WHERE id=${project}`);
      // Invalidate, do not apply old decisions to changed policy and do not start new work implicitly.
      await rows(db, sql`UPDATE documents SET state='outdated',revision=revision+1 WHERE project_id=${project}`);
      await rows(db, sql`UPDATE attempts SET finished_at=now(),outcome='policy_changed' WHERE finished_at IS NULL AND job_id IN (SELECT id FROM jobs WHERE project_id=${project} AND status IN ('queued','running'))`);
      await rows(db, sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE project_id=${project} AND status IN ('queued','running')`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${p.tenant_id},${project},${req.user.id},'dictionary_updated',${project})`);
      return { revision: p.dictionary_revision + 1 };
    });
  });
  app.post("/api/documents/:id/recognize", async req => {
    const doc = id.parse((req.params as any).id), input = revisionSchema.extend({ ner: z.boolean().default(false) }).parse(req.body);
    if (input.ner && !nerReady) fail("NER_MODEL_REQUIRED");
    return projectScope(req, { document: doc }, input.ner ? ["review", "manage_models"] : ["review"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc} FOR UPDATE`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT");
      if ((await rows(db, sql`SELECT id FROM jobs WHERE document_id=${doc} AND status IN ('queued','running')`)).length) fail("JOB_ACTIVE");
      await rows(db, sql`UPDATE documents SET revision=revision+1,state='queued',marks='[]',ner_enabled=${input.ner},recognition='{}' WHERE id=${doc}`);
      const job = randomUUID();
      await rows(db, sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind,revision,required_permissions) VALUES(${job},${d.tenant_id},${d.project_id},${doc},${req.user.id},'detect',${d.revision + 1},${textArray(input.ner ? ["review", "manage_models"] : ["review"])})`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'recognition_requested',${doc})`);
      return { revision: d.revision + 1, jobId: job };
    });
  });
}
