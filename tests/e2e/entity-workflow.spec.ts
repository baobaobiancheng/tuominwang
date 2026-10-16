import { readFile } from "node:fs/promises";
import { test, expect } from "./fixture.ts";
import type { Page } from "@playwright/test";

async function waitForEntityFilter(page: Page, click: () => Promise<unknown>, decisions: { pending: number; redact: number; ignore: number }) {
  const filtered = page.waitForResponse(response => {
    if (response.request().method() !== "POST" || !/^\/api\/documents\/[^/]+\/entity-filter$/.test(new URL(response.url()).pathname)) return false;
    const marks = response.request().postDataJSON().marks as { decision: string }[] | undefined;
    return marks?.length === 60 && Object.entries(decisions).every(([decision, count]) => marks.filter(mark => mark.decision === decision).length === count);
  }, { timeout: 30000 });
  await click();
  const response = await filtered;
  expect(response.status(), await response.text()).toBe(200);
}

async function waitForTextWindow(page: Page, documentId: string, revision: number, click: () => Promise<unknown>) {
  const loaded = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === `/api/documents/${documentId}` && url.searchParams.has("offset") && response.status() === 200;
  }, { timeout: 30000 });
  await click();
  const response = await loaded;
  expect(await response.json()).toMatchObject({ id: documentId, revision });
}

async function waitForNextSearchPage(page: Page, documentId: string, revision: number, click: () => Promise<unknown>) {
  const nextPage = page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).pathname === `/api/documents/${documentId}/search`
    && response.request().postDataJSON().revision === revision
    && response.request().postDataJSON().scope === "inside"
    && response.request().postDataJSON().from > 0, { timeout: 30000 });
  await click();
  const response = await nextPage;
  expect(response.status(), await response.text()).toBe(200);
  const result = await response.json();
  expect(result.matches).toHaveLength(10);
  expect(result.next).toBeNull();
}

async function saveAndReadBack(page: Page, documentId: string, revision: number) {
  const path = `/api/documents/${documentId}`;
  const saved = page.waitForResponse(response => response.request().method() === "PUT" && new URL(response.url()).pathname === `${path}/review`, { timeout: 30000 });
  const readBack = page.waitForResponse(async response => response.request().method() === "GET" && new URL(response.url()).pathname === path && response.status() === 200 && ((await response.json()) as { revision: number }).revision === revision + 1, { timeout: 30000 });
  await page.getByRole("button", { name: "保存复核", exact: true }).click();
  const savedResponse = await saved;
  expect(savedResponse.status(), await savedResponse.text()).toBe(200);
  expect(savedResponse.request().postDataJSON().revision).toBe(revision);
  expect((await savedResponse.json()).revision).toBe(revision + 1);
  const documentResponse = await readBack;
  expect(await documentResponse.json()).toMatchObject({ id: documentId, revision: revision + 1 });
}


test("same-value groups review every occurrence across mark pages and text windows, preserve exceptions and export the real result", async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const phone = "13800138000";
  const text = phone + "|" + "x".repeat(40000) + "|" + Array(59).fill(phone).join("|");
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await page.locator(".create-project summary").click();
  await page.getByLabel("项目名称", { exact: true }).fill("合成实体操作项目");
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("button", { name: "导入材料", exact: true }).click();
  await page.getByLabel("待处理文本", { exact: true }).fill(text);
  await page.getByRole("button", { name: "提交并识别", exact: true }).click();

  const groups = page.getByRole("region", { name: "实体分组", exact: true });
  const group = groups.locator(".entity-group-card");
  await expect(group).toHaveCount(1, { timeout: 30000 });
  await expect(group).toContainText("60 处");
  await expect(group.getByText("待确认 60", { exact: true })).toBeVisible();
  await group.getByRole("checkbox").check();
  await expect(groups.getByRole("status")).toHaveText("已选 1 组 · 60 处");
  await waitForEntityFilter(page, () => groups.getByRole("button", { name: "所选组脱敏", exact: true }).click(), { pending: 0, redact: 60, ignore: 0 });
  await expect(group.getByText("脱敏 60", { exact: true })).toBeVisible();
  await waitForEntityFilter(page, () => page.getByRole("button", { name: "撤销修改", exact: true }).click(), { pending: 60, redact: 0, ignore: 0 });
  await expect(group.getByText("待确认 60", { exact: true })).toBeVisible();
  await waitForEntityFilter(page, () => page.getByRole("button", { name: "重做修改", exact: true }).click(), { pending: 0, redact: 60, ignore: 0 });
  await expect(group.getByText("脱敏 60", { exact: true })).toBeVisible();

  // This includes the 51st result and loads a real document window beyond 32K.
  await page.getByRole("button", { name: "全文查找", exact: true }).click();
  await page.getByLabel("全文查找", { exact: true }).fill(phone);
  await page.getByLabel("查找范围", { exact: true }).selectOption("inside");
  const firstSearch = page.waitForResponse(response => response.request().method() === "POST"
    && /^\/api\/documents\/[^/]+\/search$/.test(new URL(response.url()).pathname)
    && response.request().postDataJSON().scope === "inside"
    && response.request().postDataJSON().from === 0, { timeout: 30000 });
  await page.getByRole("button", { name: "查找", exact: true }).click();
  const firstSearchResponse = await firstSearch;
  expect(firstSearchResponse.status(), await firstSearchResponse.text()).toBe(200);
  const firstSearchResult = await firstSearchResponse.json();
  expect(firstSearchResult.matches).toHaveLength(50);
  expect(firstSearchResult.next).toEqual(expect.any(Number));
  const searchedDocumentId = new URL(firstSearchResponse.url()).pathname.split("/")[3];
  const results = page.getByLabel("查找结果", { exact: true });
  await expect(results.locator("button.quote")).toHaveCount(50);
  await waitForNextSearchPage(page, searchedDocumentId, firstSearchResult.revision, () => results.getByRole("button", { name: "下一组结果", exact: true }).click());
  await expect(results.getByRole("status")).toContainText("第 2 组，本组 10 处");
  await expect(page.getByLabel("原文分段", { exact: true })).toContainText(/文本位置 40\d+/, { timeout: 30_000 });
  const original = page.getByLabel("原文", { exact: true });
  await expect.poll(() => original.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe(phone);
  const previousSearch = page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).pathname === `/api/documents/${searchedDocumentId}/search`
    && response.request().postDataJSON().scope === "inside"
    && response.request().postDataJSON().from === 0, { timeout: 30000 });
  await results.getByRole("button", { name: "上一处", exact: true }).click();
  const previousResponse = await previousSearch;
  expect(previousResponse.status(), await previousResponse.text()).toBe(200);
  expect((await previousResponse.json()).matches).toHaveLength(50);
  await expect(results.getByRole("status")).toContainText("第 1 组，本组 50 处");
  await expect(results.getByRole("status")).toContainText("当前第 50 处");
  await waitForNextSearchPage(page, searchedDocumentId, firstSearchResult.revision, () => results.getByRole("button", { name: "下一处", exact: true }).click());
  await expect(results.getByRole("status")).toContainText("第 2 组，本组 10 处");

  await page.getByRole("button", { name: "敏感标记", exact: true }).click();
  await waitForTextWindow(page, searchedDocumentId, firstSearchResult.revision, () => group.getByRole("button", { name: phone, exact: true }).click());
  await waitForTextWindow(page, searchedDocumentId, firstSearchResult.revision, () => group.getByRole("button", { name: "下一处", exact: true }).click());
  await expect(group).toContainText("第 2 / 60 处");
  await expect.poll(async () => {
    const selected = await original.evaluate((el: HTMLTextAreaElement) => ({ text: el.value.slice(el.selectionStart, el.selectionEnd), start: el.selectionStart }));
    const pagination = await page.getByLabel("原文分段", { exact: true }).innerText();
    const first = Number(pagination.match(/文本位置\s+(\d+)/u)?.[1]);
    return { text: selected.text, absoluteStart: selected.start + first - 1 };
  }).toEqual({ text: phone, absoluteStart: text.indexOf(phone, phone.length) });
  await waitForTextWindow(page, searchedDocumentId, firstSearchResult.revision, () => group.getByRole("button", { name: "上一处", exact: true }).click());
  await group.getByRole("button", { name: "编辑此处", exact: true }).click();
  await expect(page.getByRole("button", { name: "逐条复核", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("标记 1 处理决定", { exact: true }).selectOption("ignore");
  await expect(page.getByLabel("标记 1 处理决定", { exact: true })).toHaveValue("ignore");
  await expect(page.getByLabel("标记 2 处理决定", { exact: true })).toHaveValue("redact");
  await page.getByRole("button", { name: "按实体", exact: true }).click();
  await expect(group.getByText("脱敏 59", { exact: true })).toBeVisible();
  await expect(group.getByText("保留 1", { exact: true })).toBeVisible();
  await expect(group).toContainText("处理决定不一致");

  // Previously computed scope results must disappear when the draft changes.
  await page.getByRole("button", { name: "全文查找", exact: true }).click();
  await expect(results).toHaveCount(0);
  await page.getByLabel("查找范围", { exact: true }).selectOption("outside");
  const outsideSearch = page.waitForResponse(response => response.request().method() === "POST"
    && /^\/api\/documents\/[^/]+\/search$/.test(new URL(response.url()).pathname)
    && response.request().postDataJSON().scope === "outside", { timeout: 30000 });
  await page.getByRole("button", { name: "查找", exact: true }).click();
  const outsideResponse = await outsideSearch;
  expect(outsideResponse.status()).toBe(200);
  const outsideResult = await outsideResponse.json();
  expect(outsideResult.revision).toBe(outsideResponse.request().postDataJSON().revision);
  expect(outsideResult.matches).toHaveLength(1);
  expect(outsideResult.matches[0]).toMatchObject({ start: 0, end: phone.length });
  expect(outsideResult.next).toBeNull();
  await expect(results.locator("button.quote")).toHaveCount(1);
  await expect(results.getByRole("status")).toContainText("本组 1 处，已到末尾");
  await expect(results.locator("button.quote")).toContainText("位置 1");
  await page.getByRole("button", { name: "敏感标记", exact: true }).click();
  const firstDocumentIdFromSearch = new URL(outsideResponse.url()).pathname.split("/")[3];
  await saveAndReadBack(page, firstDocumentIdFromSearch, outsideResult.revision);
  await expect(page.getByText("复核已保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回材料列表", exact: true }).click();
  const firstDocumentLoaded = page.waitForResponse(response => response.request().method() === "GET" && /^\/api\/documents\/[a-f0-9-]{36}$/.test(new URL(response.url()).pathname) && response.status() === 200);
  await page.getByRole("button", { name: /文本 1/ }).click();
  const firstDocument = (await (await firstDocumentLoaded).json()) as { id: string; revision: number };
  const firstDocumentId = firstDocument.id;
  expect(firstDocumentId).toBe(firstDocumentIdFromSearch);
  expect(firstDocument.revision).toBe(outsideResult.revision + 1);
  await expect(page.getByRole("button", { name: "按实体", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByText("脱敏 59", { exact: true })).toBeVisible();
  await expect(group.getByText("保留 1", { exact: true })).toBeVisible();

  await group.getByRole("checkbox").check();
  await waitForEntityFilter(page, () => groups.getByRole("button", { name: "所选组脱敏", exact: true }).click(), { pending: 0, redact: 60, ignore: 0 });
  await waitForTextWindow(page, firstDocumentId, firstDocument.revision, () => group.getByRole("button", { name: phone, exact: true }).click());
  const visibleOriginal = await original.inputValue();
  const previewed = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/documents/${firstDocumentId}/preview`, { timeout: 30000 });
  await page.getByRole("button", { name: "刷新处理预览", exact: true }).click();
  const previewResponse = await previewed;
  expect(previewResponse.status(), await previewResponse.text()).toBe(200);
  await expect(page.getByRole("textbox", { name: "处理预览", exact: true })).toHaveValue(visibleOriginal.replaceAll(phone, "138****8000"));
  await expect(original).toBeHidden();
  await page.getByRole("button", { name: "原文审查", exact: true }).click();
  await expect(original).toHaveValue(visibleOriginal);
  await page.screenshot({ path: "test-results/entity-workflow-desktop.png", fullPage: true });
  await saveAndReadBack(page, firstDocumentId, firstDocument.revision);
  await expect(page.getByText("复核已保存", { exact: true })).toBeVisible();
  const exported = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/documents/${firstDocumentId}/export`, { timeout: 60000 });
  await page.getByRole("button", { name: "导出已选标记的处理副本", exact: true }).click();
  const exportResponse = await exported;
  expect(exportResponse.status(), await exportResponse.text()).toBe(200);
  const downloadButton = page.getByRole("button", { name: "核验并下载 TXT", exact: true });
  await expect(downloadButton).toBeEnabled({ timeout: 30000 });
  const verifiedLink = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/documents/${firstDocumentId}/download-link`, { timeout: 120000 });
  const pendingDownload = page.waitForEvent("download", { timeout: 120000 });
  await downloadButton.click();
  const linkResponse = await verifiedLink;
  expect(linkResponse.status(), await linkResponse.text()).toBe(200);
  const file = await (await pendingDownload).path();
  expect(await readFile(file!, "utf8")).toBe(text.replaceAll(phone, "138****8000"));

  // Selection is UI state, not a dirty draft, and must never migrate to another document.
  await page.getByRole("button", { name: "提交新文本", exact: true }).click();
  await page.getByLabel("待处理文本", { exact: true }).fill("同值第二份材料|" + phone);
  await page.getByRole("button", { name: "提交并识别", exact: true }).click();
  await expect(group.getByText("待确认 1", { exact: true })).toBeVisible({ timeout: 30000 });
  const documentNavigation = page.getByRole("navigation", { name: "材料导航", exact: true });
  const firstDocumentRequest = () => page.waitForResponse(response => response.request().method() === "GET"
    && new URL(response.url()).pathname === `/api/documents/${firstDocumentId}`, { timeout: 30000 });
  let loaded = firstDocumentRequest();
  await documentNavigation.getByRole("button", { name: "文本 1", exact: true }).click();
  let documentResponse = await loaded;
  if (documentResponse.status() === 429) {
    expect((await documentResponse.json()) as { error: string }).toEqual({ error: "RATE_LIMITED" });
    await expect(page.getByText("请求过于频繁，请稍后重试", { exact: true })).toBeVisible();
    const retryAfter = documentResponse.headers()["retry-after"];
    expect(retryAfter).toMatch(/^(?:0|[1-9]\d?)$/u);
    const seconds = Number(retryAfter);
    expect(seconds).toBeLessThanOrEqual(60);
    await page.waitForTimeout((seconds + 1) * 1000);
    loaded = firstDocumentRequest();
    await documentNavigation.getByRole("button", { name: "文本 1", exact: true }).click();
    documentResponse = await loaded;
  }
  expect(documentResponse.status()).toBe(200);
  expect(((await documentResponse.json()) as { id: string }).id).toBe(firstDocumentId);
  await expect(original).toHaveValue(/^13800138000\|x{10}/);
  await expect(group.getByText("脱敏 60", { exact: true })).toBeVisible({ timeout: 30000 });
  await group.getByRole("checkbox").check();
  await expect(groups.getByRole("status")).toHaveText("已选 1 组 · 60 处");
  await expect(page.getByRole("button", { name: "保存复核", exact: true })).toBeDisabled();
  let unexpectedDialogs = 0;
  page.once("dialog", async dialog => { unexpectedDialogs++; await dialog.dismiss(); });
  const secondLoaded = page.waitForResponse(response => response.request().method() === "GET"
    && /^\/api\/documents\/[a-f0-9-]{36}$/.test(new URL(response.url()).pathname)
    && new URL(response.url()).pathname !== `/api/documents/${firstDocumentId}` && response.status() === 200, { timeout: 30000 });
  await documentNavigation.getByRole("button", { name: "文本 2", exact: true }).click();
  const secondResponse = await secondLoaded;
  expect((await secondResponse.json()).id).not.toBe(firstDocumentId);
  await expect(original).toHaveValue("同值第二份材料|" + phone);
  await expect(group.getByText("待确认 1", { exact: true })).toBeVisible();
  await expect(group.getByRole("checkbox")).not.toBeChecked();
  await expect(groups.getByRole("status")).toHaveText("已选 0 组 · 0 处");
  await expect(groups.getByRole("button", { name: "所选组脱敏", exact: true })).toBeDisabled();
  await expect(page.getByRole("alertdialog", { name: "操作确认" })).toHaveCount(0);
  expect(unexpectedDialogs).toBe(0);
});

test("entity groups recover after a rate window and a busy processing slot while retaining the real review result", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await page.locator(".create-project summary").click();
  await page.getByLabel("项目名称", { exact: true }).fill("合成实体筛选短暂繁忙");
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  let filterRequests = 0, failNextInvalid = false;
  const filterTimes: number[] = [];
  await page.route("**/api/documents/*/entity-filter", async route => {
    filterRequests++;filterTimes.push(Date.now());
    if (failNextInvalid) { failNextInvalid = false; return route.fulfill({ status: 400, json: { error: "INVALID_INPUT" } }); }
    if (filterRequests === 1) return route.fulfill({ status: 429, headers: { "Retry-After": "1" }, json: { error: "RATE_LIMITED" } });
    if (filterRequests === 2) return route.fulfill({ status: 409, json: { error: "PROCESSING_BUSY" } });
    return route.continue();
  });
  await page.getByRole("button", { name: "导入材料", exact: true }).click();
  await page.getByLabel("待处理文本", { exact: true }).fill("联系电话 13800138000");
  await page.getByRole("button", { name: "提交并识别", exact: true }).click();
  const groups = page.getByRole("region", { name: "实体分组", exact: true });
  await expect(groups.locator(".entity-group-card")).toContainText("待确认 1", { timeout: 30000 });
  expect(filterRequests).toBeGreaterThanOrEqual(3);
  expect(filterTimes[1] - filterTimes[0]).toBeGreaterThanOrEqual(1000);
  await expect(groups.getByRole("alert")).toHaveCount(0);
  failNextInvalid = true;
  await groups.getByLabel("实体原值筛选", { exact: true }).fill("13800138000");
  await expect(groups.getByRole("alert")).toContainText("筛选未完成，请重试。");
  await groups.getByRole("button", { name: "重试筛选", exact: true }).click();
  await expect(groups.locator(".entity-group-card")).toContainText("待确认 1", { timeout: 30000 });
  await expect(groups.getByRole("alert")).toHaveCount(0);
});
