import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openNativeOrReferenceWorkspaceFile } from "./workspace-file-open.ts";
import {recoverNativeExtension} from "./workspace-compat.ts";
import { readZip, writeZip } from "./office-zip.ts";
import { parsePortableJson, readPortableWorkspace, readProtectedPortable, writeProtectedPortable, type PortableCredentials } from "./workspace-portable.ts";
import { hash } from "../adapters/storage.ts";
export type OriginalFolderBatch = {schemaVersion:1;sourceRootName:string;scannedAt:string;skippedItems:unknown[]};
export type NativePortable = { format: "tuominwang-workspace"; schemaVersion: 1; folderBatch?:OriginalFolderBatch; project: { name: string; createdAt?:string; activeDocumentId?:string|null; dictionary: any[]; dictionaryRevision: number; presetPolicy: any; presetRevision: number; mappingLibrary?: unknown; unifiedAliasState?: unknown; importedPortable?: any }; mappings: any[]; documents: any[]; snapshots: any[];provenanceHistory?:any[] };
export async function writeNativePortable(snapshot: NativePortable, sources: Map<string, Buffer>, options: PortableCredentials) {
  const parts = new Map(sources); if (parts.has("workspace.json") || parts.has("manifest.json")) throw new Error("NATIVE_PORTABLE_SOURCE_INVALID");
  parts.set("workspace.json", Buffer.from(JSON.stringify(snapshot))); parts.set("manifest.json", Buffer.from(JSON.stringify({ format: "tuominwang-workspace", schemaVersion: 1, documentCount: snapshot.documents.length, checksums: Object.fromEntries([...parts].map(([name, bytes]) => [name, hash(bytes)])) })));
  const plaintext = await writeZip(parts);
  try { return await writeProtectedPortable(plaintext, options.password ? "tmm-transfer" : "tmm-workspace", "tuominwang-portable", options); } finally { plaintext.fill(0); }
}
export async function readNativeOrReferencePortable(bytes: Buffer, options: PortableCredentials) {
  let plaintext = bytes, encrypted = false;
  if (bytes.subarray(0, 8).toString("ascii") === "LBTSC001") { const result = await readProtectedPortable(bytes, options); if (!["tmm-workspace", "tmm-transfer"].includes(result.header.objectType)) throw new Error("PORTABLE_CONTAINER_TYPE_INVALID"); plaintext = result.plaintext; encrypted = true; }
  let parts: Map<string, Buffer>;
  try { parts = await readZip(plaintext); } finally { if (encrypted) plaintext.fill(0); }
  let manifest: any; try { manifest = parsePortableJson(parts.get("manifest.json")!); } catch { throw new Error("PORTABLE_MANIFEST_INVALID"); }
  if (manifest.format !== "tuominwang-workspace") {
    const index = parts.get("workspace/index.json");
    if (manifest.format === "lawbot-tmm" && [2, 3].includes(manifest.schemaVersion) && index &&
        [2, 3].includes(parsePortableJson(index).tuominwangNative?.version))
      return readStreamedNativePortable(bytes, options);
    const workspace=await readPortableWorkspace(bytes, options),native=recoverNativeExtension(workspace);
    return native?{kind:"native" as const,...native}:{kind:"reference" as const,workspace};
  }
  if (manifest.schemaVersion !== 1 || !manifest.checksums || typeof manifest.checksums !== "object") throw new Error("NATIVE_PORTABLE_MANIFEST_INVALID");
  for (const [name, bytes] of parts) if (name !== "manifest.json" && manifest.checksums[name] !== hash(bytes)) throw new Error("NATIVE_PORTABLE_CHECKSUM_MISMATCH");
  for (const name of Object.keys(manifest.checksums)) if (!parts.has(name) || hash(parts.get(name)!) !== manifest.checksums[name]) throw new Error("NATIVE_PORTABLE_CHECKSUM_MISMATCH");
  let snapshot: NativePortable; try { snapshot = parsePortableJson(parts.get("workspace.json")!); } catch { throw new Error("NATIVE_PORTABLE_SNAPSHOT_INVALID"); }
  if (snapshot.format !== "tuominwang-workspace" || snapshot.schemaVersion !== 1 || !snapshot.project || !Array.isArray(snapshot.documents) || !Array.isArray(snapshot.mappings) || !Array.isArray(snapshot.snapshots) || manifest.documentCount !== snapshot.documents.length) throw new Error("NATIVE_PORTABLE_SNAPSHOT_INVALID");
  return { kind: "native" as const, snapshot, sources: parts };
}

// File imports stream large workspaces; this preserves the existing bounded Buffer API.
async function readStreamedNativePortable(bytes: Buffer, options: PortableCredentials) {
  const directory = await mkdtemp(join(tmpdir(), "tmw-workspace-buffer-"));
  try {
    const path = join(directory, "workspace");
    await writeFile(path, bytes, { mode: 0o600 });
    const opened = await openNativeOrReferenceWorkspaceFile(path, options);
    try {
      if (opened.kind !== "native") throw new Error("PORTABLE_NATIVE_EXTENSION_INVALID");
      const sources = new Map<string, Buffer>();
      for (const [entry, ref] of opened.sources) {
        const stream = await ref.openReadStream(), chunks: Buffer[] = [];
        let size = 0;
        const abort = () => stream.destroy(new Error("PORTABLE_ABORTED"));
        options.signal?.addEventListener("abort", abort, { once: true });
        try {
          if (options.signal?.aborted) throw new Error("PORTABLE_ABORTED");
          for await (const chunk of stream) {
            const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += part.length;
            if (size > ref.bytes) throw new Error("PORTABLE_SOURCE_MISMATCH");
            chunks.push(part);
          }
          const value = Buffer.concat(chunks);
          if (size !== ref.bytes || hash(value) !== ref.sha256) throw new Error("PORTABLE_SOURCE_MISMATCH");
          sources.set(entry, value);
        } finally { options.signal?.removeEventListener("abort", abort); stream.destroy(); }
      }
      return { kind: "native" as const, snapshot: opened.snapshot, sources };
    } finally { await opened.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
}
