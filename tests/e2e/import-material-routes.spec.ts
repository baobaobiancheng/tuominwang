// Research candidate; copy to tests/e2e/import-material-routes.spec.ts only after the 056 API/UI bundle is frozen.
import { test, expect } from './fixture.ts';
import type { Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readOriginal } from '../../packages/adapters/storage.ts';
import { resolve } from 'node:path';
import pg from 'pg';

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function createProject(page: Page) {
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录工作台', exact: true }).click();
  await page.locator('.create-project summary').click();
  const name = `逐文件类型-${randomUUID().slice(0, 8)}`;
  await page.getByLabel('项目名称', { exact: true }).fill(name);
  const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/projects');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  const created = await response;
  expect(created.status()).toBe(200);
  const project = await created.json() as { id: string; name: string };
  expect(project.name).toBe(name);
  await expect(page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  return project.id;
}

async function assertOriginal(documentId: string, bytes: Buffer, expectedRoute: string) {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (!url.pathname.startsWith('/tmw_test_')) throw new Error('ISOLATED_DATABASE_REQUIRED');
  if (!resolve(process.env.DATA_DIR ?? '').startsWith(resolve('.data/test-runs') + '/run-')) throw new Error('ISOLATED_OBJECT_STORE_REQUIRED');
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  try {
    const { rows } = await db.query('SELECT source_id, source_hash, import_document_type, revision, document_policy_revision, recognition FROM documents WHERE id=$1', [documentId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].import_document_type).toBe(expectedRoute);
    expect(rows[0].revision).toBe(0);
    expect(rows[0].document_policy_revision).toBe(1);
    expect(rows[0].source_hash).toBe(digest(bytes));
    expect(await readOriginal(rows[0].source_id)).toEqual(bytes);
    return rows[0].recognition?.documentType;
  } finally { await db.end(); }
}

test('selected import type reaches the first detect worker; unchanged source bytes and immutable batch route', async ({ page }, info) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const projectId = await createProject(page);
  const origin = new URL(page.url()).origin;
  const marker = `路由专用合成-${randomUUID()}`;
  const entryId = randomUUID(), now = new Date().toISOString();
  const ruleset = await page.request.post('/api/presets/rulesets', { headers: { origin }, data: { name: `导入路由-${randomUUID()}` } });
  expect(ruleset.status()).toBe(200);
  const initial = await ruleset.json();
  const entry = { id: entryId, pattern: marker, normalizedPattern: marker, entityType: 'synthetic_contract_route', kind: 'forceDetect', matchMode: 'exact', enabled: true, source: 'manual', createdAt: now, updatedAt: now, materialRouteKeys: ['contract'] };
  const savedRules = await page.request.put(`/api/presets/rulesets/${initial.settings.id}`, { headers: { origin }, data: { revision: initial.revision, settings: { ...initial.settings, entries: [entry] } } });
  expect(savedRules.status()).toBe(200);
  const rules = await savedRules.json();
  const presetResponse = await page.request.get(`/api/projects/${projectId}/presets`);
  expect(presetResponse.status()).toBe(200);
  const preset = await presetResponse.json();
  const applied = await page.request.put(`/api/projects/${projectId}/presets`, { headers: { origin }, data: { revision: preset.revision, profileId: preset.profile?.settings.id ?? null, ...(preset.profile ? { profileRevision: preset.profile.revision } : {}), rulesetId: rules.settings.id, rulesetRevision: rules.revision } });
  expect(applied.status()).toBe(200);

  const original = Buffer.from(`公开合成行\n${marker}\n`, 'utf8');
  const names = ['合同路由.txt', '普通路由.txt'];
  await page.getByRole('button', { name: '导入材料', exact: true }).click();
  await page.getByLabel('选择文件', { exact: true }).setInputFiles(names.map(name => ({ name, mimeType: 'text/plain', buffer: original })));
  await page.getByRole('combobox', { name: `${names[0]} 的导入材料类型`, exact: true }).selectOption('contract');
  await page.getByRole('combobox', { name: `${names[1]} 的导入材料类型`, exact: true }).selectOption('general');
  await page.screenshot({ path: info.outputPath('per-file-route-before-upload.png'), fullPage: true });
  const manifestPromise = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/projects/${projectId}/upload-batches`);
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  const manifestResponse = await manifestPromise;
  expect(manifestResponse.status()).toBe(200);
  const submitted = manifestResponse.request().postDataJSON() as { id: string; files: { path: string; documentType?: string }[] };
  expect(submitted.files.map(item => [item.path, item.documentType])).toEqual([[names[0], 'contract'], [names[1], 'general']]);
  await expect(page.getByText('已保存', { exact: true })).toHaveCount(2, { timeout: 60_000 });
  const batch = await page.request.get(`/api/projects/${projectId}/upload-batches/${submitted.id}`);
  expect(batch.status()).toBe(200);
  expect((await batch.json()).files.map((item: { documentType: string }) => item.documentType)).toEqual(['contract', 'general']);
  await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
  const listed = await page.request.get(`/api/projects/${projectId}/documents`);
  expect(listed.status()).toBe(200);
  const docs = await listed.json() as { id: string; name: string }[];
  const contractId = docs.find(d => d.name.endsWith(names[0]))?.id;
  const generalId = docs.find(d => d.name.endsWith(names[1]))?.id;
  expect(contractId).toBeTruthy(); expect(generalId).toBeTruthy();

  async function completed(id: string) {
    let view: any;
    await expect.poll(async () => {
      const response = await page.request.get(`/api/documents/${id}`);
      expect(response.status()).toBe(200);
      view = await response.json();
      if (view.job?.kind && view.job.kind !== 'detect') throw new Error(`unexpected first job ${view.job.kind}`);
      if (view.job?.status === 'failed' || view.job?.status === 'cancelled') throw new Error(`first detect ${view.job.status}`);
      return view.job?.status;
    }, { timeout: 90_000, intervals: [1000, 2000, 3000] }).toBe('succeeded');
    return view;
  }
  const contract = await completed(contractId!), general = await completed(generalId!);
  expect(contract.revision).toBe(0); expect(general.revision).toBe(0);
  const routed = contract.marks.find((mark: any) => contract.text.slice(mark.start, mark.end) === marker && mark.rawEntityType === 'synthetic_contract_route');
  expect(routed).toBeTruthy();
  expect(routed.sources.some((source: { code: string }) => source.code === `ruleset-force-detect:${entryId}`)).toBe(true);
  expect(general.marks.some((mark: any) => general.text.slice(mark.start, mark.end) === marker && mark.rawEntityType === 'synthetic_contract_route')).toBe(false);
  expect(await assertOriginal(contractId!, original, 'contract')).toBe('contract');
  expect(await assertOriginal(generalId!, original, 'general')).toBe('general');
  // The API poll above is read-only and does not refresh the already-mounted materials list.
  const refreshedList = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === `/api/projects/${projectId}/documents`);
  await page.getByRole('region', { name: '材料列表' }).getByRole('button', { name: '刷新材料' }).click();
  const refreshedResponse = await refreshedList;
  expect(refreshedResponse.status()).toBe(200);
  const refreshedDocs = await refreshedResponse.json() as { id: string; state: string }[];
  expect(refreshedDocs.find(item => item.id === contractId)?.state).toBe('review');
  expect(refreshedDocs.find(item => item.id === generalId)?.state).toBe('review');
  const contractRow = page.getByRole('region', { name: '材料列表' }).getByRole('button', { name: /合同路由\.txt/ });
  await expect(contractRow).toContainText('可复核');
  await contractRow.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('per-file-route-list-after-first-detect.png') });
  await contractRow.click();
  await expect(page.getByRole('region', { name: '文档复核' })).toBeVisible();
  await page.getByRole('button', { name: '逐条复核', exact: true }).click();
  const matchedQuote = page.getByRole('button', { name: marker, exact: true });
  await expect(matchedQuote).toBeVisible();
  const matchedMark = page.locator('.mark').filter({ has: matchedQuote });
  await expect(matchedMark).toContainText('规则匹配');
  await matchedMark.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('per-file-route-after-first-detect.png') });
  const settings = page.locator('details.document-configuration');
  await settings.locator('summary').click();
  await expect(settings.getByRole('combobox', { name: '材料类型', exact: true })).toHaveValue('contract');
  await expect(settings).toContainText('当前已应用');
  await settings.getByRole('combobox', { name: '材料类型', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('per-file-route-applied-settings.png') });
});
