export type OriginalDraftEntry = {
  key: string;
  canonicalKey?: string;
  entityType: string;
  normalized: string;
  autoValue: string;
  currentValue: string;
  locked: boolean;
  autoUpgraded?: boolean;
  occurrences: number;
  action?: 'pseudonym' | 'mask' | 'partial_star' | 'full_star';
};
export type OriginalDraftEntity = {
  type: string;
  text: string;
  startOffset: number;
  deleted?: boolean;
  canonicalKey?: string;
  meta?: Record<string, unknown>;
};
export type OriginalDraftRuntimeContext = {
  de2: { value: OriginalDraftEntity[] };
  hi2: { value: Map<string, OriginalDraftEntry> };
  C2: { documentText: string; unifiedMode: boolean };
  ui2: { value: Record<string, string> };
  si2: { value: string };
  ne2: { open: (prompt: { title: string; description: string }) => Promise<boolean> };
  Z2: (...args: unknown[]) => void;
  unifiedMapping?: { entries: unknown[]; reservedTokens?: string[] };
};
export function createOriginalPseudonymDraftRuntime(context: OriginalDraftRuntimeContext): {
  rebuild(options?: { restoreSaved?: boolean }): void;
  edit(key: string, patch: Partial<OriginalDraftEntry>): Promise<void>;
  reset(): void;
  keyFor(type: string, value: string): string;
  entries(): Map<string, OriginalDraftEntry>;
  unifiedSnapshot(): unknown;
};
