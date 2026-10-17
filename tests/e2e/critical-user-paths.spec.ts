import { test, expect } from './fixture.ts';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';
import { readZip } from '../../packages/core/office-zip.ts';
import { readOriginal } from '../../packages/adapters/storage.ts';

async function signInAndCreateProject(page: import('@playwright/test').Page, prefix: string) {
  page.setDefaultTimeout(15_000);
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录工作台', exact: true }).click();
  await page.locator('.create-project summary').click();
  const name = `${prefix}-${randomUUID().slice(0, 8)}`;
  await page.getByLabel('项目名称', { exact: true }).fill(name);
  const created = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/projects');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(200);
  const createdProject = await createdResponse.json() as { id: string; name: string };
  expect(createdProject.id).toBeTruthy();
  expect(createdProject.name).toBe(name);
  await expect(page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  const response = await page.request.get('/api/projects');
  expect(response.status()).toBe(200);
  const project = (await response.json()).find((item: any) => item.id === createdProject.id && item.name === name);
  expect(project?.id).toBe(createdProject.id);
  return { name, id: createdProject.id };
}

async function sourceIdentity(documentId: string, expectedBytes: Buffer) {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (!url.pathname.startsWith('/tmw_test_')) throw new Error('ISOLATED_DATABASE_REQUIRED');
  const dataDir = resolve(process.env.DATA_DIR ?? '');
  if (!dataDir.startsWith(resolve('.data/test-runs') + '/run-')) throw new Error('ISOLATED_OBJECT_STORE_REQUIRED');
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  try {
    const result = await db.query('SELECT source_id,source_hash FROM documents WHERE id=$1', [documentId]);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as { source_id: string; source_hash: string };
    const actualBytes = await readOriginal(row.source_id);
    const actualHash = createHash('sha256').update(actualBytes).digest('hex');
    expect(actualBytes).toEqual(expectedBytes);
    expect(actualHash).toBe(row.source_hash);
    return { sourceId: row.source_id, sourceHash: row.source_hash, actualHash };
  } finally { await db.end(); }
}

test('directory output UI generates one reviewed copy and a truthful skipped entry in ZIP', async ({ page }, info) => {
  test.setTimeout(150_000);
  const directory = await mkdtemp(join(tmpdir(), 'tmw-folder-output-'));
  const reviewed = Buffer.from('联系电话 13800138000');
  const waiting = Buffer.from('公开材料，无需处理。');
  try {
    await mkdir(join(directory, '子目录'));
    await writeFile(join(directory, '子目录', '待处理.txt'), reviewed);
    await writeFile(join(directory, '未生成副本.txt'), waiting);
    const project = await signInAndCreateProject(page, '目录结果');
    await page.getByRole('button', { name: '导入材料', exact: true }).click();
    const beforeSelection = Date.now();
    await page.getByLabel('选择目录', { exact: true }).setInputFiles(directory);
    const afterSelection = Date.now();
    const batchCreated = page.waitForResponse(r => r.request().method() === 'POST'
      && new URL(r.url()).pathname === `/api/projects/${project.id}/upload-batches`);
    await page.getByRole('button', { name: '上传文件', exact: true }).click();
    const batchResponse = await batchCreated;
    expect(batchResponse.status()).toBe(200);
    const postedBatch = batchResponse.request().postDataJSON() as { id: string; sourceRootName: string; scannedAt: string; files: unknown[] };
    const scannedAt = Date.parse(postedBatch.scannedAt);
    expect(postedBatch.sourceRootName).toBe(basename(directory));
    expect(postedBatch.files).toHaveLength(2);
    expect(Number.isFinite(scannedAt)).toBe(true);
    expect(postedBatch.scannedAt).toBe(new Date(scannedAt).toISOString());
    expect(scannedAt).toBeGreaterThanOrEqual(beforeSelection);
    expect(scannedAt).toBeLessThanOrEqual(afterSelection);
    const createdBatch = await batchResponse.json() as { id: string };
    expect(createdBatch.id).toBe(postedBatch.id);
    const batchReadback = await page.request.get(`/api/projects/${project.id}/upload-batches/${createdBatch.id}`);
    expect(batchReadback.status()).toBe(200);
    expect((await batchReadback.json()).scannedAt).toBe(postedBatch.scannedAt);
    await expect(page.getByText('已保存', { exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
    const docsResponse = await page.request.get(`/api/projects/${project.id}/documents`);
    expect(docsResponse.status()).toBe(200);
    const docs: any[] = await docsResponse.json();
    const selected = docs.find(doc => doc.name.endsWith('子目录/待处理.txt'));
    const other = docs.find(doc => doc.name.endsWith('未生成副本.txt'));
    expect(selected?.id).toBeTruthy(); expect(other?.id).toBeTruthy();
    const sources = new Map([[selected.id, await sourceIdentity(selected.id, reviewed)], [other.id, await sourceIdentity(other.id, waiting)]]);
    expect(sources.get(selected.id)?.actualHash).toBe(createHash('sha256').update(reviewed).digest('hex'));
    expect(sources.get(other.id)?.actualHash).toBe(createHash('sha256').update(waiting).digest('hex'));

    await page.getByRole('button', { name: /子目录\/待处理\.txt/ }).click();
    await page.getByRole('button', { name: '逐条复核', exact: true }).click();
    const decisions = page.getByLabel(/^标记 \d+ 处理决定$/);
    await expect(decisions.first()).toBeVisible({ timeout: 45_000 });
    for (const decision of await decisions.all()) await decision.selectOption('redact');
    const reviewRevision = selected.revision + 1;
    expect(Number.isSafeInteger(reviewRevision)).toBe(true);
    const saved = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/documents/${selected.id}/review`, { timeout: 30_000 });
    const readback = page.waitForResponse(async r => r.request().method() === 'GET' && new URL(r.url()).pathname === `/api/documents/${selected.id}` && r.status() === 200 && (await r.json()).revision === reviewRevision, { timeout: 30_000 });
    await page.getByRole('button', { name: '保存复核', exact: true }).click();
    const savedResponse = await saved;
    expect(savedResponse.status(), await savedResponse.text()).toBe(200);
    expect((await savedResponse.json()).revision).toBe(reviewRevision);
    const savedDocument = await (await readback).json();
    expect(savedDocument.id).toBe(selected.id);
    expect(savedDocument.revision).toBe(reviewRevision);
    expect(savedDocument.marks).toHaveLength(1);
    expect(savedDocument.marks[0].decision).toBe('redact');
    await expect(page.getByText('复核已保存', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '导出已选标记的处理副本', exact: true }).click();
    await expect(page.getByRole('button', { name: '核验并下载 TXT', exact: true })).toBeEnabled({ timeout: 45_000 });
    await page.getByRole('button', { name: '返回材料列表', exact: true }).click();

    await page.getByRole('button', { name: '文件夹结果与处理清单', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '导入批次', exact: true })).toContainText('2 份材料');
    await page.getByLabel('结果文件夹名称', { exact: true }).fill('合成目录结果');
    await page.getByRole('button', { name: '整理结果', exact: true }).click();
    const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: '文件夹结果', exact: true }) }).last();
    await expect(panel).toContainText('待处理.txt：已生成副本');
    await expect(panel).toContainText('未生成副本.txt：尚未生成副本');
    const manifestResponse = page.waitForResponse(r => r.request().method() === 'POST' && /\/folder-exports\/[^/]+\/manifest$/.test(new URL(r.url()).pathname));
    await panel.getByRole('button', { name: '生成结果 ZIP 与处理清单', exact: true }).click();
    expect((await manifestResponse).status()).toBe(200);
    await expect(panel.getByRole('status')).toContainText('成功 1，失败 0，跳过 1，取消 0');
    const downloadEvent = page.waitForEvent('download', { timeout: 45_000 });
    const zipResponse = page.waitForResponse(r => r.request().method() === 'GET'
      && /\/folder-exports\/[^/]+\/download$/.test(new URL(r.url()).pathname), { timeout: 45_000 });
    await panel.getByRole('button', { name: '下载结果 ZIP', exact: true }).click();
    const response = await zipResponse;
    expect(response.status()).toBe(200);
    const zipPath = info.outputPath('directory-results.zip');
    await (await downloadEvent).saveAs(zipPath);
    const parts = await readZip(await readFile(zipPath));
    const names = [...parts.keys()];
    const manifestName = names.find(name => name.endsWith('/脱敏处理清单.html'));
    const copyName = names.find(name => name.endsWith('/子目录/待处理.txt'));
    expect(manifestName).toBeTruthy(); expect(copyName).toBeTruthy();
    expect(names.some(name => name.endsWith('/未生成副本.txt'))).toBe(false);
    const html = parts.get(manifestName!)!.toString('utf8');
    expect(html).toContain(`${basename(directory)}/子目录/待处理.txt`);
    expect(html).toContain(`${basename(directory)}/未生成副本.txt`);
    expect(html).toContain('status-success'); expect(html).toContain('status-skipped');
    expect(parts.get(copyName!)!.toString('utf8')).not.toContain('13800138000');
    expect(await sourceIdentity(selected.id, reviewed)).toEqual(sources.get(selected.id));
    expect(await sourceIdentity(other.id, waiting)).toEqual(sources.get(other.id));
    await page.screenshot({ path: info.outputPath('directory-results.png'), fullPage: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('encrypted PDF unlock form rejects wrong password and resumes recognition without changing original', async ({ page }, info) => {
  test.setTimeout(150_000);
  // Path is relative to tests/e2e after this candidate is copied into the formal suite.
  const encrypted = await readFile(new URL('../fixtures/document-unlock/aes256.pdf', import.meta.url));
  const originalHash = createHash('sha256').update(encrypted).digest('hex');
  const project = await signInAndCreateProject(page, '加密解锁');
  await page.getByRole('button', { name: '导入材料', exact: true }).click();
  await page.getByLabel('选择文件', { exact: true }).setInputFiles({ name: '合成加密.pdf', mimeType: 'application/pdf', buffer: encrypted });
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
  const docsResponse = await page.request.get(`/api/projects/${project.id}/documents`);
  expect(docsResponse.status()).toBe(200);
  const document = (await docsResponse.json()).find((item: any) => item.name === '合成加密.pdf');
  expect(document?.id).toBeTruthy();
  await expect.poll(async () => (await (await page.request.get(`/api/documents/${document.id}`)).json()).job?.error_code, { timeout: 45_000 }).toBe('ENCRYPTED_PDF');
  const original = await sourceIdentity(document.id, encrypted);
  expect(original.actualHash).toBe(originalHash);
  await page.getByRole('button', { name: /合成加密\.pdf/ }).click();
  await expect(page.getByLabel('文件密码', { exact: true })).toBeVisible();
  await page.getByLabel('文件密码', { exact: true }).fill('wrong-synthetic-password');
  const rejected = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/documents/${document.id}/unlock`);
  await page.getByRole('button', { name: '解锁文件', exact: true }).click();
  expect((await rejected).status()).toBe(400);
  await expect(page.getByLabel('文件密码', { exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/documents/${document.id}`)).json()).revision).toBe(0);
  expect(await sourceIdentity(document.id, encrypted)).toEqual(original);
  await page.getByLabel('文件密码', { exact: true }).fill('演示-synthetic-password');
  const accepted = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/documents/${document.id}/unlock`);
  await page.getByRole('button', { name: '解锁文件', exact: true }).click();
  expect((await accepted).status()).toBe(200);
  await expect.poll(async () => {
    const view = await (await page.request.get(`/api/documents/${document.id}`)).json();
    return `${view.revision}:${view.state}:${view.job?.status}`;
  }, { timeout: 45_000 }).toBe('1:review:succeeded');
  await expect(page.getByRole('button', { name: '逐条复核', exact: true })).toBeVisible();
  expect(await sourceIdentity(document.id, encrypted)).toEqual(original);
  await page.screenshot({ path: info.outputPath('encrypted-unlocked-review.png'), fullPage: true });
});

test('per-document processing mode is saved, re-recognized, and applied to TXT output', async ({ page }, info) => {
  test.setTimeout(150_000);
  const project = await signInAndCreateProject(page, '单材料设置');
  const fileName = '合成配置.txt';
  const originalBytes = Buffer.from('合成电话 13800138000');
  await page.getByRole('button', { name: '导入材料', exact: true }).click();
  await page.getByLabel('选择文件', { exact: true }).setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: originalBytes });
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
  let document: any;
  await expect.poll(async () => {
    const response = await page.request.get(`/api/projects/${project.id}/documents`);
    if (!response.ok()) return false;
    document = (await response.json()).find((item: any) => item.name === fileName);
    return !!document?.id;
  }, { timeout: 45_000 }).toBe(true);
  await expect.poll(async () => (await (await page.request.get(`/api/documents/${document.id}`)).json()).state, { timeout: 45_000 }).toBe('review');
  await page.getByRole('button', { name: /合成配置\.txt/ }).click();
  const before = await (await page.request.get(`/api/documents/${document.id}`)).json();
  const original = await sourceIdentity(document.id, originalBytes);
  const details = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: '本材料识别与脱敏设置' }) });
  await details.locator('summary').click();
  await details.getByRole('combobox', { name: '处理方式', exact: true }).selectOption('full_star');
  const saved = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/documents/${document.id}/configuration`);
  const recognized = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/documents/${document.id}/recognize`);
  await details.getByRole('button', { name: '保存设置并重新识别', exact: true }).click();
  await page.getByRole('alertdialog', { name: '操作确认' }).getByRole('button', { name: '确认执行', exact: true }).click();
  expect((await saved).status()).toBe(200); expect((await recognized).status()).toBe(200);
  await expect.poll(async () => {
    const view = await (await page.request.get(`/api/documents/${document.id}`)).json();
    return view.revision > before.revision && view.state === 'review' && view.job?.status === 'succeeded';
  }, { timeout: 45_000 }).toBe(true);
  const configuration = await page.request.get(`/api/documents/${document.id}/configuration`);
  expect(configuration.status()).toBe(200);
  expect((await configuration.json()).configuration.exportMode).toBe('full_star');
  await page.getByRole('button', { name: '逐条复核', exact: true }).click();
  const decisions = page.getByLabel(/^标记 \d+ 处理决定$/);
  await expect(decisions.first()).toBeVisible();
  for (const decision of await decisions.all()) await decision.selectOption('redact');
  await page.getByRole('button', { name: '保存复核', exact: true }).click();
  await expect(page.getByText('复核已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导出已选标记的处理副本', exact: true }).click();
  const downloadButton = page.getByRole('button', { name: '核验并下载 TXT', exact: true });
  await expect(downloadButton).toBeEnabled({ timeout: 45_000 });
  const pendingDownload = page.waitForEvent('download');
  await downloadButton.click();
  const bytes = await readFile((await (await pendingDownload).path())!);
  expect(bytes.toString('utf8')).not.toContain('13800138000');
  expect(bytes.toString('utf8')).toMatch(/\*{11}/u);
  expect(await sourceIdentity(document.id, originalBytes)).toEqual(original);
  await page.screenshot({ path: info.outputPath('document-configuration-applied.png'), fullPage: true });
});

test('personal JSON rule import, migration, explicit project application, and real recognition', async ({ page }, info) => {
  test.setTimeout(150_000);
  const project = await signInAndCreateProject(page, '个人规则应用');
  const pattern = 'ZXQ-2026-ALPHA';
  const rulesetName = `合成迁入-${randomUUID().slice(0, 6)}`;
  await page.getByRole('button', { name: '反馈与个人规则', exact: true }).click();
  const feedback = page.getByRole('heading', { name: '审核反馈与个人规则' }).locator('..');
  const imported = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/review-memory/import');
  await feedback.getByLabel('导入规则 JSON', { exact: true }).setInputFiles({
    name: 'synthetic-personal-rules.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ entries: [{ rule_type: 'whitelist', entity_type: '机构', pattern }] })),
  });
  expect((await imported).status()).toBe(200);
  await expect(feedback).toContainText(pattern);
  await feedback.getByLabel('迁入规则库名称', { exact: true }).fill(rulesetName);
  const migrated = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/review-memory/migrate-ruleset');
  await feedback.getByRole('button', { name: '迁入规则库（保持未启用）', exact: true }).click();
  const migratedResponse = await migrated;
  expect(migratedResponse.status()).toBe(200);
  const body = await migratedResponse.json();
  expect(body.activated).toBe(false);
  const migratedEntry = body.ruleset.settings.entries.find((entry: any) => entry.pattern === pattern && entry.enabled && entry.kind === 'forceDetect');
  expect(migratedEntry?.id).toMatch(/^[a-f0-9-]{36}$/u);
  await page.getByRole('button', { name: '脱敏方案与规则库', exact: true }).click();
  await page.getByLabel('规则库', { exact: true }).selectOption(body.ruleset.settings.id);
  const applied = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/projects/${project.id}/presets`);
  await page.getByRole('button', { name: '应用到当前项目', exact: true }).click();
  await page.getByRole('alertdialog', { name: '操作确认' }).getByRole('button', { name: '确认执行', exact: true }).click();
  expect((await applied).status()).toBe(200);
  await expect(page.getByText('方案与规则已应用，请重新识别项目材料。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导入材料', exact: true }).click();
  await page.getByLabel('待处理文本', { exact: true }).fill(`业务标识 ${pattern} 已确认。`);
  await page.getByRole('button', { name: '提交并识别', exact: true }).click();
  let id = '';
  await expect.poll(async () => {
    const response = await page.request.get(`/api/projects/${project.id}/documents`);
    if (!response.ok()) return false;
    id = ((await response.json())[0]?.id ?? '') as string;
    return !!id;
  }, { timeout: 45_000 }).toBe(true);
  await expect.poll(async () => (await (await page.request.get(`/api/documents/${id}`)).json()).state, { timeout: 45_000 }).toBe('review');
  const view = await (await page.request.get(`/api/documents/${id}`)).json();
  const sourceCode = `ruleset-force-detect:${migratedEntry.id}`;
  expect(view.marks.some((mark: any) => view.text.slice(mark.start, mark.end) === pattern && mark.sources?.some((source: any) => source.layer === 'rules' && source.code === sourceCode))).toBe(true);
  await page.getByRole('button', { name: '逐条复核', exact: true }).click();
  await expect(page.getByLabel(/^标记 \d+ 处理决定$/).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('personal-rule-applied.png'), fullPage: true });
});
