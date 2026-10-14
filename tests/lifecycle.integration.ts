import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { buildApp } from "../apps/api/main.ts";
import { tick } from "../apps/worker/main.ts";
import { pool } from "../packages/adapters/db.ts";
import { passwordHash, writeArtifact } from "../packages/adapters/storage.ts";

const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL }), app = await buildApp();
after(async () => { await app.close(); await pool.end(); await admin.end(); });
test("atomic organization capacity and explicit material deletion preserve issued links until expiry", async () => {
  const user = randomUUID(), tenant = randomUUID(), username = "lifecycle-" + randomUUID(), password = "synthetic-lifecycle-password", origin = process.env.APP_ORIGIN!;
  await admin.query("INSERT INTO users VALUES($1,$2,$3,$4)", [user, tenant, username, passwordHash(password)]);
  const login = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { username, password } }); assert.equal(login.statusCode, 200);
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  const req = (method: any, url: string, payload?: any) => app.inject({ method, url, headers: { origin, cookie, ...(Buffer.isBuffer(payload) ? { "content-type": "application/octet-stream" } : {}) }, payload });
  const p = (await req("POST", "/api/projects", { name: "删除与容量" })).json().id, p2 = (await req("POST", "/api/projects", { name: "第二项目" })).json().id;
  assert.equal((await req("GET", "/api/organization/capacity")).statusCode, 200);
  assert.equal((await req("PUT", "/api/organization/capacity", { revision: 0, byteLimit: 100, documentLimit: 1 })).statusCode, 200);
  const batch = randomUUID(), requestId = randomUUID(), bytes = Buffer.from("电话13800138000");
  await req("POST", `/api/projects/${p}/upload-batches`, { id: batch, files: [{ requestId, path: "敏感名.txt", size: bytes.length }] });
  const uploaded = await req("POST", `/api/projects/${p}/files?batchId=${batch}&requestId=${requestId}`, bytes); assert.equal(uploaded.statusCode, 200, uploaded.body);
  const doc = uploaded.json().id, url = `/api/documents/${doc}`;
  assert.equal((await req("POST", `/api/projects/${p2}/documents`, { text: "abc", requestId: randomUUID() })).json().error, "CAPACITY_EXCEEDED");
  assert.equal((await req("PUT", "/api/organization/capacity", { revision: 1, byteLimit: 0, documentLimit: 0 })).json().error, "CAPACITY_BELOW_USAGE");
  await tick();
  const original = (await admin.query("SELECT source_id FROM documents WHERE id=$1", [doc])).rows[0].source_id;
  const orphan = randomUUID(); await writeArtifact(orphan, "synthetic interrupted output", doc);
  const d = (await req("GET", url)).json();
  assert.equal((await req("PUT", url + "/review", { revision: 0, marks: d.marks.map((m: any) => ({ ...m, decision: "redact" })) })).statusCode, 200);
  await req("POST", url + "/export", { revision: 1 }); await tick();
  const link = await req("POST", url + "/download-link", { revision: 1 }); assert.equal(link.statusCode, 200, link.body);
  const artifact = (await admin.query("SELECT id FROM artifacts WHERE document_id=$1", [doc])).rows[0].id;
  assert.equal((await req("POST", url + "/delete", { revision: 0 })).json().error, "VERSION_CONFLICT");
  const deleted = await req("POST", url + "/delete", { revision: 1 }); assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal((await req("GET", url)).statusCode, 404);
  assert.equal((await req("POST", url + "/download-link", { revision: 1 })).statusCode, 404);
  assert.equal((await req("GET", `/api/projects/${p}/upload-batches/${batch}`)).statusCode, 404);
  assert.equal((await admin.query("SELECT * FROM review_snapshots WHERE document_id=$1", [doc])).rowCount, 0);
  assert.equal((await admin.query("SELECT * FROM jobs WHERE document_id=$1", [doc])).rowCount, 0);
  const capacity = (await req("GET", "/api/organization/capacity")).json(); assert.equal(capacity.used_documents, 0); assert.equal(Number(capacity.used_bytes), 0);
  await tick(); assert.equal((await app.inject({ url: link.json().url })).statusCode, 200);
  for (const object of [original, artifact, orphan]) await access(resolve(process.env.DATA_DIR!, object));
  // Advance only this isolated deletion deadline, retaining a real HMAC link for the before-expiry assertion above.
  await admin.query("UPDATE material_deletions SET purge_after=now()-interval '1 second' WHERE document_id=$1", [doc]);
  await tick();
  for (const object of [original, artifact, orphan]) await assert.rejects(access(resolve(process.env.DATA_DIR!, object)), { code: "ENOENT" });
  await assert.rejects(readdir(resolve(process.env.DATA_DIR!, ".owners", doc)), { code: "ENOENT" });
  assert.equal((await admin.query("SELECT * FROM material_deletions WHERE document_id=$1", [doc])).rowCount, 0);
  // Two projects sharing the same organization's last slot cannot overcommit it.
  const results = await Promise.all([p, p2].map(project => req("POST", `/api/projects/${project}/documents`, { text: "safe", requestId: randomUUID() })));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
  await tick(); // Finish this fixture's final queued document before another worker test claims it.
  const events = await req("GET", `/api/projects/${p}/audit`); assert.ok(events.json().some((e: any) => e.event === "material_deleted")); assert.ok(!events.body.includes("敏感名"));
});
