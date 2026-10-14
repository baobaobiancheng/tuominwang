import { readFile } from "node:fs/promises";
import { test, expect } from "./fixture.ts";

test("personal presets expose all fields and rules, apply to a project, and persist across reload", async ({ page }, info) => {
  test.setTimeout(120000);
  await page.goto("/"); await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!); await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!); await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await page.locator(".create-project summary").click(); await page.getByLabel("项目名称", { exact: true }).fill("合成方案规则验收"); await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("button", { name: "脱敏方案与规则库", exact: true }).click();
  await expect(page.getByLabel("方案名称", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "复制方案", exact: true }).click();
  await page.getByLabel("方案名称", { exact: true }).fill("合成完整方案");
  await page.getByLabel("Markdown 默认处理", { exact: true }).selectOption("full_star");
  await page.getByLabel("批量独立假名表文件名", { exact: true }).fill("{fileName}_独立映射");
  await page.getByRole("button", { name: "保存方案", exact: true }).click(); await expect(page.getByRole("button", { name: "保存方案", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "设为个人默认", exact: true }).click(); await expect(page.getByText("已设为个人默认方案", { exact: true })).toBeVisible();
  await page.getByLabel("新方案或规则库名称", { exact: true }).fill("合成完整规则库"); await page.getByRole("button", { name: "新建规则库", exact: true }).click();
  await page.getByLabel("规则内容", { exact: true }).fill("合成甲乙公司"); await page.getByLabel("实体类型", { exact: true }).fill("org_name"); await page.getByRole("button", { name: "添加规则", exact: true }).click();
  await page.getByRole("button", { name: "保存规则库", exact: true }).click(); await expect(page.getByRole("button", { name: "保存规则库", exact: true })).toBeDisabled();
  const downloaded = page.waitForEvent("download"); await page.getByRole("button", { name: "导出规则库 XLSX", exact: true }).click(); const path = await (await downloaded).path(); expect((await readFile(path!)).subarray(0, 2).toString()).toBe("PK");
  await page.getByRole("button", { name: "应用到当前项目", exact: true }).click(); await page.getByRole("alertdialog", { name: "操作确认" }).getByRole("button", { name: "确认执行", exact: true }).click();
  await expect(page.getByText("方案与规则已应用，请重新识别项目材料。", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("presets-desktop.png"), fullPage: true });
  await page.reload(); await page.getByRole("navigation", { name: "项目列表" }).getByRole("button", { name: "合成方案规则验收", exact: true }).click(); await page.getByRole("button", { name: "脱敏方案与规则库", exact: true }).click();
  await expect(page.getByLabel("方案名称", { exact: true })).toHaveValue("合成完整方案"); await expect(page.getByLabel("Markdown 默认处理", { exact: true })).toHaveValue("full_star"); await expect(page.getByLabel("批量独立假名表文件名", { exact: true })).toHaveValue("{fileName}_独立映射"); await expect(page.getByLabel("规则内容 1", { exact: true })).toHaveValue("合成甲乙公司");
});
