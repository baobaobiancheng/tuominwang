import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parsePortableJson, safeJsonTree, validatePortableSnapshot, type PortableObject } from "./workspace-portable.ts";
import { assertSourceWorkspaceV1, assertSourceWorkspaceV2 } from "./reference/workspace-snapshot-schema.js";
import { migrateSourceWorkspaceV1 } from "./reference/tmm-original-v1-migrate.js";
import { openTmmZipFromSecureFile, writeTmmZipToSecureFile, TMM_V3_ZIP_BUDGET, type TmmStreamEntry } from "./workspace-zip-stream.ts";
import { originalEntryPath, originalJsonBytes } from "./reference/tmm-original-predicates.js";
import { originalV3JsonBytes } from "./reference/tmm-v3-json.js";
import { originalValidatePersisted } from "./reference/tmm-v3-lookup.js";
import { originalV3JsonParser, OriginalV3Assembler } from "./reference/tmm-v3-stream-json.js";
import { originalV3JsonBuffers } from "./reference/tmm-v3-json-chunks.js";

// TMM-only V3 path. The ordinary file and office ZIP budgets remain unchanged.
// This is the streaming counterpart of workspace-portable.ts V3: only metadata
// occupies Buffers; sources are opened once by the ZIP writer as streams.
const JSON_MAX = 67108864, PAYLOAD_CHUNK = 4194304;
const V3_SOURCE_MAX = 8589934592, V3_AGGREGATE_MAX = 137438953472;
const V3_MANIFEST_MAX = 33554432, V3_BASE_MAX = 134217728, V3_PAYLOAD_MAX = 17179869184;
const DOCUMENT_COLLECTIONS = ["detection.entities", "detection.bboxes", "detection.ocrCachePages", "detection.ocrImageInfos", "review.entities", "review.activeBBoxes", "review.deletedBBoxes", "review.pseudonymEntries", "review.blockerDecisions", "review.approvedConflicts"];
const PROJECT_COLLECTIONS = ["sharedMapping", "defaultMapping", "customMapping", "customConsumers", "typeCounters", "mergedInto", "mergeSnapshots", "mergeSnapshotEntries", "fileOverrides", "fileOverrideEntries", "detachedMergedKeys", "entityOccurrences"];
const PAYLOADS = ["detection.documentText", "detection.canonicalDocument", "detection.docxStructuredInput", "detection.markdownSourceSidecar"];
const parseTmmJson = (bytes: Buffer) => parsePortableJson(bytes, Infinity);
const validateTmmSnapshot = (snapshot: PortableObject) => validatePortableSnapshot(snapshot, Infinity);
const fail = (code: string): never => { throw new Error(code); };
// The JSON traversal is the original V3 Xy generator. Only the private-file
// chunk sink is a cloud adaptation of its encrypted temporary payload spool.
function* v3StringBuffers(value: string) {
  for (let at = 0; at < value.length;) {
    let end = Math.min(value.length, at + 16384);
    if (end < value.length && end > at && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff) end--;
    yield Buffer.from(value.slice(at, end), "utf8");
    at = end;
  }
}
async function spoolV3Payload(value: unknown, encoding: "utf8-string" | "json-utf8", prefix: string,
  parts: Map<string, Part>, spoolDirectory: string, signal?: AbortSignal) {
  if (encoding === "json-utf8") safeJsonTree(value, Infinity);
  const chunks: PortableObject[] = [];
  let total = 0, logical = 0, pending = Buffer.allocUnsafe(PAYLOAD_CHUNK), pendingBytes = 0;
  const flush = async () => {
    if (!pendingBytes) return;
    if (signal?.aborted) fail("PORTABLE_ABORTED");
    const name = `${prefix}/chunk-${String(chunks.length + 1).padStart(6, "0")}.bin`;
    const path = join(spoolDirectory, `chunk-${randomUUID()}`);
    const bytes = pending.subarray(0, pendingBytes);
    await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    const sha256 = hash(bytes), length = encoding === "utf8-string" ? bytes.toString("utf8").length : 0;
    parts.set(name, { bytes: pendingBytes, sha256, openReadStream: () => createReadStream(path) });
    chunks.push({ entry: name, uncompressedBytes: pendingBytes, sha256,
      ...encoding === "utf8-string" ? { logicalStart: logical, logicalEnd: logical + length } : {} });
    logical += length;
    pending = Buffer.allocUnsafe(PAYLOAD_CHUNK); pendingBytes = 0;
  };
  const buffers = encoding === "utf8-string" ? v3StringBuffers(value as string) : originalV3JsonBuffers(value);
  for (const piece of buffers) {
    if (signal?.aborted) fail("PORTABLE_ABORTED");
    total += piece.length;
    if (total > V3_PAYLOAD_MAX) fail("TMM_V3_LIMIT_EXCEEDED");
    if (encoding === "utf8-string" && pendingBytes && pendingBytes + piece.length > PAYLOAD_CHUNK) await flush();
    let at = 0;
    while (at < piece.length) {
      const count = Math.min(piece.length - at, PAYLOAD_CHUNK - pendingBytes);
      piece.copy(pending, pendingBytes, at, at + count);
      at += count; pendingBytes += count;
      if (pendingBytes === PAYLOAD_CHUNK) await flush();
    }
  }
  await flush();
  return { chunks, total };
}
export async function parseV3JsonChunks(parts: AsyncIterable<Buffer>) {
  const assembler = new OriginalV3Assembler();
  const tokens = originalV3JsonParser();
  const sink = new Writable({ objectMode: true, write(token: { name: string; value?: unknown }, _encoding, done) {
    try {
      if (token.name === "keyValue" && ["__proto__", "prototype", "constructor"].includes(String(token.value)))
        fail("PORTABLE_JSON_UNSAFE_KEY");
      assembler.consume(token);
      if (assembler.depth > 64) fail("PORTABLE_JSON_LIMIT");
      done();
    } catch (error) { done(error as Error); }
  } });
  try { await pipeline(Readable.from(parts), tokens, sink); }
  catch (error) {
    if ((error as Error).message.startsWith("PORTABLE_") || (error as Error).message.startsWith("TMM_")) throw error;
    fail("PORTABLE_JSON_INVALID");
  }
  safeJsonTree(assembler.current, Infinity);
  return assembler.current;
}
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function encode(value: unknown) {
  const bytes = originalJsonBytes(value, "TMM metadata");
  parseTmmJson(bytes);
  return bytes;
}
function encodeV3(value: unknown, limit = V3_BASE_MAX) {
  const bytes = originalV3JsonBytes(value, "TMM V3 metadata", limit);
  parseTmmJson(bytes);
  return bytes;
}
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
// The manifest contains only the filename and controlled entry path. Its
// Markdown sidecar is loaded later from state.json, so validate the original
// manifest path shape here and compare the exact extension after hydration.
function manifestSourceName(d: PortableObject) {
  const prefix = `documents/${d.id}/source.`, entry = originalEntryPath(d.sourceEntry);
  if (!entry.startsWith(prefix) || !/^[a-z0-9]{1,10}$/u.test(entry.slice(prefix.length))) fail("PORTABLE_SOURCE_ENTRY_INVALID");
  return entry;
}
function bufferEntry(name: string, bytes: Buffer): TmmStreamEntry {
  return { name, bytes: bytes.length, sha256: hash(bytes), store: false, openReadStream: () => Readable.from([bytes]) };
}
export type TmmFileRef = { bytes: number; sha256: string; openReadStream: () => Readable | Promise<Readable> };
type Part = Buffer | TmmFileRef;
function fileEntry(name: string, part: Part, store = false): TmmStreamEntry {
  return Buffer.isBuffer(part) ? { ...bufferEntry(name, part), store } : { name, ...part, store };
}
function byteLength(part: Part | undefined) { if (!part) return fail("PORTABLE_ENTRY_MISSING"); return Buffer.isBuffer(part) ? part.length : part.bytes; }
// Original vx schema 2 layout: keep source bodies as streams, while each
// bounded meta/state/JSONL entry uses the original 64 MiB JSON predicate.
export async function writePortableWorkspaceV2ToFile(input: {
  snapshot: PortableObject; sources: Map<string, TmmFileRef>; outputPath: string;
  dek: Buffer; keySlots: Record<string, unknown>[];
  objectType?: "tmm-workspace" | "tmm-transfer"; appVersion?: string; signal?: AbortSignal;
}) {
  if (input.signal?.aborted) fail("PORTABLE_ABORTED");
  const snapshot = copy(input.snapshot); validateTmmSnapshot(snapshot);
  if (snapshot.documents.length > 10000) fail("TMM_V2_LIMIT_EXCEEDED");
  const parts = new Map<string, Part>(), documents: PortableObject[] = [];
  const add = (name: string, value: unknown) => parts.set(name, encode(value));
  let sourceBytes = 0, ocrPages = 0;
  for (const d of snapshot.documents) {
    if (input.signal?.aborted) fail("PORTABLE_ABORTED");
    const source = input.sources.get(d.sourceEntry) ?? input.sources.get(d.id);
    if (!source) return fail("PORTABLE_SOURCE_MISSING");
    if (!Number.isSafeInteger(source.bytes) || source.bytes < 0 || source.bytes > 4294967296 ||
        !/^[a-f0-9]{64}$/.test(source.sha256)) fail("TMM_V2_SOURCE_INVALID");
    sourceBytes += source.bytes;
    if (sourceBytes > 34359738368) fail("TMM_V2_LIMIT_EXCEEDED");
    const prefix = `documents/${d.id}`, sourceEntry = sourceName(d);
    if (parts.has(sourceEntry)) fail("TMM_V2_DUPLICATE_ENTRY");
    parts.set(sourceEntry, source); d.sourceEntry = sourceEntry;
    const meta = { ...d };
    for (const key of ["id", "fileName", "fileKind", "sourceEntry", "detection", "review", "exportState"]) delete meta[key];
    const state = { detection: copy(d.detection), review: copy(d.review), exportState: copy(d.exportState) };
    const ocrSegments = segments(state.detection.ocrCachePages ?? [], `${prefix}/ocr`, parts, true);
    delete state.detection.ocrCachePages;
    ocrPages += d.detection.ocrCachePages?.length ?? 0;
    add(`${prefix}/meta.json`, meta); add(`${prefix}/state.json`, state);
    documents.push({ id: d.id, fileName: d.fileName, fileKind: d.fileKind,
      sourceEntry, sourceBytes: source.bytes, metaEntry: `${prefix}/meta.json`,
      stateEntry: `${prefix}/state.json`, ocrSegments });
  }
  const root = { ...snapshot };
  for (const key of ["documents", "rulesetSnapshot", "workspaceCorrections", "inheritedPseudonymProfile", "profileSnapshot", "projectModeSnapshot", "reviewDecisionEvents", "auditEvents"]) delete root[key];
  add("workspace/index.json", { ...root, schemaVersion: 2, workspaceSchemaVersion: snapshot.schemaVersion,
    documentIds: snapshot.documents.map((d: PortableObject) => d.id) });
  add("project/rules.json", { rulesetSnapshot: snapshot.rulesetSnapshot ?? null,
    workspaceCorrections: snapshot.workspaceCorrections,
    ...(snapshot.inheritedPseudonymProfile === undefined ? {} : { inheritedPseudonymProfile: snapshot.inheritedPseudonymProfile }) });
  add("project/profile.json", snapshot.profileSnapshot ?? null);
  add("project/project-mode.json", snapshot.projectModeSnapshot ?? null);
  const jsonl = (name: string, values: any[]) => {
    const lines = values.map(value => Buffer.concat([encode(value), Buffer.from("\n")]));
    const total = lines.reduce((sum, line) => sum + line.length, 0);
    if (total > 67108864) fail("TMM_V2_LIMIT_EXCEEDED");
    parts.set(name, Buffer.concat(lines, total));
  };
  jsonl("project/decisions.jsonl", snapshot.reviewDecisionEvents ?? []);
  jsonl("audit/events.jsonl", snapshot.auditEvents ?? []);
  add("manifest.json", { format: "lawbot-tmm", schemaVersion: 2, containerVersion: 1,
    appVersion: input.appVersion ?? "tuominwang", projectId: snapshot.projectId,
    createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt,
    documentCount: documents.length, sourceBytes, ocrPages, documents });
  const entries = [...parts].map(([name, part]) => fileEntry(name, part, /^documents\/[^/]+\/source\./.test(name)));
  const written = await writeTmmZipToSecureFile({ outputPath: input.outputPath, objectId: snapshot.projectId,
    objectType: input.objectType, dek: input.dek, keySlots: input.keySlots, entries, signal: input.signal });
  return { ...written, documentCount: documents.length, entryCount: entries.length };
}
export async function readPortableWorkspaceV2FromFile(filePath: string, credential: Buffer | string) {
  const archive = await openTmmZipFromSecureFile(filePath, credential);
  const declared = new Set<string>(["manifest.json", "workspace/index.json"]);
  try {
    const manifest = await archive.readJson("manifest.json"), index = await archive.readJson("workspace/index.json");
    if (manifest?.format !== "lawbot-tmm" || manifest.schemaVersion !== 2 ||
        manifest.containerVersion !== 1 || index?.schemaVersion !== 2 ||
        archive.header.objectId !== manifest.projectId || index.projectId !== manifest.projectId ||
        !Array.isArray(manifest.documents) || !Array.isArray(index.documentIds) ||
        manifest.documentCount !== manifest.documents.length || manifest.documents.length > 10000 ||
        index.documentIds.length !== manifest.documents.length ||
        new Set(index.documentIds).size !== index.documentIds.length) fail("PORTABLE_INDEX_INVALID");
    const rules = await archive.readJson("project/rules.json"), profile = await archive.readJson("project/profile.json"),
      mode = await archive.readJson("project/project-mode.json");
    for (const name of ["project/rules.json", "project/profile.json", "project/project-mode.json"])
      declared.add(name);
    async function jsonl(name: string) {
      declared.add(name);
      const entry = archive.entries.get(name);
      if (!entry || entry.uncompressedSize > JSON_MAX) fail("TMM_V2_LIMIT_EXCEEDED");
      const chunks: Buffer[] = []; let total = 0;
      for await (const chunk of await archive.openEntry(name)) {
        total += chunk.length; if (total > JSON_MAX) fail("TMM_V2_LIMIT_EXCEEDED");
        chunks.push(Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks, total).toString("utf8");
      return raw ? raw.replace(/\n$/, "").split("\n").map(line => parseTmmJson(Buffer.from(line))) : [];
    }
    const workspaceSchemaVersion = index.workspaceSchemaVersion === undefined ? 1 : index.workspaceSchemaVersion;
    let snapshot: PortableObject = { ...index, schemaVersion: workspaceSchemaVersion,
      projectId: index.projectId, projectName: index.projectName,
      createdAt: index.createdAt, updatedAt: index.updatedAt,
      activeDocumentId: index.activeDocumentId, contentRevision: index.contentRevision,
      documents: [], profileSnapshot: profile, ...rules, projectModeSnapshot: mode,
      reviewDecisionEvents: await jsonl("project/decisions.jsonl"),
      auditEvents: await jsonl("audit/events.jsonl") };
    delete snapshot.documentIds; delete snapshot.workspaceSchemaVersion;
    const sources = new Map<string, { bytes: number; sha256: string }>();
    let totalSourceBytes = 0, totalPages = 0;
    for (const [i, d] of manifest.documents.entries()) {
      const prefix = `documents/${d.id}`;
      if (index.documentIds[i] !== d.id || d.metaEntry !== `${prefix}/meta.json` ||
          d.stateEntry !== `${prefix}/state.json` || d.sourceEntry !== manifestSourceName(d) ||
          !Number.isSafeInteger(d.sourceBytes) || d.sourceBytes < 0 || d.sourceBytes > 4294967296 ||
          archive.entries.get(d.sourceEntry)?.uncompressedSize !== d.sourceBytes)
        fail("PORTABLE_SOURCE_ENTRY_INVALID");
      totalSourceBytes += d.sourceBytes;
      if (totalSourceBytes > 34359738368) fail("TMM_V2_LIMIT_EXCEEDED");
      const digest = createHash("sha256"); let actual = 0;
      for await (const chunk of await archive.openEntry(d.sourceEntry)) { actual += chunk.length; digest.update(chunk); }
      if (actual !== d.sourceBytes) fail("PORTABLE_SOURCE_SIZE_MISMATCH");
      sources.set(d.sourceEntry, { bytes: actual, sha256: digest.digest("hex") });
      declared.add(d.sourceEntry); declared.add(d.metaEntry); declared.add(d.stateEntry);
      const meta = await archive.readJson(d.metaEntry), state = await archive.readJson(d.stateEntry);
      if (!state?.detection || !state.review || !state.exportState || !Array.isArray(d.ocrSegments ?? []))
        fail("PORTABLE_STATE_ENTRY_INVALID");
      const ocrPages: any[] = [];
      for (const [n, segment] of (d.ocrSegments ?? []).entries()) {
        const name = `${prefix}/ocr/segment-${String(n + 1).padStart(6, "0")}.jsonl`;
        if (segment.entry !== name || !Number.isSafeInteger(segment.pageCount) || segment.pageCount > 100 ||
            !Number.isSafeInteger(segment.uncompressedBytes) || segment.uncompressedBytes > 16777216 ||
            archive.entries.get(name)?.uncompressedSize !== segment.uncompressedBytes)
          fail("PORTABLE_SEGMENT_INVALID");
        declared.add(name);
        const chunks: Buffer[] = []; let total = 0;
        for await (const chunk of await archive.openEntry(name)) {
          total += chunk.length; if (total > 16777216) fail("PORTABLE_SEGMENT_INVALID");
          chunks.push(Buffer.from(chunk));
        }
        const raw = new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks, total));
        const pages = raw ? raw.replace(/\n$/, "").split("\n").map(line => parseTmmJson(Buffer.from(line))) : [];
        if (pages.length !== segment.pageCount) fail("PORTABLE_SEGMENT_INVALID");
        ocrPages.push(...pages);
      }
      state.detection.ocrCachePages = ocrPages; totalPages += ocrPages.length;
      const hydrated = { ...meta, ...state, id: d.id, fileName: d.fileName,
        fileKind: d.fileKind, sourceEntry: d.sourceEntry };
      if (sourceName(hydrated) !== d.sourceEntry) fail("PORTABLE_SOURCE_ENTRY_INVALID");
      snapshot.documents.push(hydrated);
    }
    if (totalSourceBytes !== manifest.sourceBytes || totalPages !== manifest.ocrPages ||
        snapshot.projectId !== manifest.projectId) fail("PORTABLE_DECLARATION_INVALID");
    for (const name of archive.entries.keys()) if (!declared.has(name)) fail("PORTABLE_UNDECLARED_ENTRY");
    if (![1, 2].includes(workspaceSchemaVersion)) fail("WORKSPACE_SNAPSHOT_INVALID");
    if (workspaceSchemaVersion === 1 && snapshot.inheritedPseudonymProfile === null) delete snapshot.inheritedPseudonymProfile;
    try { if (workspaceSchemaVersion === 1) { assertSourceWorkspaceV1(snapshot); snapshot = migrateSourceWorkspaceV1(snapshot); } assertSourceWorkspaceV2(snapshot); }
    catch { fail("WORKSPACE_SNAPSHOT_INVALID"); }
    validateTmmSnapshot(snapshot);
    return { archive, manifest, snapshot, sources };
  } catch (error) { await archive.close(); throw error; }
}
function segments(items: any[], prefix: string, parts: Map<string, Part>, pageCount = false) {
  const result: PortableObject[] = []; let lines: Buffer[] = [], total = 0;
  const flush = () => { if (!lines.length) return; const name = `${prefix}/segment-${String(result.length + 1).padStart(6, "0")}.jsonl`, bytes = Buffer.concat(lines, total); parts.set(name, bytes); result.push({ entry: name, [pageCount ? "pageCount" : "itemCount"]: lines.length, uncompressedBytes: bytes.length, ...pageCount ? {} : { sha256: hash(bytes) } }); lines = []; total = 0; };
  for (const item of items) { const line = Buffer.concat([encode(item), Buffer.from("\n")]); if (line.length > 8388608) fail("PORTABLE_SEGMENT_INVALID"); if (lines.length >= (pageCount ? 100 : 20000) || total + line.length > (pageCount ? 16777216 : 8388608)) flush(); lines.push(line); total += line.length; }
  flush(); return result;
}
function copy<T>(value: T): T { return structuredClone(value); }
// The native extension carries review history that the reference projection
// cannot represent. Keep it in the same V3 per-record/JSONL layout, rather
// than placing the entire project back into workspace/index.json.
function nativeRecord(value: Record<string, any>, prefix: string, parts: Map<string, Part>, depth = 0): PortableObject {
  if (depth > 24) fail("PORTABLE_SEGMENT_INVALID");
  const base: PortableObject = {}, arrays: PortableObject = {}, objects: PortableObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) fail("PORTABLE_SEGMENT_INVALID");
    if (Array.isArray(item)) arrays[key] = segments(item, `${prefix}/array-${Object.keys(arrays).length}`, parts);
    else if (item && typeof item === "object") {
      let encoded: Buffer | undefined;
      try { encoded = encodeV3(item); } catch (error) {
        if ((error as Error & { code?: string }).code !== "TMM_V3_BASE_STATE_TOO_LARGE") throw error;
      }
      if (encoded) base[key] = item;
      else objects[key] = nativeRecord(item, `${prefix}/object-${Object.keys(objects).length}`, parts, depth + 1);
    } else base[key] = item;
  }
  const entry = `${prefix}/base.json`;
  parts.set(entry, encodeV3(base));
  return { entry, arrays, objects };
}
function splitNativeExtension(snapshot: PortableObject, parts: Map<string, Part>) {
  const extension = snapshot.tuominwangNative;
  if (extension?.version !== 2 || !extension.snapshot) return;
  // Original V3 declares every ZIP entry. A bounded extension whose assets
  // are bound to declared sources or inline index bytes stays in the index;
  // only the native format uses our segmented extension entries.
  if (Array.isArray(extension.assets) && extension.assets.every((asset: any) =>
    typeof asset.projectedSourceEntry === "string" || typeof asset.base64 === "string")) return;
  const native = extension.snapshot;
  if (native.format !== "tuominwang-workspace" || native.schemaVersion !== 1 ||
      !Array.isArray(native.documents) || !Array.isArray(native.snapshots) ||
      !Array.isArray(native.mappings)) fail("PORTABLE_NATIVE_EXTENSION_INVALID");
  const { documents, snapshots, mappings, provenanceHistory, ...root } = native;
  const descriptor = {
    root: nativeRecord(root, "native/root", parts),
    documents: documents.map((d: any, i: number) => nativeRecord(d, `native/documents/${i}`, parts)),
    snapshots: snapshots.map((s: any, i: number) => nativeRecord(s, `native/snapshots/${i}`, parts)),
    mappings: segments(mappings, "native/mappings", parts),
    provenanceHistory: provenanceHistory === undefined ? null : segments(provenanceHistory, "native/provenance", parts),
  };
  snapshot.tuominwangNative = { version: 3, native: descriptor, assets: extension.assets };
}

export async function writePortableWorkspaceV3ToFile(input: {
  snapshot: PortableObject; sources: Map<string, TmmFileRef>; extraAssets?: Map<string, TmmFileRef>;
  outputPath: string; dek: Buffer; keySlots: Record<string, unknown>[];
  objectType?: "tmm-workspace" | "tmm-transfer";
  appVersion?: string; signal?: AbortSignal;
}) {
  if (input.signal?.aborted) fail("PORTABLE_ABORTED");
  let spoolDirectory: string | undefined;
  try {
  const snapshot = copy(input.snapshot); validateTmmSnapshot(snapshot);
  const parts = new Map<string, Part>(); const documents: PortableObject[] = [];
  splitNativeExtension(snapshot, parts);
  const add = (name: string, value: unknown) => parts.set(name, encodeV3(value, name === "manifest.json" || name === "workspace/index.json" ? V3_MANIFEST_MAX : V3_BASE_MAX));
  let sourceTotal = 0;
  for (const d of snapshot.documents) {
    if (input.signal?.aborted) fail("PORTABLE_ABORTED");
    const original = input.sources.get(d.sourceEntry) ?? input.sources.get(d.id);
    if (!original) return fail("PORTABLE_SOURCE_MISSING");
    if (!Number.isSafeInteger(original.bytes) || original.bytes < 0 || original.bytes > V3_SOURCE_MAX ||
        !/^[a-f0-9]{64}$/.test(original.sha256)) fail("TMM_V3_LIMIT_EXCEEDED");
    sourceTotal += original.bytes;
    if (sourceTotal > V3_AGGREGATE_MAX) fail("TMM_V3_LIMIT_EXCEEDED");
    const prefix = `documents/${d.id}`, name = sourceName(d);
    if (parts.has(name)) fail("PORTABLE_DUPLICATE_ENTRY");
    parts.set(name, original); d.sourceEntry = name;
    const state = { detection: copy(d.detection), review: copy(d.review), exportState: copy(d.exportState) };
    const meta = { ...d }; for (const key of ["id", "fileName", "fileKind", "sourceEntry", "detection", "review", "exportState"]) delete meta[key];
    add(`${prefix}/meta.json`, meta);
    const payloads: PortableObject = {}, collections: PortableObject = {};
    for (const fieldName of PAYLOADS) {
      const field = fieldName.split(".")[1], value = state.detection[field];
      if (value === undefined) continue;
      delete state.detection[field];
      const encoding = fieldName === "detection.documentText" && typeof value === "string" ? "utf8-string" : "json-utf8";
      if (value === "") {
        const name = `${prefix}/state/payload/${fieldName.replace(".", "-")}.json`;
        add(name, value); payloads[fieldName] = { entry: name, uncompressedBytes: byteLength(parts.get(name)) };
        continue;
      }
      spoolDirectory ??= await mkdtemp(join(tmpdir(), "tmw-v3-payload-"));
      const spooled = await spoolV3Payload(value, encoding,
        `${prefix}/state/payload/${fieldName.replace(".", "-")}`, parts, spoolDirectory, input.signal);
      if (spooled.chunks.length) payloads[fieldName] = { encoding, uncompressedBytes: spooled.total, chunks: spooled.chunks };
      else { const name = `${prefix}/state/payload/${fieldName.replace(".", "-")}.json`; add(name, value); payloads[fieldName] = { entry: name, uncompressedBytes: byteLength(parts.get(name)) }; }
    }
    for (const fieldName of DOCUMENT_COLLECTIONS) {
      const [group, field] = fieldName.split(".");
      if (Array.isArray((state as any)[group][field]) && (state as any)[group][field].length) {
        collections[fieldName] = segments((state as any)[group][field], `${prefix}/state/${group}/${field}`, parts);
        delete (state as any)[group][field];
      }
    }
    const baseEntry = `${prefix}/state/base.json`, shellEntry = `${prefix}/state/shell.json`;
    add(baseEntry, state); add(shellEntry, { detection: {}, review: {}, exportState: d.exportState });
    documents.push({ id: d.id, fileName: d.fileName, fileKind: d.fileKind, sourceEntry: name,
      sourceBytes: original.bytes, sourceSha256: original.sha256,
      metaEntry: `${prefix}/meta.json`, baseStateEntry: baseEntry, baseStateBytes: byteLength(parts.get(baseEntry)),
      shellStateEntry: shellEntry, shellStateBytes: byteLength(parts.get(shellEntry)), payloads, collections,
      entityCount: d.detection.entities?.length ?? 0,
      reviewEntityCount: d.review.kind === "image" ? (d.review.activeBBoxes?.length ?? 0) + (d.review.deletedBBoxes?.length ?? 0) : d.review.entities?.length ?? 0,
      ocrPageCount: d.detection.ocrCachePages?.length ?? 0 });
  }
  const root = { ...snapshot };
  for (const key of ["documents", "rulesetSnapshot", "workspaceCorrections", "inheritedPseudonymProfile", "profileSnapshot", "projectModeSnapshot", "reviewDecisionEvents", "auditEvents"]) delete root[key];
  add("workspace/index.json", { ...root, schemaVersion: 3, workspaceSchemaVersion: snapshot.schemaVersion,
    documents: snapshot.documents.map((d: PortableObject) => ({ id: d.id, fileName: d.fileName, fileKind: d.fileKind })) });
  add("project/rules.json", { rulesetSnapshot: snapshot.rulesetSnapshot ?? null,
    workspaceCorrections: snapshot.workspaceCorrections,
    ...(snapshot.inheritedPseudonymProfile === undefined ? {} : { inheritedPseudonymProfile: snapshot.inheritedPseudonymProfile }) });
  add("project/profile.json", snapshot.profileSnapshot ?? null);
  const mode = snapshot.projectModeSnapshot ? copy(snapshot.projectModeSnapshot) : null, projectModeCollections: PortableObject = {};
  if (mode) for (const name of PROJECT_COLLECTIONS) if (Array.isArray(mode[name]) && mode[name].length) {
    projectModeCollections[name] = segments(mode[name], `project/collections/${name}`, parts); mode[name] = [];
  }
  add("project/project-mode-base.json", mode);
  const global = { projectModeBaseBytes: byteLength(parts.get("project/project-mode-base.json")), projectModeCollections,
    decisionSegments: segments(snapshot.reviewDecisionEvents, "project/decisions", parts),
    auditSegments: segments(snapshot.auditEvents ?? [], "audit/events", parts) };
  for (const [name, ref] of input.extraAssets ?? []) {
    if (parts.has(name)) fail("PORTABLE_DUPLICATE_ENTRY");
    parts.set(name, ref);
  }
  add("manifest.json", { format: "lawbot-tmm", schemaVersion: 3, containerVersion: 1,
    appVersion: input.appVersion ?? "tuominwang", projectId: snapshot.projectId,
    createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, documentCount: documents.length,
    sourceBytes: documents.reduce((n, d) => n + d.sourceBytes, 0),
    ocrPages: snapshot.documents.reduce((n: number, d: PortableObject) => n + (d.detection.ocrCachePages?.length ?? 0), 0),
    entityCount: snapshot.documents.reduce((n: number, d: PortableObject) => n + (d.detection.entities?.length ?? 0), 0),
    global, documents });
  for (const name of ["manifest.json", "workspace/index.json"])
    if (byteLength(parts.get(name)) > V3_MANIFEST_MAX) fail("TMM_V3_LIMIT_EXCEEDED");
  const entries = [...parts].map(([name, part]) => fileEntry(name, part, /^documents\/[^/]+\/source\./.test(name)));
  const written = await writeTmmZipToSecureFile({ outputPath: input.outputPath, objectId: snapshot.projectId,
    objectType: input.objectType, dek: input.dek, keySlots: input.keySlots, entries, signal: input.signal, budget: TMM_V3_ZIP_BUDGET });
  return { ...written, documentCount: documents.length, entryCount: entries.length };
  } finally {
    if (spoolDirectory) await rm(spoolDirectory, { recursive: true, force: true });
  }
}

// Open only the authenticated container and bounded metadata. Source bodies
// remain in ZIP entries until an authorized importer asks to spool one.
export async function openPortableWorkspaceV3File(filePath: string, credential: Buffer | string) {
  const archive = await openTmmZipFromSecureFile(filePath, credential, TMM_V3_ZIP_BUDGET);
  try {
    const manifest = await archive.readJson("manifest.json", V3_MANIFEST_MAX);
    if (manifest?.format !== "lawbot-tmm" || manifest.schemaVersion !== 3 ||
        manifest.containerVersion !== 1 || archive.header.objectId !== manifest.projectId ||
        !Array.isArray(manifest.documents) || manifest.documents.length > 10000 ||
        manifest.documentCount !== manifest.documents.length) fail("PORTABLE_MANIFEST_INVALID");
    const index = await archive.readJson("workspace/index.json", V3_MANIFEST_MAX);
    if (index.schemaVersion !== 3 || index.workspaceSchemaVersion !== 2 || index.projectId !== manifest.projectId ||
        index.documents?.length !== manifest.documentCount) fail("PORTABLE_INDEX_INVALID");
    const sources = new Map<string, { bytes: number; sha256: string }>();
    for (const [n, d] of manifest.documents.entries()) {
      if (index.documents[n]?.id !== d.id || index.documents[n]?.fileName !== d.fileName ||
          index.documents[n]?.fileKind !== d.fileKind ||
          d.sourceEntry !== manifestSourceName(d) ||
          !Number.isSafeInteger(d.sourceBytes) || d.sourceBytes < 0 || d.sourceBytes > V3_SOURCE_MAX ||
          !/^[a-f0-9]{64}$/.test(d.sourceSha256) ||
          archive.entries.get(d.sourceEntry)?.uncompressedSize !== d.sourceBytes)
        fail("PORTABLE_SOURCE_ENTRY_INVALID");
      sources.set(d.sourceEntry, { bytes: d.sourceBytes, sha256: d.sourceSha256 });
    }
    if ([...sources.values()].reduce((sum, source) => sum + source.bytes, 0) > V3_AGGREGATE_MAX)
      fail("TMM_V3_LIMIT_EXCEEDED");
    return { archive, manifest, index, sources };
  } catch (error) { await archive.close(); throw error; }
}

export async function readPortableWorkspaceV3FromFile(filePath: string, credential: Buffer | string) {
  const opened = await openPortableWorkspaceV3File(filePath, credential), { archive, manifest, index } = opened;
  const declared = new Set(["manifest.json", "workspace/index.json"]);
  const json = async (name: string) => { declared.add(name); return archive.readJson(name, name.endsWith("/state/shell.json") ? 4194304 : V3_BASE_MAX); };
  const bytes = async (name: string, limit = V3_BASE_MAX) => {
    declared.add(name);
    const entry = archive.entries.get(name);
    if (!entry || entry.uncompressedSize > limit) return fail("TMM_V2_LIMIT_EXCEEDED");
    const pieces: Buffer[] = []; let total = 0;
    for await (const part of await archive.openEntry(name)) {
      total += part.length; if (total > limit) fail("TMM_V2_LIMIT_EXCEEDED");
      pieces.push(Buffer.from(part));
    }
    if (total !== entry.uncompressedSize) fail("PORTABLE_SEGMENT_INVALID");
    return Buffer.concat(pieces, total);
  };
  const lines = async (list: PortableObject[], countKey = "itemCount") => {
    if (!Array.isArray(list)) fail("PORTABLE_SEGMENT_INVALID");
    const result: any[] = [];
    for (const segment of list) {
      if (!segment || typeof segment.entry !== "string" ||
          !Number.isSafeInteger(segment.uncompressedBytes) ||
          !Number.isSafeInteger(segment[countKey])) fail("PORTABLE_SEGMENT_INVALID");
      const part = await bytes(segment.entry, countKey === "pageCount" ? 16777216 : 8388608);
      if (part.length !== segment.uncompressedBytes ||
          segment.sha256 && hash(part) !== segment.sha256) fail("PORTABLE_SEGMENT_INVALID");
      const text = new TextDecoder("utf8", { fatal: true }).decode(part);
      const rows = text ? text.replace(/\n$/, "").split("\n") : [];
      if (rows.length !== segment[countKey] || rows.length > 20000) fail("PORTABLE_SEGMENT_INVALID");
      for (const row of rows) {
        if (Buffer.byteLength(row) > 8388608) fail("PORTABLE_SEGMENT_INVALID");
        result.push(parseTmmJson(Buffer.from(row)));
      }
    }
    return result;
  };
  const nativeRecordRead = async (descriptor: any, depth = 0): Promise<PortableObject> => {
    if (depth > 24 || !descriptor || typeof descriptor.entry !== "string" ||
        !descriptor.entry.startsWith("native/") || typeof descriptor.arrays !== "object" ||
        typeof descriptor.objects !== "object") fail("PORTABLE_NATIVE_EXTENSION_INVALID");
    const base = await json(descriptor.entry);
    if (!base || typeof base !== "object" || Array.isArray(base)) fail("PORTABLE_NATIVE_EXTENSION_INVALID");
    for (const [key, segments] of Object.entries(descriptor.arrays)) {
      if (["__proto__", "prototype", "constructor"].includes(key) || Object.hasOwn(base, key)) fail("PORTABLE_NATIVE_EXTENSION_INVALID");
      base[key] = await lines(segments as PortableObject[]);
    }
    for (const [key, child] of Object.entries(descriptor.objects)) {
      if (["__proto__", "prototype", "constructor"].includes(key) || Object.hasOwn(base, key)) fail("PORTABLE_NATIVE_EXTENSION_INVALID");
      base[key] = await nativeRecordRead(child, depth + 1);
    }
    return base;
  };
  try {
    const rules = await json("project/rules.json"), profile = await json("project/profile.json"),
      mode = await json("project/project-mode-base.json"), global = manifest.global;
    if (!global || typeof global !== "object" || Array.isArray(global)) fail("PORTABLE_MANIFEST_INVALID");
    for (const [name, entries] of Object.entries(global.projectModeCollections ?? {})) {
      if (!PROJECT_COLLECTIONS.includes(name) || !mode) fail("PORTABLE_COLLECTION_INVALID");
      mode[name] = await lines(entries as PortableObject[]);
    }
    if (mode?.mergeSnapshotEntries) {
      const groups = new Map<string, Map<string, any>>((mode.mergeSnapshots ?? []).map((x: any) =>
        [x.canonicalKey, new Map((x.entries ?? []).map((e: any) => [e.key, e]))]));
      for (const e of mode.mergeSnapshotEntries) { const group = groups.get(e.canonicalKey) ?? new Map(); group.set(e.key, { key: e.key, token: e.token, canonical: e.canonical }); groups.set(e.canonicalKey, group); }
      mode.mergeSnapshots = [...groups].map(([canonicalKey, entries]) => ({ canonicalKey, entries: [...entries.values()] }));
      delete mode.mergeSnapshotEntries;
    }
    if (mode?.fileOverrideEntries) {
      const groups = new Map<string, Map<string, any>>((mode.fileOverrides ?? []).map((x: any) => [x.documentId, new Map(x.entries)]));
      for (const e of mode.fileOverrideEntries) { const group = groups.get(e.documentId) ?? new Map(); if (e.token === null) group.delete(e.key); else group.set(e.key, e.token); groups.set(e.documentId, group); }
      mode.fileOverrides = [...groups].map(([documentId, entries]) => ({ documentId, entries: [...entries] }));
      delete mode.fileOverrideEntries;
    }
    const snapshot: PortableObject = { ...index, schemaVersion: index.workspaceSchemaVersion,
      projectId: index.projectId, projectName: index.projectName, createdAt: index.createdAt,
      updatedAt: index.updatedAt, activeDocumentId: index.activeDocumentId,
      contentRevision: index.contentRevision, documents: [], profileSnapshot: profile,
      ...rules, projectModeSnapshot: mode,
      reviewDecisionEvents: await lines(global.decisionSegments ?? []),
      auditEvents: await lines(global.auditSegments ?? []) };
    delete snapshot.workspaceSchemaVersion;
    for (const d of manifest.documents) {
      const prefix = `documents/${d.id}/`;
      if (d.metaEntry !== `${prefix}meta.json` ||
          d.baseStateEntry !== `${prefix}state/base.json` ||
          d.shellStateEntry !== `${prefix}state/shell.json`) fail("PORTABLE_STATE_ENTRY_INVALID");
      const meta = await json(d.metaEntry), baseBytes = await bytes(d.baseStateEntry), shellBytes = await bytes(d.shellStateEntry);
      if (baseBytes.length !== d.baseStateBytes || shellBytes.length !== d.shellStateBytes) fail("PORTABLE_STATE_SIZE_MISMATCH");
      const state = parseTmmJson(baseBytes), shell = parseTmmJson(shellBytes);
      state.detection = { ...state.detection, ...shell.detection };
      state.review = { ...state.review, ...shell.review };
      state.exportState = shell.exportState ?? state.exportState;
      for (const [name, payload] of Object.entries(d.payloads ?? {}) as [string, any][]) {
        if (!PAYLOADS.includes(name)) fail("PORTABLE_PAYLOAD_INVALID");
        const expectedPrefix = `${prefix}state/payload/${name.replace(".", "-")}`;
        let value: any;
        if (payload.chunks?.length) {
          let logical = 0, total = 0;
          const readChunk = async (chunk: any, i: number) => {
            const entry = `${expectedPrefix}/chunk-${String(i + 1).padStart(6, "0")}.bin`;
            if (chunk.entry !== entry) fail("PORTABLE_PAYLOAD_INVALID");
            const part = await bytes(entry, PAYLOAD_CHUNK);
            if (part.length !== chunk.uncompressedBytes || hash(part) !== chunk.sha256) fail("PORTABLE_PAYLOAD_HASH_MISMATCH");
            total += part.length; if (total > V3_PAYLOAD_MAX) fail("TMM_V3_LIMIT_EXCEEDED");
            return part;
          };
          if (payload.encoding === "utf8-string") {
            const text: string[] = [];
            for (const [i, chunk] of payload.chunks.entries()) {
              const part = await readChunk(chunk, i);
              const decoded = new TextDecoder("utf8", { fatal: true }).decode(part);
              if (chunk.logicalStart !== logical || chunk.logicalEnd !== logical + decoded.length) fail("PORTABLE_PAYLOAD_RANGE_INVALID");
              logical += decoded.length;
              text.push(decoded);
            }
            value = text.join("");
          } else if (payload.encoding === "json-utf8") {
            const parts = (async function* () {
              for (const [i, chunk] of payload.chunks.entries()) {
                if (chunk.logicalStart !== undefined || chunk.logicalEnd !== undefined) fail("PORTABLE_PAYLOAD_INVALID");
                yield await readChunk(chunk, i);
              }
            })();
            value = await parseV3JsonChunks(parts);
          } else fail("PORTABLE_PAYLOAD_INVALID");
          if (total !== payload.uncompressedBytes) fail("PORTABLE_PAYLOAD_SIZE_MISMATCH");
        } else {
          if (payload.entry !== `${expectedPrefix}.json`) fail("PORTABLE_PAYLOAD_INVALID");
          const part = await bytes(payload.entry);
          if (part.length !== payload.uncompressedBytes) fail("PORTABLE_PAYLOAD_SIZE_MISMATCH");
          value = parseTmmJson(part);
        }
        state.detection[name.split(".")[1]] = value;
      }
      for (const [name, list] of Object.entries(d.collections ?? {})) {
        if (!DOCUMENT_COLLECTIONS.includes(name)) fail("PORTABLE_COLLECTION_INVALID");
        const [group, field] = name.split("."); state[group] ??= {}; state[group][field] = await lines(list as PortableObject[]);
      }
      if (d.entityCount !== undefined && d.entityCount !== (state.detection.entities?.length ?? 0) ||
          d.ocrPageCount !== undefined && d.ocrPageCount !== (state.detection.ocrCachePages?.length ?? 0) ||
          d.reviewEntityCount !== undefined && d.reviewEntityCount !== (state.review.kind === "image" ?
            (state.review.activeBBoxes?.length ?? 0) + (state.review.deletedBBoxes?.length ?? 0) : state.review.entities?.length ?? 0))
        fail("PORTABLE_DECLARATION_INVALID");
      declared.add(d.sourceEntry);
      const hydrated = { ...meta, ...state, id: d.id, fileName: d.fileName, fileKind: d.fileKind, sourceEntry: d.sourceEntry };
      if (sourceName(hydrated) !== d.sourceEntry) fail("PORTABLE_SOURCE_ENTRY_INVALID");
      snapshot.documents.push(hydrated);
    }
    if (snapshot.projectId !== manifest.projectId || snapshot.documents.length !== manifest.documentCount ||
        manifest.sourceBytes !== [...opened.sources.values()].reduce((n, s) => n + s.bytes, 0) ||
        manifest.ocrPages !== snapshot.documents.reduce((n: number, d: any) => n + (d.detection.ocrCachePages?.length ?? 0), 0) ||
        manifest.entityCount !== snapshot.documents.reduce((n: number, d: any) => n + (d.detection.entities?.length ?? 0), 0))
      fail("PORTABLE_DECLARATION_INVALID");
    // Original Yb.openReader declares optional persisted lookup buckets from
    // the manifest. They are indexed by source fingerprints, not extra data.
    const fingerprint = (segments: any[]) => hash(Buffer.from(JSON.stringify(segments.map(s =>
      [s.sha256, s.itemCount, s.uncompressedBytes]))));
    for (const d of manifest.documents) if (d.reviewLookup) {
      const lookup = d.reviewLookup, segments = d.collections?.["review.entities"] ?? [];
      if (d.fileKind !== "pdf" || ![1, 2].includes(lookup.layoutVersion) ||
          lookup.sourceFingerprint !== fingerprint(segments) ||
          lookup.entityRecords !== d.reviewEntityCount ||
          lookup.entityRecords !== segments.reduce((n: number, s: any) => n + s.itemCount, 0) ||
          lookup.idRecords > lookup.entityRecords || lookup.pageRecords < lookup.entityRecords ||
          lookup.records !== lookup.entityRecords + lookup.idRecords + lookup.pageRecords)
        fail("TMM_V3_MANIFEST_INVALID");
      try { originalValidatePersisted(lookup); } catch { fail("TMM_V3_MANIFEST_INVALID"); }
      for (const bucket of lookup.buckets) {
        if (![bucket.first, bucket.last].every((key: string) =>
          /^(?:id|ordinal|page:(?:0|[1-9][0-9]{0,15}))\|/.test(key))) fail("TMM_V3_MANIFEST_INVALID");
        const name = `documents/${d.id}/lookups/review/${bucket.name}`;
        if (archive.entries.get(name)?.uncompressedSize !== bucket.bytes || declared.has(name))
          fail("TMM_V3_ENTRY_MISSING");
        declared.add(name);
      }
    }
    for (const [kind, lookup] of Object.entries(manifest.global?.projectModeLookups ?? {}) as [string, any][]) {
      if (!PROJECT_COLLECTIONS.includes(kind) || !lookup) fail("TMM_V3_MANIFEST_INVALID");
      const segments = manifest.global?.projectModeCollections?.[kind] ?? [];
      if (lookup.sourceFingerprint !== fingerprint(segments) ||
          lookup.records !== segments.reduce((n: number, s: any) => n + s.itemCount, 0))
        fail("TMM_V3_MANIFEST_INVALID");
      try { originalValidatePersisted(lookup); } catch { fail("TMM_V3_MANIFEST_INVALID"); }
      for (const bucket of lookup.buckets) {
        if (!bucket.first.startsWith(kind + "|") || !bucket.last.startsWith(kind + "|"))
          fail("TMM_V3_MANIFEST_INVALID");
        const name = `project/lookups/${kind}/${bucket.name}`;
        if (archive.entries.get(name)?.uncompressedSize !== bucket.bytes || declared.has(name))
          fail("TMM_V3_ENTRY_MISSING");
        declared.add(name);
      }
    }
    let extension = snapshot.tuominwangNative;
    if (extension?.version === 3) {
      const descriptor = extension.native;
      if (!descriptor || !Array.isArray(descriptor.documents) || !Array.isArray(descriptor.snapshots) ||
          !Array.isArray(descriptor.mappings) || descriptor.documents.length !== snapshot.documents.length)
        fail("PORTABLE_NATIVE_EXTENSION_INVALID");
      const nativeDocuments: PortableObject[] = [], nativeSnapshots: PortableObject[] = [];
      for (const d of descriptor.documents) nativeDocuments.push(await nativeRecordRead(d));
      for (const d of descriptor.snapshots) nativeSnapshots.push(await nativeRecordRead(d));
      const native: PortableObject = { ...await nativeRecordRead(descriptor.root),
        documents: nativeDocuments, snapshots: nativeSnapshots,
        mappings: await lines(descriptor.mappings),
        ...descriptor.provenanceHistory ? { provenanceHistory: await lines(descriptor.provenanceHistory) } : {},
      };
      if (native.format !== "tuominwang-workspace" || native.schemaVersion !== 1) fail("PORTABLE_NATIVE_EXTENSION_INVALID");
      snapshot.tuominwangNative = { version: 2, snapshot: native, assets: extension.assets };
      extension = snapshot.tuominwangNative;
    }
    if (extension?.version === 2) for (const asset of extension.assets ?? []) {
      if (typeof asset.projectedSourceEntry === "string" || typeof asset.base64 === "string") continue;
      if (typeof asset.entry !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256) ||
          archive.entries.get(asset.entry)?.uncompressedSize !== asset.bytes) fail("PORTABLE_NATIVE_EXTENSION_INVALID");
      declared.add(asset.entry);
    }
    for (const name of archive.entries.keys()) if (!declared.has(name)) fail("PORTABLE_UNDECLARED_ENTRY");
    validateTmmSnapshot(snapshot);
    // Original Yb.openReader completes a bounded pass over every declared
    // entry before exposing the workspace. Source and persisted lookup hashes
    // additionally bind lazy bodies to their manifest declarations.
    const expected = new Map<string, { bytes: number; sha256: string }>(opened.sources);
    for (const asset of snapshot.tuominwangNative?.assets ?? [])
      if (typeof asset.entry === "string") expected.set(asset.entry, { bytes: asset.bytes, sha256: asset.sha256 });
    for (const d of manifest.documents) for (const bucket of d.reviewLookup?.buckets ?? [])
      expected.set(`documents/${d.id}/lookups/review/${bucket.name}`, { bytes: bucket.bytes, sha256: bucket.sha256 });
    for (const [kind, lookup] of Object.entries(manifest.global?.projectModeLookups ?? {}) as [string, any][])
      for (const bucket of lookup.buckets ?? [])
        expected.set(`project/lookups/${kind}/${bucket.name}`, { bytes: bucket.bytes, sha256: bucket.sha256 });
    for (const [name, entry] of archive.entries) {
      const declaredHash = expected.get(name), digest = createHash("sha256"); let size = 0;
      for await (const part of await archive.openEntry(name)) {
        size += part.length;
        if (size > entry.uncompressedSize) fail("PORTABLE_SOURCE_MISMATCH");
        digest.update(part);
      }
      if (size !== entry.uncompressedSize || declaredHash &&
          (size !== declaredHash.bytes || digest.digest("hex") !== declaredHash.sha256))
        fail("PORTABLE_SOURCE_MISMATCH");
    }
    return { ...opened, snapshot };
  } catch (error) { await archive.close(); throw error; }
}

/** Copy a verified TMM source or native attachment into a private destination.
 * Consumers see the file only after GCM, ZIP CRC, length, and manifest SHA pass. */
export async function extractVerifiedTmmEntry(input: {
  archive: Awaited<ReturnType<typeof openTmmZipFromSecureFile>>;
  name: string; bytes: number; sha256: string; outputPath: string; signal?: AbortSignal;
}) {
  if (input.signal?.aborted) fail("PORTABLE_ABORTED");
  if (!Number.isSafeInteger(input.bytes) || input.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(input.sha256) ||
      input.archive.entries.get(input.name)?.uncompressedSize !== input.bytes)
    fail("PORTABLE_SOURCE_SIZE_MISMATCH");
  const temporary = join(dirname(input.outputPath), `.${basename(input.outputPath)}.${randomUUID()}.tmp`);
  let total = 0; const digest = createHash("sha256");
  try {
    const verify = new Transform({ transform(chunk: Buffer, _encoding, done) {
      if (input.signal?.aborted) return done(new Error("PORTABLE_ABORTED"));
      total += chunk.length;
      if (total > input.bytes) return done(new Error("PORTABLE_SOURCE_SIZE_MISMATCH"));
      digest.update(chunk); done(null, chunk);
    } });
    await pipeline(await input.archive.openEntry(input.name), verify,
      createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
    if (input.signal?.aborted) fail("PORTABLE_ABORTED");
    if (total !== input.bytes || digest.digest("hex") !== input.sha256) fail("PORTABLE_SOURCE_MISMATCH");
    await link(temporary, input.outputPath);
    return { bytes: total, sha256: input.sha256, path: input.outputPath };
  } finally { await unlink(temporary).catch(() => {}); }
}
