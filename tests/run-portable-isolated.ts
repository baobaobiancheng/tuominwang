import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
process.loadEnvFile(".env");
const name = "tmw_test_" + randomUUID().replaceAll("-", ""), admin = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL }); await admin.connect(); await mkdir(".data/test-runs", { recursive: true }); const dataDir = await mkdtemp(resolve(".data/test-runs", "portable-")); const env: NodeJS.ProcessEnv = { ...process.env, DATA_DIR: dataDir, NER_ENABLED: "0" };
for (const key of ["DATABASE_URL", "MIGRATION_DATABASE_URL"] as const) { const url = new URL(process.env[key]!); url.pathname = "/" + name; env[key] = url.href; }
await admin.query(`CREATE DATABASE ${name}`);
try { for (const args of [["--import", "tsx", "scripts/migrate.ts"], ["--import", "tsx", "--test", "tests/portable.integration.ts"]]) { const run = spawnSync(process.execPath, args, { env, stdio: "inherit" }); if (run.status !== 0) { process.exitCode = 1; break; } } } finally { await admin.query(`DROP DATABASE ${name}`); await admin.end(); await rm(dataDir, { recursive: true }); }
