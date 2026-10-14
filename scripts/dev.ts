import { spawn } from "node:child_process";
process.loadEnvFile(".env");
const {
  MIGRATION_DATABASE_URL,
  POSTGRES_PASSWORD,
  APP_DB_PASSWORD,
  ADMIN_PASSWORD,
  ...runtimeEnv
} = process.env;
const children = [
  ["--import", "tsx", "apps/api/main.ts"],
  ["--import", "tsx", "apps/worker/main.ts"],
  ["node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.ts"],
].map((args) =>
  spawn(process.execPath, args, { stdio: "inherit", env: runtimeEnv }),
);
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const c of children) c.kill("SIGTERM");
  process.exitCode = code;
}
for (const c of children) c.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
