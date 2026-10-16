import { test, expect } from './fixture.ts';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { Page, Browser, APIResponse } from '@playwright/test';
import pg from 'pg';
import sharp from 'sharp';
import { officeImageFixture } from '../office-fixtures.ts';
import { pdfFixture } from '../pdf-fixtures.ts';
import { readZip } from '../../packages/core/office-zip.ts';
import { openPdf } from '../../packages/core/pdf-reader.ts';
import { readOriginal, unseal } from '../../packages/adapters/storage.ts';
import { MASK_COLORS } from '../../packages/core/page-redaction.ts';
import { defaultProfile } from '../../packages/core/presets.ts';
import { seal } from '../../packages/adapters/storage.ts';

type View = { id: string; project_id: string; revision: number; state: string; job?: { id: string; status: string }; pageReview?: { mode: string }; marks: { decision: string; sources?: { code: string }[] }[] };
const apiPath = (response: { url(): string }) => new URL(response.url()).pathname;
const originHeader = (page: Page) => ({ origin: new URL(page.url()).origin });
const browserSignals = new WeakMap<Page, { kind: string; message: string; url?: string; status?: number }[]>();
const browserTraffic = new WeakMap<Page, { at: number; method: string; path: string; status: number }[]>();
test.beforeEach(async ({ page }) => {
  const signals: { kind: string; message: string; url?: string; status?: number }[] = [];
  const traffic: { at: number; method: string; path: string; status: number }[] = [];
  browserSignals.set(page, signals);
  browserTraffic.set(page, traffic);
  page.on('pageerror', error => signals.push({ kind: 'pageerror', message: error.stack ?? error.message }));
  page.on('console', message => { if (message.type() === 'error') signals.push({ kind: 'console-error', message: message.text(), url: message.location().url }); });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/')) traffic.push({ at: Date.now(), method: response.request().method(), path, status: response.status() });
    if (response.status() >= 400) signals.push({ kind: 'http-error', message: response.statusText(), url: response.url(), status: response.status() });
  });
});
test.afterEach(async ({ page }, info) => {
  const signals = browserSignals.get(page) ?? [];
  await writeFile(info.outputPath('browser-errors.json'), JSON.stringify(signals, null, 2));
  const traffic = (browserTraffic.get(page) ?? []).sort((a, b) => a.at - b.at);
  const counts: Record<string, number> = {};
  let windowStart = 0, maxInSixtySeconds = 0;
  for (let i = 0; i < traffic.length; i++) {
    const item = traffic[i];
    counts[`${item.method} ${item.path}`] = (counts[`${item.method} ${item.path}`] ?? 0) + 1;
    while (traffic[windowStart]?.at < item.at - 60_000) windowStart++;
    maxInSixtySeconds = Math.max(maxInSixtySeconds, i - windowStart + 1);
  }
  await writeFile(info.outputPath('browser-traffic.json'), JSON.stringify({ total: traffic.length, maxInSixtySeconds, counts, rateLimited: traffic.filter(item => item.status === 429) }, null, 2));
  if (signals.length) console.error(JSON.stringify({ browserSignals: info.title, signals }));
  if (info.status === 'passed') expect(signals.filter(signal => signal.kind === 'pageerror')).toEqual([]);
});

function isolatedAdminUrl() {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (!url.pathname.startsWith('/tmw_test_')) throw new Error('ISOLATED_DATABASE_REQUIRED');
  return url.href;
}
async function originalIdentity(id: string, expected: Buffer) {
  const db = new pg.Client({ connectionString: isolatedAdminUrl() });
  await db.connect();
  try {
    const result = await db.query('SELECT source_id,source_hash FROM documents WHERE id=$1', [id]);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as { source_id: string; source_hash: string };
    const actual = await readOriginal(row.source_id);
    expect(actual).toEqual(expected);
    expect(row.source_hash).toBe(createHash('sha256').update(expected).digest('hex'));
    return row;
  } finally { await db.end(); }
}
async function sealedPolicy(id: string) {
  const db = new pg.Client({ connectionString: isolatedAdminUrl() });
  await db.connect();
  try {
    const result = await db.query('SELECT tenant_id,project_id,document_policy FROM documents WHERE id=$1', [id]);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.document_policy).toBeTruthy();
    return JSON.parse(unseal(row.document_policy, `${row.tenant_id}:${row.project_id}:${id}:document-policy`)) as { configuration: Record<string, unknown>; ruleset: { id: string; entries: { id: string; pattern: string }[] } | null };
  } finally { await db.end(); }
}
async function loginProject(page: Page, prefix: string) {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录工作台', exact: true }).click();
  await page.locator('.create-project summary').click();
  const name = `${prefix}-${randomUUID().slice(0, 8)}`;
  await page.getByLabel('项目名称', { exact: true }).fill(name);
  const response = page.waitForResponse(r => r.request().method() === 'POST' && apiPath(r) === '/api/projects');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  const created = await response;
  expect(created.status(), await created.text()).toBe(200);
  const project = await created.json() as { id: string; name: string };
  expect(project.name).toBe(name);
  await expect(page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  return project;
}
async function upload(page: Page, projectId: string, filename: string, source: Buffer, mimeType: string) {
  await page.getByRole('button', { name: '导入材料', exact: true }).click();
  await page.getByLabel('选择文件', { exact: true }).setInputFiles({ name: filename, mimeType, buffer: source });
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
  let id = '';
  await expect.poll(async () => {
    const response = await page.request.get(`/api/projects/${projectId}/documents`);
    if (response.status() !== 200) return false;
    id = ((await response.json()) as { id: string; name: string }[]).find(item => item.name === filename)?.id ?? '';
    return !!id;
  }, { timeout: 45_000, intervals: [1500] }).toBe(true);
  await waitReview(page, id);
  expect(await originalIdentity(id, source)).toBeTruthy();
  return id;
}
async function view(page: Page, id: string): Promise<View> {
  const response = await authorizedGet(page, `/api/documents/${id}`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
function rateWindowSeconds(response: APIResponse, header: 'retry-after' | 'x-ratelimit-reset') {
  const value = Number(response.headers()[header]);
  expect(Number.isInteger(value) && value >= 0 && value <= 60, `${header}: ${response.headers()[header]}`).toBe(true);
  return value + 1;
}
async function authorizedGet(page: Page, path: string): Promise<APIResponse> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.request.get(path);
    if (response.status() !== 429) return response;
    await page.waitForTimeout(rateWindowSeconds(response, 'retry-after') * 1000);
  }
  throw new Error(`GET_RATE_WINDOW_NOT_RECOVERED: ${path}`);
}
async function paceBeforeMutation(page: Page) {
  const status = await authorizedGet(page, '/api/session');
  expect(status.status(), await status.text()).toBe(200);
  const remaining = Number(status.headers()['x-ratelimit-remaining']);
  expect(Number.isInteger(remaining) && remaining >= 0 && remaining <= 120).toBe(true);
  if (remaining >= 50) return;
  await page.waitForTimeout(rateWindowSeconds(status, 'x-ratelimit-reset') * 1000);
  const resumed = await authorizedGet(page, '/api/session');
  expect(resumed.status(), await resumed.text()).toBe(200);
}
async function waitReview(page: Page, id: string) {
  await expect.poll(async () => {
    const current = await view(page, id);
    return `${current.state}:${current.job?.status}`;
  }, { timeout: 120_000, intervals: [1500] }).toBe('review:succeeded');
}
async function openConfiguration(page: Page, filename: string) {
  const back = page.getByRole('button', { name: '返回材料列表', exact: true });
  if (await back.isVisible()) await back.click();
  await expect(page.getByRole('region', { name: '材料列表', exact: true })).toBeVisible();
  await page.getByRole('region', { name: '材料列表', exact: true }).getByRole('button', { name: filename, exact: false }).click();
  const details = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: '本材料识别与脱敏设置' }) });
  await details.locator('summary').click();
  await expect(details.getByRole('combobox', { name: '使用方案', exact: true })).toBeEnabled();
  return details;
}
async function saveThroughUi(page: Page, id: string, expectedRevision: number) {
  // A new material/revision remount reads several panels. Honor the real user's
  // rate window before submitting another non-idempotent configuration change.
  await paceBeforeMutation(page);
  const configure = page.waitForResponse(r => r.request().method() === 'POST' && apiPath(r) === `/api/documents/${id}/configuration`);
  const recognize = page.waitForResponse(r => r.request().method() === 'POST' && apiPath(r) === `/api/documents/${id}/recognize`);
  await page.getByRole('button', { name: '保存设置并重新识别', exact: true }).click();
  await page.getByRole('alertdialog', { name: '操作确认' }).getByRole('button', { name: '确认执行', exact: true }).click();
  const configured = await configure;
  expect(configured.status(), await configured.text()).toBe(200);
  const saved = await configured.json() as { id: string; revision: number };
  expect(saved).toMatchObject({ id, revision: expectedRevision + 1 });
  const queued = await recognize;
  expect(queued.status(), await queued.text()).toBe(200);
  const queueReceipt = await queued.json() as { revision: number; jobId: string };
  expect(queued.request().postDataJSON().revision).toBe(saved.revision);
  expect(queueReceipt.revision).toBe(saved.revision + 1);
  expect(queueReceipt.jobId).toMatch(/^[0-9a-f-]{36}$/u);
  await waitReview(page, id);
  const final = await view(page, id);
  expect(final.revision).toBe(queueReceipt.revision);
  expect(final.job).toMatchObject({ id: queueReceipt.jobId, status: 'succeeded' });
  return { saved, queued: queueReceipt, configureBody: configured.request().postDataJSON() as Record<string, any> };
}
async function createRule(page: Page, name: string, pattern: string) {
  const headers = originHeader(page);
  const created = await page.request.post('/api/presets/rulesets', { headers, data: { name } });
  expect(created.status(), await created.text()).toBe(200);
  const base = await created.json();
  const entry = { id: randomUUID(), pattern, normalizedPattern: pattern, entityType: 'org_name', kind: 'forceDetect', matchMode: 'exact', enabled: true, source: 'manual', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const saved = await page.request.put(`/api/presets/rulesets/${base.settings.id}`, { headers, data: { revision: base.revision, settings: { ...base.settings, entries: [entry] } } });
  expect(saved.status(), await saved.text()).toBe(200);
  return { ...(await saved.json()), entry } as { revision: number; settings: { id: string; name: string; entries: typeof entry[] }; entry: typeof entry };
}
async function readConfiguration(page: Page, id: string) {
  const response = await authorizedGet(page, `/api/documents/${id}/configuration`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<{ revision: number; configuration: Record<string, any>; effective: any }>;
}

test('material profile, ruleset three states, reviewer permission and catalogue retry are real UI actions', async ({ page, browser }: { page: Page; browser: Browser }, info) => {
  test.setTimeout(300_000);
  const project = await loginProject(page, '材料规则');
  const tokenA = `ZXA-${randomUUID().slice(0, 8)}`, tokenB = `ZXB-${randomUUID().slice(0, 8)}`, tokenC = `ZXC-${randomUUID().slice(0, 8)}`;
  const ruleA = await createRule(page, `项目规则-${randomUUID().slice(0, 6)}`, tokenA);
  const ruleB = await createRule(page, `材料规则-${randomUUID().slice(0, 6)}`, tokenB);
  const projectPolicy = await page.request.get(`/api/projects/${project.id}/presets`);
  expect(projectPolicy.status()).toBe(200);
  const currentProjectPolicy = await projectPolicy.json();
  const projectSaved = await page.request.put(`/api/projects/${project.id}/presets`, { headers: originHeader(page), data: { revision: currentProjectPolicy.revision, profileId: null, rulesetId: ruleA.settings.id, rulesetRevision: ruleA.revision } });
  expect(projectSaved.status(), await projectSaved.text()).toBe(200);
  const profileResponse = await page.request.post('/api/presets/profiles', { headers: originHeader(page), data: { name: `材料方案-${randomUUID().slice(0, 6)}` } });
  expect(profileResponse.status()).toBe(200);
  const profile = await profileResponse.json();
  const source = Buffer.from(`公开项目 ${tokenA}，个人目录 ${tokenB}，更新后 ${tokenC}。`, 'utf8');
  const filename = `材料规则-${randomUUID().slice(0, 6)}.txt`;
  const id = await upload(page, project.id, filename, source, 'text/plain');
  let revision = (await view(page, id)).revision;

  // Only the first catalogue read after opening this panel is fault injected.
  let catalogues = 0, configurationPosts = 0;
  page.on('request', request => { if (request.method() === 'POST' && apiPath(request) === `/api/documents/${id}/configuration`) configurationPosts++; });
  await page.route('**/api/presets/profiles', route => ++catalogues === 1
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"CATALOGUE_UNAVAILABLE"}' }) : route.continue());
  await page.getByRole('region', { name: '材料列表', exact: true }).getByRole('button', { name: filename, exact: false }).click();
  let details = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: '本材料识别与脱敏设置' }) });
  await details.locator('summary').click();
  await expect(details.getByRole('alert').filter({ hasText: '读取失败' })).toHaveText('材料设置或目录读取失败。当前设置未更改，请重试加载后再保存。');
  await expect(details.getByRole('alert').filter({ hasText: '至少保留一种识别类型' })).toHaveCount(0);
  await expect(details.getByRole('button', { name: '保存设置并重新识别', exact: true })).toBeDisabled();
  expect(configurationPosts).toBe(0);
  await details.getByRole('button', { name: '重试加载材料设置', exact: true }).click();
  await expect(details.getByRole('combobox', { name: '使用方案', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('material-settings-expanded.png'), fullPage: true });
  await page.unroute('**/api/presets/profiles');

  await details.getByRole('combobox', { name: '使用方案', exact: true }).selectOption(profile.settings.id);
  await details.getByRole('combobox', { name: '规则选择', exact: true }).selectOption(ruleB.settings.id);
  const first = await saveThroughUi(page, id, revision); revision = first.queued.revision;
  expect(first.configureBody.configuration.profileId).toBe(profile.settings.id);
  expect(first.configureBody.configuration.rulesetId).toBe(ruleB.settings.id);
  expect(first.configureBody.rebindRuleset).toBeUndefined();
  expect((await sealedPolicy(id)).ruleset?.entries.map(item => item.id)).toEqual([ruleB.entry.id]);
  expect((await readConfiguration(page, id)).effective.ruleset).toMatchObject({ selection: 'material', applied: { id: ruleB.settings.id }, fromSealedDocumentSnapshot: true });

  const updatedEntry = { ...ruleB.entry, id: randomUUID(), pattern: tokenC, normalizedPattern: tokenC, updatedAt: new Date().toISOString() };
  const updated = await page.request.put(`/api/presets/rulesets/${ruleB.settings.id}`, { headers: originHeader(page), data: { revision: ruleB.revision, settings: { ...ruleB.settings, entries: [updatedEntry] } } });
  expect(updated.status(), await updated.text()).toBe(200);
  const reviewerName = `material-reviewer-${randomUUID().slice(0, 8)}`, reviewerPassword = randomUUID();
  const member = await page.request.post('/api/organization/members', { headers: originHeader(page), data: { username: reviewerName, password: reviewerPassword } });
  expect(member.status(), await member.text()).toBe(200);
  const reviewer = await member.json();
  const grant = await page.request.put(`/api/projects/${project.id}/members/${reviewer.id}`, { headers: originHeader(page), data: { revision: null, permissions: ['view_original', 'review'] } });
  expect(grant.status(), await grant.text()).toBe(200);
  const reviewerContext = await browser.newContext();
  try {
    const other = await reviewerContext.newPage();
    await other.goto(new URL(page.url()).origin);
    await other.getByLabel('账号', { exact: true }).fill(reviewerName);
    await other.getByLabel('密码', { exact: true }).fill(reviewerPassword);
    await other.getByRole('button', { name: '登录工作台', exact: true }).click();
    await other.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: project.name, exact: true }).click();
    const restricted = await openConfiguration(other, filename);
    await expect(restricted.getByRole('combobox', { name: '规则选择', exact: true })).toBeDisabled();
    await expect(restricted.getByText('当前已应用：', { exact: false })).toContainText('本材料已用版本');
    await restricted.getByRole('combobox', { name: '材料类型', exact: true }).selectOption('general');
    const limitedSave = await saveThroughUi(other, id, revision); revision = limitedSave.queued.revision;
    expect(limitedSave.configureBody.rebindRuleset).toBeUndefined();
    expect((await sealedPolicy(id)).ruleset?.entries.map(item => item.id)).toEqual([ruleB.entry.id]);
    const rejected = await other.request.post(`/api/documents/${id}/configuration`, { headers: originHeader(other), data: { revision, configuration: { ...limitedSave.configureBody.configuration }, rebindRuleset: true } });
    expect(rejected.status()).toBe(403);
    expect((await view(other, id)).revision).toBe(revision);
  } finally { await reviewerContext.close(); }

  await page.reload();
  await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: project.name, exact: true }).click();
  details = await openConfiguration(page, filename);
  await expect(details.getByRole('combobox', { name: '规则选择', exact: true })).toHaveValue(ruleB.settings.id);
  await details.getByRole('checkbox', { name: '更新为当前规则版本', exact: true }).check();
  const rebound = await saveThroughUi(page, id, revision); revision = rebound.queued.revision;
  expect(rebound.configureBody.rebindRuleset).toBe(true);
  expect((await sealedPolicy(id)).ruleset?.entries.map(item => item.id)).toEqual([updatedEntry.id]);
  details = await openConfiguration(page, filename);
  await details.getByRole('combobox', { name: '规则选择', exact: true }).selectOption('none');
  const none = await saveThroughUi(page, id, revision); revision = none.queued.revision;
  expect(none.configureBody.configuration.rulesetId).toBeNull();
  expect((await sealedPolicy(id)).ruleset).toBeNull();
  details = await openConfiguration(page, filename);
  await details.getByRole('combobox', { name: '规则选择', exact: true }).selectOption('project');
  const inherited = await saveThroughUi(page, id, revision); revision = inherited.queued.revision;
  expect(inherited.configureBody.configuration.rulesetId).toBeUndefined();
  expect((await sealedPolicy(id)).ruleset?.entries.map(item => item.id)).toEqual([ruleA.entry.id]);
  const final = await view(page, id);
  expect(final.marks.flatMap(mark => mark.sources ?? []).some(source => source.code === `ruleset-force-detect:${ruleA.entry.id}`)).toBe(true);
  expect(await originalIdentity(id, source)).toBeTruthy();
  await page.screenshot({ path: info.outputPath('material-rules-three-states.png'), fullPage: true });
});

test('same profile ID stays applied until explicit reapply; older material requires a manual retry', async ({ page }, info) => {
  test.setTimeout(300_000);
  const project = await loginProject(page, '材料方案刷新');
  const profileCreated = await page.request.post('/api/presets/profiles', { headers: originHeader(page), data: {
    name: `同一方案-${randomUUID().slice(0, 6)}`,
    profile: { ...defaultProfile(), enabledEntityTypeIds: ['phone', 'name_cn'] },
  } });
  expect(profileCreated.status(), await profileCreated.text()).toBe(200);
  const profile = await profileCreated.json();
  const source = Buffer.from('合成材料：手机号 13800138000，联系人张三。', 'utf8');
  const filename = `材料方案刷新-${randomUUID().slice(0, 6)}.txt`;
  const id = await upload(page, project.id, filename, source, 'text/plain');
  let revision = (await view(page, id)).revision;
  let details = await openConfiguration(page, filename);
  const initialEffective = (await readConfiguration(page, id)).effective.profile;
  expect(initialEffective).toMatchObject({ hasAppliedDocumentProfile: false, baseSnapshotAvailable: false });
  await expect(details.getByRole('checkbox', { name: /重新应用当前方案/u })).toHaveCount(0);
  await details.getByRole('combobox', { name: '使用方案', exact: true }).selectOption(profile.settings.id);
  const first = await saveThroughUi(page, id, revision); revision = first.queued.revision;
  expect(first.configureBody.rebindProfile).toBeUndefined();
  expect((await readConfiguration(page, id)).effective.profile).toMatchObject({ hasAppliedDocumentProfile: true, baseSnapshotAvailable: true });
  expect((await view(page, id)).marks.some(mark => (mark as any).kind === '手机号')).toBe(true);

  const changedProfile = await page.request.put(`/api/presets/profiles/${profile.settings.id}`, { headers: originHeader(page), data: {
    revision: profile.revision, settings: { ...profile.settings, enabledEntityTypeIds: ['name_cn'] },
  } });
  expect(changedProfile.status(), await changedProfile.text()).toBe(200);
  details = await openConfiguration(page, filename);
  await details.getByRole('combobox', { name: '材料类型', exact: true }).selectOption('general');
  const unrelated = await saveThroughUi(page, id, revision); revision = unrelated.queued.revision;
  expect(unrelated.configureBody.rebindProfile).toBeUndefined();
  expect((await readConfiguration(page, id)).effective.profile.enabledEntityTypeIds).toContain('phone');
  expect((await view(page, id)).marks.some(mark => (mark as any).kind === '手机号')).toBe(true);
  await page.screenshot({ path: info.outputPath('material-profile-applied-version.png'), fullPage: true });

  details = await openConfiguration(page, filename);
  await expect(details.getByRole('checkbox', { name: '电话', exact: true })).toBeChecked();
  await details.getByRole('checkbox', { name: /重新应用当前方案/u }).check();
  await expect(details.getByRole('checkbox', { name: '电话', exact: true })).not.toBeChecked();
  await details.screenshot({ path: info.outputPath('material-profile-reapply-panel.png') });
  await page.screenshot({ path: info.outputPath('material-profile-explicit-reapply.png'), fullPage: true });
  const refreshed = await saveThroughUi(page, id, revision); revision = refreshed.queued.revision;
  expect(refreshed.configureBody.rebindProfile).toBe(true);
  expect((await readConfiguration(page, id)).effective.profile.enabledEntityTypeIds).toEqual(['name_cn']);
  expect((await view(page, id)).marks.some(mark => (mark as any).kind === '手机号')).toBe(false);

  // Model an older sealed material using the same synthetic document and the
  // isolated DB. The user operations after this setup remain real browser calls.
  const db = new pg.Client({ connectionString: isolatedAdminUrl() });
  await db.connect();
  try {
    const result = await db.query('SELECT tenant_id,project_id,document_policy FROM documents WHERE id=$1', [id]);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    const aad = `${row.tenant_id}:${row.project_id}:${id}:document-policy`;
    const oldPolicy = JSON.parse(unseal(row.document_policy, aad));
    expect(oldPolicy.baseProfile).toBeTruthy();
    delete oldPolicy.baseProfile;
    const changed = await db.query('UPDATE documents SET document_policy=$1 WHERE id=$2', [seal(JSON.stringify(oldPolicy), aad), id]);
    expect(changed.rowCount).toBe(1);
  } finally { await db.end(); }
  await page.reload();
  await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: project.name, exact: true }).click();
  details = await openConfiguration(page, filename);
  expect((await readConfiguration(page, id)).effective.profile).toMatchObject({ hasAppliedDocumentProfile: true, baseSnapshotAvailable: false });
  let submitted = 0, recognized = 0;
  page.on('request', request => {
    if (apiPath(request) === `/api/documents/${id}/configuration` && request.method() === 'POST') submitted++;
    if (apiPath(request) === `/api/documents/${id}/recognize` && request.method() === 'POST') recognized++;
  });
  await details.getByRole('checkbox', { name: '电话', exact: true }).check();
  const rejectedResponse = page.waitForResponse(response => apiPath(response) === `/api/documents/${id}/configuration` && response.request().method() === 'POST');
  await page.getByRole('button', { name: '保存设置并重新识别', exact: true }).click();
  await page.getByRole('alertdialog', { name: '操作确认' }).getByRole('button', { name: '确认执行', exact: true }).click();
  const rejected = await rejectedResponse;
  expect(rejected.status()).toBe(400);
  expect((await rejected.json()).error).toBe('PROFILE_BASE_UNAVAILABLE');
  await expect(details.getByText('这份材料需要先重新应用当前方案', { exact: false })).toBeVisible();
  expect(submitted).toBe(1);
  expect(recognized).toBe(0);
  expect((await view(page, id)).revision).toBe(revision);
  await details.getByRole('checkbox', { name: /重新应用当前方案/u }).check();
  const accepted = await saveThroughUi(page, id, revision); revision = accepted.queued.revision;
  expect(accepted.configureBody.rebindProfile).toBe(true);
  expect(submitted).toBe(2);
  expect(recognized).toBe(1);
  expect((await readConfiguration(page, id)).effective.profile).toMatchObject({ hasAppliedDocumentProfile: true, baseSnapshotAvailable: true });
  expect((await view(page, id)).marks.some(mark => (mark as any).kind === '手机号')).toBe(true);

  details = await openConfiguration(page, filename);
  await details.getByRole('button', { name: '恢复沿用方案类型', exact: true }).click();
  const cleared = await saveThroughUi(page, id, revision); revision = cleared.queued.revision;
  expect(cleared.configureBody.rebindProfile).toBeUndefined();
  expect((await readConfiguration(page, id)).effective.profile.enabledEntityTypeIds).toEqual(['name_cn']);
  expect((await view(page, id)).marks.some(mark => (mark as any).kind === '手机号')).toBe(false);
  expect(await originalIdentity(id, source)).toBeTruthy();
  await page.screenshot({ path: info.outputPath('material-profile-reapply-verified.png'), fullPage: true });
});

test('Word material cleanup and Markdown attachment are saved through UI and consumed by export', async ({ page }, info) => {
  test.setTimeout(240_000);
  const project = await loginProject(page, '材料Word');
  const photo = await sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 215, g: 170, b: 130 } } }).jpeg().toBuffer();
  const source = await officeImageFixture(photo), filename = `材料设置-${randomUUID().slice(0, 6)}.docx`;
  const sourceParts = await readZip(source);
  expect(sourceParts.get('word/media/customer-13800138000.jpg')).toEqual(photo);
  for (const part of ['word/header1.xml', 'word/footer1.xml', 'word/comments.xml']) expect(sourceParts.has(part)).toBe(true);
  expect(sourceParts.get('word/document.xml')?.toString('utf8')).toContain('demo@example.com');
  const id = await upload(page, project.id, filename, source, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const initial = (await view(page, id)).revision;
  const details = await openConfiguration(page, filename);
  await details.getByRole('checkbox', { name: '移除 Word 图片', exact: true }).check();
  await details.getByRole('checkbox', { name: '移除页眉页脚', exact: true }).check();
  await details.getByRole('combobox', { name: 'Word 批注', exact: true }).selectOption('remove');
  await details.getByRole('checkbox', { name: '附带 Markdown', exact: true }).check();
  await details.screenshot({ path: info.outputPath('material-word-settings-panel.png') });
  await details.locator('summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('material-word-settings-upper.png') });
  await details.getByRole('checkbox', { name: '附带 Markdown', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('material-word-settings-lower.png') });
  await page.screenshot({ path: info.outputPath('material-word-settings.png'), fullPage: true });
  const saved = await saveThroughUi(page, id, initial);
  expect(saved.configureBody.configuration).toMatchObject({ removeImages: true, removeHeaderFooter: true, commentHandlingMode: 'remove' });
  expect(saved.configureBody.configuration.outputFormats).toEqual(expect.arrayContaining(['docx', 'md']));
  const settings = await readConfiguration(page, id);
  expect(settings.effective.profile.word).toMatchObject({ removeImages: true, removeHeaderFooter: true, commentHandlingMode: 'remove' });
  expect(settings.effective.additionalOutputs.markdown).toBe(true);
  await page.getByRole('button', { name: '逐条复核', exact: true }).click();
  await page.getByRole('checkbox', { name: '清除内嵌图片选区像素，生成 DOCX 副本', exact: true }).check();
  const decisions = page.getByLabel(/^标记 \d+ 处理决定$/);
  await expect(decisions.first()).toBeVisible();
  for (const decision of await decisions.all()) await decision.selectOption('redact');
  const reviewResponsePromise = page.waitForResponse(r => r.request().method() === 'PUT' && apiPath(r) === `/api/documents/${id}/review`);
  await page.getByRole('button', { name: '保存复核', exact: true }).click();
  const reviewResponse = await reviewResponsePromise;
  expect(reviewResponse.status(), await reviewResponse.text()).toBe(200);
  expect(reviewResponse.request().postDataJSON().pageReview?.mode).toBe('raster');
  const reviewReceipt = await reviewResponse.json() as { revision: number };
  expect(reviewReceipt).toMatchObject({ revision: saved.queued.revision + 1 });
  expect(await view(page, id)).toMatchObject({ id, revision: reviewReceipt.revision, pageReview: { mode: 'raster' } });
  await expect(page.getByText('复核已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导出已选标记的处理副本', exact: true }).click();
  const primary = page.getByRole('button', { name: '核验并下载 DOCX', exact: true });
  await expect(primary).toBeEnabled({ timeout: 60_000 });
  const downloadDocx = page.waitForEvent('download'); await primary.click();
  const docx = await readFile((await (await downloadDocx).path())!);
  await writeFile(info.outputPath('material-word-redacted.docx'), docx);
  const parts = await readZip(docx);
  expect([...parts.keys()].filter(path => /word\/(?:header|footer|comments)\d*\.xml$/u.test(path))).toEqual([]);
  expect([...parts.keys()].filter(path => path.startsWith('word/media/'))).toEqual([]);
  const documentXml = parts.get('word/document.xml')?.toString('utf8') ?? '';
  expect(documentXml).not.toMatch(/<w:(?:drawing|pict)\b/u);
  expect(documentXml).not.toContain('demo@example.com');
  expect(documentXml).toContain('Public image fixture');
  await expect(page.getByRole('button', { name: '核验并下载 Markdown', exact: true })).toBeEnabled();
  const downloadMd = page.waitForEvent('download');
  await page.getByRole('button', { name: '核验并下载 Markdown', exact: true }).click();
  const markdown = await readFile((await (await downloadMd).path())!);
  await writeFile(info.outputPath('material-word-redacted.md'), markdown);
  expect(markdown.length).toBeGreaterThan(0);
  expect(markdown.toString('utf8')).not.toContain('demo@example.com');
  expect(await originalIdentity(id, source)).toBeTruthy();
  await writeFile(info.outputPath('material-word-artifact-hashes.json'), JSON.stringify({ docx: createHash('sha256').update(docx).digest('hex'), markdown: createHash('sha256').update(markdown).digest('hex') }, null, 2));
  await page.screenshot({ path: info.outputPath('material-word-output.png'), fullPage: true });
});

test('PDF material color and DOCX/Markdown attachments reach real downloaded artifacts', async ({ page }, info) => {
  test.setTimeout(240_000);
  const project = await loginProject(page, '材料PDF');
  const source = pdfFixture({ text: 'Phone 13800138000 synthetic source' });
  const filename = `材料设置-${randomUUID().slice(0, 6)}.pdf`;
  const id = await upload(page, project.id, filename, source, 'application/pdf');
  const initial = (await view(page, id)).revision;
  const details = await openConfiguration(page, filename);
  await details.getByRole('combobox', { name: '本材料遮盖颜色', exact: true }).selectOption('purple');
  await details.getByRole('checkbox', { name: '附加 Word（DOCX）', exact: true }).check();
  await details.getByRole('checkbox', { name: '附带 Markdown', exact: true }).check();
  await details.screenshot({ path: info.outputPath('material-pdf-settings-panel.png') });
  await page.screenshot({ path: info.outputPath('material-pdf-settings.png'), fullPage: true });
  const saved = await saveThroughUi(page, id, initial);
  expect(saved.configureBody.configuration).toMatchObject({ maskStyle: 'purple' });
  expect(saved.configureBody.configuration.outputFormats).toEqual(expect.arrayContaining(['pdf', 'docx', 'md']));
  const settings = await readConfiguration(page, id);
  expect(settings.effective.additionalOutputs).toMatchObject({ pdfDocx: true, markdown: true });
  await page.getByRole('button', { name: '逐条复核', exact: true }).click();
  const decisions = page.getByLabel(/^标记 \d+ 处理决定$/);
  await expect(decisions.first()).toBeVisible();
  for (const decision of await decisions.all()) await decision.selectOption('redact');
  await page.getByRole('checkbox', { name: '转换为不可选字的图片型 PDF 副本', exact: true }).check();
  await page.getByRole('button', { name: '保存复核', exact: true }).click();
  await expect(page.getByText('复核已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导出已选标记的处理副本', exact: true }).click();
  const primary = page.getByRole('button', { name: '核验并下载 PDF', exact: true });
  await expect(primary).toBeEnabled({ timeout: 60_000 });
  const downloadPdf = page.waitForEvent('download'); await primary.click();
  const pdf = await readFile((await (await downloadPdf).path())!);
  await writeFile(info.outputPath('material-pdf-redacted.pdf'), pdf);
  const reader = await openPdf(pdf);
  let png: Buffer;
  try { expect(reader.count).toBe(1); const output = await reader.page(0, 2); expect(output.text).toBe(''); png = output.png; }
  finally { reader.close(); }
  const pixels = await sharp(png!).removeAlpha().raw().toBuffer();
  let purple = 0;
  for (let offset = 0; offset < pixels.length; offset += 3) if (pixels[offset] === MASK_COLORS.purple[0] && pixels[offset + 1] === MASK_COLORS.purple[1] && pixels[offset + 2] === MASK_COLORS.purple[2]) purple++;
  expect(purple).toBeGreaterThan(0);
  const outputs = await page.request.get(`/api/documents/${id}/outputs?revision=${(await view(page, id)).revision}`);
  expect(outputs.status(), await outputs.text()).toBe(200);
  expect((await outputs.json()).map((item: { role: string }) => item.role)).toEqual(expect.arrayContaining(['primary', 'markdown', 'pdf-docx']));
  const downloadMd = page.waitForEvent('download');
  await page.getByRole('button', { name: '核验并下载 Markdown', exact: true }).click();
  const markdown = await readFile((await (await downloadMd).path())!);
  await writeFile(info.outputPath('material-pdf-redacted.md'), markdown);
  expect(markdown.length).toBeGreaterThan(0); expect(markdown.toString()).not.toContain('13800138000');
  const downloadWord = page.waitForEvent('download');
  await page.getByRole('button', { name: '核验并下载 Word 副本', exact: true }).click();
  const docx = await readFile((await (await downloadWord).path())!);
  await writeFile(info.outputPath('material-pdf-redacted.docx'), docx);
  const wordParts = await readZip(docx);
  expect([...wordParts.keys()]).toContain('word/document.xml');
  expect(wordParts.get('word/document.xml')?.toString('utf8')).toMatch(/<w:drawing\b/u);
  expect(wordParts.get('word/media/page-1.png')).toBeDefined();
  const primaryReader = await openPdf(pdf);
  try {
    expect(primaryReader.count).toBe(1);
    const rendered = await primaryReader.page(0, 2);
    await writeFile(info.outputPath('material-pdf-redacted-page.png'), rendered.png);
    expect(createHash('sha256').update(wordParts.get('word/media/page-1.png')!).digest('hex'))
      .toBe(createHash('sha256').update(rendered.png).digest('hex'));
  } finally { primaryReader.close(); }
  expect(await originalIdentity(id, source)).toBeTruthy();
  await writeFile(info.outputPath('material-pdf-artifact-hashes.json'), JSON.stringify({ pdf: createHash('sha256').update(pdf).digest('hex'), markdown: createHash('sha256').update(markdown).digest('hex'), docx: createHash('sha256').update(docx).digest('hex'), pagePng: createHash('sha256').update(wordParts.get('word/media/page-1.png')!).digest('hex') }, null, 2));
  await page.screenshot({ path: info.outputPath('material-pdf-output.png'), fullPage: true });
});
