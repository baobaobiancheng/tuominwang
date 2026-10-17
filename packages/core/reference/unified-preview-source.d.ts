import type { OriginalDraftEntry } from './original-pseudonym-draft-source.js';
export type UnifiedPreviewEntry = OriginalDraftEntry;
export function mergeUnifiedPreviewEntries(previous: UnifiedPreviewEntry[] | null | undefined, rebuilt: UnifiedPreviewEntry[] | null | undefined, options?: { preferRebuiltCurrentValue?: boolean }): UnifiedPreviewEntry[];
export function unifiedPreviewEntriesChanged(previous: UnifiedPreviewEntry[] | null | undefined, rebuilt: UnifiedPreviewEntry[]): boolean;
