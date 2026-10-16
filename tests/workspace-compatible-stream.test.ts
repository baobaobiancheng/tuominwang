import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeToReference, nativeToReferenceStream, recoverNativeExtensionStream } from "../packages/core/workspace-compat.ts";
import { bindNativeAssetsToOriginalV2, bindNativeSourceDuplicates } from "../packages/core/workspace-native-asset-bindings.ts";
import { createTmmTransferSlot } from "../packages/core/workspace-secure-stream.ts";
import { readPortableWorkspace } from "../packages/core/workspace-portable.ts";
import { openNativeOrReferenceWorkspaceFile } from "../packages/core/workspace-file-open.ts";
import { extractVerifiedTmmEntry, readPortableWorkspaceV3FromFile, writePortableWorkspaceV3ToFile } from "../packages/core/workspace-portable-stream.ts";
import { openTmmZipFromSecureFile, writeTmmZipToSecureFile, TMM_V3_ZIP_BUDGET } from "../packages/core/workspace-zip-stream.ts";

const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

test("secure V3 keeps native source in original declared entries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tmm-original-v3-"));
  try {
    const source = Buffer.from("synthetic public text"), doc = "synthetic-doc";
    const snapshot: any = { format: "tuominwang-workspace", schemaVersion: 1,
      project: { name: "project", dictionary: [], dictionaryRevision: 0, presetPolicy: null, presetRevision: 0 },
      mappings: [], snapshots: [], documents: [{ id: doc, name: "source.txt", format: "txt", content: source.toString(),
        contentHash: sha(source), sourceEntry: `sources/${doc}/original.txt`, sourceHash: sha(source),
        marks: [], revision: 1, state: "review", anchors: [], coverage: [], pages: [], pageReview: null,
        recognition: {}, nerEnabled: false }] };
    const ref = { bytes: source.length, sha256: sha(source), openReadStream: () => Readable.from([source]) };
    const assets = new Map([[snapshot.documents[0].sourceEntry, ref]]);
    const projected = nativeToReferenceStream(snapshot, assets, "project-1");
    await bindNativeAssetsToOriginalV2(projected.snapshot, assets, projected.sources);
    const path = join(dir, "archive.tmm"), password = "synthetic-password", dek = randomBytes(32);
    try {
      await writePortableWorkspaceV3ToFile({ snapshot: projected.snapshot, sources: new Map([...projected.sources].map(([name, asset]) => [name, Buffer.isBuffer(asset) ? { bytes: asset.length, sha256: sha(asset), openReadStream: () => Readable.from([asset]) } : asset])),
        outputPath: path, dek, keySlots: [await createTmmTransferSlot(password, dek)] });
      const originalReader = await readPortableWorkspace(await readFile(path), { password });
      assert.equal(originalReader.snapshot.documents.length, 1);
      assert.equal([...originalReader.archiveEntries.keys()].some(name => name.startsWith("native/")), false);
      const streamed = await openNativeOrReferenceWorkspaceFile(path, password);
      try { assert.equal(streamed.kind, "native"); if (streamed.kind === "native") assert.equal(streamed.snapshot.documents[0].sourceHash, sha(source)); }
      finally { await streamed.close(); }
    } finally { dek.fill(0); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("source projection uses native asset hash reference without inlining original bytes", () => {
  const original = Buffer.from("%PDF synthetic content"), id = "synthetic-doc";
  const snapshot: any = { format: "tuominwang-workspace", schemaVersion: 1,
    project: { name: "工程", dictionary: [], dictionaryRevision: 0, presetPolicy: null, presetRevision: 0 },
    mappings: [], snapshots: [], documents: [{ id, name: "合成.pdf", format: "pdf", content: "合成文本",
      contentHash: sha("合成文本"), sourceEntry: `sources/${id}/original.pdf`, sourceHash: sha(original),
      marks: [], revision: 1, state: "review", anchors: [], coverage: [], pages: [], pageReview: null,
      recognition: {}, nerEnabled: false }] };
  const old = nativeToReference(snapshot, new Map([[snapshot.documents[0].sourceEntry, original]]), "project-1");
  const ref = { bytes: original.length, sha256: sha(original), openReadStream: () => Readable.from([original]) };
  const streamed = nativeToReferenceStream(snapshot, new Map([[snapshot.documents[0].sourceEntry, ref]]), "project-1");
  const stable = (value: unknown) => JSON.parse(JSON.stringify(value,
    (key, part) => key === "builtAt" || key === "updatedAt" ? "same-time" : part));
  assert.deepEqual(stable(streamed.snapshot.documents[0].detection), stable(old.snapshot.documents[0].detection));
  assert.deepEqual(stable(streamed.snapshot.documents[0].review), stable(old.snapshot.documents[0].review));
  assert.equal(streamed.snapshot.tuominwangNative.version, 2);
  assert.deepEqual(streamed.snapshot.tuominwangNative.assets,
    [{ entry: snapshot.documents[0].sourceEntry, sha256: sha(original), bytes: original.length }]);
  assert.equal(streamed.sources.get("documents/synthetic-doc/source.pdf"), ref);
  assert.equal(JSON.stringify(streamed.snapshot).includes(original.toString("base64")), false);
});

test("referenced native original survives V3 stream roundtrip with hash-bound recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tmm-native-ref-"));
  try {
    const sourcePath = join(directory, "original.pdf"), archivePath = join(directory, "archive.tmm"), extractedPath = join(directory, "restored.pdf");
    const original = Buffer.from("%PDF synthetic native original"), id = "synthetic-doc";
    await writeFile(sourcePath, original);
    const ref = { bytes: original.length, sha256: sha(original), openReadStream: () => createReadStream(sourcePath) };
    const snapshot: any = { format: "tuominwang-workspace", schemaVersion: 1,
      project: { name: "工程", dictionary: [], dictionaryRevision: 0, presetPolicy: null, presetRevision: 0 },
      mappings: [], snapshots: [], documents: [{ id, name: "合成.pdf", format: "pdf", content: "合成文本",
        contentHash: sha("合成文本"), sourceEntry: `sources/${id}/original.pdf`, sourceHash: sha(original),
        marks: [], revision: 1, state: "review", anchors: [], coverage: [], pages: [], pageReview: null,
        recognition: {}, nerEnabled: false }] };
    const projected = nativeToReferenceStream(snapshot, new Map([[snapshot.documents[0].sourceEntry, ref]]), "project-1");
    const dek = randomBytes(32);
    await writePortableWorkspaceV3ToFile({ snapshot: projected.snapshot, sources: projected.sources as any,
      extraAssets: new Map([[snapshot.documents[0].sourceEntry, ref]]), outputPath: archivePath, dek, keySlots: [] });
    const opened = await readPortableWorkspaceV3FromFile(archivePath, dek);
    try {
      const native = recoverNativeExtensionStream({ snapshot: opened.snapshot,
        archiveEntries: opened.archive.entries, sources: opened.sources });
      assert.equal(native.snapshot.documents[0].sourceHash, sha(original));
      const info = native.assets.get(snapshot.documents[0].sourceEntry)!;
      await extractVerifiedTmmEntry({ archive: opened.archive, name: snapshot.documents[0].sourceEntry,
        ...info, outputPath: extractedPath });
      assert.deepEqual(await readFile(extractedPath), original);
    } finally { await opened.archive.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native V3 references a declared source once and retains distinct historical assets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tmm-native-dedup-"));
  try {
    const original = Buffer.from("public original PDF bytes"), history = Buffer.from("historical public preview");
    const id = "synthetic-doc", sourceEntry = `sources/${id}/original.pdf`, historyEntry = `retained/${id}/preview.png`;
    const snapshot: any = { format: "tuominwang-workspace", schemaVersion: 1,
      project: { name: "工程", dictionary: [], dictionaryRevision: 0, presetPolicy: null, presetRevision: 0 },
      mappings: [], snapshots: [], documents: [{ id, name: "合成.pdf", format: "pdf", content: "合成文本",
        contentHash: sha("合成文本"), sourceEntry, sourceHash: sha(original), marks: [], revision: 1,
        state: "review", anchors: [], coverage: [], pages: [], pageReview: null, recognition: {}, nerEnabled: false }] };
    const refs = new Map([[sourceEntry, { bytes: original.length, sha256: sha(original), openReadStream: () => Readable.from([original]) }],
      [historyEntry, { bytes: history.length, sha256: sha(history), openReadStream: () => Readable.from([history]) }]]);
    const projected = nativeToReferenceStream(snapshot, refs, "project-1");
    const extra = bindNativeSourceDuplicates(projected.snapshot, refs, projected.sources);
    assert.deepEqual([...extra.keys()], [historyEntry]);
    const path = join(directory, "native.tmm"), dek = randomBytes(32);
    try {
      await writePortableWorkspaceV3ToFile({ snapshot: projected.snapshot,
        sources: new Map([...projected.sources].map(([name, asset]) => [name, Buffer.isBuffer(asset)
          ? { bytes: asset.length, sha256: sha(asset), openReadStream: () => Readable.from([asset]) } : asset])),
        extraAssets: extra as any, outputPath: path, dek, keySlots: [] });
      const opened = await readPortableWorkspaceV3FromFile(path, dek);
      try {
        assert.equal(opened.archive.entries.has(sourceEntry), false);
        assert.equal(opened.archive.entries.has("documents/synthetic-doc/source.pdf"), true);
        assert.equal(opened.archive.entries.has(historyEntry), true);
        const recovered = recoverNativeExtensionStream({ snapshot: opened.snapshot,
          archiveEntries: opened.archive.entries, sources: opened.sources });
        assert.equal(recovered.assets.get(sourceEntry)?.archiveEntry, "documents/synthetic-doc/source.pdf");
        assert.equal(recovered.assets.get(historyEntry)?.archiveEntry, historyEntry);
      } finally { await opened.archive.close(); }
    } finally { dek.fill(0); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("V3 ZIP compression profile accepts original 200..4096 range while V2 recheck rejects it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tmm-v3-budget-"));
  try {
    const body = Buffer.alloc(5 * 1024 * 1024);
    randomBytes(12 * 1024).copy(body);
    const path = join(directory, "v3.tmm"), dek = randomBytes(32);
    try {
      await writeTmmZipToSecureFile({ outputPath: path, objectId: "project-1", dek, keySlots: [],
        entries: [{ name: "payload.bin", bytes: body.length, sha256: sha(body), store: false,
          openReadStream: () => Readable.from([body]) }], budget: TMM_V3_ZIP_BUDGET });
      const v3 = await openTmmZipFromSecureFile(path, dek, TMM_V3_ZIP_BUDGET);
      try { assert.equal(v3.entries.get("payload.bin")?.uncompressedSize, body.length); }
      finally { await v3.close(); }
      await assert.rejects(openTmmZipFromSecureFile(path, dek), /TMM_V2_ENTRY_INVALID/);
    } finally { dek.fill(0); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("V3 original JSON chunk generator roundtrips a payload across physical chunks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tmm-v3-json-chunks-"));
  try {
    const source = Buffer.from("public source"), id = "synthetic-doc";
    const original: any = { format: "tuominwang-workspace", schemaVersion: 1,
      project: { name: "project", dictionary: [], dictionaryRevision: 0, presetPolicy: null, presetRevision: 0 },
      mappings: [], snapshots: [], documents: [{ id, name: "source.txt", format: "txt", content: "public source",
        contentHash: sha(source), sourceEntry: `sources/${id}/original.txt`, sourceHash: sha(source),
        marks: [], revision: 1, state: "review", anchors: [], coverage: [], pages: [], pageReview: null,
        recognition: {}, nerEnabled: false }] };
    const ref = { bytes: source.length, sha256: sha(source), openReadStream: () => Readable.from([source]) };
    const projected = nativeToReferenceStream(original, new Map([[original.documents[0].sourceEntry, ref]]), "project-1");
    const text = "汉字 😀 ".repeat(800000);
    projected.snapshot.documents[0].detection.canonicalDocument = { text, tail: [true, null, 123] };
    await bindNativeAssetsToOriginalV2(projected.snapshot, new Map([[original.documents[0].sourceEntry, ref]]), projected.sources);
    const path = join(directory, "archive.tmm"), dek = randomBytes(32);
    try {
      await writePortableWorkspaceV3ToFile({ snapshot: projected.snapshot,
        sources: new Map([...projected.sources].map(([name, asset]) => [name, Buffer.isBuffer(asset)
          ? { bytes: asset.length, sha256: sha(asset), openReadStream: () => Readable.from([asset]) } : asset])),
        outputPath: path, dek, keySlots: [] });
      const opened = await readPortableWorkspaceV3FromFile(path, dek);
      try {
        assert.deepEqual(opened.snapshot.documents[0].detection.canonicalDocument, { text, tail: [true, null, 123] });
        const chunks = [...opened.archive.entries.keys()].filter(name => name.includes("canonicalDocument") && name.endsWith(".bin"));
        assert.ok(chunks.length > 1);
      } finally { await opened.archive.close(); }
    } finally { dek.fill(0); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("lazy ZIP source checksum error rejects its writer without an uncaught stream error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tmm-zip-source-error-"));
  const dek = randomBytes(32), path = join(directory, "not-published.tmm");
  try {
    const actual = Buffer.from("public source with changed bytes");
    await assert.rejects(writeTmmZipToSecureFile({ outputPath: path, objectId: "project-1", dek,
      keySlots: [], entries: [{ name: "source.txt", bytes: actual.length, sha256: sha(Buffer.alloc(actual.length)),
        store: false, openReadStream: () => Readable.from([actual]) }] }), /TMM_V2_CHECKSUM_MISMATCH/);
    await assert.rejects(readFile(path), { code: "ENOENT" });
  } finally { dek.fill(0); await rm(directory, { recursive: true, force: true }); }
});
