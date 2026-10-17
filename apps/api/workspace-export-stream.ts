import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { rows, sql, type DB } from "../../packages/adapters/db.ts";
import { hash, readArtifact, unseal } from "../../packages/adapters/storage.ts";
import { readOriginalToPrivateFile, TMM_V3_SOURCE_MAX_BYTES } from "../../packages/adapters/workspace-original-stream.ts";
import { nativeToReferenceStream, workspaceReviewProfile } from "../../packages/core/workspace-compat.ts";
import { bindNativeAssetsToOriginalV2, bindNativeSourceDuplicates, inlineNativeAssetsForLegacy } from "../../packages/core/workspace-native-asset-bindings.ts";
import { createTmmTransferSlot } from "../../packages/core/workspace-secure-stream.ts";
import { writePortableWorkspaceV3ToFile, writePortableWorkspaceV2ToFile, type TmmFileRef } from "../../packages/core/workspace-portable-stream.ts";
import { writeLegacyWorkspaceToFile } from "../../packages/core/workspace-legacy-stream.ts";
import { getProjectMappings } from "../../packages/adapters/alias-groups.ts";
import { readReviewProvenance, readReviewProvenanceArchive } from "../../packages/adapters/review-provenance.ts";
import { readUnifiedAliasState } from "../../packages/adapters/unified-aliases.ts";
import { readPageRotationState } from "../../packages/adapters/page-rotation-state.ts";
import { archiveEntityCorrections } from "../../packages/adapters/entity-corrections.ts";
import { archiveEntityGeometry } from "../../packages/adapters/entity-geometry.ts";
import { openPageReview } from "../../packages/adapters/page-review-storage.ts";
import { projectLibraryBackup } from "../../packages/adapters/mapping-library.ts";
import { originalDocumentFormat, isLegacyWordFormat } from "../../packages/core/document-format.ts";
import { readNormalizationMetadata, attestNormalization } from "../../packages/adapters/document-normalization.ts";
import { attestPortableSource } from "../../packages/adapters/portable-source.ts";
import { documentPolicySchema } from "../../packages/contracts/document-policy.ts";
import { FILE_MAX_BYTES } from "../../packages/contracts/index.ts";
import type { NativePortable } from "../../packages/core/native-portable.ts";
import { workspaceFolderBatch } from './workspace-folder-batch.ts';

type Actor = { id: string; tenant_id: string };
type Asset = Buffer | TmmFileRef;
const sourceLimit = 4 * 1024 ** 3;
const sourceError = (): never => { throw new Error("SOURCE_MISMATCH"); };
const asRef = (asset: Asset): TmmFileRef => Buffer.isBuffer(asset)
  ? { bytes: asset.length, sha256: hash(asset), openReadStream: () => Readable.from([asset]) } : asset;
async function smallMarkdownSource(ref: TmmFileRef) {
  if (ref.bytes > FILE_MAX_BYTES) throw new Error("PORTABLE_MARKDOWN_SOURCE_REQUIRED");
  const chunks: Buffer[] = []; let count = 0;
  for await (const chunk of await ref.openReadStream()) {
    const bytes = Buffer.from(chunk); count += bytes.length;
    if (count > ref.bytes || count > FILE_MAX_BYTES) sourceError();
    chunks.push(bytes);
  }
  const source = Buffer.concat(chunks, count);
  if (count !== ref.bytes || hash(source) !== ref.sha256) sourceError();
  return source;
}

// Same project snapshot and history fields as the existing portable/export
// route. Only the original-source read changes to a verified private stream.
export async function produceWorkspaceArchive(db: DB, actor: Actor, project: string,
  password: string, outputPath: string, signal?: AbortSignal,
  format: "native" | "legacy-zip" | "secure-v2" | "secure-v3" = "native") {
  const directory = await mkdtemp(join(tmpdir(), "tmw-workspace-export-"));
  const assets = new Map<string, Asset>();
  try {
    async function original(id: string, expectedHash: string, expectedBytes?: number, v3Source = false): Promise<TmmFileRef> {
      const path = join(directory, randomUUID());
      const result = await readOriginalToPrivateFile(id, path, expectedHash,
        { maxBytes: v3Source ? TMM_V3_SOURCE_MAX_BYTES : sourceLimit, expectedBytes, expectedHash, signal,
          ...(v3Source ? { purpose: "tmm-v3-source" as const } : {}) });
      return { bytes: result.bytes, sha256: result.sha256, openReadStream: () => createReadStream(path) };
    }
    const [p] = await rows(db, sql`SELECT * FROM projects WHERE id=${project}`);
    if (!p) sourceError();
    const documents: any[] = [], snapshots: any[] = [], provenanceHistory: any[] = [];
    let cursor = "00000000-0000-0000-0000-000000000000";
    for (;;) {
      const docs = await rows(db, sql`SELECT * FROM documents WHERE project_id=${project} AND id>${cursor}::uuid ORDER BY id LIMIT 100 FOR SHARE`);
      for (const d of docs) {
        signal?.throwIfAborted();
        const aad = `${actor.tenant_id}:${project}:${d.id}`, content = unseal(d.content, aad);
        if (hash(content) !== d.content_hash) sourceError();
        const name = d.source_name ? unseal(d.source_name, aad + ":name") : `${d.id}.${d.source_format}`;
        const sourceEntry = `sources/${d.id}/original.${d.source_format}`;
        const sourceBytes = d.source_bytes == null ? undefined : Number(d.source_bytes);
        const v3Source = format === "native" || format === "secure-v3";
        if (sourceBytes !== undefined && (!Number.isSafeInteger(sourceBytes) || sourceBytes < 0 || sourceBytes > (v3Source ? TMM_V3_SOURCE_MAX_BYTES : sourceLimit))) sourceError();
        let source: Asset = d.source_id ? await original(d.source_id, d.source_hash, sourceBytes, v3Source) : Buffer.from(content);
        if (d.source_id && (Buffer.isBuffer(source) ? hash(source) : source.sha256) !== d.source_hash) sourceError();
        if (d.source_format === "md" && !Buffer.isBuffer(source)) source = await smallMarkdownSource(source);
        assets.set(sourceEntry, source);
        let unlockedSource: any = null;
        if (d.unlocked_source_id) {
          if (isLegacyWordFormat(originalDocumentFormat(d)) || d.unlock_source_hash !== d.source_hash ||
              !d.unlocked_source_hash) sourceError();
          const derived = await original(d.unlocked_source_id, d.unlocked_source_hash);
          if (!["docx", "xlsx", "pdf"].includes(d.source_format)) throw new Error("PORTABLE_UNLOCK_FORMAT_INVALID");
          const entry = `sources/${d.id}/unlocked.${d.source_format}`;
          assets.set(entry, derived);
          unlockedSource = { entry, originalHash: d.source_hash, derivedHash: derived.sha256,
            witness: attestPortableSource(d.source_hash, derived.sha256, d.source_format) };
        }
        let normalizedSource: any = null;
        if (d.normalized_source_id) {
          if (!isLegacyWordFormat(originalDocumentFormat(d)) || d.normalization_source_hash !== d.source_hash ||
              !d.normalized_source_hash || d.unlocked_source_id) sourceError();
          const bytes = await original(d.normalized_source_id, d.normalized_source_hash), metadata = readNormalizationMetadata(d);
          const entry = `sources/${d.id}/normalized.docx`;
          assets.set(entry, bytes);
          normalizedSource = { entry, originalHash: d.source_hash, normalizedHash: bytes.sha256,
            metadata, witness: attestNormalization(metadata) };
        }
        const pages = [];
        for (const page of d.page_data ?? []) {
          const preview = await original(page.previewId, page.previewHash), map = await readArtifact(page.mapId);
          if (hash(map) !== page.mapHash) sourceError();
          const previewEntry = `sources/${d.id}/pages/${page.index}.png`, mapEntry = `sources/${d.id}/pages/${page.index}.json`;
          assets.set(previewEntry, preview); assets.set(mapEntry, Buffer.from(map));
          const { previewId: _preview, mapId: _map, ...metadata } = page;
          pages.push({ ...metadata, previewEntry, mapEntry });
        }
        documents.push({ id: d.id, name, format: d.source_format, content, contentHash: d.content_hash,
          sourceEntry, sourceHash: Buffer.isBuffer(source) ? hash(source) : source.sha256, marks: d.marks, revision: d.revision, state: d.state,
          anchors: d.anchors, coverage: d.coverage, pages, pageReview: openPageReview(d),
          recognition: d.recognition, nerEnabled: d.ner_enabled,
          documentPolicy: d.document_policy ? documentPolicySchema.parse(JSON.parse(unseal(d.document_policy, aad + ":document-policy"))) : null,
          isBatch: !!d.is_batch, reviewProvenance: await readReviewProvenance(db, d),
          entityCorrectionsArchive: archiveEntityCorrections(d), entityGeometryArchive: archiveEntityGeometry(d, openPageReview(d)),
          ...d.source_format === "pdf" ? { pageRotationState: readPageRotationState(d) } : {},
          unlockedSource, normalizedSource });
        const old = await rows(db, sql`SELECT revision,content_hash,parse_version,marks,rule_version,recognition,page_review,page_data,created_at,entity_metadata FROM review_snapshots WHERE document_id=${d.id} ORDER BY revision`);
        for (const s of old) {
          const { entity_metadata: _private, ...fields } = s;
          snapshots.push({ ...fields, reviewProvenanceArchive: await readReviewProvenanceArchive(db, d, s),
            page_review: openPageReview({ ...d, revision: s.revision, content_hash: s.content_hash }, s.page_review), documentId: d.id });
        }
      }
      if (docs.length < 100) break;
      cursor = docs.at(-1)!.id;
    }
    for (const d of await rows(db, sql`SELECT * FROM documents WHERE project_id=${project} ORDER BY id`))
      for (const h of await rows(db, sql`SELECT * FROM review_entity_history WHERE document_id=${d.id} ORDER BY revision,content_hash`))
        provenanceHistory.push({ documentId: d.id, revision: h.revision, contentHash: h.content_hash,
          archive: await readReviewProvenanceArchive(db, d, h) });
    const mappings = await getProjectMappings(db, project, { historical: true });
    const importedPortable = p.portable_state ? JSON.parse(unseal(p.portable_state, `${actor.tenant_id}:${project}:portable-state`)) : null;
    for (const item of importedPortable?.restoredDraftAssets ?? []) for (const page of item.pages ?? []) {
      const preview = await original(page.previewId, page.previewHash), map = await readArtifact(page.mapId);
      if (hash(map) !== page.mapHash) sourceError();
      const previewEntry = `retained/${item.documentId}/pages/${page.index}.png`, mapEntry = `retained/${item.documentId}/pages/${page.index}.json`;
      assets.set(previewEntry, preview); assets.set(mapEntry, Buffer.from(map));
      delete page.previewId; delete page.mapId; Object.assign(page, { previewEntry, mapEntry });
    }
    for (const [index, item] of (importedPortable?.retainedNormalizedSources ?? []).entries()) {
      const bytes = await original(item.sourceId, item.hash);
      const entry = `retained/${item.documentId}/normalized-${index}.docx`;
      assets.set(entry, bytes); delete item.sourceId; item.entry = entry;
    }
    const folderBatch=await workspaceFolderBatch(db,actor.tenant_id,project,importedPortable);
    const snapshot: NativePortable = { format: "tuominwang-workspace", schemaVersion: 1,
      ...(folderBatch?{folderBatch}:{}),
      project: { name: p.name,
        dictionary: p.dictionary ? JSON.parse(unseal(p.dictionary, `${actor.tenant_id}:${project}:dictionary`)) : [],
        dictionaryRevision: p.dictionary_revision,
        presetPolicy: p.preset_policy ? JSON.parse(unseal(p.preset_policy, `${actor.tenant_id}:${project}:presets`)) : null,
        presetRevision: p.preset_revision, mappingLibrary: await projectLibraryBackup(db, actor, project),
        unifiedAliasState: (await readUnifiedAliasState(db, actor.tenant_id, project)).frame,
        ...importedPortable ? { importedPortable } : {} },
      mappings, documents, snapshots, provenanceHistory };
    const projected = nativeToReferenceStream(snapshot, assets, project);
    const referenceSources = new Map([...projected.sources].map(([entry, asset]) => [entry, asRef(asset)]));
    const dek = randomBytes(32);
    try {
      const keySlot = await createTmmTransferSlot(password, dek);
      let result: {bytes:number;sha256:string}|Record<string,unknown>;
      if (format === "legacy-zip") {
        await inlineNativeAssetsForLegacy(projected.snapshot,assets);
        result = await writeLegacyWorkspaceToFile({snapshot:projected.snapshot,
          sources:referenceSources,outputPath,signal});
      } else if (format === "secure-v2") {
        await bindNativeAssetsToOriginalV2(projected.snapshot,assets,projected.sources);
        result = await writePortableWorkspaceV2ToFile({snapshot:projected.snapshot,
          sources:referenceSources,outputPath,dek,keySlots:[keySlot],objectType:"tmm-transfer",signal});
      } else if (format === "secure-v3") {
        // Original V3 permits only entries declared by its manifest. Keep the
        // native history in the bounded index and bind source bytes to a
        // declared source entry, exactly as the original V2 layout does.
        await bindNativeAssetsToOriginalV2(projected.snapshot, assets, projected.sources);
        result = await writePortableWorkspaceV3ToFile({snapshot:projected.snapshot,
          sources:referenceSources,outputPath,dek,keySlots:[keySlot],objectType:"tmm-transfer",signal});
      } else {
        // Native keeps the cloud-only review history in the existing segmented
        // V3 extension. The filename remains .tmw; the protected manifest
        // identifies the actual archive layout for the importer.
        const extra = bindNativeSourceDuplicates(projected.snapshot, assets, projected.sources);
        result = await writePortableWorkspaceV3ToFile({snapshot:projected.snapshot,
          sources:referenceSources,extraAssets:new Map([...extra].map(([entry, asset]) => [entry, asRef(asset)])),
          outputPath,dek,keySlots:[keySlot],objectType:"tmm-transfer",signal});
      }
      const profile = workspaceReviewProfile({ snapshot: projected.snapshot, sources: new Map(), format } as any);
      return { ...result, reusable: {
        reusableContentKnown: true, reusableCorrectionCount: profile.corrections.length,
        reusablePseudonymCount: profile.pseudonyms.entries.length } };
    } finally { dek.fill(0); }
  } finally { await rm(directory, { recursive: true, force: true }); }
}
