import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { mkdir, writeFile, readFile, open, link, unlink, lstat } from "node:fs/promises";
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
  let registry: string | undefined;
  if (owner) {
    if (!/^[a-f0-9-]{36}$/.test(owner)) throw new Error("INVALID_OBJECT");
    registry = resolve(dir, ".owners", owner);
    await mkdir(registry, { recursive: true, mode: 0o700 });
  }
  const target = resolve(dir, id), registered = registry ? resolve(registry,id) : target;
  const handle = await open(registered, "wx", 0o600);
  let linked = false;
  try {
    // The private owner directory records even an interrupted empty reservation.
    if (registry) { await link(registered,target); linked = true; }
    await handle.writeFile(seal(text, id), "utf8");
  } catch (error) {
    // A colliding target belongs to somebody else; remove only our reservation.
    if (!registry || !linked) await unlink(registered);
    throw error;
  } finally { await handle.close(); }
  return hash(text);
}
export async function readArtifact(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("INVALID_OBJECT");
  return unseal(
    await readFile(resolve(process.env.DATA_DIR ?? ".data/files", id), "utf8"),
    id,
  );
}
// A caller may release only an artifact it has already tied to this owner.
// Legacy registrations are empty markers, so their flat object must be verified by the caller.
export async function removeOwnedArtifact(id: string, owner: string, legacyFlatVerified = false) {
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9-]{36}$/.test(owner)) throw new Error("INVALID_OBJECT");
  const dir = resolve(process.env.DATA_DIR ?? ".data/files");
  const target = resolve(dir, id), registered = resolve(dir, ".owners", owner, id);
  const statOrMissing = async (path: string) => {
    try { return await lstat(path, { bigint: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  };
  const missingIsOkay = async (path: string) => {
    try { await unlink(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  };
  const registration = await statOrMissing(registered), material = await statOrMissing(target);
  if (!registration) {
    if (material) throw new Error("ARTIFACT_OWNER_MISSING");
    return;
  }
  if (!registration.isFile() || (material && !material.isFile())) throw new Error("ARTIFACT_OWNER_CHANGED");
  if (material) {
    const same = registration.dev === material.dev && registration.ino === material.ino;
    if (!same && !(registration.size === 0n && legacyFlatVerified)) throw new Error("ARTIFACT_OWNER_CHANGED");
    await missingIsOkay(target);
  }
  await missingIsOkay(registered);
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
