import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { buildApp } from "../apps/api/main.ts";
import { tick } from "../apps/worker/main.ts";
import { pool } from "../packages/adapters/db.ts";
import { passwordHash } from "../packages/adapters/storage.ts";
import { pdfFixture } from "./pdf-fixtures.ts";

const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL }), app = await buildApp();
after(async () => { await app.close(); await pool.end(); await admin.end(); });
test("independent permissions, organization/project separation, revocation race and in-flight job cancellation", async () => {
  const tenant = randomUUID(), ownerId = randomUUID(), name = "owner-" + randomUUID(), password = "public-access-test-password", origin = process.env.APP_ORIGIN!;
  await admin.query("INSERT INTO users VALUES($1,$2,$3,$4)", [ownerId, tenant, name, passwordHash(password)]);
  async function session(username: string) {
    const result = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { username, password } }); assert.equal(result.statusCode, 200, result.body);
    const cookie = String(result.headers["set-cookie"]).split(";")[0];
    return (method: any, url: string, payload?: any) => app.inject({ method, url, headers: { origin, cookie, ...(Buffer.isBuffer(payload) ? { "content-type": "application/octet-stream" } : {}) }, payload });
  }
  const owner = await session(name), memberName = "member-" + randomUUID();
  const created = await owner("POST", "/api/organization/members", { username: memberName, password }); assert.equal(created.statusCode, 200, created.body);
  const memberId = created.json().id, member = await session(memberName);
  const project = (await owner("POST", "/api/projects", { name: "独立权限" })).json().id;
  const document = (await owner("POST", `/api/projects/${project}/documents`, { text: "合成甲公司 电话13800138000", requestId: randomUUID() })).json().id, url = `/api/documents/${document}`;
  await tick();
  let d = (await owner("GET", url)).json(); assert.equal(d.permissions.length, 10);
  const alias = await owner("POST", url + "/mappings", { revision: 0, start: 0, end: 5, kind: "机构", requestId: randomUUID() }); assert.equal(alias.statusCode, 200, alias.body);
  const marks = [...d.marks.map((m: any) => ({ ...m, decision: "redact" })), { start: 0, end: 5, kind: "机构", decision: "redact", replacement: alias.json() }];
  assert.equal((await owner("PUT", url + "/review", { revision: 0, marks })).statusCode, 200);
  assert.equal((await owner("POST", url + "/export", { revision: 1 })).statusCode, 200); await tick();
  assert.deepEqual((await member("GET", "/api/projects")).json(), []);
  assert.equal((await member("GET", url)).statusCode, 404);
  assert.equal((await member("GET", "/api/organization/members")).statusCode, 403);
  let grantRevision: number | null = null;
  async function grant(permissions: string[]) {
    const result = await owner("PUT", `/api/projects/${project}/members/${memberId}`, { revision: grantRevision, permissions }); assert.equal(result.statusCode, 200, result.body); grantRevision = result.json().revision;
  }
  await grant(["view_original"]);
  assert.equal((await member("GET", url)).statusCode, 200);
  for (const [method, path, body] of [
    ["PUT", url + "/review", { revision: 1, marks }], ["POST", url + "/export", { revision: 1 }],
    ["GET", `/api/projects/${project}/mappings`, undefined], ["POST", url + "/restore", { revision: 1, text: alias.json().token }],
    ["GET", `/api/projects/${project}/dictionary`, undefined], ["GET", `/api/projects/${project}/members`, undefined],
    ["POST", `/api/projects/${project}/documents`, { text: "test", requestId: randomUUID() }],
  ] as const) assert.equal((await member(method, path, body)).statusCode, 403, path);
  assert.equal((await owner("PUT", `/api/projects/${project}/members/${memberId}`, { revision: null, permissions: [] })).statusCode, 409);
  await grant(["review"]);
  assert.equal((await member("GET", url)).statusCode, 403);
  // Existing approved aliases may be retained by a reviewer without revealing the mapping table.
  assert.equal((await member("PUT", url + "/review", { revision: 1, marks })).statusCode, 200);
  await grant(["view_mapping"]);
  assert.equal((await member("GET", `/api/projects/${project}/mappings`)).statusCode, 200);
  assert.equal((await member("POST", url + "/restore", { revision: 2, text: alias.json().token })).statusCode, 403);
  await grant(["restore"]);
  assert.equal((await member("GET", `/api/projects/${project}/mappings`)).statusCode, 403);
  const restored = await member("POST", url + "/restore", { revision: 2, text: alias.json().token }); assert.equal(restored.statusCode, 200, restored.body); assert.equal(restored.json().text, "合成甲公司");
  assert.equal((await owner("POST", url + "/export", { revision: 2 })).statusCode, 200); await tick();
  await grant(["export"]);
  assert.equal((await member("GET", url)).statusCode, 403);
  const link = await member("POST", url + "/download-link", { revision: 2 }); assert.equal(link.statusCode, 200, link.body);
  await grant([]);
  assert.equal((await member("POST", url + "/download-link", { revision: 2 })).statusCode, 404);
  assert.equal((await app.inject({ url: link.json().url })).statusCode, 200);
  await grant(["view_original"]);
  const lock = await admin.connect(); let finished = false;
  await lock.query("BEGIN"); await lock.query("SELECT id FROM projects WHERE id=$1 FOR UPDATE", [project]);
  const waiting = member("GET", url).then(result => { finished = true; return result; });
  try {
    await delay(50); assert.equal(finished, false);
    await lock.query("UPDATE project_members SET permissions='{}' WHERE project_id=$1 AND user_id=$2", [project, memberId]);
    await lock.query("COMMIT");
    assert.ok([403, 404].includes((await waiting).statusCode));
  } finally { await lock.query("ROLLBACK"); lock.release(); }
  await grant(["review", "view_original"]);
  assert.equal((await member("POST", url + "/recognize", { revision: 2, ner: true })).statusCode, 403);
  await grant(["review", "manage_models", "view_original"]);
  const recognition = await member("POST", url + "/recognize", { revision: 2, ner: true }); assert.equal(recognition.statusCode, 200, recognition.body);
  await grant(["view_original"]);
  const job = (await member("GET", url)).json().job; assert.equal(job.status, "cancelled"); assert.equal(job.error_code, "PERMISSION_REVOKED");
  await tick();
  assert.equal((await admin.query("SELECT attempt FROM jobs WHERE id=$1", [job.id])).rows[0].attempt, 0);
  // An upload-only member can resume their own batch, but cannot read another uploader's filenames.
  const batchId = randomUUID(), requestId = randomUUID(), otherBatch = randomUUID(), bytes = pdfFixture({ pages: 30 });
  const manifest = { id: batchId, files: [{ requestId, path: "public-permission.pdf", size: bytes.length }] };
  await owner("POST", `/api/projects/${project}/upload-batches`, { id: otherBatch, files: [{ requestId: randomUUID(), path: "private-name.txt", size: 10 }] });
  await grant(["upload"]);
  assert.equal((await member("POST", `/api/projects/${project}/upload-batches`, manifest)).statusCode, 200);
  assert.equal((await member("GET", `/api/projects/${project}/upload-batches/${batchId}`)).statusCode, 200);
  assert.equal((await member("GET", `/api/projects/${project}/upload-batches/${otherBatch}`)).statusCode, 404);
  assert.equal((await member("GET", `/api/projects/${project}/upload-batches`)).json().length, 1);
  const uploaded = await member("POST", `/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`, bytes); assert.equal(uploaded.statusCode, 200, uploaded.body);
  const running = tick();
  for (let i = 0; i < 100; i++) { if ((await admin.query("SELECT status FROM jobs WHERE document_id=$1", [uploaded.json().id])).rows[0].status === "running") break; await delay(20); }
  assert.equal((await admin.query("SELECT status FROM jobs WHERE document_id=$1", [uploaded.json().id])).rows[0].status, "running");
  await delay(250); await grant([]); await running;
  assert.equal((await admin.query("SELECT status,error_code FROM jobs WHERE document_id=$1", [uploaded.json().id])).rows[0].status, "cancelled");
  assert.equal((await admin.query("SELECT * FROM review_snapshots WHERE document_id=$1", [uploaded.json().id])).rowCount, 0);
  await grant(["manage_members"]);
  assert.equal((await member("GET", `/api/projects/${project}/members`)).statusCode, 200);
  assert.equal((await member("PUT", `/api/projects/${project}/members/${memberId}`, { revision: grantRevision, permissions: ["view_original"] })).json().error, "SELF_PERMISSION_CHANGE");
  assert.equal((await member("PUT", `/api/projects/${project}/members/${randomUUID()}`, { revision: null, permissions: ["view_original"] })).statusCode, 404);
  await grant([]);
  assert.equal((await owner("PUT", `/api/organization/members/${memberId}`, { revision: 0, role: "admin", enabled: true })).statusCode, 200);
  assert.equal((await member("GET", "/api/organization/members")).statusCode, 200);
  assert.equal((await member("GET", url)).statusCode, 404); // organization admin is not a project-reader role
  assert.equal((await owner("PUT", `/api/organization/members/${ownerId}`, { revision: 0, role: "member", enabled: false })).json().error, "OWNER_IMMUTABLE");
  assert.equal((await owner("PUT", `/api/organization/members/${memberId}`, { revision: 1, role: "member", enabled: false })).statusCode, 200);
  assert.equal((await member("GET", "/api/projects")).statusCode, 401);
  assert.equal((await app.inject({ url: link.json().url })).statusCode, 200);
  const events = await owner("GET", `/api/projects/${project}/audit`); assert.equal(events.statusCode, 200); assert.ok(events.json().some((e: any) => e.event === "project_member_updated")); assert.ok(!events.body.includes("13800138000"));
});
