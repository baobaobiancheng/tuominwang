import { test, expect } from "./fixture.ts";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
test("browser submission, review, durable reload and verified TXT download", async ({
  page,
}) => {
  const credentials = { username: process.env.E2E_USERNAME!, password: process.env.E2E_PASSWORD! };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const protectedFile = await page.request.get(
    "/@fs" + process.cwd() + "/.data/开发登录.json",
  );
  expect([403, 404]).toContain(protectedFile.status());
  await page.goto("/");
  await page
    .getByLabel("账号", { exact: true })
    .fill(process.env.E2E_USERNAME ?? credentials.username);
  await page
    .getByLabel("密码", { exact: true })
    .fill(process.env.E2E_PASSWORD ?? credentials.password);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await page.locator(".create-project summary").click();
  await page
    .getByLabel("项目名称", { exact: true })
    .fill("浏览器验收-" + randomUUID().slice(0, 6));
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("button", { name: "导入材料", exact: true }).click();
  await page
    .getByLabel("待处理文本")
    .fill("😀张三电话13800138000；邮箱demo@example.com");
  await page.getByRole("button", { name: "提交并识别" }).click();
  await page.getByRole("button", { name: "逐条复核", exact: true }).click();
  await expect(page.getByLabel("标记 1 处理决定")).toBeVisible();
  await page.getByLabel("标记 1 处理决定").selectOption("redact");
  await page.getByLabel("标记 2 处理决定").selectOption("redact");
  await page.getByLabel("原文", { exact: true }).evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(2, 4);
  });
  // Read-only textareas in macOS Edge do not move a caret on arrow keys.
  // Set the native selection, then deliver the same mouseup event as a drag.
  await page.getByLabel('原文',{exact:true}).dispatchEvent('mouseup');
  expect(await page.getByLabel('原文',{exact:true}).evaluate(el=>{const t=el as HTMLTextAreaElement;return t.value.slice(t.selectionStart,t.selectionEnd);})).toBe('张三');
  await page
    .getByRole("button", { name: "将选中文字加入标记", exact: true })
    .click();
  await page.getByLabel("标记 3 处理决定").selectOption("redact");
  await page.getByRole("button", { name: "保存复核", exact: true }).click();
  await expect(page.getByText("复核已保存", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "导出已选标记的处理副本", exact: true })
    .click();
  await expect(
    page.getByText("已提交副本生成任务", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "核验并下载 TXT", exact: true }),
  ).toBeEnabled();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "核验并下载 TXT", exact: true })
    .click();
  const file = await downloaded;
  expect(await readFile((await file.path())!, "utf8")).toBe(
    "😀【自定义】电话138****8000；邮箱de***@e***.com",
  );
  await page.screenshot({
    path: "test-results/workbench-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/workbench-desktop-wide.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "我的项目" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /浏览器验收-/ })
    .first()
    .click();
  await page.getByRole("button", { name: /文本 1/ }).click();
  await page.getByRole("button", { name: "逐条复核", exact: true }).click();
  await expect(page.getByLabel("标记 3 处理决定")).toHaveValue("redact");
  await expect(
    page.getByRole("button", { name: /浏览器验收-/ }).first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
