import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scrypt } from "node:crypto";
import type { Readable } from "node:stream";
import yazl from "yazl";
import { readZip, writeZip } from "./office-zip.ts";
import { FILE_MAX_BYTES } from "../contracts/index.ts";
export type PortableObject = Record<string, any>;
export type PortableFormat = "legacy-zip" | "secure-v2" | "secure-v3";
export type PortableCredentials = { password?: string; dek?: Buffer; signal?: AbortSignal; kdf?: { N: number; r: number; p: number }; keySlots?: PortableObject[] };
export type PortableWorkspace = { format: PortableFormat; snapshot: PortableObject; sources: Map<string, Buffer>; manifest: PortableObject; archiveEntries: Map<string, Buffer> };
const MAGIC = "LBTSC001", RESERVE = 65536, PREFIX = 16, CHUNK = 4194304;
const TYPES = new Set(["tmm-workspace", "tmm-transfer", "recovery-snapshot", "recovery-source", "pseudonym-mapping", "pseudonym-index", "ai-collab-index", "recent-index"]);
const DOCUMENT_COLLECTIONS = ["detection.entities", "detection.bboxes", "detection.ocrCachePages", "detection.ocrImageInfos", "review.entities", "review.activeBBoxes", "review.deletedBBoxes", "review.pseudonymEntries", "review.blockerDecisions", "review.approvedConflicts"];
const PAYLOADS = ["detection.documentText", "detection.canonicalDocument", "detection.docxStructuredInput", "detection.markdownSourceSidecar"];
const PROJECT_COLLECTIONS = ["sharedMapping", "defaultMapping", "customMapping", "customConsumers", "typeCounters", "mergedInto", "mergeSnapshots", "mergeSnapshotEntries", "fileOverrides", "fileOverrideEntries", "detachedMergedKeys", "entityOccurrences"];
const fail = (code: string): never => { throw new Error(code); };
const object = (x: unknown): x is PortableObject => !!x && typeof x === "object" && !Array.isArray(x);
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const abort = (o: PortableCredentials) => { if (o.signal?.aborted) fail("PORTABLE_ABORTED"); };
function safeJsonTree(value: unknown) {
  const stack: [unknown, number][] = [[value, 0]]; let nodes = 0;
  while (stack.length) { const [v, depth] = stack.pop()!; if (++nodes > 1000000 || depth > 64) fail("PORTABLE_JSON_LIMIT"); if (typeof v === "number" && !Number.isFinite(v)) fail("PORTABLE_JSON_INVALID"); if (object(v)) { for (const [key, item] of Object.entries(v)) { if (["__proto__", "prototype", "constructor"].includes(key)) fail("PORTABLE_JSON_UNSAFE_KEY"); stack.push([item, depth + 1]); } } else if (Array.isArray(v)) for (const item of v) stack.push([item, depth + 1]); }
}
function parse(bytes: Buffer): any { try { const result = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes)); safeJsonTree(result); return result; } catch (e) { if ((e as Error).message.startsWith("PORTABLE_")) throw e; return fail("PORTABLE_JSON_INVALID"); } }
function json(value: unknown) { let bytes: Buffer; try { bytes = Buffer.from(JSON.stringify(value)); } catch { return fail("PORTABLE_JSON_INVALID"); } if (bytes.length > FILE_MAX_BYTES) fail("FILE_SIZE_LIMIT"); parse(bytes); return bytes; }
function canonical(value: any): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function b64(value: any, size: number) { if (typeof value !== "string") return fail("PORTABLE_KEY_SLOT_INVALID"); const b = Buffer.from(value, "base64"); if (b.length !== size || b.toString("base64") !== value) fail("PORTABLE_KEY_SLOT_INVALID"); return b; }
function id(value: any) { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) fail("PORTABLE_ID_INVALID"); return value as string; }
function path(value: any) { if (typeof value !== "string" || !value || Buffer.byteLength(value) > 1024 || /[\\\x00-\x1f]/.test(value) || value.startsWith("/") || /^[A-Za-z]:/.test(value) || value.split("/").some(p => !p || p === "." || p === "..")) fail("PORTABLE_UNSAFE_ENTRY"); return value as string; }
function requirePart(parts: Map<string, Buffer>, name: string) { const bytes = parts.get(path(name)); if (!bytes) return fail("PORTABLE_ENTRY_MISSING"); return bytes; }
function readJson(parts: Map<string, Buffer>, name: string) { return parse(requirePart(parts, name)); }
function integer(n: any, min = 0) { if (!Number.isSafeInteger(n) || n < min) fail("PORTABLE_DECLARATION_INVALID"); return n as number; }
function decrypt(ciphertext: Buffer, key: Buffer, nonce: Buffer, tag: Buffer, aad: unknown) {
  try { const d = createDecipheriv("aes-256-gcm", key, nonce); d.setAAD(Buffer.from(canonical(aad)), { plaintextLength: ciphertext.length }); d.setAuthTag(tag); return Buffer.concat([d.update(ciphertext), d.final()]); } catch { return fail("PORTABLE_AUTH_FAILED"); }
}
function encrypt(plaintext: Buffer, key: Buffer, aad: unknown) { const nonce = randomBytes(12), c = createCipheriv("aes-256-gcm", key, nonce); c.setAAD(Buffer.from(canonical(aad)), { plaintextLength: plaintext.length }); const ciphertext = Buffer.concat([c.update(plaintext), c.final()]); return { nonce, tag: c.getAuthTag(), ciphertext }; }
async function derive(password: string, kdf: PortableObject) {
  if (typeof password !== "string" || password.length < 4 || Buffer.byteLength(password) > 1024 || !password.trim()) fail("PORTABLE_PASSWORD_INVALID");
  if (kdf.algorithm !== "SCRYPT" || kdf.keyLength !== 32 || !Number.isSafeInteger(kdf.N) || kdf.N < 16384 || kdf.N > 1048576 || kdf.N & kdf.N - 1 || !Number.isSafeInteger(kdf.r) || kdf.r < 8 || kdf.r > 32 || !Number.isSafeInteger(kdf.p) || kdf.p < 1 || kdf.p > 8) fail("PORTABLE_KDF_INVALID");
  const salt = Buffer.from(kdf.saltBase64 ?? "", "base64"); if (salt.length < 16 || salt.length > 64 || salt.toString("base64") !== kdf.saltBase64) fail("PORTABLE_KDF_INVALID");
  const required = 128 * kdf.N * kdf.r; if (required > 256 * 1024 * 1024) fail("PORTABLE_KDF_RESOURCE_LIMIT");
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: Math.max(268435456, required + 33554432) }, (error, value) => error ? reject(new Error("PORTABLE_KDF_FAILED")) : resolve(Buffer.from(value))));
}
const slotAad = (slot: PortableObject) => ({ slotId: slot.slotId, kind: "transfer", wrapAlgorithm: "AES-256-GCM", kdf: slot.kdf });
export function inspectProtectedPortable(bytes: Buffer) {
  if (bytes.length < PREFIX + RESERVE || bytes.subarray(0, 8).toString("ascii") !== MAGIC) return fail("PORTABLE_INVALID_MAGIC");
  const reserve = bytes.readUInt32LE(8), size = bytes.readUInt32LE(12); if (reserve !== RESERVE || size <= 0 || size > reserve) fail("PORTABLE_HEADER_INVALID");
  const h = parse(bytes.subarray(PREFIX, PREFIX + size));
  if (!object(h) || h.format !== "lawbot-secure-container" || h.version !== 1 || !TYPES.has(h.objectType) || typeof h.objectId !== "string" || !h.objectId || Buffer.byteLength(h.objectId) > 512 || h.cipher !== "AES-256-GCM" || h.chunkSize !== CHUNK || !Array.isArray(h.keySlots) || !object(h.headerAuth) || typeof h.createdAt !== "string" || !Number.isFinite(Date.parse(h.createdAt))) fail("PORTABLE_HEADER_INVALID");
  integer(h.plaintextLength); integer(h.chunkCount); if (h.plaintextLength > FILE_MAX_BYTES || h.chunkCount !== Math.ceil(h.plaintextLength / CHUNK) || bytes.length !== PREFIX + RESERVE + h.plaintextLength + h.chunkCount * 28) fail("PORTABLE_LENGTH_INVALID");
  return h;
}
export async function readProtectedPortable(bytes: Buffer, options: PortableCredentials = {}) {
  abort(options); const header = inspectProtectedPortable(bytes); let key: Buffer | undefined; const chunks: Buffer[] = [];
  try {
    if (options.dek) { if (options.dek.length !== 32) fail("PORTABLE_KEY_INVALID"); key = Buffer.from(options.dek); }
    else {
      if (!options.password) fail("PORTABLE_KEY_REQUIRED");
      const slots = header.keySlots.filter((slot: any) => object(slot) && slot.kind === "transfer"); if (slots.length !== 1) fail("PORTABLE_LOCAL_KEY_REQUIRED");
      const slot = slots[0]; if (slot.wrapAlgorithm !== "AES-256-GCM" || typeof slot.slotId !== "string") fail("PORTABLE_KEY_SLOT_INVALID");
      const kek = await derive(options.password!, slot.kdf); try { key = decrypt(b64(slot.wrappedKeyCiphertextBase64, 32), kek, b64(slot.nonceBase64, 12), b64(slot.tagBase64, 16), slotAad(slot)); } finally { kek.fill(0); }
    }
    abort(options); const { headerAuth, ...authenticated } = header; decrypt(Buffer.alloc(0), key, b64(headerAuth.nonceBase64, 12), b64(headerAuth.tagBase64, 16), authenticated);
    let at = PREFIX + RESERVE;
    for (let i = 0; i < header.chunkCount; i++) {
      abort(options); const length = Math.min(CHUNK, header.plaintextLength - i * CHUNK), nonce = bytes.subarray(at, at + 12), tag = bytes.subarray(at + 12, at + 28), encrypted = bytes.subarray(at + 28, at + 28 + length); at += 28 + length;
      chunks.push(decrypt(encrypted, key, nonce, tag, { format: header.format, version: header.version, objectType: header.objectType, objectId: header.objectId, chunkIndex: i, plaintextLength: length }));
    }
    return { header, plaintext: Buffer.concat(chunks) };
  } finally { key?.fill(0); for (const chunk of chunks) chunk.fill(0); }
}
export async function writeProtectedPortable(plaintext: Buffer, objectType: string, objectId: string, options: PortableCredentials = {}) {
  abort(options); if (!TYPES.has(objectType) || !objectId || Buffer.byteLength(objectId) > 512 || plaintext.length > FILE_MAX_BYTES) fail("PORTABLE_HEADER_INVALID");
  const key = options.dek ? Buffer.from(options.dek) : randomBytes(32); if (key.length !== 32) fail("PORTABLE_KEY_INVALID");
  try {
    let slots = options.keySlots ?? [];
    if (options.password) {
      const kdf = { algorithm: "SCRYPT", N: 131072, r: 8, p: 1, keyLength: 32, ...options.kdf, saltBase64: randomBytes(16).toString("base64") }, slot: PortableObject = { slotId: randomUUID(), kind: "transfer", wrapAlgorithm: "AES-256-GCM", kdf };
      const kek = await derive(options.password, kdf); try { const e = encrypt(key, kek, slotAad(slot)); Object.assign(slot, { nonceBase64: e.nonce.toString("base64"), tagBase64: e.tag.toString("base64"), wrappedKeyCiphertextBase64: e.ciphertext.toString("base64") }); } finally { kek.fill(0); }
      slots = [slot];
    } else if (!options.dek) fail("PORTABLE_KEY_REQUIRED");
    const h = { format: "lawbot-secure-container", version: 1, objectType, objectId, cipher: "AES-256-GCM", chunkSize: CHUNK, plaintextLength: plaintext.length, chunkCount: Math.ceil(plaintext.length / CHUNK), createdAt: new Date().toISOString(), keySlots: slots };
    const auth = encrypt(Buffer.alloc(0), key, h), header = json({ ...h, headerAuth: { nonceBase64: auth.nonce.toString("base64"), tagBase64: auth.tag.toString("base64") } }); if (header.length > RESERVE) fail("PORTABLE_HEADER_INVALID");
    const prefix = Buffer.alloc(PREFIX + RESERVE); prefix.write(MAGIC); prefix.writeUInt32LE(RESERVE, 8); prefix.writeUInt32LE(header.length, 12); header.copy(prefix, PREFIX); const chunks = [prefix];
    for (let i = 0; i < h.chunkCount; i++) { abort(options); const chunk = plaintext.subarray(i * CHUNK, (i + 1) * CHUNK), e = encrypt(chunk, key, { format: h.format, version: h.version, objectType, objectId, chunkIndex: i, plaintextLength: chunk.length }); chunks.push(e.nonce, e.tag, e.ciphertext); }
    return Buffer.concat(chunks);
  } finally { key.fill(0); }
}
export function validatePortableSnapshot(s: PortableObject) {
  safeJsonTree(s); if (![1, 2].includes(s.schemaVersion)) fail("PORTABLE_SNAPSHOT_VERSION");
  id(s.projectId); for (const key of ["projectName", "createdAt", "updatedAt"]) if (typeof s[key] !== "string") fail("PORTABLE_SNAPSHOT_INVALID"); integer(s.contentRevision);
  if (!Array.isArray(s.documents) || s.documents.length > 10000 || !Array.isArray(s.reviewDecisionEvents) || !Array.isArray(s.workspaceCorrections)) fail("PORTABLE_SNAPSHOT_INVALID");
  const ids = new Set<string>();
  for (const d of s.documents) {
    if (!object(d) || !["docx", "pdf", "image", ...(s.schemaVersion === 2 ? ["markdown"] : [])].includes(d.fileKind) || typeof d.fileName !== "string" || !object(d.detection) || !object(d.review) || !object(d.exportState) || d.review.kind !== d.fileKind || d.exportState.kind !== d.fileKind) fail("PORTABLE_DOCUMENT_INVALID");
    id(d.id); if (ids.has(d.id)) fail("PORTABLE_DUPLICATE_DOCUMENT"); ids.add(d.id); const entry = path(d.sourceEntry); if (!entry.startsWith(`documents/${d.id}/source`) || entry.slice(`documents/${d.id}/source`.length) && !/^\.[a-z0-9]{1,10}$/.test(entry.slice(`documents/${d.id}/source`.length))) fail("PORTABLE_SOURCE_ENTRY_INVALID");
    if (d.__tmmV3Partial || d.__tmmV3Lazy) fail("PORTABLE_PARTIAL_STATE_UNRESOLVED");
    for (const field of ["entities", "bboxes", "ocrCachePages", "ocrImageInfos"]) if (d.detection[field] !== undefined && !Array.isArray(d.detection[field])) fail("PORTABLE_DOCUMENT_INVALID");
    if (d.fileKind === "markdown") { const sidecar = d.detection.markdownSourceSidecar; if (!object(sidecar) || sidecar.schemaId !== "markdown-source" || sidecar.schemaVersion !== 1 || sidecar.offsetEncoding !== "utf16-code-unit" || sidecar.encoding !== "utf8" || ![".md", ".markdown"].includes(sidecar.originalExtension) || entry !== `documents/${d.id}/source${sidecar.originalExtension}` || !Array.isArray(sidecar.sourceMap) || !Array.isArray(sidecar.regions) || !Array.isArray(sidecar.syntaxContainers) || !Array.isArray(sidecar.blockers)) fail("PORTABLE_MARKDOWN_SIDECAR_INVALID"); }
  }
  if (s.activeDocumentId !== null && !ids.has(s.activeDocumentId)) fail("PORTABLE_ACTIVE_DOCUMENT_INVALID");
  for (const c of s.workspaceCorrections) if (!object(c) || !["forceDetect", "forceSkip"].includes(c.kind) || c.matchMode !== "exact" || !["normal", "high"].includes(c.risk) || typeof c.enabled !== "boolean" || !Array.isArray(c.sourceDecisionIds)) fail("PORTABLE_CORRECTION_INVALID");
  if (s.projectModeSnapshot?.__tmmV3Lazy) fail("PORTABLE_PARTIAL_STATE_UNRESOLVED");
  return s;
}
function sourceName(d: PortableObject) { const suffix = /\.[a-z0-9]{1,10}$/i.exec(d.fileName)?.[0].toLowerCase() ?? (d.fileKind === "image" ? ".png" : `.${d.fileKind}`); return `documents/${id(d.id)}/source${suffix}`; }
function readLines(parts: Map<string, Buffer>, segments: PortableObject[], countKey = "itemCount", hashes = true, declared?: Set<string>) {
  const items: any[] = [];
  for (const segment of segments) { const bytes = requirePart(parts, segment.entry); declared?.add(segment.entry); if (bytes.length !== integer(segment.uncompressedBytes) || hashes && hash(bytes) !== segment.sha256) fail("PORTABLE_SEGMENT_INVALID"); const text = new TextDecoder("utf8", { fatal: true }).decode(bytes), lines = text ? text.replace(/\n$/, "").split("\n") : []; if (lines.length !== integer(segment[countKey]) || lines.length > 20000) fail("PORTABLE_SEGMENT_INVALID"); for (const line of lines) { if (Buffer.byteLength(line) > 8388608) fail("PORTABLE_SEGMENT_INVALID"); items.push(parse(Buffer.from(line))); } }
  return items;
}
function mergeProjectCollections(project: PortableObject | null) {
  if (!project) return project;
  if (project.mergeSnapshotEntries) { const groups = new Map<string, Map<string, any>>((project.mergeSnapshots ?? []).map((x: any) => [x.canonicalKey, new Map((x.entries ?? []).map((e: any) => [e.key, e]))])); for (const e of project.mergeSnapshotEntries) { const group = groups.get(e.canonicalKey) ?? new Map(); group.set(e.key, { key: e.key, token: e.token, canonical: e.canonical }); groups.set(e.canonicalKey, group); } project.mergeSnapshots = [...groups].map(([canonicalKey, entries]) => ({ canonicalKey, entries: [...entries.values()] })); delete project.mergeSnapshotEntries; }
  if (project.fileOverrideEntries) { const groups = new Map<string, Map<string, any>>((project.fileOverrides ?? []).map((x: any) => [x.documentId, new Map(x.entries)])); for (const e of project.fileOverrideEntries) { const group = groups.get(e.documentId) ?? new Map(); if (e.token === null) group.delete(e.key); else group.set(e.key, e.token); groups.set(e.documentId, group); } project.fileOverrides = [...groups].map(([documentId, entries]) => ({ documentId, entries: [...entries] })); delete project.fileOverrideEntries; }
  return project;
}
export async function readPortableWorkspace(bytes: Buffer, options: PortableCredentials = {}): Promise<PortableWorkspace> {
  abort(options); let plaintext = bytes, secureHeader: PortableObject | undefined;
  if (bytes.subarray(0, 8).toString("ascii") === MAGIC) { const decrypted = await readProtectedPortable(bytes, options); plaintext = decrypted.plaintext; secureHeader = decrypted.header; if (!["tmm-workspace", "tmm-transfer"].includes(secureHeader!.objectType)) fail("PORTABLE_CONTAINER_TYPE_INVALID"); }
  let parts: Map<string, Buffer>;
  try { parts = await readZip(plaintext); } finally { if (secureHeader) plaintext.fill(0); }
  const manifest = readJson(parts, "manifest.json"); if (!object(manifest) || manifest.format !== "lawbot-tmm" || ![1, 2, 3].includes(manifest.schemaVersion)) fail("PORTABLE_MANIFEST_INVALID");
  integer(manifest.documentCount); if (!object(manifest) || manifest.documentCount > 10000) fail("PORTABLE_MANIFEST_INVALID");
  let snapshot: PortableObject; const sources = new Map<string, Buffer>(), declared = new Set<string>(["manifest.json"]);
  if (parts.has("workspace.json")) {
    if (manifest.schemaVersion === 3 || !object(manifest.checksums)) fail("PORTABLE_MANIFEST_INVALID");
    for (const [entry, expected] of Object.entries(manifest.checksums)) if (hash(requirePart(parts, path(entry))) !== expected) fail("PORTABLE_CHECKSUM_MISMATCH");
    if (manifest.schemaVersion === 2) for (const entry of parts.keys()) if (entry !== "manifest.json" && !Object.hasOwn(manifest.checksums, entry)) fail("PORTABLE_CHECKSUM_MISSING");
    snapshot = readJson(parts, "workspace.json"); snapshot.reviewDecisionEvents ??= []; snapshot.workspaceCorrections ??= []; validatePortableSnapshot(snapshot);
    for (const d of snapshot.documents) { const entry = d.sourceEntry.endsWith("/source") ? sourceName(d) : d.sourceEntry; sources.set(entry, requirePart(parts, entry)); d.sourceEntry = entry; if (d.fileKind === "markdown") { const sidecar = readJson(parts, `documents/${d.id}/markdown-source.json`); if (canonical(sidecar) !== canonical(d.detection.markdownSourceSidecar)) fail("PORTABLE_MARKDOWN_SIDECAR_MISMATCH"); const source = sources.get(entry)!; if (hash(source) !== sidecar.sourceSha256) fail("PORTABLE_MARKDOWN_SOURCE_MISMATCH"); } }
  } else {
    if (!secureHeader || ![2, 3].includes(manifest.schemaVersion)) fail("PORTABLE_SECURE_CONTAINER_REQUIRED");
    if (!Array.isArray(manifest.documents)) fail("PORTABLE_MANIFEST_INVALID");
    const v3 = manifest.schemaVersion === 3, index = readJson(parts, "workspace/index.json"), rules = readJson(parts, "project/rules.json"); declared.add("workspace/index.json"); declared.add("project/rules.json"); declared.add("project/profile.json");
    if (index.schemaVersion !== manifest.schemaVersion || manifest.projectId !== index.projectId || manifest.documentCount !== manifest.documents?.length || (v3 ? index.documents?.length : index.documentIds?.length) !== manifest.documentCount || secureHeader!.objectId !== manifest.projectId) fail("PORTABLE_INDEX_INVALID");
    const indexIds = v3 ? index.documents.map((d: any) => d.id) : index.documentIds;
    if (new Set(indexIds).size !== indexIds.length || manifest.documents.some((d: any, i: number) => d.id !== indexIds[i] || v3 && (d.fileName !== index.documents[i].fileName || d.fileKind !== index.documents[i].fileKind)) || manifest.containerVersion !== 1) fail("PORTABLE_INDEX_INVALID");
    snapshot = { ...index, schemaVersion: index.workspaceSchemaVersion, projectId: index.projectId, projectName: index.projectName, createdAt: index.createdAt, updatedAt: index.updatedAt, activeDocumentId: index.activeDocumentId, contentRevision: index.contentRevision, documents: [], profileSnapshot: readJson(parts, "project/profile.json"), ...rules, ...(index.folderBatch ? { folderBatch: index.folderBatch } : {}) };
    const modeEntry = v3 ? "project/project-mode-base.json" : "project/project-mode.json"; declared.add(modeEntry); snapshot.projectModeSnapshot = readJson(parts, modeEntry);
    if (v3) {
      if (!object(manifest.global)) fail("PORTABLE_MANIFEST_INVALID");
      for (const [name, segments] of Object.entries(manifest.global.projectModeCollections ?? {})) { if (!PROJECT_COLLECTIONS.includes(name) || !snapshot.projectModeSnapshot) fail("PORTABLE_COLLECTION_INVALID"); snapshot.projectModeSnapshot[name] = readLines(parts, segments as any[], "itemCount", true, declared); }
      snapshot.projectModeSnapshot = mergeProjectCollections(snapshot.projectModeSnapshot);
      snapshot.reviewDecisionEvents = readLines(parts, manifest.global.decisionSegments ?? [], "itemCount", true, declared); snapshot.auditEvents = readLines(parts, manifest.global.auditSegments ?? [], "itemCount", true, declared);
    } else { declared.add("project/decisions.jsonl"); declared.add("audit/events.jsonl"); const lines = (name: string) => { const bytes = requirePart(parts, name); return bytes.length ? bytes.toString("utf8").trimEnd().split("\n").map(line => parse(Buffer.from(line))) : []; }; snapshot.reviewDecisionEvents = lines("project/decisions.jsonl"); snapshot.auditEvents = lines("audit/events.jsonl"); }
    for (const d of manifest.documents) {
      abort(options); id(d.id); const prefix = `documents/${d.id}/`; if (!d.sourceEntry.startsWith(`${prefix}source.`) || d.metaEntry !== `${prefix}meta.json`) fail("PORTABLE_SOURCE_ENTRY_INVALID");
      const source = requirePart(parts, d.sourceEntry); if (source.length !== integer(d.sourceBytes)) fail("PORTABLE_SOURCE_SIZE_MISMATCH"); declared.add(d.sourceEntry); declared.add(d.metaEntry); sources.set(d.sourceEntry, source);
      const meta = readJson(parts, d.metaEntry); let state: PortableObject;
      if (v3) {
        if (d.baseStateEntry !== `${prefix}state/base.json` || d.shellStateEntry !== `${prefix}state/shell.json`) fail("PORTABLE_STATE_ENTRY_INVALID");
        const base = requirePart(parts, d.baseStateEntry), shell = requirePart(parts, d.shellStateEntry); if (base.length !== d.baseStateBytes || shell.length !== d.shellStateBytes) fail("PORTABLE_STATE_SIZE_MISMATCH"); declared.add(d.baseStateEntry); declared.add(d.shellStateEntry); state = parse(base); const light = parse(shell); state.detection = { ...state.detection, ...light.detection }; state.review = { ...state.review, ...light.review }; state.exportState = light.exportState ?? state.exportState;
        for (const [name, payload] of Object.entries(d.payloads ?? {}) as [string, any][]) {
          if (!PAYLOADS.includes(name)) fail("PORTABLE_PAYLOAD_INVALID"); let value: any;
          if (payload.chunks?.length) {
            let logical = 0; const chunks: Buffer[] = [];
            for (const [n, chunk] of payload.chunks.entries()) { if (chunk.entry !== `${prefix}state/payload/${name.replace(".", "-")}/chunk-${String(n + 1).padStart(6, "0")}.bin`) fail("PORTABLE_PAYLOAD_INVALID"); const b = requirePart(parts, chunk.entry); if (b.length !== chunk.uncompressedBytes || hash(b) !== chunk.sha256) fail("PORTABLE_PAYLOAD_HASH_MISMATCH"); declared.add(chunk.entry); if (payload.encoding === "utf8-string") { const text = new TextDecoder("utf8", { fatal: true }).decode(b); if (chunk.logicalStart !== logical || chunk.logicalEnd !== logical + text.length) fail("PORTABLE_PAYLOAD_RANGE_INVALID"); logical += text.length; } else if (payload.encoding !== "json-utf8" || chunk.logicalStart !== undefined || chunk.logicalEnd !== undefined) fail("PORTABLE_PAYLOAD_INVALID"); chunks.push(b); }
            const all = Buffer.concat(chunks); if (all.length !== payload.uncompressedBytes) fail("PORTABLE_PAYLOAD_SIZE_MISMATCH"); value = payload.encoding === "utf8-string" ? new TextDecoder("utf8", { fatal: true }).decode(all) : parse(all);
          } else { if (payload.entry !== `${prefix}state/payload/${name.replace(".", "-")}.json`) fail("PORTABLE_PAYLOAD_INVALID"); const b = requirePart(parts, payload.entry); if (b.length !== payload.uncompressedBytes) fail("PORTABLE_PAYLOAD_SIZE_MISMATCH"); declared.add(payload.entry); value = parse(b); }
          state.detection[name.split(".")[1]] = value;
        }
        for (const [name, segments] of Object.entries(d.collections ?? {})) { if (!DOCUMENT_COLLECTIONS.includes(name)) fail("PORTABLE_COLLECTION_INVALID"); const [group, field] = name.split("."); state[group] ??= {}; state[group][field] = readLines(parts, segments as any[], "itemCount", true, declared); }
        for (const lookup of d.reviewLookup?.buckets ?? []) { const entry = `${prefix}lookups/review/${path(lookup.name)}`, b = requirePart(parts, entry); if (b.length !== lookup.bytes || hash(b) !== lookup.sha256) fail("PORTABLE_LOOKUP_INVALID"); declared.add(entry); }
      } else { if (d.stateEntry !== `${prefix}state.json`) fail("PORTABLE_STATE_ENTRY_INVALID"); declared.add(d.stateEntry); state = readJson(parts, d.stateEntry); state.detection.ocrCachePages = readLines(parts, d.ocrSegments ?? [], "pageCount", false, declared); }
      if (d.entityCount !== undefined && d.entityCount !== (state.detection.entities?.length ?? 0) || d.ocrPageCount !== undefined && d.ocrPageCount !== (state.detection.ocrCachePages?.length ?? 0) || d.reviewEntityCount !== undefined && d.reviewEntityCount !== (state.review.kind === "image" ? (state.review.activeBBoxes?.length ?? 0) + (state.review.deletedBBoxes?.length ?? 0) : state.review.entities?.length ?? 0)) fail("PORTABLE_DECLARATION_INVALID");
      if (d.fileKind === "markdown" && hash(source) !== state.detection.markdownSourceSidecar?.sourceSha256) fail("PORTABLE_MARKDOWN_SOURCE_MISMATCH");
      snapshot.documents.push({ ...meta, ...state, id: d.id, fileName: d.fileName, fileKind: d.fileKind, sourceEntry: d.sourceEntry });
    }
    delete snapshot.documentIds; delete snapshot.workspaceSchemaVersion;
    if (v3) for (const [name, lookup] of Object.entries(manifest.global.projectModeLookups ?? {}) as [string, any][]) for (const bucket of lookup.buckets ?? []) { if (!PROJECT_COLLECTIONS.includes(name)) fail("PORTABLE_LOOKUP_INVALID"); const entry = `project/lookups/${name}/${path(bucket.name)}`, b = requirePart(parts, entry); if (b.length !== bucket.bytes || hash(b) !== bucket.sha256) fail("PORTABLE_LOOKUP_INVALID"); declared.add(entry); }
    for (const name of parts.keys()) if (!declared.has(name)) fail("PORTABLE_UNDECLARED_ENTRY"); validatePortableSnapshot(snapshot);
  }
  if (manifest.sourceBytes !== undefined && manifest.sourceBytes !== [...sources.values()].reduce((n, b) => n + b.length, 0) || manifest.ocrPages !== undefined && manifest.ocrPages !== snapshot.documents.reduce((n: number, d: any) => n + (d.detection.ocrCachePages?.length ?? 0), 0) || manifest.entityCount !== undefined && manifest.entityCount !== snapshot.documents.reduce((n: number, d: any) => n + (d.detection.entities?.length ?? 0), 0)) fail("PORTABLE_DECLARATION_INVALID");
  if (snapshot.projectId !== manifest.projectId || snapshot.documents.length !== manifest.documentCount) fail("PORTABLE_MANIFEST_MISMATCH");
  return { format: parts.has("workspace.json") ? "legacy-zip" : manifest.schemaVersion === 3 ? "secure-v3" : "secure-v2", snapshot, sources, manifest, archiveEntries: parts };
}
function writePortableZip(parts: Map<string, Buffer>) {
  return new Promise<Buffer>((resolve, reject) => {
    const zip = new yazl.ZipFile(), chunks: Buffer[] = []; let length = 0;
    zip.outputStream.on("error", reject); zip.outputStream.on("data", (chunk: Buffer) => { length += chunk.length; if (length > FILE_MAX_BYTES) (zip.outputStream as Readable).destroy(new Error("FILE_SIZE_LIMIT")); else chunks.push(chunk); }); zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    for (const [entry, bytes] of parts) zip.addBuffer(bytes, entry, { compress: !/^documents\/[^/]+\/source\./.test(entry), mode: 0o100600 }); zip.end({ forceZip64Format: true, comment: "" });
  });
}
export const parsePortableJson = parse;
export async function writePortableWorkspace(input: PortableObject, sources: Map<string, Buffer>, options: PortableCredentials & { format: PortableFormat; appVersion?: string }) {
  abort(options); const snapshot = parse(json(input)); validatePortableSnapshot(snapshot); const parts = new Map<string, Buffer>(), documents: PortableObject[] = [];
  const source = (d: PortableObject) => { const bytes = sources.get(d.sourceEntry) ?? sources.get(d.id); if (!bytes) return fail("PORTABLE_SOURCE_MISSING"); const name = sourceName(d); parts.set(name, bytes); d.sourceEntry = name; return bytes; };
  const add = (entry: string, value: unknown) => { path(entry); parts.set(entry, json(value)); };
  const segments = (items: any[], prefix: string, pageCount = false) => {
    const entries: PortableObject[] = []; let lines: Buffer[] = [], bytes = 0;
    const flush = () => { if (!lines.length) return; const entry = `${prefix}/segment-${String(entries.length + 1).padStart(6, "0")}.jsonl`, data = Buffer.concat(lines); parts.set(entry, data); entries.push({ entry, [pageCount ? "pageCount" : "itemCount"]: lines.length, uncompressedBytes: data.length, ...(pageCount ? {} : { sha256: hash(data) }) }); lines = []; bytes = 0; };
    for (const item of items) { const line = Buffer.concat([json(item), Buffer.from("\n")]); if (line.length > 8388608) fail("PORTABLE_SEGMENT_INVALID"); if (lines.length >= (pageCount ? 100 : 20000) || bytes + line.length > (pageCount ? 16777216 : 8388608)) flush(); lines.push(line); bytes += line.length; } flush(); return entries;
  };
  if (options.format === "legacy-zip") {
    for (const d of snapshot.documents) { source(d); if (d.fileKind === "markdown") add(`documents/${d.id}/markdown-source.json`, d.detection.markdownSourceSidecar); }
    add("workspace.json", snapshot); add("manifest.json", { format: "lawbot-tmm", schemaVersion: snapshot.schemaVersion, projectId: snapshot.projectId, projectName: snapshot.projectName, createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, appVersion: options.appVersion ?? "tuominwang", documentCount: snapshot.documents.length, activeDocumentId: snapshot.activeDocumentId, checksums: Object.fromEntries([...parts].map(([name, bytes]) => [name, hash(bytes)])) });
    return writeZip(parts);
  }
  const version = options.format === "secure-v3" ? 3 : 2, v3 = version === 3;
  for (const d of snapshot.documents) {
    abort(options); const bytes = source(d), prefix = `documents/${d.id}`, state = { detection: parse(json(d.detection)), review: parse(json(d.review)), exportState: parse(json(d.exportState)) }, meta = { ...d }; delete meta.id; delete meta.fileName; delete meta.fileKind; delete meta.sourceEntry; delete meta.detection; delete meta.review; delete meta.exportState; add(`${prefix}/meta.json`, meta);
    if (v3) {
      const payloads: PortableObject = {}, collections: PortableObject = {};
      for (const name of PAYLOADS) {
        const field = name.split(".")[1], value = state.detection[field]; if (value === undefined) continue; delete state.detection[field]; const encoding = name === "detection.documentText" && typeof value === "string" ? "utf8-string" : "json-utf8", bytes = encoding === "utf8-string" ? Buffer.from(value, "utf8") : json(value), chunks: PortableObject[] = [];
        let at = 0, logical = 0;
        while (at < bytes.length) { let end = Math.min(bytes.length, at + CHUNK); if (encoding === "utf8-string" && end < bytes.length) while (end > at && (bytes[end] & 0xc0) === 0x80) end--; const chunk = bytes.subarray(at, end), entry = `${prefix}/state/payload/${name.replace(".", "-")}/chunk-${String(chunks.length + 1).padStart(6, "0")}.bin`; parts.set(entry, chunk); const textLength = encoding === "utf8-string" ? chunk.toString("utf8").length : 0; chunks.push({ entry, uncompressedBytes: chunk.length, sha256: hash(chunk), ...(encoding === "utf8-string" ? { logicalStart: logical, logicalEnd: logical + textLength } : {}) }); at = end; logical += textLength; }
        if (chunks.length) payloads[name] = { encoding, uncompressedBytes: bytes.length, chunks }; else { const entry = `${prefix}/state/payload/${name.replace(".", "-")}.json`; add(entry, value); payloads[name] = { entry, uncompressedBytes: parts.get(entry)!.length }; }
      }
      for (const name of DOCUMENT_COLLECTIONS) { const [group, field] = name.split("."); if (Array.isArray(state[group as "review" | "detection"][field]) && state[group as "review" | "detection"][field].length) { collections[name] = segments(state[group as "review" | "detection"][field], `${prefix}/state/${name.replace(".", "/")}`); delete state[group as "review" | "detection"][field]; } }
      const baseEntry = `${prefix}/state/base.json`, shellEntry = `${prefix}/state/shell.json`; add(baseEntry, state); add(shellEntry, { detection: {}, review: {}, exportState: d.exportState });
      documents.push({ id: d.id, fileName: d.fileName, fileKind: d.fileKind, sourceEntry: d.sourceEntry, sourceBytes: bytes.length, metaEntry: `${prefix}/meta.json`, baseStateEntry: baseEntry, baseStateBytes: parts.get(baseEntry)!.length, shellStateEntry: shellEntry, shellStateBytes: parts.get(shellEntry)!.length, payloads, collections, entityCount: d.detection.entities?.length ?? 0, reviewEntityCount: d.review.kind === "image" ? (d.review.activeBBoxes?.length ?? 0) + (d.review.deletedBBoxes?.length ?? 0) : d.review.entities?.length ?? 0, ocrPageCount: d.detection.ocrCachePages?.length ?? 0 });
    } else { const ocrSegments = segments(state.detection.ocrCachePages ?? [], `${prefix}/ocr`, true); delete state.detection.ocrCachePages; add(`${prefix}/state.json`, state); documents.push({ id: d.id, fileName: d.fileName, fileKind: d.fileKind, sourceEntry: d.sourceEntry, sourceBytes: bytes.length, metaEntry: `${prefix}/meta.json`, stateEntry: `${prefix}/state.json`, ocrSegments }); }
  }
  const root = { ...snapshot }; for (const name of ["documents", "rulesetSnapshot", "workspaceCorrections", "inheritedPseudonymProfile", "profileSnapshot", "projectModeSnapshot", "reviewDecisionEvents", "auditEvents"]) delete root[name];
  add("workspace/index.json", { ...root, schemaVersion: version, workspaceSchemaVersion: snapshot.schemaVersion, ...(v3 ? { documents: snapshot.documents.map((d: PortableObject) => ({ id: d.id, fileName: d.fileName, fileKind: d.fileKind })) } : { documentIds: snapshot.documents.map((d: PortableObject) => d.id) }) });
  add("project/rules.json", { rulesetSnapshot: snapshot.rulesetSnapshot ?? null, workspaceCorrections: snapshot.workspaceCorrections, inheritedPseudonymProfile: snapshot.inheritedPseudonymProfile ?? null }); add("project/profile.json", snapshot.profileSnapshot ?? null);
  const global: PortableObject = {};
  if (v3) {
    const mode = snapshot.projectModeSnapshot ? parse(json(snapshot.projectModeSnapshot)) : null, projectModeCollections: PortableObject = {};
    if (mode) for (const name of PROJECT_COLLECTIONS) if (Array.isArray(mode[name]) && mode[name].length) { projectModeCollections[name] = segments(mode[name], `project/collections/${name}`); mode[name] = []; }
    add("project/project-mode-base.json", mode); Object.assign(global, { projectModeBaseBytes: parts.get("project/project-mode-base.json")!.length, projectModeCollections, decisionSegments: segments(snapshot.reviewDecisionEvents, "project/decisions"), auditSegments: segments(snapshot.auditEvents ?? [], "audit/events") });
  } else { add("project/project-mode.json", snapshot.projectModeSnapshot ?? null); for (const [entry, list] of [["project/decisions.jsonl", snapshot.reviewDecisionEvents], ["audit/events.jsonl", snapshot.auditEvents ?? []]] as [string, any[]][]) parts.set(entry, Buffer.from(list.map(item => json(item).toString("utf8") + "\n").join(""))); }
  add("manifest.json", { format: "lawbot-tmm", schemaVersion: version, containerVersion: 1, appVersion: options.appVersion ?? "tuominwang", projectId: snapshot.projectId, createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, documentCount: documents.length, sourceBytes: documents.reduce((n, d) => n + d.sourceBytes, 0), ocrPages: snapshot.documents.reduce((n: number, d: PortableObject) => n + (d.detection.ocrCachePages?.length ?? 0), 0), ...(v3 ? { entityCount: snapshot.documents.reduce((n: number, d: PortableObject) => n + (d.detection.entities?.length ?? 0), 0), global } : {}), documents });
  const archive = await writePortableZip(parts);
  try { return await writeProtectedPortable(archive, options.password ? "tmm-transfer" : "tmm-workspace", snapshot.projectId, options); } finally { archive.fill(0); }
}
