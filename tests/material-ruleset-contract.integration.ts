import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { tick } from '../apps/worker/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { defaultProfile } from '../packages/core/presets.ts';
import { hash, passwordHash, readOriginal, unseal } from '../packages/adapters/storage.ts';
import { officeFixture } from './office-fixtures.ts';
import { pdfFixture } from './pdf-fixtures.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(new URL(process.env.MIGRATION_DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(process.env.DATA_DIR?.includes('/.data/test-runs/'));
const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
after(async () => { await app.close(); await pool.end(); await admin.end(); });

test('material ruleset selection preserves sealed snapshots and gates every change', { timeout: 180000 }, async () => {
  const tenant = randomUUID(), ownerId = randomUUID(), password = 'synthetic-material-policy', origin = process.env.APP_ORIGIN!;
  const username = 'material-policy-' + ownerId;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [ownerId, tenant, username, passwordHash(password)]);
  const login = async (name: string) => {
    const response = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { username: name, password } });
    assert.equal(response.statusCode, 200, response.body);
    return String(response.headers['set-cookie']).split(';')[0];
  };
  const ownerCookie = await login(username);
  const client = (cookie: string) => (method: string, url: string, payload?: any, binary = false) =>
    app.inject({ method: method as any, url, headers: { origin, cookie, ...(binary ? { 'content-type': 'application/octet-stream' } : {}) }, payload });
  const owner = client(ownerCookie);
  const projectResponse = await owner('POST', '/api/projects', { name: 'sealed ruleset policy contract' });
  assert.equal(projectResponse.statusCode, 200, projectResponse.body);
  const project = projectResponse.json().id as string;
  const source = Buffer.from('手机号：13800138000\n姓名：张三', 'utf8');
  const batchId = randomUUID(), requestId = randomUUID();
  const accepted = await owner('POST', `/api/projects/${project}/upload-batches`, { id: batchId, files: [{ requestId, path: 'sealed-rules.txt', size: source.length }] });
  assert.equal(accepted.statusCode, 200, accepted.body);
  const uploaded = await owner('POST', `/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`, source, true);
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  const doc = uploaded.json().id as string;
  assert.equal(await tick(), true);
  const initial = await owner('GET', `/api/documents/${doc}`);
  assert.equal(initial.statusCode, 200, initial.body);
  assert.equal(initial.json().state, 'review');

  const entry = (pattern: string) => ({ id: randomUUID(), pattern, normalizedPattern: pattern, entityType: 'phone', kind: 'forceDetect', matchMode: 'exact', enabled: true, source: 'manual', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const createdA = await owner('POST', '/api/presets/rulesets', { name: 'sealed-A-' + randomUUID() });
  assert.equal(createdA.statusCode, 200, createdA.body);
  const secretA = 'OWNER_PRIVATE_RULE_A_' + randomUUID();
  const savedA = await owner('PUT', `/api/presets/rulesets/${createdA.json().settings.id}`, { revision: createdA.json().revision, settings: { ...createdA.json().settings, entries: [entry(secretA)] } });
  assert.equal(savedA.statusCode, 200, savedA.body);
  const ruleA = savedA.json().settings.id as string;
  const createdB = await owner('POST', '/api/presets/rulesets', { name: 'sealed-B-' + randomUUID() });
  assert.equal(createdB.statusCode, 200, createdB.body);
  const secretB = 'OWNER_PRIVATE_RULE_B_' + randomUUID();
  const savedB = await owner('PUT', `/api/presets/rulesets/${createdB.json().settings.id}`, { revision: createdB.json().revision, settings: { ...createdB.json().settings, entries: [entry(secretB)] } });
  assert.equal(savedB.statusCode, 200, savedB.body);
  const ruleB = savedB.json().settings.id as string;
  let revision = initial.json().revision as number;
  const configure = async (request: ReturnType<typeof client>, configuration: Record<string, unknown>, rebindRuleset = false) => {
    const response = await request('POST', `/api/documents/${doc}/configuration`, { revision, configuration, ...(rebindRuleset ? { rebindRuleset: true } : {}) });
    if (response.statusCode === 200) revision = response.json().revision;
    return response;
  };
  const applied = await configure(owner, { rulesetId: ruleA, documentType: 'auto' });
  assert.equal(applied.statusCode, 200, applied.body);
  const current = async () => {
    const [row] = (await admin.query('SELECT tenant_id,revision,document_policy_revision,document_policy,source_id,source_hash FROM documents WHERE id=$1', [doc])).rows;
    const [jobs] = (await admin.query('SELECT count(*)::int AS n FROM jobs WHERE document_id=$1', [doc])).rows;
    const [audit] = (await admin.query('SELECT count(*)::int AS n FROM audit WHERE object_id=$1', [doc])).rows;
    const policy = JSON.parse(unseal(row.document_policy, `${row.tenant_id}:${project}:${doc}:document-policy`));
    return { row, jobs: jobs.n as number, audit: audit.n as number, policy };
  };
  const ensureRejectedWithoutMutation = async (request: ReturnType<typeof client>, configuration: Record<string, unknown>, expectedStatus: number, rebindRuleset = false) => {
    const before = await current();
    const result = await configure(request, configuration, rebindRuleset);
    assert.equal(result.statusCode, expectedStatus, result.body);
    const after = await current();
    assert.deepEqual(after.row, before.row);
    assert.equal(after.jobs, before.jobs);
    assert.equal(after.audit, before.audit);
    assert.deepEqual(await readOriginal(after.row.source_id), source);
  };
  const originalSnapshot = (await current()).policy.ruleset;
  assert.deepEqual(originalSnapshot, savedA.json().settings);
  const secretANew = 'OWNER_PRIVATE_RULE_A_NEW_' + randomUUID();
  const updatedA = await owner('PUT', `/api/presets/rulesets/${ruleA}`, { revision: savedA.json().revision, settings: { ...savedA.json().settings, entries: [...savedA.json().settings.entries, entry(secretANew)] } });
  assert.equal(updatedA.statusCode, 200, updatedA.body);

  const memberName = 'material-reviewer-' + randomUUID();
  const made = await owner('POST', '/api/organization/members', { username: memberName, password });
  assert.equal(made.statusCode, 200, made.body);
  const grant = await owner('PUT', `/api/projects/${project}/members/${made.json().id}`, { revision: null, permissions: ['view_original', 'review'] });
  assert.equal(grant.statusCode, 200, grant.body);
  const member = client(await login(memberName));
  const memberGet = await member('GET', `/api/documents/${doc}/configuration`);
  assert.equal(memberGet.statusCode, 200, memberGet.body);
  assert.equal(memberGet.json().effective.ruleset.applied.id, ruleA);
  assert.equal(memberGet.json().effective.ruleset.applied.name, savedA.json().settings.name);
  assert.ok(!memberGet.body.includes(secretA));
  assert.ok(!memberGet.body.includes(secretANew));
  assert.ok(!memberGet.body.includes(secretB));

  const unchangedUuid = await configure(member, { rulesetId: ruleA, documentType: 'general' });
  assert.equal(unchangedUuid.statusCode, 200, unchangedUuid.body);
  assert.deepEqual((await current()).policy.ruleset, originalSnapshot);
  for (const [configuration, rebind] of [
    [{ rulesetId: null, documentType: 'general' }, false],
    [{ documentType: 'general' }, false],
    [{ rulesetId: ruleB, documentType: 'general' }, false],
    [{ rulesetId: ruleA, documentType: 'general' }, true],
  ] as const) await ensureRejectedWithoutMutation(member, configuration, 403, rebind);

  await ensureRejectedWithoutMutation(owner, { rulesetId: randomUUID() }, 404);
  const foreignSecret = 'FOREIGN_PRIVATE_RULE_' + randomUUID();
  const foreignCreated = await member('POST', '/api/presets/rulesets', { name: 'foreign-' + randomUUID() });
  assert.equal(foreignCreated.statusCode, 200, foreignCreated.body);
  const foreignSaved = await member('PUT', `/api/presets/rulesets/${foreignCreated.json().settings.id}`, { revision: foreignCreated.json().revision, settings: { ...foreignCreated.json().settings, entries: [entry(foreignSecret)] } });
  assert.equal(foreignSaved.statusCode, 200, foreignSaved.body);
  await ensureRejectedWithoutMutation(owner, { rulesetId: foreignSaved.json().settings.id }, 404);
  const ownerRebind = await configure(owner, { rulesetId: ruleA, documentType: 'general' }, true);
  assert.equal(ownerRebind.statusCode, 200, ownerRebind.body);
  assert.deepEqual((await current()).policy.ruleset, updatedA.json().settings);
  assert.ok(!(await member('GET', `/api/documents/${doc}/configuration`)).body.includes(foreignSecret));

  const setNull = await configure(owner, { rulesetId: null, documentType: 'general' });
  assert.equal(setNull.statusCode, 200, setNull.body);
  const sameNull = await configure(member, { rulesetId: null, documentType: 'contract' });
  assert.equal(sameNull.statusCode, 200, sameNull.body);
  assert.equal((await current()).policy.ruleset, null);
  await ensureRejectedWithoutMutation(member, { documentType: 'contract' }, 403);

  const projectRules = await owner('PUT', `/api/projects/${project}/presets`, { revision: 0, profileId: null, rulesetId: ruleB, rulesetRevision: savedB.json().revision });
  assert.equal(projectRules.statusCode, 200, projectRules.body);
  // Applying a project policy marks its documents outdated and advances their revision.
  revision = (await current()).row.revision;
  const inherit = await configure(owner, { documentType: 'contract' });
  assert.equal(inherit.statusCode, 200, inherit.body);
  const inheritedSnapshot = (await current()).policy.ruleset;
  assert.deepEqual(inheritedSnapshot, savedB.json().settings);
  const sameUndefined = await configure(member, { documentType: 'official_letter' });
  assert.equal(sameUndefined.statusCode, 200, sameUndefined.body);
  assert.deepEqual((await current()).policy.ruleset, inheritedSnapshot);
  await ensureRejectedWithoutMutation(member, { rulesetId: ruleA, documentType: 'official_letter' }, 403);
  // Project changes invalidate the document, but an ordinary unrelated save
  // still uses its old B snapshot. A manager can explicitly refresh inherited
  // selection to the newly applied A without changing selection shape.
  const changedProjectRules = await owner('PUT', `/api/projects/${project}/presets`, {
    revision: projectRules.json().revision, profileId: null, rulesetId: ruleA, rulesetRevision: updatedA.json().revision,
  });
  assert.equal(changedProjectRules.statusCode, 200, changedProjectRules.body);
  revision = (await current()).row.revision;
  const oldInherited = await configure(member, { documentType: 'judgment' });
  assert.equal(oldInherited.statusCode, 200, oldInherited.body);
  assert.deepEqual((await current()).policy.ruleset, inheritedSnapshot);
  await ensureRejectedWithoutMutation(member, { documentType: 'judgment' }, 403, true);
  const reboundInherited = await configure(owner, { documentType: 'judgment' }, true);
  assert.equal(reboundInherited.statusCode, 200, reboundInherited.body);
  assert.deepEqual((await current()).policy.ruleset, updatedA.json().settings);
  const finalGet = await member('GET', `/api/documents/${doc}/configuration`);
  assert.equal(finalGet.statusCode, 200, finalGet.body);
  assert.equal(finalGet.json().effective.ruleset.selection, 'project');
  assert.deepEqual(finalGet.json().effective.profile.enabledEntityTypeIds, defaultProfile().enabledEntityTypeIds);
  assert.deepEqual(finalGet.json().effective.profile.pseudonymTypeActions, {});
  assert.ok(![secretA, secretANew, secretB, foreignSecret].some(secret => finalGet.body.includes(secret)));
  assert.ok(!finalGet.body.includes('"entries"'));
  assert.ok(!finalGet.body.includes(foreignSaved.json().settings.id));
  assert.ok(!finalGet.body.includes(foreignSaved.json().settings.name));
  assert.ok(!finalGet.body.includes(ruleB));
  assert.ok(!finalGet.body.includes(savedB.json().settings.name));
  const finalRow = await current();
  assert.equal(finalRow.row.source_hash, hash(source));
  assert.deepEqual(await readOriginal(finalRow.row.source_id), source);

  // GET projects only the applied project snapshot for each format, not a
  // private preset catalogue or its rule entries.
  const base = defaultProfile();
  const profileInput = { ...base, enabledEntityTypeIds: ['phone'], pseudonymTypeActions: { phone: 'mask' },
    docx: { ...base.docx, removeImages: true, removeHeaderFooter: true, commentHandlingMode: 'anonymize' },
    pdf: { ...base.pdf, maskStyle: 'purple' }, image: { ...base.image, maskStyle: 'lightGray' } };
  const createdProfile = await owner('POST', '/api/presets/profiles', { name: 'visible-material-profile-' + randomUUID(), profile: profileInput });
  assert.equal(createdProfile.statusCode, 200, createdProfile.body);
  const projectEffective = await owner('PUT', `/api/projects/${project}/presets`, {
    revision: changedProjectRules.json().revision, profileId: createdProfile.json().settings.id, profileRevision: createdProfile.json().revision,
    rulesetId: ruleA, rulesetRevision: updatedA.json().revision,
  });
  assert.equal(projectEffective.statusCode, 200, projectEffective.body);
  const uploadProjection = async (path: string, bytes: Buffer) => {
    const batch = randomUUID(), request = randomUUID();
    const accepted = await owner('POST', `/api/projects/${project}/upload-batches`, { id: batch, files: [{ requestId: request, path, size: bytes.length }] });
    assert.equal(accepted.statusCode, 200, accepted.body);
    const response = await owner('POST', `/api/projects/${project}/files?batchId=${batch}&requestId=${request}`, bytes, true);
    assert.equal(response.statusCode, 200, response.body);
    const settings = await member('GET', `/api/documents/${response.json().id}/configuration`);
    assert.equal(settings.statusCode, 200, settings.body);
    assert.ok(![secretA, secretANew, secretB, foreignSecret].some(secret => settings.body.includes(secret)));
    assert.ok(!settings.body.includes('"entries"'));
    assert.ok(!settings.body.includes(foreignSaved.json().settings.id));
    return settings.json().effective;
  };
  const word = await uploadProjection('visible.docx', await officeFixture('docx'));
  assert.deepEqual(word.profile.enabledEntityTypeIds, ['phone']);
  assert.deepEqual(word.profile.pseudonymTypeActions, { phone: 'mask' });
  assert.deepEqual(word.profile.word, { removeImages: true, removeHeaderFooter: true, commentHandlingMode: 'anonymize' });
  assert.equal(word.profile.visualMaskStyle, null);
  assert.equal(word.ruleset.applied.id, ruleA);
  const pdf = await uploadProjection('visible.pdf', pdfFixture({ text: '13800138000' }));
  assert.deepEqual(pdf.profile.enabledEntityTypeIds, ['phone']);
  assert.deepEqual(pdf.profile.pseudonymTypeActions, { phone: 'mask' });
  assert.equal(pdf.profile.word, null);
  assert.equal(pdf.profile.visualMaskStyle, 'purple');
  assert.equal(pdf.ruleset.applied.id, ruleA);
});
