import {withReviewEntityBirths}from'../../packages/core/review-entity-birth.ts';
import {registerReviewFeedbackRoutes} from './review-feedback.ts';
import {registerAutomaticRuntimeRuleRoutes} from './automatic-runtime-rules.ts';
import {registerEntityFilterRoutes} from './entity-filter.ts';
import {registerManualOccurrenceRoutes} from './manual-occurrences.ts';
import {registerEntityGeometryRoutes}from'./entity-geometry.ts';
import {validateEntityGeometryPolicy}from'../../packages/adapters/entity-geometry.ts';
import {registerEntityCorrectionRoutes} from './entity-corrections.ts';
import {readReviewProvenance} from '../../packages/adapters/review-provenance.ts';
import {addReviewEntityHints} from '../../packages/core/review-entity-slots.ts';
import {openEntityCorrections} from '../../packages/adapters/entity-corrections.ts';
import {preflightUnifiedAliasExport,assertUnifiedAliasExportEpoch} from './unified-alias-export.ts';
import {registerPageRotationRoutes} from './page-rotation.ts';
import {readPageRotationState} from '../../packages/adapters/page-rotation-state.ts';
import {registerSourceReviewRoutes} from './source-review.ts';
import {registerUnifiedAliasRoutes} from './unified-aliases.ts';
import {registerReviewProvenanceRoutes} from './review-provenance.ts';
import {registerDocumentNormalizationRoutes} from './document-normalization.ts';
import {documentProcessingFormat,isLegacyWordFormat} from '../../packages/core/document-format.ts';
import {registerFolderOutputRoutes} from './folder-output.ts';
import {registerReleaseStateRoutes} from './release-state.ts';
import {registerMappingLibraryRoutes} from './mapping-library.ts';
import {registerDocumentRouteRoutes} from "./document-route.ts";
import {registerDocxSafeModeRoutes} from "./docx-safe-mode.ts";
import {registerDocxImageOcrRoutes} from "./docx-image-ocr.ts";
import {registerMarkdownReviewRoutes} from "./markdown-review.ts";
import {openPageReview} from "../../packages/adapters/page-review-storage.ts";
import {registerProcessingEventRoutes} from "./processing-events.ts";
import {registerProcessingResourceRoutes} from "./processing-resources.ts";
import {registerImageBatchSearchRoutes} from "./image-batch-search.ts";
import {registerMarkdownManualDraftRoutes} from "./markdown-manual-draft.ts";
import {recordMarkdownExportEvent} from "../../packages/adapters/markdown-export-events.ts";
import {expectsMarkdownExport,markdownSourceKind} from "../../packages/adapters/markdown-outcome.ts";
import {registerSupportRoutes} from "./support.ts";
import {registerProcessingObservability} from "./processing-observability.ts";
import {registerRuntimeRules} from "./runtime-rules.ts";
import {registerReferenceDictionary} from "./reference-dictionary.ts";
import {registerRestorationBatchRoutes} from "./restoration-batch.ts";
import {registerFeedbackRoutes} from "./feedback.ts";
import {registerImageUtilityRoutes} from "./image-utilities.ts";
import {registerNetworkPolicyRoutes} from "./network-policy.ts";
import {registerWorkspaceRecoveryRoutes} from "./workspace-recovery.ts";
import { registerDocumentUnlockRoutes } from './document-unlock.ts';
import { registerMcpRoutes } from "./mcp.ts";
import { applyDocumentConfiguration } from "./document-policy.ts";
import { registerDocumentPolicyRoutes } from "./document-policy.ts";
import { registerOfficeVisualRoutes } from "./office-visual.ts";
import { resolveDocumentPolicy } from "../../packages/adapters/document-policy.ts";
import { readProjectPresets } from "../../packages/adapters/project-presets.ts";
import { registerWorkspacePortableRoutes } from "./workspace-portable.ts";
import { registerRestorationFileRoutes } from "./restoration-files.ts";
import { registerProjectEntities } from "./project-entities.ts";
import { registerPresetRoutes } from "./presets.ts";
import { defaultProjectPresets } from './presets.ts';
import { registerReplacementPolicies } from "./replacement-policies.ts";
import { registerDocxLayoutRoutes } from "./docx-layout.ts";
import { registerDocxPreviewRoutes } from './docx-preview.ts';
import { registerMappingExports } from './mapping-export.ts';
import { registerOcrRoutes } from "./ocr.ts";
import { registerVisualRoutes } from "./visual.ts";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { ZodError, z } from "zod";
import {
  id,
  loginSchema,
  projectSchema,
  textSchema,
  reviewSchema,
  revisionSchema,
  TEXT_MAX_BYTES,
  REVIEW_BODY_BYTES,
  paginationSchema,
  sourceFormatSchema,
  textPageSchema,
} from "../../packages/contracts/index.ts";
import {
  rows,
  sql,
  scoped,
  globalDb,
  verifyRuntimeRole,
  pool,
  type DB,
} from "../../packages/adapters/db.ts";
import {
  hash,
  seal,
  unseal,
  passwordMatches,
  readArtifact,
  sign,
} from "../../packages/adapters/storage.ts";
import { reviewMarks } from "../../packages/core/redaction.ts";
import { validateFileMarks, verifyFile } from "../../packages/core/files.ts";
import { registerFileRoutes } from "./files.ts";
import { assertExportable } from "../../packages/core/export-gate.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
import { registerRecognitionRoutes } from "./recognition.ts";
import { registerReviewTools } from "./review-tools.ts";
import { registerMappingRoutes } from "./mappings.ts";
import { saveReview } from "./reviews.ts";
import { projectScope, capabilities, requirePermission } from "./access.ts";
import { registerMemberRoutes } from "./members.ts";
import { registerLifecycleRoutes } from "./lifecycle.ts";
type User = { id: string; tenant_id: string; username: string };
declare module "fastify" {
  interface FastifyRequest {
    user: User;
  }
}
function fail(code: string, statusCode = 400): never {
  throw Object.assign(new Error(code), { statusCode });
}
async function audit(
  db: DB,
  user: User,
  project: string,
  event: string,
  object: string,
) {
  await rows(
    db,
    sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${user.tenant_id},${project},${user.id},${event},${object})`,
  );
}
export async function buildApp() {
  await verifyRuntimeRole();
  seal("", "startup-key-check");
  sign("startup-key-check");
  const downloadTtl = Number(process.env.DOWNLOAD_TTL_SECONDS ?? 300);
  if (!Number.isInteger(downloadTtl) || downloadTtl < 1 || downloadTtl > 86400) throw new Error("INVALID_DOWNLOAD_TTL");
  const publicBasePath = process.env.APP_BASE_PATH ?? "/";
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(publicBasePath)) throw new Error("INVALID_APP_BASE_PATH");
  const sessionCookie = publicBasePath === "/" ? "session" : "tuominwang_session";
  let nerReady = false;
  if (process.env.NER_ENABLED === "1") {
    await (await import("../../packages/core/ner.ts")).verifyNerBundle();
    nerReady = true;
  }
  const app = Fastify({
    logger: false,
    trustProxy: process.env.TRUST_PROXY === "1",
    bodyLimit: 700000,
    routerOptions: { maxParamLength: 1024 },
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute", hook: "preHandler",
    keyGenerator: req => req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`,
    errorResponseBuilder: () => Object.assign(new Error("RATE_LIMITED"), { statusCode: 429 }),
  });
  app.setErrorHandler((error, request, reply) => {
    const e = error as Error & { statusCode?: number };
    if ((e as any).cause?.message === "CAPACITY_EXCEEDED") return reply.code(409).send({ error: "CAPACITY_EXCEEDED" });
    const businessStatus:Record<string,number>={PROCESSING_BUSY:409,ENTITY_GEOMETRY_STALE:409,ENTITY_GEOMETRY_INVALID:400,ENTITY_CORRECTION_STALE:409,ENTITY_CORRECTION_UNRESOLVED:409,ENTITY_CORRECTION_INVALID:400};
    const status = e instanceof ZodError ? 400 : (e.statusCode ?? businessStatus[e.message] ?? 500);
    reply.code(status).send({
      error:
        status >= 500
          ? "INTERNAL_ERROR"
          : e instanceof ZodError
            ? "INVALID_INPUT"
            : e.message,
    });
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== (process.env.APP_ORIGIN ?? "http://127.0.0.1:5178")
    )
      fail("ORIGIN_DENIED", 403);
    const path = req.url.split("?")[0];
    if (
      path === "/api/health" ||
      path === "/api/login" ||
      path.startsWith("/api/download/")
    )
      return;
    const [user] = await rows(
      globalDb,
      sql`SELECT * FROM auth_session(${hash(req.cookies[sessionCookie] ?? "")})`,
    );
    if (!user && path === "/api/session") return reply.send({ username: null });
    if (!user) fail("LOGIN_REQUIRED", 401);
    req.user = user;
  });
  app.get("/api/health", async () => {
    await rows(globalDb, sql`SELECT 1`);
    return {
      status: "ok",
      milestone: "text-rules",
      layers: { rules: "ready", ner: nerReady ? "ready" : "not_configured", ai: "not_configured" },
    };
  });
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute", hook: "onRequest", keyGenerator: req => `login:${req.ip}` } } },
    async (req, reply) => {
      const input = loginSchema.parse(req.body);
      const [user] = await rows(
        globalDb,
        sql`SELECT * FROM login_user(${input.username})`,
      );
      if (!user || !passwordMatches(input.password, user.password_hash))
        fail("INVALID_CREDENTIALS", 401);
      const token = randomBytes(32).toString("hex");
      await rows(
        globalDb,
        sql`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(${hash(token)},${user.id},now()+interval '12 hours')`,
      );
      reply.setCookie(sessionCookie, token, {
        httpOnly: true,
        sameSite: "strict",
        secure: (process.env.APP_ORIGIN ?? "").startsWith("https:"),
        path: publicBasePath,
        maxAge: 43200,
      });
      return { username: user.username };
    },
  );
  app.get("/api/session", async (req) => ({ username: req.user.username }));
  app.post("/api/logout", async (req, reply) => {
    await rows(
      globalDb,
      sql`DELETE FROM sessions WHERE token_hash=${hash(req.cookies[sessionCookie] ?? "")}`,
    );
    reply.clearCookie(sessionCookie, { path: publicBasePath });
    return { ok: true };
  });
  registerFileRoutes(app);
  registerDocumentUnlockRoutes(app);
  registerWorkspaceRecoveryRoutes(app);
  registerMarkdownManualDraftRoutes(app);
  registerMarkdownReviewRoutes(app);
  registerImageBatchSearchRoutes(app);
  registerProcessingEventRoutes(app);
  registerProcessingResourceRoutes(app);
  registerNetworkPolicyRoutes(app);
  registerProcessingObservability(app);
  registerRuntimeRules(app);
  registerReferenceDictionary(app);
  registerVisualRoutes(app);
  registerImageUtilityRoutes(app);
  registerDocxLayoutRoutes(app);
  registerDocxPreviewRoutes(app);
  registerDocxSafeModeRoutes(app);
  registerDocxImageOcrRoutes(app);
  registerMappingLibraryRoutes(app);
  registerReleaseStateRoutes(app);
  registerFolderOutputRoutes(app);
  registerDocumentNormalizationRoutes(app);
  registerReviewProvenanceRoutes(app);
  registerUnifiedAliasRoutes(app);
  registerPageRotationRoutes(app);
  registerSourceReviewRoutes(app);
  registerEntityFilterRoutes(app);
  registerManualOccurrenceRoutes(app);
  registerEntityGeometryRoutes(app);
  registerEntityCorrectionRoutes(app);
  registerDocumentRouteRoutes(app);
  registerMappingExports(app);
  registerOcrRoutes(app);
  registerRecognitionRoutes(app, nerReady);
  registerReviewTools(app);
  registerReplacementPolicies(app);
  registerPresetRoutes(app);
  registerProjectEntities(app);
  registerWorkspacePortableRoutes(app);
  registerRestorationFileRoutes(app);
  registerRestorationBatchRoutes(app);
  registerFeedbackRoutes(app);
  registerReviewFeedbackRoutes(app);
  registerAutomaticRuntimeRuleRoutes(app);
  registerSupportRoutes(app);
  registerDocumentPolicyRoutes(app);
  registerOfficeVisualRoutes(app);
  registerMcpRoutes(app,applyDocumentConfiguration);
  registerMappingRoutes(app);
  registerMemberRoutes(app);
  app.get("/api/projects", (req) => {
    const { offset, limit } = paginationSchema.parse(req.query);
    return scoped(req.user.id, req.user.tenant_id, async db => {
      const projects = await rows(db, sql`SELECT id,name,created_at FROM projects ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`);
      return Promise.all(projects.map(async project => ({ ...project, permissions: await capabilities(db, project.id) })));
    });
  });
  app.get('/api/projects/:id',async req=>{
    const project=id.parse((req.params as any).id);
    return projectScope(req,{project},['view_original'],async db=>{
      const [p]=await rows(db,sql`SELECT id,name,created_at FROM projects WHERE id=${project}`);
      if(!p)fail('NOT_FOUND',404);
      return {...p,permissions:await capabilities(db,project)};
    });
  });
  app.post("/api/projects", async (req) => {
    const { name,applyDefaultPresets } = projectSchema.extend({applyDefaultPresets:z.boolean().default(false)}).parse(req.body);
    return scoped(req.user.id, req.user.tenant_id, async (db) => {
      const project = randomUUID();
      await rows(
        db,
        sql`INSERT INTO projects(id,tenant_id,owner_id,name) VALUES(${project},${req.user.tenant_id},${req.user.id},${name})`,
      );
      if(applyDefaultPresets){
        const presets=await defaultProjectPresets(db,req);
        await rows(db,sql`UPDATE projects SET preset_revision=1,preset_policy=${seal(JSON.stringify(presets),`${req.user.tenant_id}:${project}:presets`)} WHERE id=${project}`);
        await audit(db,req.user,project,'default_presets_applied',project);
      }
      await audit(db, req.user, project, "project_created", project);
      return { id: project, name };
    });
  });
  app.get("/api/projects/:id/documents", async (req) => {
    const project = id.parse((req.params as any).id);
    const { offset, limit } = paginationSchema.parse(req.query);
    return projectScope(req, { project }, [], async (db) => {
      const list = await rows(
        db,
        sql`SELECT d.id,d.revision,d.state,d.created_at,d.source_name,d.source_format,(SELECT status FROM jobs WHERE document_id=d.id ORDER BY created_at DESC,id DESC LIMIT 1) AS job_state FROM documents d WHERE project_id=${project} ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}`,
      );
      const canView = (await capabilities(db, project)).includes("view_original");
      return list.map(({source_name,...d}) => ({...d, name: canView && source_name ? unseal(source_name, `${req.user.tenant_id}:${project}:${d.id}:name`) : null }));
    });
  });
  app.post("/api/projects/:id/documents", async (req) => {
    const project = id.parse((req.params as any).id),
      input = textSchema.parse(req.body);
    if (!input.text.isWellFormed()) fail("INVALID_UNICODE");
    if (
      !input.text.trim() ||
      Buffer.byteLength(input.text) >
        Math.min(Number(process.env.TEXT_MAX_BYTES ?? TEXT_MAX_BYTES), TEXT_MAX_BYTES)
    )
      fail("TEXT_SIZE_LIMIT", 413);
    return projectScope(req, { project }, ["upload"], async (db) => {
      if (
        !(
          await rows(
            db,
            sql`SELECT id FROM projects WHERE id=${project} FOR UPDATE`,
          )
        ).length
      )
        fail("NOT_FOUND", 404);
      const digest = hash(input.text);
      const [previous] = await rows(
        db,
        sql`SELECT id,content_hash FROM documents WHERE project_id=${project} AND request_id=${input.requestId}`,
      );
      if (previous) {
        if (previous.content_hash !== digest) fail("IDEMPOTENCY_CONFLICT", 409);
        return { id: previous.id };
      }
      const doc = randomUUID(),
        job = randomUUID(),
        content = seal(input.text, `${req.user.tenant_id}:${project}:${doc}`);
      await rows(
        db,
        sql`INSERT INTO documents(id,tenant_id,project_id,request_id,content,content_hash,quota_bytes) VALUES(${doc},${req.user.tenant_id},${project},${input.requestId},${content},${digest},${Buffer.byteLength(input.text)})`,
      );
      await rows(
        db,
        sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind) VALUES(${job},${req.user.tenant_id},${project},${doc},${req.user.id},'detect')`,
      );
      await audit(db, req.user, project, "text_submitted", doc);
      return { id: doc };
    });
  });
  app.get("/api/documents/:id", async (req) => {
    const doc = id.parse((req.params as any).id);
    const page = textPageSchema.parse(req.query);
    return projectScope(req, { document: doc }, ["view_original"], async (db) => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (page.revision !== undefined && d.revision !== page.revision) fail("VERSION_CONFLICT", 409);
      const [job] = await rows(
        db,
        sql`SELECT id,kind,status,error_code,required_permissions,user_id FROM jobs WHERE document_id=${doc} ORDER BY created_at DESC,id DESC LIMIT 1`,
      );
      return {
        id: d.id,
        permissions: await capabilities(db, d.project_id),
        project_id: d.project_id,
        ...await runProcessing<object>({ kind: "view", doc: d, offset: page.offset }),
        revision: d.revision,
        marks: await(async()=>{const frame=await readReviewProvenance(db,d);return addReviewEntityHints(frame,withReviewEntityBirths(frame,d.marks));})(),
        state: d.state,
        name: d.source_name ? unseal(d.source_name, `${d.tenant_id}:${d.project_id}:${d.id}:name`) : undefined,
        format: d.source_format,
        processingFormat: documentProcessingFormat(d),
        normalization: isLegacyWordFormat(d.source_format) ? {ready:!!d.normalized_source_id,format:"docx",normalizedHash:d.normalized_source_hash??null} : null,
        parseVersion: d.parse_version,
        anchors: d.anchors,
        coverage: d.coverage,
        ...(()=>{try{return{entityCorrections:openEntityCorrections(d),entityCorrectionsStale:false};}catch(error){if((error as Error).message==='ENTITY_CORRECTION_STALE')return{entityCorrections:null,entityCorrectionsStale:true};throw error;}})(),
        pageReview: openPageReview(d),
        pageRotationState: d.source_format==='pdf'?readPageRotationState(d):undefined,
        pages: (d.page_data ?? []).map(({ index, width, height, rotation, confidence, part }: any) => ({ index, width, height, rotation, confidence, part })),
        job:job?{id:job.id,kind:job.kind,status:job.status,error_code:job.error_code,required_permissions:job.required_permissions,canObserveEvents:job.user_id===req.user.id}:undefined,
        canRunNer: nerReady,
        nerEnabled: d.ner_enabled,
        visualCandidates: d.visual_candidates,
        visualDiagnostics:d.recognition?.visual??null,
        layers: {
          rules: d.state === "queued" ? "pending" : "completed",
          ner: d.ner_enabled ? (d.state === "review" ? "completed" : "pending") : (nerReady ? "not_requested" : "not_configured"),
          ai: "not_configured",
        },
      };
    });
  });
  app.get("/api/documents/:id/pages/:page", async (req, reply) => {
    const doc = id.parse((req.params as any).id), page = z.coerce.number().int().min(0).max(299).parse((req.params as any).page);
    const { revision } = z.object({ revision: z.coerce.number().int().nonnegative() }).parse(req.query);
    const image = await projectScope(req, { document: doc }, ["view_original"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== revision) fail("VERSION_CONFLICT", 409);
      try { return await runProcessing<Uint8Array>({ kind: "page", doc: d, page }); }
      catch (error) { fail((error as Error).message, 409); }
    });
    return reply.type("image/png").send(Buffer.from(image));
  });
  app.post("/api/documents/:id/pages/:page/preview", { bodyLimit: REVIEW_BODY_BYTES }, async (req, reply) => {
    const doc = id.parse((req.params as any).id), page = z.coerce.number().int().min(0).max(299).parse((req.params as any).page), input = reviewSchema.parse(req.body);
    const image = await projectScope(req, { document: doc }, ["view_original"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT", 409);
      if (d.state !== "review") fail("DETECTION_INCOMPLETE", 409);
      try { const policy=await validateEntityGeometryPolicy(db,d,input.marks,input.pageReview??openPageReview(d));return await runProcessing<Uint8Array>({ kind: "page-preview", doc: { ...d, page_review: policy }, page, marks: input.marks }); }
      catch (e) { fail((e as Error).message, 400); }
    });
    return reply.type("image/png").send(Buffer.from(image));
  });
  app.put("/api/documents/:id/review", { bodyLimit: REVIEW_BODY_BYTES }, async (req) => {
    const doc = id.parse((req.params as any).id),
      input = reviewSchema.parse(req.body);
    return projectScope(req, { document: doc }, ["review"], async (db) => {
      const [d] = await rows(
        db,
        sql`SELECT * FROM documents WHERE id=${doc} FOR UPDATE`,
      );
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT", 409);
      const saved = await saveReview(db, req.user.id, d, input.marks, undefined, false, input.pageReview);
      return { revision: saved.revision };
    });
  });
  app.post("/api/documents/:id/export", async (req) => {
    const doc = id.parse((req.params as any).id);
    const { revision } = revisionSchema.parse(req.body);
    const unified=await preflightUnifiedAliasExport(req,doc,revision);
    if(unified&&Object.keys(unified.changedDocuments).length)fail("UNIFIED_ALIAS_REVIEW_REQUIRED",409);
    return projectScope(req, { document: doc }, ["export"], async (db,project) => {
      await assertUnifiedAliasExportEpoch(db,project,unified);
      const [d] = await rows(
        db,
        sql`SELECT * FROM documents WHERE id=${doc} FOR UPDATE`,
      );
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== revision) fail("VERSION_CONFLICT", 409);
      const [presetProject] = await rows(db, sql`SELECT id,tenant_id,preset_policy,preset_revision FROM projects WHERE id=${d.project_id}`);
      Object.assign(d,resolveDocumentPolicy(d,readProjectPresets(presetProject)));
      const [snapshot] = await rows(db, sql`SELECT * FROM review_snapshots WHERE document_id=${doc} AND revision=${revision}`);
      try {
        await runProcessing({ kind: "gate", doc: d, snapshot });
      } catch (e) {
        const code = (e as Error).message;
        fail(code, ["INVALID_MARKS", "OVERLAPPING_MARKS", "CROSS_CELL_MARK"].includes(code) ? 400 : 409);
      }
      const [existing] = await rows(
        db,
        sql`SELECT id FROM jobs WHERE document_id=${doc} AND kind='export' AND revision=${revision} AND status IN ('queued','running','succeeded') ORDER BY created_at DESC LIMIT 1`,
      );
      if (existing) return { id: existing.id };
      const job = randomUUID();
      await rows(
        db,
        sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind,revision,required_permissions) VALUES(${job},${req.user.tenant_id},${d.project_id},${doc},${req.user.id},'export',${revision},ARRAY['export']::text[])`,
      );
      await audit(db, req.user, d.project_id, "export_requested", doc);
      return { id: job };
    });
  });
  app.post("/api/jobs/:id/cancel", async (req) => {
    const job = id.parse((req.params as any).id);
    return projectScope(req, { job }, [], async (db, project) => {
      const [target] = await rows(db, sql`SELECT * FROM jobs WHERE id=${job}`);
      await requirePermission(db, project, target.required_permissions);
      const [j] = await rows(
        db,
        sql`UPDATE jobs SET status='cancelled' WHERE id=${job} AND status IN ('queued','running') RETURNING project_id`,
      );
      if (!j) fail("JOB_NOT_ACTIVE", 409);
      await rows(db, sql`UPDATE attempts SET finished_at=now(),outcome='cancelled' WHERE job_id=${job} AND finished_at IS NULL`);
      if(target.kind==='export'){
        const [d]=await rows(db,sql`SELECT d.*,p.preset_policy,p.preset_revision FROM documents d JOIN projects p ON p.id=d.project_id WHERE d.id=${target.document_id}`);
        if(d){Object.assign(d,resolveDocumentPolicy(d,readProjectPresets({id:d.project_id,tenant_id:d.tenant_id,preset_revision:d.preset_revision,preset_policy:d.preset_policy})));if(expectsMarkdownExport(d))await recordMarkdownExportEvent(db,{tenant:d.tenant_id,project:d.project_id,user:req.user.id,document:d.id,revision:target.revision,attemptKey:job},{event:'export-outcome',sourceKind:markdownSourceKind(d.source_format),status:'cancelled'});}
      }
      await audit(db, req.user, j.project_id, "job_cancelled", job);
      return { ok: true };
    });
  });
  app.get("/api/documents/:id/outputs", async req => {
    const doc = id.parse((req.params as any).id), {revision} = z.object({revision:z.coerce.number().int().nonnegative()}).parse(req.query);
    return projectScope(req,{document:doc},["export"],async db=>{
      const [d]=await rows(db,sql`SELECT revision,state FROM documents WHERE id=${doc}`);
      if(!d || d.revision!==revision)fail("VERSION_CONFLICT",409);
      if(d.state!=="review")fail("POLICY_CHANGED",409);
      return rows(db,sql`SELECT DISTINCT ON(a.output_role) a.output_role AS role,a.output_format AS format FROM artifacts a JOIN jobs j ON j.id=a.job_id WHERE a.document_id=${doc} AND a.revision=${revision} AND j.status='succeeded' ORDER BY a.output_role,j.created_at DESC`);
    });
  });
  app.post("/api/documents/:id/download-link", async (req) => {
    const doc = id.parse((req.params as any).id);
    const { revision,role } = revisionSchema.extend({role:z.enum(["primary","markdown","pdf-docx","word-docx"]).default("primary")}).parse(req.body);
    return projectScope(req, { document: doc }, ["export"], async (db) => {
      const [d] = await rows(
        db,
        sql`SELECT * FROM documents WHERE id=${doc} FOR UPDATE`,
      );
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== revision) fail("VERSION_CONFLICT", 409);
      const [presetProject] = await rows(db, sql`SELECT id,tenant_id,preset_policy,preset_revision FROM projects WHERE id=${d.project_id}`);
      Object.assign(d,resolveDocumentPolicy(d,readProjectPresets(presetProject)));
      const [snapshot] = await rows(db, sql`SELECT * FROM review_snapshots WHERE document_id=${doc} AND revision=${revision}`);
      try { await runProcessing({ kind: "gate", doc: d, snapshot }); } catch (e) { fail((e as Error).message, 409); }
      const [a] = await rows(
        db,
        sql`SELECT a.* FROM artifacts a JOIN jobs j ON j.id=a.job_id WHERE a.document_id=${doc} AND a.revision=${d.revision} AND a.output_role=${role} AND j.status='succeeded' ORDER BY j.created_at DESC LIMIT 1`,
      );
      if (!a) fail("EXPORT_NOT_READY", 409);
      try {
        await runProcessing({ kind: "verify", doc: d, snapshot, artifact: a });
      } catch (e) {
        if ((e as Error).message === "PROCESSING_BUSY") fail("PROCESSING_BUSY", 409);
        fail("ARTIFACT_VERIFICATION_FAILED", 409);
      }
      const expiry = Date.now() + downloadTtl * 1000;
      await rows(db, sql`UPDATE artifacts SET issued_until=greatest(issued_until,${new Date(expiry).toISOString()}::timestamptz) WHERE id=${a.id}`);
      const payload = Buffer.from(
        JSON.stringify({
          id: a.id,
          hash: a.hash,
          format: a.output_format ?? d.source_format,
          exp: expiry,
        }),
      ).toString("base64url");
      await audit(db, req.user, d.project_id, "download_verified", a.id);
      return { url: `${publicBasePath}api/download/${payload}.${sign(payload)}` };
    });
  });
  app.get("/api/download/:token", async (req, reply) => {
    const token = (req.params as any).token as string;
    if (token.length > 1000) fail("INVALID_LINK", 403);
    const [payload, signature, ...rest] = token.split(".");
    const expected = sign(payload);
    if (
      rest.length ||
      !signature ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      fail("INVALID_LINK", 403);
    let data: { id: string; hash: string; exp: number; format: string };
    try {
      data = z
        .object({ id, hash: z.string().length(64), exp: z.number(), format: sourceFormatSchema.default("txt") })
        .parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    } catch {
      fail("INVALID_LINK", 403);
    }
    if (data.exp <= Date.now()) fail("LINK_EXPIRED", 403);
    let output: string | Uint8Array;
    try {
      output = await runProcessing<string | Uint8Array>({ kind: "download", artifact: data });
    } catch {
      fail("ARTIFACT_VERIFICATION_FAILED", 409);
    }
    return reply
      .type(data.format === "pdf" ? "application/pdf" : data.format === "png" ? "image/png" : data.format === "doc" ? "application/msword" : data.format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : data.format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : data.format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="redacted.${data.format}"`)
      .send(typeof output === "string" ? output : Buffer.from(output));
  });
  registerLifecycleRoutes(app);
  return app;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const app = await buildApp();
  await app.listen({
    port: Number(process.env.PORT ?? 4318),
    host: process.env.HOST ?? "127.0.0.1",
  });
  console.log("API ready http://127.0.0.1:4318");
  for (const event of ["SIGINT", "SIGTERM"])
    process.on(event, () => {
      void app.close().then(() => pool.end());
    });
}
