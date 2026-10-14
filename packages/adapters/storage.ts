import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
export const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
function key() {
  const s = process.env.DATA_KEY ?? "";
  if (!/^[a-f0-9]{64}$/i.test(s)) throw new Error("DATA_KEY_REQUIRED");
  return Buffer.from(s, "hex");
}
export function seal(text: string, aad: string) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(aad));
  return Buffer.concat([
    iv,
    c.update(text, "utf8"),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64");
}
export function unseal(data: string, aad: string) {
  const b = Buffer.from(data, "base64"),
    d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12), {authTagLength:16});
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(b.subarray(-16));
  return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]).toString(
    "utf8",
  );
}
let objectOwner: string | undefined;
// Processing workers handle one immutable input each; HTTP callers pass the owner explicitly.
export function setObjectOwner(owner: string) { if (!/^[a-f0-9-]{36}$/.test(owner)) throw new Error("INVALID_OBJECT"); objectOwner = owner; }
export async function writeArtifact(id: string, text: string, owner = objectOwner) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("INVALID_OBJECT");
  const dir = resolve(process.env.DATA_DIR ?? ".data/files");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (owner) {
    if (!/^[a-f0-9-]{36}$/.test(owner)) throw new Error("INVALID_OBJECT");
    const registry = resolve(dir, ".owners", owner);
    await mkdir(registry, { recursive: true, mode: 0o700 });
    // Register before writing, so crashes/cancellation do not leave unowned private objects.
    await writeFile(resolve(registry, id), "", { flag: "wx", mode: 0o600 });
  }
  await writeFile(resolve(dir, id), seal(text, id), {
    flag: "wx",
    mode: 0o600,
  });
  return hash(text);
}
export async function readArtifact(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("INVALID_OBJECT");
  return unseal(
    await readFile(resolve(process.env.DATA_DIR ?? ".data/files", id), "utf8"),
    id,
  );
}
// Original bytes are encrypted separately from parsed text; never overwrite an object.
export async function writeOriginal(id: string, bytes: Buffer, owner?: string) {
  await writeArtifact(id, bytes.toString("base64"), owner);
}
export async function readOriginal(id: string) {
  return Buffer.from(await readArtifact(id), "base64");
}
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function passwordMatches(password: string, encoded: string) {
  const [salt, value] = encoded.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(value, "hex"),
  );
}
export function sign(value: string) {
  const key = process.env.SESSION_KEY;
  if (!key || key.length < 64) throw new Error("SESSION_KEY_REQUIRED");
  return createHmac("sha256", key).update(value).digest("hex");
}
