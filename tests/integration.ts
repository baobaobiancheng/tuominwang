import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { buildApp } from "../apps/api/main.ts";
import { tick } from "../apps/worker/main.ts";
import { passwordHash, sign, seal } from "../packages/adapters/storage.ts";
import { pool, scoped, rows, sql, globalDb } from "../packages/adapters/db.ts";
const admin = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
const app = await buildApp();
after(async () => {
  await app.close();
  await pool.end();
  await admin.end();
});
test("real PostgreSQL, API, worker and encrypted artifact security", async () => {
  const username = "test-" + randomUUID(),
    othername = "test-" + randomUUID(),
    uid = randomUUID(),
    tenant = randomUUID(),
    otherid = randomUUID();
  const password = "integration-password-only";
  await admin.query("INSERT INTO users VALUES($1,$2,$3,$4),($5,$6,$7,$4)", [
    uid,
    tenant,
    username,
    passwordHash(password),
    otherid,
    randomUUID(),
    othername,
  ]);
  const origin = process.env.APP_ORIGIN!;
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin },
    payload: { username, password },
  });
  assert.equal(login.statusCode, 200);
  const cookie = login.headers["set-cookie"]!.toString().split(";")[0];
  const other = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { origin },
    payload: { username: othername, password },
  });
  const otherCookie = other.headers["set-cookie"]!.toString().split(";")[0];
  const request = async (method: any, url: string, payload?: any, c = cookie) =>
    app.inject({ method, url, headers: { origin, cookie: c }, payload });
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { cookie },
        payload: { name: "x" },
      })
    ).statusCode,
    403,
  );
  const p = (
    await request("POST", "/api/projects", { name: "自动化测试项目" })
  ).json();
  assert.ok(p.id);
  const text = "😀联系13800138000，邮箱demo@example.com",
    requestId = randomUUID();
  const [a, b] = await Promise.all([
    request("POST", `/api/projects/${p.id}/documents`, { text, requestId }),
    request("POST", `/api/projects/${p.id}/documents`, { text, requestId }),
  ]);
  assert.equal(a.statusCode, 200);
  assert.equal(a.json().id, b.json().id);
  const doc = a.json().id;
  assert.equal(
    (
      await request("POST", `/api/projects/${p.id}/documents`, {
        text: "different",
        requestId,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await request("GET", `/api/documents/${doc}`, undefined, otherCookie))
      .statusCode,
    404,
  );
  assert.equal(
    (await rows(globalDb, sql`SELECT * FROM documents WHERE id=${doc}`)).length,
    0,
  );
  const roles = await admin.query(
    "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname='tmw_app'",
  );
  assert.equal(roles.rows[0].rolsuper, false);
  assert.equal(roles.rows[0].rolbypassrls, false);
  assert.equal(
    (await scoped(uid, "", (db) => rows(db, sql`SELECT id FROM documents`)))
      .length,
    0,
  );
  assert.equal(
    (
      await scoped(otherid, tenant, (db) =>
        rows(db, sql`SELECT id FROM documents WHERE id=${doc}`),
      )
    ).length,
    0,
  );
  const ciphertext = await admin.query(
    "SELECT content FROM documents WHERE id=$1",
    [doc],
  );
  assert.ok(!ciphertext.rows[0].content.includes("13800138000"));
  assert.equal(
    (
      await request("POST", `/api/projects/${p.id}/documents`, {
        text: "x".repeat(102401),
        requestId: randomUUID(),
      })
    ).statusCode,
    413,
  );
  assert.equal(
    (
      await request("POST", `/api/projects/${p.id}/documents`, {
        text: "\ud800",
        requestId: randomUUID(),
      })
    ).statusCode,
    400,
  );
  // Both consumers race for the same durable queue. Only one generation may succeed.
  await Promise.all([tick(), tick()]);
  let d = (await request("GET", `/api/documents/${doc}`)).json();
  assert.equal(d.marks.length, 2);
  assert.equal(d.layers.ner, process.env.NER_ENABLED === "1" ? "not_requested" : "not_configured");
  assert.equal(d.nerEnabled, false); // Installing a model never opts existing documents into a rerun.
  assert.equal(d.job.status, "succeeded");
  assert.equal(
    (await request("POST", `/api/documents/${doc}/export`, { revision: 0 }))
      .statusCode,
    400,
  );
  const marks = d.marks.map((m: any) => ({ ...m, decision: "redact" }));
  assert.equal(
    (
      await request("PUT", `/api/documents/${doc}/review`, {
        revision: 0,
        marks,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await request("PUT", `/api/documents/${doc}/review`, {
        revision: 0,
        marks,
      })
    ).statusCode,
    409,
  );
  const exp = await request("POST", `/api/documents/${doc}/export`, {
    revision: 1,
  });
  assert.equal(exp.statusCode, 200);
  await tick();
  assert.equal((await request("POST", `/api/documents/${doc}/download-link`)).statusCode, 400);
  assert.equal((await request("POST", `/api/documents/${doc}/download-link`, { revision: 0 })).statusCode, 409);
  const link = await request("POST", `/api/documents/${doc}/download-link`, { revision: 1 });
  assert.equal(link.statusCode, 200);
  const url = link.json().url;
  const download = await app.inject({ url });
  assert.equal(download.statusCode, 200);
  assert.equal(download.body, "😀联系【手机号】，邮箱【邮箱】");
  const [artifact] = await scoped(uid, tenant, (db) =>
    rows(db, sql`SELECT * FROM artifacts WHERE document_id=${doc}`),
  );
  const past = Buffer.from(
    JSON.stringify({
      id: artifact.id,
      hash: artifact.hash,
      exp: Date.now() - 1000,
    }),
  ).toString("base64url");
  assert.equal(
    (await app.inject({ url: `/api/download/${past}.${sign(past)}` }))
      .statusCode,
    403,
  );
  assert.equal((await app.inject({ url: url + "a" })).statusCode, 403);
  // New authorization denied after ownership is removed; an issued capability stays usable.
  await admin.query("UPDATE projects SET owner_id=$1 WHERE id=$2", [
    otherid,
    p.id,
  ]);
  assert.equal(
    (await request("POST", `/api/documents/${doc}/download-link`, { revision: 1 })).statusCode,
    404,
  );
  assert.equal((await app.inject({ url })).statusCode, 200);
  await admin.query("UPDATE projects SET owner_id=$1 WHERE id=$2", [uid, p.id]);
  await writeFile(
    resolve(process.env.DATA_DIR ?? ".data/files", artifact.id),
    seal("tampered", artifact.id),
  );
  assert.equal((await app.inject({ url })).statusCode, 409);
  assert.equal(
    (await request("POST", `/api/documents/${doc}/download-link`, { revision: 1 })).statusCode,
    409,
  );
  // A stale window cannot silently download another window's less-redacted revision.
  assert.equal((await request("PUT", `/api/documents/${doc}/review`, {
    revision: 1, marks: marks.map((m: any) => ({ ...m, decision: "ignore" })),
  })).statusCode, 200);
  await request("POST", `/api/documents/${doc}/export`, { revision: 2 });
  await tick();
  const staleLink = await request("POST", `/api/documents/${doc}/download-link`, { revision: 1 });
  assert.equal(staleLink.statusCode, 409);
  assert.equal(staleLink.json().error, "VERSION_CONFLICT");
  const currentLink = await request("POST", `/api/documents/${doc}/download-link`, { revision: 2 });
  assert.equal(currentLink.statusCode, 200);
  assert.equal((await app.inject({ url: currentLink.json().url })).body, text);
  // A simulated crashed consumer cannot commit after its lease was taken over.
  const next = (
    await request("POST", `/api/projects/${p.id}/documents`, {
      text: "18812345678",
      requestId: randomUUID(),
    })
  ).json().id;
  const [old] = await rows(globalDb, sql`SELECT * FROM claim_job()`);
  assert.equal(old.document_id, next);
  await admin.query(
    "UPDATE jobs SET lease_until=now()-interval '1 minute' WHERE id=$1",
    [old.id],
  );
  await tick();
  const stale = await scoped(uid, tenant, (db) =>
    rows(
      db,
      sql`UPDATE jobs SET status='succeeded' WHERE id=${old.id} AND generation=${old.generation} AND status='running' RETURNING id`,
    ),
  );
  assert.equal(stale.length, 0);
  const attemptRows = await admin.query(
    "SELECT outcome FROM attempts WHERE job_id=$1 ORDER BY generation",
    [old.id],
  );
  assert.deepEqual(
    attemptRows.rows.map((r) => r.outcome),
    ["lease_expired", "succeeded"],
  );
  const cancelDoc = (
    await request("POST", `/api/projects/${p.id}/documents`, {
      text: "cancel test",
      requestId: randomUUID(),
    })
  ).json().id;
  d = (await request("GET", `/api/documents/${cancelDoc}`)).json();
  assert.equal(
    (await request("POST", `/api/jobs/${d.job.id}/cancel`)).statusCode,
    200,
  );
  await tick();
  assert.equal(
    (await request("GET", `/api/documents/${cancelDoc}`)).json().job.status,
    "cancelled",
  );
  const broken=(await request('POST',`/api/projects/${p.id}/documents`,{text:'retry fixture',requestId:randomUUID()})).json().id;
  await admin.query("UPDATE documents SET content='invalid-ciphertext' WHERE id=$1",[broken]);
  for(let attempt=1;attempt<=3;attempt++){
    await tick();
    const result=await admin.query('SELECT attempt,status FROM jobs WHERE document_id=$1',[broken]);
    assert.equal(result.rows[0].attempt,attempt);
    assert.equal(result.rows[0].status,attempt===3?'failed':'queued');
    await admin.query('UPDATE jobs SET available_at=now() WHERE document_id=$1',[broken]);
  }
  assert.equal(await tick(),false);
  // Exercise the HTTP body limit as well as Zod: this review is larger than 700 KB.
  const denseText = "a@b.co ".repeat(12000);
  const dense = (await request("POST", `/api/projects/${p.id}/documents`, {
    text: denseText, requestId: randomUUID(),
  })).json().id;
  await tick();
  const denseView = (await request("GET", `/api/documents/${dense}`)).json();
  assert.equal(denseView.marks.length, 12000);
  const denseReview = { revision: 0, marks: denseView.marks.map((m: any) => ({ ...m, decision: "redact" })) };
  assert.ok(Buffer.byteLength(JSON.stringify(denseReview)) > 700000);
  assert.equal((await request("PUT", `/api/documents/${dense}/review`, denseReview)).statusCode, 200);
  assert.equal((await request("POST", `/api/documents/${dense}/export`, { revision: 1 })).statusCode, 200);
  await tick();
  const denseLink = await request("POST", `/api/documents/${dense}/download-link`, { revision: 1 });
  assert.equal(denseLink.statusCode, 200);
  assert.equal((await app.inject({ url: denseLink.json().url })).body, "【邮箱】 ".repeat(12000));
});
