import { sourceSelectiveEntityType } from './reference/workspace-renderer-source.js';

/** Convert preset/source aliases to the renderer's lookup key. Source map
 * insertion order is significant: later aliases overwrite earlier aliases. */
export function canonicalizeOriginalTypeActions(...sources: Array<Record<string, string> | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    for (const [key, action] of Object.entries(source ?? {})) {
      if (['mask', 'pseudonym', 'partial_star', 'full_star'].includes(action)) result[sourceSelectiveEntityType(key)] = action;
    }
  }
  return result;
}

export type OriginalDraftTypeActionControlInput = {
  entries: Array<{ entityType: string }>;
  typeActions: Record<string, string>;
};

/** One visible type-action control per renderer canonical type, with its saved selected action. */
export function originalDraftTypeActionControls(draft: OriginalDraftTypeActionControlInput): Array<{ entityType: string; action: string }> {
  const typeActions = canonicalizeOriginalTypeActions(draft.typeActions);
  return [...new Set(draft.entries.map(entry => sourceSelectiveEntityType(entry.entityType)))].map(entityType => ({
    entityType,
    action: typeActions[entityType] ?? 'pseudonym',
  }));
}
