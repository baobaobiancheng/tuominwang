import { test, expect } from "./fixture.ts";

test("desktop project tools remain readable at standard and wide widths", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await page.locator("summary").click();
  await page.getByLabel("项目名称").fill("合同审阅项目");
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("button", { name: "项目词表", exact: true }).click();
  await expect(page.getByLabel("名称或代号")).toBeVisible();
  await page.getByRole("button", { name: "查看假名映射", exact: true }).click();
  await expect(page.getByLabel("名称或代号")).toBeHidden();
  await expect(page.getByText("尚未创建项目假名。")).toBeVisible();
  await page.getByRole("button", { name: "项目词表", exact: true }).click();
  await expect(page.getByLabel("名称或代号")).toBeVisible();

  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/project-tools-${width}.png` });
  }
  for (let index = 1; index <= 5; index++) {
    await page.locator("summary").click();
    await page.getByLabel("项目名称").fill(`合成项目 ${index}`);
    await page.getByRole("button", { name: "新建项目", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "项目列表" }).getByRole("button", { name: `合成项目 ${index}`, exact: true })).toBeVisible();
    await expect(page.getByLabel("项目名称")).toBeHidden();
  }
  await page.getByLabel("搜索项目").fill("合同审阅");
  await expect(page.getByRole("navigation", { name: "项目列表" }).getByRole("button")).toHaveCount(1);
  await page.getByLabel("搜索项目").fill("");
  await expect(page.getByRole("navigation", { name: "项目列表" }).getByRole("button")).toHaveCount(6);
});
