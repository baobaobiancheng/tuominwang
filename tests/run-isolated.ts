import pg from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, readdir } from "node:fs/promises";
import { resolve } from "node:path";

process.loadEnvFile(".env");
const mode = process.argv[2] ?? "integration";
if (!["integration", "e2e"].includes(mode)) throw new Error("Expected integration or e2e");
const testFilter = process.argv[3];
if (testFilter && !(mode === "e2e" ? /^tests\/e2e\/[a-z0-9-]+\.spec\.ts$/ : /^tests\/[a-z0-9-]+\.integration\.ts$/).test(testFilter)) throw new Error("Expected one local isolated test file");
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
  // Every checked-in integration suite participates; newly ported features
  // cannot silently fall outside the full release gate.
  const integrationFiles=testFilter?[testFilter]:["tests/integration.ts",...(await readdir("tests")).filter(file=>file.endsWith(".integration.ts")).sort().map(file=>"tests/"+file)];
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
