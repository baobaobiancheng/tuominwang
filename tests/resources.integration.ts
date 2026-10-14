import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../apps/api/main.ts";
import { tick } from "../apps/worker/main.ts";
import { pool, globalDb, rows, sql, withHeavySlot } from "../packages/adapters/db.ts";
import { runProcessing } from "../packages/adapters/processing.ts";
import { hash, passwordHash } from "../packages/adapters/storage.ts";
import { FILE_MAX_BYTES } from "../packages/contracts/index.ts";

const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
after(async () => { await app.close(); await pool.end(); await admin.end(); });
test("API heavy processing and background jobs share a fail-fast slot without consuming the transaction pool", async () => {
  const lock = await admin.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(7843,2)");
    await assert.rejects(runProcessing({ kind: "dictionary-export", entries: [] }), /PROCESSING_BUSY/);
    assert.equal(await tick(), false);
  } finally { await lock.query("SELECT pg_advisory_unlock(7843,2)"); lock.release(); }
  await withHeavySlot(async () => {
    assert.equal(await tick(), false);
    await assert.rejects(runProcessing({ kind: "dictionary-export", entries: [] }), /PROCESSING_BUSY/);
  });
  const output = await runProcessing<Uint8Array>({ kind: "dictionary-export", entries: [] });
  assert.ok(output.length > 100);
});
test("50 MiB original: full detection, paged review, exact export and single heavy-job claim", { timeout: 180000 }, async () => {
  const user = randomUUID(), tenant = randomUUID(), username = "resources-" + randomUUID(), password = "resource-test-only-password";
  await admin.query("INSERT INTO users VALUES($1,$2,$3,$4)", [user, tenant, username, passwordHash(password)]);
  const origin = process.env.APP_ORIGIN!;
  const login = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { username, password } });
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  const req = (method: any, url: string, payload?: any, binary = false) => app.inject({ method, url, headers: { origin, cookie, ...(binary ? { "content-type": "application/octet-stream" } : {}) }, payload });
  const project = (await req("POST", "/api/projects", { name: "容量边界" })).json().id;
  const batchId = randomUUID(), requestId = randomUUID();
  const source = Buffer.alloc(FILE_MAX_BYTES, 120);
  source.write(" 13800138000", source.length - 12);
  assert.equal((await req("POST", `/api/projects/${project}/upload-batches`, { id: batchId, files: [{ requestId, path: "large.txt", size: source.length, sha256: hash(source) }] })).statusCode, 200);
  const uploaded = await req("POST", `/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`, source, true);
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  const id = uploaded.json().id;
  await tick();
  let response = await req("GET", `/api/documents/${id}`);
  assert.equal(response.statusCode, 200, response.body.slice(0, 500));
  let view = response.json();
  assert.equal(view.job.status, "succeeded", JSON.stringify(view.job));
  assert.equal(view.textLength, FILE_MAX_BYTES);
  assert.ok(view.text.length < 40000);
  assert.equal(view.marks.length, 1);
  assert.equal(view.marks[0].start, FILE_MAX_BYTES - 11);
  const last = (await req("GET", `/api/documents/${id}?offset=${FILE_MAX_BYTES - 100}&revision=0`)).json();
  assert.equal(last.text.slice(-11), "13800138000"); assert.equal(last.nextTextOffset, null);
  const marks = view.marks.map((m: any) => ({ ...m, decision: "redact" }));
  assert.equal((await req("PUT", `/api/documents/${id}/review`, { revision: 0, marks })).statusCode, 200);
  assert.equal((await req("GET", `/api/documents/${id}?offset=100&revision=0`)).statusCode, 409);
  assert.equal((await req("POST", `/api/documents/${id}/export`, { revision: 1 })).statusCode, 200);
  await tick();
  const link = await req("POST", `/api/documents/${id}/download-link`, { revision: 1 });
  assert.equal(link.statusCode, 200, link.body);
  const download = await app.inject({ url: link.json().url });
  assert.equal(download.statusCode, 200);
  assert.equal(download.body, source.toString("utf8").slice(0, -11) + "【手机号】");
  // Multiple claim callers cannot each start a heavy task.
  for (let i = 0; i < 2; i++) await req("POST", `/api/projects/${project}/documents`, { requestId: randomUUID(), text: "claim " + i });
  const claims = await Promise.all([rows(globalDb, sql`SELECT * FROM claim_job()`), rows(globalDb, sql`SELECT * FROM claim_job()`)]);
  assert.equal(claims.flat().length, 1);
  const owned = claims.flat()[0];
  assert.equal((await rows(globalDb, sql`SELECT * FROM claim_job()`)).length, 0);
  await req("POST", `/api/jobs/${owned.id}/cancel`);
  const attempts = await admin.query("SELECT outcome FROM attempts WHERE job_id=$1", [owned.id]);
  assert.equal(attempts.rows[0].outcome, "cancelled");
  await tick();
});
