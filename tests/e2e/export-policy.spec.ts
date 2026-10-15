import { test, expect } from "./fixture.ts";
import pg from "pg";
import { randomUUID } from "node:crypto";

test("desktop blocks export and fresh downloads when object coverage changes", async ({ page }) => {
  test.setTimeout(120000);
  const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    await page.goto("/");
    await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
    await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: "登录工作台" }).click();
    await page.locator(".create-project summary").click();
    await page.getByLabel("项目名称", { exact: true }).fill("公开合成样本-" + randomUUID().slice(0, 8));
    await page.getByRole("button", { name: "新建项目", exact: true }).click();
    await page.getByRole("button", { name: "导入材料", exact: true }).click();
    await page.getByLabel("待处理文本").fill("公开合成样本 13800138000");
    const created = page.waitForResponse(response => /\/api\/projects\/[^/]+\/documents$/.test(response.url()) && response.request().method() === "POST");
    await page.getByRole("button", { name: "提交并识别" }).click();
    const document = (await (await created).json()).id;
    await page.getByRole("button", { name: "逐条复核", exact: true }).click();
    await expect(page.getByLabel("标记 1 处理决定")).toBeVisible();
    await page.getByLabel("标记 1 处理决定").selectOption("redact");
    await page.getByRole("button", { name: "保存复核", exact: true }).click();
    const submitted = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/documents/${document}/export`));
    await page.getByRole("button", { name: "导出已选标记的处理副本", exact: true }).click();
    const exportResponse = await submitted;
    expect(exportResponse.ok()).toBe(true);
    const exportJob = (await exportResponse.json()).id;
    const deadline = Date.now() + 60000;
    for (;;) {
      const response = await page.request.get(`/api/jobs/${exportJob}/events?after=0&limit=1`);
      expect(response.ok()).toBe(true);
      const job = await response.json();
      if (job.status === "succeeded") break;
      if (job.status === "failed" || job.status === "cancelled") throw new Error(`Export job ${exportJob} ${job.status}`);
      if (Date.now() >= deadline) throw new Error(`Export job ${exportJob} did not complete; last status ${job.status}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    await expect(page.getByRole("button", { name: "核验并下载 TXT", exact: true })).toBeEnabled({ timeout: 15000 });
    // Fault injection is confined to the runner's disposable database.
    await admin.query("UPDATE documents SET coverage=$1 WHERE id=$2", [JSON.stringify([{ id: "text", status: "blocked" }]), document]);
    const downloads: string[] = [];
    page.on("download", download => downloads.push(download.suggestedFilename()));
    await page.getByRole("button", { name: "核验并下载 TXT", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("文件存在未处理内容或定位信息缺失");
    await page.getByRole("button", { name: "导出已选标记的处理副本", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("暂不能导出");
    expect(downloads).toEqual([]);
    await expect(page.locator("body")).not.toContainText(/Bend|LAWS|PROOF|工程取舍|开发进度|第一批/);
    await page.screenshot({ path: "test-results/export-blocked-desktop.png", fullPage: true });
  } finally { await admin.end(); }
});
