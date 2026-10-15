import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {globalDb, pool, rows, scoped, sql} from '../packages/adapters/db.ts';
import {hash, passwordHash, readOriginal, unseal} from '../packages/adapters/storage.ts';
import {runProcessing} from '../packages/adapters/processing.ts';
import {appendProcessingEvent} from '../packages/adapters/processing-events.ts';
import {
  closeAndDrainAutomaticRuntimeRules,
  discardAutomaticRuntimeRules,
  type AutomaticRuntimeRuleBinding,
} from '../packages/adapters/automatic-runtime-rules.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app = await buildApp();
const admin = new pg.Pool({connectionString: process.env.MIGRATION_DATABASE_URL});
after(async () => { await app.close(); await pool.end(); await admin.end(); });

test('real detect thread drains the active generation only after its async authenticated producer and event writes finish', {timeout: 30000}, async () => {
  const tenant = randomUUID(), user = randomUUID(), username = 'runtime-bridge-' + user;
  const password = 'synthetic-runtime-bridge', origin = process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [user, tenant, username, passwordHash(password)]);
  const login = await app.inject({method: 'POST', url: '/api/login', headers: {origin}, payload: {username, password}});
  assert.equal(login.statusCode, 200, login.body);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const request = (method: any, url: string, payload?: any, binary = false) => app.inject({
    method, url, payload, headers: {origin, cookie, ...(binary ? {'content-type': 'application/octet-stream'} : {})},
  });
  const created = await request('POST', '/api/projects', {name: '实际临时规则线程窗口'});
  assert.equal(created.statusCode, 200, created.body);
  const project = created.json().id;
  async function upload(name: string, bytes: Buffer) {
    const batch = randomUUID(), requestId = randomUUID();
    const manifest = await request('POST', `/api/projects/${project}/upload-batches`, {id: batch, files: [{requestId, path: name, size: bytes.length, sha256: hash(bytes)}]});
    assert.equal(manifest.statusCode, 200, manifest.body);
    const uploaded = await request('POST', `/api/projects/${project}/files?batchId=${batch}&requestId=${requestId}`, bytes, true);
    assert.equal(uploaded.statusCode, 200, uploaded.body);
    return uploaded.json().id as string;
  }
  const pattern = 'ZXBRIDGEQ47', rawType = 'source-runtime-thread-b';
  const sourceBytes = Buffer.from(`Public synthetic ${pattern} selection.`);
  const sourceId = await upload('runtime-source.txt', sourceBytes);
  assert.equal(await tick(), true);
  const sourceResponse = await request('GET', '/api/documents/' + sourceId);
  assert.equal(sourceResponse.statusCode, 200, sourceResponse.body);
  const source = sourceResponse.json();
  assert.equal(source.state, 'review');
  const sourceBefore = (await admin.query('SELECT * FROM documents WHERE id=$1', [sourceId])).rows[0];
  const projectBefore = (await admin.query('SELECT dictionary,dictionary_revision FROM projects WHERE id=$1', [project])).rows[0];
  const targetBytes = Buffer.from(`${pattern} appears twice: ${pattern}.`);
  const targetId = await upload('runtime-target.txt', targetBytes);
  // The scheduler really claims the API-created queued job. No synthetic
  // running status, fake child or replacement detector is installed.
  const [job] = await rows(globalDb, sql`SELECT * FROM claim_job()`);
  assert.equal(job.document_id, targetId);
  assert.equal(job.status, 'running');
  assert.equal(job.runtime_rule_accepting, true);
  const target = (await admin.query('SELECT * FROM documents WHERE id=$1', [targetId])).rows[0];
  const binding: AutomaticRuntimeRuleBinding = {
    job: job.id, generation: job.generation, tenant, project, user, document: targetId,
    revision: job.revision, sourceHash: target.source_hash, contentHash: target.content_hash,
  };
  const start = source.text.indexOf(pattern);
  assert.ok(start >= 0);
  const added = {start, end: start + pattern.length, kind: '自定义', rawEntityType: rawType, decision: 'pending', sources: [{layer: 'manual', code: 'manual-selection'}]};
  const cause = {revision: source.revision, producer: 'manual-add', before: source.marks, after: [...source.marks, added], scope: 'project'};
  const endpoint = `/api/documents/${sourceId}/runtime-rules/automatic`;
  let injected = false, producerCommitted = false, eventWrites = 0, pendingCallbacks = 0, drainCalls = 0;
  const order: string[] = [];
  let result: any;
  try {
    result = await runProcessing<any>({kind: 'detect', doc: target}, {
      onEvent: async envelope => {
        pendingCallbacks++;
        try {
          if (!injected) {
            injected = true;
            order.push('producer-start');
            // Make the initial async callback outlive the short real TXT scan.
            // The parent's serial eventWrites bridge must wait for this API.
            await new Promise(resolve => setTimeout(resolve, 50));
            const delivered = await request('POST', endpoint, cause);
            assert.equal(delivered.statusCode, 200, delivered.body);
            assert.equal(delivered.json().deliveryMode, 'active-task-only');
            assert.equal(delivered.json().appliedToTasks, 1, delivered.body);
            assert.equal(delivered.json().whitelistApplied, 1, delivered.body);
            producerCommitted = true;
            order.push('producer-committed');
          }
          await scoped(user, tenant, db => appendProcessingEvent(db, binding, envelope));
          eventWrites++;
          order.push('event-' + envelope.sequence + '-committed');
        } finally { pendingCallbacks--; }
      },
      readRuntimeRules: async () => {
        drainCalls++;
        assert.equal(pendingCallbacks, 0, 'final rule window raced pending event callback');
        assert.equal(producerCommitted, true, 'final rule window raced actual producer API');
        assert.ok(eventWrites >= 1);
        order.push('final-window');
        const rules = await scoped(user, tenant, db => closeAndDrainAutomaticRuntimeRules(db, binding));
        assert.deepEqual(rules, [{entityType: rawType, pattern}]);
        return rules;
      },
    });
  } finally { await scoped(user, tenant, db => discardAutomaticRuntimeRules(db, binding)); }
  assert.equal(drainCalls, 1);
  assert.equal(pendingCallbacks, 0);
  assert.equal(unseal(result.content, `${tenant}:${project}:${targetId}`), targetBytes.toString());
  const matches = result.marks.filter((mark: any) => mark.rawEntityType === rawType);
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map((mark: any) => [mark.start, mark.end]), [
    [0, pattern.length], [targetBytes.toString().lastIndexOf(pattern), targetBytes.toString().lastIndexOf(pattern) + pattern.length],
  ]);
  assert.ok(matches.every((mark: any) => mark.decision === 'pending' && mark.sources.some((s: any) => s.code === 'runtime-whitelist')));
  const late = await request('POST', endpoint, cause);
  assert.equal(late.statusCode, 200, late.body);
  assert.equal(late.json().appliedToTasks, 0);
  assert.equal(late.json().added, false);
  assert.equal((await admin.query('SELECT count(*) FROM runtime_rule_deliveries')).rows[0].count, '0');
  assert.equal((await admin.query('SELECT count(*) FROM runtime_whitelists')).rows[0].count, '0');
  const projectAfter = (await admin.query('SELECT dictionary,dictionary_revision FROM projects WHERE id=$1', [project])).rows[0];
  assert.deepEqual(projectAfter, projectBefore);
  const sourceAfter = (await admin.query('SELECT * FROM documents WHERE id=$1', [sourceId])).rows[0];
  assert.equal(sourceAfter.revision, sourceBefore.revision);
  assert.equal(sourceAfter.content, sourceBefore.content);
  assert.deepEqual(sourceAfter.marks, sourceBefore.marks);
  assert.deepEqual(await readOriginal(sourceBefore.source_id), sourceBytes);
  assert.deepEqual(await readOriginal(target.source_id), targetBytes);
  const targetAfter = (await admin.query('SELECT * FROM documents WHERE id=$1', [targetId])).rows[0];
  assert.equal(targetAfter.revision, target.revision);
  assert.deepEqual(targetAfter.marks, target.marks);
  const claimedAfter = (await admin.query('SELECT * FROM jobs WHERE id=$1', [job.id])).rows[0];
  assert.equal(claimedAfter.generation, job.generation);
  assert.equal(claimedAfter.runtime_rule_accepting, false);
  const events = (await admin.query('SELECT sequence FROM processing_events WHERE job_id=$1 AND generation=$2 ORDER BY sequence', [job.id, job.generation])).rows;
  assert.equal(events.length, eventWrites);
  assert.deepEqual(events.map(row => row.sequence), Array.from({length: eventWrites}, (_, i) => i + 1));
  const out = '.data/research/lawbot-2026-10-15/iteration037';
  await mkdir(out, {recursive: true});
  await writeFile(`${out}/automatic-runtime-worker-actual-B-${Date.now()}.json`, JSON.stringify({
    schema: 'tuominwang.runtime-rules.actual-worker.v1', runtime: process.version,
    actualApiCreatedFilesAndSchedulerClaim: true, fakeWorker: false, fakeDetector: false,
    order, eventWrites, drainCalls, actualUnknownTypePendingMatches: matches.length,
    lateApplied: 0, temporaryDeliveries: 0, persistentWhitelist: 0,
    sourceReviewUnchanged: true, dictionaryUnchanged: true, originalBytesUnchanged: true,
    scope: 'Actual runProcessing bridge; returned detection is not a published/approved review snapshot.', competitorRuntime: 'R0',
  }, null, 2) + '\n');
});
