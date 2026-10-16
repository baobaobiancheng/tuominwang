import { test, expect } from "./fixture.ts";
import { saveReviewWithReadback } from "./review-save-readback.ts";
import { randomUUID } from "node:crypto";
import { pdfFixture } from "../pdf-fixtures.ts";

test("OCR correction saves page text and requires fresh review while retaining the original preview", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await page.locator(".create-project summary").click();
  await page.getByLabel("项目名称", { exact: true }).fill("OCR纠错-" + randomUUID().slice(0, 8));
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("button", { name: "导入材料", exact: true }).click();
  await page.getByLabel("选择文件", { exact: true }).setInputFiles({ name: "公开OCR纠错样本.pdf", mimeType: "application/pdf", buffer: pdfFixture() });
  await page.getByRole("button", { name: "上传文件", exact: true }).click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回材料列表", exact: true }).click();
  await page.getByRole("button", { name: /公开OCR纠错样本.pdf/ }).click();
  await page.getByRole("button", { name: "逐条复核", exact: true }).click();
  await expect(page.getByLabel("标记 1 处理决定")).toBeVisible({ timeout: 60000 });
  expect(await page.getByLabel("原文", { exact: true }).inputValue()).toContain("13800138000");
  await page.getByLabel("标记 1 处理决定").selectOption("ignore");
  await expect(page.getByRole("button", { name: "纠正识别文字", exact: true })).toBeDisabled(); // unsaved review is protected
  await page.getByRole("checkbox", { name: "转换为不可选字的图片型 PDF 副本" }).check();
  await saveReviewWithReadback(page);
  await expect(page.getByText("复核已保存", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "纠正识别文字", exact: true }).click();
  const original = page.getByLabel("本页识别文字", { exact: true }); await expect(original).toBeVisible();
  const text = await original.inputValue(); expect(text).toContain("13800138000");
  const previewSrc = await page.getByRole("img", { name: "原件第 1 页", exact: true }).getAttribute("src");
  await original.focus(); await original.press("ControlOrMeta+A");
  const corrected = text.replace("13800138000", "13800138001");
  const editor = page.getByLabel("纠正后的文字", { exact: true }); await expect(editor).toBeEnabled(); await editor.fill(corrected);
  const documentRoute = /^\/api\/documents\/[0-9a-f-]{36}$/;
  let savedDocumentPath: string | undefined;
  const correctionSaved = page.waitForResponse(r => {
    const path = new URL(r.url()).pathname;
    if (r.request().method() !== "PUT" || !path.endsWith("/pages/0/ocr-text")) return false;
    const candidate = path.replace(/\/pages\/0\/ocr-text$/, "");
    if (!documentRoute.test(candidate)) return false;
    savedDocumentPath = candidate;
    return true;
  }, { timeout: 15000 });
  const documentReloaded = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === savedDocumentPath && r.status() === 200, { timeout: 15000 });
  await page.getByRole("button", { name: "保存文字并重新复核", exact: true }).click();
  const correctionResponse = await correctionSaved;
  expect(correctionResponse.status()).toBe(200);
  const correctedRevision = (await correctionResponse.json()).revision;
  await documentReloaded;
  await expect(page.getByText("识别文字已更新，请重新确认敏感标记并保存复核。", { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("标记 1 处理决定")).toHaveValue("pending");
  await expect(page.getByRole("button", { name: "导出已选标记的处理副本", exact: true })).toBeDisabled();
  const correctedReadback = page.waitForResponse(r => r.request().method() === "GET"
    && /\/api\/documents\/[^/]+\/pages\/0\/ocr-text$/u.test(new URL(r.url()).pathname)
    && new URL(r.url()).searchParams.get("revision") === String(correctedRevision), { timeout: 30_000 });
  await page.getByRole("button", { name: "纠正识别文字", exact: true }).click();
  const correctedResponse = await correctedReadback;
  expect(correctedResponse.status(), await correctedResponse.text()).toBe(200);
  expect((await correctedResponse.json()).text).toBe(corrected);
  await expect(page.getByLabel("本页识别文字", { exact: true })).toHaveValue(corrected, { timeout: 30_000 });
  const afterSrc = await page.getByRole("img", { name: "原件第 1 页", exact: true }).getAttribute("src");
  expect(afterSrc?.split("?")[0]).toBe(previewSrc?.split("?")[0]);
  await page.screenshot({ path: "test-results/ocr-correction-desktop.png", fullPage: true });
});
