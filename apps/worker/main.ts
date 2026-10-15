import {hash} from "../../packages/adapters/storage.ts";
import {verifiedDocumentSource} from "../../packages/adapters/document-source.ts";
import {loadPdfOcrCheckpointPages,pdfOcrRotationPlanHash,pdfOcrParserFingerprint,savePdfOcrCheckpoint,type PdfOcrBinding} from "../../packages/adapters/pdf-ocr-checkpoints.ts";
import {cleanupWorkspaceImports} from '../../packages/adapters/workspace-import.ts';
import{hydrateEntityCorrections}from '../../packages/adapters/entity-corrections.ts';
import{semanticEntityValue}from '../../packages/core/entity-corrections.ts';
import{persistDocumentNormalization}from'../../packages/adapters/document-normalization.ts';
import {sealPageReview,openPageReview} from "../../packages/adapters/page-review-storage.ts";
import {appendProcessingEvent} from "../../packages/adapters/processing-events.ts";
import {recordMarkdownExportEvent} from "../../packages/adapters/markdown-export-events.ts";
import {expectsMarkdownExport,markdownSourceKind} from "../../packages/adapters/markdown-outcome.ts";
import {getRuntimeWhitelists} from "../../packages/adapters/runtime-rule-update.ts";
import {closeAndDrainAutomaticRuntimeRules,discardAutomaticRuntimeRules} from '../../packages/adapters/automatic-runtime-rules.ts';
import { resolveDocumentPolicy } from "../../packages/adapters/document-policy.ts";
import { applyReplacementPolicies } from "../../packages/core/replacement-policies.ts";
import { profileReplacementPolicies, finalizeProfileReplacements } from "../../packages/core/profile-recognition.ts";
import { resolvePolicyMappings } from "../api/mappings.ts";
import { requirePermission } from "../api/access.ts";
import { unseal,seal } from "../../packages/adapters/storage.ts";
import { readProjectPresets } from "../../packages/adapters/project-presets.ts";
import { pathToFileURL } from "node:url";
import {
  rows,
  sql,
  scoped,
  globalDb,
  verifyRuntimeRole,
  pool,
} from "../../packages/adapters/db.ts";
import { FILE_ERRORS } from "../../packages/core/files.ts";
import { assertExportable } from "../../packages/core/export-gate.ts";
import {assertTrustedSignatureGroups} from "../../packages/adapters/signature-source-gate.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
import { purgeRequestedMaterials } from "../../packages/adapters/deletions.ts";
export async function tick(signal?: AbortSignal) {
  if (signal?.aborted) return false;
  await cleanupWorkspaceImports();
  // Idle polls must not steal the heavy slot from an immediate download after task completion.
  if (!(await rows(globalDb, sql`SELECT worker_pending() AS pending`))[0]?.pending) return false;
  // Hold a session lock until the CPU thread is terminated, including cancellation.
  const slot = await pool.connect();
  try {
    const claimed = await slot.query("SELECT pg_try_advisory_lock(7843,2) AS owned");
    if (!claimed.rows[0].owned) return false;
    let owned = true;
    const release = async () => { if (owned) { await slot.query("SELECT pg_advisory_unlock(7843,2)"); owned = false; } };
    try { await purgeRequestedMaterials(); return await processNext(signal, release); }
    finally { await release(); }
  } finally { slot.release(); }
}
async function processNext(signal?: AbortSignal, releaseHeavy = async () => {}) {
  const [job] = await rows(globalDb, sql`SELECT * FROM claim_job()`);
  if (!job) return false;
  const scope = <T>(fn: Parameters<typeof scoped<T>>[2]) =>
    scoped(job.user_id, job.tenant_id, fn);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  let checking = false;
  const heartbeat = setInterval(() => {
    if (checking) return;
    checking = true;
    void scope((db) =>
      rows(
        db,
        sql`UPDATE jobs SET lease_until=now()+interval '30 seconds' WHERE id=${job.id} AND generation=${job.generation} AND status='running' AND lease_until>now() AND job_authorized(id) RETURNING id`,
      ),
    ).then(result => { if (!result.length) controller.abort(); }).catch(() => controller.abort()).finally(() => { checking = false; });
  }, 1000);
  let doc:any;
  let cleanupAutomaticRules:(()=>Promise<void>)|undefined;
  try {
    if (!(await scope(db => rows(db, sql`SELECT job_authorized(${job.id}) AS allowed`)))[0]?.allowed) throw new Error("PERMISSION_REVOKED");
    const [loadedDoc] = await scope((db) =>
      rows(db, sql`SELECT * FROM documents WHERE id=${job.document_id}`),
    );
    doc=loadedDoc;
    if (!doc || doc.revision !== job.revision) throw new Error("STALE_VERSION");
    const runtimeBinding={job:job.id,generation:job.generation,tenant:job.tenant_id,project:job.project_id,user:job.user_id,document:doc.id,revision:job.revision,sourceHash:doc.source_hash,contentHash:doc.content_hash};
    if(job.kind==='detect')cleanupAutomaticRules=()=>scope(db=>discardAutomaticRuntimeRules(db,runtimeBinding));
    {
      const [project] = await scope(db => rows(db, sql`SELECT id,tenant_id,dictionary,dictionary_revision,preset_policy,preset_revision FROM projects WHERE id=${doc.project_id}`));
      if (!project) throw new Error("STALE_VERSION");
      doc.runtimeWhitelists=await scope(db=>getRuntimeWhitelists(db,job.tenant_id,doc.project_id,job.user_id,doc.id));
      Object.assign(doc, {dictionary: project.dictionary, dictionary_revision: project.dictionary_revision, ...resolveDocumentPolicy(doc, readProjectPresets(project))});
    }
    let snapshot: any;
    if (job.kind === "export") {
      [snapshot] = await scope(db => rows(db, sql`SELECT * FROM review_snapshots WHERE document_id=${doc.id} AND revision=${job.revision}`));
    }
    let pdfOcrBinding:PdfOcrBinding|undefined;
    let pdfOcrCheckpointPages;
    if(job.kind==='detect'&&doc.source_format==='pdf'&&doc.source_id){
      const processingHash=hash(await verifiedDocumentSource(doc)),rotationPlanHash=pdfOcrRotationPlanHash(doc),parserFingerprint=await pdfOcrParserFingerprint();
      pdfOcrBinding={jobId:job.id,generation:job.generation,tenantId:doc.tenant_id,projectId:doc.project_id,userId:job.user_id,documentId:doc.id,revision:job.revision,sourceHash:doc.source_hash,contentHash:doc.content_hash,processingHash,rotationPlanHash,parserFingerprint,parseVersion:doc.parse_version};
      pdfOcrCheckpointPages=await scope(db=>loadPdfOcrCheckpointPages(db,doc,processingHash,rotationPlanHash,pdfOcrBinding));
    }
    const result = await runProcessing<any>({ kind: job.kind, doc, snapshot, pdfOcrCheckpointPages }, { signal: controller.signal, heavySlotHeld: true, onCheckpoint:pdfOcrBinding?(frame)=>scope(db=>savePdfOcrCheckpoint(db,pdfOcrBinding!,frame)):undefined, onEvent: envelope=>scope(db=>appendProcessingEvent(db,{job:job.id,generation:job.generation,tenant:doc.tenant_id,project:doc.project_id,user:job.user_id,document:doc.id,revision:job.revision,sourceHash:doc.source_hash,contentHash:doc.content_hash},envelope)).then(()=>{}),readRuntimeRules:job.kind==='detect'?()=>scope(db=>closeAndDrainAutomaticRuntimeRules(db,runtimeBinding)):undefined });
    // CPU worker is already terminated. Publish success only after releasing the processing slot.
    await releaseHeavy();
    const artifact = result.artifact as { id: string; hash: string; format?: string } | undefined;
    await scope(async (db) => {
      const [project] = await rows(db, sql`SELECT id,tenant_id,preset_policy,preset_revision FROM projects WHERE id=${doc.project_id} FOR UPDATE`);
      if (!project || !(await rows(db, sql`SELECT job_authorized(${job.id}) AS allowed`))[0]?.allowed) throw new Error("PERMISSION_REVOKED");
      const [locked] = await rows(
        db,
        sql`SELECT * FROM documents WHERE id=${doc.id} FOR UPDATE`,
      );
      if (!locked || locked.revision !== job.revision) throw new Error("STALE_VERSION");
      if (job.kind === "export") { Object.assign(locked,resolveDocumentPolicy(locked,readProjectPresets(project))); await assertTrustedSignatureGroups(locked); assertExportable({...locked,page_review:openPageReview(locked)},job.revision,result.textLength,result.textHash,snapshot?{...snapshot,page_review:openPageReview({...locked,revision:snapshot.revision,content_hash:snapshot.content_hash},snapshot.page_review)}:undefined); }
      const updated = await rows(
        db,
        sql`UPDATE jobs SET status='succeeded',lease_until=NULL WHERE id=${job.id} AND generation=${job.generation} AND status='running' AND lease_until>now() RETURNING id`,
      );
      if (!updated.length) throw new Error("LEASE_LOST");
      if (artifact) {
        for (const produced of [artifact,...(result.additionalArtifacts ?? [])]) await rows(db,
          sql`INSERT INTO artifacts(id,tenant_id,project_id,document_id,job_id,revision,hash,output_format,output_role,output_name,legacy_verification) VALUES(${produced.id},${doc.tenant_id},${doc.project_id},${doc.id},${job.id},${doc.revision},${produced.hash},${produced.format ?? doc.source_format},${produced.role ?? "primary"},${produced.name ?? null},${produced.legacyVerification?seal(JSON.stringify(produced.legacyVerification),`${doc.tenant_id}:${doc.project_id}:${doc.id}:${produced.id}:legacy-artifact`):null})`);
        if([artifact,...(result.additionalArtifacts??[])].some(a=>(a.format??doc.source_format)==='md'))await recordMarkdownExportEvent(db,{tenant:doc.tenant_id,project:doc.project_id,user:job.user_id,document:doc.id,revision:job.revision,attemptKey:job.id},{event:'export-outcome',sourceKind:markdownSourceKind(doc.source_format),status:'success'});
      }
      else {
        if(result.normalizedSource)await persistDocumentNormalization(db,doc,result.normalizedSource);
        if (doc.presetPolicy?.profile) {
          const text = unseal(result.content, `${doc.tenant_id}:${doc.project_id}:${doc.id}`), policies = profileReplacementPolicies(doc.presetPolicy.profile.settings, doc.source_format, doc.batchMode, doc.documentPolicy?.configuration.exportMode);
          const semanticDoc=hydrateEntityCorrections({...doc,marks:result.marks,content_hash:result.hash,entity_corrections:result.entityCorrectionsStale?null:result.entityCorrectionsStored??doc.entity_corrections});let plan = applyReplacementPolicies(text, result.marks, policies,[],{semanticValue:(m,index)=>semanticEntityValue(semanticDoc,m,text,index)});
          if (plan.aliasRequests.length) {
            await requirePermission(db, doc.project_id, ["view_mapping"]);
            const mappings = await resolvePolicyMappings(db, semanticDoc, job.user_id, plan.aliasRequests);
            plan = applyReplacementPolicies(text, result.marks, policies, mappings,{semanticValue:(m,index)=>semanticEntityValue(semanticDoc,m,text,index)});
            if (plan.aliasRequests.length) throw new Error("MAPPING_MISMATCH");
          }
          result.marks = finalizeProfileReplacements(plan.marks,result.anchors,doc.presetPolicy.profile.settings,doc.source_format,doc.batchMode,doc.documentPolicy?.configuration.exportMode);
        }
        const storedPageReview=sealPageReview({...doc,content_hash:result.hash},result.pageReview,doc.revision);
        await rows(
          db,
          sql`UPDATE documents SET content=${result.content},content_hash=${result.hash},entity_corrections=${result.entityCorrectionsStored??null},parse_version=${result.parseVersion??doc.parse_version},marks=${JSON.stringify(result.marks)}::jsonb,anchors=${JSON.stringify(result.anchors)}::jsonb,coverage=${JSON.stringify(result.coverage)}::jsonb,page_data=${JSON.stringify(result.pages)}::jsonb,page_review=${JSON.stringify(storedPageReview)}::jsonb,visual_candidates=${JSON.stringify(result.visualCandidates ?? [])}::jsonb,recognition=${JSON.stringify(result.recognition)}::jsonb,state='review' WHERE id=${doc.id}`,
        );
        await rows(db, sql`INSERT INTO review_snapshots(document_id,revision,tenant_id,project_id,content_hash,parse_version,marks,rule_version,recognition,page_data,page_review)
          VALUES(${doc.id},${doc.revision},${doc.tenant_id},${doc.project_id},${result.hash},${result.parseVersion??doc.parse_version},${JSON.stringify(result.marks)}::jsonb,${result.recognition.rules},${JSON.stringify(result.recognition)}::jsonb,${JSON.stringify(result.pages)}::jsonb,${JSON.stringify(storedPageReview)}::jsonb)`);
      }
      await rows(
        db,
        sql`UPDATE attempts SET finished_at=now(),outcome='succeeded' WHERE job_id=${job.id} AND generation=${job.generation}`,
      );
    });
  } catch (e) {
    const known = [
      ...FILE_ERRORS,
      "STALE_VERSION",
      "LEASE_LOST", "PROCESSING_EVENT_WRITE_FAILED", "PDF_OCR_CHECKPOINT_WRITE_FAILED", "PDF_OCR_CHECKPOINT_STALE",
      "PERMISSION_REVOKED",
      "INVALID_MARKS", "SIGNATURE_GROUP_INVALID", "SIGNATURE_GROUP_RECOGNITION_REQUIRED", "SIGNATURE_GROUP_RULE_CONFLICT",
      "OVERLAPPING_MARKS",
      "RESIDUE_FOUND",
      "ARTIFACT_MISMATCH",
      "VERSION_CONFLICT", "DETECTION_INCOMPLETE", "COVERAGE_INCOMPLETE", "SNAPSHOT_MISMATCH", "EXPORT_POLICY_FAILED",
    ];
    const message = e instanceof Error ? e.message : "";
    const code = known.includes(message) ? message : "PROCESSING_FAILED";
    await scope(async (db) => {
      const updated = await rows(
        db,
        sql`UPDATE jobs SET status=${known.includes(message) || job.attempt >= 3 ? "failed" : "queued"},error_code=${code},available_at=now()+${2 ** job.attempt} * interval '1 second',lease_until=NULL WHERE id=${job.id} AND generation=${job.generation} AND status='running' RETURNING id`,
      );
      if (!updated.length) return;
      if(job.kind==='export'&&doc&&expectsMarkdownExport(doc)&&(known.includes(message)||job.attempt>=3))await recordMarkdownExportEvent(db,{tenant:doc.tenant_id,project:doc.project_id,user:job.user_id,document:doc.id,revision:job.revision,attemptKey:job.id},{event:'export-outcome',sourceKind:markdownSourceKind(doc.source_format),status:'failed',issueCode:code});
      if (job.kind === "detect" && FILE_ERRORS.includes(code)) await rows(db, sql`UPDATE documents SET coverage=${JSON.stringify([{ id: "document", status: "blocked", reason: code }])}::jsonb WHERE id=${job.document_id} AND revision=${job.revision}`);
      await rows(
        db,
        sql`UPDATE attempts SET finished_at=now(),outcome=${code} WHERE job_id=${job.id} AND generation=${job.generation}`,
      );
    });
  } finally {
    clearInterval(heartbeat);
    signal?.removeEventListener("abort", abort);
    await cleanupAutomaticRules?.();
  }
  return true;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let stop = false;
  const shutdown = new AbortController();
  process.on("SIGTERM", () => {
    stop = true; shutdown.abort();
  });
  process.on("SIGINT", () => {
    stop = true; shutdown.abort();
  });
  await verifyRuntimeRole();
  console.log("worker ready");
  while (!stop) {
    try {
      if (!(await tick(shutdown.signal))) await new Promise((r) => setTimeout(r, 500));
    } catch {
      console.error("WORKER_DB_UNAVAILABLE");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await pool.end();
}
