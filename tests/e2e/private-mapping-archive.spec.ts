// Research candidate; intended destination tests/e2e/private-mapping-archive.spec.ts after 056 bundle freeze.
import { test, expect } from './fixture.ts';
import type { APIResponse, Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readOriginal } from '../../packages/adapters/storage.ts';
import { readZip } from '../../packages/core/office-zip.ts';
import { resolve } from 'node:path';
import pg from 'pg';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function windowSeconds(response: APIResponse, header: 'retry-after' | 'x-ratelimit-reset') {
  const raw = response.headers()[header];
  const value = Number(raw);
  expect(Number.isInteger(value) && value >= 0 && value <= 60, `${header}: ${raw}`).toBe(true);
  return value + 1;
}

// This test performs several authenticated reads after the ZIP download. Respect the
// server's real per-user window; never repeat a write request to recover a 429.
async function reserveArchiveReadBudget(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const status = await page.request.get('/api/session');
    if (status.status() === 429) {
      await page.waitForTimeout(windowSeconds(status, 'retry-after') * 1000);
      continue;
    }
    expect(status.status(), await status.text()).toBe(200);
    const remaining = Number(status.headers()['x-ratelimit-remaining']);
    expect(Number.isInteger(remaining) && remaining >= 0 && remaining <= 120).toBe(true);
    if (remaining >= 12) return;
    await page.waitForTimeout(windowSeconds(status, 'x-ratelimit-reset') * 1000);
  }
  throw new Error('ARCHIVE_READ_WINDOW_NOT_RECOVERED');
}

function archiveResponse(page: Page, projectId: string, kind: 'documents' | 'export-mapping-archives' | 'folder-mapping-archives') {
  return page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === `/api/projects/${projectId}/${kind}`);
}

async function loginAndProject(page: Page, label: string) {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录工作台', exact: true }).click();
  await page.locator('.create-project summary').click();
  const name = `${label}-${randomUUID().slice(0, 8)}`;
  await page.getByLabel('项目名称', { exact: true }).fill(name);
  const created = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/projects');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(200);
  const project = await response.json() as { id: string; name: string };
  expect(project.name).toBe(name);
  await expect(page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  return project.id;
}

async function sourceBytes(documentId: string) {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (!url.pathname.startsWith('/tmw_test_')) throw new Error('ISOLATED_DATABASE_REQUIRED');
  if (!resolve(process.env.DATA_DIR ?? '').startsWith(resolve('.data/test-runs') + '/run-')) throw new Error('ISOLATED_OBJECT_STORE_REQUIRED');
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  try {
    const result = await db.query('SELECT source_id,source_hash FROM documents WHERE id=$1', [documentId]);
    expect(result.rows).toHaveLength(1);
    const bytes = await readOriginal(result.rows[0].source_id);
    expect(sha256(bytes)).toBe(result.rows[0].source_hash);
    return bytes;
  } finally { await db.end(); }
}

async function waitJob(page: Page, jobId: string) {
  let latest = '';
  await expect.poll(async () => {
    const r = await page.request.get(`/api/jobs/${jobId}/events?after=0&limit=1`);
    expect(r.status()).toBe(200);
    latest = (await r.json()).status;
    if (latest === 'failed' || latest === 'cancelled') throw new Error(`export job ${jobId} ${latest}`);
    return latest;
  }, { timeout: 90_000, intervals: [1000, 2000, 3000] }).toBe('succeeded');
}

async function waitFirstReview(page: Page, documentId: string) {
  await expect.poll(async () => {
    const response = await page.request.get(`/api/documents/${documentId}`);
    expect(response.status()).toBe(200);
    const view = await response.json() as { revision: number; state: string; job?: { kind: string; status: string } };
    expect(view.revision).toBe(0);
    if (view.job?.kind && view.job.kind !== 'detect') throw new Error(`unexpected first job ${view.job.kind}`);
    if (view.job?.status === 'failed' || view.job?.status === 'cancelled') throw new Error(`first detect ${view.job.status}`);
    return `${view.state}:${view.job?.status}`;
  }, { timeout: 90_000, intervals: [1500, 2500, 3000] }).toBe('review:succeeded');
}

test('single export uses one-off name and creates an authenticated immutable mapping archive', async ({ page }, info) => {
  test.setTimeout(180_000);
  const projectId = await loginAndProject(page, '私有假名归档');
  const presetBeforeResponse = await page.request.get(`/api/projects/${projectId}/presets`);
  expect(presetBeforeResponse.status()).toBe(200);
  const presetBefore = await presetBeforeResponse.json();
  const phone = '13800138000';
  const original = Buffer.from(`合成客户电话 ${phone}\n`, 'utf8');
  const fileName = `合成客户-${randomUUID().slice(0, 8)}.txt`;
  await page.getByRole('button', { name: '导入材料', exact: true }).click();
  await page.getByLabel('选择文件', { exact: true }).setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: original });
  const uploaded = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/projects/${projectId}/files`);
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  const uploadResponse = await uploaded;
  expect(uploadResponse.status()).toBe(200);
  const documentId = (await uploadResponse.json()).id as string;
  await waitFirstReview(page, documentId);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(fileName.replaceAll('.', '\\.')) }).click();
  await page.getByRole('button', { name: '逐条复核', exact: true }).click();
  await expect(page.getByLabel('标记 1 处理决定')).toBeVisible({ timeout: 45_000 });
  await page.getByLabel('标记 1 处理决定').selectOption('redact');
  await page.getByRole('button', { name: '选择项目假名', exact: true }).click();
  await page.getByRole('button', { name: '创建新假名', exact: true }).click();
  await page.getByRole('alertdialog', { name: '操作确认' }).getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByLabel('标记 1 脱敏方式')).toHaveValue('alias');
  const reviewSubmitted = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/documents/${documentId}/review`);
  await page.getByRole('button', { name: '保存复核', exact: true }).click();
  const reviewResponse = await reviewSubmitted;
  expect(reviewResponse.status()).toBe(200);
  const reviewedRevision = (await reviewResponse.json()).revision as number;
  await expect(page.getByText('复核已保存', { exact: true })).toBeVisible();
  expect(await sourceBytes(documentId)).toEqual(original);

  const oneOffName = `本次合成私表-${randomUUID().slice(0, 8)}`;
  await page.getByLabel('本次导出假名表名称', { exact: true }).fill(oneOffName);
  await page.screenshot({ path: info.outputPath('single-export-name-before-submit.png'), fullPage: true });
  const exportSubmitted = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/documents/${documentId}/export`);
  await page.getByRole('button', { name: '导出已选标记的处理副本', exact: true }).click();
  const exportResponse = await exportSubmitted;
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.request().postDataJSON()).toEqual({ revision: reviewedRevision, pseudonymTableName: oneOffName });
  const exportJobId = (await exportResponse.json()).id as string;
  await waitJob(page, exportJobId);
  await expect(page.getByRole('button', { name: '核验并下载 TXT', exact: true })).toBeEnabled({ timeout: 45_000 });
  const firstDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '核验并下载 TXT', exact: true }).click();
  const firstPath = info.outputPath('single-redacted-before-archive.txt');
  await (await firstDownload).saveAs(firstPath);
  const redactedBefore = await readFile(firstPath);
  expect(redactedBefore.toString('utf8')).not.toContain(phone);
  expect(await sourceBytes(documentId)).toEqual(original);

  await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
  await page.locator('details').filter({ has: page.locator('summary', { hasText: '导出假名表' }) }).locator('summary').click();
  await page.getByRole('button', { name: '刷新自动归档', exact: true }).click();
  const archivesResponse = await page.request.get(`/api/projects/${projectId}/export-mapping-archives`);
  expect(archivesResponse.status()).toBe(200);
  const archives = await archivesResponse.json() as { id: string; jobId: string; documentId: string; revision: number; tableName: string; hash: string }[];
  const archive = archives.find(item => item.jobId === exportJobId);
  expect(archive).toBeTruthy();
  expect(archive).toMatchObject({ documentId, revision: reviewedRevision, tableName: `${oneOffName}.lpm` });
  await expect(page.getByRole('list', { name: '自动归档的假名表' }).getByRole('button', { name: new RegExp(oneOffName) })).toBeVisible();
  const archiveDownload = page.waitForEvent('download');
  await page.getByRole('list', { name: '自动归档的假名表' }).getByRole('button', { name: new RegExp(oneOffName) }).click();
  const archivePath = info.outputPath('single-private-mapping.lpm');
  await (await archiveDownload).saveAs(archivePath);
  const mappingBytes = await readFile(archivePath);
  expect(sha256(mappingBytes)).toBe(archive!.hash);
  const mapping = JSON.parse(mappingBytes.toString('utf8'));
  expect(mapping._meta.tableName).toBe(oneOffName);
  expect(mapping._meta.jobId).toBe(exportJobId);
  expect(Object.values(mapping.mappings)).toContain(phone);
  expect(mapping.occurrences.some((item: { documentId: string; original: string }) => item.documentId === documentId && item.original === phone)).toBe(true);
  await page.screenshot({ path: info.outputPath('single-private-archive-and-result.png'), fullPage: true });

  const isolated = await page.context().browser()!.newContext();
  try {
    const unauthenticated = await isolated.request.get(new URL(`/api/projects/${projectId}/export-mapping-archives/${archive!.id}/download`, page.url()).toString());
    expect(unauthenticated.status()).toBe(401);
  } finally { await isolated.close(); }
  await page.getByRole('button', { name: new RegExp(fileName.replaceAll('.', '\\.')) }).click();
  const secondDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '核验并下载 TXT', exact: true }).click();
  const secondPath = info.outputPath('single-redacted-after-archive.txt');
  await (await secondDownload).saveAs(secondPath);
  expect(sha256(await readFile(secondPath))).toBe(sha256(redactedBefore));
  expect(await sourceBytes(documentId)).toEqual(original);
  const presetAfterResponse = await page.request.get(`/api/projects/${projectId}/presets`);
  expect(presetAfterResponse.status()).toBe(200);
  expect(await presetAfterResponse.json()).toEqual(presetBefore);
  const documentAfter = await page.request.get(`/api/documents/${documentId}`);
  expect(documentAfter.status()).toBe(200);
  expect((await documentAfter.json()).revision).toBe(reviewedRevision);
});

test('unified folder mapping is frozen before jobs and excludes an unselected file with an older artifact', async ({ page }, info) => {
  test.setTimeout(240_000);
  const projectId = await loginAndProject(page, '合成统一批次');
  const samples = [
    { name: '选入甲.txt', phone: '13800138000', bytes: Buffer.from('甲方电话 13800138000\n') },
    { name: '选入乙.txt', phone: '13900139000', bytes: Buffer.from('乙方电话 13900139000\n') },
    { name: '跳过旧副本.txt', phone: '13700137000', bytes: Buffer.from('旧副本电话 13700137000\n') },
  ];
  await page.getByRole('button', { name: '导入材料', exact: true }).click();
  await page.getByLabel('选择文件', { exact: true }).setInputFiles(samples.map(s => ({ name: s.name, mimeType: 'text/plain', buffer: s.bytes })));
  const manifestSubmitted = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/projects/${projectId}/upload-batches`);
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  const manifestResponse = await manifestSubmitted;
  expect(manifestResponse.status()).toBe(200);
  const uploadBatchId = (manifestResponse.request().postDataJSON() as { id: string }).id;
  await expect(page.getByText('已保存', { exact: true })).toHaveCount(3, { timeout: 60_000 });
  await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
  const docsResponse = await page.request.get(`/api/projects/${projectId}/documents`);
  expect(docsResponse.status()).toBe(200);
  const docs = await docsResponse.json() as { id: string; name: string }[];
  const ids = samples.map(s => docs.find(d => d.name.endsWith(s.name))?.id);
  expect(ids.every(Boolean)).toBe(true);
  for (let i = 0; i < samples.length; i++) expect(await sourceBytes(ids[i]!)).toEqual(samples[i]!.bytes);
  for (const id of ids) await waitFirstReview(page, id!);

  // All three review actions happen in the real page. Only A/B create alias marks;
  // C gets a valid older redacted artifact so the selected subset must reject it.
  const revisions: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    await page.getByRole('button', { name: new RegExp(samples[i]!.name.replaceAll('.', '\\.')) }).click();
    await page.getByRole('button', { name: '逐条复核', exact: true }).click();
    await expect(page.getByLabel('标记 1 处理决定')).toBeVisible({ timeout: 45_000 });
    await page.getByLabel('标记 1 处理决定').selectOption('redact');
    if (i < 2) {
      await page.getByRole('button', { name: '选择项目假名', exact: true }).click();
      await page.getByRole('button', { name: '创建新假名', exact: true }).click();
      await page.getByRole('alertdialog', { name: '操作确认' }).getByRole('button', { name: '确认执行', exact: true }).click();
      await expect(page.getByLabel('标记 1 脱敏方式')).toHaveValue('alias');
    }
    const reviewed = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/documents/${ids[i]}/review`);
    await page.getByRole('button', { name: '保存复核', exact: true }).click();
    const saved = await reviewed;
    expect(saved.status()).toBe(200);
    revisions.push((await saved.json()).revision);
    await expect(page.getByText('复核已保存', { exact: true })).toBeVisible();
    if (i === 2) {
      const oldExport = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/documents/${ids[i]}/export`);
      await page.getByRole('button', { name: '导出已选标记的处理副本', exact: true }).click();
      const response = await oldExport;
      expect(response.status()).toBe(200);
      await waitJob(page, (await response.json()).id);
      await expect(page.getByRole('button', { name: '核验并下载 TXT', exact: true })).toBeEnabled({ timeout: 45_000 });
    }
    await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
  }

  const batchViewResponse = await page.request.get(`/api/projects/${projectId}/upload-batches/${uploadBatchId}`);
  expect(batchViewResponse.status()).toBe(200);
  const batchView = await batchViewResponse.json() as { files: { requestId: string; path: string; documentId: string }[] };
  expect(batchView.files.map(f => f.path)).toEqual(samples.map(s => s.name));
  expect(batchView.files.map(f => f.documentId)).toEqual(ids);
  const selectedRequestIds = batchView.files.slice(0, 2).map(f => f.requestId);
  const dbUrl = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (!dbUrl.pathname.startsWith('/tmw_test_')) throw new Error('ISOLATED_DATABASE_REQUIRED');
  const db = new pg.Client({ connectionString: dbUrl.href });
  await db.connect();
  try {
    const exportJobs = async () => (await db.query("SELECT id,document_id,revision,status FROM jobs WHERE document_id=ANY($1::uuid[]) AND kind='export' ORDER BY id", [ids])).rows;
    const beforePrepareJobs = await exportJobs();
    expect(beforePrepareJobs.some(row => row.document_id === ids[2] && row.status === 'succeeded')).toBe(true);
    await page.getByRole('button', { name: '文件夹结果与处理清单', exact: true }).click();
    const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: '文件夹结果', exact: true }) }).last();
    await expect(panel.getByRole('combobox', { name: '导入批次', exact: true })).toContainText('3 份材料');
    await panel.getByRole('combobox', { name: '导入批次', exact: true }).selectOption(uploadBatchId);
    await panel.getByLabel('结果文件夹名称', { exact: true }).fill('合成批次结果');
    await panel.getByRole('checkbox', { name: '统一批次：先保存项目假名映射，再生成本批次副本', exact: true }).check();
    const choose = panel.getByRole('group', { name: '选择本批次导出材料', exact: true });
    await expect(choose.getByRole('checkbox')).toHaveCount(3);
    await choose.getByRole('checkbox', { name: samples[2]!.name, exact: true }).uncheck();
    await expect(choose.getByRole('checkbox', { name: samples[0]!.name, exact: true })).toBeChecked();
    await expect(choose.getByRole('checkbox', { name: samples[1]!.name, exact: true })).toBeChecked();
    const tableName = `本次双材料假名表-${randomUUID().slice(0, 8)}`;
    await panel.getByLabel('文件夹本次统一假名表名称', { exact: true }).fill(tableName);
    await page.screenshot({ path: info.outputPath('folder-selected-two-of-three-before-prepare.png'), fullPage: true });
    const prepared = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/projects/${projectId}/folder-exports`);
    await panel.getByRole('button', { name: '整理结果', exact: true }).click();
    const prepareResponse = await prepared;
    expect(prepareResponse.status()).toBe(200);
    const prepareBody = prepareResponse.request().postDataJSON();
    expect(prepareBody).toMatchObject({ uploadBatchId, batchMapping: true, selectedRequestIds, pseudonymTableName: tableName });
    const created = await prepareResponse.json() as { exportSessionId: string; mappingArchiveId: string; revision: number };
    expect(created.exportSessionId).toBeTruthy(); expect(created.mappingArchiveId).toBeTruthy();
    expect(await exportJobs()).toEqual(beforePrepareJobs); // prepare freezes the private mapping before creating any new export job.
    const sessionUrl = `/api/projects/${projectId}/folder-exports/${created.exportSessionId}`;
    const sessionResponse = await page.request.get(sessionUrl);
    expect(sessionResponse.status()).toBe(200);
    const session = await sessionResponse.json();
    expect(session.selected.map((item: { id: string; revision: number }) => [item.id, item.revision])).toEqual([[ids[0], revisions[0]], [ids[1], revisions[1]]]);
    expect(session.files.map((item: { selected: boolean }) => item.selected)).toEqual([true, true, false]);
    expect(session.files.every((item: { artifactId: string | null; jobStatus: string | null }) => item.artifactId === null && item.jobStatus === null)).toBe(true);
    await expect(panel.getByText(`${samples[2]!.name}：本批次未选择，跳过`, { exact: true })).toBeVisible();

    const preparedList = await page.request.get(`/api/projects/${projectId}/folder-mapping-archives`);
    expect(preparedList.status()).toBe(200);
    const preparedRecord = (await preparedList.json()).find((item: { id: string }) => item.id === created.mappingArchiveId);
    expect(preparedRecord).toMatchObject({ sessionId: created.exportSessionId, state: 'prepared', documents: 2, tableName: `${tableName}.lpm` });
    const beforePublish = await page.request.get(`/api/projects/${projectId}/folder-mapping-archives/${created.mappingArchiveId}/download`);
    expect(beforePublish.status()).toBe(200);
    const frozenBytes = Buffer.from(await beforePublish.body());
    expect(sha256(frozenBytes)).toBe(preparedRecord.hash);
    const frozen = JSON.parse(frozenBytes.toString('utf8'));
    expect(frozen._meta.tableName).toBe(tableName);
    expect(frozen._meta.sessionId).toBe(created.exportSessionId);
    expect(Object.values(frozen.mappings)).toContain(samples[0]!.phone);
    expect(Object.values(frozen.mappings)).toContain(samples[1]!.phone);
    expect(JSON.stringify(frozen)).not.toContain(samples[2]!.phone);
    expect(frozen.occurrences.every((item: { documentId: string }) => [ids[0], ids[1]].includes(item.documentId))).toBe(true);

    const exportSubmitted = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/projects/${projectId}/folder-exports/${created.exportSessionId}/export-batch`);
    await panel.getByRole('button', { name: '生成本批次副本', exact: true }).click();
    const batchExportResponse = await exportSubmitted;
    expect(batchExportResponse.status()).toBe(200);
    expect(batchExportResponse.request().postDataJSON()).toEqual({ revision: created.revision });
    const queued = await batchExportResponse.json() as { jobs: { documentId: string; revision: number; jobId: string }[] };
    expect(queued.jobs.map(item => [item.documentId, item.revision])).toEqual([[ids[0], revisions[0]], [ids[1], revisions[1]]]);
    expect(queued.jobs.some(item => item.documentId === ids[2])).toBe(false);
    for (const item of queued.jobs) await waitJob(page, item.jobId);
    const refreshed = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === `/api/projects/${projectId}/folder-exports/${created.exportSessionId}`);
    await panel.getByRole('button', { name: '刷新本批次状态', exact: true }).click();
    expect((await refreshed).status()).toBe(200);
    await expect(panel.getByRole('button', { name: '生成结果 ZIP 与处理清单', exact: true })).toBeEnabled();
    await expect(panel.getByText(`${samples[2]!.name}：本批次未选择，跳过`, { exact: true })).toBeVisible();

    await reserveArchiveReadBudget(page);
    const manifestSubmitted = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/projects/${projectId}/folder-exports/${created.exportSessionId}/manifest`);
    await panel.getByRole('button', { name: '生成结果 ZIP 与处理清单', exact: true }).click();
    const manifestResponse = await manifestSubmitted;
    expect(manifestResponse.status()).toBe(200);
    await expect(panel.getByRole('status')).toContainText('成功 2，失败 0，跳过 1，取消 0');
    const zipDownload = page.waitForEvent('download');
    await panel.getByRole('button', { name: '下载结果 ZIP', exact: true }).click();
    const zipPath = info.outputPath('folder-two-selected-one-skipped.zip');
    await (await zipDownload).saveAs(zipPath);
    const zip = await readZip(await readFile(zipPath));
    const names = [...zip.keys()];
    const outputA = names.find(name => name.endsWith('/' + samples[0]!.name));
    const outputB = names.find(name => name.endsWith('/' + samples[1]!.name));
    const manifestName = names.find(name => name.endsWith('/脱敏处理清单.html'));
    expect(outputA).toBeTruthy(); expect(outputB).toBeTruthy(); expect(manifestName).toBeTruthy();
    expect(names.some(name => name.endsWith('/' + samples[2]!.name))).toBe(false);
    expect(names.some(name => /\.lpm$/iu.test(name))).toBe(false);
    expect(zip.get(outputA!)!.toString('utf8')).not.toContain(samples[0]!.phone);
    expect(zip.get(outputB!)!.toString('utf8')).not.toContain(samples[1]!.phone);
    for (const part of zip.values()) expect(part.toString('utf8')).not.toContain(samples[2]!.phone);
    const manifestHtml = zip.get(manifestName!)!.toString('utf8');
    for (const sample of samples) expect(manifestHtml).toContain(sample.name);
    expect(manifestHtml).toContain('status-skipped');
    await page.screenshot({ path: info.outputPath('folder-two-success-one-skipped.png'), fullPage: true });

    await reserveArchiveReadBudget(page);
    const openedReads = [
      archiveResponse(page, projectId, 'documents'),
      archiveResponse(page, projectId, 'export-mapping-archives'),
      archiveResponse(page, projectId, 'folder-mapping-archives'),
    ];
    await page.locator('details').filter({ has: page.locator('summary', { hasText: '导出假名表' }) }).locator('summary').click();
    for (const response of await Promise.all(openedReads)) expect(response.status(), await response.text()).toBe(200);
    await reserveArchiveReadBudget(page);
    const refreshedArchives = archiveResponse(page, projectId, 'export-mapping-archives');
    const refreshedFolders = archiveResponse(page, projectId, 'folder-mapping-archives');
    await page.getByRole('button', { name: '刷新自动归档', exact: true }).click();
    expect((await refreshedArchives).status()).toBe(200);
    const completedList = await refreshedFolders;
    expect(completedList.status(), await completedList.text()).toBe(200);
    const completedRecord = (await completedList.json()).find((item: { id: string }) => item.id === created.mappingArchiveId);
    expect(completedRecord).toMatchObject({ state: 'completed', hash: preparedRecord.hash, documents: 2 });
    const folderArchiveButton = page.getByRole('list', { name: '统一批次归档的假名表' }).getByRole('button', { name: new RegExp(tableName) });
    await expect(folderArchiveButton).toBeVisible();
    const mappingDownload = page.waitForEvent('download');
    await folderArchiveButton.click();
    const mappingPath = info.outputPath('folder-private-mapping.lpm');
    await (await mappingDownload).saveAs(mappingPath);
    expect(sha256(await readFile(mappingPath))).toBe(preparedRecord.hash);
    expect(await readFile(mappingPath)).toEqual(frozenBytes);
    const isolated = await page.context().browser()!.newContext();
    try {
      const anonymous = await isolated.request.get(new URL(`/api/projects/${projectId}/folder-mapping-archives/${created.mappingArchiveId}/download`, page.url()).toString());
      expect(anonymous.status()).toBe(401);
    } finally { await isolated.close(); }
    for (let i = 0; i < samples.length; i++) expect(await sourceBytes(ids[i]!)).toEqual(samples[i]!.bytes);
  } finally { await db.end(); }
});
