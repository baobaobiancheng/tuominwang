import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../packages/contracts/index.ts";
import { projectScope, denied as fail } from "./access.ts";
import { rows, sql } from "../../packages/adapters/db.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
export function registerVisualRoutes(app: FastifyInstance) {
  app.post("/api/documents/:id/pages/:page/visual-candidates", async req => {
    const doc = id.parse((req.params as any).id), page = z.coerce.number().int().min(0).max(299).parse((req.params as any).page);
    const input = z.object({ revision: z.number().int().nonnegative(), detectors: z.array(z.enum(["face", "seal"])).min(1).max(2) }).strict().parse(req.body);
    return projectScope(req, { document: doc }, ["view_original", "review"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT", 409);
      if (d.state !== "review") fail("DETECTION_INCOMPLETE", 409);
      try { return { revision: d.revision, page, ...await runProcessing<object>({ kind: "visual-detect", doc: d, page, detectors: input.detectors }) }; }
      catch (error) { fail((error as Error).message, 409); }
    });
  });
}
