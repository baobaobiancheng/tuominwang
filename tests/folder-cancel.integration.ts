// Candidate for tests/folder-cancel.integration.ts. Run only with the isolated
// PostgreSQL and storage settings used by the integration suite.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { tick } from '../apps/worker/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { hash, passwordHash, readOriginal } from '../packages/adapters/storage.ts';
import { readZip } from '../packages/core/office-zip.ts';

const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
const origin = process.env.APP_ORIGIN!;
after(async () => { await app.close(); await pool.end(); await admin.end(); });

type Method = 'GET' | 'POST' | 'PUT';
type Request = (method: Method, path: string, payload?: any) => Promise<any>;
async function login(username: string, password: string): Promise<Request> {
  const response = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { username, password } });
  assert.equal(response.statusCode, 200, response.body);
  const cookie = String(response.headers['set-cookie']).split(';')[0];
  return (method, path, payload) => app.inject({ method, url: path, headers: { origin, cookie, ...(Buffer.isBuffer(payload) ? { 'content-type': 'application/octet-stream' } : {}) }, payload });
}
async function context(label: string) {
  const tenant = randomUUID(), ownerId = randomUUID(), username = `folder-${randomUUID()}`, password = 'synthetic-folder-cancel-password';
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [ownerId, tenant, username, passwordHash(password)]);
  const req = await login(username, password);
  const created = await req('POST', '/api/projects', { name: `合成文件夹取消-${label}` });
  assert.equal(created.statusCode, 200, created.body);
  return { tenant, ownerId, username, password, req, project: created.json().id as string };
}
async function upload(ctx: Awaited<ReturnType<typeof context>>, path: string, bytes: Buffer) {
  const batchId = randomUUID(), requestId = randomUUID();
  const batch = await ctx.req('POST', `/api/projects/${ctx.project}/upload-batches`, { id: batchId, files: [{ requestId, path, size: bytes.length, sha256: hash(bytes) }] });
  assert.equal(batch.statusCode, 200, batch.body);
  const saved = await ctx.req('POST', `/api/projects/${ctx.project}/files?batchId=${batchId}&requestId=${requestId}`, bytes);
  assert.equal(saved.statusCode, 200, saved.body);
  const documentId = saved.json().id as string;
  const [source] = (await admin.query('SELECT source_id,source_hash FROM documents WHERE id=$1', [documentId])).rows;
  assert.equal(source.source_hash, hash(bytes));
  return { batchId, requestId, documentId, path, bytes, sourceId: source.source_id as string };
}
async function document(ctx: Awaited<ReturnType<typeof context>>, id: string) {
  const response = await ctx.req('GET', `/api/documents/${id}`);
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}
async function folder(ctx: Awaited<ReturnType<typeof context>>, batchId: string) {
  const created = await ctx.req('POST', `/api/projects/${ctx.project}/folder-exports`, { uploadBatchId: batchId, sourceRootName: '合成取消结果' });
  assert.equal(created.statusCode, 200, created.body);
  return `/api/projects/${ctx.project}/folder-exports/${created.json().exportSessionId}`;
}
async function folderView(ctx: Awaited<ReturnType<typeof context>>, base: string) {
  const response = await ctx.req('GET', base);
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}
function canceled(path: string) { return { sourceRelativePath: path, status: 'canceled' as const }; }

// The first case exercises the same HTTP routes used by FolderOutput, then the
// actual worker. The one direct revision update below is an isolated synthetic
// policy-invalidation fixture, not a claim about a particular rules API.
test('folder result binds a cancelled detect attempt only to the immediate outdated revision', async () => {
  const ctx = await context('cancel-then-recognize');
  const bytes = Buffer.from('合成材料 电话13800138000');
  const file = await upload(ctx, '材料/取消.txt', bytes);
  const before = await document(ctx, file.documentId);
  assert.equal(before.revision, 0);
  assert.equal(before.state, 'queued');
  assert.equal(before.job.kind, 'detect');
  const cancelled = await ctx.req('POST', `/api/jobs/${before.job.id}/cancel`);
  assert.equal(cancelled.statusCode, 200, cancelled.body);
  const after = await document(ctx, file.documentId);
  assert.equal(after.revision, 1);
  assert.equal(after.state, 'outdated');
  assert.equal(after.job.id, before.job.id);
  assert.equal(after.job.status, 'cancelled');

  const base = await folder(ctx, file.batchId);
  const first = await folderView(ctx, base);
  assert.equal(first.files.length, 1);
  assert.equal(first.files[0].documentId, file.documentId);
  assert.equal(first.files[0].revision, 1);
  assert.equal(first.files[0].jobStatus, 'cancelled');
  assert.equal(first.files[0].artifactId, null);

  // A second project member has both read/export capabilities but does not own
  // the folder session. Owner scoping must still hide it.
  const memberName = `folder-member-${randomUUID()}`;
  const memberCreated = await ctx.req('POST', '/api/organization/members', { username: memberName, password: ctx.password });
  assert.equal(memberCreated.statusCode, 200, memberCreated.body);
  const granted = await ctx.req('PUT', `/api/projects/${ctx.project}/members/${memberCreated.json().id}`, { revision: null, permissions: ['view_original', 'export'] });
  assert.equal(granted.statusCode, 200, granted.body);
  const member = await login(memberName, ctx.password);
  assert.equal((await member('GET', base)).statusCode, 404);
  assert.equal((await member('POST', `${base}/manifest`, { revision: 0, entries: [canceled(file.path)] })).statusCode, 404);

  const manifest = await ctx.req('POST', `${base}/manifest`, { revision: first.revision, entries: [canceled(file.path)] });
  assert.equal(manifest.statusCode, 200, manifest.body);
  assert.deepEqual(manifest.json().counts, { success: 0, failed: 0, skipped: 0, canceled: 1 });
  const download = await ctx.req('GET', `${base}/download`);
  assert.equal(download.statusCode, 200, download.body);
  assert.equal(hash(download.rawPayload), manifest.json().hash);
  assert.equal((await member('GET', `${base}/download`)).statusCode, 404);
  const parts = await readZip(download.rawPayload);
  assert.equal(parts.size, 1);
  const html = [...parts].find(([name]) => name.endsWith('/脱敏处理清单.html'))?.[1].toString();
  assert.ok(html);
  assert.ok(html.includes('材料/取消.txt'));
  assert.ok(html.includes('class="status-canceled"'));
  assert.ok(html.includes('已取消'));
  assert.ok(!html.includes('13800138000'));
  assert.deepEqual(await readOriginal(file.sourceId), bytes);

  // A new, draft session can follow later processing without changing the
  // completed cancellation receipt above.
  const nextBase = await folder(ctx, file.batchId);
  const queued = await ctx.req('POST', `/api/documents/${file.documentId}/recognize`, { revision: after.revision, ner: false });
  assert.equal(queued.statusCode, 200, queued.body);
  const inProgress = await document(ctx, file.documentId);
  assert.equal(inProgress.revision, 2);
  assert.equal(inProgress.state, 'queued');
  assert.equal(inProgress.job.status, 'queued');
  assert.notEqual(inProgress.job.id, before.job.id);
  assert.equal((await folderView(ctx, nextBase)).files[0].jobStatus, 'queued');
  const staleWhileQueued = await ctx.req('POST', `${nextBase}/manifest`, { revision: 0, entries: [canceled(file.path)] });
  assert.equal(staleWhileQueued.statusCode, 400, staleWhileQueued.body);
  assert.equal(staleWhileQueued.json().error, 'FOLDER_STATUS_MISMATCH');

  await tick();
  const recognized = await document(ctx, file.documentId);
  assert.equal(recognized.revision, 2);
  assert.equal(recognized.state, 'review');
  assert.equal(recognized.job.status, 'succeeded');
  assert.equal((await folderView(ctx, nextBase)).files[0].jobStatus, 'succeeded');
  const staleAfterSuccess = await ctx.req('POST', `${nextBase}/manifest`, { revision: 0, entries: [canceled(file.path)] });
  assert.equal(staleAfterSuccess.statusCode, 400, staleAfterSuccess.body);
  assert.equal(staleAfterSuccess.json().error, 'FOLDER_STATUS_MISMATCH');

  // Isolated fixture: simulate a later, separate policy invalidation without a
  // new job. Rev 0 cancellation must not reappear at rev 3.
  const invalidated = await admin.query("UPDATE documents SET state='outdated',revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING revision,state", [file.documentId, recognized.revision]);
  assert.equal(invalidated.rowCount, 1);
  assert.equal(invalidated.rows[0].revision, 3);
  const later = await folderView(ctx, nextBase);
  assert.equal(later.files[0].revision, 3);
  assert.equal(later.files[0].jobStatus, null);
  const staleAfterInvalidation = await ctx.req('POST', `${nextBase}/manifest`, { revision: 0, entries: [canceled(file.path)] });
  assert.equal(staleAfterInvalidation.statusCode, 400, staleAfterInvalidation.body);
  assert.equal(staleAfterInvalidation.json().error, 'FOLDER_STATUS_MISMATCH');
  assert.deepEqual(await readOriginal(file.sourceId), bytes);
});

test('real preset invalidation cancels its old job; a synthetic outdate-then-cancel race reports the latest attempt', async () => {
  const ctx = await context('real-rule-change');
  const bytes = Buffer.from('另一份合成材料 电话13900139000');
  const file = await upload(ctx, '规则/自动取消.txt', bytes);
  const before = await document(ctx, file.documentId);
  assert.equal(before.revision, 0);
  assert.equal(before.job.status, 'queued');
  const profile = await ctx.req('POST', '/api/presets/profiles', { name: `合成规则-${randomUUID()}` });
  assert.equal(profile.statusCode, 200, profile.body);
  const apply = await ctx.req('PUT', `/api/projects/${ctx.project}/presets`, { revision: 0, profileId: profile.json().settings.id, profileRevision: 1, rulesetId: null });
  assert.equal(apply.statusCode, 200, apply.body);
  const outdated = await document(ctx, file.documentId);
  assert.equal(outdated.revision, 1);
  assert.equal(outdated.state, 'outdated');
  assert.equal(outdated.job.id, before.job.id);
  assert.equal(outdated.job.status, 'cancelled');
  // The real preset API cancels active jobs in its invalidation transaction;
  // a second explicit cancellation cannot be the source of this outcome.
  const duplicateCancel = await ctx.req('POST', `/api/jobs/${before.job.id}/cancel`);
  assert.equal(duplicateCancel.statusCode, 409, duplicateCancel.body);
  assert.equal(duplicateCancel.json().error, 'JOB_NOT_ACTIVE');
  const base = await folder(ctx, file.batchId);
  const view = await folderView(ctx, base);
  assert.equal(view.files[0].jobStatus, 'cancelled');
  const manifest = await ctx.req('POST', `${base}/manifest`, { revision: view.revision, entries: [canceled(file.path)] });
  assert.equal(manifest.statusCode, 200, manifest.body);
  assert.equal(manifest.json().counts.canceled, 1);
  assert.deepEqual(await readOriginal(file.sourceId), bytes);

  // Isolated synthetic DB fixture for the otherwise unreachable ordering:
  // doc revision invalidated while its old detect job remains active, then the
  // explicit cancel API handles that latest attempt. This tests projection
  // semantics, not a claim that the preset/dictionary APIs leave jobs active.
  const race = await context('synthetic-rule-first-race');
  const raceBytes = Buffer.from('合成失效竞态 电话13700137000');
  const raceFile = await upload(race, '规则/先失效后取消.txt', raceBytes);
  const raceBefore = await document(race, raceFile.documentId);
  assert.equal(raceBefore.revision, 0);
  assert.equal(raceBefore.job.status, 'queued');
  const changed = await admin.query("UPDATE documents SET state='outdated',revision=revision+1 WHERE id=$1 AND revision=0 RETURNING revision,state", [raceFile.documentId]);
  assert.equal(changed.rowCount, 1);
  assert.equal(changed.rows[0].revision, 1);
  assert.equal((await admin.query('SELECT status FROM jobs WHERE id=$1', [raceBefore.job.id])).rows[0].status, 'queued');
  const raceCancel = await race.req('POST', `/api/jobs/${raceBefore.job.id}/cancel`);
  assert.equal(raceCancel.statusCode, 200, raceCancel.body);
  const raceAfter = await document(race, raceFile.documentId);
  assert.equal(raceAfter.revision, 1);
  assert.equal(raceAfter.state, 'outdated');
  assert.equal(raceAfter.job.status, 'cancelled');
  const raceBase = await folder(race, raceFile.batchId);
  const raceView = await folderView(race, raceBase);
  assert.equal(raceView.files[0].jobStatus, 'cancelled');
  const raceManifest = await race.req('POST', `${raceBase}/manifest`, { revision: raceView.revision, entries: [canceled(raceFile.path)] });
  assert.equal(raceManifest.statusCode, 200, raceManifest.body);
  assert.equal(raceManifest.json().counts.canceled, 1);
  assert.deepEqual(await readOriginal(raceFile.sourceId), raceBytes);
});
