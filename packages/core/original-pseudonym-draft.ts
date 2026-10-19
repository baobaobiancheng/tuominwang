import { createHash } from 'node:crypto';
import { canonicalizeOriginalTypeActions } from './original-draft-controls.ts';
export { canonicalizeOriginalTypeActions, originalDraftTypeActionControls } from './original-draft-controls.ts';
import type { Mark } from '../contracts/index.ts';
import { sourcePseudonymActionResult, sourceSelectiveEntityType } from './reference/workspace-renderer-source.js';
import { createOriginalPseudonymDraftRuntime, type OriginalDraftEntry, type OriginalDraftEntity } from './reference/original-pseudonym-draft-source.js';

// This is the renderer's active per-document draft, including entries with zero occurrences.
// It is distinct from importedSnapshot, which remains historical evidence.
export type ActivePseudonymDraft = {
  schemaVersion: 1;
  sourceHash: string;
  revision: number;
  hasVisitedPreview?: boolean;
  /** True means an explicit selective reset cleared the action table. */
  typeActionsReset?: boolean;
  style: 'custom' | 'selective';
  typeActions: Record<string, string>;
  entries: OriginalDraftEntry[];
};

function normalizeEntryAction(entry: OriginalDraftEntry): OriginalDraftEntry {
  return entry.action === undefined || ['pseudonym','mask','partial_star','full_star'].includes(String(entry.action))
    ? { ...entry } : { ...entry, action: 'pseudonym' };
}

export function draftSourceHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
export function activeDraftHash(draft: ActivePseudonymDraft | undefined): string {
  return createHash('sha256').update(JSON.stringify(draft ?? null)).digest('hex');
}
const keyRuntime = createOriginalPseudonymDraftRuntime({ de2: { value: [] }, hi2: { value: new Map() },
    C2: { documentText: '', unifiedMode: false }, ui2: { value: {} }, si2: { value: 'custom' },
    ne2: { open: async () => false }, Z2: () => {} });
export function originalDraftEntityKey(type: string, value: string): string {
  return keyRuntime.keyFor(type, value);
}

export function readActiveDraft(portableState: unknown, documentId: string): ActivePseudonymDraft | undefined {
  if (!portableState || typeof portableState !== 'object') return undefined;
  const state = portableState as { activePseudonymDrafts?: Record<string, unknown> };
  const draft = state.activePseudonymDrafts?.[documentId];
  if (!draft || typeof draft !== 'object') return undefined;
  const value = draft as Partial<ActivePseudonymDraft>;
  if (value.schemaVersion !== 1 || typeof value.sourceHash !== 'string' || !Number.isSafeInteger(value.revision) || !Array.isArray(value.entries)) return undefined;
  if (value.style !== 'custom' && value.style !== 'selective') return undefined;
  if (!value.typeActions || typeof value.typeActions !== 'object' || Array.isArray(value.typeActions)) return undefined;
  if (value.entries.some(entry => !entry || typeof entry.key !== 'string' || typeof entry.autoValue !== 'string' || typeof entry.currentValue !== 'string' || !Number.isSafeInteger(entry.occurrences))) return undefined;
  return { ...value, typeActions: canonicalizeOriginalTypeActions(value.typeActions),
    entries: value.entries.map(entry => normalizeEntryAction(entry)),
    ...value.typeActionsReset === true ? { typeActionsReset: true } : {} } as ActivePseudonymDraft;
}
/** Recover a draft from the reference review fields when the native extension
 * is absent. An explicit empty selective action table is a reset signal. */
export function originalDraftFromReferenceReview(review: {
  pseudonymEntries?: Array<Record<string, unknown>>;
  pseudonymStyle?: string;
  pseudonymTypeActions?: Record<string, string>;
}, sourceHash: string, revision: number, projectTypeActions?: Record<string, string>): ActivePseudonymDraft | undefined {
  if (!Array.isArray(review.pseudonymEntries)) return undefined;
  const entries = review.pseudonymEntries.flatMap(entry => {
    const key = entry.key;
    if (typeof key !== 'string' || !key.includes(':')) return [];
    const colon = key.indexOf(':');
    return [{ key, canonicalKey: typeof entry.canonicalKey === 'string' ? entry.canonicalKey : undefined,
      entityType: key.slice(0, colon), normalized: key.slice(colon + 1),
      autoValue: typeof entry.autoValue === 'string' ? entry.autoValue : '',
      currentValue: typeof entry.currentValue === 'string' ? entry.currentValue : '',
      locked: entry.locked === true, occurrences: 0,
      action: ['pseudonym','mask','partial_star','full_star'].includes(String(entry.action)) ? entry.action as OriginalDraftEntry['action'] : undefined }];
  });
  const style = review.pseudonymStyle === 'selective' ? 'selective' : 'custom';
  const typeActions = canonicalizeOriginalTypeActions(review.pseudonymTypeActions ?? projectTypeActions);
  const reset = Object.hasOwn(review, 'pseudonymTypeActions') && !!review.pseudonymTypeActions &&
    Object.keys(review.pseudonymTypeActions).length === 0;
  return { schemaVersion: 1, sourceHash, revision, style, typeActions, entries, ...(reset ? { typeActionsReset: true } : {}) };
}
function findNativeDraft(portableState: unknown, documentId: string): ActivePseudonymDraft | undefined {
  const seen = new Set<object>();
  let state = portableState, currentId = documentId;
  while (state && typeof state === 'object' && !seen.has(state)) {
    seen.add(state);
    const draft = readActiveDraft(state, currentId);
    if (draft) return draft;
    if (Object.hasOwn((state as {activePseudonymDrafts?:Record<string,unknown>}).activePseudonymDrafts ?? {}, currentId)) throw new Error('DRAFT_INVALID');
    const frame = state as { documentIdMap?: Record<string, unknown>; importedSnapshot?: { project?: { importedPortable?: unknown } } };
    const oldId = Object.entries(frame.documentIdMap ?? {}).find(([, next]) => next === currentId)?.[0];
    if (!oldId) break;
    currentId = oldId;
    state = frame.importedSnapshot?.project?.importedPortable;
  }
  return undefined;
}
export function rebindNativeImportedDraft(importedSnapshot: unknown, oldDocumentId: string, sourceHash: string, revision: number): ActivePseudonymDraft | undefined {
  const project = importedSnapshot && typeof importedSnapshot === 'object' ? (importedSnapshot as { project?: { importedPortable?: unknown } }).project : undefined;
  return currentOrImportedDraft(project?.importedPortable, oldDocumentId, sourceHash, revision);
}
export function currentOrImportedDraft(portableState: unknown, documentId: string, sourceHash: string, revision: number): ActivePseudonymDraft | undefined {
  const draft = findNativeDraft(portableState, documentId);
  if (!draft) return undefined;
  if (draft.sourceHash !== sourceHash) throw new Error('DRAFT_SOURCE_MISMATCH');
  return { ...draft, revision };
}

export function withActiveDraft(portableState: Record<string, unknown>, documentId: string, draft: ActivePseudonymDraft): Record<string, unknown> {
  const existing = portableState.activePseudonymDrafts;
  const drafts = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing as Record<string, unknown> : {};
  return { ...portableState, activePseudonymDrafts: { ...drafts, [documentId]: draft } };
}

/** Rebuild the original renderer draft for reference export. The source's Ei2
 * retains keys whose last occurrence was deleted; the native extension also
 * carries the complete encrypted project state. */
export function projectOriginalDraftEntries(input: { draft: ActivePseudonymDraft; text: string; entities: OriginalDraftEntity[] }): OriginalDraftEntry[] {
  if (draftSourceHash(input.text) !== input.draft.sourceHash) throw new Error('DRAFT_SOURCE_MISMATCH');
  const hi2 = { value: new Map(input.draft.entries.map(entry => [entry.key, normalizeEntryAction(entry)])) };
  const runtime = createOriginalPseudonymDraftRuntime({
    de2: { value: input.entities.map(entity => ({ ...entity })) }, hi2,
    C2: { documentText: input.text, unifiedMode: false },
    ui2: { value: canonicalizeOriginalTypeActions(input.draft.typeActions) }, si2: { value: input.draft.style },
    ne2: { open: async () => false }, Z2: () => {},
  });
  runtime.rebuild({ restoreSaved: true });
  if (input.draft.style === 'selective') preserveSavedMasks(runtime.entries(), input.draft.entries);
  return [...runtime.entries().entries()].filter(([key, entry]) => key === entry.key).map(([, entry]) => ({ ...entry }));
}
function preserveSavedMasks(current: Map<string, OriginalDraftEntry>, saved: OriginalDraftEntry[], exceptTypes = new Set<string>()): void {
  for (const entry of saved) if (entry.action === 'mask' && !exceptTypes.has(sourceSelectiveEntityType(entry.entityType))) {
    const rebuilt = current.get(entry.key);
    if (rebuilt) current.set(entry.key, { ...rebuilt, action: 'mask' });
  }
}

/** Apply only current-document keys to current review marks. Actual artifact
 * creation still runs through the existing saveReview and export gates. */
export function projectDraftEditToMarks(input: {
  draft: ActivePseudonymDraft; entities: OriginalDraftEntity[]; marks: Mark[]; targetKeys: ReadonlySet<string>;
}): Mark[] {
  if (input.entities.length !== input.marks.length) throw new Error('DRAFT_ENTITY_COUNT_MISMATCH');
  const hi2 = { value: new Map(input.draft.entries.map(entry => [entry.key, { ...entry }])) };
  const runtime = createOriginalPseudonymDraftRuntime({
    de2: { value: [] }, hi2, C2: { documentText: '', unifiedMode: false },
    ui2: { value: {} }, si2: { value: input.draft.style }, ne2: { open: async () => false }, Z2: () => {},
  });
  return input.marks.map((mark, index) => {
    const entity = input.entities[index], key = runtime.keyFor(entity.type, entity.text);
    if (!input.targetKeys.has(key) || entity.deleted) return mark;
    const entry = hi2.value.get(key);
    if (!entry) return mark;
    const action = input.draft.style === 'selective' ? entry.action ?? 'pseudonym' : 'pseudonym';
    const replacement: Mark['replacement'] = action === 'pseudonym'
      ? { mode: 'custom', value: entry.currentValue }
      : action === 'mask' ? { mode: 'clear' }
      : action === 'full_star' ? { mode: 'full' }
      : { mode: 'custom', value: sourcePseudonymActionResult('partial_star', entity.type, entity.text) ?? '' };
    return { ...mark, replacement, replacementOrigin: 'value' };
  });
}

export async function updateOriginalDraft(input: {
  prior?: ActivePseudonymDraft;
  sourceHash: string;
  revision: number;
  text: string;
  entities: OriginalDraftEntity[];
  style: 'custom' | 'selective';
  typeActions?: Record<string, string>;
  typeAction?: { entityType: string; action: string };
  edit?: { key: string; patch: Partial<OriginalDraftEntry>; confirmDuplicate: boolean };
  reset?: boolean;
}): Promise<{ draft: ActivePseudonymDraft; duplicateRejected: boolean }> {
  if (draftSourceHash(input.text) !== input.sourceHash) throw new Error('DRAFT_SOURCE_MISMATCH');
  const prior = input.prior?.sourceHash === input.sourceHash ? input.prior : undefined;
  if (input.typeAction && input.style !== 'selective') throw new Error('DRAFT_TYPE_ACTION_REQUIRES_SELECTIVE');
  if (input.style !== 'selective' && input.edit?.patch.action !== undefined && input.edit.patch.action !== 'pseudonym') throw new Error('DRAFT_ACTION_REQUIRES_SELECTIVE');
  const hi2 = { value: new Map((prior?.entries ?? []).map(entry => [entry.key, normalizeEntryAction(entry)])) };
  const ui2 = { value: canonicalizeOriginalTypeActions(input.typeActions ?? prior?.typeActions) };
  if (input.typeAction) {
    const canonicalType = sourceSelectiveEntityType(input.typeAction.entityType);
    const action = input.typeAction.action;
    if (!['pseudonym', 'mask', 'partial_star', 'full_star'].includes(action)) throw new Error('DRAFT_ACTION_INVALID');
    ui2.value = { ...ui2.value, [canonicalType]: action };
    for (const [key, entry] of hi2.value) {
      if (sourceSelectiveEntityType(entry.entityType) === canonicalType) hi2.value.set(key, { ...entry, action: action as OriginalDraftEntry['action'] });
    }
  }
  let duplicateRejected = false;
  const runtime = createOriginalPseudonymDraftRuntime({
    de2: { value: input.entities.map(entity => ({ ...entity })) }, hi2,
    C2: { documentText: input.text, unifiedMode: false },
    ui2,
    si2: { value: input.style },
    ne2: { open: async () => { if (!input.edit?.confirmDuplicate) duplicateRejected = true; return input.edit?.confirmDuplicate === true; } },
    Z2: () => {},
  });
  runtime.rebuild({ restoreSaved: !!prior });
  if (!input.reset && input.style === 'selective' && prior) {
    const exceptTypes = input.typeAction ? new Set([sourceSelectiveEntityType(input.typeAction.entityType)]) : new Set<string>();
    preserveSavedMasks(runtime.entries(), prior.entries, exceptTypes);
  }
  if (input.edit) {
    if (!runtime.entries().has(input.edit.key)) throw new Error('DRAFT_KEY_NOT_FOUND');
    await runtime.edit(input.edit.key, input.edit.patch);
  }
  if (input.reset) runtime.reset();
  const entries = [...runtime.entries().entries()].filter(([key, entry]) => key === entry.key).map(([, entry]) => ({ ...entry }));
  return { draft: { schemaVersion: 1, sourceHash: input.sourceHash, revision: input.revision,
    ...prior?.hasVisitedPreview === true ? { hasVisitedPreview: true } : {},
    ...input.reset && input.style === 'selective' || prior?.typeActionsReset === true && !input.typeAction ? { typeActionsReset: true } : {},
    style: input.style, typeActions: ui2.value, entries }, duplicateRejected };
}
