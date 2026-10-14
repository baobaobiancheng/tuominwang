import pg from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { passwordHash } from "../packages/adapters/storage.ts";
const rl = createInterface({ input: process.stdin, output: process.stdout });
const generate = process.argv.includes("--generate");
const username =
  process.env.ADMIN_USERNAME ??
  (generate ? "admin" : await rl.question("账号："));
const password =
  process.env.ADMIN_PASSWORD ??
  (generate
    ? randomBytes(18).toString("base64url")
    : await rl.question("初始密码（至少12位；终端输入会显示）："));
rl.close();
if (
  !username ||
  username.length > 80 ||
  password.length < 12 ||
  password.length > 128
)
  throw new Error("INVALID_CREDENTIALS");
const c = new pg.Client({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
await c.connect();
try {
  await c.query("BEGIN");
  await c.query(
    "INSERT INTO users(id,tenant_id,username,password_hash) VALUES($1,$2,$3,$4)",
    [randomUUID(), randomUUID(), username, passwordHash(password)],
  );
  if (generate) {
    await mkdir(".data", { recursive: true, mode: 0o700 });
    await writeFile(
      ".data/开发登录.json",
      JSON.stringify({ username, password }, null, 2),
      { flag: "wx", mode: 0o600 },
    );
  }
  await c.query("COMMIT");
  console.log("账号已创建；不会默认获得他人项目权限。");
  if (generate)
    console.log(
      "随机登录凭据保存于 .data/开发登录.json（仅本机，勿提交或分享）。",
    );
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  await c.end();
}
