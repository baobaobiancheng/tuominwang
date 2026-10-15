import { test, expect } from "./fixture.ts";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import pg from "pg";
import { readOriginal } from "../../packages/adapters/storage.ts";

// Fixed original bytes are generated from this literal source. The absolute
// offsets and hash below were computed independently of the production bridge.
const phone = "13800138000";
const fixtureText = "起😀\r\n" + phone + "\r\n" + "a".repeat(39800) + "😀" + "a".repeat(198) + "\r\n" + phone + "\r\n😀\rZX8终";
const fixture = { input: {
  phone,
  firstPhoneCanonicalStart: 5,
  secondPhoneCanonicalStart: 40020,
  zx8CanonicalStart: 40036,
  sourceSha256: "99d9d35724606ff69a0009c2bbc7c58ddc203d844aaecdbb3a53d2e445b0f7d0",
  textLengthUtf16: 40040,
}, fixtureText };

// Independent test oracle: count canonical UTF-16 code units while reproducing
// the platform textarea rule that CRLF and lone CR each occupy one DOM LF.
function domOffsetForCanonical(canonical: string, target: number) {
  let source = 0, dom = 0;
  while (source < target) {
    if (canonical[source] === "\r" && canonical[source + 1] === "\n") { source += 2; dom++; }
    else { source++; dom++; }
  }
  if (source !== target) throw new Error("FIXTURE_OFFSET_NOT_REPRESENTABLE");
  return dom;
}

function canonicalOffsetForDom(canonical: string, target: number) {
  let source = 0, dom = 0;
  while (dom < target) {
    if (canonical[source] === "\r" && canonical[source + 1] === "\n") { source += 2; dom++; }
    else { source++; dom++; }
  }
  if (dom !== target) throw new Error("DOM_OFFSET_OUT_OF_RANGE");
  return source;
}

async function originalIdentity(documentId: string, originalBytes: Buffer) {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (!url.pathname.startsWith("/tmw_test_")) throw new Error("ISOLATED_DATABASE_REQUIRED");
  const dataDir = resolve(process.env.DATA_DIR ?? "");
  const isolatedStore = resolve(".data/test-runs");
  if (resolve(dataDir, "..") !== isolatedStore || !/^(?:run|edge-retry)-/u.test(basename(dataDir)))
    throw new Error("ISOLATED_OBJECT_STORE_REQUIRED");
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  try {
    const result = await db.query("SELECT source_id,source_hash FROM documents WHERE id=$1", [documentId]);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0] as { source_id: string; source_hash: string };
    const bytes = await readOriginal(row.source_id);
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(bytes).toEqual(originalBytes);
    expect(digest).toBe(row.source_hash);
    return { sourceId: row.source_id, sourceHash: row.source_hash, digest };
  } finally {
    await db.end();
  }
}

test("Edge CRLF text-window selection keeps canonical UTF-16 offsets through review and TXT export", async ({ page }, info) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1440, height: 1000 });

  const originalBytes = Buffer.from(fixtureText, "utf8");
  const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(originalBytes);
  expect(sourceText).toBe(fixture.fixtureText);
  expect(createHash("sha256").update(originalBytes).digest("hex")).toBe(fixture.input.sourceSha256);
  expect(sourceText.indexOf(fixture.input.phone)).toBe(fixture.input.firstPhoneCanonicalStart);
  expect(sourceText.indexOf(fixture.input.phone, sourceText.indexOf(fixture.input.phone) + fixture.input.phone.length)).toBe(fixture.input.secondPhoneCanonicalStart);
  expect(sourceText.indexOf("ZX8")).toBe(fixture.input.zx8CanonicalStart);
  expect(sourceText.length).toBe(fixture.input.textLengthUtf16);
  expect(sourceText.slice(0, fixture.input.secondPhoneCanonicalStart)).toContain("\r\n");
  expect(sourceText.slice(0, fixture.input.secondPhoneCanonicalStart)).toContain("😀");
  expect(sourceText.slice(fixture.input.secondPhoneCanonicalStart, fixture.input.zx8CanonicalStart)).toMatch(/\r(?!\n)/u);

  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel("密码", { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await page.locator(".create-project summary").click();
  const projectName = `合成换行坐标-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("项目名称", { exact: true }).fill(projectName);
  const projectCreated = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/projects");
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  const projectResponse = await projectCreated;
  expect(projectResponse.status()).toBe(200);
  const project = await projectResponse.json() as { id: string; name: string };
  expect(project.name).toBe(projectName);

  await page.getByRole("button", { name: "导入材料", exact: true }).click();
  await page.getByLabel("选择文件", { exact: true }).setInputFiles({
    name: "合成换行坐标.txt", mimeType: "text/plain", buffer: originalBytes,
  });
  await page.getByRole("button", { name: "上传文件", exact: true }).click();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回材料列表", exact: true }).click();

  let documentId = "";
  await expect.poll(async () => {
    const response = await page.request.get(`/api/projects/${project.id}/documents`);
    if (!response.ok()) return false;
    const item = (await response.json()).find((doc: any) => doc.name === "合成换行坐标.txt");
    documentId = item?.id ?? "";
    return !!documentId;
  }, { timeout: 45_000 }).toBe(true);
  let opened: any;
  await expect.poll(async () => {
    const response = await page.request.get(`/api/documents/${documentId}`);
    if (!response.ok()) return false;
    opened = await response.json();
    return opened.state === "review" && opened.job?.kind === "detect" && opened.job?.status === "succeeded";
  }, { timeout: 60_000 }).toBe(true);
  expect(opened.permissions).toContain("view_original");
  expect(opened.permissions).toContain("review");
  expect(opened.permissions).toContain("export");
  const baseRevision = opened.revision as number;
  const identityBefore = await originalIdentity(documentId, originalBytes);

  await page.getByRole("button", { name: /合成换行坐标\.txt/ }).click();
  const groups = page.getByRole("region", { name: "实体分组", exact: true });
  const phoneGroup = groups.locator(".entity-group-card");
  await expect(phoneGroup).toHaveCount(1, { timeout: 45_000 });
  await expect(phoneGroup).toContainText("2 处");
  await phoneGroup.getByRole("button", { name: fixture.input.phone, exact: true }).click();
  await phoneGroup.getByRole("button", { name: "下一处", exact: true }).click();
  await expect(phoneGroup).toContainText("第 2 / 2 处");

  const original = page.getByLabel("原文", { exact: true });
  await expect.poll(async () => original.evaluate((el: HTMLTextAreaElement) => ({
    value: el.value,
    start: el.selectionStart,
    end: el.selectionEnd,
    selected: el.value.slice(el.selectionStart, el.selectionEnd),
  })), { timeout: 15_000 }).toMatchObject({ selected: fixture.input.phone });
  const paginationText = await page.getByLabel("原文分段", { exact: true }).innerText();
  const windowOffset = Number(paginationText.match(/文本位置\s+(\d+)/u)?.[1]) - 1;
  expect(windowOffset).toBe(fixture.input.secondPhoneCanonicalStart - 256);
  const canonicalWindowResponse = await page.request.get(`/api/documents/${documentId}?offset=${windowOffset}&revision=${baseRevision}`);
  expect(canonicalWindowResponse.status()).toBe(200);
  const canonicalWindow = await canonicalWindowResponse.json() as { text: string; textOffset: number; revision: number };
  expect(canonicalWindow.revision).toBe(baseRevision);
  expect(canonicalWindow.textOffset).toBe(windowOffset);
  expect(canonicalWindow.text).toBe(sourceText.slice(windowOffset));
  const phoneDom = await original.evaluate((el: HTMLTextAreaElement) => ({ value: el.value, start: el.selectionStart, end: el.selectionEnd }));
  expect(phoneDom.value).toBe(canonicalWindow.text.replace(/\r\n?/gu, "\n"));
  expect(phoneDom.value.slice(phoneDom.start, phoneDom.end)).toBe(fixture.input.phone);
  expect(phoneDom.start).toBe(255);
  expect(phoneDom.end).toBe(266);
  expect(canonicalWindow.textOffset + canonicalOffsetForDom(canonicalWindow.text, phoneDom.start)).toBe(fixture.input.secondPhoneCanonicalStart);
  expect(canonicalWindow.textOffset + canonicalOffsetForDom(canonicalWindow.text, phoneDom.end)).toBe(fixture.input.secondPhoneCanonicalStart + fixture.input.phone.length);

  const zx8Local = fixture.input.zx8CanonicalStart - canonicalWindow.textOffset;
  const zx8DomStart = phoneDom.value.indexOf("ZX8");
  expect(zx8DomStart).toBe(domOffsetForCanonical(canonicalWindow.text, zx8Local));
  const zx8Selection = await original.evaluate((el: HTMLTextAreaElement, start: number) => {
    el.focus();
    el.setSelectionRange(start, start + 3);
    // The original-text control is read-only. A browser probe confirmed that
    // Shift+ArrowRight cannot extend its selection in this environment.
    // Dispatch the same mouseup handler a user selection reaches, after
    // setting the exact DOM range. This is a synthetic event, not a drag.
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return {
      start: el.selectionStart, end: el.selectionEnd,
      selected: el.value.slice(el.selectionStart, el.selectionEnd),
    };
  }, zx8DomStart);
  expect(zx8Selection.selected).toBe("ZX8");
  expect(zx8Selection.start).toBe(270);
  expect(zx8Selection.end).toBe(273);
  expect(canonicalWindow.textOffset + canonicalOffsetForDom(canonicalWindow.text, zx8Selection.start)).toBe(fixture.input.zx8CanonicalStart);
  await expect(page.getByRole("button", { name: "将选中文字加入标记", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "将选中文字加入标记", exact: true }).click();

  const individual = page.getByRole("button", { name: "逐条复核", exact: true });
  await individual.click();
  await expect(individual).toHaveAttribute("aria-pressed", "true");
  const customDecision = page.getByLabel(/^标记 \d+ 处理决定$/);
  await expect(customDecision).toHaveCount(3);
  for (const decision of await customDecision.all()) await decision.selectOption("redact");
  for (const index of [1, 2]) {
    await page.getByLabel(`标记 ${index} 脱敏方式`, { exact: true }).selectOption("custom");
    await page.getByLabel(`标记 ${index} 替换文字`, { exact: true }).fill("138****8000");
  }
  await page.getByLabel("标记 3 脱敏方式", { exact: true }).selectOption("custom");
  await page.getByLabel("标记 3 替换文字", { exact: true }).fill("***");
  const saveButton = page.getByRole("button", { name: "保存复核", exact: true });
  await expect(saveButton).toBeEnabled();
  const latestBeforeSaveResponse = await page.request.get(`/api/documents/${documentId}?revision=${baseRevision}`);
  expect(latestBeforeSaveResponse.status()).toBe(200);
  const reviewRequestPromise = page.waitForRequest(r => r.method() === "PUT" && new URL(r.url()).pathname === `/api/documents/${documentId}/review`);
  const reviewResponsePromise = page.waitForResponse(r => r.request().method() === "PUT" && new URL(r.url()).pathname === `/api/documents/${documentId}/review`);
  await saveButton.click();
  const [reviewRequest, reviewResponse] = await Promise.all([reviewRequestPromise, reviewResponsePromise]);
  expect(reviewResponse.status()).toBe(200);
  // The route returns only the new revision. The document ID is bound by the
  // exact PUT path above and checked again through the refreshed GET below.
  const savedReview = await reviewResponse.json() as { revision: number };
  expect(savedReview).toEqual({ revision: baseRevision + 1 });
  const savedRevision = savedReview.revision;
  const reviewPayload = reviewRequest.postDataJSON() as { revision: number; marks: any[] };
  expect(reviewPayload.revision).toBe(baseRevision);
  expect(reviewPayload.marks).toHaveLength(3);
  for (const start of [fixture.input.firstPhoneCanonicalStart, fixture.input.secondPhoneCanonicalStart]) {
    const mark = reviewPayload.marks.find(m => m.start === start && m.end === start + fixture.input.phone.length);
    expect(mark).toMatchObject({ decision: "redact", replacement: { mode: "custom", value: "138****8000" } });
  }
  const customMark = reviewPayload.marks.find(m => m.start === fixture.input.zx8CanonicalStart && m.end === fixture.input.zx8CanonicalStart + 3);
  expect(customMark).toMatchObject({ kind: "自定义", decision: "redact", replacement: { mode: "custom", value: "***" } });
  await expect(page.getByText("复核已保存", { exact: true })).toBeVisible();
  const savedViewResponse = await page.request.get(`/api/documents/${documentId}`);
  expect(savedViewResponse.status()).toBe(200);
  const savedView = await savedViewResponse.json() as { id: string; revision: number; state: string };
  expect(savedView).toMatchObject({ id: documentId, revision: savedRevision, state: "review" });

  const exportResponsePromise = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/documents/${documentId}/export`);
  await page.getByRole("button", { name: "导出已选标记的处理副本", exact: true }).click();
  const exportResponse = await exportResponsePromise;
  expect(exportResponse.status()).toBe(200);
  const exportJob = await exportResponse.json() as { id: string };
  expect(exportJob.id).toMatch(/^[0-9a-f-]{36}$/iu);
  await expect.poll(async () => {
    const view = await (await page.request.get(`/api/documents/${documentId}`)).json();
    return view.revision === savedRevision && view.state === "review" && view.job?.id === exportJob.id && view.job?.kind === "export" && view.job?.status === "succeeded";
  }, { timeout: 60_000 }).toBe(true);
  const downloadButton = page.getByRole("button", { name: "核验并下载 TXT", exact: true });
  await expect(downloadButton).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadPromise;
  const outputPath = info.outputPath("crlf-reviewed.txt");
  await download.saveAs(outputPath);
  const exported = await readFile(outputPath, "utf8");
  const expectedExport = sourceText.slice(0, fixture.input.firstPhoneCanonicalStart) + "138****8000"
    + sourceText.slice(fixture.input.firstPhoneCanonicalStart + fixture.input.phone.length, fixture.input.secondPhoneCanonicalStart) + "138****8000"
    + sourceText.slice(fixture.input.secondPhoneCanonicalStart + fixture.input.phone.length, fixture.input.zx8CanonicalStart) + "***"
    + sourceText.slice(fixture.input.zx8CanonicalStart + 3);
  expect(exported).toBe(expectedExport);
  expect(await originalIdentity(documentId, originalBytes)).toEqual(identityBefore);

  await info.attach("crlf-edge-selection", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
