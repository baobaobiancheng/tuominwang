import { describe, expect, it } from 'vitest';
import { canonicalizeOriginalTypeActions, currentOrImportedDraft, draftSourceHash, originalDraftFromReferenceReview, originalDraftTypeActionControls, projectDraftEditToMarks, projectOriginalDraftEntries, readActiveDraft, rebindNativeImportedDraft, updateOriginalDraft } from '../packages/core/original-pseudonym-draft.ts';
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
  it('applies an explicit type action to all retained same-type keys and preserves values and locks', async () => {
    const initial=(await updateOriginalDraft({text,sourceHash,revision:1,entities,style:'selective'})).draft;
    const locked=(await updateOriginalDraft({text,sourceHash,revision:1,entities,style:'selective',prior:initial,
      edit:{key:'name_cn:张三',patch:{currentValue:'自定义甲',locked:true},confirmDuplicate:false}})).draft;
    const withRetained=(await updateOriginalDraft({text,sourceHash,revision:2,entities:entities.slice(1),style:'selective',prior:locked})).draft;
    const updated=(await updateOriginalDraft({text,sourceHash,revision:2,entities:entities.slice(1),style:'selective',prior:withRetained,
      typeAction:{entityType:'name_cn',action:'partial_star'}})).draft;
    expect(updated.typeActions.name_cn).toBe('partial_star');
    expect(updated.entries.find(entry=>entry.key==='name_cn:张三')).toMatchObject({action:'partial_star',currentValue:'自定义甲',locked:true,occurrences:0});
    expect(updated.entries.find(entry=>entry.key==='name_cn:张四')).toMatchObject({action:'partial_star'});
  });
  it('rejects non-pseudonym actions outside selective mode and projects only explicit selective actions', async () => {
    await expect(updateOriginalDraft({text,sourceHash,revision:1,entities,style:'custom',typeAction:{entityType:'name_cn',action:'full_star'}})).rejects.toThrow('DRAFT_TYPE_ACTION_REQUIRES_SELECTIVE');
    await expect(updateOriginalDraft({text,sourceHash,revision:1,entities,style:'custom',edit:{key:'name_cn:张三',patch:{action:'full_star'},confirmDuplicate:false}})).rejects.toThrow('DRAFT_ACTION_REQUIRES_SELECTIVE');
    const selective=(await updateOriginalDraft({text,sourceHash,revision:1,entities,style:'selective',typeAction:{entityType:'name_cn',action:'full_star'}})).draft;
    const marks:any[]=[
      {start:0,end:2,kind:'姓名',decision:'redact',replacement:{mode:'custom',value:'旧值'}},
      {start:3,end:5,kind:'姓名',decision:'redact',replacement:{mode:'custom',value:'旧值'}},
      {start:0,end:2,kind:'姓名',decision:'ignore',replacement:{mode:'custom',value:'保留原输出'}},
    ];
    const markEntities=[entities[0],entities[1],{...entities[0],deleted:true}];
    const keys=new Set(selective.entries.map(entry=>entry.key));
    const projected=projectDraftEditToMarks({draft:selective,entities:markEntities,marks,targetKeys:keys});
    expect(projected.slice(0,2).map(mark=>mark.replacement?.mode)).toEqual(['full','full']);
    expect(projected[2]).toEqual(marks[2]);
    const customDraft={...selective,style:'custom' as const};
    expect(projectDraftEditToMarks({draft:customDraft,entities:markEntities,marks,targetKeys:keys}).slice(0,2).map(mark=>mark.replacement?.mode==='custom'?mark.replacement.value:null)).toEqual(selective.entries.map(entry=>entry.currentValue));
  });
  it('renders one selected type-action control for renderer-equivalent raw aliases', async () => {
    const aliases=[{type:'signature',text:'张三',startOffset:0},{type:'handwriting',text:'张四',startOffset:3}];
    const updated=(await updateOriginalDraft({text,sourceHash,revision:1,entities:aliases,style:'selective',typeAction:{entityType:'signature',action:'full_star'}})).draft;
    expect(updated.entries.map(entry=>entry.entityType)).toEqual(['other','other']);
    expect(updated.typeActions.other).toBe('full_star');
    expect(originalDraftTypeActionControls(updated)).toEqual([{entityType:'other',action:'full_star'}]);
  });
  it('canonicalizes configured alias actions using source insertion-order collision precedence', async () => {
    const aliases=[{type:'signature',text:'张三',startOffset:0},{type:'handwriting',text:'张四',startOffset:3}];
    const configured=await updateOriginalDraft({text,sourceHash,revision:1,entities:aliases,style:'selective',typeActions:{signature:'full_star'}});
    expect(configured.draft.typeActions).toEqual({other:'full_star'});
    expect(configured.draft.entries.map(entry=>entry.action)).toEqual(['full_star','full_star']);
    expect(originalDraftTypeActionControls(configured.draft)).toEqual([{entityType:'other',action:'full_star'}]);
    const first={signature:'full_star',handwriting:'partial_star'}, second={handwriting:'partial_star',signature:'full_star'};
    const a=await updateOriginalDraft({text,sourceHash,revision:1,entities:aliases,style:'selective',typeActions:first});
    const b=await updateOriginalDraft({text,sourceHash,revision:1,entities:aliases,style:'selective',typeActions:second});
    expect(a.draft.typeActions).toEqual({other:'partial_star'});
    expect(b.draft.typeActions).toEqual({other:'full_star'});
  });
  it('keeps explicit selective reset empty across reopen and sanitizes legacy action values', async () => {
    const configured=(await updateOriginalDraft({text,sourceHash,revision:1,entities,style:'selective',typeActions:{name_cn:'full_star'}})).draft;
    const reset=(await updateOriginalDraft({text,sourceHash,revision:1,entities,style:'selective',prior:configured,typeActions:configured.typeActions,reset:true})).draft;
    expect(reset).toMatchObject({typeActions:{},typeActionsReset:true});
    expect(reset.entries.every(entry=>entry.action==='pseudonym')).toBe(true);
    const portable={activePseudonymDrafts:{doc:reset}};
    const reopened=readActiveDraft(portable,'doc')!;
    const again=(await updateOriginalDraft({text,sourceHash,revision:1,entities,style:'selective',prior:reopened,typeActions:reopened.typeActions})).draft;
    expect(again).toMatchObject({typeActions:{},typeActionsReset:true});
    expect(again.entries.every(entry=>entry.action==='pseudonym')).toBe(true);
    const legacy={activePseudonymDrafts:{doc:{...reset,typeActions:{name_cn:'bogus'},entries:reset.entries.map(entry=>({...entry,action:'bogus'}))}}};
    const sanitized=readActiveDraft(legacy,'doc')!;
    expect(sanitized.typeActions).toEqual({});
    expect(sanitized.entries.every(entry=>entry.action==='pseudonym')).toBe(true);
    expect(originalDraftTypeActionControls(sanitized)[0]?.action).toBe('pseudonym');
  });
  it('rejects array type-action state instead of injecting its indexed values as bulk actions', async () => {
    expect(canonicalizeOriginalTypeActions(['full_star'] as unknown as Record<string, string>)).toEqual({});
    const malformed={activePseudonymDrafts:{doc:{schemaVersion:1,sourceHash,revision:1,style:'selective',typeActions:['full_star'],entries:entities.map(entity=>({
      key:`${entity.type}:${entity.text}`,entityType:entity.type,normalized:entity.text,autoValue:'匿名',currentValue:'匿名',locked:false,occurrences:1,action:'pseudonym',
    }))}}};
    expect(readActiveDraft(malformed,'doc')).toBeUndefined();
    const recovered=originalDraftFromReferenceReview({pseudonymStyle:'selective',pseudonymTypeActions:['full_star'] as unknown as Record<string,string>,pseudonymEntries:[]},sourceHash,1);
    expect(recovered?.typeActions).toEqual({});
    expect(originalDraftTypeActionControls({entries:[{entityType:'other'}],typeActions:recovered?.typeActions??{}})).toEqual([{entityType:'other',action:'pseudonym'}]);
  });
  it('preserves a per-entry mask through draft rebuild and reference-only reset recovery', async () => {
    const phone=[{type:'phone',text:'张三',startOffset:0}];
    const initial=(await updateOriginalDraft({text,sourceHash,revision:1,entities:phone,style:'selective'})).draft;
    const masked=(await updateOriginalDraft({text,sourceHash,revision:1,entities:phone,style:'selective',prior:initial,
      edit:{key:'phone:张三',patch:{action:'mask'},confirmDuplicate:false}})).draft;
    const reread=(await updateOriginalDraft({text,sourceHash,revision:1,entities:phone,style:'selective',prior:masked,typeActions:masked.typeActions})).draft;
    expect(reread.entries[0].action).toBe('mask');
    expect(projectOriginalDraftEntries({draft:reread,text,entities:phone})[0].action).toBe('mask');
    const referenceDraft=originalDraftFromReferenceReview({pseudonymStyle:'selective',pseudonymTypeActions:{},pseudonymEntries:[{
      key:'phone:张三',autoValue:masked.entries[0].autoValue,currentValue:masked.entries[0].currentValue,action:'pseudonym',
    }]},sourceHash,1,{phone:'full_star'});
    expect(referenceDraft).toMatchObject({typeActions:{},typeActionsReset:true});
    const reopened=await updateOriginalDraft({text,sourceHash,revision:1,entities:phone,style:'selective',prior:referenceDraft!,typeActions:referenceDraft!.typeActions});
    expect(reopened.draft).toMatchObject({typeActions:{},typeActionsReset:true});
  });
  it('lets an explicit type-wide action replace same-type masks while keeping other masks and custom/reset semantics', async () => {
    const mixed=[{type:'phone',text:'张三',startOffset:0},{type:'email',text:'张四',startOffset:3}];
    let draft=(await updateOriginalDraft({text,sourceHash,revision:1,entities:mixed,style:'selective'})).draft;
    for (const entry of draft.entries) draft=(await updateOriginalDraft({text,sourceHash,revision:1,entities:mixed,style:'selective',prior:draft,
      edit:{key:entry.key,patch:{action:'mask'},confirmDuplicate:false}})).draft;
    const changed=(await updateOriginalDraft({text,sourceHash,revision:1,entities:mixed,style:'selective',prior:draft,
      typeAction:{entityType:'phone',action:'full_star'}})).draft;
    expect(changed.typeActions.phone).toBe('full_star');
    expect(changed.entries.map(entry=>entry.action)).toEqual(['full_star','mask']);
    const marks:any[]=[{start:0,end:2,kind:'手机号',decision:'redact'},{start:3,end:5,kind:'邮箱',decision:'redact'}];
    const projected=projectDraftEditToMarks({draft:changed,entities:mixed,marks,targetKeys:new Set(changed.entries.map(entry=>entry.key))});
    expect(projected.map(mark=>mark.replacement?.mode)).toEqual(['full','clear']);
    expect(projectOriginalDraftEntries({draft:changed,text,entities:mixed}).map(entry=>entry.action)).toEqual(['full_star','mask']);
    const bulkPseudo=(await updateOriginalDraft({text,sourceHash,revision:1,entities:mixed,style:'selective',prior:draft,
      typeAction:{entityType:'phone',action:'pseudonym'}})).draft;
    expect(bulkPseudo.entries.map(entry=>entry.action)).toEqual(['pseudonym','mask']);
    expect(projectDraftEditToMarks({draft:bulkPseudo,entities:mixed,marks,targetKeys:new Set(bulkPseudo.entries.map(entry=>entry.key))}).map(mark=>mark.replacement?.mode)).toEqual(['custom','clear']);
    expect(projectOriginalDraftEntries({draft:bulkPseudo,text,entities:mixed}).map(entry=>entry.action)).toEqual(['pseudonym','mask']);
    const pseudo=(await updateOriginalDraft({text,sourceHash,revision:1,entities:mixed,style:'selective',prior:changed,
      edit:{key:'email:张四',patch:{action:'pseudonym'},confirmDuplicate:false}})).draft;
    expect((await updateOriginalDraft({text,sourceHash,revision:1,entities:mixed,style:'selective',prior:pseudo,typeActions:pseudo.typeActions})).draft.entries[1].action).toBe('pseudonym');
    const custom=(await updateOriginalDraft({text,sourceHash,revision:1,entities:mixed.slice(1),style:'selective',prior:draft})).draft;
    const customMode=(await updateOriginalDraft({text,sourceHash,revision:1,entities:mixed.slice(1),style:'custom',prior:custom})).draft;
    expect(customMode.entries[0].action).toBeUndefined();
    expect(projectOriginalDraftEntries({draft:{...customMode,entries:[{...customMode.entries[0],action:'mask'}]},text,entities:mixed.slice(1)} )[0].action).toBeUndefined();
    const reset=(await updateOriginalDraft({text,sourceHash,revision:1,entities:mixed,style:'selective',prior:changed,typeActions:changed.typeActions,reset:true})).draft;
    expect(reset.entries.every(entry=>entry.action==='pseudonym')).toBe(true);
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
