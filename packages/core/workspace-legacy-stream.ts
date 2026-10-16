import { createHash, randomUUID } from "node:crypto";
import { link, unlink } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import yazl from "yazl";
import { originalEntryPath } from "./reference/tmm-original-predicates.js";
import { assertSourceWorkspaceV1, assertSourceWorkspaceV2 } from "./reference/workspace-snapshot-schema.js";
import { migrateSourceWorkspaceV1 } from "./reference/tmm-original-v1-migrate.js";
import { parseReferenceMarkdown } from "./reference-markdown.ts";
import { parsePortableJson, validatePortableSnapshot, type PortableObject } from "./workspace-portable.ts";
import type { TmmFileRef } from "./workspace-portable-stream.ts";

// Original xg V1 reopen budgets at main.js:19297,19422ff. The ZIP writer is
// the necessary cloud file-stream replacement for the original in-memory u.
const ENTRY_MAX = 2000, ENTRY_BYTES = 268435456, TOTAL_BYTES = 1073741824;
const parseTmmJson = (bytes: Buffer) => parsePortableJson(bytes, Infinity);
const validateTmmSnapshot = (snapshot: PortableObject) => validatePortableSnapshot(snapshot, Infinity);
const fail = (code: string): never => { throw new Error(code); };
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type Part = Buffer | TmmFileRef;
function size(part: Part) { return Buffer.isBuffer(part) ? part.length : part.bytes; }
function asStream(part: Part) { return Buffer.isBuffer(part) ? Readable.from([part]) : part.openReadStream(); }
function sourceName(d: PortableObject) {
  const prefix = `documents/${d.id}/source`, entry = originalEntryPath(d.sourceEntry);
  if (d.fileKind === "markdown") {
    const expected = `${prefix}${d.detection.markdownSourceSidecar?.originalExtension ?? ".md"}`;
    if (entry !== expected) fail("WORKSPACE_INVALID_SOURCE_ENTRY");
    return expected;
  }
  if (!entry.startsWith(prefix)) fail("WORKSPACE_INVALID_SOURCE_ENTRY");
  return entry === prefix ? `${prefix}${d.fileKind === "image" ? extname(d.fileName).toLowerCase() || ".png" : `.${d.fileKind}`}` : entry;
}
function json(value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > ENTRY_BYTES) fail("WORKSPACE_V1_REQUIRES_V2");
  parseTmmJson(bytes);
  return bytes;
}

export async function writeLegacyWorkspaceToFile(input: {
  snapshot: PortableObject; sources: Map<string, TmmFileRef>; outputPath: string; appVersion?: string; signal?: AbortSignal;
}) {
  input.signal?.throwIfAborted();
  const snapshot = structuredClone(input.snapshot); validateTmmSnapshot(snapshot);
  const parts = new Map<string, Part>();
  parts.set("workspace.json", Buffer.alloc(0));
  for (const d of snapshot.documents) {
    const source = input.sources.get(d.sourceEntry) ?? input.sources.get(d.id);
    if (!source) return fail("PORTABLE_SOURCE_MISSING");
    const entry = sourceName(d);
    d.sourceEntry = entry;
    if (source.bytes > ENTRY_BYTES) fail("WORKSPACE_V1_REQUIRES_V2");
    parts.set(entry, source);
    parts.set(`documents/${d.id}/detection.json`, json(d.detection));
    parts.set(`documents/${d.id}/review.json`, json(d.review));
    if (d.fileKind === "markdown") parts.set(`documents/${d.id}/markdown-source.json`, json(d.detection.markdownSourceSidecar));
  }
  parts.set("workspace.json", json(snapshot));
  if (snapshot.projectModeSnapshot) parts.set("project-mode.json", json(snapshot.projectModeSnapshot));
  if (snapshot.rulesetSnapshot) parts.set("rules/ruleset-snapshot.json", json(snapshot.rulesetSnapshot));
  if (snapshot.profileSnapshot) parts.set("profiles/profile-snapshot.json", json(snapshot.profileSnapshot));
  parts.set("audit/events.jsonl", Buffer.from(`${JSON.stringify({ event: "workspace_saved", at: snapshot.updatedAt, revision: snapshot.contentRevision })}\n`));
  if (parts.size + 1 > ENTRY_MAX) fail("WORKSPACE_V1_REQUIRES_V2");
  let expanded = 0; const checksums: Record<string, string> = {};
  for (const [name, part] of parts) {
    originalEntryPath(name); expanded += size(part);
    if (size(part) > ENTRY_BYTES || expanded > TOTAL_BYTES) fail("WORKSPACE_V1_REQUIRES_V2");
    checksums[name] = Buffer.isBuffer(part) ? sha(part) : part.sha256;
  }
  const manifest = json({ format: "lawbot-tmm", schemaVersion: 2, projectId: snapshot.projectId,
    projectName: snapshot.projectName, createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt,
    appVersion: input.appVersion ?? "tuominwang", documentCount: snapshot.documents.length,
    activeDocumentId: snapshot.activeDocumentId, checksums });
  if (manifest.length > ENTRY_BYTES || expanded + manifest.length > TOTAL_BYTES) fail("WORKSPACE_V1_REQUIRES_V2");
  const zip = new yazl.ZipFile(), actual = new Map<string, string>(), active = new Set<Readable>();
  let closed = false;
  const onError = (error: Error) => (zip.outputStream as Readable).destroy(error);
  const onAbort = () => {
    onError(new Error("PORTABLE_ABORTED"));
    for (const stream of active) stream.destroy(new Error("PORTABLE_ABORTED"));
  };
  input.signal?.addEventListener("abort", onAbort, { once: true });
  for (const [name, part] of [["manifest.json", manifest] as [string, Part], ...parts]) {
    zip.addReadStreamLazy(name, { size: size(part), compress: false, mode: 0o100600,
      mtime: new Date("2000-01-01T00:00:00Z") }, callback => {
      void Promise.resolve().then(() => asStream(part)).then(source => {
        if (closed || input.signal?.aborted) {
          source.destroy(); callback(new Error("PORTABLE_ABORTED"), Readable.from([])); return;
        }
        active.add(source);
        const digest = createHash("sha256"); let bytes = 0;
        const verified = new Transform({ transform(chunk: Buffer, _encoding, done) {
          bytes += chunk.length; digest.update(chunk);
          done(bytes > size(part) ? new Error("WORKSPACE_ENTRY_TOO_LARGE") : null, chunk);
        }, flush(done) {
          const result = digest.digest("hex");
          if (bytes !== size(part) || result !== (name === "manifest.json" ? sha(manifest) : checksums[name]))
            done(new Error("WORKSPACE_CHECKSUM_MISMATCH"));
          else { actual.set(name, result); done(); }
        } });
        active.add(verified);
        source.once("close", () => active.delete(source));
        verified.once("close", () => active.delete(verified));
        source.on("error", onError); verified.on("error", onError);
        callback(null, source.pipe(verified));
      }).catch(error => { if (!closed) callback(error, Readable.from([])); });
    });
  }
  zip.end();
  const staged = join(dirname(input.outputPath), `.${basename(input.outputPath)}.${randomUUID()}.tmp`);
  try {
    await pipeline(zip.outputStream, (await import("node:fs")).createWriteStream(staged, { flags: "wx", mode: 0o600 }),
      { signal: input.signal });
    if (actual.size !== parts.size + 1) fail("WORKSPACE_CHECKSUM_MISMATCH");
    input.signal?.throwIfAborted();
    const readback = await readLegacyWorkspaceFromFile(staged);
    try { if (readback.snapshot.projectId !== snapshot.projectId || readback.sources.size !== snapshot.documents.length)
      fail("WORKSPACE_MANIFEST_MISMATCH"); } finally { await readback.close(); }
    input.signal?.throwIfAborted();
    await link(staged, input.outputPath);
    return { manifest, entryCount: parts.size + 1 };
  } finally {
    closed = true;
    input.signal?.removeEventListener("abort", onAbort);
    (zip.outputStream as Readable).destroy();
    for (const stream of active) stream.destroy();
    await unlink(staged).catch(() => {});
  }
}

export async function readLegacyWorkspaceFromFile(filePath: string) {
  const zip = await new Promise<ZipFile>((resolve, reject) => yauzl.open(filePath,
    { autoClose: false, lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true },
    (error, file) => error || !file ? reject(error ?? new Error("WORKSPACE_ZIP_INVALID")) : resolve(file)));
  try {
    const entries = new Map<string, Entry>(); let expanded = 0;
    await new Promise<void>((resolve, reject) => {
      zip.on("entry", entry => {
        try {
          originalEntryPath(entry.fileName);
          if (entries.has(entry.fileName) || entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod))
            fail("WORKSPACE_ARCHIVE_INVALID");
          if (entries.size >= ENTRY_MAX) fail("WORKSPACE_ENTRY_LIMIT");
          if (entry.uncompressedSize > ENTRY_BYTES) fail("WORKSPACE_ENTRY_TOO_LARGE");
          if (expanded + entry.uncompressedSize > TOTAL_BYTES) fail("WORKSPACE_TOTAL_SIZE_LIMIT");
          entries.set(entry.fileName, entry); expanded += entry.uncompressedSize; zip.readEntry();
        } catch (error) { reject(error); }
      });
      zip.once("end", resolve); zip.once("error", reject); zip.readEntry();
    });
    const entryBytes = async (name: string) => {
      const entry = entries.get(name); if (!entry) return fail("WORKSPACE_REQUIRED_ENTRY_MISSING");
      const stream = await new Promise<Readable>((resolve, reject) => zip.openReadStream(entry,
        (error, result) => error || !result ? reject(error ?? new Error("WORKSPACE_ENTRY_INVALID")) : resolve(result)));
      const chunks: Buffer[] = []; let count = 0;
      for await (const chunk of stream) { count += chunk.length; if (count > ENTRY_BYTES) fail("WORKSPACE_ENTRY_TOO_LARGE"); chunks.push(Buffer.from(chunk)); }
      if (count !== entry.uncompressedSize) fail("WORKSPACE_ENTRY_INVALID");
      return Buffer.concat(chunks, count);
    };
    const entryHash = async (name: string) => {
      const entry = entries.get(name); if (!entry) return fail("WORKSPACE_REQUIRED_ENTRY_MISSING");
      const stream = await new Promise<Readable>((resolve, reject) => zip.openReadStream(entry,
        (error, result) => error || !result ? reject(error ?? new Error("WORKSPACE_ENTRY_INVALID")) : resolve(result)));
      const digest = createHash("sha256"); let count = 0;
      for await (const chunk of stream) { count += chunk.length; if (count > entry.uncompressedSize) fail("WORKSPACE_ENTRY_INVALID"); digest.update(chunk); }
      if (count !== entry.uncompressedSize) fail("WORKSPACE_ENTRY_INVALID");
      return digest.digest("hex");
    };
    const manifest = parseTmmJson(await entryBytes("manifest.json"));
    if (manifest?.format !== "lawbot-tmm" || ![1, 2].includes(manifest.schemaVersion) ||
        !manifest.checksums || typeof manifest.checksums !== "object") fail("WORKSPACE_MANIFEST_INVALID");
    const declared = new Set(["manifest.json"]);
    for (const [name, expected] of Object.entries(manifest.checksums)) {
      originalEntryPath(name); declared.add(name);
      if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) fail("WORKSPACE_CHECKSUM_INVALID");
      if (await entryHash(name) !== expected) fail("WORKSPACE_CHECKSUM_MISMATCH");
    }
    if (manifest.schemaVersion === 2) for (const name of entries.keys()) if (!declared.has(name)) fail("WORKSPACE_UNDECLARED_ENTRY");
    let snapshot = parseTmmJson(await entryBytes("workspace.json"));
    snapshot.reviewDecisionEvents ??= []; snapshot.workspaceCorrections ??= [];
    const migratedFromV1 = manifest.schemaVersion === 1;
    try {
      if (migratedFromV1) {
        assertSourceWorkspaceV1(snapshot);
        snapshot = migrateSourceWorkspaceV1(snapshot);
      }
      assertSourceWorkspaceV2(snapshot);
    } catch { fail("WORKSPACE_SNAPSHOT_INVALID"); }
    validateTmmSnapshot(snapshot);
    const sources = new Map<string, TmmFileRef>();
    for (const d of snapshot.documents) {
      const name = d.sourceEntry.endsWith("/source") ? sourceName(d) : d.sourceEntry;
      const entry = entries.get(name);
      if (!entry || entry.uncompressedSize > 4294967296) return fail("WORKSPACE_SOURCE_MISSING");
      const sourceSha = manifest.checksums[name] ?? (migratedFromV1 ? await entryHash(name) : fail("WORKSPACE_SOURCE_MISSING"));
      d.sourceEntry = name;
      if (d.fileKind === "markdown") {
        const sidecar = parseTmmJson(await entryBytes(`documents/${d.id}/markdown-source.json`));
        if (JSON.stringify(sidecar) !== JSON.stringify(d.detection.markdownSourceSidecar)) fail("WORKSPACE_MARKDOWN_SIDECAR_MISMATCH");
        if (sourceSha !== sidecar.sourceSha256) fail("WORKSPACE_MARKDOWN_SOURCE_HASH_MISMATCH");
        const parsed = parseReferenceMarkdown(await entryBytes(name), d.fileName);
        if (JSON.stringify(parsed.sidecar) !== JSON.stringify(sidecar)) fail("WORKSPACE_MARKDOWN_SOURCE_HASH_MISMATCH");
      }
      sources.set(name, { bytes: entry.uncompressedSize, sha256: sourceSha,
        openReadStream: () => new Promise<Readable>((resolve, reject) => zip.openReadStream(entry,
          (error, result) => error || !result ? reject(error ?? new Error("WORKSPACE_ENTRY_INVALID")) : resolve(result))) });
    }
    if (snapshot.projectId !== manifest.projectId || snapshot.documents.length !== manifest.documentCount)
      fail("WORKSPACE_MANIFEST_MISMATCH");
    return { manifest: migratedFromV1 ? { ...manifest, schemaVersion: 2 } : manifest,
      migratedFromV1, snapshot, sources, close: async () => zip.close() };
  } catch (error) { zip.close(); throw error; }
}
