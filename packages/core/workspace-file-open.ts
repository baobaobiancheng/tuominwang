import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import type { NativePortable } from "./native-portable.ts";
import type { PortableCredentials, PortableObject } from "./workspace-portable.ts";
import type { TmmFileRef } from "./workspace-portable-stream.ts";
import { readLegacyWorkspaceFromFile } from "./workspace-legacy-stream.ts";
import { readPortableWorkspaceV2FromFile, readPortableWorkspaceV3FromFile } from "./workspace-portable-stream.ts";
import { openTmmZipFromSecureFile, TMM_V3_ZIP_BUDGET } from "./workspace-zip-stream.ts";
import { recoverNativeExtensionStream } from "./workspace-compat.ts";
import { recoverNativeAssetsFromOriginalV2 } from "./workspace-native-asset-bindings.ts";

const fail = (code: string): never => { throw new Error(code); };
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

type SourceArchive = { openEntry(name: string): Promise<Readable>; close(): Promise<void> };
const sourceRefs = (archive: SourceArchive, sources: Map<string, { bytes: number; sha256: string; archiveEntry?: string }>) =>
  new Map([...sources].map(([entry, source]) => [entry, {
    bytes: source.bytes, sha256: source.sha256,
    openReadStream: () => archive.openEntry(source.archiveEntry ?? entry),
  } satisfies TmmFileRef]));

// V1 and older V2 cloud extensions keep their native assets inside a bounded
// metadata entry. Decode each value in chunks so a second whole-source Buffer
// is never held beside the original workspace JSON.
function inlineNativeAssets(snapshot: PortableObject, projected: PortableObject,
  projectedSources: Map<string, TmmFileRef>) {
  const ext = projected.tuominwangNative;
  if (ext?.version !== 1 || ext.snapshot?.format !== "tuominwang-workspace" ||
      !Array.isArray(ext.assets) || !Array.isArray(snapshot.documents) ||
      snapshot.documents.length !== projected.documents.length)
    fail("PORTABLE_NATIVE_EXTENSION_INVALID");
  const result = new Map<string, TmmFileRef>();
  for (const item of ext.assets) {
    if (typeof item.entry !== "string" || !item.entry || item.entry.startsWith("/") ||
        /[\\\0]/u.test(item.entry) || item.entry.split("/").some((part: string) => !part || part === "..") ||
        typeof item.base64 !== "string" ||
        item.bytes !== undefined && (!Number.isSafeInteger(item.bytes) || item.bytes < 0) ||
        !/^[a-f0-9]{64}$/u.test(item.sha256) || result.has(item.entry))
      fail("PORTABLE_NATIVE_EXTENSION_INVALID");
    let bytes = 0;
    const digest = createHash("sha256");
    const parts = function* () {
      const encoded = item.base64 as string;
      for (let at = 0; at < encoded.length; at += 1048576) {
        const part = encoded.slice(at, at + 1048576), decoded = Buffer.from(part, "base64");
        if (decoded.toString("base64") !== part) fail("PORTABLE_NATIVE_EXTENSION_INVALID");
        yield decoded;
      }
    };
    for (const part of parts()) { bytes += part.length; if (bytes > 268435456 || item.bytes !== undefined && bytes > item.bytes) fail("PORTABLE_NATIVE_EXTENSION_INVALID"); digest.update(part); }
    if (item.bytes !== undefined && bytes !== item.bytes || digest.digest("hex") !== item.sha256) fail("PORTABLE_NATIVE_EXTENSION_INVALID");
    result.set(item.entry, { bytes, sha256: item.sha256, openReadStream: () => Readable.from(parts()) });
  }
  for (const document of snapshot.documents) {
    const native = result.get(document.sourceEntry), reference = projected.documents.find((d: PortableObject) => d.id === document.id);
    if (!native || native.sha256 !== document.sourceHash || sha(Buffer.from(document.content)) !== document.contentHash ||
        !reference || reference.detection.documentText !== document.content ||
        !projectedSources.has(reference.sourceEntry)) fail("PORTABLE_NATIVE_EXTENSION_MISMATCH");
  }
  return result;
}

export type OpenedWorkspaceFile =
  | { kind: "native"; snapshot: NativePortable; sources: Map<string, TmmFileRef>; v3Source?: true; close(): Promise<void> }
  | { kind: "reference"; workspace: {
      format: "legacy-zip" | "secure-v2" | "secure-v3";
      snapshot: PortableObject; sources: Map<string, TmmFileRef>;
    }; v3Source?: true; close(): Promise<void> };

export async function openNativeOrReferenceWorkspaceFile(filePath: string,
  credential: string | PortableCredentials = {}): Promise<OpenedWorkspaceFile> {
  const options = typeof credential === "string" ? { password: credential } : credential;
  if (options.signal?.aborted) fail("PORTABLE_ABORTED");
  const handle = await open(filePath, "r");
  const prefix = Buffer.alloc(8);
  try { await handle.read(prefix, 0, prefix.length, 0); }
  finally { await handle.close(); }
  if (prefix.subarray(0, 2).toString("ascii") === "PK") {
    const opened = await readLegacyWorkspaceFromFile(filePath);
    try {
      const ext = opened.snapshot.tuominwangNative;
      if (!ext) return { kind: "reference", workspace: { format: "legacy-zip", snapshot: opened.snapshot, sources: opened.sources }, close: opened.close };
      const snapshot = ext.snapshot as NativePortable;
      return { kind: "native", snapshot,
        sources: inlineNativeAssets(snapshot, opened.snapshot, opened.sources), close: opened.close };
    } catch (error) { await opened.close(); throw error; }
  }
  if (prefix.toString("ascii") !== "LBTSC001") fail("PORTABLE_FILE_INVALID");
  const key = options.dek ?? options.password ?? fail("PORTABLE_PASSWORD_REQUIRED");
  // Probe with the original V3 envelope so a valid V3 cannot be rejected
  // before its manifest is read. The V2 reader reopens with V2 limits.
  const probe = await openTmmZipFromSecureFile(filePath, key, TMM_V3_ZIP_BUDGET);
  let version: unknown;
  try { version = (await probe.readJson("manifest.json")).schemaVersion; }
  finally { await probe.close(); }
  if (version === 2) {
    const opened = await readPortableWorkspaceV2FromFile(filePath, key);
    try {
      const refs = sourceRefs(opened.archive, opened.sources), ext = opened.snapshot.tuominwangNative;
      if (!ext) return { kind: "reference", workspace: { format: "secure-v2", snapshot: opened.snapshot, sources: refs }, close: opened.archive.close };
      if (ext.version === 2) {
        const recovered = recoverNativeAssetsFromOriginalV2(opened.snapshot, refs);
        return { kind: "native", snapshot: recovered.snapshot, sources: recovered.assets, close: opened.archive.close };
      }
      const snapshot = ext.snapshot as NativePortable;
      return { kind: "native", snapshot, sources: inlineNativeAssets(snapshot, opened.snapshot, refs), close: opened.archive.close };
    } catch (error) { await opened.archive.close(); throw error; }
  }
  if (version === 3) {
    const opened = await readPortableWorkspaceV3FromFile(filePath, key);
    try {
      const refs = sourceRefs(opened.archive, opened.sources), ext = opened.snapshot.tuominwangNative;
      if (!ext) return { kind: "reference", workspace: { format: "secure-v3", snapshot: opened.snapshot, sources: refs }, v3Source: true, close: opened.archive.close };
      if (ext.version === 2) {
        if (Array.isArray(ext.assets) && ext.assets.every((asset: any) =>
          typeof asset.projectedSourceEntry === "string" || typeof asset.base64 === "string")) {
          const recovered = recoverNativeAssetsFromOriginalV2(opened.snapshot, refs);
          return { kind: "native", snapshot: recovered.snapshot, sources: recovered.assets, v3Source: true, close: opened.archive.close };
        }
        const recovered = recoverNativeExtensionStream({ snapshot: opened.snapshot,
          archiveEntries: opened.archive.entries, sources: opened.sources });
        const sources = sourceRefs(opened.archive, recovered.assets);
        return { kind: "native", snapshot: recovered.snapshot, sources, v3Source: true, close: opened.archive.close };
      }
      const snapshot = ext.snapshot as NativePortable;
      return { kind: "native", snapshot, sources: inlineNativeAssets(snapshot, opened.snapshot, refs), v3Source: true, close: opened.archive.close };
    } catch (error) { await opened.archive.close(); throw error; }
  }
  return fail("PORTABLE_MANIFEST_INVALID");
}
