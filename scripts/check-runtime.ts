import { access, mkdir, readFile, statfs } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { verifyRuntimeRole, pool } from "../packages/adapters/db.ts";
import { verifyNerBundle } from "../packages/core/ner.ts";
import { seal, sign } from "../packages/adapters/storage.ts";

try {
  if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("NODE_24_REQUIRED");
  if (["MIGRATION_DATABASE_URL", "POSTGRES_PASSWORD", "ADMIN_PASSWORD", "OPENAI_API_KEY", "CODEX_HOME"].some(key => !!process.env[key])) throw new Error("RUNTIME_CONTAINS_ADMIN_OR_EXTERNAL_CREDENTIALS");
  const origin = new URL(process.env.APP_ORIGIN ?? "");
  if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== process.env.APP_ORIGIN || origin.username || origin.password) throw new Error("INVALID_APP_ORIGIN");
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(process.env.APP_BASE_PATH ?? "/")) throw new Error("INVALID_APP_BASE_PATH");
  const ttl = Number(process.env.DOWNLOAD_TTL_SECONDS ?? 300);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 86400) throw new Error("INVALID_DOWNLOAD_TTL");
  seal("", "check"); sign("check"); await verifyRuntimeRole();
  const schema = await pool.query("SELECT to_regprocedure('delete_material(uuid,integer,jsonb)') IS NOT NULL AS ready");
  if (!schema.rows[0].ready) throw new Error("DATABASE_MIGRATION_REQUIRED");
  const root = resolve(process.env.DATA_DIR ?? ".data/files"); await mkdir(root, { recursive: true, mode: 0o700 }); await access(root, constants.W_OK);
  const disk = await statfs(root); if (disk.bavail * disk.bsize < 512 * 1024 * 1024) throw new Error("DISK_SPACE_LOW");
  const lock = JSON.parse(await readFile(new URL("./ocr-lock.json", import.meta.url), "utf8"));
  for (const [name, expected] of Object.entries(lock.files)) { const bytes = await readFile(resolve(process.env.OCR_MODEL_DIR ?? ".data/models/ocr", name)); if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error("OCR_MODEL_MISMATCH"); }
  if (process.env.NER_ENABLED === "1") await verifyNerBundle();
  await pool.end();
  console.log("Configuration, database role, storage and model hashes verified.");
  const target = process.argv[2];
  if (target) {
    if (!["api", "worker"].includes(target)) throw new Error("INVALID_PROCESS");
    const child = spawn(process.execPath, [`apps/${target}/main.ts`], { stdio: "inherit", env: process.env });
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
    child.on("exit", code => { process.exitCode = code ?? 1; }); child.on("error", () => { console.error("PROCESS_START_FAILED"); process.exitCode = 1; });
  }
} catch (e) {
  await pool.end().catch(() => {});
  // Do not print connection strings, SQL parameters or secret-bearing runtime config.
  console.error("CONFIGURATION_CHECK_FAILED", e instanceof Error && /^[A-Z0-9_]+$/.test(e.message) ? e.message : "CHECK_DEPENDENCIES_AND_LOCAL_CONFIGURATION"); process.exitCode = 1;
}
