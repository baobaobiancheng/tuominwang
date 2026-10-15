import{isWordFormat}from'../../packages/core/document-format.ts';
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../packages/contracts/index.ts";
import type { DocxPreviewPackage } from "../../packages/contracts/docx-preview.ts";
import { rows, sql } from "../../packages/adapters/db.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
import { projectScope, denied } from "./access.ts";
export function registerDocxPreviewRoutes(app: FastifyInstance) {
  app.get("/api/documents/:id/docx-preview", async (req, reply) => {
    const document = id.parse((req.params as any).id), { revision } = z.object({ revision: z.coerce.number().int().nonnegative() }).parse(req.query); reply.header("Cache-Control", "no-store");
    return projectScope(req, { document }, ["view_original"], async db => { const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${document} FOR SHARE`); if (!d) denied("NOT_FOUND", 404); if (d.revision !== revision) denied("VERSION_CONFLICT", 409); if (!isWordFormat(d.source_format)) denied("UNSUPPORTED_FORMAT", 400); if (!["review", "outdated"].includes(d.state)) denied("DETECTION_INCOMPLETE", 409); try { return await runProcessing<DocxPreviewPackage>({ kind: "docx-preview", doc: d }); } catch (e) { denied((e as Error).message, 409); } });
  });
}
