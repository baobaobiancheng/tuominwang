// Candidate for tests/mcp-profile-recovery.integration.ts. Not wired into product tree.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { registerMcpRoutes } from '../apps/api/mcp.ts';
import { applyDocumentConfiguration } from '../apps/api/document-policy.ts';
import { tick } from '../apps/worker/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { passwordHash } from '../packages/adapters/storage.ts';
import { MCP_PROTOCOL } from '../packages/core/mcp-tools.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
if (!app.hasRoute({ method: 'POST', url: '/api/mcp' })) registerMcpRoutes(app, applyDocumentConfiguration);
const origin = process.env.APP_ORIGIN!;
after(async () => { await app.close(); await pool.end(); await admin.end(); });

async function account() {
  const user = randomUUID(), tenant = randomUUID(), password = 'synthetic-mcp-recovery-password';
  const username = `mcp-profile-recovery-${user}`;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [user, tenant, username, passwordHash(password)]);
  const login = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { username, password } });
  assert.equal(login.statusCode, 200);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const request = (method: string, url: string, payload?: Record<string,unknown>, extra: Record<string,string> = {}) =>
    app.inject({ method: method as 'GET' | 'POST' | 'PUT', url, payload, headers: { origin, cookie, ...extra } });
  return { user, tenant, request };
}

async function mcp(actor: Awaited<ReturnType<typeof account>>) {
  let rpc = 0;
  const init = await actor.request('POST', '/api/mcp', { jsonrpc: '2.0', id: ++rpc, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL, clientInfo: { name: 'codex', version: '1' } } });
  assert.equal(init.statusCode, 200, init.body);
  const headers = { 'mcp-session-id': String(init.headers['mcp-session-id']), 'mcp-protocol-version': MCP_PROTOCOL };
  const initialized = await actor.request('POST', '/api/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, headers);
  assert.equal(initialized.statusCode, 202, initialized.body);
  return async (name: string, args: Record<string,unknown>) => {
    const response = await actor.request('POST', '/api/mcp', { jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } }, headers);
    assert.equal(response.statusCode, 200, response.body);
    return response.json().result;
  };
}

const consent = { allowRedactionPath: true, allowRestorePath: false, allowSanitizedDelivery: false, autoEnterReview: false, createExchangeFolder: true, autoRestoreAfterValidation: false };

test('MCP profile resolution isolates a damaged peer and keeps explicit selection fail closed', async () => {
  const owner = await account(), foreign = await account();
  const good = await owner.request('POST', '/api/presets/profiles', { name: 'MCP有效方案' });
  const bad = await owner.request('POST', '/api/presets/profiles', { name: 'MCP损坏方案' });
  assert.equal(good.statusCode, 200, good.body); assert.equal(bad.statusCode, 200, bad.body);
  const goodId = good.json().settings.id as string, badId = bad.json().settings.id as string;
  const selected = await owner.request('GET', '/api/presets/preferences');
  assert.equal(selected.statusCode, 200);
  const setDefault = await owner.request('PUT', '/api/presets/preferences', { revision: selected.json().revision, defaultProfileId: badId, activeRuleSetId: null });
  assert.equal(setDefault.statusCode, 200, setDefault.body);
  const broken = 'invalid-aead';
  await admin.query('UPDATE redaction_presets SET payload=$2 WHERE id=$1', [badId, broken]);
  const ownerProject = await owner.request('POST', '/api/projects', { name: 'MCP方案恢复项目' });
  const foreignProject = await foreign.request('POST', '/api/projects', { name: 'MCP隔离项目' });
  assert.equal(ownerProject.statusCode, 200, ownerProject.body); assert.equal(foreignProject.statusCode, 200, foreignProject.body);
  const ownerCall = await mcp(owner), foreignCall = await mcp(foreign);
  async function authorize(profile: string, of = owner, call = ownerCall, projectId = ownerProject.json().id) {
    const source = await of.request('POST', `/api/projects/${projectId}/documents`, { text: '合成材料', requestId: randomUUID() });
    assert.equal(source.statusCode, 200, source.body);
    for(let attempt=0;attempt<10;attempt++){const view=await of.request('GET',`/api/documents/${source.json().id}`);assert.equal(view.statusCode,200,view.body);if(view.json().state==='review')break;await tick();}
    const ready=await of.request('GET',`/api/documents/${source.json().id}`);assert.equal(ready.json().state,'review',ready.body);
    const start = await call('start_lawbot_redaction', { project_id: projectId, document_ids: [source.json().id], advanced: { profile }, task_mode: 'redact_only', request_id: randomUUID() });
    assert.equal(start.isError, false, JSON.stringify(start));
    const job = start.structuredContent.jobId as string;
    const task = await of.request('GET', `/api/ai-collab/tasks/${job}`);
    assert.equal(task.statusCode, 200, task.body);
    return of.request('POST', `/api/ai-collab/tasks/${job}/authorize`, { revision: task.json().revision, authorization: consent });
  }
  const byId = await authorize(goodId), byName = await authorize('MCP有效方案');
  assert.equal(byId.statusCode, 200, byId.body); assert.equal(byName.statusCode, 200, byName.body);
  async function rejectedBeforeTask(profile: string, expectedError: string, of = owner, call = ownerCall, projectId = ownerProject.json().id) {
    const source = await of.request('POST', `/api/projects/${projectId}/documents`, { text: '合成材料', requestId: randomUUID() });
    assert.equal(source.statusCode, 200, source.body);
    for (let attempt = 0; attempt < 10; attempt++) { const view = await of.request('GET', `/api/documents/${source.json().id}`); assert.equal(view.statusCode, 200, view.body); if (view.json().state === 'review') break; await tick(); }
    const ready = await of.request('GET', `/api/documents/${source.json().id}`); assert.equal(ready.json().state, 'review', ready.body);
    const documentBefore = (await admin.query('SELECT revision,state,document_policy,document_policy_revision FROM documents WHERE id=$1', [source.json().id])).rows[0];
    const counts = async () => ({
      tasks: (await admin.query('SELECT count(*)::int AS n FROM ai_collab_tasks WHERE project_id=$1', [projectId])).rows[0].n,
      snapshots: (await admin.query('SELECT count(*)::int AS n FROM ai_collab_task_snapshot WHERE project_id=$1', [projectId])).rows[0].n,
      jobs: (await admin.query('SELECT count(*)::int AS n FROM jobs WHERE project_id=$1', [projectId])).rows[0].n,
    });
    const before = await counts();
    const rejected = await call('start_lawbot_redaction', { project_id: projectId, document_ids: [source.json().id], advanced: { profile }, task_mode: 'redact_only', request_id: randomUUID() });
    assert.equal(rejected.isError, true, JSON.stringify(rejected));
    assert.equal(rejected.structuredContent.error, expectedError, JSON.stringify(rejected));
    assert.equal(rejected.structuredContent.jobId, undefined, 'failed preflight cannot advertise a task');
    assert.deepEqual(await counts(), before, 'failed preflight cannot create task, snapshot, or job');
    assert.deepEqual((await admin.query('SELECT revision,state,document_policy,document_policy_revision FROM documents WHERE id=$1', [source.json().id])).rows[0], documentBefore, 'failed preflight cannot change the source document');
  }
  await rejectedBeforeTask(badId, 'INTERNAL_ERROR');
  await rejectedBeforeTask(goodId, 'SAVED_SETTING_NOT_FOUND', foreign, foreignCall, foreignProject.json().id);
  await rejectedBeforeTask('MCP有效方案', 'SAVED_SETTING_NOT_FOUND', foreign, foreignCall, foreignProject.json().id);
  const preference = await owner.request('GET', '/api/presets/preferences');
  assert.equal(preference.statusCode, 200); assert.equal(preference.json().settings.defaultProfileId, 'system_default');
  assert.equal(preference.json().revision, setDefault.json().revision + 1);
  const [preserved] = (await admin.query('SELECT payload,revision FROM redaction_presets WHERE id=$1', [badId])).rows;
  assert.equal(preserved.payload, broken); assert.equal(preserved.revision, 1);
  const originalKey = process.env.DATA_KEY!;
  process.env.DATA_KEY = `${originalKey[0] === '0' ? '1' : '0'}${originalKey.slice(1)}`;
  try {
    const unavailable = await owner.request('GET', '/api/presets/profiles');
    assert.equal(unavailable.statusCode, 500, unavailable.body);
  } finally { process.env.DATA_KEY = originalKey; }
});
