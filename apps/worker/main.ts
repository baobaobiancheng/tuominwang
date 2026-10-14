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
import { runProcessing } from "../../packages/adapters/processing.ts";
import { purgeRequestedMaterials } from "../../packages/adapters/deletions.ts";
export async function tick(signal?: AbortSignal) {
  if (signal?.aborted) return false;
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
  try {
    if (!(await scope(db => rows(db, sql`SELECT job_authorized(${job.id}) AS allowed`)))[0]?.allowed) throw new Error("PERMISSION_REVOKED");
    const [doc] = await scope((db) =>
      rows(db, sql`SELECT * FROM documents WHERE id=${job.document_id}`),
    );
    if (!doc || doc.revision !== job.revision) throw new Error("STALE_VERSION");
    if (job.kind === "detect") {
      const [project] = await scope(db => rows(db, sql`SELECT dictionary,dictionary_revision FROM projects WHERE id=${doc.project_id}`));
      if (!project) throw new Error("STALE_VERSION");
      Object.assign(doc, project);
    }
    let snapshot: any;
    if (job.kind === "export") {
      [snapshot] = await scope(db => rows(db, sql`SELECT * FROM review_snapshots WHERE document_id=${doc.id} AND revision=${job.revision}`));
    }
    const result = await runProcessing<any>({ kind: job.kind, doc, snapshot }, { signal: controller.signal, heavySlotHeld: true });
    // CPU worker is already terminated. Publish success only after releasing the processing slot.
    await releaseHeavy();
    const artifact = result.artifact as { id: string; hash: string; format?: string } | undefined;
    await scope(async (db) => {
      const [project] = await rows(db, sql`SELECT id FROM projects WHERE id=${doc.project_id} FOR SHARE`);
      if (!project || !(await rows(db, sql`SELECT job_authorized(${job.id}) AS allowed`))[0]?.allowed) throw new Error("PERMISSION_REVOKED");
      const [locked] = await rows(
        db,
        sql`SELECT * FROM documents WHERE id=${doc.id} FOR UPDATE`,
      );
      if (!locked || locked.revision !== job.revision) throw new Error("STALE_VERSION");
      if (job.kind === "export") assertExportable(locked, job.revision, result.textLength, result.textHash, snapshot);
      const updated = await rows(
        db,
        sql`UPDATE jobs SET status='succeeded',lease_until=NULL WHERE id=${job.id} AND generation=${job.generation} AND status='running' AND lease_until>now() RETURNING id`,
      );
      if (!updated.length) throw new Error("LEASE_LOST");
      if (artifact)
        await rows(
          db,
          sql`INSERT INTO artifacts(id,tenant_id,project_id,document_id,job_id,revision,hash,output_format) VALUES(${artifact.id},${doc.tenant_id},${doc.project_id},${doc.id},${job.id},${doc.revision},${artifact.hash},${artifact.format ?? doc.source_format})`,
        );
      else {
        await rows(
          db,
          sql`UPDATE documents SET content=${result.content},content_hash=${result.hash},marks=${JSON.stringify(result.marks)}::jsonb,anchors=${JSON.stringify(result.anchors)}::jsonb,coverage=${JSON.stringify(result.coverage)}::jsonb,page_data=${JSON.stringify(result.pages)}::jsonb,page_review=NULL,recognition=${JSON.stringify(result.recognition)}::jsonb,state='review' WHERE id=${doc.id}`,
        );
        await rows(db, sql`INSERT INTO review_snapshots(document_id,revision,tenant_id,project_id,content_hash,parse_version,marks,rule_version,recognition,page_data)
          VALUES(${doc.id},${doc.revision},${doc.tenant_id},${doc.project_id},${result.hash},${doc.parse_version},${JSON.stringify(result.marks)}::jsonb,${result.recognition.rules},${JSON.stringify(result.recognition)}::jsonb,${JSON.stringify(result.pages)}::jsonb)`);
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
      "LEASE_LOST",
      "PERMISSION_REVOKED",
      "INVALID_MARKS",
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
      if (job.kind === "detect" && FILE_ERRORS.includes(code)) await rows(db, sql`UPDATE documents SET coverage=${JSON.stringify([{ id: "document", status: "blocked", reason: code }])}::jsonb WHERE id=${job.document_id} AND revision=${job.revision}`);
      await rows(
        db,
        sql`UPDATE attempts SET finished_at=now(),outcome=${code} WHERE job_id=${job.id} AND generation=${job.generation}`,
      );
    });
  } finally {
    clearInterval(heartbeat);
    signal?.removeEventListener("abort", abort);
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
