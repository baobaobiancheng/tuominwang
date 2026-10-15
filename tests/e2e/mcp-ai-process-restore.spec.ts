import { test, expect } from './fixture.ts';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hash } from '../../packages/adapters/storage.ts';
import { MCP_PROTOCOL } from '../../packages/core/mcp-tools.ts';

test('ai_process owner grants restoration in the UI, then MCP restores a downloadable reviewed result', async ({ page }, info) => {
  test.setTimeout(180000);
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录工作台' }).click();
  await page.locator('.create-project summary').click();
  await page.getByLabel('项目名称', { exact: true }).fill(`MCP 显式还原授权-${randomUUID().slice(0, 8)}`);
  const created = page.waitForResponse(r => new URL(r.url()).pathname === '/api/projects' && r.request().method() === 'POST');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  const projectResponse = await created;
  expect(projectResponse.status()).toBe(200);
  const project = (await projectResponse.json()).id as string;
  const origin = new URL(page.url()).origin;
  const post = (path: string, data: unknown, headers: Record<string, string> = {}) => page.request.post(path, { data, headers: { origin, ...headers } });
  const put = (path: string, data: unknown) => page.request.put(path, { data, headers: { origin } });
  async function ok(response: Awaited<ReturnType<typeof post>>) {
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  }
  async function current(job: string) {
    const response = await page.request.get(`/api/ai-collab/tasks/${job}`);
    return ok(response);
  }
  const document = await ok(await post(`/api/projects/${project}/documents`, { text: '邮箱：edge-owner@example.com', requestId: randomUUID() }));
  await expect.poll(async () => {
    const response = await page.request.get(`/api/documents/${document.id}`);
    if (!response.ok()) return 'pending';
    const value = await response.json();
    return value.state === 'review' && value.job?.status === 'succeeded' ? 'ready' : value.job?.status ?? 'pending';
  }, { timeout: 60000 }).toBe('ready');
  const init = await post('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL, clientInfo: { name: 'edge-synthetic-client', version: '1' } } });
  expect(init.status()).toBe(200);
  const session = init.headers()['mcp-session-id'];
  expect(session).toMatch(/^[a-f0-9]{64}$/);
  const mcpHeaders = { 'mcp-session-id': session, 'mcp-protocol-version': MCP_PROTOCOL };
  expect((await post('/api/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, mcpHeaders)).status()).toBe(202);
  let rpc = 1;
  async function tool(name: string, args: Record<string, unknown>) {
    const response = await post('/api/mcp', { jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } }, mcpHeaders);
    const body = await ok(response);
    return body.result as { isError: boolean; structuredContent: any };
  }
  const started = await tool('start_lawbot_redaction', { project_id: project, document_ids: [document.id], task_mode: 'ai_process', masking_mode: 'pseudonym', output_formats: ['original'], request_id: randomUUID() });
  expect(started.isError).toBe(false);
  const job = started.structuredContent.jobId as string;
  const consent = { allowRedactionPath: true, allowRestorePath: false, allowSanitizedDelivery: true, autoEnterReview: false, createExchangeFolder: true, autoRestoreAfterValidation: false };
  let task = await current(job);
  await ok(await post(`/api/ai-collab/tasks/${job}/authorize`, { revision: task.revision, authorization: consent }));
  await expect.poll(async () => {
    const response = await page.request.get(`/api/documents/${document.id}`);
    if (!response.ok()) return 'pending';
    const value = await response.json();
    return value.state === 'review' && value.job?.status === 'succeeded' && value.marks?.length ? 'ready' : value.job?.status ?? 'pending';
  }, { timeout: 60000 }).toBe('ready');
  const recognizedResponse = await page.request.get(`/api/documents/${document.id}`);
  const recognized = await ok(recognizedResponse);
  const reviewed = await put(`/api/documents/${document.id}/review`, { revision: recognized.revision, marks: recognized.marks.map((mark: any) => ({ ...mark, decision: 'redact' })) });
  await ok(reviewed);
  task = await current(job);
  const prepared = await ok(await post(`/api/ai-collab/tasks/${job}/prepare-export`, { revision: task.revision }));
  expect(prepared.exportJobIds).toHaveLength(1);
  const exportJob = prepared.exportJobIds[0] as string;
  await expect.poll(async () => {
    const response = await page.request.get(`/api/jobs/${exportJob}/events?after=0&limit=1`);
    if (!response.ok()) return `HTTP ${response.status()}`;
    return (await response.json()).status as string;
  }, { timeout: 60000 }).toBe('succeeded');
  task = await ok(await post(`/api/ai-collab/tasks/${job}/release-export`, { revision: prepared.revision }));
  expect(task.state).toBe('sanitized_artifact_ready');
  const received = await tool('receive_sanitized_document', { job_id: job, output_format: 'md' });
  expect(received.isError).toBe(false);
  const round = received.structuredContent;
  const bytes = Buffer.from(round.bytesBase64, 'base64');
  expect(bytes.toString()).not.toContain('edge-owner@example.com');
  await ok(await put(`/api/ai-collab/tasks/${job}/slots/${round.slotId}`, { bytesBase64: bytes.toString('base64') }));
  const submitted = await tool('submit_reviewed_document', { job_id: job, round_id: round.roundId, slot_id: round.slotId, sha256: hash(bytes), suggested_name: 'reviewed.md' });
  expect(submitted.isError).toBe(false);
  expect(submitted.structuredContent.validation.valid).toBe(true);

  await page.goto(`/?collab=${job}`);
  const panel = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'AI 协作', exact: true }) });
  await expect(panel.getByRole('status')).toContainText('等待复核返回稿');
  await panel.getByRole('button', { name: '我已复核返回稿，确认内容', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('本轮已完成');
  const grant = panel.getByRole('button', { name: '允许使用本项目假名表还原此次返回稿', exact: true });
  await expect(grant).toBeVisible();
  const denied = await tool('open_lawbot_restore', { job_id: job, round_id: round.roundId });
  expect(denied.isError).toBe(true);
  expect(denied.structuredContent.error).toBe('RESTORE_AUTHORIZATION_REQUIRED');
  const grantResponse = page.waitForResponse(r => new URL(r.url()).pathname === `/api/ai-collab/tasks/${job}/authorize-restoration` && r.request().method() === 'POST');
  await grant.click();
  expect((await grantResponse).status()).toBe(200);
  await expect(grant).toHaveCount(0);
  const restored = await tool('open_lawbot_restore', { job_id: job, round_id: round.roundId });
  expect(restored.isError).toBe(false);
  expect(restored.structuredContent.status).toBe('round_completed');
  task = await current(job);
  const artifact = task.rounds.at(-1)?.restoredArtifactId as string;
  expect(artifact).toBeTruthy();
  await panel.getByRole('button', { name: '刷新任务', exact: true }).click();
  const link = panel.getByRole('link', { name: '下载还原稿', exact: true });
  await expect(link).toHaveAttribute('href', new RegExp(`/api/projects/${project}/restoration/files/${artifact}$`));
  const downloadEvent = page.waitForEvent('download');
  await link.click();
  const download = await downloadEvent;
  const saved = info.outputPath('reviewed-restored.md');
  await download.saveAs(saved);
  expect((await readFile(saved, 'utf8'))).toContain('edge-owner@example.com');
  await page.screenshot({ path: info.outputPath('mcp-ai-process-restored.png'), fullPage: true });
});
