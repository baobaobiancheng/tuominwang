export type UnifiedPreviewEntry = {
  key: string;
  currentValue?: string;
  locked?: boolean;
  action?: 'mask' | 'pseudonym' | 'partial_star' | 'full_star';
  [key: string]: unknown;
};
export function mergeUnifiedPreviewEntries(previous: UnifiedPreviewEntry[] | null | undefined, rebuilt: UnifiedPreviewEntry[] | null | undefined, options?: { preferRebuiltCurrentValue?: boolean }): UnifiedPreviewEntry[];
export function unifiedPreviewEntriesChanged(previous: UnifiedPreviewEntry[] | null | undefined, rebuilt: UnifiedPreviewEntry[]): boolean;
