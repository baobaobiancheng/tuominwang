import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { buildApp } from "../apps/api/main.ts";
import { tick } from "../apps/worker/main.ts";
import { pool } from "../packages/adapters/db.ts";
import { passwordHash } from "../packages/adapters/storage.ts";
import { pdfFixture } from "./pdf-fixtures.ts";

const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
after(async () => { await app.close(); await pool.end(); await admin.end(); });
async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { const result = await read(); if (accept(result)) return result; await delay(50); }
  throw new Error("Timed out waiting for isolated worker state");
}
function startWorker() {
  const { MIGRATION_DATABASE_URL, POSTGRES_PASSWORD, APP_DB_PASSWORD, ADMIN_PASSWORD, ...env } = process.env;
  const child = spawn(process.execPath, ["--import", "tsx", "apps/worker/main.ts"], { env, stdio: "ignore" });
  const exited = new Promise<void>((resolve, reject) => { child.once("exit", () => resolve()); child.once("error", reject); });
  return { child, async stop(signal: NodeJS.Signals = "SIGTERM") {
    child.kill(signal);
    const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
    try { await exited; } finally { clearTimeout(timeout); }
  } };
}

test("real worker cancellation, graceful shutdown, SIGKILL lease takeover and bounded exhaustion", { timeout: 90000 }, async () => {
  const user = randomUUID(), tenant = randomUUID(), username = "jobs-" + randomUUID(), password = "synthetic-job-test-password";
  await admin.query("INSERT INTO users VALUES($1,$2,$3,$4)", [user, tenant, username, passwordHash(password)]);
  const origin = process.env.APP_ORIGIN!;
  const login = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { username, password } });
  assert.equal(login.statusCode, 200);
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  const req = (method: any, url: string, payload?: any, binary = false) => app.inject({ method, url, headers: { origin, cookie, ...(binary ? { "content-type": "application/octet-stream" } : {}) }, payload });
  const project = (await req("POST", "/api/projects", { name: "任务退出回归" })).json().id;
  async function upload() {
    const batchId = randomUUID(), requestId = randomUUID(), bytes = pdfFixture({ pages: 30 });
    assert.equal((await req("POST", `/api/projects/${project}/upload-batches`, { id: batchId, files: [{ requestId, path: "synthetic.pdf", size: bytes.length }] })).statusCode, 200);
    const response = await req("POST", `/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`, bytes, true);
    assert.equal(response.statusCode, 200);
    const id = response.json().id;
    const state = async () => (await admin.query("SELECT * FROM jobs WHERE document_id=$1", [id])).rows[0];
    return { id, state };
  }
  for (const action of ["cancel", "shutdown", "kill"] as const) {
    const { id, state } = await upload(), worker = startWorker();
    try {
      const running = await until(state, job => job?.status === "running");
      // Let the nested parsing/OCR thread start; the 30-page fixture cannot finish in this interval.
      await delay(250);
      if (action === "cancel") {
        assert.equal((await req("POST", `/api/jobs/${running.id}/cancel`)).statusCode, 200);
        await worker.stop();
        assert.equal((await state()).status, "cancelled");
      } else {
        await worker.stop(action === "kill" ? "SIGKILL" : "SIGTERM");
        const stopped = await state();
        assert.equal(stopped.status, action === "kill" ? "running" : "queued");
        // Advance only this test job's DB lease, avoiding a 30-second wall-clock sleep.
        await admin.query("UPDATE jobs SET lease_until=now()-interval '1 second',available_at=now() WHERE id=$1", [running.id]);
        const recovery = startWorker();
        try {
          const recovered = await until(state, job => job.status === "running" && job.generation === running.generation + 1);
          assert.equal(recovered.attempt, 2);
          const first = (await admin.query("SELECT * FROM attempts WHERE job_id=$1 AND generation=$2", [running.id, running.generation])).rows[0];
          assert.ok(first.finished_at);
          if (action === "kill") assert.equal(first.outcome, "lease_expired");
          assert.equal((await req("POST", `/api/jobs/${running.id}/cancel`)).statusCode, 200);
        } finally { await recovery.stop(); }
      }
      const doc = (await admin.query("SELECT state,content_hash FROM documents WHERE id=$1", [id])).rows[0];
      assert.notEqual(doc.state, "review");
      assert.equal((await admin.query("SELECT * FROM review_snapshots WHERE document_id=$1", [id])).rowCount, 0);
      assert.equal((await admin.query("SELECT * FROM attempts WHERE job_id=$1 AND finished_at IS NULL", [running.id])).rowCount, 0);
    } finally { await worker.stop(); }
  }
  const exhausted = await upload();
  await admin.query("UPDATE jobs SET attempt=3 WHERE document_id=$1", [exhausted.id]);
  await tick();
  assert.equal((await exhausted.state()).error_code, "RETRY_EXHAUSTED");
  // A subsequent ordinary task proves the process lock and shared slot were released.
  const next = (await req("POST", `/api/projects/${project}/documents`, { requestId: randomUUID(), text: "13800138000" })).json().id;
  await tick();
  assert.equal((await admin.query("SELECT state FROM documents WHERE id=$1", [next])).rows[0].state, "review");
});
