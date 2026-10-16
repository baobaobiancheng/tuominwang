import { test, expect } from './fixture.ts';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hash, seal, unseal } from '../../packages/adapters/storage.ts';
import { MCP_PROTOCOL, taskUUID } from '../../packages/core/mcp-tools.ts';

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
  async function initializeClient(name: string) {
    const init = await post('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL, clientInfo: { name, version: '1' } } });
    expect(init.status()).toBe(200);
    const session = init.headers()['mcp-session-id'];
    expect(session).toMatch(/^[a-f0-9]{64}$/);
    const headers = { 'mcp-session-id': session, 'mcp-protocol-version': MCP_PROTOCOL };
    expect((await post('/api/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, headers)).status()).toBe(202);
    return headers;
  }
  const originalHeaders = await initializeClient('codex-edge-original');
  let activeHeaders = originalHeaders;
  let rpc = 1;
  async function callWith(headers: Record<string, string>, name: string, args: Record<string, unknown>) {
    const response = await post('/api/mcp', { jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } }, headers);
    const body = await ok(response);
    return body.result as { isError: boolean; structuredContent: any };
  }
  async function tool(name: string, args: Record<string, unknown>) { return callWith(activeHeaders, name, args); }
  const started = await tool('start_lawbot_redaction', { project_id: project, document_ids: [document.id], task_mode: 'ai_process', masking_mode: 'pseudonym', output_formats: ['original'], request_id: randomUUID() });
  expect(started.isError).toBe(false);
  const job = started.structuredContent.jobId as string;
  await page.goto(`/?collab=${job}`);
  const pendingPanel = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'AI 协作', exact: true }) });
  const oldConsent = pendingPanel.getByRole('group', { name: '授权给 codex' });
  await expect(oldConsent).toBeVisible();
  await oldConsent.getByRole('checkbox', { name: '允许读取本项目选定材料并脱敏' }).check();
  await expect(oldConsent.getByRole('checkbox', { name: '允许读取本项目选定材料并脱敏' })).toBeChecked();
  const claudeHeaders = await initializeClient('claude-edge-recovery');
  const resume = await callWith(claudeHeaders, 'resume_lawbot_task', { job_id: job });
  expect(resume.isError).toBe(false);
  expect(resume.structuredContent.authorizationRequired).toBe(true);
  await pendingPanel.getByRole('button', { name: '刷新任务', exact: true }).click();
  const newConsent = pendingPanel.getByRole('group', { name: '授权给 claude' });
  await expect(newConsent).toBeVisible();
  await expect(oldConsent).toHaveCount(0);
  await expect(pendingPanel.getByRole('combobox', { name: '协作任务' })).toHaveValue(job);
  await expect(pendingPanel.getByRole('combobox', { name: '协作任务' }).locator('option:checked')).toContainText('claude');
  await expect(newConsent.getByRole('checkbox', { name: '允许读取本项目选定材料并脱敏' })).not.toBeChecked();
  const pendingScreenshot = info.outputPath('mcp-pending-claude-authorization.png');
  await pendingPanel.screenshot({ path: pendingScreenshot });
  await info.attach('mcp-pending-claude-authorization', { path: pendingScreenshot, contentType: 'image/png' });
  await newConsent.getByRole('checkbox', { name: '允许读取本项目选定材料并脱敏' }).check();
  await newConsent.getByRole('checkbox', { name: '允许将经系统审定或人工复核的脱敏稿交给当前客户端' }).check();
  await newConsent.getByRole('checkbox', { name: '创建受保护的协作文件' }).check();
  await newConsent.getByRole('checkbox', { name: '授权后打开材料页' }).uncheck();
  const authorized = page.waitForResponse(r => new URL(r.url()).pathname === `/api/ai-collab/tasks/${job}/authorize` && r.request().method() === 'POST');
  await newConsent.getByRole('button', { name: '确认授权并自动处理' }).click();
  expect((await authorized).status()).toBe(200);
  activeHeaders = claudeHeaders;
  const oldCaller = await callWith(originalHeaders, 'check_document_delivery', { job_id: job, wait_seconds: 0 });
  expect(oldCaller.structuredContent.error).toBe('SESSION_AUTHORIZATION_REQUIRED');
  let task = await current(job);
  expect(task.state).toBe('waiting_for_human_review');
  expect(task.caller.displayName).toBe('claude');
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
  // Model the exact durable state left by an older process that stopped after
  // persisting 'validating' but before persisting its validation result.
  if (!new URL(process.env.MIGRATION_DATABASE_URL!).pathname.startsWith('/tmw_test_')) throw new Error('ISOLATED_DATABASE_REQUIRED');
  const admin = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await admin.connect();
  try {
    const id = taskUUID(job);
    const row = (await admin.query('SELECT revision,tenant_id,owner_id,payload FROM ai_collab_tasks WHERE id=$1', [id])).rows[0];
    expect(row).toBeTruthy();
    const aad = `${row.tenant_id}:${row.owner_id}:ai-collab:${id}`;
    const interrupted = JSON.parse(unseal(row.payload, aad));
    interrupted.state = 'validating_ai_result';
    interrupted.revision = row.revision + 1;
    interrupted.updatedAt = new Date().toISOString();
    expect((await admin.query('UPDATE ai_collab_tasks SET revision=$2,updated_at=now(),payload=$3 WHERE id=$1 AND revision=$4', [id, interrupted.revision, seal(JSON.stringify(interrupted), aad), row.revision])).rowCount).toBe(1);
  } finally { await admin.end(); }
  await page.goto(`/?collab=${job}`);
  const interruptedPanel = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'AI 协作', exact: true }) });
  await expect(interruptedPanel.getByRole('status').filter({ hasText: '返回稿待继续校验' })).toBeVisible();
  await expect(interruptedPanel.getByRole('alert')).toContainText('在原 MCP 客户端重新提交本轮同一返回稿');
  await expect(interruptedPanel.getByRole('alert')).toContainText('先接续任务并在此重新授权');
  const legacyScreenshot = info.outputPath('mcp-legacy-return-awaiting-retry.png');
  await interruptedPanel.screenshot({ path: legacyScreenshot });
  await info.attach('mcp-legacy-return-awaiting-retry', { path: legacyScreenshot, contentType: 'image/png' });
  const submitted = await tool('submit_reviewed_document', { job_id: job, round_id: round.roundId, slot_id: round.slotId, sha256: hash(bytes), suggested_name: 'reviewed.md' });
  expect(submitted.isError).toBe(false);
  expect(submitted.structuredContent.validation.valid).toBe(true);

  await page.goto(`/?collab=${job}`);
  const panel = page.locator('section.panel').filter({ has: page.getByRole('heading', { name: 'AI 协作', exact: true }) });
  await expect(panel.getByRole('status').filter({ hasText: '等待复核返回稿' })).toBeVisible();
  await panel.getByRole('button', { name: '我已复核返回稿，确认内容', exact: true }).click();
  await expect(panel.getByRole('status').filter({ hasText: '本轮已完成' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '取消协作任务' })).toHaveCount(0);
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
