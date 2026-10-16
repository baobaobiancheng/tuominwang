import { createHash } from "node:crypto";
import { link, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { PassThrough, Readable, Transform } from "node:stream";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import yazl from "yazl";
import { openSecurePortableFile, openSecurePortableWithPassword, writeSecurePortableFile } from "./workspace-secure-stream.ts";
import { parsePortableJson } from "./workspace-portable.ts";
import { originalEntryPath } from "./reference/tmm-original-predicates.js";

// Adapted from original main.js _x/vx/Nx/Tx. These limits belong to TMM,
// separate from the existing office ZIP and ordinary file budgets.
export const TMM_V2_ZIP_BUDGET = { entries: 100000, expanded: 34359738368, ratio: 200, json: 67108864, error: "TMM_V2_LIMIT_EXCEEDED" } as const;
export const TMM_V3_ZIP_BUDGET = { entries: 250000, expanded: 137438953472, ratio: 4096, json: 134217728, error: "TMM_V3_LIMIT_EXCEEDED" } as const;
type ZipBudget = typeof TMM_V2_ZIP_BUDGET | typeof TMM_V3_ZIP_BUDGET;
const fail = (code: string): never => { throw new Error(code); };
function entryPath(name: string) {
  originalEntryPath(name);
  if (!name || Buffer.byteLength(name) > 1024 || /[\\\x00-\x1f]/.test(name) ||
      name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.endsWith("/") ||
      name.split("/").some(segment => !segment || segment === "." || segment === ".."))
    fail("TMM_V2_UNSAFE_ENTRY");
  return name;
}
export type TmmStreamEntry = {
  name: string; bytes: number; sha256: string; store: boolean;
  openReadStream: () => Promise<Readable> | Readable;
};
export async function writeTmmZipToSecureFile(input: {
  outputPath: string; objectId: string; dek: Buffer;
  objectType?: "tmm-workspace" | "tmm-transfer";
  keySlots: Record<string, unknown>[]; entries: TmmStreamEntry[];
  signal?: AbortSignal; budget?: ZipBudget;
}) {
  const budget = input.budget ?? TMM_V2_ZIP_BUDGET;
  if (input.signal?.aborted) fail("PORTABLE_ABORTED");
  if (input.entries.length > budget.entries) fail(budget.error);
  const names = new Set<string>(); let declared = 0;
  for (const entry of input.entries) {
    entryPath(entry.name);
    if (names.has(entry.name)) fail("TMM_V2_DUPLICATE_ENTRY");
    names.add(entry.name);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)) fail("TMM_V2_ENTRY_INVALID");
    declared += entry.bytes;
    if (declared > budget.expanded) fail(budget.error);
  }
  const zip = new yazl.ZipFile(), actual = new Map<string, { bytes: number; sha256: string }>();
  const active = new Set<Readable>(); let closed = false;
  const output = zip.outputStream as Readable;
  let streamFailure: Error | undefined;
  // Lazy ZIP sources can fail before the secure writer begins consuming the
  // output. Own both emitters immediately; the generator below returns the
  // same failure through the writer Promise after its header setup.
  output.on("error", error => { streamFailure ??= error; });
  const onError = (error: Error) => {
    streamFailure ??= error;
    if (!closed && !output.destroyed) output.destroy(streamFailure);
  };
  zip.on("error", onError);
  for (const entry of input.entries) {
    zip.addReadStreamLazy(entry.name, {
      size: entry.bytes, compress: !entry.store, forceZip64Format: entry.bytes >= 0xffffffff,
      mtime: new Date("2000-01-01T00:00:00Z"), mode: 0o100600,
    }, callback => {
      const bridge = new PassThrough();
      active.add(bridge);
      bridge.once("close", () => active.delete(bridge));
      bridge.on("error", onError);
      callback(null, bridge);
      void Promise.resolve().then(() => entry.openReadStream()).then(source => {
        if (closed || input.signal?.aborted) {
          source.destroy();
          return;
        }
        active.add(source);
        const digest = createHash("sha256"); let size = 0;
        const checked = new Transform({ transform(chunk: Buffer, _encoding, done) {
          size += chunk.length; digest.update(chunk);
          if (size > entry.bytes) done(new Error("TMM_V2_ENTRY_INVALID"));
          else done(null, chunk);
        }, flush(done) {
          const sha256 = digest.digest("hex");
          if (size !== entry.bytes || sha256 !== entry.sha256) done(new Error("TMM_V2_CHECKSUM_MISMATCH"));
          else { actual.set(entry.name, { bytes: size, sha256 }); done(); }
        } });
        active.add(checked);
        source.once("close", () => active.delete(source)); checked.once("close", () => active.delete(checked));
        source.on("error", onError); checked.on("error", onError);
        source.pipe(checked).pipe(bridge);
      }).catch(error => { if (!closed) bridge.destroy(error); });
    });
  }
  zip.end({ forceZip64Format: true, comment: "" });
  const stagedPath = join(dirname(input.outputPath), `.${basename(input.outputPath)}.${randomUUID()}.verified`);
  try {
    const verifiedZip = (async function* () {
      if (streamFailure) throw streamFailure;
      for await (const part of output) yield part as Buffer;
      if (streamFailure) throw streamFailure;
      if (actual.size !== input.entries.length) fail("TMM_V2_ENTRY_MISSING");
    })();
    const header = await writeSecurePortableFile({ outputPath: stagedPath,
      plaintext: verifiedZip, dek: input.dek,
      objectType: input.objectType ?? "tmm-workspace", objectId: input.objectId,
      keySlots: input.keySlots, signal: input.signal });
    if (input.signal?.aborted) fail("PORTABLE_ABORTED");
    const readback = await openTmmZipFromSecureFile(stagedPath, input.dek, budget);
    try {
      if (readback.entries.size !== input.entries.length) fail("TMM_V2_ENTRY_MISSING");
      for (const entry of input.entries) {
        const digest = createHash("sha256"); let bytes = 0;
        for await (const chunk of await readback.openEntry(entry.name)) { bytes += chunk.length; digest.update(chunk); }
        if (bytes !== entry.bytes || digest.digest("hex") !== entry.sha256) fail("TMM_V2_CHECKSUM_MISMATCH");
      }
    } finally { await readback.close(); }
    if (input.signal?.aborted) fail("PORTABLE_ABORTED");
    // A caller-chosen destination must never replace an existing protected file.
    await link(stagedPath, input.outputPath);
    return { header, actual };
  } catch (error) {
    output.destroy();
    throw error;
  } finally {
    closed = true;
    output.destroy();
    for (const stream of active) stream.destroy();
    await unlink(stagedPath).catch(() => {});
  }
}

export async function openTmmZipFromSecureFile(filePath: string, credential: Buffer | string, budget: ZipBudget = TMM_V2_ZIP_BUDGET) {
  const secure = typeof credential === "string" ?
    await openSecurePortableWithPassword(filePath, credential) : await openSecurePortableFile(filePath, credential);
  class AuthenticatedRandomReader extends yauzl.RandomAccessReader {
    _readStreamForRange(start: number, end: number) { return secure.createReadStream(start, end - start); }
  }
  const random = new AuthenticatedRandomReader();
  let zip: ZipFile;
  try {
    zip = await new Promise<ZipFile>((resolve, reject) => yauzl.fromRandomAccessReader(
      random, secure.header.plaintextLength,
      { autoClose: false, lazyEntries: true, decodeStrings: true,
        validateEntrySizes: true, strictFileNames: true },
      (error, result) => error || !result ? reject(error ?? new Error("TMM_V2_OPEN_FAILED")) : resolve(result)));
    if (zip.entryCount > budget.entries) fail(budget.error);
  } catch (error) { await secure.close(); throw error; }
  const entries = new Map<string, Entry>();
  try {
    await new Promise<void>((resolve, reject) => {
      let expanded = 0, finished = false;
      const stop = (error: Error) => { if (!finished) { finished = true; reject(error); } };
      zip.on("error", stop);
      zip.on("entry", entry => {
        try {
          entryPath(entry.fileName);
          if (entries.has(entry.fileName) || entry.isEncrypted() ||
              ![0, 8].includes(entry.compressionMethod) ||
              !Number.isSafeInteger(entry.uncompressedSize) ||
              !Number.isSafeInteger(entry.compressedSize) ||
              entry.uncompressedSize < 0 || entry.compressedSize < 0 ||
              entry.uncompressedSize > 0 && (entry.compressedSize === 0 ||
                entry.uncompressedSize / entry.compressedSize > budget.ratio))
            fail("TMM_V2_ENTRY_INVALID");
          expanded += entry.uncompressedSize;
          if (expanded > budget.expanded || entries.size >= budget.entries) fail(budget.error);
          entries.set(entry.fileName, entry); zip.readEntry();
        } catch (error) { stop(error as Error); }
      });
      zip.on("end", () => { finished = true; resolve(); });
      zip.readEntry();
    });
  } catch (error) { zip.close(); await secure.close(); throw error; }
  const openEntry = (name: string) => new Promise<Readable>((resolve, reject) => {
    const entry = entries.get(entryPath(name));
    if (!entry) return reject(new Error("TMM_V2_ENTRY_MISSING"));
    zip.openReadStream(entry, (error, stream) => error || !stream ?
      reject(error ?? new Error("TMM_V2_ENTRY_INVALID")) : resolve(stream));
  });
  return {
    header: secure.header,
    entries,
    openEntry,
    async readJson(name: string, maxBytes: number = budget.json) {
      const entry = entries.get(entryPath(name));
      if (!entry) return fail("TMM_V2_ENTRY_MISSING");
      if (entry.uncompressedSize > maxBytes) fail(budget.error);
      const parts: Buffer[] = []; let total = 0;
      for await (const part of await openEntry(name)) {
        total += part.length;
        if (total > maxBytes) fail(budget.error);
        parts.push(Buffer.from(part));
      }
      try { return parsePortableJson(Buffer.concat(parts, total), Infinity); }
      catch { return fail("TMM_V2_JSON_INVALID"); }
    },
    async close() { zip.close(); await secure.close(); },
  };
}
