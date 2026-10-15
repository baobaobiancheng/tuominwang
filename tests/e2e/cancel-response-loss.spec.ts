// Candidate for tests/e2e/cancel-response-loss.spec.ts. Execute only through
// test:e2e:isolated after the v6 frontend integration; no DOM or API mock.
import { test, expect } from './fixture.ts';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { readOriginal } from '../../packages/adapters/storage.ts';

const evidenceDir = '.data/research/lawbot-2026-10-15/iteration051/frontend/e2e';

test('cancel commits despite a lost POST response and failed readback, then reloads without repeating POST', async ({ page }) => {
  test.setTimeout(120000);
  const dbUrl = new URL(process.env.MIGRATION_DATABASE_URL!);
  expect(dbUrl.pathname.startsWith('/tmw_test_')).toBe(true);
  const locker = new pg.Client({ connectionString: dbUrl.href });
  await locker.connect();
  let held = false;
  const runId = randomUUID().slice(0, 12);
  try {
    await page.goto('/');
    await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME!);
    await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_PASSWORD!);
    await page.getByRole('button', { name: '登录工作台' }).click();
    const projectName = `取消回执丢失-${runId}`;
    await page.locator('.create-project summary').click();
    await page.getByLabel('项目名称', { exact: true }).fill(projectName);
    await page.getByRole('button', { name: '新建项目', exact: true }).click();
    await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: projectName, exact: true }).click();

    const lock = await locker.query('SELECT pg_try_advisory_lock(7843,2) AS held');
    expect(lock.rows[0].held).toBe(true);
    held = true;
    const source = Buffer.from('合成取消回执丢失：联系电话 13800138000。\n');
    const fileName = `synthetic-lost-cancel-${runId}.txt`;
    await page.getByRole('button', { name: '导入材料', exact: true }).click();
    await page.getByLabel('选择文件', { exact: true }).setInputFiles({ name: fileName, mimeType: 'text/plain', buffer: source });
    await page.getByRole('button', { name: '上传文件', exact: true }).click();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回材料列表', exact: true }).click();
    const opened = page.waitForResponse(r => r.request().method() === 'GET' && /\/api\/documents\/[a-f0-9-]{36}(?:\?|$)/u.test(r.url()));
    await page.getByRole('button', { name: new RegExp(fileName.replaceAll('.', '\\.')) }).click();
    const first = await (await opened).json();
    expect(first.state).toBe('queued');
    expect(first.revision).toBe(0);
    expect(first.job.kind).toBe('detect');
    const id = first.id as string, jobId = first.job.id as string;
    let oldEventRequests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === `/api/jobs/${jobId}/events`) oldEventRequests++; });
    const originalBefore = (await locker.query('SELECT source_id,source_hash FROM documents WHERE id=$1', [id])).rows[0];
    expect(await readOriginal(originalBefore.source_id)).toEqual(source);

    let cancelPosts = 0, committed = false, readbackFailures = 0;
    // route.fetch reaches the real API and commits cancellation; only the
    // browser-facing response is dropped. The app must read back, not re-POST.
    await page.route(`**/api/jobs/${jobId}/cancel`, async route => {
      cancelPosts++;
      const response = await route.fetch();
      expect(response.status(), await response.text()).toBe(200);
      committed = true;
      await route.abort('connectionfailed');
    });
    // The cancel handler's authoritative GET has no query string. Polling uses
    // ?offset=...&revision=..., so this fails exactly the cancel readback.
    await page.route(`**/api/documents/${id}`, async route => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'GET' && url.pathname === `/api/documents/${id}` && !url.search && committed && readbackFailures === 0) {
        readbackFailures++;
        await route.abort('connectionfailed');
      } else await route.fallback();
    });
    await page.getByRole('button', { name: '取消任务', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '取消结果尚未确认，请重新加载材料状态后继续操作。' })).toBeVisible();
    await expect(page.getByRole('button', { name: '重新载入最新复核', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '取消任务', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '重新识别', exact: true })).toBeDisabled();
    await expect(page.getByRole('region', { name: '处理进度' })).toHaveCount(0);
    await expect(page.getByText('进度暂时无法更新，正在重试。', { exact: true })).toHaveCount(0);
    const eventsAtConflict = oldEventRequests;
    await page.waitForTimeout(6200); // Beyond the component's former 5 s retry timer.
    expect(oldEventRequests).toBe(eventsAtConflict);
    expect(cancelPosts).toBe(1);
    expect(readbackFailures).toBe(1);
    const authoritative = await (await page.request.get(`/api/documents/${id}`)).json();
    expect(authoritative.state).toBe('outdated');
    expect(authoritative.revision).toBe(1);
    expect(authoritative.job.id).toBe(jobId);
    expect(authoritative.job.status).toBe('cancelled');
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: `${evidenceDir}/cancel-uncertain-${runId}.png`, fullPage: true });

    // The one-shot GET failure has been consumed. A user-controlled reload
    // reads the real current material and clears the conflict gate.
    await page.getByRole('button', { name: '重新载入最新复核', exact: true }).click();
    await expect(page.getByText('材料的处理状态已变化，请重新识别后复核。原有复核记录仍保留。', { exact: true })).toBeVisible();
    await expect(page.getByText('自动识别 需重新识别', { exact: false })).toBeVisible();
    await expect(page.getByText('复核版本 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '重新载入最新复核', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重试任务', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重新识别', exact: true })).toBeEnabled();
    await expect(page.getByRole('region', { name: '处理进度' })).toHaveCount(0);
    await expect(page.getByText('进度暂时无法更新，正在重试。', { exact: true })).toHaveCount(0);
    expect(oldEventRequests).toBe(eventsAtConflict);
    expect(cancelPosts).toBe(1);
    await page.screenshot({ path: `${evidenceDir}/cancel-reloaded-${runId}.png`, fullPage: true });
    const originalAfter = (await locker.query('SELECT source_id,source_hash FROM documents WHERE id=$1', [id])).rows[0];
    expect(originalAfter).toEqual(originalBefore);
    expect(await readOriginal(originalAfter.source_id)).toEqual(source);
    await writeFile(`${evidenceDir}/cancel-response-loss-${runId}.json`, JSON.stringify({ schema: 'cancel-response-loss-edge.v1', documentId: id, cancelledJobId: jobId, cancelPosts, readbackFailures, authoritativeState: authoritative.state, authoritativeRevision: authoritative.revision, originalHash: originalAfter.source_hash, originalImmutable: true }, null, 2));
  } finally {
    if (held) await locker.query('SELECT pg_advisory_unlock(7843,2)').catch(() => {});
    await locker.end();
  }
});
