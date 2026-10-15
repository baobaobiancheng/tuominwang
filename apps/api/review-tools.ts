import {openPageReview} from "../../packages/adapters/page-review-storage.ts";
import {sameEntity} from "../../packages/core/entity-identity.ts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, reviewSchema, REVIEW_BODY_BYTES, MAX_MARKS, markSchema, type Mark } from "../../packages/contracts/index.ts";
import { scoped, rows, sql } from "../../packages/adapters/db.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
import { mappingsForMarks } from "./mappings.ts";
import { saveReview } from "./reviews.ts";
import { isDeepStrictEqual } from "node:util";
import { projectScope } from "./access.ts";
import { reviewMarks } from "../../packages/core/redaction.ts";
import {validateEntityGeometryPolicy}from'../../packages/adapters/entity-geometry.ts';
import{readReviewProvenance,readReviewProvenanceArchive}from'../../packages/adapters/review-provenance.ts';import{addReviewEntityHints,type ReviewEntityHint}from'../../packages/core/review-entity-slots.ts';

function fail(message: string, statusCode = 409): never { throw Object.assign(new Error(message), { statusCode }); }
export function registerReviewTools(app: FastifyInstance) {
  const batchSchema = z.object({ documents: z.array(z.object({ id, revision: z.number().int().nonnegative() })).min(1).max(20), kind: markSchema.shape.kind.optional(), rawEntityType:markSchema.shape.rawEntityType, whitelist: z.boolean().default(false), decision: z.enum(["redact", "ignore"]).default("redact") });
  for (const mode of ["preview", "apply", "undo"] as const) app.post(`/api/projects/:id/review-batch/${mode}`, async req => {
    const project = id.parse((req.params as any).id), input = batchSchema.parse(req.body), ids = input.documents.map(d => d.id);
    if(input.rawEntityType!==undefined&&input.kind!=="自定义")fail("INVALID_ENTITY_TYPE",400);
    if (new Set(ids).size !== ids.length) fail("INVALID_INPUT", 400);
    return projectScope(req, { project }, ["review"], async db => {
      const [p] = await rows(db, sql`SELECT id FROM projects WHERE id=${project} FOR UPDATE`);
      if (!p) fail("NOT_FOUND", 404);
      const metadata = await rows(db, sql`SELECT id,revision,state,length(content)+length(marks::text) AS stored_size FROM documents WHERE project_id=${project} AND id IN (${sql.join(ids.map(v => sql`${v}`), sql`,`)}) ORDER BY id FOR UPDATE`);
      if (metadata.length !== ids.length) fail("NOT_FOUND", 404);
      if (metadata.some(d => input.documents.find(v => v.id === d.id)!.revision !== d.revision)) fail("VERSION_CONFLICT");
      if (metadata.some(d => d.state !== "review")) fail("DETECTION_INCOMPLETE");
      if (metadata.reduce((n, d) => n + d.stored_size, 0) > 80 * 1024 * 1024) fail("BULK_REVIEW_LIMIT", 400);
      const docs = await rows(db, sql`SELECT * FROM documents WHERE project_id=${project} AND id IN (${sql.join(ids.map(v => sql`${v}`), sql`,`)}) ORDER BY id`);
      const deadline = Date.now() + 60000, result: { id: string; revision: number; affected: number }[] = [];
      for (const d of docs) {
        const provenance=await readReviewProvenance(db,d);let affected = 0, next: ReviewEntityHint[] = addReviewEntityHints(provenance,d.marks).map(m => {
          if (m.decision !== "pending" || input.kind && !sameEntity(m,{kind:input.kind,rawEntityType:input.rawEntityType}) || input.whitelist && !m.sources?.some(s => s.code === "project-whitelist")) return m;
          affected++; return { ...m, decision: input.decision };
        });
        if (mode === "undo") {
          const [previous] = await rows(db, sql`SELECT * FROM review_snapshots WHERE document_id=${d.id} AND revision=${d.revision - 1}`);
          if (!previous || previous.content_hash !== d.content_hash || previous.parse_version !== d.parse_version || !isDeepStrictEqual(previous.recognition, d.recognition) || !isDeepStrictEqual(openPageReview({...d,revision:previous.revision,content_hash:previous.content_hash},previous.page_review),openPageReview(d)) || !isDeepStrictEqual(previous.page_data, d.page_data)) fail("SNAPSHOT_MISMATCH");
          const historical=await readReviewProvenanceArchive(db,d,previous),activeIds=new Set(provenance.entries.filter(e=>e.active).map(e=>e.id)),priorByIndex=new Map(historical.frame.entries.filter(e=>e.active).map(e=>[e.markIndex,e.id]));
          next = previous.marks.map((mark:Mark,index:number)=>{const id=priorByIndex.get(index);return{...mark,...id&&activeIds.has(id)?{reviewEntityId:id}:{}};}); affected = next.length;
        }
        if (mode === "preview") { result.push({ id: d.id, revision: d.revision, affected }); continue; }
        if (Date.now() >= deadline) fail("PROCESSING_TIMEOUT", 400);
        // A conflict or invalid mark anywhere rolls the whole transaction back; no partial batch is published.
        const saved = await saveReview(db, req.user.id, d, next, Math.min(15000, deadline - Date.now()), mode === "undo");
        result.push({ ...saved, affected });
      }
      return { documents: result };
    });
  });
  app.post("/api/documents/:id/preview", { bodyLimit: REVIEW_BODY_BYTES }, async req => {
    const doc = id.parse((req.params as any).id), input = reviewSchema.extend({ offset: z.number().int().nonnegative().default(0) }).parse(req.body);
    return projectScope(req, { document: doc }, ["view_original"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT");
      if (d.state !== "review") fail(d.state === "outdated" ? "POLICY_CHANGED" : "DETECTION_INCOMPLETE");
      const mappings = await mappingsForMarks(db, d, input.marks, req.user.id);
      try { const policy=await validateEntityGeometryPolicy(db,d,input.marks,input.pageReview??openPageReview(d));return { revision: d.revision, ...await runProcessing<object>({ kind: "preview", doc: {...d,page_review:policy}, marks: input.marks, mappings, offset: input.offset }) }; }
      catch (e) { fail((e as Error).message, 400); }
    });
  });
  app.post("/api/documents/:id/known-entities", { bodyLimit: REVIEW_BODY_BYTES }, async req => {
    const doc = id.parse((req.params as any).id), input = reviewSchema.parse(req.body);
    return projectScope(req, { document: doc }, ["view_original", "review"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT");
      if (d.state !== "review") fail(d.state === "outdated" ? "POLICY_CHANGED" : "DETECTION_INCOMPLETE");
      const marks = reviewMarks(d.marks, input.marks), mappings = await mappingsForMarks(db, d, marks, req.user.id);
      try { return { revision: d.revision, ...await runProcessing<object>({ kind: "known-entities", doc: d, marks, mappings }) }; }
      catch (e) { fail((e as Error).message, 400); }
    });
  });
  // POST keeps sensitive search terms out of URL/history/access logs.
  app.post("/api/documents/:id/search", { bodyLimit: REVIEW_BODY_BYTES }, async req => {
    const doc = id.parse((req.params as any).id), input = z.object({ revision: z.number().int().nonnegative(), query: z.string().min(1).max(200).refine(v => v.isWellFormed()), from: z.number().int().nonnegative().default(0), scope: z.enum(["all", "inside", "outside"]).default("all"), spans: z.array(markSchema.pick({ start: true, end: true, decision: true })).max(MAX_MARKS).optional() }).parse(req.body);
    return projectScope(req, { document: doc }, ["view_original"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT");
      try { return { revision: d.revision, ...await runProcessing<object>({ kind: "search", doc: d, query: input.query, offset: input.from, searchScope: input.scope, searchSpans: input.spans ?? d.marks }) }; }
      catch (e) { fail((e as Error).message, 400); }
    });
  });
}
