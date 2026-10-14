import { test, expect } from "./fixture.ts";
import { randomUUID } from "node:crypto";

test("a tab with an old project list synchronizes after another tab switches account", async ({ page, context }) => {
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录工作台" }).click();
  const project = "跨标签页合成项目-" + randomUUID().slice(0, 8);
  for (const name of [project, project + "-另一个"]) {
    await page.locator(".create-project summary").click();
    await page.getByLabel("项目名称", { exact: true }).fill(name);
    await page.getByRole("button", { name: "新建项目", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: project, exact: true })).toBeVisible();

  const username = "other-" + randomUUID().slice(0, 8), password = randomUUID();
  const headers = { Origin: "http://127.0.0.1:5178" };
  const created = await context.request.post("/api/organization/members", { headers, data: { username, password } });
  expect(created.ok()).toBe(true);
  // A different tab shares cookies even while this tab still renders its old account and projects.
  const switched = await context.request.post("/api/login", { headers, data: { username, password } });
  expect(switched.ok()).toBe(true);
  const oldProject = await page.getByRole("button", { name: project, exact: true });
  await oldProject.click();
  await expect(page.locator(".account-name")).toHaveText(username);
  await expect(oldProject).toHaveCount(0);
  await expect(page.getByText("记录不存在，或你已无权访问", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("登录账号已切换");
  await expect(page.getByRole("heading", { name: "选择一个项目", exact: true })).toBeVisible();
});

for (const lateStatus of [200, 401] as const) {
  test(`account switch cancels the old upload batch even when its first response is a late ${lateStatus}`, async ({ page, context }) => {
    await page.goto("/");
    await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
    await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: "登录工作台" }).click();
    const project = "切号中的合成上传-" + randomUUID().slice(0, 8);
    await page.locator(".create-project summary").click();
    await page.getByLabel("项目名称", { exact: true }).fill(project);
    await page.getByRole("button", { name: "新建项目", exact: true }).click();
    await expect(page.getByRole("heading", { name: project, exact: true })).toBeVisible();

    const username = "upload-other-" + randomUUID().slice(0, 8), password = randomUUID();
    const headers = { Origin: "http://127.0.0.1:5178" };
    const created = await context.request.post("/api/organization/members", { headers, data: { username, password } });
    expect(created.ok()).toBe(true);

    let releaseFirst!: () => void, markFirstStarted!: () => void, markFirstReleased!: () => void;
    const firstStarted = new Promise<void>(resolve => { markFirstStarted = resolve; });
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const firstReleased = new Promise<void>(resolve => { markFirstReleased = resolve; });
    const transfers: string[] = [];
    await page.route("**/api/projects/*/files?*", async route => {
      transfers.push(route.request().url());
      if (transfers.length === 1) {
        markFirstStarted();
        await firstGate;
        try {
          await route.fulfill({ status: lateStatus, json: lateStatus === 401 ? { error: "UNAUTHORIZED" } : { id: randomUUID() } });
        } finally {
          markFirstReleased();
        }
      } else {
        // A regression must be observable without uploading another account's file to the server.
        await route.fulfill({ status: 403, json: { error: "FORBIDDEN" } });
      }
    });
    try {
      await page.getByRole("button", { name: "导入材料", exact: true }).click();
      await page.getByLabel("选择文件", { exact: true }).setInputFiles([
        { name: "第一个合成文件.txt", mimeType: "text/plain", buffer: Buffer.from("测试联系人 13800138000") },
        { name: "不能继续上传.txt", mimeType: "text/plain", buffer: Buffer.from("测试联系人 13900139000") },
      ]);
      await page.getByRole("button", { name: "上传文件", exact: true }).click();
      await firstStarted;
      expect(transfers).toHaveLength(1);

      // This uses the real login endpoint and shared cookie jar, while the old browser request is pending.
      const switched = await context.request.post("/api/login", { headers, data: { username, password } });
      expect(switched.ok()).toBe(true);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.locator(".account-name")).toHaveText(username);
      await expect(page.getByRole("heading", { name: "选择一个项目", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: project, exact: true })).toHaveCount(0);

      releaseFirst();
      await firstReleased;
      // Wait until the delayed response and any wrongly continued batch requests have settled.
      await page.waitForLoadState("networkidle");
      expect(transfers).toHaveLength(1);
      await expect(page.locator(".account-name")).toHaveText(username);
      await expect(page.getByRole("button", { name: "登录工作台", exact: true })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "选择一个项目", exact: true })).toBeVisible();
      const session = await context.request.get("/api/session");
      expect(session.ok()).toBe(true);
      expect((await session.json()).username).toBe(username);
    } finally {
      releaseFirst();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}
