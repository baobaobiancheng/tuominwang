// Exercise the real Edge UI, API and separate worker in an isolated database.
import { test, expect } from './fixture.ts';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import { hash, readOriginal } from '../../packages/adapters/storage.ts';

const evidenceDir = '.data/research/lawbot-2026-10-15/iteration051/frontend/e2e';
type SignatureMark = {
  start: number;
  end: number;
  decision: 'pending' | 'redact' | 'ignore';
  signatureGroup?: { id: string; memberIndex: number; memberCount: number };
};

test('real CSV signature groups keep same-name positions independent through UI review and download', async ({ page }) => {
  test.setTimeout(150_000);
  const dbUrl = new URL(process.env.MIGRATION_DATABASE_URL!);
  expect(dbUrl.pathname.startsWith('/tmw_test_')).toBe(true);
  const db = new pg.Client({ connectionString: dbUrl.href });
  const runId = randomUUID();
  const fileName = `synthetic-signature-${runId.slice(0, 8)}.csv`;
  const source = Buffer.from('签名,签名,签名,签名,签名,签名\n张,三,李,四,张,三\n');
  await db.connect();
  try {
    await page.goto('/');
    await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME!);
    await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_PASSWORD!);
    await page.getByRole('button', { name: '登录工作台' }).click();
    const projectName = `分格签名浏览器验收-${runId.slice(0, 8)}`;
    await page.locator('.create-project summary').click();
    await page.getByLabel('项目名称', { exact: true }).fill(projectName);
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: projectName, exact: true }).click();

    // Upload in the page, then let the independent worker finish the real job.
    await page.getByRole('button', { name: '导入材料', exact: true }).click();
    await page.getByLabel('选择文件', { exact: true }).setInputFiles({ name: fileName, mimeType: 'text/csv', buffer: source });
    const uploadResponse = page.waitForResponse(response => response.request().method() === 'POST' && /^\/api\/projects\/[^/]+\/files$/u.test(new URL(response.url()).pathname));
    await page.getByRole('button', { name: '上传文件', exact: true }).click();
    const uploaded = await uploadResponse;
    expect(uploaded.status(), await uploaded.text()).toBe(200);
    const documentId = (await uploaded.json()).id as string;
    expect(documentId).toMatch(/^[0-9a-f-]{36}$/u);
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await expect.poll(async () => {
      const response = await page.request.get(`/api/documents/${documentId}`);
      expect(response.status()).toBe(200);
      const view = await response.json();
      if (view.job?.status === 'failed' || view.job?.status === 'cancelled') throw new Error(`Signature detection ${view.job.status}: ${view.job.error_code ?? 'UNKNOWN'}`);
      return view.state as string;
    }, { timeout: 60_000 }).toBe('review');

    const beforeResponse = await page.request.get(`/api/documents/${documentId}`);
    expect(beforeResponse.status()).toBe(200);
    const before = await beforeResponse.json();
    expect(before.job.kind).toBe('detect');
    expect(before.job.status).toBe('succeeded');
    const marks = before.marks as SignatureMark[];
    expect(marks).toHaveLength(6);
    expect(marks.map(mark => before.text.slice(mark.start, mark.end))).toEqual(['张', '三', '李', '四', '张', '三']);
    expect(marks.every(mark => mark.signatureGroup && !Object.hasOwn(mark.signatureGroup, 'value'))).toBe(true);
    const groupIds = marks.map(mark => mark.signatureGroup!.id);
    expect(groupIds[0]).toBe(groupIds[1]);
    expect(groupIds[2]).toBe(groupIds[3]);
    expect(groupIds[4]).toBe(groupIds[5]);
    expect(new Set([groupIds[0], groupIds[2], groupIds[4]]).size).toBe(3);
    expect(marks.map(mark => [mark.signatureGroup!.memberIndex, mark.signatureGroup!.memberCount])).toEqual([[0, 2], [1, 2], [0, 2], [1, 2], [0, 2], [1, 2]]);
    const originalBefore = (await db.query('SELECT source_id, source_hash FROM documents WHERE id=$1', [documentId])).rows[0];
    expect(originalBefore.source_hash).toBe(hash(source));
    expect(await readOriginal(originalBefore.source_id)).toEqual(source);

    await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(fileName.replaceAll('.', '\\.')) }).click();
    await expect(page.getByRole('button', { name: '按实体', exact: true })).toBeVisible();
    // The entity tree must not offer per-fragment deletion of a signed group.
    await page.getByRole('button', { name: '按实体', exact: true }).click();
    const groupDeleteButtons = page.locator('section[aria-label="实体分组"]').getByRole('button', { name: '删除此组标记', exact: true });
    await expect(groupDeleteButtons).toHaveCount(4, { timeout: 30_000 }); // Actual entity-filter response may exceed the default 5s; all four grouped controls must arrive.
    for (let i = 0; i < 4; i++) {
      await expect(groupDeleteButtons.nth(i)).toBeDisabled();
      await expect(groupDeleteButtons.nth(i)).toHaveAttribute('title', '签名分格姓名请整组保留原值');
    }

    await page.getByRole('button', { name: '逐条复核', exact: true }).click();
    const decision = (index: number) => page.getByLabel(`标记 ${index} 处理决定`, { exact: true });
    for (let index = 1; index <= 6; index++) await expect(decision(index)).toHaveValue('pending');
    await expect(page.locator('.mark').first()).toContainText('签名姓名 张三 · 第 1/2 格 · 整组决定');
    await expect(page.locator('.mark').nth(4)).toContainText('签名姓名 张三 · 第 1/2 格 · 整组决定');

    // All review decisions come from the real rendered selects. The second
    // occurrence of 张三 must remain pending when the first one is changed.
    await decision(1).selectOption('redact');
    for (const index of [1, 2]) await expect(decision(index)).toHaveValue('redact');
    for (const index of [3, 4, 5, 6]) await expect(decision(index)).toHaveValue('pending');
    await decision(3).selectOption('ignore');
    for (const index of [3, 4]) await expect(decision(index)).toHaveValue('ignore');
    for (const index of [5, 6]) await expect(decision(index)).toHaveValue('pending');
    await decision(5).selectOption('ignore');
    for (const index of [5, 6]) await expect(decision(index)).toHaveValue('ignore');
    for (let index = 1; index <= 6; index++) await expect(page.locator('.mark').nth(index - 1).getByRole('button', { name: '删除标记', exact: true })).toBeDisabled();
    await mkdir(evidenceDir, { recursive: true });
    await page.locator('.mark').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidenceDir}/signature-groups-draft-${runId}.png`, fullPage: true });

    await page.getByRole('button', { name: '保存复核', exact: true }).click();
    await expect(page.getByText('复核已保存', { exact: true })).toBeVisible();
    const savedResponse = await page.request.get(`/api/documents/${documentId}`);
    expect(savedResponse.status()).toBe(200);
    const saved = await savedResponse.json();
    expect((saved.marks as SignatureMark[]).map(mark => mark.decision)).toEqual(['redact', 'redact', 'ignore', 'ignore', 'ignore', 'ignore']);
    expect((saved.marks as SignatureMark[]).every(mark => mark.signatureGroup && !Object.hasOwn(mark.signatureGroup, 'value'))).toBe(true);

    const exportResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/documents/${documentId}/export`);
    await page.getByRole('button', { name: '导出已选标记的处理副本', exact: true }).click();
    const exportJobResponse = await exportResponse;
    expect(exportJobResponse.status(), await exportJobResponse.text()).toBe(200);
    const exportJobId = (await exportJobResponse.json()).id as string;
    await expect.poll(async () => {
      const response = await page.request.get(`/api/documents/${documentId}`);
      expect(response.status()).toBe(200);
      const current = await response.json();
      if (current.job?.id !== exportJobId) return 'waiting-for-export-job';
      if (current.job.status === 'failed' || current.job.status === 'cancelled') throw new Error(`Signature export ${current.job.status}: ${current.job.error_code ?? 'UNKNOWN'}`);
      return current.job.status as string;
    }, { timeout: 60_000 }).toBe('succeeded');
    const downloadButton = page.getByRole('button', { name: '核验并下载 CSV', exact: true });
    await expect(downloadButton).toBeEnabled({ timeout: 15_000 });
    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/u);
    const downloaded = await readFile((await download.path())!);
    await writeFile(`${evidenceDir}/signature-groups-output-${runId}.csv`, downloaded);
    const rows = parse(downloaded, { bom: true, skip_empty_lines: false }) as string[][];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['签名', '签名', '签名', '签名', '签名', '签名']);
    expect(rows[1]).toEqual(['*', '*', '李', '四', '张', '三']);

    const originalAfter = (await db.query('SELECT source_id, source_hash FROM documents WHERE id=$1', [documentId])).rows[0];
    expect(originalAfter).toEqual(originalBefore);
    expect(await readOriginal(originalAfter.source_id)).toEqual(source);
    expect(hash(await readOriginal(originalAfter.source_id))).toBe(originalAfter.source_hash);
    await page.screenshot({ path: `${evidenceDir}/signature-groups-export-${runId}.png`, fullPage: true });
    await writeFile(`${evidenceDir}/signature-groups-${runId}.json`, JSON.stringify({
      schema: 'signature-groups-edge.v1', documentId, exportJobId,
      reviewedDecisions: (saved.marks as SignatureMark[]).map(mark => mark.decision),
      signatureGroupCount: new Set(groupIds).size, groupValueAbsent: true,
      downloadHash: hash(downloaded), outputRows: rows, sourceHash: originalAfter.source_hash, originalImmutable: true,
    }, null, 2));
  } finally {
    await db.end();
  }
});
