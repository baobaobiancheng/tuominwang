// Candidate-only isolated integration. Run through this tree's standard runner
// after migration 045; see import-api-attempt02.log for the completed run.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { tick } from '../apps/worker/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { hash, passwordHash, readOriginal, unseal } from '../packages/adapters/storage.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(new URL(process.env.MIGRATION_DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(process.env.DATA_DIR?.includes('/.data/test-runs/'));

const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
after(async () => { await app.close(); await pool.end(); await admin.end(); });

test('per-file import routes reach first worker detect, stay immutable across resume/idempotent retries, and reject cross-batch route reuse', { timeout: 120000 }, async () => {
  const tenant = randomUUID(), ownerId = randomUUID(), ownerName = `import-owner-${ownerId}`, password = 'synthetic-import-route-password', origin = process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [ownerId, tenant, ownerName, passwordHash(password)]);

  async function session(username: string) {
    const login = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { username, password } });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    return (method: string, url: string, payload?: any, binary = false) => app.inject({
      method: method as any, url, payload,
      headers: { origin, cookie, ...(binary ? { 'content-type': 'application/octet-stream' } : {}) },
    });
  }

  const owner = await session(ownerName), memberName = `import-uploader-${randomUUID()}`;
  const invited = await owner('POST', '/api/organization/members', { username: memberName, password });
  assert.equal(invited.statusCode, 200, invited.body);
  const memberId = invited.json().id, uploader = await session(memberName);
  const project = (await owner('POST', '/api/projects', { name: '合成逐文件类型上传验证' })).json().id as string;

  // A route-gated exact ruleset entry makes the initial worker consumer observable
  // independently of recognition.documentType, which is also a stored echo field.
  const createdRules = await owner('POST', '/api/presets/rulesets', { name: `合成合同路由-${randomUUID()}` });
  assert.equal(createdRules.statusCode, 200, createdRules.body);
  const rules = createdRules.json(), entryId = randomUUID(), now = new Date().toISOString();
  const marker = `合成路由专用命中-${randomUUID()}`;
  const entry = {
    id: entryId, pattern: marker, normalizedPattern: marker,
    entityType: 'synthetic_contract_route', kind: 'forceDetect', matchMode: 'exact', enabled: true,
    source: 'manual', createdAt: now, updatedAt: now, materialRouteKeys: ['contract'],
  };
  const savedRules = await owner('PUT', `/api/presets/rulesets/${rules.settings.id}`, {
    revision: rules.revision, settings: { ...rules.settings, entries: [entry] },
  });
  assert.equal(savedRules.statusCode, 200, savedRules.body);
  const projectPolicy = await owner('GET', `/api/projects/${project}/presets`);
  assert.equal(projectPolicy.statusCode, 200, projectPolicy.body);
  const applied = await owner('PUT', `/api/projects/${project}/presets`, {
    revision: projectPolicy.json().revision,
    profileId: projectPolicy.json().profile?.settings.id ?? null,
    ...(projectPolicy.json().profile ? { profileRevision: projectPolicy.json().profile.revision } : {}),
    rulesetId: savedRules.json().settings.id, rulesetRevision: savedRules.json().revision,
  });
  assert.equal(applied.statusCode, 200, applied.body);
  const projectPolicyAfterSetup = applied.json();

  const memberGrant = await owner('PUT', `/api/projects/${project}/members/${memberId}`, {
    revision: null, permissions: ['upload', 'view_original'],
  });
  assert.equal(memberGrant.statusCode, 200, memberGrant.body);

  const bytes = Buffer.from(`合成公开材料\n${marker}\n`, 'utf8');
  const batchId = randomUUID(), requestIds = [randomUUID(), randomUUID()];
  const files = [
    { requestId: requestIds[0], path: '合成/合同.txt', size: bytes.length, sha256: hash(bytes), documentType: 'contract' },
    { requestId: requestIds[1], path: '合成/一般材料.txt', size: bytes.length, sha256: hash(bytes), documentType: 'general' },
  ];
  const manifest = { id: batchId, files };
  const base = `/api/projects/${project}/upload-batches`;
  assert.equal((await uploader('POST', base, manifest)).statusCode, 200);
  assert.equal((await uploader('POST', base, manifest)).statusCode, 200, 'identical manifest retry must be idempotent');
  const pendingBatch = await uploader('GET', `${base}/${batchId}`);
  assert.equal(pendingBatch.statusCode, 200, pendingBatch.body);
  assert.deepEqual(pendingBatch.json().files.map((f: any) => f.documentType), ['contract', 'general']);
  assert.deepEqual(pendingBatch.json().files.map((f: any) => f.documentId), [null, null]);

  const uploaded: string[] = [];
  for (const item of files) {
    const response = await uploader('POST', `/api/projects/${project}/files?batchId=${batchId}&requestId=${item.requestId}`, bytes, true);
    assert.equal(response.statusCode, 200, response.body);
    uploaded.push(response.json().id as string);
  }
  // Retrying either manifest entry and the immutable whole manifest cannot alter its route.
  assert.equal((await uploader('POST', base, manifest)).statusCode, 200);
  for (let i = 0; i < files.length; i++) {
    const retry = await uploader('POST', `/api/projects/${project}/files?batchId=${batchId}&requestId=${files[i]!.requestId}`, bytes, true);
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().id, uploaded[i]);
  }
  const driftedManifest = { id: batchId, files: files.map((f: any, i: number) => i === 0 ? { ...f, documentType: 'general' } : f) };
  const drift = await uploader('POST', base, driftedManifest);
  assert.equal(drift.statusCode, 409, drift.body);
  assert.equal(drift.json().error, 'IDEMPOTENCY_CONFLICT');

  // Conflict case: same project/request ID/path/bytes in a new batch, but a different route.
  // It must fail closed and must not make the new manifest appear to own the old document.
  const conflictBatchId = randomUUID(), conflictManifest = {
    id: conflictBatchId,
    files: [{ ...files[0]!, documentType: 'general' }],
  };
  assert.equal((await uploader('POST', base, conflictManifest)).statusCode, 200);

  // Finish the two first-detect jobs before reading their persisted recognition snapshots.
  assert.equal(await tick(), true);
  assert.equal(await tick(), true);
  const views = await Promise.all(uploaded.map(id => uploader('GET', `/api/documents/${id}`)));
  for (const view of views) {
    assert.equal(view.statusCode, 200, view.body);
    assert.ok(!view.json().permissions.includes('review'), 'uploader must not gain review permission');
  }
  const contractView = views[0]!.json(), generalView = views[1]!.json();
  assert.equal(contractView.job.status, 'succeeded', JSON.stringify(contractView.job));
  assert.equal(generalView.job.status, 'succeeded', JSON.stringify(generalView.job));
  assert.equal(contractView.revision, 0);
  assert.equal(generalView.revision, 0);
  const routeRecognition=await admin.query('SELECT id,recognition FROM documents WHERE id=ANY($1::uuid[])',[uploaded]);
  const recognitionById=new Map(routeRecognition.rows.map(row=>[row.id,row.recognition]));
  assert.equal(recognitionById.get(uploaded[0]).documentType,'contract');
  assert.equal(recognitionById.get(uploaded[1]).documentType,'general');
  const contractMark = contractView.marks.find((mark: any) => contractView.text.slice(mark.start, mark.end) === marker && mark.rawEntityType === 'synthetic_contract_route');
  assert.ok(contractMark, 'contract route should run the contract-only force-detect consumer on the first detect');
  assert.ok(contractMark.sources.some((source: any) => source.code === `ruleset-force-detect:${entryId}`));
  assert.ok(!generalView.marks.some((mark: any) => generalView.text.slice(mark.start, mark.end) === marker && mark.rawEntityType === 'synthetic_contract_route'), 'general route must not consume contract-only rule');

  const stored = await admin.query(`SELECT id,request_id,source_id,source_hash,source_bytes,source_format,source_name,revision,document_policy_revision,document_policy,is_batch,import_document_type,state FROM documents WHERE id=ANY($1::uuid[]) ORDER BY id`, [uploaded]);
  assert.equal(stored.rowCount, 2);
  const byRequest = new Map(stored.rows.map(row => [row.request_id, row]));
  for (let i = 0; i < files.length; i++) {
    const row = byRequest.get(files[i]!.requestId)!;
    assert.equal(row.revision, 0, 'first detect must not synthesize a config-save revision');
    assert.equal(row.document_policy_revision, 1);
    assert.equal(row.state, 'review');
    assert.equal(row.import_document_type, files[i]!.documentType);
    assert.equal(row.is_batch, true);
    assert.equal(row.source_format, 'txt');
    assert.equal(row.source_hash, hash(bytes));
    assert.equal(Number(row.source_bytes), bytes.length);
    assert.deepEqual(await readOriginal(row.source_id), bytes);
    const aad = `${tenant}:${project}:${row.id}:document-policy`;
    const policy = JSON.parse(unseal(row.document_policy, aad));
    assert.equal(policy.revision, 1);
    assert.equal(policy.configuration.documentType, files[i]!.documentType);
    assert.ok(policy.baseProfile, 'material policy retains its project/system base profile snapshot');
    assert.equal(policy.ruleset?.id, savedRules.json().settings.id);
  }

  const beforeConflict = await admin.query('SELECT id,request_id,source_id,revision,document_policy_revision,document_policy,source_hash,source_bytes,import_document_type FROM documents WHERE id=ANY($1::uuid[]) ORDER BY request_id', [uploaded]);
  const jobsBeforeConflict = await admin.query('SELECT id,document_id,kind,status,attempt FROM jobs WHERE document_id=ANY($1::uuid[]) ORDER BY document_id,id', [uploaded]);
  const conflict = await uploader('POST', `/api/projects/${project}/files?batchId=${conflictBatchId}&requestId=${requestIds[0]}`, bytes, true);
  assert.equal(conflict.statusCode, 409, conflict.body);
  assert.equal(conflict.json().error, 'IDEMPOTENCY_CONFLICT');
  const afterConflict = await admin.query('SELECT id,request_id,source_id,revision,document_policy_revision,document_policy,source_hash,source_bytes,import_document_type FROM documents WHERE id=ANY($1::uuid[]) ORDER BY request_id', [uploaded]);
  assert.deepEqual(afterConflict.rows, beforeConflict.rows, 'conflict must not alter either material snapshot or revision');
  assert.deepEqual((await admin.query('SELECT id,document_id,kind,status,attempt FROM jobs WHERE document_id=ANY($1::uuid[]) ORDER BY document_id,id', [uploaded])).rows,
    jobsBeforeConflict.rows, 'cross-batch idempotency conflict must not create or mutate either file job');
  for (const row of afterConflict.rows) assert.deepEqual(await readOriginal(row.source_id), bytes,
    'the conflict must leave every original byte sequence unchanged');
  const conflictBatch = await uploader('GET', `${base}/${conflictBatchId}`);
  assert.deepEqual(conflictBatch.json().files.map((f: any) => f.documentId), [null], 'different route must not falsely resolve to the earlier material');
  assert.equal(conflictBatch.json().files[0].documentType, 'general');
  const originalBatchAfter = await uploader('GET', `${base}/${batchId}`);
  assert.deepEqual(originalBatchAfter.json().files.map((f: any) => f.documentId), uploaded);
  assert.deepEqual(originalBatchAfter.json().files.map((f: any) => f.documentType), ['contract', 'general']);
  const projectPolicyAfterUpload = await owner('GET', `/api/projects/${project}/presets`);
  assert.deepEqual(projectPolicyAfterUpload.json(), projectPolicyAfterSetup, 'per-file routes must not rewrite the project preset');
});
