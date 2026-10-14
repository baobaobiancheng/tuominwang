import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, revisionSchema, type UploadEntry } from "../../packages/contracts/index.ts";
import { rows, scoped, sql } from "../../packages/adapters/db.ts";
import { hash, seal, unseal } from "../../packages/adapters/storage.ts";
import { denied, projectScope } from "./access.ts";

export function registerLifecycleRoutes(app: FastifyInstance) {
  app.get("/api/organization/capacity", req => scoped(req.user.id, req.user.tenant_id, async db => {
    if (!(await rows(db, sql`SELECT organization_role() AS role`)).some(r => ["owner", "admin"].includes(r.role))) denied();
    await rows(db, sql`INSERT INTO organization_limits(tenant_id) VALUES(${req.user.tenant_id}) ON CONFLICT DO NOTHING`);
    return (await rows(db, sql`SELECT * FROM organization_limits`))[0];
  }));
  app.put("/api/organization/capacity", async req => {
    const input = z.object({ revision: z.number().int().nonnegative(), byteLimit: z.number().int().min(0).max(1099511627776), documentLimit: z.number().int().min(0).max(1000000) }).parse(req.body);
    return scoped(req.user.id, req.user.tenant_id, async db => {
      const [old] = await rows(db, sql`SELECT * FROM organization_limits FOR UPDATE`);
      if (!old) denied();
      if (old.revision !== input.revision) denied("VERSION_CONFLICT", 409);
      if (Number(old.used_bytes) > input.byteLimit || old.used_documents > input.documentLimit) denied("CAPACITY_BELOW_USAGE", 409);
      const [saved] = await rows(db, sql`UPDATE organization_limits SET byte_limit=${input.byteLimit},document_limit=${input.documentLimit},revision=revision+1 RETURNING revision`);
      await rows(db, sql`INSERT INTO organization_audit(tenant_id,user_id,event,object_id,details) VALUES(${req.user.tenant_id},${req.user.id},'capacity_updated',${req.user.tenant_id},${JSON.stringify(input)}::jsonb)`);
      return saved;
    });
  });
  app.post("/api/documents/:id/delete", async req => {
    const document = id.parse((req.params as any).id), { revision } = revisionSchema.parse(req.body);
    return projectScope(req, { document }, ["delete_material"], async (db, project) => {
      const [doc] = await rows(db, sql`SELECT request_id,revision FROM documents WHERE id=${document} FOR UPDATE`);
      if (!doc || doc.revision !== revision) denied("VERSION_CONFLICT", 409);
      // Delete only this entry from encrypted upload history; unrelated files remain resumable.
      const changes: { id: string; manifest: string | null; hash?: string }[] = [];
      let cursor = "00000000-0000-0000-0000-000000000000";
      for (;;) {
        const batches = await rows(db, sql`SELECT id,manifest FROM upload_batches WHERE project_id=${project} AND id>${cursor}::uuid ORDER BY id LIMIT 100`);
        for (const batch of batches) {
          const aad = `${req.user.tenant_id}:${project}:${batch.id}:manifest`, entries: UploadEntry[] = JSON.parse(unseal(batch.manifest, aad));
          const remaining = entries.filter(e => e.requestId !== doc.request_id);
          if (remaining.length !== entries.length) { const plain = JSON.stringify(remaining); changes.push({ id: batch.id, manifest: remaining.length ? seal(plain, aad) : null, hash: hash(plain) }); }
        }
        if (batches.length < 100) break;
        cursor = batches.at(-1)!.id;
      }
      const [result] = await rows(db, sql`SELECT delete_material(${document},${revision},${JSON.stringify(changes)}::jsonb) AS "purgeAfter"`);
      return { deleted: true, ...result };
    });
  });
}
