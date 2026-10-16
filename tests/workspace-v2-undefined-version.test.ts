import { expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPortableWorkspace, readProtectedPortable, writePortableWorkspace, writeProtectedPortable } from '../packages/core/workspace-portable.ts';
import { readPortableWorkspaceV2FromFile } from '../packages/core/workspace-portable-stream.ts';
import { readZip, writeZip } from '../packages/core/office-zip.ts';
import { migrateSourceWorkspaceV1 } from '../packages/core/reference/tmm-original-v1-migrate.js';
import yazl from 'yazl';

const source = Buffer.from('PUBLIC V1');
const entry = 'documents/legacy-doc/source.pdf';
const snapshot = { schemaVersion: 1, projectId: 'legacy-project', projectName: '旧版工程',
  createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z', activeDocumentId: 'legacy-doc',
  contentRevision: 1, workspaceCorrections: [], reviewDecisionEvents: [], profileSnapshot: null,
  documents: [{ id: 'legacy-doc', fileName: 'legacy.pdf', fileKind: 'pdf', sourceEntry: entry,
    detection: { entities: [], bboxes: [], ocrCachePages: [], documentText: 'PUBLIC V1' },
    review: { schemaVersion: 1, kind: 'pdf', isPreviewMode: false, hasVisitedPreview: false,
      enablePseudonymization: false, pseudonymEntries: [], maskStyle: 'black', entities: [],
      pageRotations: {}, manualOnlyRotationPages: [], viewport: { pageNumber: 1, scale: 1 } },
    exportState: { kind: 'pdf', mode: 'default_star', exportMarkdown: false, pseudonymTableName: 'synthetic',
      redact: true, redactPseudo: false, maskStyle: 'black', exportDocx: false } }] };

it('secure V2 with omitted workspaceSchemaVersion follows original V1 migration; invalid values stay rejected', async () => {
  const dek = randomBytes(32);
  const encoded = await writePortableWorkspace(snapshot, new Map([[entry, source]]), { format: 'secure-v2', dek });
  const { plaintext } = await readProtectedPortable(encoded, { dek });
  const parts = await readZip(plaintext);
  const originalIndex = JSON.parse(parts.get('workspace/index.json')!.toString());
  expect(originalIndex.workspaceSchemaVersion).toBe(1);
  const directory = await mkdtemp(join(tmpdir(), 'tmw-v2-undefined-'));
  try {
    for (const value of [undefined, null, 3, '1']) {
      const index = { ...originalIndex };
      if (value === undefined) delete index.workspaceSchemaVersion;
      else index.workspaceSchemaVersion = value;
      const changed = new Map(parts);
      changed.set('workspace/index.json', Buffer.from(JSON.stringify(index)));
      const file = await writeProtectedPortable(await writeZip(changed), 'tmm-workspace', 'legacy-project', { dek });
      const pathname = join(directory, value === undefined ? 'omitted.tmm' : `${String(value)}.tmm`);
      await writeFile(pathname, file);
      if (value === undefined) {
        const buffered = await readPortableWorkspace(file, { dek });
        expect(buffered.snapshot.schemaVersion).toBe(2);
        expect(buffered.sources.get(entry)).toEqual(source);
        const streamed = await readPortableWorkspaceV2FromFile(pathname, dek);
        try { expect(streamed.snapshot.schemaVersion).toBe(2); expect(streamed.sources.get(entry)?.sha256).toBeDefined(); }
        finally { await streamed.archive.close(); }
      } else {
        await expect(readPortableWorkspace(file, { dek })).rejects.toThrow();
        await expect(readPortableWorkspaceV2FromFile(pathname, dek)).rejects.toThrow();
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('secure V3 continues to require an explicit V2 workspace schema', async () => {
  const dek = randomBytes(32);
  const upgraded = migrateSourceWorkspaceV1(snapshot);
  const encoded = await writePortableWorkspace(upgraded, new Map([[entry, source]]), { format: 'secure-v3', dek });
  const { plaintext } = await readProtectedPortable(encoded, { dek });
  const parts = await readZip(plaintext);
  const index = JSON.parse(parts.get('workspace/index.json')!.toString());
  delete index.workspaceSchemaVersion;
  parts.set('workspace/index.json', Buffer.from(JSON.stringify(index)));
  const file = await writeProtectedPortable(await writeZip(parts), 'tmm-workspace', 'legacy-project', { dek });
  await expect(readPortableWorkspace(file, { dek })).rejects.toThrow('PORTABLE_INDEX_INVALID');
});

it('bounded Buffer TMM reading does not apply the Office ZIP 50 MiB entry limit', async () => {
  const bytes = Buffer.alloc(60 * 1024 * 1024), dek = randomBytes(32);
  for (let offset = 0, block = 0; offset < bytes.length; offset += 4096, block++)
    createHash('sha256').update(String(block)).digest().copy(bytes, offset);
  const small = await writePortableWorkspace(snapshot, new Map([[entry, source]]), { format: 'secure-v2', dek });
  const { plaintext } = await readProtectedPortable(small, { dek });
  const parts = await readZip(plaintext), manifest = JSON.parse(parts.get('manifest.json')!.toString());
  manifest.documents[0].sourceBytes = bytes.length;
  manifest.sourceBytes = bytes.length;
  parts.set(entry, bytes); parts.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  const compressed = await new Promise<Buffer>((resolve, reject) => {
    const zip = new yazl.ZipFile(), chunks: Buffer[] = [];
    zip.outputStream.on('error', reject);
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    for (const [name, part] of parts) zip.addBuffer(part, name, { compress: true });
    zip.end();
  });
  const encoded = await writeProtectedPortable(compressed, 'tmm-workspace', 'legacy-project', { dek });
  expect(encoded.length).toBeLessThan(50 * 1024 * 1024);
  const opened = await readPortableWorkspace(encoded, { dek });
  expect(opened.snapshot.schemaVersion).toBe(2);
  expect(opened.sources.get(entry)?.equals(bytes)).toBe(true);
  const directory = await mkdtemp(join(tmpdir(), 'tmw-v2-ratio-'));
  try {
    const pathname = join(directory, 'bounded.tmm');
    await writeFile(pathname, encoded);
    const streamed = await readPortableWorkspaceV2FromFile(pathname, dek);
    try {
      const sourceEntry = streamed.archive.entries.get(entry)!;
      expect(sourceEntry.uncompressedSize).toBe(bytes.length);
      expect(sourceEntry.uncompressedSize / sourceEntry.compressedSize).toBeLessThanOrEqual(200);
      const chunks: Buffer[] = [];
      for await (const chunk of await streamed.archive.openEntry(entry)) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks, bytes.length).equals(bytes)).toBe(true);
    } finally { await streamed.archive.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
