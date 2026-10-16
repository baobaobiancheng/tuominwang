import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { passwordHash, readOriginal } from '../packages/adapters/storage.ts';
import { writePortableWorkspace, readPortableWorkspace } from '../packages/core/workspace-portable.ts';
import { readZip, writeZip } from '../packages/core/office-zip.ts';
import { pdfFixture } from './pdf-fixtures.ts';
import { openPdf } from '../packages/core/pdf-reader.ts';
import { readPortableWorkspaceV2FromFile } from '../packages/core/workspace-portable-stream.ts';
import yazl from 'yazl';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app = await buildApp();
const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
after(async () => { await app.close(); await pool.end(); await admin.end(); });
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function largeValidPdf(text: string) {
  const base = pdfFixture({ text }), source = base.toString('latin1');
  const objectId = Number(source.match(/\/Size (\d+)/)?.[1]);
  const priorXref = Number(source.match(/startxref\s*(\d+)/)?.[1]);
  assert.ok(Number.isSafeInteger(objectId) && Number.isSafeInteger(priorXref));
  const padding = randomBytes(26 * 1024 * 1024);
  const head = Buffer.from(`\n${objectId} 0 obj\n<< /Length ${padding.length} >>\nstream\n`);
  const end = Buffer.from('\nendstream\nendobj\n');
  const xrefOffset = base.length + head.length + padding.length + end.length;
  const tail = Buffer.from(`xref\n${objectId} 1\n${String(base.length + 1).padStart(10, '0')} 00000 n \ntrailer\n<< /Size ${objectId + 1} /Root 1 0 R /Prev ${priorXref} >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.concat([base, head, padding, end, tail]);
}
function largeFixtureZip(parts: Map<string, Buffer>) {
  return new Promise<Buffer>((resolve, reject) => {
    const zip = new yazl.ZipFile(), chunks: Buffer[] = [];
    zip.outputStream.on('error', reject);
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    for (const [name, bytes] of parts) zip.addBuffer(bytes, name, { compress: !/\/source\./.test(name), mode: 0o100600 });
    zip.end({ forceZip64Format: true, comment: '' });
  });
}

function multipart(parts: [string, string | Buffer][]) {
  const boundary = 'tmw-' + randomUUID(), pieces: Buffer[] = [];
  for (const [name, value] of parts) {
    pieces.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${Buffer.isBuffer(value) ? '; filename="workspace.tmm"\r\nContent-Type: application/octet-stream' : ''}\r\n\r\n`));
    pieces.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
    pieces.push(Buffer.from('\r\n'));
  }
  pieces.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(pieces), type: `multipart/form-data; boundary=${boundary}` };
}

test('dedicated large V1 migration streams a verified V2 file and opens it as a new project', { timeout: 120000 }, async () => {
  const user = randomUUID(), tenant = randomUUID(), username = 'v1-migrate-' + user;
  const loginPassword = 'synthetic-login', archivePassword = 'synthetic-transfer-password', origin = process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [user, tenant, username, passwordHash(loginPassword)]);
  const login = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { username, password: loginPassword } });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const original = pdfFixture({ text: 'PUBLIC 13800138000' }), id = 'synthetic-doc';
  const snapshot: any = { schemaVersion: 1, projectId: 'synthetic-project', projectName: 'public synthetic',
    createdAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z', activeDocumentId: id,
    contentRevision: 1, workspaceCorrections: [], reviewDecisionEvents: [], profileSnapshot: null,
    documents: [{ id, fileName: 'synthetic.pdf', fileKind: 'pdf', sourceEntry: `documents/${id}/source.pdf`,
      detection: { entities: [], bboxes: [], ocrCachePages: [], documentText: 'PUBLIC 13800138000' },
      review: { schemaVersion: 1, kind: 'pdf', isPreviewMode: false, hasVisitedPreview: false,
        enablePseudonymization: false, pseudonymEntries: [], maskStyle: 'black', entities: [],
        pageRotations: {}, manualOnlyRotationPages: [], viewport: { pageNumber: 1, scale: 1 } },
      exportState: { kind: 'pdf', mode: 'default_star', exportMarkdown: false, pseudonymTableName: 'synthetic',
        redact: true, redactPseudo: false, maskStyle: 'black', exportDocx: false } }] };
  const parts = await readZip(await writePortableWorkspace(snapshot, new Map([[snapshot.documents[0].sourceEntry, original]]), { format: 'legacy-zip' }));
  const manifest = JSON.parse(parts.get('manifest.json')!.toString());
  for (let i = 0; i < 2001; i++) {
    const entry = `audit/legacy-${String(i).padStart(5, '0')}.txt`, bytes = Buffer.from(String(i));
    parts.set(entry, bytes); manifest.checksums[entry] = sha(bytes);
  }
  parts.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  const source = await writeZip(parts), input = multipart([['file', source], ['newPassword', archivePassword]]);
  const ordinaryInput = multipart([['name', '普通打开容量反例'], ['file', source]]);
  const ordinary = await app.inject({ method: 'POST', url: '/api/portable/import-file',
    headers: { origin, cookie, 'content-type': ordinaryInput.type }, payload: ordinaryInput.body });
  assert.equal(ordinary.statusCode, 400, ordinary.body);
  assert.equal(ordinary.json().error, 'WORKSPACE_ENTRY_LIMIT');
  const migrated = await app.inject({ method: 'POST', url: '/api/portable/migrate-v1-file',
    headers: { origin, cookie, 'content-type': input.type }, payload: input.body });
  assert.equal(migrated.statusCode, 200, migrated.body.slice(0, 200));
  assert.match(String(migrated.headers['content-disposition']), /source_V2\.tmm/);
  const opened = await readPortableWorkspace(migrated.rawPayload, { password: archivePassword });
  const persistedIndex = JSON.parse(opened.archiveEntries.get('workspace/index.json')!.toString('utf8'));
  assert.equal(persistedIndex.schemaVersion, 2);
  assert.equal(persistedIndex.workspaceSchemaVersion, 1);
  assert.equal(opened.snapshot.schemaVersion, 2);
  assert.equal(opened.snapshot.documents[0].detection.documentText, 'PUBLIC 13800138000');
  assert.deepEqual(opened.sources.get(snapshot.documents[0].sourceEntry), original);
  const importedBody = multipart([['name', '迁移后工程'], ['password', archivePassword], ['file', migrated.rawPayload]]);
  const imported = await app.inject({ method: 'POST', url: '/api/portable/import-file',
    headers: { origin, cookie, 'content-type': importedBody.type }, payload: importedBody.body });
  assert.equal(imported.statusCode, 200, imported.body);
  assert.equal(imported.json().documentCount, 1);
  const docs = await admin.query('SELECT source_id,source_hash FROM documents WHERE project_id=$1', [imported.json().id]);
  assert.equal(docs.rows.length, 1);
  assert.equal(docs.rows[0].source_hash, sha(original));
  assert.deepEqual(await readOriginal(docs.rows[0].source_id), original);

  const tampered = new Map(parts); tampered.set(snapshot.documents[0].sourceEntry, Buffer.from('tampered source'));
  const bad = multipart([['file', await writeZip(tampered)], ['newPassword', archivePassword]]);
  const refused = await app.inject({ method: 'POST', url: '/api/portable/migrate-v1-file',
    headers: { origin, cookie, 'content-type': bad.type }, payload: bad.body });
  assert.equal(refused.statusCode, 400, refused.body);
  assert.notEqual(refused.headers['content-type'], 'application/octet-stream');
  const unauthenticated = await app.inject({ method: 'POST', url: '/api/portable/migrate-v1-file',
    headers: { origin, 'content-type': input.type }, payload: input.body });
  assert.equal(unauthenticated.statusCode, 401, unauthenticated.body);

  // The upload has finished before the client closes its response stream.
  // The private conversion directory must still be removed.
  const before = new Set((await readdir(tmpdir())).filter(name => name.startsWith('tmw-v1-migrate-')));
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const url = new URL('/api/portable/migrate-v1-file', address);
  const request = http.request(url, { method: 'POST', headers: {
    origin, cookie, 'content-type': input.type, 'content-length': String(input.body.length) } });
  request.on('error', () => {});
  request.end(input.body);
  let transient = '';
  for (let i = 0; i < 500; i++) {
    const names = (await readdir(tmpdir())).filter(name => name.startsWith('tmw-v1-migrate-') && !before.has(name));
    if (names.length === 1) {
      transient = join(tmpdir(), names[0]);
      try { if ((await stat(join(transient, 'source.tmm'))).size === source.length) break; }
      catch { /* the upload is still being written */ }
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(transient, 'the real HTTP upload entered the private conversion directory');
  assert.equal((await stat(join(transient, 'source.tmm'))).size, source.length);
  request.destroy();
  for (let i = 0; i < 500; i++) {
    if (!(await readdir(tmpdir())).includes(transient.split('/').at(-1)!)) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(!(await readdir(tmpdir())).includes(transient.split('/').at(-1)!), 'disconnect removed the private conversion directory');
});

test('two renderable PDFs above 50 MiB migrate from the same oversized V1 batch and import with exact source bytes', { timeout: 300000 }, async () => {
  const user = randomUUID(), tenant = randomUUID(), username = 'v1-large-' + user;
  const loginPassword = 'synthetic-login', archivePassword = 'synthetic-transfer-password', origin = process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [user, tenant, username, passwordHash(loginPassword)]);
  const login = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { username, password: loginPassword } });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const originals = [largeValidPdf('PUBLIC FIRST 13800138000'), largeValidPdf('PUBLIC SECOND 13900139000')];
  assert.ok(originals.every(bytes => bytes.length > 26 * 1024 * 1024 && bytes.length < 50 * 1024 * 1024));
  for (const bytes of originals) { const pdf = await openPdf(bytes); assert.equal(pdf.count, 1); pdf.close(); }
  const documents = originals.map((_, n) => ({ id: `large-${n}`, fileName: `public-${n}.pdf`, fileKind: 'pdf',
    sourceEntry: `documents/large-${n}/source.pdf`,
    detection: { entities: [], bboxes: [], ocrCachePages: [], documentText: `PUBLIC ${n}` },
    review: { schemaVersion: 1, kind: 'pdf', isPreviewMode: false, hasVisitedPreview: false,
      enablePseudonymization: false, pseudonymEntries: [], maskStyle: 'black', entities: [],
      pageRotations: {}, manualOnlyRotationPages: [], viewport: { pageNumber: 1, scale: 1 } },
    exportState: { kind: 'pdf', mode: 'default_star', exportMarkdown: false, pseudonymTableName: 'synthetic',
      redact: true, redactPseudo: false, maskStyle: 'black', exportDocx: false } }));
  const snapshot: any = { schemaVersion: 1, projectId: 'synthetic-large-project', projectName: 'public large V1',
    createdAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z', activeDocumentId: documents[0].id,
    contentRevision: 1, workspaceCorrections: [], reviewDecisionEvents: [], profileSnapshot: null, documents };
  const seeds = new Map(documents.map((document, n) => [document.sourceEntry, Buffer.from(`seed-${n}`)]));
  const parts = await readZip(await writePortableWorkspace(snapshot, seeds, { format: 'legacy-zip' }));
  const manifest = JSON.parse(parts.get('manifest.json')!.toString());
  for (const [n, document] of documents.entries()) {
    parts.set(document.sourceEntry, originals[n]); manifest.checksums[document.sourceEntry] = sha(originals[n]);
  }
  for (let n = 0; n < 2001; n++) {
    const entry = `audit/legacy-${String(n).padStart(5, '0')}.txt`, bytes = Buffer.from(String(n));
    parts.set(entry, bytes); manifest.checksums[entry] = sha(bytes);
  }
  parts.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  const source = await largeFixtureZip(parts);
  assert.ok(source.length > 50 * 1024 * 1024);
  const body = multipart([['file', source], ['newPassword', archivePassword]]);
  const migrated = await app.inject({ method: 'POST', url: '/api/portable/migrate-v1-file',
    headers: { origin, cookie, 'content-type': body.type }, payload: body.body });
  assert.equal(migrated.statusCode, 200, migrated.body.slice(0, 200));
  const directory = await mkdtemp(join(tmpdir(), 'tmw-migrated-large-check-'));
  try {
    const archivePath = join(directory, 'migrated.tmm');
    await writeFile(archivePath, migrated.rawPayload);
    const opened = await readPortableWorkspaceV2FromFile(archivePath, archivePassword);
    try {
      assert.equal((await opened.archive.readJson('workspace/index.json')).workspaceSchemaVersion, 1);
      assert.equal(opened.snapshot.schemaVersion, 2);
      for (const [n, document] of documents.entries()) {
        const chunks: Buffer[] = [];
        for await (const part of await opened.archive.openEntry(document.sourceEntry)) chunks.push(Buffer.from(part));
        assert.deepEqual(Buffer.concat(chunks), originals[n]);
      }
    } finally { await opened.archive.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
  const importedBody = multipart([['name', '完整迁移后大工程'], ['password', archivePassword], ['file', migrated.rawPayload]]);
  const imported = await app.inject({ method: 'POST', url: '/api/portable/import-file',
    headers: { origin, cookie, 'content-type': importedBody.type }, payload: importedBody.body });
  assert.equal(imported.statusCode, 200, imported.body);
  assert.equal(imported.json().documentCount, 2);
  const docs = await admin.query('SELECT source_id,source_hash FROM documents WHERE project_id=$1', [imported.json().id]);
  assert.equal(docs.rows.length, 2);
  for (const bytes of originals) {
    const row = docs.rows.find(document => document.source_hash === sha(bytes));
    assert.ok(row, 'each migrated PDF retains its source hash');
    assert.deepEqual(await readOriginal(row.source_id), bytes);
  }
});
