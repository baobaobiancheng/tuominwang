// Intended destination: tests/e2e/document-configuration-load.spec.ts
// Browser actions are real; only the profile catalogue GET is fault injected.
import { test, expect } from './fixture.ts';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { readOriginal } from '../../packages/adapters/storage.ts';

async function rawPolicy(id: string) {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (!url.pathname.startsWith('/tmw_test_')) throw new Error('ISOLATED_DATABASE_REQUIRED');
  const db = new pg.Client({ connectionString: url.href }); await db.connect();
  try {
    const result = await db.query('SELECT revision,document_policy_revision,document_policy,source_id,source_hash FROM documents WHERE id=$1', [id]);
    expect(result.rows).toHaveLength(1);
    return result.rows[0];
  } finally { await db.end(); }
}

test('catalogue failure and slow retry block configuration writes; loaded snapshot can then be edited', async ({ page }) => {
  test.setTimeout(150_000); page.setDefaultTimeout(15_000);
  const source = Buffer.from('姓名张三 电话13800138000', 'utf8'), fileName = `配置加载-${randomUUID().slice(0, 6)}.txt`;
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录工作台', exact: true }).click();
  await page.locator('.create-project summary').click();
  const projectName = `配置恢复-${randomUUID().slice(0, 8)}`;
  await page.getByLabel('项目名称', { exact: true }).fill(projectName);
  const projectResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/projects');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  const created = await projectResponse; expect(created.status()).toBe(200);
  const projectId = (await created.json()).id as string;
  await expect(page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: projectName, exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: '导入材料', exact: true }).click();
  await page.getByLabel('选择文件', { exact: true }).setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: source });
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
  let documentId = '';
  await expect.poll(async () => {
    const response = await page.request.get(`/api/projects/${projectId}/documents`);
    if (!response.ok()) return false;
    documentId = ((await response.json()) as any[]).find(item => item.name === fileName)?.id ?? '';
    return !!documentId;
  }, { timeout: 45_000 }).toBe(true);
  await expect.poll(async () => (await (await page.request.get(`/api/documents/${documentId}`)).json()).state, { timeout: 45_000 }).toBe('review');

  const origin = new URL(page.url()).origin;
  const createdProfile = await page.request.post('/api/presets/profiles', { headers: { origin }, data: { name: `仅电话-${randomUUID().slice(0, 6)}` } });
  expect(createdProfile.status()).toBe(200);
  const profile = await createdProfile.json();
  const updatedProfile = await page.request.put(`/api/presets/profiles/${profile.settings.id}`, { headers: { origin }, data: { revision: profile.revision, settings: { ...profile.settings, enabledEntityTypeIds: ['phone'] } } });
  expect(updatedProfile.status()).toBe(200);
  const current = await (await page.request.get(`/api/documents/${documentId}`)).json();
  const configured = await page.request.post(`/api/documents/${documentId}/configuration`, { headers: { origin }, data: { revision: current.revision, configuration: { profileId: profile.settings.id, documentType: 'auto' } } });
  expect(configured.status()).toBe(200);
  const recognize = await page.request.post(`/api/documents/${documentId}/recognize`, { headers: { origin }, data: { revision: (await configured.json()).revision, ner: false } });
  expect(recognize.status()).toBe(200);
  await expect.poll(async () => (await (await page.request.get(`/api/documents/${documentId}`)).json()).state, { timeout: 45_000 }).toBe('review');
  const deleted = await page.request.delete(`/api/presets/profiles/${profile.settings.id}`, { headers: { origin }, data: { revision: (await updatedProfile.json()).revision } });
  expect(deleted.status()).toBe(200);
  const before = await rawPolicy(documentId);
  expect(await readOriginal(before.source_id)).toEqual(source);

  let catalogueRequests = 0, releaseSlow!: () => void, markSlow!: () => void;
  const slowStarted = new Promise<void>(resolve => { markSlow = resolve; });
  const slowGate = new Promise<void>(resolve => { releaseSlow = resolve; });
  let configurationPosts = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === `/api/documents/${documentId}/configuration`) configurationPosts++; });
  await page.route('**/api/presets/profiles', async route => {
    catalogueRequests++;
    if (catalogueRequests === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"CATALOGUE_UNAVAILABLE"}' });
    if (catalogueRequests === 2) { markSlow(); await slowGate; }
    return route.continue();
  });
  await page.getByRole('button', { name: fileName, exact: false }).click();
  const details = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: '本材料识别与脱敏设置' }) });
  await details.locator('summary').click();
  await expect(details.getByRole('alert')).toContainText('读取失败');
  await expect(details.getByRole('button', { name: '保存设置并重新识别', exact: true })).toBeDisabled();
  expect(configurationPosts).toBe(0);
  expect(await rawPolicy(documentId)).toEqual(before);
  await details.getByRole('button', { name: '重试加载材料设置', exact: true }).click();
  await slowStarted;
  await expect(details.getByRole('status')).toContainText('正在读取材料设置');
  await expect(details.getByRole('button', { name: '保存设置并重新识别', exact: true })).toBeDisabled();
  expect(configurationPosts).toBe(0);
  expect(await rawPolicy(documentId)).toEqual(before);
  releaseSlow();
  await expect(details.getByRole('button', { name: '保存设置并重新识别', exact: true })).toBeEnabled();
  await expect(details.getByRole('combobox', { name: '使用方案', exact: true })).toHaveValue(profile.settings.id);
  await expect(details.getByRole('option', { name: '已应用方案快照（原方案不在个人目录）' })).toBeAttached();
  await details.getByRole('combobox', { name: '材料类型', exact: true }).selectOption('general');
  const saveResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/documents/${documentId}/configuration`);
  const recognizeResponse = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/documents/${documentId}/recognize`);
  await details.getByRole('button', { name: '保存设置并重新识别', exact: true }).click();
  await page.getByRole('alertdialog', { name: '操作确认' }).getByRole('button', { name: '确认执行', exact: true }).click();
  expect((await saveResponse).status()).toBe(200);
  expect((await recognizeResponse).status()).toBe(200);
  expect(configurationPosts).toBe(1);
  await expect.poll(async () => (await (await page.request.get(`/api/documents/${documentId}`)).json()).state, { timeout: 45_000 }).toBe('review');
  const after = await rawPolicy(documentId);
  expect(after.revision).toBeGreaterThan(before.revision);
  expect(after.document_policy).not.toEqual(before.document_policy);
  expect(after.source_id).toBe(before.source_id);
  expect(after.source_hash).toBe(before.source_hash);
  expect(await readOriginal(after.source_id)).toEqual(source);
});
