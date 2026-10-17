import { describe, expect, it } from 'vitest';
import { currentOrImportedDraft, draftSourceHash, projectOriginalDraftEntries, rebindNativeImportedDraft, updateOriginalDraft } from '../packages/core/original-pseudonym-draft.ts';
import { canonicalRuleEntityType } from '../packages/core/presets.ts';
import { singleDocumentDraftMappingData } from '../packages/core/mapping-export.ts';
import { parseRestorationMapping, restoreMarkdown } from '../packages/core/restoration-files.ts';

const text = '张三和张四';
const sourceHash = draftSourceHash(text);
const entities = [
  { type: 'name_cn', text: '张三', startOffset: 0 },
  { type: 'name_cn', text: '张四', startOffset: 3 },
];

describe('original per-document pseudonym draft', () => {
  it('keeps a saved key after its final occurrence disappears, then reset restores its automatic value', async () => {
    const initial = (await updateOriginalDraft({ text, sourceHash, revision: 1, entities, style: 'selective' })).draft;
    const changed = (await updateOriginalDraft({ text, sourceHash, revision: 1, entities, style: 'selective', prior: initial,
      edit: { key: 'name_cn:张三', patch: { currentValue: '甲', locked: true }, confirmDuplicate: false } })).draft;
    const removed = (await updateOriginalDraft({ text, sourceHash, revision: 2, entities: entities.slice(1), style: 'selective', prior: changed })).draft;
    expect(removed.entries.find(entry => entry.key === 'name_cn:张三')).toMatchObject({ currentValue: '甲', occurrences: 0 });
    expect(projectOriginalDraftEntries({ draft: removed, text, entities: entities.slice(1) }).find(entry => entry.key === 'name_cn:张三')).toMatchObject({ currentValue: '甲', occurrences: 0 });
    const reset = (await updateOriginalDraft({ text, sourceHash, revision: 2, entities: entities.slice(1), style: 'selective', prior: removed, reset: true })).draft;
    expect(reset.entries.find(entry => entry.key === 'name_cn:张三')).toMatchObject({ currentValue: initial.entries[0].autoValue, locked: false, occurrences: 0 });
  });

  it('duplicate cancellation leaves both keys unchanged; confirmation retains canonical relation', async () => {
    const prior = (await updateOriginalDraft({ text, sourceHash, revision: 1, entities, style: 'custom' })).draft;
    const first = (await updateOriginalDraft({ text, sourceHash, revision: 1, entities, style: 'custom', prior,
      edit: { key: 'name_cn:张三', patch: { currentValue: '共同别名', locked: true }, confirmDuplicate: false } })).draft;
    const denied = await updateOriginalDraft({ text, sourceHash, revision: 1, entities, style: 'custom', prior: first,
      edit: { key: 'name_cn:张四', patch: { currentValue: '共同别名', locked: true }, confirmDuplicate: false } });
    expect(denied.duplicateRejected).toBe(true);
    expect(denied.draft.entries.find(entry => entry.key === 'name_cn:张四')?.currentValue).toBe(prior.entries[1].autoValue);
    const accepted = await updateOriginalDraft({ text, sourceHash, revision: 1, entities, style: 'custom', prior: first,
      edit: { key: 'name_cn:张四', patch: { currentValue: '共同别名', locked: true }, confirmDuplicate: true } });
    expect(accepted.draft.entries.find(entry => entry.key === 'name_cn:张四')?.canonicalKey).toBe('name_cn:张三');
  });
  it('recovers a zero-occurrence key through the native old-to-new document ID mapping', async () => {
    const saved = (await updateOriginalDraft({ text, sourceHash, revision: 4, entities: entities.slice(1), style: 'selective',
      prior: (await updateOriginalDraft({ text, sourceHash, revision: 3, entities, style: 'selective' })).draft })).draft;
    const native = { project: { importedPortable: { activePseudonymDrafts: { oldDocument: saved } } } };
    const rebound = rebindNativeImportedDraft(native, 'oldDocument', sourceHash, 0);
    expect(rebound?.entries.find(entry => entry.key === 'name_cn:张三')?.occurrences).toBe(0);
    expect(rebound?.revision).toBe(0);
    const again = { documentIdMap: { oldDocument: 'nextDocument' }, importedSnapshot: native };
    expect(currentOrImportedDraft(again, 'nextDocument', sourceHash, 2)?.entries.find(entry => entry.key === 'name_cn:张三')?.occurrences).toBe(0);
    expect(() => rebindNativeImportedDraft(native, 'oldDocument', '0'.repeat(64), 0)).toThrow('DRAFT_SOURCE_MISMATCH');
  });
  it('uses the same source type key for a Chinese review kind and the reference exporter', async () => {
    const kind = '姓名';
    const result = await updateOriginalDraft({ text, sourceHash, revision: 1,
      entities: [{ type: canonicalRuleEntityType(kind), text: '张三', startOffset: 0 }], style: 'custom' });
    expect(result.draft.entries.map(entry => entry.key)).toEqual(['name_cn:张三']);
  });
  it('requires one explicit original for a per-document shared pseudonym without changing project mapping rules', () => {
    const local = [{ token: '共同别名', original: '张三', entityType: '姓名', documentId: 'doc', start: 0, end: 2 },
      { token: '共同别名', original: '张四', entityType: '姓名', documentId: 'doc', start: 3, end: 5 }];
    const data = singleDocumentDraftMappingData([], local, local);
    const unchecked = parseRestorationMapping(data);
    expect(unchecked.ambiguities[0]?.originals).toEqual(['张三', '张四']);
    expect(() => restoreMarkdown(Buffer.from('共同别名'), unchecked)).toThrow('RESTORE_AMBIGUOUS_MAPPING');
    const selected = parseRestorationMapping(data, { choices: {共同别名:'张四'} });
    expect(selected.ambiguities).toEqual([]);
    expect(restoreMarkdown(Buffer.from('共同别名'), selected).output.toString()).toBe('张四');
  });
});
