import { test, expect } from "./fixture.ts";
import { pdfFixture } from "../pdf-fixtures.ts";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
}

test("PDF repeat applies once without native confirmation and one undo removes every repeated region", async ({ page }) => {
  test.setTimeout(90000);
  const nativeDialogs: string[] = [];
  page.on("dialog", async dialog => { nativeDialogs.push(dialog.type()); await dialog.dismiss(); });
  await login(page);
  await page.locator(".create-project summary").click();
  await page.getByLabel("项目名称", { exact: true }).fill("重复页即时草稿");
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("button", { name: "导入材料", exact: true }).click();
  await page.getByLabel("选择文件", { exact: true }).setInputFiles({ name: "重复页.pdf", mimeType: "application/pdf", buffer: pdfFixture({ pages: 2 }) });
  await page.getByRole("button", { name: "上传文件", exact: true }).click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回材料列表", exact: true }).click();
  await page.getByRole("button", { name: /重复页.pdf/ }).click();
  const canvas = page.getByLabel("区域框选画布");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await page.getByRole("combobox", { name: "区域用途", exact: true }).selectOption("印章");
  await page.getByLabel("结束页", { exact: true }).fill("2");
  await page.getByRole("button", { name: "应用到指定页", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "操作确认" })).toHaveCount(0);
  await expect(canvas.locator(".saved-region")).toHaveCount(1);
  await page.getByRole("button", { name: "下一页原件", exact: true }).click();
  await expect(canvas.locator(".saved-region")).toHaveCount(1);
  await page.getByRole("button", { name: "撤销页面修改", exact: true }).click();
  await expect(canvas.locator(".saved-region")).toHaveCount(0);
  await page.getByRole("button", { name: "上一页原件", exact: true }).click();
  await expect(canvas.locator(".saved-region")).toHaveCount(0);
  await page.getByRole("button", { name: "应用到指定页", exact: true }).click();
  await expect(canvas.locator(".saved-region")).toHaveCount(1);
  await page.getByRole("button", { name: "下一页原件", exact: true }).click();
  await expect(canvas.locator(".saved-region")).toHaveCount(1);
  await page.getByRole("button", { name: "从副本移除此页", exact: true }).click();
  await expect(page.getByText("此页不包含在副本中", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "撤销页面修改", exact: true }).click();
  await expect(page.getByText("此页不包含在副本中", { exact: true })).toHaveCount(0);
  await expect(canvas.locator(".saved-region")).toHaveCount(1);
  expect(nativeDialogs).toEqual([]);
});

test("Escape cancels only the top confirmation and double confirmation writes a dictionary revision once", async ({ page }) => {
  const nativeDialogs: string[] = [];
  page.on("dialog", async dialog => { nativeDialogs.push(dialog.type()); await dialog.dismiss(); });
  await login(page);
  await page.getByRole("button", { name: "组织管理", exact: true }).click();
  const organization = page.locator("dialog.organization-dialog");
  await organization.getByLabel("成员账号", { exact: true }).fill("未提交账号");
  const closeOrganization = organization.getByRole("button", { name: "关闭组织管理", exact: true });
  await closeOrganization.click();
  const confirmation = page.getByRole("alertdialog", { name: "操作确认", exact: true });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(organization).toBeVisible();
  await expect(organization.getByLabel("成员账号", { exact: true })).toHaveValue("未提交账号");
  await expect(closeOrganization).toBeFocused();
  await closeOrganization.click();
  await confirmation.getByRole("button", { name: "确认执行", exact: true }).click();
  await expect(organization).toBeHidden();

  await page.locator(".create-project summary").click();
  await page.getByLabel("项目名称", { exact: true }).fill("持久确认唯一写入");
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("button", { name: "项目词表", exact: true }).click();
  await page.getByLabel("名称或代号", { exact: true }).fill("合成机构");
  await page.getByRole("button", { name: "添加词条", exact: true }).click();
  let writes = 0;
  let releaseWrite!: () => void;
  const writeGate = new Promise<void>(resolve => { releaseWrite = resolve; });
  await page.route("**/api/projects/*/dictionary", async route => {
    if (route.request().method() !== "PUT") { await route.continue(); return; }
    writes++;
    await writeGate;
    await route.continue();
  });
  const save = page.getByRole("button", { name: "保存词表", exact: true });
  await save.click();
  await confirmation.getByRole("button", { name: "取消", exact: true }).click();
  expect(writes).toBe(0);
  await expect(page.getByText("1 / 1000 条 · 未保存", { exact: true })).toBeVisible();
  await save.click();
  const writeResponse = page.waitForResponse(response => response.request().method() === "PUT" && /\/api\/projects\/[^/]+\/dictionary$/.test(response.url()));
  try {
    await confirmation.getByRole("button", { name: "确认执行", exact: true }).dblclick();
    await expect.poll(() => writes).toBe(1);
    await expect(save).toBeDisabled();
    await expect(confirmation).toHaveCount(0);
  } finally { releaseWrite(); }
  const response = await writeResponse;
  expect(response.ok()).toBe(true);
  expect((await response.json()).revision).toBe(1);
  await expect(page.getByText("1 / 1000 条", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "收起项目词表", exact: true }).click();
  await page.getByRole("button", { name: "项目词表", exact: true }).click();
  await expect(page.getByText("1 / 1000 条", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "移除词条 合成机构", exact: true })).toHaveCount(1);
  expect(writes).toBe(1);
  expect(nativeDialogs).toEqual([]);
});
