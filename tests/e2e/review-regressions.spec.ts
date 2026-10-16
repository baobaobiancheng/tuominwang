import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import type { DocumentView } from "../../packages/contracts/index.ts";
import { permissionSchema } from "../../packages/contracts/index.ts";
import { filterReviewMarkItems } from "../../packages/core/review-mark-filter.ts";

const projectId = "11111111-1111-4111-8111-111111111111";
const docId = "22222222-2222-4222-8222-222222222222";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
// Mock only transport to deterministically delay responses; DB/version behavior is
// separately exercised by tests/integration.ts against real PostgreSQL.
async function workspace(page: Page, status = "succeeded", open = true) {
  const state = {
    doc: {
      id: docId, project_id: projectId, text: "13800138000 13900139000", revision: 1,
      permissions: [...permissionSchema.options],
      state: "review", marks: [
        { start: 0, end: 11, kind: "手机号", decision: "ignore" },
        { start: 12, end: 23, kind: "手机号", decision: "ignore" },
      ],
      job: { id: "33333333-3333-4333-8333-333333333333", kind: "export", status, error_code: null, required_permissions: ["export"] },
      layers: { rules: "completed", ner: "not_configured", ai: "not_configured" },
    } as DocumentView,
    getCount: 0,
    beforeGet: undefined as (() => Promise<void>) | undefined,
    beforeReview: undefined as (() => Promise<void>) | undefined,
    beforeSubmit: undefined as (() => Promise<void>) | undefined,
    recoveryWrites: [] as any[],
    beforeRecovery: undefined as (() => Promise<void>) | undefined,
    recoveryRevision: 0,
    recoveryReceipt: null as null | {id:string;projectId:string;documentId:string;revision:number;documentRevision:number;savedAt:string},
    writerEpoch: 0,
    writer: null as null | {writerId:string;token:string;epoch:number;sequence:number;closed:boolean},
    reviews: [] as { revision: number; marks: DocumentView["marks"] }[],
    downloads: [] as { revision: number }[],
  };
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const respond = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    // The current workspace reads these even when the recent-workspaces drawer
    // stays closed. A clean synthetic account has no resumable checkpoint.
    if (path === "/api/workspace/recovery-prompts" && request.method()==="GET") return respond([]);
    if (path === "/api/ai-collab/tasks" && request.method()==="GET") return respond({items:[]});
    if (path === "/api/ai-collab/connectors" && request.method()==="GET") return respond({items:[]});
    if (path === "/api/presets/profiles" && request.method()==="GET") return respond({items:[]});
    if (path === `/api/documents/${docId}/entity-filter` && request.method()==="POST") {
      const input=request.postDataJSON(),marks=input.marks??state.doc.marks,offset=input.offset??0,limit=input.limit??50;
      if(input.revision!==state.doc.revision)return respond({error:"VERSION_CONFLICT"},409);
      const filtered=filterReviewMarkItems(state.doc,marks,input),items=filtered.slice(offset,offset+limit).map(({index,score})=>({index,score}));
      return respond({revision:state.doc.revision,contentHash:createHash("sha256").update(state.doc.text).digest("hex"),total:filtered.length,items,offset,nextOffset:offset+items.length,hasMore:offset+limit<filtered.length});
    }
    if (path === `/api/documents/${docId}/configuration` && request.method()==="GET") return respond({revision:state.doc.revision,configuration:{}});
    if (path === `/api/projects/${projectId}/workspace/recent` && request.method()==="POST") return respond({ok:true});
    // A saved draft remains readable after the document advances; the stored
    // documentRevision stays at the version actually acknowledged by PUT.
    if (path === `/api/documents/${docId}/recovery` && request.method()==="GET") return respond(state.recoveryReceipt ? structuredClone(state.recoveryReceipt) : null);
    if (path === `/api/documents/${docId}/recovery/writer` && request.method()==="POST") {
      const body=request.postDataJSON();
      if(body.recoveryRevision!==state.recoveryRevision)return respond({error:"RECOVERY_CONFLICT"},409);
      const epoch=++state.writerEpoch;
      state.writer={writerId:`44444444-4444-4444-8444-${epoch.toString(16).padStart(12,'0')}`,token:epoch.toString(16).padStart(64,'a'),epoch,sequence:0,closed:false};
      return respond({writerId:state.writer.writerId,token:state.writer.token,epoch,sequence:0,recoveryRevision:state.recoveryRevision,leaseSeconds:45});
    }
    const writerRoute=path===`/api/documents/${docId}/recovery/writer/heartbeat`||path===`/api/documents/${docId}/recovery/writer/close`;
    if(writerRoute&&request.method()==="POST"){
      const body=request.postDataJSON(),wire=body.writer;
      if(!state.writer||!wire||Object.keys(wire).sort().join(',')!=="epoch,sequence,token,writerId"||wire.writerId!==state.writer.writerId||wire.token!==state.writer.token||wire.epoch!==state.writer.epoch||wire.sequence!==state.writer.sequence||body.recoveryRevision!==state.recoveryRevision)return respond({error:"RECOVERY_WRITER_CONFLICT"},409);
      if(path.endsWith('/close')){
        const result={ok:true,clean:true,ackedRevision:state.recoveryRevision,ackedSequence:state.writer.sequence};
        state.writer.closed=true; // Repeated identical close is idempotent; heartbeat and PUT remain barred.
        return respond(result);
      }
      if(state.writer.closed)return respond({error:"RECOVERY_WRITER_CONFLICT"},409);
      return respond({ok:true,leaseSeconds:45});
    }
    if (path === `/api/documents/${docId}/recovery` && request.method()==="PUT") {
      const body=request.postDataJSON();state.recoveryWrites.push(body);await state.beforeRecovery?.();
      if(body.draft.revision!==state.doc.revision)return respond({error:"VERSION_CONFLICT"},409);
      if(!state.writer||state.writer.closed||body.recoveryRevision!==state.recoveryRevision||!body.writer||Object.keys(body.writer).sort().join(',')!=="epoch,sequence,token,writerId"||body.writer.writerId!==state.writer.writerId||body.writer.token!==state.writer.token||body.writer.epoch!==state.writer.epoch||body.writer.sequence!==state.writer.sequence+1)return respond({error:"RECOVERY_WRITER_CONFLICT"},409);
      state.writer.sequence=body.writer.sequence;state.recoveryRevision++;
      state.recoveryReceipt={id:"55555555-5555-4555-8555-555555555555",projectId,documentId:docId,revision:state.recoveryRevision,documentRevision:body.draft.revision,savedAt:new Date().toISOString()};
      return respond(structuredClone(state.recoveryReceipt));
    }
    if (path === `/api/documents/${docId}/outputs` && request.method()==="GET") return respond([]);
    if (path === `/api/documents/${docId}/portable-draft` && request.method()==="GET") return respond({available:false});
    if (path === "/api/software-update/state" && request.method() === "GET") return respond({ supported: false, configured: false, currentVersion: "development", releaseId: null, phase: "unavailable", distribution: "web", capabilities: { checkDeployedRelease: true, nativeDownload: false, nativeInstall: false }, preferences: { setupCompleted: false, checkAutomatically: false, downloadAutomatically: false, installAutomatically: false } });
    if (path === "/api/session") return respond({ username: "回归测试" });
    if (path === "/api/projects") return respond([{ id: projectId, name: "回归项目", permissions: [...permissionSchema.options] }]);
    if (path === `/api/projects/${projectId}/upload-batches`) return respond([]);
    if (path === `/api/projects/${projectId}/documents`) {
      if (request.method() === "POST") {
        await state.beforeSubmit?.();
        return respond({ id: docId });
      }
      return respond([{ id: docId, state: "review" }]);
    }
    if (path === `/api/documents/${docId}`) {
      state.getCount++;
      await state.beforeGet?.();
      return respond(structuredClone(state.doc));
    }
    if (path.endsWith("/review")) {
      const body = request.postDataJSON();
      state.reviews.push(body);
      await state.beforeReview?.();
      if (body.revision !== state.doc.revision) return respond({ error: "VERSION_CONFLICT" }, 409);
      state.doc = { ...state.doc, revision: state.doc.revision + 1, marks: body.marks };
      return respond({ revision: state.doc.revision });
    }
    if (path.endsWith("/download-link")) {
      state.downloads.push(request.postDataJSON());
      return respond({ error: "VERSION_CONFLICT" }, 409);
    }
    throw new Error(`Unexpected fixture request: ${request.method()} ${path}`);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "回归项目", exact: true }).click();
  await page.locator(".create-project summary").click();
  if (open) {
    await page.getByRole("button", { name: /文本 1/ }).click();
    await page.getByRole("button", { name: "逐条复核", exact: true }).click();
    await expect(page.getByLabel("标记 1 处理决定")).toBeEnabled();
  }
  return state;
}

test("in-flight polling cannot rebase a dirty review onto a newer revision", async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  const state = await workspace(page, "running");
  const poll = deferred();
  state.beforeGet = () => poll.promise;
  await page.clock.runFor(3000);
  await expect.poll(() => state.getCount).toBe(2);
  await page.getByLabel("标记 1 处理决定").selectOption("redact");
  state.doc.revision = 2;
  state.doc.marks[1].decision = "redact";
  state.doc.job!.status = "cancelled";
  poll.resolve();
  await page.clock.runFor(1600);
  await expect(page.locator(".statusbar span").nth(1)).toHaveText("复核版本 1 · 当前修改未保存 · 上一版本：尚无已保存审定");
  await expect(page.getByLabel("标记 1 处理决定")).toHaveValue("redact");
  await page.getByRole("button", { name: "保存复核", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("内容已在其他窗口更新");
  expect(state.reviews[0].revision).toBe(1);
  expect(state.doc.marks[1].decision).toBe("redact");
  await expect(page.getByLabel("标记 1 处理决定")).toHaveValue("redact");
  await page.getByRole("button", { name: "重新载入最新复核" }).click();
  await page.getByRole("alertdialog", { name: "操作确认" }).getByRole("button", { name: "确认执行", exact: true }).click();
  await expect(page.locator(".statusbar span").nth(1)).toHaveText("复核版本 2 · 尚无已保存审定");
  await expect(page.getByLabel("标记 2 处理决定")).toHaveValue("redact");
});

test("saving locks all editors and navigation until the authoritative reload finishes", async ({ page }) => {
  const state = await workspace(page);
  const save = deferred(), reload = deferred();
  state.beforeReview = () => save.promise;
  state.beforeGet = () => reload.promise;
  await page.getByLabel("标记 1 处理决定").selectOption("redact");
  await page.getByRole("button", { name: "保存复核", exact: true }).click();
  await expect.poll(() => state.reviews.length).toBe(1);
  for (const locator of [
    page.getByLabel("标记 2 处理决定"),
    page.getByRole("button", { name: "删除标记" }).first(),
    page.getByRole("button", { name: "提交新文本", exact: true }),
    page.getByRole("button", { name: "回归项目", exact: true }),
    page.getByLabel("项目名称", { exact: true }),
  ]) await expect(locator).toBeDisabled();
  save.resolve();
  await expect.poll(() => state.getCount).toBe(2);
  await expect(page.getByLabel("标记 2 处理决定")).toBeDisabled();
  reload.resolve();
  await expect(page.getByText("复核已保存", { exact: true })).toBeVisible();
  await expect(page.getByLabel("标记 2 处理决定")).toBeEnabled();
  await expect(page.getByLabel("标记 1 处理决定")).toHaveValue("redact");
  await page.screenshot({ path: "test-results/review-blue-desktop.png", fullPage: true });
});

test("submission locks draft and project selection while the request is pending", async ({ page }) => {
  const state = await workspace(page, "succeeded", false);
  const submit = deferred();
  await page.getByRole("button", { name: "导入材料", exact: true }).click();
  state.beforeSubmit = () => submit.promise;
  await page.getByLabel("待处理文本").fill("13800138000");
  await page.getByRole("button", { name: "提交并识别" }).click();
  await expect(page.getByLabel("待处理文本")).toBeDisabled();
  await expect(page.getByRole("button", { name: "回归项目", exact: true })).toBeDisabled();
  submit.resolve();
  await expect(page.getByLabel("原文", { exact: true })).toBeVisible();
});

test("download submits the displayed revision and does not download on conflict", async ({ page }) => {
  const state = await workspace(page);
  state.doc.revision = 2;
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.getByRole("button", { name: "核验并下载 TXT" }).click();
  await expect(page.getByRole("alert")).toContainText("内容已在其他窗口更新");
  expect(state.downloads).toEqual([{ revision: 1 }]);
  expect(downloads).toBe(0);
  await expect(page.getByRole("button", { name: "核验并下载 TXT" })).toBeDisabled();
});

test("paginated marks keep off-page decisions in the full saved review", async ({ page }) => {
  const state = await workspace(page, "succeeded", false);
  state.doc.text = "13800138000 ".repeat(103);
  state.doc.marks = Array.from({ length: 103 }, (_, i) => ({ start: i * 12, end: i * 12 + 11, kind: "手机号", decision: "ignore" }));
  await page.getByRole("button", { name: /文本 1/ }).click();
  await page.getByRole("button", { name: "逐条复核", exact: true }).click();
  await expect(page.getByRole("combobox", { name: /标记 \d+ 处理决定/ })).toHaveCount(50);
  await page.getByRole("button", { name: "下一页" }).click();
  await page.getByLabel("标记 51 处理决定").selectOption("redact");
  await page.getByRole("button", { name: "上一页" }).click();
  await page.getByRole("button", { name: "保存复核", exact: true }).click();
  await expect(page.getByText("复核已保存", { exact: true })).toBeVisible();
  expect(state.reviews[0].marks).toHaveLength(103);
  expect(state.reviews[0].marks[50].decision).toBe("redact");
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/review-blue-desktop-wide.png", fullPage: true });
});

test("login uses the supplied tokens at desktop viewport sizes", async ({ page }) => {
  await page.route("**/api/session", route => route.fulfill({ json: { username: null } }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "登录工作台" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/基础工程预览|无模型外发|原文持续保存|M1|未接入/);
  expect(await page.getByRole("button", { name: "登录工作台" }).evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(52, 10, 94)");
  await page.screenshot({ path: "test-results/login-purple-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/login-purple-desktop-wide.png", fullPage: true });
});

test("project landing, collapsible sidebar and pending uploads stay usable", async ({ page }) => {
  await workspace(page, "succeeded", false);
  await expect(page.getByRole("region", { name: "材料列表" })).toBeVisible();
  await expect(page.getByLabel("待处理文本")).toHaveCount(0);
  await page.getByRole("button", { name: "收起侧栏" }).click();
  await expect(page.getByRole("button", { name: "展开侧栏" })).toBeVisible();
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await page.getByRole("button", { name: "导入材料", exact: true }).click();
  await page.getByLabel("选择文件", { exact: true }).setInputFiles({ name: "待上传.txt", mimeType: "text/plain", buffer: Buffer.from("联系13800138000") });
  await page.getByRole("button", { name: "返回材料列表" }).click();
  await page.getByRole("alertdialog", { name: "操作确认" }).getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByText("待上传.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "回归项目", exact: true }).click();
  await page.getByRole("alertdialog", { name: "操作确认" }).getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByText("待上传.txt", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/基础工程|工程取舍|开发进度|第一批|M1|未接入|无模型外发/);
  await page.getByRole("button", { name: "返回材料列表" }).click();
  await page.getByRole("alertdialog", { name: "操作确认" }).getByRole("button", { name: "确认执行", exact: true }).click();
  await expect(page.getByRole("button", { name: /文本 1/ })).toBeVisible();
  await page.screenshot({ path: "test-results/materials-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("button", { name: "收起侧栏" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/materials-desktop-wide.png", fullPage: true });
});

test("session expiry from background polling cancels an App-owned destructive confirmation", async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await workspace(page, "running");
  let expiredPolls = 0, deletes = 0;
  // Keep the session endpoint consistent with the expired cookie after the poll's 401.
  // A remounted workspace now re-reads this endpoint instead of retaining old UI state.
  await page.route("**/api/session", async route => {
    if (expiredPolls) await route.fulfill({ json: { username: null } });
    else await route.fallback();
  });
  await page.route(`**/api/documents/${docId}**`, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/delete")) {
      deletes++;
      await route.fulfill({ status: 401, json: { error: "LOGIN_REQUIRED" } });
    } else if (path === `/api/documents/${docId}`) {
      expiredPolls++;
      await route.fulfill({ status: 401, json: { error: "LOGIN_REQUIRED" } });
    } else await route.fallback();
  });
  await page.getByRole("button", { name: "删除材料", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "操作确认" })).toBeVisible();
  // The document background poll runs every 3000 ms; advance past one full interval.
  await page.clock.runFor(3200);
  await expect.poll(() => expiredPolls).toBe(1);
  await expect(page.getByRole("alertdialog", { name: "操作确认" })).toHaveCount(0);
  const account = page.getByLabel("账号", { exact: true });
  await expect(account).toBeVisible();
  await account.fill("重新登录账号");
  await expect(account).toHaveValue("重新登录账号");
  expect(deletes).toBe(0);
});


test("autosave drains the latest review edit after a slow previous save without losing source decisions",async({page})=>{
 await page.clock.install();await page.clock.pauseAt(new Date());
 const state=await workspace(page),first=deferred();let writes=0;
 state.beforeRecovery=()=>++writes===1?first.promise:Promise.resolve();
 await page.getByLabel("标记 1 处理决定").selectOption("redact");
 await page.clock.runFor(1600);await expect.poll(()=>state.recoveryWrites.length).toBe(1);
 await page.getByLabel("标记 2 处理决定").selectOption("redact");
 await page.clock.runFor(1600);expect(state.recoveryWrites.length).toBe(1);
 first.resolve();await expect.poll(()=>state.recoveryWrites.length).toBe(2);
 expect(state.recoveryWrites[0].recoveryRevision).toBe(0);
 expect(state.recoveryWrites[1].recoveryRevision).toBe(1);
 expect(state.recoveryWrites[1].draft.marks.map((m:any)=>m.decision)).toEqual(["redact","redact"]);
 expect(state.reviews).toHaveLength(0);expect(state.downloads).toHaveLength(0);
 await expect(page.getByText("草稿已自动保存；保存复核后才能导出。")).toBeVisible();
});
