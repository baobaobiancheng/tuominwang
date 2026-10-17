import { z } from 'zod';
import { batchSchema } from '../contracts/index.ts';
import { folderRelativePath } from './reference-folder.ts';

const path = z.string().min(1).max(1024).refine(value => {
  try { return value.isWellFormed() && value === value.normalize('NFC') && folderRelativePath(value) === value; } catch { return false; }
});
const skipped = z.object({ sourceRelativePath: path, extension: z.string().optional(), reasonCode: z.string().min(1), reason: z.string().min(1) }).strict();
const folder = z.object({ files: batchSchema.shape.files, sourceRootName: z.string().min(1).refine(value => {
  try { return value.isWellFormed() && value === value.normalize('NFC') && !value.includes('/') && folderRelativePath(value) === value; } catch { return false; }
}), scannedAt: z.string().datetime({ offset: true }).optional(), skippedEntries: z.array(skipped).default([]), emptyDirectories: z.array(path).default([]) }).strict();
export type UploadBatchManifest = z.infer<typeof folder>;

/** Old sealed manifests are arrays; folder scans retain their skipped entries in the same sealed value. */
export function readUploadBatchManifest(json: string): { manifest: UploadBatchManifest; legacy: boolean } {
  const parsed: unknown = JSON.parse(json);
  if (Array.isArray(parsed)) return { manifest: { files: batchSchema.shape.files.parse(parsed), sourceRootName: '文件夹', skippedEntries: [], emptyDirectories: [] }, legacy: true };
  return { manifest: folder.parse(parsed), legacy: false };
}
export function writeUploadBatchManifest(manifest: UploadBatchManifest, legacy = false) {
  return JSON.stringify(legacy ? manifest.files : folder.parse(manifest));
}
export function validateFolderBatchPaths(manifest: UploadBatchManifest) {
  const paths = [...manifest.files.map(f => path.parse(f.path)), ...manifest.skippedEntries.map(f => path.parse(f.sourceRelativePath)), ...manifest.emptyDirectories.map(value => path.parse(value))];
  if (paths.some(value => !value.startsWith(manifest.sourceRootName + '/'))) throw Object.assign(new Error('FOLDER_PATH_INVALID'), { statusCode: 400 });
  if (new Set(paths).size !== paths.length) throw Object.assign(new Error('FOLDER_MANIFEST_DUPLICATE'), { statusCode: 400 });
}
