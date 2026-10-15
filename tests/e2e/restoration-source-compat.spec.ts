import { test, expect } from './fixture.ts';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { officeFixture } from '../office-fixtures.ts';
import { parseOffice } from '../../packages/core/office.ts';

test('external single-file restoration preserves zero-match Markdown/Word bytes and exact Markdown aliases', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByLabel('账号', { exact: true })).toBeVisible();
  await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录工作台' }).click();
  await page.locator('.create-project summary').click();
  await page.getByLabel('项目名称', { exact: true }).fill(`单件还原源兼容-${randomUUID().slice(0, 8)}`);
  await page.getByRole('button', { name: '新建项目', exact: true }).click();

  const panel = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^还原 Word／Markdown 文件$/ }) });
  await panel.locator('summary').click();
  const input = panel.getByLabel('待还原文件', { exact: true });
  const mapping = panel.getByLabel('映射表文件（不选则使用本项目映射）', { exact: true });
  const inspect = panel.getByRole('button', { name: '检查还原映射', exact: true });
  const restore = panel.getByRole('button', { name: '生成还原副本', exact: true });
  const downloadButton = panel.getByRole('button', { name: '下载还原副本', exact: true });
  const status = panel.locator('p[role="status"]');
  async function downloadBytes(label: string) {
    const event = page.waitForEvent('download');
    await downloadButton.click();
    const download = await event;
    const path = testInfo.outputPath(label);
    await download.saveAs(path);
    return readFile(path);
  }

  const ordinaryMapping = Buffer.from(JSON.stringify({ mappings: { '【姓名001】': '合成甲' } }));
  await mapping.setInputFiles({ name: 'ordinary.lpm', mimeType: 'application/json', buffer: ordinaryMapping });
  await inspect.click();
  await expect(status).toContainText('映射表含 1 个假名');

  const bomCrlf = Buffer.from('\uFEFF公开正文\r\n');
  await input.setInputFiles({ name: 'ordinary-bom.md', mimeType: 'text/markdown', buffer: bomCrlf });
  await restore.click();
  await expect(status).toContainText('未找到可还原假名，原文副本已保存，请下载检查。');
  await expect(downloadButton).toBeVisible();
  expect(await downloadBytes('ordinary-bom.md')).toEqual(bomCrlf);

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const word = await officeFixture('docx', { 'word/document.xml': `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>公开正文</w:t></w:r></w:p></w:body></w:document>` });
  await input.setInputFiles({ name: 'ordinary.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: word });
  await restore.click();
  await expect(status).toContainText('未找到可还原假名，原文副本已保存，请下载检查。');
  expect(await downloadBytes('ordinary.docx')).toEqual(word);

  // External files restore known mappings and show a visible
  // incomplete-restoration warning while known aliases are restored.
  const mixedMarkdown = Buffer.from('【姓名001】 【姓名999】\r\n');
  await input.setInputFiles({ name: 'mixed-unknown.md', mimeType: 'text/markdown', buffer: mixedMarkdown });
  await restore.click();
  await expect(status).toContainText('已还原 1 处假名');
  await expect(status).toContainText(/发现 1 种未完整匹配的标签/);
  expect(await downloadBytes('mixed-unknown.md')).toEqual(Buffer.from('合成甲 【姓名999】\r\n'));

  const mixedWord = await officeFixture('docx', { 'word/document.xml': `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>【姓名001】 【姓名999】</w:t></w:r></w:p></w:body></w:document>` });
  await input.setInputFiles({ name: 'mixed-unknown.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: mixedWord });
  await restore.click();
  await expect(status).toContainText('已还原 1 处假名');
  await expect(status).toContainText(/发现 1 种未完整匹配的标签/);
  const restoredWord = await parseOffice(await downloadBytes('mixed-unknown.docx'), 'docx');
  expect(restoredWord.text).toContain('合成甲 【姓名999】');

  await status.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('external-unknown-warning.png'), fullPage: true });

  const exactMapping = Buffer.from(JSON.stringify({ mappings: { 'A&B': '甲', 'A&amp;B': '乙' } }));
  await mapping.setInputFiles({ name: 'exact.lpm', mimeType: 'application/json', buffer: exactMapping });
  await inspect.click();
  await expect(status).toContainText('映射表含 2 个假名');
  await input.setInputFiles({ name: 'exact-bom.md', mimeType: 'text/markdown', buffer: Buffer.from('\uFEFFA&B A&amp;B\r\n') });
  await restore.click();
  await expect(status).toContainText('已还原 2 处假名，请下载检查。');
  expect(await downloadBytes('exact-bom.md')).toEqual(Buffer.from('\uFEFF甲 乙\r\n'));
  expect(pageErrors).toEqual([]);
});
