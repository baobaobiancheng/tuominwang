import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const db = randomBytes(24).toString("hex"),
  app = randomBytes(24).toString("hex");
await writeFile(
  ".env",
  `POSTGRES_PASSWORD=${db}\nAPP_DB_PASSWORD=${app}\nMIGRATION_DATABASE_URL=postgres://tmw_owner:${db}@127.0.0.1:55439/tuominwang\nDATABASE_URL=postgres://tmw_app:${app}@127.0.0.1:55439/tuominwang\nDATA_KEY=${randomBytes(32).toString("hex")}\nSESSION_KEY=${randomBytes(32).toString("hex")}\nAPP_ORIGIN=http://127.0.0.1:5178\nPORT=4318\nDATA_DIR=.data/files\n`,
  { flag: "wx", mode: 0o600 },
);
console.log("已生成 .env（拒绝覆盖已有配置）。下一步 docker compose up -d");
