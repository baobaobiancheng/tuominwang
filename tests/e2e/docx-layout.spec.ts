import { test, expect } from "./fixture.ts";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { officeFixture } from "../office-fixtures.ts";
import { readZip } from "../../packages/core/office-zip.ts";

test("Word layout links split-run marks and selections, keeps object view and original export, rejects stale/anonymous layout", async ({ page, playwright }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await page.locator(".create-project summary").click();
  await page.getByLabel("项目名称", { exact: true }).fill("Word版式-" + randomUUID().slice(0, 8));
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("button", { name: "导入材料", exact: true }).click();
  await page.getByLabel("选择文件", { exact: true }).setInputFiles({ name: "版式合成.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await officeFixture("docx") });
  await page.getByRole("button", { name: "上传文件", exact: true }).click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回材料列表", exact: true }).click();
  // Deterministically exercise queued -> review with an unchanged revision.
  // Only the initial document projection is delayed; the actual worker/API remain real.
  let initialProjection = true, readyProjectionObserved = false, prematureLayoutRequests = 0;
  await page.route(/\/api\/documents\/[^/?]+(?:\?.*)?$/, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(), body = await response.json();
    if (initialProjection) {
      initialProjection = false;
      await route.fulfill({ response, json: { ...body, state: 'queued', job: { ...body.job, status: 'running' } } });
    } else {
      readyProjectionObserved = ['review', 'outdated'].includes(body.state);
      await route.fulfill({ response, json: body });
    }
  });
  let transientLayoutBusy = 2, transientPreviewBusy = 2;
  await page.route('**/docx-preview?*', async route => {
    if (transientPreviewBusy > 0) { transientPreviewBusy--; return route.fulfill({ status: 409, json: { error: 'PROCESSING_BUSY' } }); }
    await route.continue();
  });
  await page.route('**/docx-layout?*', async route => {
    if (!readyProjectionObserved) {
      prematureLayoutRequests++;
      return route.fulfill({ status: 409, json: { error: 'DOCX_LAYOUT_NOT_READY' } });
    }
    if (transientLayoutBusy > 0) { transientLayoutBusy--; return route.fulfill({ status: 409, json: { error: 'PROCESSING_BUSY' } }); }
    await route.continue();
  });
  const layoutResponse = page.waitForResponse(r => r.url().includes("/docx-layout?") && r.ok());
  await page.getByRole("button", { name: /版式合成.docx/ }).click();
  const primaryFrame = page.locator('iframe[title="Word 离线分页预览"]');
  const primaryText = page.frameLocator('iframe[title="Word 离线分页预览"]').locator('.tmw-word-text').filter({ hasText: "合成客户电话" }).first();
  await expect(page.getByText("1 个预览页 · 只读原件", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(primaryText).toContainText("合成客户电话");
  await primaryFrame.scrollIntoViewIfNeeded();
  await primaryText.scrollIntoViewIfNeeded();
  await expect(primaryText).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath("docx-primary-visible-before-review.png"), timeout: 15_000 });
  await page.getByText("结构化原文与其他对象", { exact: true }).click();
  const response = await layoutResponse, endpoint = new URL(response.url());
  expect(initialProjection).toBe(false);
  expect(readyProjectionObserved).toBe(true);
  expect(transientLayoutBusy).toBe(0); expect(transientPreviewBusy).toBe(0);
  expect(prematureLayoutRequests, 'layout must wait for the ready projection at the same revision').toBe(0);
  const layout = page.getByRole("region", { name: "Word 版式审查", exact: true });
  await expect(layout.locator(".docx-paper-table")).toBeVisible();
  await expect(layout.getByRole("heading", { name: "页眉", exact: true })).toBeAttached();
  const para = layout.locator('[data-docx-paragraph="word/document.xml:paragraph:1"]');
  await expect(para).toHaveText("合成客户电话13800138000");
  await expect(para.locator(".docx-mark")).toHaveCount(2);
  await para.locator(".docx-mark").first().click();
  await expect(page.getByLabel("标记 2 处理决定")).toBeVisible();
  // DOM selection crosses two styled source runs, not a guessed text search.
  const selected = await para.evaluate(element => {
    const spans = [...element.querySelectorAll<HTMLElement>('[data-docx-start]')];
    const first = spans[0], last = spans.at(-1)!;
    const selection = window.getSelection()!; selection.removeAllRanges();
    const range = document.createRange(); range.setStart(first.firstChild!, 0); range.setEnd(last.firstChild!, last.textContent!.length); selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return { start: Number(first.dataset.docxStart), end: Number(last.dataset.docxEnd) };
  });
  await expect(page.getByRole("button", { name: "将选中文字加入标记", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "将选中文字加入标记", exact: true }).click();
  await expect(page.getByLabel("标记 11 处理决定")).toBeVisible();
  // The extra enclosing manual mark is retained, avoiding an overlapping redact selection.
  for (let i = 1; i <= 10; i++) await page.getByLabel(`标记 ${i} 处理决定`).selectOption("redact");
  await page.getByLabel("标记 11 处理决定").selectOption("ignore");
  let savedBody: any;
  page.on('request', req => { if (req.method() === 'PUT' && req.url().endsWith('/review')) savedBody = req.postDataJSON(); });
  await page.getByRole("button", { name: "保存复核", exact: true }).click();
  await expect(page.getByText("复核已保存", { exact: true })).toBeVisible();
  expect(savedBody.marks.at(-1)).toMatchObject({ ...selected, kind: '自定义', decision: 'ignore' });
  await page.getByRole("button", { name: "对象原文", exact: true }).click();
  await expect(page.locator('textarea[aria-label="原文"]')).toBeVisible();
  await page.getByRole("button", { name: "Word 版式审查", exact: true }).click();
  await expect(page.getByText("复核版本 1", { exact: true })).toBeVisible();
  const revisionOneLayout = page.waitForResponse(r => {
    if (r.request().method() !== "GET" || r.status() !== 200) return false;
    const url = new URL(r.url());
    return url.pathname === endpoint.pathname && url.searchParams.get("revision") === "1";
  }, { timeout: 30_000 });
  await page.getByText("结构化原文与其他对象", { exact: true }).click();
  expect((await revisionOneLayout).status()).toBe(200);
  await expect(para).toBeVisible({ timeout: 15_000 });
  const old = await page.request.get(endpoint.href, { timeout: 15_000 }); expect(old.status()).toBe(409);
  const anonymous = await playwright.request.newContext({ timeout: 15_000 });
  try { expect((await anonymous.get(endpoint.href)).status()).toBe(401); } finally { await anonymous.dispose(); }
  await test.step("submit original DOCX export and wait for successful job", async () => {
    await page.getByRole("button", { name: "导出已选标记的处理副本", exact: true }).click();
    await expect(page.getByRole("button", { name: "核验并下载 DOCX", exact: true })).toBeEnabled({ timeout: 45_000 });
    console.info("[docx-layout] export job succeeded");
  });
  await test.step("verify link, browser download and actual DOCX content", async () => {
    const [download, response] = await Promise.all([
      page.waitForEvent("download", { timeout: 45_000 }),
      page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/download-link"), { timeout: 30_000 }),
      page.getByRole("button", { name: "核验并下载 DOCX", exact: true }).click({ timeout: 15_000 }),
    ]);
    expect(response.ok(), "download-link must pass server artifact verification").toBe(true);
    const path = testInfo.outputPath("redacted.docx");
    await download.saveAs(path);
    expect(await download.failure()).toBeNull();
    console.info("[docx-layout] browser download saved");
    const parts = await readZip(await readFile(path));
    expect(parts.get('word/document.xml')!.toString()).toContain('<w:tbl>');
    for (const content of parts.values()) expect(content.toString()).not.toContain('13800138000');
    // The short synthetic DOCX has no page-size metadata. Its iframe can occupy
    // less than half the viewport while the actual Word text is fully readable.
    // Bring both scrolling containers into view and assert the content itself.
    await primaryFrame.scrollIntoViewIfNeeded();
    await primaryText.scrollIntoViewIfNeeded();
    await expect(primaryText).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath("docx-primary-visible-after-export.png"), timeout: 15_000 });
    await page.screenshot({ path: testInfo.outputPath('docx-layout-review.png'), fullPage: true, timeout: 15_000 });
    console.info("[docx-layout] artifact content and visible Word screenshots verified");
  });
});
