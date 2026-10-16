import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scrypt } from "node:crypto";
import { mkdir, open, rename, unlink, type FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { parsePortableJson } from "./workspace-portable.ts";

// Direct TMM adaptation of readable/main.js cf/lf. Keep the on-disk header,
// chunk AAD, 4 MiB chunk size, and 32 GiB container declaration compatible.
const MAGIC = "LBTSC001", HEADER_BYTES = 65536, PREFIX_BYTES = 16;
const CHUNK_BYTES = 4194304, CONTAINER_MAX = 34359738368;
const TYPES = new Set(["tmm-workspace", "tmm-transfer"]);
type Header = {
  format: "lawbot-secure-container"; version: 1; objectType: string;
  objectId: string; cipher: "AES-256-GCM"; chunkSize: number;
  plaintextLength: number; chunkCount: number; createdAt: string;
  keySlots: Record<string, unknown>[];
  headerAuth: { nonceBase64: string; tagBase64: string };
};
const fail = (code: string): never => { throw new Error(code); };
function canonical(v: any): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
function chunkAad(header: Header, index: number, size: number) {
  return Buffer.from(canonical({ format: header.format, version: header.version,
    objectType: header.objectType, objectId: header.objectId,
    chunkIndex: index, plaintextLength: size }));
}
async function writeAt(handle: FileHandle, bytes: Buffer, offset: number) {
  let done = 0;
  while (done < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, done, bytes.length - done, offset + done);
    if (!bytesWritten) fail("SECURE_CONTAINER_WRITE_FAILED");
    done += bytesWritten;
  }
}
async function readAt(handle: FileHandle, length: number, offset: number) {
  const bytes = Buffer.allocUnsafe(length);
  let done = 0;
  while (done < length) {
    const { bytesRead } = await handle.read(bytes, done, length - done, offset + done);
    if (!bytesRead) fail("SECURE_CONTAINER_TRUNCATED");
    done += bytesRead;
  }
  return bytes;
}
function positiveSize(value: number, code: string) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
}
async function derive(password: string, kdf: any) {
  if (typeof password !== "string" || password.length < 4 || Buffer.byteLength(password) > 1024 || !password.trim()) fail("PORTABLE_PASSWORD_INVALID");
  if (kdf?.algorithm !== "SCRYPT" || kdf.keyLength !== 32 || !Number.isSafeInteger(kdf.N) || kdf.N < 16384 || kdf.N > 1048576 || kdf.N & kdf.N - 1 || !Number.isSafeInteger(kdf.r) || kdf.r < 8 || kdf.r > 32 || !Number.isSafeInteger(kdf.p) || kdf.p < 1 || kdf.p > 8) fail("PORTABLE_KDF_INVALID");
  const salt = Buffer.from(kdf.saltBase64 ?? "", "base64");
  if (salt.length < 16 || salt.length > 64 || salt.toString("base64") !== kdf.saltBase64 || 128 * kdf.N * kdf.r > 256 * 1024 * 1024) fail("PORTABLE_KDF_INVALID");
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32,
    { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: Math.max(268435456, 128 * kdf.N * kdf.r + 33554432) },
    (error, value) => error ? reject(new Error("PORTABLE_KDF_FAILED")) : resolve(Buffer.from(value))));
}
const slotAad = (slot: any) => ({ slotId: slot.slotId, kind: "transfer", wrapAlgorithm: "AES-256-GCM", kdf: slot.kdf });
function exactB64(value: any, bytes: number) {
  if (typeof value !== "string") fail("PORTABLE_KEY_SLOT_INVALID");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== bytes || decoded.toString("base64") !== value) fail("PORTABLE_KEY_SLOT_INVALID");
  return decoded;
}
export async function createTmmTransferSlot(password: string, dek: Buffer, kdfInput?: { N: number; r: number; p: number }) {
  if (dek.length !== 32) fail("PORTABLE_KEY_INVALID");
  const kdf = { algorithm: "SCRYPT", N: 131072, r: 8, p: 1, keyLength: 32, ...kdfInput,
    saltBase64: randomBytes(16).toString("base64") },
    slot: Record<string, any> = { slotId: randomUUID(), kind: "transfer", wrapAlgorithm: "AES-256-GCM", kdf };
  const kek = await derive(password, kdf);
  try {
    const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", kek, nonce);
    cipher.setAAD(Buffer.from(canonical(slotAad(slot))), { plaintextLength: 32 });
    const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
    Object.assign(slot, { nonceBase64: nonce.toString("base64"), tagBase64: cipher.getAuthTag().toString("base64"),
      wrappedKeyCiphertextBase64: wrapped.toString("base64") });
    return slot;
  } finally { kek.fill(0); }
}
export async function openSecurePortableWithPassword(filePath: string, password: string) {
  const handle = await open(filePath, "r"); let header: Header;
  try {
    const prefix = await readAt(handle, PREFIX_BYTES, 0);
    if (prefix.subarray(0, 8).toString("ascii") !== MAGIC || prefix.readUInt32LE(8) !== HEADER_BYTES) fail("SECURE_CONTAINER_INVALID_MAGIC");
    const length = prefix.readUInt32LE(12);
    if (!length || length > HEADER_BYTES) fail("SECURE_CONTAINER_INVALID_HEADER");
    header = parsePortableJson(await readAt(handle, length, PREFIX_BYTES)) as Header;
  } finally { await handle.close(); }
  const slots = header.keySlots?.filter((slot: any) => slot?.kind === "transfer");
  if (slots?.length !== 1) fail("PORTABLE_LOCAL_KEY_REQUIRED");
  const slot = slots[0];
  if (slot.wrapAlgorithm !== "AES-256-GCM" || typeof slot.slotId !== "string") fail("PORTABLE_KEY_SLOT_INVALID");
  const kek = await derive(password, slot.kdf);
  let dek: Buffer;
  try {
    const cipher = createDecipheriv("aes-256-gcm", kek, exactB64(slot.nonceBase64, 12));
    cipher.setAAD(Buffer.from(canonical(slotAad(slot))), { plaintextLength: 32 });
    cipher.setAuthTag(exactB64(slot.tagBase64, 16));
    dek = Buffer.concat([cipher.update(exactB64(slot.wrappedKeyCiphertextBase64, 32)), cipher.final()]);
  } catch { return fail("PORTABLE_AUTH_FAILED"); }
  finally { kek.fill(0); }
  try { return await openSecurePortableFile(filePath, dek); }
  finally { dek.fill(0); }
}
export async function writeSecurePortableFile(input: {
  outputPath: string; plaintext: AsyncIterable<Uint8Array>; dek: Buffer;
  objectType: "tmm-workspace" | "tmm-transfer"; objectId: string;
  keySlots: Record<string, unknown>[]; signal?: AbortSignal;
}) {
  if (input.signal?.aborted) fail("PORTABLE_ABORTED");
  if (input.dek.length !== 32 || !TYPES.has(input.objectType) || !input.objectId ||
      Buffer.byteLength(input.objectId) > 512) fail("SECURE_CONTAINER_INVALID_HEADER");
  await mkdir(dirname(input.outputPath), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(input.outputPath), `.${basename(input.outputPath)}.${randomUUID()}.tmp`);
  const key = Buffer.from(input.dek);
  let handle: FileHandle | undefined;
  try {
    handle = await open(temporary, "wx", 0o600);
    await writeAt(handle, Buffer.alloc(PREFIX_BYTES + HEADER_BYTES), 0);
    const chunk = Buffer.allocUnsafe(CHUNK_BYTES);
    const createdAt = new Date().toISOString();
    let filled = 0, total = 0, count = 0, diskAt = PREFIX_BYTES + HEADER_BYTES;
    const base = { format: "lawbot-secure-container" as const, version: 1 as const,
      objectType: input.objectType, objectId: input.objectId,
      cipher: "AES-256-GCM" as const, chunkSize: CHUNK_BYTES,
      createdAt, keySlots: input.keySlots };
    const flush = async () => {
      if (!filled) return;
      if (total + filled > CONTAINER_MAX) fail("SECURE_CONTAINER_LIMIT_EXCEEDED");
      const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(canonical({ format: base.format, version: base.version,
        objectType: base.objectType, objectId: base.objectId,
        chunkIndex: count, plaintextLength: filled })), { plaintextLength: filled });
      const encrypted = Buffer.concat([cipher.update(chunk.subarray(0, filled)), cipher.final()]);
      for (const part of [nonce, cipher.getAuthTag(), encrypted]) {
        await writeAt(handle!, part, diskAt); diskAt += part.length;
      }
      total += filled; count++; filled = 0;
    };
    const iterator = input.plaintext[Symbol.asyncIterator]();
    const nextChunk = async () => {
      if (!input.signal) return iterator.next();
      input.signal.throwIfAborted();
      let abort = () => {};
      const cancelled = new Promise<never>((_resolve, reject) => {
        abort = () => reject(new Error("PORTABLE_ABORTED"));
        input.signal!.addEventListener("abort", abort, { once: true });
      });
      try { return await Promise.race([iterator.next(), cancelled]); }
      finally { input.signal.removeEventListener("abort", abort); }
    };
    for (;;) {
      const item = await nextChunk();
      if (item.done) break;
      const next = item.value;
      if (input.signal?.aborted) fail("PORTABLE_ABORTED");
      if (!(next instanceof Uint8Array)) fail("SECURE_CONTAINER_INPUT_INVALID");
      let offset = 0;
      while (offset < next.byteLength) {
        const size = Math.min(CHUNK_BYTES - filled, next.byteLength - offset);
        Buffer.from(next.buffer, next.byteOffset + offset, size).copy(chunk, filled);
        filled += size; offset += size;
        if (filled === CHUNK_BYTES) await flush();
      }
    }
    await flush();
    if (input.signal?.aborted) fail("PORTABLE_ABORTED");
    const unsigned = { ...base, plaintextLength: total, chunkCount: count };
    const nonce = randomBytes(12), auth = createCipheriv("aes-256-gcm", key, nonce);
    auth.setAAD(Buffer.from(canonical(unsigned)), { plaintextLength: 0 }); auth.final();
    const header: Header = { ...unsigned, headerAuth: {
      nonceBase64: nonce.toString("base64"), tagBase64: auth.getAuthTag().toString("base64") } };
    const encoded = Buffer.from(JSON.stringify(header));
    if (encoded.length > HEADER_BYTES) fail("SECURE_CONTAINER_HEADER_TOO_LARGE");
    const prefix = Buffer.alloc(PREFIX_BYTES);
    prefix.write(MAGIC, 0, "ascii"); prefix.writeUInt32LE(HEADER_BYTES, 8);
    prefix.writeUInt32LE(encoded.length, 12);
    await writeAt(handle, prefix, 0); await writeAt(handle, encoded, PREFIX_BYTES);
    await handle.sync(); await handle.close(); handle = undefined;
    // As in cf, verify authenticated header and a boundary chunk before rename.
    const checked = await openSecurePortableFile(temporary, key);
    try { if (total) { await checked.readRange(0, 1); if (total > 1) await checked.readRange(total - 1, 1); } }
    finally { await checked.close(); }
    if (input.signal?.aborted) fail("PORTABLE_ABORTED");
    await rename(temporary, input.outputPath);
    return header;
  } finally {
    key.fill(0);
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
}

export async function openSecurePortableFile(filePath: string, dek: Buffer) {
  if (dek.length !== 32) fail("SECURE_CONTAINER_INVALID_KEY");
  const handle = await open(filePath, "r");
  const key = Buffer.from(dek);
  try {
    const prefix = await readAt(handle, PREFIX_BYTES, 0);
    if (prefix.subarray(0, 8).toString("ascii") !== MAGIC ||
        prefix.readUInt32LE(8) !== HEADER_BYTES) fail("SECURE_CONTAINER_INVALID_MAGIC");
    const headerLength = prefix.readUInt32LE(12);
    if (!headerLength || headerLength > HEADER_BYTES) fail("SECURE_CONTAINER_INVALID_HEADER");
    const header = JSON.parse((await readAt(handle, headerLength, PREFIX_BYTES)).toString("utf8")) as Header;
    if (header.format !== "lawbot-secure-container" || header.version !== 1 ||
        !TYPES.has(header.objectType) || header.chunkSize !== CHUNK_BYTES ||
        header.cipher !== "AES-256-GCM" || !Array.isArray(header.keySlots))
      fail("SECURE_CONTAINER_INVALID_HEADER");
    positiveSize(header.plaintextLength, "SECURE_CONTAINER_INVALID_HEADER");
    positiveSize(header.chunkCount, "SECURE_CONTAINER_INVALID_HEADER");
    if (header.plaintextLength > CONTAINER_MAX ||
        header.chunkCount !== Math.ceil(header.plaintextLength / CHUNK_BYTES) ||
        (await handle.stat()).size !== PREFIX_BYTES + HEADER_BYTES +
          header.plaintextLength + 28 * header.chunkCount) fail("SECURE_CONTAINER_INVALID_HEADER");
    const { headerAuth, ...unsigned } = header;
    const auth = createDecipheriv("aes-256-gcm", key, Buffer.from(headerAuth.nonceBase64, "base64"));
    auth.setAAD(Buffer.from(canonical(unsigned)), { plaintextLength: 0 });
    auth.setAuthTag(Buffer.from(headerAuth.tagBase64, "base64"));
    try { auth.final(); } catch { fail("SECURE_CONTAINER_AUTH_FAILED"); }
    const readChunk = async (index: number) => {
      if (!Number.isInteger(index) || index < 0 || index >= header.chunkCount)
        fail("SECURE_CONTAINER_RANGE_INVALID");
      const size = Math.min(CHUNK_BYTES, header.plaintextLength - index * CHUNK_BYTES);
      const raw = await readAt(handle, size + 28,
        PREFIX_BYTES + HEADER_BYTES + index * (CHUNK_BYTES + 28));
      const cipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
      cipher.setAAD(chunkAad(header, index, size), { plaintextLength: size });
      cipher.setAuthTag(raw.subarray(12, 28));
      try { return Buffer.concat([cipher.update(raw.subarray(28)), cipher.final()]); }
      catch { return fail("SECURE_CONTAINER_AUTH_FAILED"); }
    };
    return {
      header,
      async readRange(start: number, length: number) {
        positiveSize(start, "SECURE_CONTAINER_RANGE_INVALID");
        positiveSize(length, "SECURE_CONTAINER_RANGE_INVALID");
        if (length > 67108864 || start > header.plaintextLength ||
            length > header.plaintextLength - start) fail("SECURE_CONTAINER_RANGE_INVALID");
        if (!length) return Buffer.alloc(0);
        const first = Math.floor(start / CHUNK_BYTES), last = Math.floor((start + length - 1) / CHUNK_BYTES);
        const result = Buffer.allocUnsafe(length);
        for (let index = first; index <= last; index++) {
          const block = await readChunk(index);
          const left = Math.max(start, index * CHUNK_BYTES), right = Math.min(start + length, (index + 1) * CHUNK_BYTES);
          block.copy(result, left - start, left - index * CHUNK_BYTES, right - index * CHUNK_BYTES);
          block.fill(0);
        }
        return result;
      },
      createReadStream(start = 0, length = header.plaintextLength - start) {
        const self = this;
        return Readable.from((async function* () {
          positiveSize(start, "SECURE_CONTAINER_RANGE_INVALID");
          positiveSize(length, "SECURE_CONTAINER_RANGE_INVALID");
          if (start > header.plaintextLength || length > header.plaintextLength - start)
            fail("SECURE_CONTAINER_RANGE_INVALID");
          let at = start, left = length;
          while (left) { const size = Math.min(left, CHUNK_BYTES); const block = await self.readRange(at, size); yield block; at += size; left -= size; }
        })());
      },
      async close() { key.fill(0); await handle.close(); },
    };
  } catch (error) { key.fill(0); await handle.close(); throw error; }
}
