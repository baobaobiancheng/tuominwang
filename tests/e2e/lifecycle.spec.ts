import { test, expect } from "./fixture.ts";
import { randomUUID } from "node:crypto";

test("desktop capacity controls and explicit deletion remove only the selected material", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/"); await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!); await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await page.getByRole("button", { name: "组织管理", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "查看材料配额" }).click();
  await dialog.getByLabel("材料数上限", { exact: true }).fill("1"); await dialog.getByRole("button", { name: "保存材料配额" }).click();
  await expect(dialog.getByRole("button", { name: "保存材料配额" })).toBeDisabled();
  await dialog.getByRole("button", { name: "关闭组织管理" }).click();
  await page.locator("summary").click(); await page.getByLabel("项目名称").fill("删除验证-" + randomUUID().slice(0, 8)); await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("button", { name: "导入材料", exact: true }).click(); await page.getByLabel("待处理文本").fill("公开电话13800138000"); await page.getByRole("button", { name: "提交并识别" }).click();
  await page.getByRole("button", { name: "逐条复核", exact: true }).click();
  await expect(page.getByLabel("标记 1 处理决定")).toBeVisible();
   await page.getByRole("button", { name: "删除材料", exact: true }).click();
  await page.getByRole("alertdialog", { name: "操作确认" }).getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByLabel("原文", { exact: true })).toBeVisible();
   await page.getByRole("button", { name: "删除材料", exact: true }).click();
  await page.getByRole("alertdialog", { name: "操作确认" }).getByRole("button", { name: "确认执行", exact: true }).click();
  await expect(page.getByText("还没有材料", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "组织管理", exact: true }).click(); await dialog.getByRole("button", { name: "查看材料配额" }).click();
  await expect(dialog.getByText(/已保存 0 份材料/)).toBeVisible();
  await page.screenshot({ path: "test-results/capacity-desktop.png", fullPage: true });
  expect(await page.locator("body").innerText()).not.toMatch(/浏览器验收|工程评审|开发进度|技术取舍|完整一期/);
});
