import { createHash } from 'node:crypto';
import type { Mark } from '../contracts/index.ts';
import { sourcePseudonymActionResult } from './reference/workspace-renderer-source.js';
import { createOriginalPseudonymDraftRuntime, type OriginalDraftEntry, type OriginalDraftEntity } from './reference/original-pseudonym-draft-source.js';

// This is the renderer's active per-document draft, including entries with zero occurrences.
// It is distinct from importedSnapshot, which remains historical evidence.
export type ActivePseudonymDraft = {
  schemaVersion: 1;
  sourceHash: string;
  revision: number;
  style: 'custom' | 'selective';
  typeActions: Record<string, string>;
  entries: OriginalDraftEntry[];
};

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
  if (!value.typeActions || typeof value.typeActions !== 'object') return undefined;
  if (value.entries.some(entry => !entry || typeof entry.key !== 'string' || typeof entry.autoValue !== 'string' || typeof entry.currentValue !== 'string' || !Number.isSafeInteger(entry.occurrences))) return undefined;
  return value as ActivePseudonymDraft;
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
  const hi2 = { value: new Map(input.draft.entries.map(entry => [entry.key, { ...entry }])) };
  const runtime = createOriginalPseudonymDraftRuntime({
    de2: { value: input.entities.map(entity => ({ ...entity })) }, hi2,
    C2: { documentText: input.text, unifiedMode: false },
    ui2: { value: { ...input.draft.typeActions } }, si2: { value: input.draft.style },
    ne2: { open: async () => false }, Z2: () => {},
  });
  runtime.rebuild({ restoreSaved: true });
  return [...runtime.entries().entries()].filter(([key, entry]) => key === entry.key).map(([, entry]) => ({ ...entry }));
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
    const action = entry.action ?? 'pseudonym';
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
  edit?: { key: string; patch: Partial<OriginalDraftEntry>; confirmDuplicate: boolean };
  reset?: boolean;
}): Promise<{ draft: ActivePseudonymDraft; duplicateRejected: boolean }> {
  if (draftSourceHash(input.text) !== input.sourceHash) throw new Error('DRAFT_SOURCE_MISMATCH');
  const prior = input.prior?.sourceHash === input.sourceHash ? input.prior : undefined;
  const hi2 = { value: new Map((prior?.entries ?? []).map(entry => [entry.key, { ...entry }])) };
  const ui2 = { value: { ...(input.typeActions ?? prior?.typeActions ?? {}) } };
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
  if (input.edit) {
    if (!runtime.entries().has(input.edit.key)) throw new Error('DRAFT_KEY_NOT_FOUND');
    await runtime.edit(input.edit.key, input.edit.patch);
  }
  if (input.reset) runtime.reset();
  const entries = [...runtime.entries().entries()].filter(([key, entry]) => key === entry.key).map(([, entry]) => ({ ...entry }));
  return { draft: { schemaVersion: 1, sourceHash: input.sourceHash, revision: input.revision, style: input.style, typeActions: ui2.value, entries }, duplicateRejected };
}
