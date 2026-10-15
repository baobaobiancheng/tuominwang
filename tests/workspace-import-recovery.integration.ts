import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {chmod, readdir} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {pool, scoped, rows, sql, globalDb} from '../packages/adapters/db.ts';
import {passwordHash, hash, readOriginal, writeOriginal} from '../packages/adapters/storage.ts';
import {beginWorkspaceImport, cleanupWorkspaceImport, type WorkspaceImportJournal} from '../packages/adapters/workspace-import.ts';
import {writeNativePortable} from '../packages/core/native-portable.ts';
import {tick} from '../apps/worker/main.ts';

// This file is intended to live at tests/ in the application tree and to run
// through tests/run-isolated.ts. Reject accidental execution against .env.
function isolatedEnvironment() {
  const app = new URL(process.env.DATABASE_URL ?? '');
  const migration = new URL(process.env.MIGRATION_DATABASE_URL ?? '');
  const name = decodeURIComponent(app.pathname);
  assert.match(name, /^\/tmw_test_[a-z0-9_]+$/, 'a dedicated tmw_test database is required');
  assert.equal(app.pathname, migration.pathname);
  assert.equal(app.hostname, migration.hostname);
  assert.equal(app.port, migration.port);
  const dataDir = resolve(process.env.DATA_DIR ?? '');
  assert.ok(dataDir.startsWith(resolve('.data/test-runs') + sep), 'DATA_DIR must be an isolated test-run directory');
  return {name: name.slice(1), dataDir};
}

const {name: databaseName, dataDir} = isolatedEnvironment();
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until<T>(observe: () => Promise<T | undefined>, timeout = 20_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await observe();
    if (value !== undefined) return value;
    await pause(25);
  }
  throw new Error('OBSERVATION_TIMEOUT');
}
const objectName = /^[a-f0-9-]{36}$/;
async function entries(path: string) {
  try { return (await readdir(path)).sort(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
async function objects() { return (await entries(dataDir)).filter(name => objectName.test(name)); }
async function journals() { return (await entries(resolve(dataDir, '.workspace-imports'))).filter(name => objectName.test(name)); }
async function ownerTree() {
  const result: Record<string, string[]> = {};
  for (const owner of await entries(resolve(dataDir, '.owners'))) {
    result[owner] = await entries(resolve(dataDir, '.owners', owner));
  }
  return result;
}
async function drainWorker() {
  for (let i = 0; i < 32; i++) if (!await tick()) return;
  throw new Error('WORKER_DID_NOT_DRAIN');
}
function sourceSnapshots() {
  const documents = [0, 1].map(index => {
    const id = randomUUID(), content = `合成客户${index === 0 ? '甲' : '乙'}`;
    const source = Buffer.from(content), sourceEntry = `sources/${id}/original.txt`;
    return {document: {id, name: `source-${index + 1}.txt`, format: 'txt', content,
      contentHash: hash(content), sourceEntry, sourceHash: hash(source), marks: [], revision: 0,
      state: 'review', anchors: [], coverage: [], pages: [], pageReview: null,
      recognition: {}, nerEnabled: false}, source};
  });
  const good: any = {format: 'tuominwang-workspace', schemaVersion: 1,
    project: {name: 'synthetic import recovery', dictionary: [], dictionaryRevision: 0, presetPolicy: null, presetRevision: 0},
    documents: documents.map(item => item.document), mappings: [], snapshots: []};
  const bad: any = structuredClone(good);
  const second = bad.documents[1];
  second.entityCorrectionsArchive = {current: true, frame: {version: 1, sourceHash: second.sourceHash,
    contentHash: second.contentHash, capturedRevision: 0,
    entries: [{id: 'synthetic-invalid-entry', recognizedText: null}]}};
  return {good, bad, sources: new Map(documents.map(item => [item.document.sourceEntry, item.source] as const))};
}

test('workspace import recovery preserves committed data and removes only proven rollback material', {timeout: 240_000}, async () => {
  const admin = new pg.Pool({connectionString: process.env.MIGRATION_DATABASE_URL});
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  let barrier: pg.Client | undefined, acknowledgement: pg.Client | undefined;
  let importRequest: Promise<any> | undefined, lockRequest: Promise<unknown> | undefined;
  let child: ChildProcess | undefined;
  let barrierHeld = false, acknowledgementHeld = false, triggerInstalled = false;
  const log = (caseName: string, detail: object = {}) => console.log(JSON.stringify({case: caseName, status: 'pass', ...detail}));
  const unlockBarrier = async () => {
    if (barrier && barrierHeld) { await barrier.query('SELECT pg_advisory_unlock(7843, 51)'); barrierHeld = false; }
  };
  const unlockAcknowledgement = async (id: string) => {
    if (acknowledgement && acknowledgementHeld) {
      await acknowledgement.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [`workspace-import:${id}`]);
      acknowledgementHeld = false;
    }
  };
  let activeImportId: string | undefined;
  try {
    assert.equal((await admin.query('SELECT current_database() AS name')).rows[0].name, databaseName);
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, databaseName);
    app = await buildApp();
    const tenant = randomUUID(), user = randomUUID(), username = `import-recovery-${user}`;
    const password = 'synthetic-import-recovery', origin = process.env.APP_ORIGIN!;
    await admin.query('INSERT INTO users VALUES($1, $2, $3, $4)', [user, tenant, username, passwordHash(password)]);
    const login = await app.inject({method: 'POST', url: '/api/login', headers: {origin}, payload: {username, password}});
    assert.equal(login.statusCode, 200, login.body);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const request = (payload: object) => app!.inject({method: 'POST', url: '/api/portable/import', headers: {origin, cookie}, payload});
    const {good, bad, sources} = sourceSnapshots();
    const transferPassword = 'synthetic-transfer-password';
    const [goodBytes, badBytes] = await Promise.all([
      writeNativePortable(good, sources, {password: transferPassword}),
      writeNativePortable(bad, sources, {password: transferPassword})]);
    const payload = (bytes: Buffer) => ({name: 'synthetic import recovery', password: transferPassword, bytesBase64: bytes.toString('base64')});
    const goodPayload = payload(goodBytes), badPayload = payload(badBytes);
    const rowCounts = async () => (await admin.query('SELECT (SELECT count(*) FROM projects)::int AS projects, (SELECT count(*) FROM documents)::int AS documents')).rows[0];
    const beforeGood = await rowCounts();
    const valid = await request(goodPayload);
    assert.equal(valid.statusCode, 200, valid.body);
    const afterGood = await rowCounts();
    assert.equal(afterGood.projects, beforeGood.projects + 1);
    assert.equal(afterGood.documents, beforeGood.documents + 2);
    await drainWorker();
    const beforeBad = {rows: await rowCounts(), objects: await objects(), owners: await ownerTree(), journals: await journals()};
    const invalid = await request(badPayload);
    assert.equal(invalid.statusCode, 400, invalid.body);
    assert.equal(invalid.json().error, 'ENTITY_CORRECTION_INVALID');
    assert.deepEqual({rows: await rowCounts(), objects: await objects(), owners: await ownerTree(), journals: await journals()}, beforeBad);
    log('valid native TXT control and invalid second correction archive rollback', {validStatus: 200, invalidStatus: 400});

    const originalRows = (await admin.query('SELECT id, source_id, source_hash FROM documents ORDER BY id')).rows;
    const originalHashes = new Map(await Promise.all(originalRows.map(async row => [row.source_id, hash(await readOriginal(row.source_id))] as const)));
    async function rolledBack(action: (journal: WorkspaceImportJournal) => Promise<void>) {
      const journal: WorkspaceImportJournal = {version: 1, id: randomUUID(), tenant, user,
        project: randomUUID(), planned: [randomUUID()], owners: []};
      await assert.rejects(() => scoped(user, tenant, async db => {
        await rows(db, sql`INSERT INTO projects(id,tenant_id,owner_id,name) VALUES(${journal.project},${tenant},${user},'synthetic rollback')`);
        await beginWorkspaceImport(db, journal);
        await action(journal);
        throw new Error('SYNTHETIC_ROLLBACK');
      }));
      return journal;
    }

    const collision = await rolledBack(async journal => {
      await writeOriginal(originalRows[0].source_id, Buffer.from('must never overwrite'), journal.planned[0]);
    });
    assert.equal(await cleanupWorkspaceImport(collision.id), 'purged');
    assert.equal(hash(await readOriginal(originalRows[0].source_id)), originalHashes.get(originalRows[0].source_id));
    log('flat object ID collision preserves existing original');

    const ownerCollision: WorkspaceImportJournal = {version: 1, id: randomUUID(), tenant, user,
      project: randomUUID(), planned: [randomUUID(), originalRows[0].id], owners: []};
    await assert.rejects(() => scoped(user, tenant, async db => {
      await rows(db, sql`INSERT INTO projects(id,tenant_id,owner_id,name) VALUES(${ownerCollision.project},${tenant},${user},'synthetic owner collision')`);
      await beginWorkspaceImport(db, ownerCollision);
    }));
    assert.equal(await cleanupWorkspaceImport(ownerCollision.id), 'purged');
    assert.equal(hash(await readOriginal(originalRows[0].source_id)), originalHashes.get(originalRows[0].source_id));
    log('owner directory collision preserves existing original');

    const io = await rolledBack(async journal => {
      await writeOriginal(randomUUID(), Buffer.from('synthetic orphan for IO failure'), journal.planned[0]);
    });
    await chmod(dataDir, 0o500);
    try {
      assert.equal(await cleanupWorkspaceImport(io.id), 'error');
      assert.ok((await journals()).includes(io.id));
    } finally { await chmod(dataDir, 0o700); }
    assert.equal(await cleanupWorkspaceImport(io.id), 'purged');
    log('cleanup IO error retains journal and retry succeeds');

    barrier = new pg.Client({connectionString: process.env.MIGRATION_DATABASE_URL});
    await barrier.connect();
    await admin.query("CREATE FUNCTION synthetic_import_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(7843,51); RETURN NEW; END $$; CREATE TRIGGER synthetic_import_barrier BEFORE INSERT ON workspace_import_commits FOR EACH ROW EXECUTE FUNCTION synthetic_import_barrier()");
    triggerInstalled = true;
    await barrier.query('SELECT pg_advisory_lock(7843, 51)'); barrierHeld = true;
    importRequest = Promise.resolve(request(goodPayload));
    activeImportId = await until(async () => {
      const ids = await journals();
      const blocked = (await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE 'SELECT record_workspace_import_commit%'")).rows[0].n;
      return ids.length === 1 && blocked === 1 ? ids[0] : undefined;
    });
    const activeObjects = await objects();
    assert.ok(activeObjects.length > beforeBad.objects.length);
    assert.equal(await cleanupWorkspaceImport(activeImportId), 'active');
    assert.deepEqual(await objects(), activeObjects);
    log('active import lock prevents deletion while witness insert is blocked');

    acknowledgement = new pg.Client({connectionString: process.env.MIGRATION_DATABASE_URL});
    await acknowledgement.connect();
    lockRequest = acknowledgement.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [`workspace-import:${activeImportId}`]);
    await pause(50);
    await unlockBarrier();
    await lockRequest; acknowledgementHeld = true;
    const successful = await importRequest;
    assert.equal(successful.statusCode, 200, successful.body);
    assert.ok((await journals()).includes(activeImportId));
    await admin.query('UPDATE organization_members SET enabled=false WHERE user_id=$1', [user]);
    const hidden = await scoped(user, tenant, db => rows(db, sql`SELECT id FROM projects WHERE id=${successful.json().id}`));
    assert.equal(hidden.length, 0);
    await unlockAcknowledgement(activeImportId);
    assert.equal(await cleanupWorkspaceImport(activeImportId), 'committed');
    assert.deepEqual(await objects(), activeObjects);
    await admin.query('UPDATE organization_members SET enabled=true WHERE user_id=$1', [user]);
    await drainWorker();
    log('commit witness survives lost acknowledgement and disabled user RLS');
    activeImportId = undefined;

    await barrier.query('SELECT pg_advisory_lock(7843, 51)'); barrierHeld = true;
    const beforeCrash = {objects: await objects(), rows: await rowCounts()};
    const childPath = fileURLToPath(new URL('./workspace-import-recovery.child.ts', import.meta.url));
    child = spawn(process.execPath, ['--import', 'tsx', childPath], {env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
    let childLog = '';
    child.stdout?.on('data', chunk => { childLog += chunk.toString(); });
    child.stderr?.on('data', chunk => { childLog += chunk.toString(); });
    const [ready] = await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(([code, signal]) => { throw new Error(`CHILD_EXITED_BEFORE_READY:${code}:${signal}:${childLog}`); }),
    ]);
    assert.equal(ready.ready, true, childLog);
    child.send({username, password, payload: goodPayload});
    const crashedId = await until(async () => {
      const ids = await journals();
      if (ids.length !== 1) return undefined;
      const blocked = (await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory' AND query LIKE 'SELECT record_workspace_import_commit%'")).rows[0].n;
      return blocked === 1 && (await objects()).length > beforeCrash.objects.length ? ids[0] : undefined;
    });
    assert.equal(await cleanupWorkspaceImport(crashedId), 'active');
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    const [, signal] = await exited;
    assert.equal(signal, 'SIGKILL', childLog);
    child = undefined;
    await unlockBarrier();
    await until(async () => {
      const result = await cleanupWorkspaceImport(crashedId);
      if (result === 'active') return undefined;
      assert.equal(result, 'purged');
      return true;
    });
    assert.deepEqual(await objects(), beforeCrash.objects);
    assert.deepEqual(await rowCounts(), beforeCrash.rows);
    log('real child SIGKILL before SQL commit rolls back rows and owned objects', {signal});

    await admin.query('DROP TRIGGER synthetic_import_barrier ON workspace_import_commits; DROP FUNCTION synthetic_import_barrier()');
    triggerInstalled = false;
    await barrier.end(); barrier = undefined;
    const idle = await rolledBack(async journal => {
      await writeOriginal(randomUUID(), Buffer.from('synthetic idle worker cleanup'), journal.planned[0]);
    });
    assert.equal((await rows(globalDb, sql`SELECT worker_pending() AS pending`))[0].pending, false);
    assert.equal(await tick(), false);
    assert.ok(!(await journals()).includes(idle.id));
    log('idle worker scans import journals before worker_pending returns false');

    for (const [id, expected] of originalHashes) assert.equal(hash(await readOriginal(id)), expected);
    assert.deepEqual(await journals(), []);
    log('all original ciphertext remains readable and no import journal remains');
  } finally {
    // Release every SQL barrier before waiting for any API request or app.close().
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited.catch(() => {});
    }
    await unlockBarrier().catch(() => {});
    await barrier?.end().catch(() => {});
    await lockRequest?.catch(() => {});
    if (activeImportId) await unlockAcknowledgement(activeImportId).catch(() => {});
    await acknowledgement?.end().catch(() => {});
    await importRequest?.catch(() => {});
    await chmod(dataDir, 0o700).catch(() => {});
    if (triggerInstalled) await admin.query('DROP TRIGGER IF EXISTS synthetic_import_barrier ON workspace_import_commits; DROP FUNCTION IF EXISTS synthetic_import_barrier()').catch(() => {});
    await app?.close();
    await pool.end();
    await admin.end();
  }
});
