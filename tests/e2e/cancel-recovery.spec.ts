// Candidate for tests/e2e/cancel-recovery.spec.ts. Not executed; use only with test:e2e:isolated.
import { test, expect } from "./fixture.ts";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readOriginal } from "../../packages/adapters/storage.ts";

test("cancelled queued detection refreshes the whole material and reruns at a new revision", async ({ page }) => {
  test.setTimeout(120000);
  const dbUrl = new URL(process.env.MIGRATION_DATABASE_URL!);
  expect(dbUrl.pathname.startsWith("/tmw_test_")).toBe(true);
  const locker = new pg.Client({ connectionString: dbUrl.href });
  await locker.connect();
  let held = false;
  try {
    await page.goto("/");
    await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
    await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: "登录工作台" }).click();
    const projectName = "取消重识别-" + randomUUID().slice(0, 8);
    await page.locator(".create-project summary").click();
    await page.getByLabel("项目名称", { exact: true }).fill(projectName);
    await page.getByRole("button", { name: "新建项目", exact: true }).click();
    await page.getByRole("navigation", { name: "项目列表" }).getByRole("button", { name: projectName, exact: true }).click();

    const lock = await locker.query("SELECT pg_try_advisory_lock(7843,2) AS held");
    expect(lock.rows[0].held).toBe(true);
    held = true;
    const source = Buffer.from("合成取消恢复：联系电话 13800138000。\n");
    const fileName = "synthetic-cancel-" + randomUUID().slice(0, 8) + ".txt";
    await page.getByRole("button", { name: "导入材料", exact: true }).click();
    await page.getByLabel("选择文件", { exact: true }).setInputFiles({ name: fileName, mimeType: "text/plain", buffer: source });
    await page.getByRole("button", { name: "上传文件", exact: true }).click();
    await expect(page.getByText("已保存", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "返回材料列表", exact: true }).click();
    const opened = page.waitForResponse(r => r.request().method() === "GET" && /\/api\/documents\/[a-f0-9-]{36}(?:\?|$)/u.test(r.url()));
    await page.getByRole("button", { name: new RegExp(fileName.replaceAll(".", "\\.")) }).click();
    const first = await (await opened).json();
    expect(first.state).toBe("queued");
    expect(first.revision).toBe(0);
    expect(first.job.kind).toBe("detect");
    const id = first.id, oldJob = first.job.id;
    let oldEventRequests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === `/api/jobs/${oldJob}/events`) oldEventRequests++; });
    const originalBefore = (await locker.query("SELECT source_id,source_hash FROM documents WHERE id=$1", [id])).rows[0];
    expect(await readOriginal(originalBefore.source_id)).toEqual(source);

    await page.getByRole("button", { name: "取消任务", exact: true }).click();
    await expect(page.getByText("材料的处理状态已变化，请重新识别后复核。原有复核记录仍保留。", { exact: true })).toBeVisible();
    await expect(page.getByText("自动识别 需重新识别", { exact: false })).toBeVisible();
    await expect(page.getByText("复核版本 1", { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '处理进度' })).toHaveCount(0);
    await expect(page.getByText('进度暂时无法更新，正在重试。', { exact: true })).toHaveCount(0);
    const eventsAtOutdated = oldEventRequests;
    await page.waitForTimeout(6200); // Beyond the component's former 5 s retry timer.
    expect(oldEventRequests).toBe(eventsAtOutdated);
    await expect(page.getByRole("button", { name: "重试任务", exact: true })).toHaveCount(0);
    const cancelled = await (await page.request.get(`/api/documents/${id}`)).json();
    expect(cancelled.state).toBe("outdated");
    expect(cancelled.revision).toBe(1);
    expect(cancelled.job.id).toBe(oldJob);
    expect(cancelled.job.status).toBe("cancelled");
    const staleRetry = await page.request.post(`/api/jobs/${oldJob}/retry`, { headers: { origin: new URL(page.url()).origin }, data: { revision: 1 } });
    expect(staleRetry.status()).toBe(409);

    await page.getByRole("button", { name: "重新识别", exact: true }).click();
    await page.getByRole("alertdialog", { name: "操作确认" }).getByRole("button", { name: "确认执行" }).click();
    const queuedAgain = await (await page.request.get(`/api/documents/${id}`)).json();
    expect(queuedAgain.state).toBe("queued");
    expect(queuedAgain.revision).toBe(2);
    expect(queuedAgain.job.id).not.toBe(oldJob);
    await locker.query("SELECT pg_advisory_unlock(7843,2)");
    held = false;
    await expect.poll(async () => (await (await page.request.get(`/api/documents/${id}`)).json()).state, { timeout: 45000 }).toBe("review");
    const originalAfter = (await locker.query("SELECT source_id,source_hash FROM documents WHERE id=$1", [id])).rows[0];
    expect(originalAfter).toEqual(originalBefore);
    expect(await readOriginal(originalAfter.source_id)).toEqual(source);
  } finally {
    if (held) await locker.query("SELECT pg_advisory_unlock(7843,2)").catch(() => {});
    await locker.end();
  }
});
