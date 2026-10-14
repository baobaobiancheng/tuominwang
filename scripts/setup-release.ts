import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const directory = resolve(".data/releases"); await mkdir(directory, { recursive: true, mode: 0o700 });
const path = resolve(directory, "linux.env"), username = "admin", password = randomBytes(24).toString("hex");
await writeFile(path, `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}\nAPP_DB_PASSWORD=${randomBytes(24).toString("hex")}\nDATA_KEY=${randomBytes(32).toString("hex")}\nSESSION_KEY=${randomBytes(32).toString("hex")}\nAPP_ORIGIN=http://127.0.0.1:5188\nWEB_PORT=5188\nDOWNLOAD_TTL_SECONDS=300\nMODEL_BUNDLE_DIR=${resolve(directory, "models")}\nADMIN_USERNAME=${username}\nADMIN_PASSWORD=${password}\n`, { flag: "wx", mode: 0o600 });
await writeFile(resolve(directory, "本地容器登录.json"), JSON.stringify({ username, password }, null, 2), { flag: "wx", mode: 0o600 });
console.log("Independent Linux configuration created (existing .env untouched). Credentials saved only in .data/releases/本地容器登录.json.");
