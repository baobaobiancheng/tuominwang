import {recoverNativeExtension} from "./workspace-compat.ts";
import { readZip, writeZip } from "./office-zip.ts";
import { parsePortableJson, readPortableWorkspace, readProtectedPortable, writeProtectedPortable, type PortableCredentials } from "./workspace-portable.ts";
import { hash } from "../adapters/storage.ts";
export type NativePortable = { format: "tuominwang-workspace"; schemaVersion: 1; project: { name: string; dictionary: any[]; dictionaryRevision: number; presetPolicy: any; presetRevision: number; importedPortable?: any }; mappings: any[]; documents: any[]; snapshots: any[] };
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
  if (manifest.format !== "tuominwang-workspace") {const workspace=await readPortableWorkspace(bytes, options),native=recoverNativeExtension(workspace);return native?{kind:"native" as const,...native}:{ kind: "reference" as const, workspace };}
  if (manifest.schemaVersion !== 1 || !manifest.checksums || typeof manifest.checksums !== "object") throw new Error("NATIVE_PORTABLE_MANIFEST_INVALID");
  for (const [name, bytes] of parts) if (name !== "manifest.json" && manifest.checksums[name] !== hash(bytes)) throw new Error("NATIVE_PORTABLE_CHECKSUM_MISMATCH");
  for (const name of Object.keys(manifest.checksums)) if (!parts.has(name) || hash(parts.get(name)!) !== manifest.checksums[name]) throw new Error("NATIVE_PORTABLE_CHECKSUM_MISMATCH");
  let snapshot: NativePortable; try { snapshot = parsePortableJson(parts.get("workspace.json")!); } catch { throw new Error("NATIVE_PORTABLE_SNAPSHOT_INVALID"); }
  if (snapshot.format !== "tuominwang-workspace" || snapshot.schemaVersion !== 1 || !snapshot.project || !Array.isArray(snapshot.documents) || !Array.isArray(snapshot.mappings) || !Array.isArray(snapshot.snapshots) || manifest.documentCount !== snapshot.documents.length) throw new Error("NATIVE_PORTABLE_SNAPSHOT_INVALID");
  return { kind: "native" as const, snapshot, sources: parts };
}
