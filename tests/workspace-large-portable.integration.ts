import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { passwordHash, hash, readOriginal } from '../packages/adapters/storage.ts';
import { openPdf } from '../packages/core/pdf-reader.ts';
import { pdfFixture } from './pdf-fixtures.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app = await buildApp();
const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
after(async () => { await app.close(); await pool.end(); await admin.end(); });

function largeValidPdf(text: string) {
  const base = pdfFixture({ text });
  const source = base.toString('latin1');
  const objectId = Number(source.match(/\/Size (\d+)/)?.[1]);
  const priorXref = Number(source.match(/startxref\s*(\d+)/)?.[1]);
  assert.ok(Number.isSafeInteger(objectId) && Number.isSafeInteger(priorXref));
  // An unreferenced PDF stream keeps the one-page public fixture renderable
  // while providing a real, poorly compressible source below the upload limit.
  const padding = randomBytes(26 * 1024 * 1024);
  const head = Buffer.from(`\n${objectId} 0 obj\n<< /Length ${padding.length} >>\nstream\n`);
  const endObject = Buffer.from('\nendstream\nendobj\n');
  const xrefOffset = base.length + head.length + padding.length + endObject.length;
  const tail = Buffer.from(`xref\n${objectId} 1\n${String(base.length + 1).padStart(10, '0')} 00000 n \ntrailer\n<< /Size ${objectId + 1} /Root 1 0 R /Prev ${priorXref} >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.concat([base, head, padding, endObject, tail]);
}

function multipart(parts: [string, string | Buffer][]) {
  const boundary = 'tmw-' + randomUUID(), pieces: Buffer[] = [];
  for (const [name, value] of parts) {
    pieces.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${Buffer.isBuffer(value) ? '; filename="workspace.tmw"\r\nContent-Type: application/octet-stream' : ''}\r\n\r\n`));
    pieces.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
    pieces.push(Buffer.from('\r\n'));
  }
  pieces.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(pieces), type: `multipart/form-data; boundary=${boundary}` };
}

test('two real PDFs form each workspace format above 50 MiB and retain exact original bytes through save and file import', { timeout: 300000 }, async () => {
  const userId = randomUUID(), tenant = randomUUID(), username = 'large-workspace-' + userId;
  const loginPassword = 'synthetic-login', archivePassword = 'synthetic-transfer-password', origin = process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [userId, tenant, username, passwordHash(loginPassword)]);
  const login = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { username, password: loginPassword } });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const req = (method: string, url: string, payload?: unknown, binary = false) => app.inject({ method: method as any, url, payload: payload as any, headers: { origin, cookie, ...(binary ? { 'content-type': 'application/octet-stream' } : {}) } });
  const projectResponse = await req('POST', '/api/projects', { name: '公开大工程' });
  assert.equal(projectResponse.statusCode, 200, projectResponse.body);
  const project = projectResponse.json().id as string;
  const originals = [largeValidPdf('PUBLIC FIRST 13800138000'), largeValidPdf('PUBLIC SECOND 13900139000')];
  assert.ok(originals.every(bytes => bytes.length > 26 * 1024 * 1024 && bytes.length < 50 * 1024 * 1024));
  for (const bytes of originals) { const pdf = await openPdf(bytes); assert.equal(pdf.count, 1); pdf.close(); }
  const batchId = randomUUID(), entries = originals.map((bytes, i) => ({ requestId: randomUUID(), path: `public-${i + 1}.pdf`, size: bytes.length, sha256: hash(bytes) }));
  const batch = await req('POST', `/api/projects/${project}/upload-batches`, { id: batchId, files: entries });
  assert.equal(batch.statusCode, 200, batch.body);
  for (let i = 0; i < entries.length; i++) {
    const upload = await req('POST', `/api/projects/${project}/files?batchId=${batchId}&requestId=${entries[i].requestId}`, originals[i], true);
    assert.equal(upload.statusCode, 200, upload.body);
  }
  for (const format of ['legacy-zip', 'secure-v2', 'secure-v3', 'native'] as const) {
    const requestId = randomUUID();
    const started = await req('POST', `/api/projects/${project}/portable/save`, { requestId, password: archivePassword, format });
    assert.equal(started.statusCode, 200, started.body);
    let result: any;
    for (let i = 0; i < 180; i++) {
      const response = await req('POST', `/api/projects/${project}/portable/save-result`, { requestId });
      assert.equal(response.statusCode, 200, response.body);
      result = response.json();
      if (result.state !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(result.state, 'completed', JSON.stringify(result));
    const download = await req('GET', result.downloadPath);
    assert.equal(download.statusCode, 200, download.body.slice(0, 150));
    assert.ok(download.rawPayload.length > 50 * 1024 * 1024, `actual ${format} bytes=${download.rawPayload.length}`);
    assert.equal(hash(download.rawPayload), result.sha256);
    const body = multipart([['name', `导入${format}`], ['password', archivePassword], ['file', download.rawPayload]]);
    const imported = await app.inject({ method: 'POST', url: '/api/portable/import-file', headers: { origin, cookie, 'content-type': body.type }, payload: body.body });
    assert.equal(imported.statusCode, 200, imported.body);
    assert.equal(imported.json().documentCount, 2);
    const rows = await admin.query('SELECT id, source_hash, source_id FROM documents WHERE project_id=$1', [imported.json().id]);
    assert.equal(rows.rows.length, 2);
    for (const source of originals) {
      const stored = rows.rows.find(row => row.source_hash === hash(source));
      assert.ok(stored);
      assert.deepEqual(await readOriginal(stored.source_id), source);
    }
  }
});
