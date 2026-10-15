import assert from 'node:assert/strict';
import {resolve, sep} from 'node:path';
import {buildApp} from '../apps/api/main.ts';
import {pool} from '../packages/adapters/db.ts';

function requireIsolatedEnvironment() {
  const app = new URL(process.env.DATABASE_URL ?? '');
  const migration = new URL(process.env.MIGRATION_DATABASE_URL ?? '');
  assert.match(decodeURIComponent(app.pathname), /^\/tmw_test_[a-z0-9_]+$/);
  assert.equal(app.pathname, migration.pathname);
  assert.equal(app.hostname, migration.hostname);
  assert.equal(app.port, migration.port);
  const data = resolve(process.env.DATA_DIR ?? '');
  assert.ok(data.startsWith(resolve('.data/test-runs') + sep), 'DATA_DIR must be an isolated test-run directory');
}

requireIsolatedEnvironment();
const app = await buildApp();
process.send?.({ready: true});
process.once('message', async (input: any) => {
  try {
    const origin = process.env.APP_ORIGIN!;
    const login = await app.inject({method: 'POST', url: '/api/login', headers: {origin}, payload: {username: input.username, password: input.password}});
    assert.equal(login.statusCode, 200, login.body);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    process.send?.({started: true});
    const response = await app.inject({method: 'POST', url: '/api/portable/import', headers: {origin, cookie}, payload: input.payload});
    process.send?.({status: response.statusCode, body: response.body});
  } catch (error) {
    process.send?.({error: (error as Error).stack ?? String(error)});
    process.exitCode = 1;
  } finally {
    await app.close();
    await pool.end();
    process.disconnect?.();
  }
});
