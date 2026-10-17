import { readFile } from "node:fs/promises";
import { test, expect } from "./fixture.ts";
import { exportDictionary, importDictionary } from "../../packages/core/dictionary-workbook.ts";

test("desktop XLSX lists remain drafts until saved; project whitelist review and undo touch only confirmed scope", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await page.locator(".create-project summary").click();
  await page.getByLabel("项目名称", { exact: true }).fill("合成批量项目");
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("button", { name: "项目词表", exact: true }).click();
  const entries = [{ value: "13800138000", kind: "手机号" as const, action: "exclude" as const }, { value: "甲乙公司", kind: "机构" as const }];
  await page.getByLabel("导入名单 XLSX", { exact: true }).setInputFiles({ name: "名单.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await exportDictionary(entries) });
  await expect(page.getByText("2 / 1000 条 · 未保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存词表", exact: true }).click();
  await page.getByRole("alertdialog", { name: "操作确认" }).getByRole("button", { name: "确认执行", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存词表", exact: true })).toBeDisabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出名单 XLSX", exact: true }).click();
  expect(await importDictionary(await readFile((await (await download).path())!))).toEqual(entries);
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "导入材料", exact: true }).click();
    await page.getByLabel("待处理文本").fill("甲乙公司 联系13800138000");
    await page.getByRole("button", { name: "提交并识别", exact: true }).click();
    await expect(page.locator(".statusbar span").first()).toHaveText("自动识别 已完成", { timeout: 45_000 });
    await page.getByRole("button", { name: "逐条复核", exact: true }).click();
    await expect(page.getByLabel("标记 2 处理决定")).toHaveValue("pending");
    await expect(page.getByText(/白名单建议/)).toBeVisible();
    await page.getByRole("button", { name: "返回材料列表", exact: true }).click();
  }
  await page.getByRole("button", { name: "项目批量复核", exact: true }).click();
  await page.getByLabel("批量选择 文本 1", { exact: true }).check();
  await page.getByLabel("批量选择 文本 2", { exact: true }).check();
  await page.getByLabel("仅白名单建议", { exact: true }).check();
  await page.getByLabel("批量处理决定", { exact: true }).selectOption("ignore");
  await page.getByRole("button", { name: "核对批量范围", exact: true }).click();
  await expect(page.getByText("文本 1 · 版本 0 · 1 项", { exact: true })).toBeVisible();
  await expect(page.getByText("文本 2 · 版本 0 · 1 项", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "确认批量保存", exact: true }).click();
  await page.getByRole("alertdialog", { name: "操作确认" }).getByRole("button", { name: "确认执行", exact: true }).click();
  await expect(page.getByText("批量复核已保存", { exact: true })).toBeVisible();
  const undoResponse=page.waitForResponse(response=>response.request().method()==='POST'&&/\/api\/projects\/[^/]+\/review-batch\/undo$/.test(response.url()));
  await page.getByRole("button", { name: "撤销本次批量复核", exact: true }).click();
  await page.getByRole("alertdialog", { name: "操作确认" }).getByRole("button", { name: "确认执行", exact: true }).click();
  expect((await undoResponse).status()).toBe(200);
  await expect(page.getByText("已撤销本次批量复核", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/batch-review-desktop.png", fullPage: true });
  await page.getByRole("button", { name: /文本 1\s+可复核/ }).click();
  await page.getByRole("button", { name: "逐条复核", exact: true }).click();
  await expect(page.getByLabel("标记 1 处理决定")).toHaveValue("pending");
  await expect(page.getByLabel("标记 2 处理决定")).toHaveValue("pending");
  await expect(page.locator(".statusbar span").nth(1)).toHaveText(/^复核版本 2 · /);
});


test("batch export modes preserve original format scope, cancellation and same-mode application", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await page.locator(".create-project summary").click();
  await page.getByLabel("项目名称", { exact: true }).fill("合成批量脱敏方式");
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  const names = ["批量范围一.md", "批量范围二.md"];
  for (const name of names) {
    await page.getByRole("button", { name: "导入材料", exact: true }).click();
    await page.getByLabel("选择文件", { exact: true }).setInputFiles({ name, mimeType: "text/markdown", buffer: Buffer.from("# 合成材料\n联系电话13800138000\n") });
    await page.getByRole("button", { name: "上传文件", exact: true }).click();
    await expect(page.getByText("已保存", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "返回材料列表", exact: true }).click();
    await page.getByRole("region", { name: "材料列表", exact: true }).getByRole("button").filter({ hasText: name }).click();
    await expect(page.locator(".statusbar span").first()).toHaveText("自动识别 已完成", { timeout: 60000 });
    await page.getByRole("button", { name: "返回材料列表", exact: true }).click();
  }
  await page.getByRole("button", { name: "项目批量复核", exact: true }).click();
  for (const name of names) {
    const checkbox = page.getByLabel(`批量选择 ${name}`, { exact: true });
    await expect(checkbox).toBeEnabled({ timeout: 60000 });
    await checkbox.check();
  }
  await page.getByLabel("批量导出材料类型", { exact: true }).selectOption("docx");
  await page.getByRole("button", { name: "核对批量脱敏方式", exact: true }).click();
  await expect(page.getByText(/不属于所选材料类型，跳过/)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "确认批量修改", exact: true })).toBeDisabled();
  await page.getByLabel("批量导出材料类型", { exact: true }).selectOption("markdown");
  await page.getByLabel("批量脱敏方式", { exact: true }).selectOption("full_star");
  await page.getByRole("button", { name: "核对批量脱敏方式", exact: true }).click();
  await expect(page.getByText(/半 \* 号脱敏 → 全 \* 号脱敏/)).toHaveCount(2);
  await page.getByRole("button", { name: "确认批量修改", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "操作确认" });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByText(/半 \* 号脱敏 → 全 \* 号脱敏/)).toHaveCount(2);
  const applied = page.waitForResponse(response => response.request().method() === "POST" && /\/review-mode-batch\/apply$/.test(response.url()));
  await page.getByRole("button", { name: "确认批量修改", exact: true }).click();
  await dialog.getByRole("button", { name: "确认执行", exact: true }).click();
  const response = await applied;
  expect(response.status()).toBe(200);
  const first = (await response.json()).documents;
  expect(first).toHaveLength(2);
  expect(first.every((d:any) => d.mode === "full_star")).toBe(true);
  await expect(page.getByText("批量脱敏方式已保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "核对批量脱敏方式", exact: true }).click();
  await expect(page.getByText(/保持当前方式并同步设置/)).toHaveCount(2);
  const repeated = page.waitForResponse(response => response.request().method() === "POST" && /\/review-mode-batch\/apply$/.test(response.url()));
  await page.getByRole("button", { name: "确认批量修改", exact: true }).click();
  const repeatedResponse = await repeated;
  expect(repeatedResponse.status()).toBe(200);
  const second = (await repeatedResponse.json()).documents;
  for (const d of second) expect(d.revision).toBe(first.find((old:any) => old.id === d.id).revision + 1);
  await expect(dialog).not.toBeVisible();
  await page.screenshot({ path: "test-results/batch-export-modes-desktop.png", fullPage: true });
});
