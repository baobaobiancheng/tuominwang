import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../packages/contracts/index.ts";
import { ocrCorrectionSchema, type OcrTextView } from "../../packages/contracts/ocr.ts";
import { rows, sql } from "../../packages/adapters/db.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
import { projectScope } from "./access.ts";
const params = z.object({ id, page: z.coerce.number().int().min(0).max(299) });
function fail(message: string, statusCode = 409): never { throw Object.assign(new Error(message), { statusCode }); }
export function registerOcrRoutes(app: FastifyInstance) {
  app.get("/api/documents/:id/pages/:page/ocr-text", async req => {
    const { id: doc, page } = params.parse(req.params), { revision } = z.object({ revision: z.coerce.number().int().nonnegative() }).parse(req.query);
    return projectScope(req, { document: doc }, ["view_original"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== revision) fail("VERSION_CONFLICT");
      return runProcessing<OcrTextView>({ kind: "ocr-text", doc: d, page });
    });
  });
  app.put("/api/documents/:id/pages/:page/ocr-text", { bodyLimit: 2 * 1024 * 1024 }, async req => {
    const { id: doc, page } = params.parse(req.params), correction = ocrCorrectionSchema.parse(req.body);
    return projectScope(req, { document: doc }, ["view_original", "review"], async db => {
      const [d] = await rows(db, sql`SELECT d.*,p.dictionary,p.dictionary_revision FROM documents d JOIN projects p ON p.id=d.project_id WHERE d.id=${doc} FOR UPDATE OF d`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== correction.revision) fail("VERSION_CONFLICT");
      if (d.state !== "review") fail(d.state === "outdated" ? "POLICY_CHANGED" : "DETECTION_INCOMPLETE");
      let result: any;
      try { result = await runProcessing({ kind: "ocr-correct", doc: d, page, correction }); }
      catch (e) { fail((e as Error).message, (e as Error).message === "OCR_TEXT_CONFLICT" ? 409 : 400); }
      if (!result.changed) return { revision: d.revision, changed: false };
      await rows(db, sql`UPDATE documents SET content=${result.content},content_hash=${result.hash},anchors=${JSON.stringify(result.anchors)}::jsonb,page_data=${JSON.stringify(result.pages)}::jsonb,marks=${JSON.stringify(result.marks)}::jsonb,recognition=${JSON.stringify(result.recognition)}::jsonb,revision=revision+1 WHERE id=${doc}`);
      // A new content revision has no saved review snapshot. Already issued links keep their immutable artifact.
      await rows(db, sql`UPDATE attempts SET finished_at=now(),outcome='ocr_text_changed' WHERE finished_at IS NULL AND job_id IN (SELECT id FROM jobs WHERE document_id=${doc} AND status IN ('queued','running'))`);
      await rows(db, sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE document_id=${doc} AND status IN ('queued','running')`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'ocr_text_corrected',${doc})`);
      return { revision: d.revision + 1, changed: true, correctionRevision: result.correctionRevision };
    });
  });
}
