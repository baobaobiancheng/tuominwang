import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { passwordHash, seal } from '../packages/adapters/storage.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
const origin = process.env.APP_ORIGIN!;
after(async () => { await app.close(); await pool.end(); await admin.end(); });

async function account() {
  const user = randomUUID(), tenant = randomUUID();
  const username = `isolated-profile-${user}`;
  const password = 'synthetic-profile-pass';
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [user, tenant, username, passwordHash(password)]);
  const login = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { username, password } });
  assert.equal(login.statusCode, 200);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const request = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: Record<string, unknown>) => app.inject({ method, url, payload, headers: { origin, cookie } });
  return { user, tenant, request };
}

test('damaged profile is isolated, broken default is repaired, and records and tenants stay intact', async () => {
  const owner = await account(), foreign = await account();
  const good = await owner.request('POST', '/api/presets/profiles', { name: '有效方案' });
  const bad = await owner.request('POST', '/api/presets/profiles', { name: '待损坏方案' });
  assert.equal(good.statusCode, 200, good.body);
  assert.equal(bad.statusCode, 200, bad.body);
  const goodId = good.json().settings.id as string, badId = bad.json().settings.id as string;
  const baseline = await owner.request('GET', '/api/presets/profiles');
  assert.equal(baseline.statusCode, 200);
  assert.ok(baseline.json().items.some((row: any) => row.settings.id === goodId));
  const beforePreference = await owner.request('GET', '/api/presets/preferences');
  const goodDefault = await owner.request('PUT', '/api/presets/preferences', { revision: beforePreference.json().revision, defaultProfileId: goodId, activeRuleSetId: null });
  assert.equal(goodDefault.statusCode, 200);
  const existingProject = await owner.request('POST', '/api/projects', { name: '原有方案快照', applyDefaultPresets: true });
  assert.equal(existingProject.statusCode, 200);
  const originals = await admin.query('SELECT id,payload,revision FROM redaction_presets WHERE id=ANY($1::uuid[]) ORDER BY id', [[goodId, badId]]);
  assert.equal(originals.rows.length, 2);
  const originalBad = originals.rows.find((row: any) => row.id === badId).payload;

  const variants = [
    { name: 'invalid-aead', value: 'invalid-aead', status: 500, error: 'INTERNAL_ERROR' },
    { name: 'valid-aead-invalid-schema', value: seal('{}', `${owner.tenant}:${owner.user}:preset:${badId}`), status: 400, error: 'INVALID_INPUT' },
    { name: 'valid-aead-wrong-payload-id', value: seal(JSON.stringify({ ...bad.json().settings, id: goodId }), `${owner.tenant}:${owner.user}:preset:${badId}`), status: 500, error: 'INTERNAL_ERROR' },
    { name: 'valid-aead-system-flag', value: seal(JSON.stringify({ ...bad.json().settings, source: 'system', readonly: true }), `${owner.tenant}:${owner.user}:preset:${badId}`), status: 500, error: 'INTERNAL_ERROR' },
  ];
  for (const variant of variants) {
    await admin.query('UPDATE redaction_presets SET payload=$2 WHERE id=$1', [badId, originalBad]);
    const currentPreference = await owner.request('GET', '/api/presets/preferences');
    assert.equal(currentPreference.statusCode, 200);
    const selected = await owner.request('PUT', '/api/presets/preferences', { revision: currentPreference.json().revision, defaultProfileId: badId, activeRuleSetId: null });
    assert.equal(selected.statusCode, 200, selected.body);
    await admin.query('UPDATE redaction_presets SET payload=$2 WHERE id=$1', [badId, variant.value]);
    // Exercise default repair directly; it must not depend on visiting the list first.
    const projectName = `损坏默认方案-${variant.name}`;
    const defaultProject = await owner.request('POST', '/api/projects', { name: projectName, applyDefaultPresets: true });
    assert.equal(defaultProject.statusCode, 200, `${variant.name}: ${defaultProject.body}`);
    const policy = await owner.request('GET', `/api/projects/${defaultProject.json().id}/presets`);
    assert.equal(policy.statusCode, 200);
    assert.equal(policy.json().profile.settings.id, 'system_default');
    const list = await owner.request('GET', '/api/presets/profiles');
    assert.equal(list.statusCode, 200, `${variant.name}: ${list.body}`);
    assert.equal(list.json().unavailableCount, 1);
    assert.ok(list.json().items.some((row: any) => row.settings.id === goodId));
    assert.ok(list.json().items.every((row: any) => row.settings.id !== badId));
    assert.equal(list.json().preferences.settings.defaultProfileId, 'system_default');
    const stillGood = await owner.request('GET', `/api/presets/profiles/${goodId}`);
    assert.equal(stillGood.statusCode, 200);
    assert.equal(stillGood.json().settings.name, '有效方案');
    const stillBad = await owner.request('GET', `/api/presets/profiles/${badId}`);
    assert.equal(stillBad.statusCode, variant.status);
    assert.equal(stillBad.json().error, variant.error);
    const applyBad = await owner.request('PUT', `/api/projects/${defaultProject.json().id}/presets`, { revision: policy.json().revision, profileId: badId, profileRevision: 1, rulesetId: null });
    assert.equal(applyBad.statusCode, variant.status);
    assert.equal(applyBad.json().error, variant.error);
    const foreignList = await foreign.request('GET', '/api/presets/profiles');
    assert.equal(foreignList.statusCode, 200);
    assert.ok(foreignList.json().items.every((row: any) => row.settings.id !== goodId && row.settings.id !== badId));
    const preference = await owner.request('GET', '/api/presets/preferences');
    assert.equal(preference.statusCode, 200);
    assert.equal(preference.json().settings.defaultProfileId, 'system_default');
    assert.equal(preference.json().revision, selected.json().revision + 1);
    const stalePreferenceWrite = await owner.request('PUT', '/api/presets/preferences', { revision: selected.json().revision, defaultProfileId: goodId, activeRuleSetId: null });
    assert.equal(stalePreferenceWrite.statusCode, 409);
    assert.equal((await admin.query('SELECT count(*)::int AS count FROM projects WHERE name=$1', [projectName])).rows[0].count, 1);
    const preservedPolicy = await owner.request('GET', `/api/projects/${existingProject.json().id}/presets`);
    assert.equal(preservedPolicy.statusCode, 200);
    assert.equal(preservedPolicy.json().profile.settings.id, goodId);
    const rows = await admin.query('SELECT id,payload,revision FROM redaction_presets WHERE id=ANY($1::uuid[]) ORDER BY id', [[goodId, badId]]);
    assert.equal(rows.rows.find((row: any) => row.id === goodId)?.payload, originals.rows.find((row: any) => row.id === goodId)?.payload);
    assert.equal(rows.rows.find((row: any) => row.id === goodId)?.revision, 1);
    assert.equal(rows.rows.find((row: any) => row.id === badId)?.payload, variant.value);
    assert.equal(rows.rows.find((row: any) => row.id === badId)?.revision, 1);
    process.stdout.write(`${variant.name}: owner_list=200, default_project=200, valid_get=200, damaged_get=${variant.status}, foreign_list=200, no_profile_writeback=true\n`);
  }
  const key = process.env.DATA_KEY!;
  process.env.DATA_KEY = `${key[0] === '0' ? '1' : '0'}${key.slice(1)}`;
  try {
    const unavailable = await owner.request('GET', '/api/presets/profiles');
    assert.equal(unavailable.statusCode, 500);
  } finally { process.env.DATA_KEY = key; }
});
