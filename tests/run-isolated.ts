import pg from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";

process.loadEnvFile(".env");
const mode = process.argv[2] ?? "integration";
if (!["integration", "e2e"].includes(mode)) throw new Error("Expected integration or e2e");
const testFilter = process.argv[3];
if (testFilter && !(mode === "e2e" ? /^tests\/e2e\/[a-z-]+\.spec\.ts$/ : /^tests\/[a-z-]+\.integration\.ts$/).test(testFilter)) throw new Error("Expected one local isolated test file");
const name = "tmw_test_" + randomUUID().replaceAll("-", "");
const admin = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
await admin.connect();
await mkdir(".data/test-runs", { recursive: true, mode: 0o700 });
const dataDir = await mkdtemp(resolve(".data/test-runs", "run-"));
await admin.query(`CREATE DATABASE ${name}`);
const env: NodeJS.ProcessEnv = { ...process.env, DATA_DIR: dataDir };
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"] as const) {
  const url = new URL(process.env[key]!); url.pathname = "/" + name; env[key] = url.href;
}
env.ADMIN_USERNAME = env.E2E_USERNAME = "isolated-test";
env.ADMIN_PASSWORD = env.E2E_PASSWORD = randomBytes(24).toString("hex");
// Forces Playwright to start its own services; refuses occupied business ports.
if (mode === "e2e") { env.CI = "1"; env.NER_ENABLED = "1"; }
try {
  const integrationFiles=testFilter?[testFilter]:["tests/integration.ts", "tests/files.integration.ts", "tests/resources.integration.ts", "tests/jobs.integration.ts", "tests/recognition.integration.ts", "tests/ner.integration.ts", "tests/mappings.integration.ts", "tests/pages.integration.ts", "tests/ocr.integration.ts", "tests/access.integration.ts", "tests/lifecycle.integration.ts", "tests/presets.integration.ts", "tests/replacement-policies.integration.ts", "tests/portable.integration.ts", "tests/mcp.integration.ts", "tests/office-media.integration.ts", "tests/document-unlock.integration.ts", "tests/contextual-recognition.integration.ts", "tests/portable-unlocked.integration.ts", "tests/default-profile.integration.ts", "tests/feedback.integration.ts", "tests/support.integration.ts", "tests/image-utilities.integration.ts", "tests/restoration-batch.integration.ts", "tests/processing-observability.integration.ts", "tests/workspace-recovery-network.integration.ts", "tests/markdown-manual-draft.integration.ts", "tests/entity-identity.integration.ts", "tests/workspace-compat.integration.ts", "tests/page-review-storage.integration.ts", "tests/circle-redaction.integration.ts", "tests/processing-resources.integration.ts", "tests/reference-markdown.integration.ts", "tests/image-batch-search.integration.ts", "tests/mapping-capacity.integration.ts", "tests/mcp-complete-matrix.integration.ts", "tests/manual-clear-override.integration.ts", "tests/custom-replacement.integration.ts", "tests/custom-visual.integration.ts"];
  const commands = mode==='e2e' ? [
    ["--import", "tsx", "scripts/migrate.ts"],
    ["--import", "tsx", "scripts/admin.ts"], ["node_modules/@playwright/test/cli.js", "test", ...testFilter ? [testFilter] : []],
  ] : integrationFiles.flatMap(file=>[["--import","tsx","scripts/migrate.ts"],["--import","tsx","--test",file]]);
  let migrations=0;
  for (const args of commands) {
    if(mode==='integration'&&args.includes('scripts/migrate.ts')&&migrations++>0){
      // Each file exercises a global worker queue. A fresh database prevents one
      // synthetic workflow's outstanding job being consumed by another file.
      await admin.query(`DROP DATABASE ${name}`);
      await admin.query(`CREATE DATABASE ${name}`);
    }
    const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
    if (result.status !== 0) { process.exitCode = 1; break; }
  }
} finally {
  await admin.query(`DROP DATABASE ${name}`);
  await admin.end();
  await rm(dataDir, { recursive: true });
}
