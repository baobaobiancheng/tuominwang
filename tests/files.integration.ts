import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { buildApp } from "../apps/api/main.ts";
import { tick } from "../apps/worker/main.ts";
import { pool, scoped, rows, sql } from "../packages/adapters/db.ts";
import { hash, passwordHash, readOriginal, seal } from "../packages/adapters/storage.ts";
import { officeFixture } from "./office-fixtures.ts";
import { readZip } from "../packages/core/office-zip.ts";
import { pdfFixture } from "./pdf-fixtures.ts";
import { openPdf } from "../packages/core/pdf-reader.ts";

const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
after(async () => { await app.close(); await pool.end(); await admin.end(); });
test("file batch, immutable originals/snapshots, CSV export, blocked objects, retry and pagination", async () => {
  const user = randomUUID(), tenant = randomUUID(), username = "files-" + randomUUID(), password = "file-test-password-only";
  await admin.query("INSERT INTO users VALUES($1,$2,$3,$4)", [user, tenant, username, passwordHash(password)]);
  const origin = process.env.APP_ORIGIN!;
  const login = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { username, password } });
  assert.equal(login.statusCode, 200);
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  const request = (method: any, url: string, payload?: any, binary = false) => app.inject({ method, url, headers: { origin, cookie, ...(binary ? { "content-type": "application/octet-stream" } : {}) }, payload });
  const project = (await request("POST", "/api/projects", { name: "文件回归" })).json().id;
  async function upload(path: string, bytes: Buffer) {
    const batchId = randomUUID(), requestId = randomUUID();
    const manifest = { id: batchId, files: [{ requestId, path, size: bytes.length }] };
    assert.equal((await request("POST", `/api/projects/${project}/upload-batches`, manifest)).statusCode, 200);
    const url = `/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`;
    const response = await request("POST", url, bytes, true);
    assert.equal(response.statusCode, 200, response.body);
    return { id: response.json().id, url, manifest };
  }
  const source = Buffer.from('姓名,电话,公式\r\n张三,13800138000,=1+1\r\n');
  const csv = await upload("客户/通讯录.csv", source);
  const duplicate = await request("POST", csv.url, source, true);
  assert.equal(duplicate.json().id, csv.id);
  const changed = Buffer.from(source); changed[0] ^= 1;
  assert.equal((await request("POST", csv.url, changed, true)).statusCode, 409);
  await tick();
  const view = (await request("GET", `/api/documents/${csv.id}`)).json();
  assert.equal(view.name, "客户/通讯录.csv");
  assert.equal(view.format, "csv");
  assert.equal(view.anchors.length, 6);
  assert.equal(view.coverage.length, 2);
  assert.equal(view.marks.length, 2); // Phone rule plus the explicit 姓名 column.
  const marks = view.marks.map((m: any) => ({ ...m, decision: "redact" }));
  assert.equal((await request("PUT", `/api/documents/${csv.id}/review`, { revision: 0, marks: [{ start: 0, end: 8, kind: "自定义", decision: "redact" }] })).json().error, "CROSS_CELL_MARK");
  assert.equal((await request("PUT", `/api/documents/${csv.id}/review`, { revision: 0, marks })).statusCode, 200);
  const snapshots = (await request("GET", `/api/documents/${csv.id}/revisions`)).json();
  assert.deepEqual(snapshots.map((s: any) => s.revision), [1, 0]);
  await assert.rejects(scoped(user, tenant, db => rows(db, sql`UPDATE review_snapshots SET marks='[]'::jsonb WHERE document_id=${csv.id}`)), (error: any) => error.cause?.code === "42501");
  assert.equal((await request("POST", `/api/documents/${csv.id}/export`, { revision: 1 })).statusCode, 200);
  await tick();
  const link = await request("POST", `/api/documents/${csv.id}/download-link`, { revision: 1 });
  assert.equal(link.statusCode, 200, link.body);
  const downloaded = await app.inject({ url: link.json().url });
  assert.equal(downloaded.statusCode, 200);
  assert.equal(downloaded.headers["content-disposition"], 'attachment; filename="redacted.csv"');
  assert.ok(!downloaded.body.includes("13800138000"));
  assert.ok(downloaded.body.includes("'=1+1"));
  const stored = (await admin.query("SELECT source_id,source_name,source_hash FROM documents WHERE id=$1", [csv.id])).rows[0];
  assert.ok(!stored.source_name.includes("通讯录"));
  assert.deepEqual(await readOriginal(stored.source_id), source);
  const copy = await upload("客户/通讯录.csv", source);
  assert.notEqual(copy.id, csv.id);
  await tick();
  const first = (await request("GET", `/api/projects/${project}/documents?limit=1&offset=0`)).json();
  const second = (await request("GET", `/api/projects/${project}/documents?limit=1&offset=1`)).json();
  assert.equal(first.length, 1); assert.equal(second.length, 1); assert.notEqual(first[0].id, second[0].id);
  assert.equal((await request("GET", "/api/projects?offset=-1")).statusCode, 400);
  const traversal = { id: randomUUID(), files: [{ path: "../secret.txt", requestId: randomUUID(), size: 1 }] };
  assert.equal((await request("POST", `/api/projects/${project}/upload-batches`, traversal)).json().error, "INVALID_PATH");
  assert.equal((await request("POST", `/api/projects/${project}/upload-batches`, { id: randomUUID(), files: Array.from({ length: 21 }, (_, i) => ({ path: `${i}.txt`, requestId: randomUUID(), size: 1 })) })).statusCode, 400);
  const other = (await request("POST", "/api/projects", { name: "另一个项目" })).json().id;
  assert.equal((await request("POST", csv.url.replace(project, other), source, true)).statusCode, 404);
  const retry = await upload("重试.txt", Buffer.from("13900139000"));
  let state = (await request("GET", `/api/documents/${retry.id}`)).json();
  assert.equal((await request("POST", `/api/jobs/${state.job.id}/cancel`)).statusCode, 200);
  assert.equal((await request("POST", `/api/jobs/${state.job.id}/retry`, { revision: 0 })).statusCode, 200);
  assert.equal((await request("POST", `/api/jobs/${state.job.id}/retry`, { revision: 0 })).statusCode, 409);
  await tick();
  state = (await request("GET", `/api/documents/${retry.id}`)).json();
  assert.equal(state.state, "review");
  assert.equal(state.marks.length, 1);
  for (const [name, bytes, code] of [
    ["bad.csv", Buffer.from('a,b\n"bad'), "INVALID_CSV"],
    ["bad.txt", Buffer.from([0xff, 0xfe]), "INVALID_ENCODING"],
    ["bad.pdf", Buffer.from("%PDF-1.7"), "INVALID_PDF"],
    ["dense.txt", Buffer.from("a@b.co ".repeat(32769)), "MARK_LIMIT"],
  ] as const) {
    const file = await upload(name, bytes);
    await tick();
    const blocked = (await request("GET", `/api/documents/${file.id}`)).json();
    assert.equal(blocked.job.status, "failed");
    assert.equal(blocked.job.error_code, code);
    assert.equal(blocked.coverage[0].status, "blocked");
    assert.equal((await request("POST", `/api/documents/${file.id}/export`, { revision: 0 })).statusCode, 409);
  }
  const embeddedMd=await upload("embedded.md",Buffer.from("![x](https://example.com/a.png)"));
  await tick();
  const embeddedView=(await request("GET",`/api/documents/${embeddedMd.id}`)).json();
  assert.equal(embeddedView.job.status,"succeeded");
  assert.equal(embeddedView.parseVersion,2);
  const needsConfirmation=await request("POST",`/api/documents/${embeddedMd.id}/export`,{revision:embeddedView.revision});
  assert.equal(needsConfirmation.statusCode,409);
  assert.equal(needsConfirmation.json().error,"MARKDOWN_BLOCKERS_UNREVIEWED");
  for (const format of ["docx", "xlsx"] as const) {
    const original = await officeFixture(format), file = await upload(`Office.${format}`, original);
    await tick();
    const parsed = (await request("GET", `/api/documents/${file.id}`)).json();
    assert.equal(parsed.state, "review");
    assert.equal(parsed.job.status, "succeeded");
    assert.ok(parsed.coverage.every((c: any) => c.status === "complete"));
    const marks = parsed.marks.map((m: any) => ({ ...m, decision: "redact" }));
    assert.equal((await request("PUT", `/api/documents/${file.id}/review`, { revision: 0, marks })).statusCode, 200);
    assert.equal((await request("POST", `/api/documents/${file.id}/export`, { revision: 1 })).statusCode, 200);
    await tick();
    assert.equal((await request("GET", `/api/documents/${file.id}`)).json().job.status, "succeeded", JSON.stringify((await request("GET", `/api/documents/${file.id}`)).json().job));
    const link = await request("POST", `/api/documents/${file.id}/download-link`, { revision: 1 });
    assert.equal(link.statusCode, 200, link.body);
    const result = await app.inject({ url: link.json().url });
    assert.equal(result.statusCode, 200);
    assert.ok(String(result.headers["content-type"]).includes(format === "docx" ? "wordprocessingml" : "spreadsheetml"));
    const parts = await readZip(result.rawPayload);
    for (const mark of marks) for (const bytes of parts.values()) assert.ok(!bytes.toString().includes(parsed.text.slice(mark.start, mark.end)));
    const sourceId = (await admin.query("SELECT source_id FROM documents WHERE id=$1", [file.id])).rows[0].source_id;
    assert.deepEqual(await readOriginal(sourceId), original);
  }
  const fixture = pdfFixture({ pages: 2 }), pdf = await openPdf(fixture);
  let png: Buffer; try { png = (await pdf.page(0)).png; } finally { pdf.close(); }
  for (const [format, bytes, count] of [["pdf", fixture, 2], ["png", png, 1]] as const) {
    const file = await upload(`页面.${format}`, bytes); await tick();
    const parsed = (await request("GET", `/api/documents/${file.id}`)).json();
    assert.equal(parsed.job.status, "succeeded", JSON.stringify(parsed.job));
    assert.equal(parsed.pages.length, count);
    assert.equal(parsed.marks.filter((m: any) => m.kind === "手机号").length, count);
    const image = await request("GET", `/api/documents/${file.id}/pages/0?revision=0`);
    assert.equal(image.statusCode, 200, image.body.slice(0, 100));
    assert.equal(image.headers["content-type"], "image/png");
    assert.equal((await request("GET", `/api/documents/${file.id}/pages/0?revision=1`)).statusCode, 409);
    assert.equal((await app.inject({ url: `/api/documents/${file.id}/pages/0?revision=0` })).statusCode, 401);
    assert.equal((await request("POST", `/api/documents/${file.id}/export`, { revision: 0 })).statusCode, 409);
  }
});

test("durable upload manifests: content binding, pagination, response loss and access isolation", async () => {
  const tenant = randomUUID();
  async function account(tenantId: string) {
    const user = randomUUID(), username = "resume-" + user, password = "resume-test-password-only";
    await admin.query("INSERT INTO users VALUES($1,$2,$3,$4)", [user, tenantId, username, passwordHash(password)]);
    const origin = process.env.APP_ORIGIN!;
    const login = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { username, password } });
    assert.equal(login.statusCode, 200);
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    return (method: any, url: string, payload?: any, binary = false) => app.inject({ method, url, headers: { origin, cookie, ...(binary ? { "content-type": "application/octet-stream" } : {}) }, payload });
  }
  const request = await account(tenant), sameTenant = await account(tenant), otherTenant = await account(randomUUID());
  const project = (await request("POST", "/api/projects", { name: "续传验证" })).json().id;
  const other = (await request("POST", "/api/projects", { name: "独立项目" })).json().id;
  const base = `/api/projects/${project}/upload-batches`, batchId = randomUUID();
  const bytes = Buffer.from("联系人 13800138000"), second = Buffer.from("邮箱 test@example.com");
  const entries = [bytes, second].map((value, i) => ({ requestId: randomUUID(), path: `资料/文档${i}.txt`, size: value.length, sha256: hash(value) }));
  const manifest = { id: batchId, files: entries };
  assert.equal((await request("POST", base, manifest)).statusCode, 200);
  assert.equal((await request("POST", base, manifest)).statusCode, 200);
  const read = async () => {
    const response = await request("GET", `${base}/${batchId}`);
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };
  assert.deepEqual((await read()).files, entries.map(entry => ({ ...entry, documentId: null })));
  const upload = (i: number, body: Buffer) => request("POST", `/api/projects/${project}/files?batchId=${batchId}&requestId=${entries[i].requestId}`, body, true);
  const wrong = Buffer.from(bytes); wrong[0] ^= 1;
  assert.equal((await upload(0, wrong)).json().error, "FILE_HASH_MISMATCH");
  assert.equal((await read()).files[0].documentId, null);
  const firstId = (await upload(0, bytes)).json().id;
  assert.ok(firstId);
  assert.equal((await read()).files[0].documentId, firstId);
  assert.equal((await read()).files[1].documentId, null);
  assert.equal((await upload(0, bytes)).json().id, firstId);
  assert.equal((await request("POST", base, { ...manifest, files: entries.map(entry => ({ ...entry, sha256: "0".repeat(64) })) })).statusCode, 409);
  const secondId = (await upload(1, second)).json().id;
  assert.deepEqual((await read()).files.map((file: any) => file.documentId), [firstId, secondId]);
  assert.equal((await request("GET", `/api/projects/${project}/documents`)).json().length, 2);
  // The read API also preserves old manifests; it must not invent hashes for unuploaded files.
  const legacyId = randomUUID();
  assert.equal((await request("POST", base, { id: legacyId, files: [{ requestId: randomUUID(), path: "legacy.txt", size: 1 }] })).statusCode, 200);
  const legacy = (await request("GET", `${base}/${legacyId}`)).json();
  assert.equal(legacy.files[0].sha256, undefined);
  assert.equal(legacy.files[0].documentId, null);
  const first = (await request("GET", `${base}?limit=1&offset=0`)).json();
  const next = (await request("GET", `${base}?limit=1&offset=1`)).json();
  assert.equal(first.length, 1); assert.equal(next.length, 1); assert.notEqual(first[0].id, next[0].id);
  assert.equal((await request("GET", `${base}?limit=101`)).statusCode, 400);
  // A reused request ID in a different manifest must not make a different file appear stored.
  const conflictingId = randomUUID();
  assert.equal((await request("POST", base, { id: conflictingId, files: [{ ...entries[0], sha256: hash(wrong) }] })).statusCode, 200);
  assert.equal((await request("GET", `${base}/${conflictingId}`)).json().files[0].documentId, null);
  assert.equal((await request("POST", `/api/projects/${project}/files?batchId=${conflictingId}&requestId=${entries[0].requestId}`, wrong, true)).statusCode, 409);
  assert.equal((await request("GET", `${base.replace(project, other)}/${batchId}`)).statusCode, 404);
  for (const outsider of [sameTenant, otherTenant]) {
    assert.equal((await outsider("GET", base)).statusCode, 404);
    assert.equal((await outsider("GET", `${base}/${batchId}`)).statusCode, 404);
    assert.equal((await outsider("POST", `/api/projects/${project}/files?batchId=${batchId}&requestId=${entries[0].requestId}`, bytes, true)).statusCode, 404);
  }
  assert.equal((await app.inject({ url: `${base}/${batchId}` })).statusCode, 401);
  // Finish this scenario's two detect jobs before the next test exercises the global queue.
  await tick(); await tick();
});

test("export policy is enforced by request, worker and new-link signing without revoking existing links", async () => {
  const user = randomUUID(), tenant = randomUUID(), username = "gate-" + randomUUID(), password = "gate-test-password-only";
  await admin.query("INSERT INTO users VALUES($1,$2,$3,$4)", [user, tenant, username, passwordHash(password)]);
  const origin = process.env.APP_ORIGIN!;
  const login = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { username, password } });
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  const request = (method: any, url: string, payload?: any) => app.inject({ method, url, headers: { origin, cookie }, payload });
  const project = (await request("POST", "/api/projects", { name: "导出规则验证" })).json().id;
  const document = (await request("POST", `/api/projects/${project}/documents`, { requestId: randomUUID(), text: "contact 13800138000" })).json().id;
  await tick();
  const view = (await request("GET", `/api/documents/${document}`)).json();
  const decided = view.marks.map((m: any) => ({ ...m, decision: "redact" }));
  assert.equal((await request("POST", `/api/documents/${document}/export`, { revision: 0 })).json().error, "INVALID_MARKS");
  assert.equal((await request("PUT", `/api/documents/${document}/review`, { revision: 0, marks: decided })).statusCode, 200);
  const job = (await request("POST", `/api/documents/${document}/export`, { revision: 1 })).json().id;
  const blocked = JSON.stringify([{ id: "text", status: "blocked", reason: "TEST_UNHANDLED_OBJECT" }]);
  await admin.query("UPDATE documents SET coverage=$1 WHERE id=$2", [blocked, document]);
  for (const action of ["export", "download-link"]) assert.equal((await request("POST", `/api/documents/${document}/${action}`, { revision: 1 })).json().error, "COVERAGE_INCOMPLETE");
  await tick();
  const failed = (await request("GET", `/api/documents/${document}`)).json();
  assert.equal(failed.job.status, "failed"); assert.equal(failed.job.error_code, "COVERAGE_INCOMPLETE");
  assert.equal((await admin.query("SELECT count(*)::int AS count FROM artifacts WHERE document_id=$1", [document])).rows[0].count, 0);
  await admin.query("UPDATE documents SET coverage=$1 WHERE id=$2", [JSON.stringify(view.coverage), document]);
  assert.equal((await request("POST", `/api/jobs/${job}/retry`, { revision: 1 })).statusCode, 200);
  await tick();
  const signed = await request("POST", `/api/documents/${document}/download-link`, { revision: 1 });
  assert.equal(signed.statusCode, 200, signed.body);
  const link = signed.json().url;
  await admin.query("UPDATE documents SET coverage=$1 WHERE id=$2", [blocked, document]);
  assert.equal((await request("POST", `/api/documents/${document}/download-link`, { revision: 1 })).json().error, "COVERAGE_INCOMPLETE");
  assert.equal((await app.inject({ url: link })).statusCode, 200);
  await admin.query("UPDATE documents SET coverage=$1,parse_version=2 WHERE id=$2", [JSON.stringify(view.coverage), document]);
  assert.equal((await request("POST", `/api/documents/${document}/download-link`, { revision: 1 })).json().error, "SNAPSHOT_MISMATCH");
  await admin.query("UPDATE documents SET parse_version=1,content=$1 WHERE id=$2", [seal("contact 13700137000", `${tenant}:${project}:${document}`), document]);
  assert.equal((await request("POST", `/api/documents/${document}/export`, { revision: 1 })).json().error, "SNAPSHOT_MISMATCH");
  assert.equal((await request("POST", `/api/documents/${document}/download-link`, { revision: 0 })).json().error, "VERSION_CONFLICT");
});
