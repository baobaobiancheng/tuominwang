import { expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { readPortableWorkspace, readProtectedPortable, writePortableWorkspace, writeProtectedPortable, inspectProtectedPortable } from "../packages/core/workspace-portable.ts";
import { readZip, writeZip } from "../packages/core/office-zip.ts";
const fixture = () => ({ schemaVersion: 2, projectId: "synthetic-project", projectName: "合成多材料工程", createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", activeDocumentId: "doc-1", contentRevision: 5, rulesetSnapshot: { id: "r1", entries: [{ id: "entry", pattern: "合成姓名" }] }, profileSnapshot: { schemaVersion: 1, id: "p1" }, workspaceCorrections: [{ id: "c1", kind: "forceSkip", pattern: "公开", normalizedPattern: "公开", entityType: "name_cn", matchMode: "exact", risk: "normal", enabled: true, sourceDecisionIds: ["e1"] }], inheritedPseudonymProfile: { schemaVersion: 1, entries: [{ key: "name_cn:k", token: "【姓名001】", canonicalKey: "name_cn:k" }], reservedTokens: ["【姓名001】"] }, projectModeSnapshot: { sharedMapping: [["k", "【姓名001】"]], mergedInto: [["k2", "k"]], mergeSnapshots: [], fileOverrides: [], typeCounters: [["name_cn", 1]], customField: "keep" }, reviewDecisionEvents: [{ id: "e1", action: "excludeOccurrence", occurrenceAnchor: { kind: "image", bbox: { x: 0, y: 0, width: 2, height: 3 } } }], auditEvents: [{ event: "synthetic" }], nativeExtension: { safe: true }, documents: [1, 2].map(n => ({ id: `doc-${n}`, fileName: `合成${n}.png`, fileKind: "image", sourceEntry: `documents/doc-${n}/source.png`, route: { type: "contract", confidence: .9 }, relativePath: `子目录/${n}.png`, nativeDocumentExtension: { safe: n }, detection: { entities: [{ type: "name_cn", anchor: { kind: "image", bbox: { x: 1, y: 2, width: 3, height: 4 } } }], bboxes: [], documentText: "公开测试😀合成姓名", ocrCachePages: [{ pageNumber: 1, text: "合成姓名", lines: [] }], canonicalDocument: { schema: "synthetic", text: "公开" } }, review: { kind: "image", activeBBoxes: [{ id: "b1", x: 1, y: 2, width: 3, height: 4 }], deletedBBoxes: [], pseudonymEntries: [{ key: "k", autoValue: "【姓名001】", currentValue: "【姓名001】" }] }, exportState: { kind: "image", mode: "default_star", redact: true, redactPseudo: false, maskStyle: "black", exportMarkdown: false, pseudonymTableName: "合成表" } })) });
const sources = new Map([1, 2].map(n => [`documents/doc-${n}/source.png`, Buffer.from(`synthetic-image-${n}`)]));
it("roundtrips legacy TMM schema 1/2 and secure TMM V2/V3 without dropping full state", async () => {
  for (const format of ["legacy-zip", "secure-v2", "secure-v3"] as const) {
    const snapshot = fixture(), dek = randomBytes(32), file = await writePortableWorkspace(snapshot, sources, { format, dek });
    const opened = await readPortableWorkspace(file, { dek }); expect(opened.format).toBe(format); expect(opened.snapshot).toEqual(snapshot); expect(opened.sources).toEqual(sources);
  }
  const old = { schemaVersion: 1, projectId: "legacy-project", projectName: "旧版合成工程",
    createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z", activeDocumentId: "legacy-doc",
    contentRevision: 1, workspaceCorrections: [], reviewDecisionEvents: [], profileSnapshot: null,
    documents: [{ id: "legacy-doc", fileName: "legacy.pdf", fileKind: "pdf", sourceEntry: "documents/legacy-doc/source.pdf",
      detection: { entities: [], bboxes: [], ocrCachePages: [], documentText: "PUBLIC" },
      review: { schemaVersion: 1, kind: "pdf", isPreviewMode: false, hasVisitedPreview: false,
        enablePseudonymization: false, pseudonymEntries: [], maskStyle: "black", entities: [],
        pageRotations: {}, manualOnlyRotationPages: [], viewport: { pageNumber: 1, scale: 1 } },
      exportState: { kind: "pdf", mode: "default_star", exportMarkdown: false, pseudonymTableName: "synthetic",
        redact: true, redactPseudo: false, maskStyle: "black", exportDocx: false } }] };
  const oldFile = await writePortableWorkspace(old, new Map([["documents/legacy-doc/source.pdf", Buffer.from("PUBLIC")]]), { format: "legacy-zip" });
  expect((await readPortableWorkspace(oldFile)).snapshot.schemaVersion).toBe(2);
});
it("interoperable transfer password slot authenticates header, each chunk, and object identity", async () => {
  const file = await writePortableWorkspace(fixture(), sources, { format: "secure-v3", password: "synthetic-password", kdf: { N: 16384, r: 8, p: 1 } });
  expect(inspectProtectedPortable(file).objectType).toBe("tmm-transfer"); expect((await readPortableWorkspace(file, { password: "synthetic-password" })).snapshot).toEqual(fixture());
  await expect(readPortableWorkspace(file, { password: "incorrect-password" })).rejects.toThrow("PORTABLE_AUTH_FAILED");
  const tampered = Buffer.from(file); tampered[tampered.length - 1] ^= 1; await expect(readPortableWorkspace(tampered, { password: "synthetic-password" })).rejects.toThrow("PORTABLE_AUTH_FAILED");
  const headerTampered = Buffer.from(file), start = headerTampered.indexOf(Buffer.from("synthetic-project")); Buffer.from("synthetic-projecd").copy(headerTampered, start); await expect(readPortableWorkspace(headerTampered, { password: "synthetic-password" })).rejects.toThrow("PORTABLE_AUTH_FAILED");
  await expect(readPortableWorkspace(file.subarray(0, file.length - 1), { password: "synthetic-password" })).rejects.toThrow("PORTABLE_LENGTH_INVALID");
});
it("all secure chunks must authenticate, including middle chunks", async () => {
  const plain = Buffer.alloc(4194304 * 2 + 20, 42), dek = randomBytes(32), file = await writeProtectedPortable(plain, "recovery-source", "synthetic", { dek });
  expect((await readProtectedPortable(file, { dek })).plaintext.equals(plain)).toBe(true); const bad = Buffer.from(file); bad[65552 + 4194304 + 28 + 50] ^= 1; await expect(readProtectedPortable(bad, { dek })).rejects.toThrow("PORTABLE_AUTH_FAILED");
});
it("rejects undeclared/inconsistent entries, changed segment hashes, unsafe IDs and unresolved lazy state", async () => {
  const dek = randomBytes(32), secure = await writePortableWorkspace(fixture(), sources, { format: "secure-v3", dek }), { plaintext } = await readProtectedPortable(secure, { dek }), parts = await readZip(plaintext);
  const extra = new Map(parts); extra.set("undocumented.json", Buffer.from("{}")); await expect(readPortableWorkspace(await writeProtectedPortable(await writeZip(extra), "tmm-workspace", "synthetic-project", { dek }), { dek })).rejects.toThrow("PORTABLE_UNDECLARED_ENTRY");
  const corrupt = new Map(parts), segment = [...corrupt.keys()].find(k => k.includes("detection/entities/segment"))!; corrupt.set(segment, Buffer.from("{}\n")); await expect(readPortableWorkspace(await writeProtectedPortable(await writeZip(corrupt), "tmm-workspace", "synthetic-project", { dek }), { dek })).rejects.toThrow("PORTABLE_SEGMENT_INVALID");
  await expect(writePortableWorkspace({ ...fixture(), projectId: "../unsafe" }, sources, { format: "secure-v3", dek })).rejects.toThrow("PORTABLE_ID_INVALID");
  const lazy = fixture(); (lazy.documents[0] as any).__tmmV3Partial = { unloadedCollections: ["review.entities"] }; await expect(writePortableWorkspace(lazy, sources, { format: "secure-v3", dek })).rejects.toThrow("PORTABLE_PARTIAL_STATE_UNRESOLVED");
});
it("legacy checksums cover modified original bytes and cancellation is explicit", async () => {
  const file = await writePortableWorkspace(fixture(), sources, { format: "legacy-zip" }), parts = await readZip(file); parts.set("documents/doc-1/source.png", Buffer.from("changed")); await expect(readPortableWorkspace(await writeZip(parts))).rejects.toThrow("PORTABLE_CHECKSUM_MISMATCH");
  const controller = new AbortController(); controller.abort(); await expect(readPortableWorkspace(file, { signal: controller.signal })).rejects.toThrow("PORTABLE_ABORTED");
});

it("checks V3 index identity and full collection declarations rather than trusting byte checksums alone", async () => {
  const dek = randomBytes(32), secure = await writePortableWorkspace(fixture(), sources, { format: "secure-v3", dek }), { plaintext } = await readProtectedPortable(secure, { dek }), parts = await readZip(plaintext);
  const index = JSON.parse(parts.get("workspace/index.json")!.toString()); index.documents.reverse(); const mismatched = new Map(parts); mismatched.set("workspace/index.json", Buffer.from(JSON.stringify(index))); await expect(readPortableWorkspace(await writeProtectedPortable(await writeZip(mismatched), "tmm-workspace", "synthetic-project", { dek }), { dek })).rejects.toThrow("PORTABLE_INDEX_INVALID");
  const manifest = JSON.parse(parts.get("manifest.json")!.toString()); manifest.documents[0].entityCount++; const badCounts = new Map(parts); badCounts.set("manifest.json", Buffer.from(JSON.stringify(manifest))); await expect(readPortableWorkspace(await writeProtectedPortable(await writeZip(badCounts), "tmm-workspace", "synthetic-project", { dek }), { dek })).rejects.toThrow("PORTABLE_DECLARATION_INVALID");
});
