import { spawnSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

// This creates a separate test organization in the independent local release database, never the business workspace.
process.loadEnvFile(".data/releases/linux.env");
assert.equal(process.env.APP_ORIGIN, "http://127.0.0.1:5188");
const username = "isolated-release-" + randomUUID().slice(0, 8), password = randomBytes(24).toString("hex");
const created = spawnSync("docker", ["compose", "--env-file", ".data/releases/linux.env", "-f", "deploy/compose.yaml", "run", "--rm", "admin"], { env: { ...process.env, ADMIN_USERNAME: username, ADMIN_PASSWORD: password }, encoding: "utf8" });
if (created.status !== 0) throw new Error("ISOLATED_RELEASE_ACCOUNT_FAILED");
const output = resolve(".data/evals/linux-release"); await mkdir(output, { recursive: true, mode: 0o700 });
const landing = await fetch(process.env.APP_ORIGIN!);
assert.equal(landing.status, 200);
assert.equal(landing.headers.get("x-content-type-options"), "nosniff");
assert.equal(landing.headers.get("x-frame-options"), "DENY");
assert.ok(landing.headers.get("content-security-policy")?.includes("default-src 'self'"));
assert.ok(landing.headers.get("cache-control")?.includes("no-store"));
assert.equal((await fetch(process.env.APP_ORIGIN + "/api/projects")).status, 401);
const health = await (await fetch(process.env.APP_ORIGIN + "/api/health")).json();
assert.deepEqual(health.layers, { rules: "ready", ner: "ready", ai: "not_configured" });
for (const service of ["api", "worker", "web"]) {
  const id = spawnSync("docker", ["compose", "--env-file", ".data/releases/linux.env", "-f", "deploy/compose.yaml", "ps", "-q", service], { encoding: "utf8" });
  assert.equal(id.status, 0); assert.match(id.stdout.trim(), /^[a-f0-9]+$/);
  const inspected = spawnSync("docker", ["inspect", id.stdout.trim()], { encoding: "utf8" });
  assert.equal(inspected.status, 0);
  const [container] = JSON.parse(inspected.stdout);
  assert.ok(container.State.Running && container.HostConfig.ReadonlyRootfs);
  assert.ok(["node", "nginx"].includes(container.Config.User));
  assert.ok(container.HostConfig.CapDrop.includes("ALL"));
  assert.ok(container.HostConfig.SecurityOpt.includes("no-new-privileges:true"));
  if (service !== "web") assert.deepEqual(Object.keys(container.NetworkSettings.Networks), ["tuominwang-private_private"]);
  else assert.ok(container.NetworkSettings.Ports["8080/tcp"].every((p: { HostIp: string }) => p.HostIp === "127.0.0.1"));
  assert.ok(!container.Config.Env.some((v: string) => /^(MIGRATION_DATABASE_URL|POSTGRES_PASSWORD|ADMIN_PASSWORD|CODEX_HOME|OPENAI_API_KEY)=/.test(v)));
  if (service !== "web") assert.ok(container.Config.Env.includes("ORT_DISABLE_TELEMETRY=1"));
}
const network = spawnSync("docker", ["network", "inspect", "tuominwang-private_private"], { encoding: "utf8" });
assert.equal(network.status, 0); assert.equal(JSON.parse(network.stdout)[0].Internal, true);
const noPrivateFiles = spawnSync("docker", ["compose", "--env-file", ".data/releases/linux.env", "-f", "deploy/compose.yaml", "exec", "-T", "api", "node", "--input-type=module", "-e", `
  import assert from 'node:assert/strict'; import {existsSync,readdirSync} from 'node:fs';
  for(const path of ['/app/.env','/app/.data','/app/scripts/codex-public-eval.ts','/home/node/.codex/auth.json']) assert.equal(existsSync(path),false);
  assert.deepEqual(readdirSync('/app/tests'),['pdf-fixtures.ts']);
`], { encoding: "utf8" });
assert.equal(noPrivateFiles.status, 0, "IMAGE_FILE_ALLOWLIST_FAILED");
const offlineArgs = ["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--tmpfs", "/tmp:rw,size=256m,mode=1777", "--tmpfs", "/data:rw,size=256m,uid=1000,gid=1000", "--mount", `type=bind,src=${resolve(process.env.MODEL_BUNDLE_DIR!)},dst=/models,readonly`];
const offline = spawnSync("docker", [...offlineArgs, "-e", "DATA_KEY=" + "a".repeat(64), "tuominwang-runtime:local", "node", "scripts/check-offline.ts"], { encoding: "utf8", timeout: 120000 });
assert.equal(offline.status, 0, "OFFLINE_NER_OCR_CHECK_FAILED");
assert.ok(!/telemetry/i.test(offline.stderr), "UNEXPECTED_TELEMETRY_INITIALIZATION");
const badConfig = resolve(output, "invalid-model-config.json"); await writeFile(badConfig, "{}\n", { mode: 0o644 }); // Public, deliberately invalid fixture; container's non-root user must be able to read it.
const tampered = spawnSync("docker", [...offlineArgs, "--mount", `type=bind,src=${badConfig},dst=/models/ner/config.json,readonly`, "tuominwang-runtime:local", "node", "--input-type=module", "-e", `import assert from 'node:assert/strict';import {verifyNerBundle} from './packages/core/ner.ts';await assert.rejects(verifyNerBundle(),/NER_MODEL_MISMATCH/);`], { encoding: "utf8", timeout: 30000 });
assert.equal(tampered.status, 0, "TAMPERED_MODEL_NOT_REJECTED");
const missing = spawnSync("docker", ["compose", "--env-file", ".data/releases/linux.env", "-f", "deploy/compose.yaml", "run", "--rm", "-e", "NER_MODEL_DIR=/models/missing", "api", "node", "scripts/check-runtime.ts"], { encoding: "utf8", timeout: 30000 });
assert.equal(missing.status, 1); assert.ok(missing.stderr.includes("NER_MODEL_REQUIRED"), "MISSING_MODEL_NOT_REJECTED");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors: string[] = [];
  page.on("pageerror", e => errors.push(e.name));
  await page.goto(process.env.APP_ORIGIN!);
  await page.getByLabel("账号", { exact: true }).fill(username); await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录工作台" }).click();
  await page.locator("summary").click(); await page.getByLabel("项目名称").fill("公开合成材料"); await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByRole("button", { name: "导入材料", exact: true }).click(); await page.getByLabel("待处理文本").fill("张三在北京工作，电话13800138000。"); await page.getByRole("button", { name: "提交并识别" }).click();
  await page.getByLabel("标记 1 处理决定").waitFor();
  page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "识别实体候选" }).click();
  await page.getByText("实体候选已识别，请结合上下文复核。", { exact: true }).waitFor({ timeout: 120000 });
  page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "批量脱敏", exact: true }).click();
  await page.getByRole("button", { name: "保存复核", exact: true }).click(); await page.getByText("复核已保存", { exact: true }).waitFor();
  await page.getByRole("button", { name: "导出已选标记的处理副本", exact: true }).click();
  const downloadButton = page.getByRole("button", { name: "核验并下载 TXT", exact: true });
  const download = page.waitForEvent("download", { timeout: 60000 }); await downloadButton.click();
  const file = await download, text = await readFile((await file.path())!, "utf8");
  assert.ok(!text.includes("13800138000") && !text.includes("张三"));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok(!(await page.locator("body").innerText()).match(/浏览器验收|工程评审|开发进度|技术取舍|完整一期/));
  await page.screenshot({ path: resolve(output, "desktop.png"), fullPage: true });
  assert.deepEqual(errors, []);
  await page.locator("main").evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: resolve(output, "desktop-top.png"), fullPage: true });
  const images = spawnSync("docker", ["image", "inspect", "--format", "{{.Id}} {{.Os}}/{{.Architecture}}", "tuominwang-runtime:local", "tuominwang-web:local"], { encoding: "utf8" }); assert.equal(images.status, 0);
  await writeFile(resolve(output, "result.json"), JSON.stringify({ at: new Date().toISOString(), images: images.stdout.trim().split("\n"), viewport: "1440x1000 desktop", stack: "Linux containers, nginx, API, worker, PostgreSQL", ruleNerReviewExportDownload: "passed", offlineNerOcrPixelExport: "passed", missingAndTamperedModels: "rejected", securityHeaders: "passed", containerIsolationAndCredentials: "passed", unauthenticatedAccess: "denied", pageErrors: 0, privateAI: "not_included", productionAccountUsed: false }, null, 2), { mode: 0o600 });
  console.log("Linux desktop rule + real NER -> review -> export -> verified download passed. Evidence:", output);
} finally { await browser.close(); }
