/** Extracted from renderer.js Jh2 (33640) and Qh2 (33648).
 * The server passes the source-bound draft entries instead of reading Gh2.
 * Keep the source preference for rebuilt value/lock and prior user action.
 */
export function mergeUnifiedPreviewEntries(previous, rebuilt, options) {
  const prior = new Map();
  for (const entry of Array.isArray(previous) ? previous : []) if (entry?.key) prior.set(entry.key, entry);
  return (Array.isArray(rebuilt) ? rebuilt : []).map(entry => {
    const old = prior.get(entry?.key);
    return old ? {
      ...entry,
      currentValue: options?.preferRebuiltCurrentValue ? entry.currentValue : typeof old.currentValue === 'string' ? old.currentValue : entry.currentValue,
      locked: options?.preferRebuiltCurrentValue ? entry.locked : typeof old.locked === 'boolean' ? old.locked : entry.locked,
      action: ['mask', 'pseudonym', 'partial_star', 'full_star'].includes(String(old.action)) ? old.action : entry.action,
    } : { ...entry };
  });
}

export function unifiedPreviewEntriesChanged(previous, rebuilt) {
  if (!Array.isArray(previous) || previous.length !== rebuilt.length) return true;
  const byKey = new Map();
  for (const entry of rebuilt) if (entry?.key) byKey.set(entry.key, entry);
  for (const entry of previous) {
    if (!entry?.key) return true;
    const next = byKey.get(entry.key);
    if (!next) return true;
    if (String(entry.currentValue ?? '') !== String(next.currentValue ?? '')) return true;
    if ((entry.locked === true || next.locked === true) && Boolean(entry.locked) !== Boolean(next.locked)) return true;
    if (entry.action !== next.action) return true;
  }
  return false;
}
