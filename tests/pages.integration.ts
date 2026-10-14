import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { buildApp } from "../apps/api/main.ts";
import { tick } from "../apps/worker/main.ts";
import { pool } from "../packages/adapters/db.ts";
import { passwordHash, readOriginal, writeArtifact, hash, seal } from "../packages/adapters/storage.ts";
import { pdfFixture } from "./pdf-fixtures.ts";
import { openPdf } from "../packages/core/pdf-reader.ts";
import { officeImageFixture } from "./office-fixtures.ts";
import { readZip } from "../packages/core/office-zip.ts";

const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL }), app = await buildApp();
after(async () => { await app.close(); await pool.end(); await admin.end(); });
test("PDF/image reviewed regions, safe pixel export, explicit conversion, page deletion and snapshot binding", async () => {
  const user = randomUUID(), tenant = randomUUID(), username = "pages-" + randomUUID(), password = "public-page-test-password";
  await admin.query("INSERT INTO users VALUES($1,$2,$3,$4)", [user, tenant, username, passwordHash(password)]);
  const origin = process.env.APP_ORIGIN!, login = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { username, password } });
  assert.equal(login.statusCode, 200);
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  const request = (method: any, url: string, payload?: any, binary = false) => app.inject({ method, url, headers: { origin, cookie, ...(binary ? { "content-type": "application/octet-stream" } : {}) }, payload });
  const project = (await request("POST", "/api/projects", { name: "页面处理" })).json().id;
  const pdf = pdfFixture({ pages: 2, author: "private original metadata" }), reader = await openPdf(pdf);
  let png: Buffer; try { png = (await reader.page(0)).png; } finally { reader.close(); }
  const jpeg = await sharp(png).jpeg().withExif({ IFD0: { Artist: "13800138000" } }).toBuffer();
  for (const [format, bytes] of [["pdf", pdf], ["jpg", jpeg], ["png", await sharp({ create: { width: 80, height: 60, channels: 3, background: "red" } }).png().toBuffer()], ["docx", await officeImageFixture(jpeg)]] as const) {
    const batchId = randomUUID(), requestId = randomUUID();
    assert.equal((await request("POST", `/api/projects/${project}/upload-batches`, { id: batchId, files: [{ requestId, path: `sample.${format}`, size: bytes.length }] })).statusCode, 200);
    const uploaded = await request("POST", `/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`, bytes, true);
    assert.equal(uploaded.statusCode, 200); const docId = uploaded.json().id, url = `/api/documents/${docId}`;
    await tick(); let d = (await request("GET", url)).json(); assert.equal(d.state, "review", JSON.stringify(d.job));
    const visual = await request("POST", url + "/pages/0/visual-candidates", { revision: d.revision, detectors: ["seal"] });
    assert.equal(visual.statusCode, 200, visual.body);
    assert.equal(visual.json().page, 0); assert.equal(visual.json().revision, d.revision);
    assert.equal(visual.json().width, d.pages[0].width);
    assert.equal((await request("POST", url + "/pages/0/visual-candidates", { revision: d.revision + 1, detectors: ["seal"] })).statusCode, 409);
    const marks = d.marks.map((m: any) => ({ ...m, decision: "redact" }));
    const region = { id: randomUUID(), page: 0, x: 10, y: 10, width: 20, height: 20, reason: "印章" };
    const pageReview = { mode: "raster", regions: [region], deletedPages: format === "pdf" ? [1] : [] };
    assert.equal((await request("POST", url + "/export", { revision: 0 })).statusCode, 409);
    assert.equal((await request("PUT", url + "/review", { revision: 0, marks, pageReview: { ...pageReview, deletedPages: Array.from({ length: d.pages.length }, (_, i) => i) } })).statusCode, 400);
    assert.equal((await request("PUT", url + "/review", { revision: 0, marks, pageReview: { ...pageReview, regions: [{ ...region, width: 1e9 }] } })).statusCode, 400);
    const preview = await request("POST", url + "/pages/0/preview", { revision: 0, marks, pageReview });
    assert.equal(preview.statusCode, 200, preview.body.slice(0, 200));
    const saved = await request("PUT", url + "/review", { revision: 0, marks, pageReview });
    assert.equal(saved.statusCode, 200, saved.body); assert.equal(saved.json().revision, 1);
    assert.equal((await request("POST", url + "/export", { revision: 0 })).statusCode, 409);
    const job = await request("POST", url + "/export", { revision: 1 }); assert.equal(job.statusCode, 200, job.body);
    await tick(); d = (await request("GET", url)).json(); assert.equal(d.job.status, "succeeded", `${format}: ${JSON.stringify(d.job)}`);
    const link = await request("POST", url + "/download-link", { revision: 1 }); assert.equal(link.statusCode, 200, link.body);
    const downloaded = await app.inject({ url: link.json().url }); assert.equal(downloaded.statusCode, 200);
    assert.equal(downloaded.headers["content-type"], format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : format === "pdf" ? "application/pdf" : "image/png");
    assert.equal(downloaded.headers["content-disposition"], `attachment; filename="redacted.${format === "docx" ? "docx" : format === "pdf" ? "pdf" : "png"}"`);
    let outputImage: Buffer;
    if (format === "pdf") {
      const exported = await openPdf(downloaded.rawPayload);
      try { assert.equal(exported.count, 1); assert.deepEqual(exported.meta, {}); const page = await exported.page(0); assert.equal(page.text, ""); outputImage = page.png; } finally { exported.close(); }
    } else if (format === "docx") {
      const parts = await readZip(downloaded.rawPayload);
      assert.ok(![...parts.keys()].some(name => name.includes("13800138000")));
      assert.equal([...parts.keys()].filter(n => n.startsWith("word/media/")).length, 1);
      outputImage = parts.get("word/media/redacted-1.png")!; assert.ok(outputImage);
      assert.ok(parts.get("word/_rels/document.xml.rels")!.toString().includes("media/redacted-1.png"));
      assert.ok(!parts.get("word/document.xml")!.toString().includes("demo@example.com"));
      assert.ok(!parts.get("[Content_Types].xml")!.toString().includes("customer-13800138000"));
      assert.equal((await sharp(outputImage).metadata()).exif, undefined);
    } else outputImage = downloaded.rawPayload;
    const { data, info } = await sharp(outputImage).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const scale = format === "pdf" ? 2 : 1, at = (15 * scale * info.width + 15 * scale) * 3;
    assert.deepEqual([...data.subarray(at, at + 3)], [0, 0, 0]);
    const stored = (await admin.query("SELECT * FROM documents WHERE id=$1", [docId])).rows[0];
    assert.ok((await readOriginal(stored.source_id)).equals(bytes));
    const snapshots = (await admin.query("SELECT page_review,page_data FROM review_snapshots WHERE document_id=$1 AND revision=1", [docId])).rows[0];
    assert.deepEqual(snapshots.page_review, pageReview); assert.deepEqual(snapshots.page_data, stored.page_data);
    await admin.query("UPDATE documents SET page_review=$2 WHERE id=$1", [docId, JSON.stringify({ ...pageReview, regions: [] })]);
    assert.equal((await request("POST", url + "/download-link", { revision: 1 })).json().error, "SNAPSHOT_MISMATCH");
    assert.equal((await app.inject({ url: link.json().url })).statusCode, 200); // already issued links retain their contract
    await admin.query("UPDATE documents SET page_review=$2 WHERE id=$1", [docId, JSON.stringify(pageReview)]);
    const artifact = (await admin.query("SELECT id FROM artifacts WHERE document_id=$1", [docId])).rows[0];
    await assert.rejects(writeArtifact(artifact.id, bytes.toString("base64")), { code: "EEXIST" });
    assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith("/tmw_test_"));
    await writeFile(resolve(process.env.DATA_DIR!, artifact.id), seal(bytes.toString("base64"), artifact.id));
    assert.equal((await app.inject({ url: link.json().url })).statusCode, 409);
    assert.notEqual(hash(bytes), hash(downloaded.rawPayload));
  }
});
