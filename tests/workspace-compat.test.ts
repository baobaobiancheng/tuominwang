import{it,expect}from'vitest';import{randomUUID}from'node:crypto';import{nativeToReference,writeCompatibleWorkspace,recoverNativeExtension,migrateCompatibleWorkspace,workspaceReviewProfile}from'../packages/core/workspace-compat.ts';import{readPortableWorkspace}from'../packages/core/workspace-portable.ts';import{readNativeOrReferencePortable,type NativePortable}from'../packages/core/native-portable.ts';import{hash}from'../packages/adapters/storage.ts';
import { defaultProfile } from '../packages/core/presets.ts';
import { draftSourceHash, originalDraftFromReferenceReview, updateOriginalDraft } from '../packages/core/original-pseudonym-draft.ts';
function fixture(){const doc=randomUUID(),content='合成客户甲 13800138000',source=Buffer.from(content),snapshot:NativePortable={format:'tuominwang-workspace',schemaVersion:1,project:{name:'完整来源',dictionary:[],dictionaryRevision:0,presetPolicy:null,presetRevision:0},mappings:[],documents:[{id:doc,name:'合成.txt',format:'txt',content,contentHash:hash(content),sourceEntry:`sources/${doc}/original.txt`,sourceHash:hash(source),marks:[{start:0,end:5,kind:'自定义',rawEntityType:'客户代码',decision:'redact',sources:[{layer:'manual',code:'human-mark'}]}],revision:1,state:'review',anchors:[{kind:'text',start:0,end:content.length}],coverage:[{id:'text',status:'complete'}],pages:[],pageReview:null,recognition:{},nerEnabled:false}],snapshots:[]};return{snapshot,sources:new Map([[snapshot.documents[0].sourceEntry,source]])};}
it('all source codecs carry complete native state/assets and reopen without trusting previous review approval',async()=>{const{snapshot,sources}=fixture();for(const format of ['legacy-zip','secure-v2','secure-v3']as const){const bytes=await writeCompatibleWorkspace(snapshot,sources,'synthetic-project',format,'synthetic-transfer-password'),reference=await readPortableWorkspace(bytes,{password:'synthetic-transfer-password'});expect(reference.snapshot.documents[0].fileKind).toBe('markdown');expect(reference.snapshot.documents[0].convertedOriginalFormat).toBe('txt');const native=await readNativeOrReferencePortable(bytes,{password:'synthetic-transfer-password'});expect(native.kind).toBe('native');if(native.kind!=='native')throw Error('wrong');expect(native.snapshot).toEqual(snapshot);expect(native.sources).toEqual(sources);expect(workspaceReviewProfile(reference).corrections[0]).toMatchObject({pattern:'合成客户甲',entityType:'客户代码',kind:'forceDetect',origin:'imported'});}},30_000);
it('V1→V2→V3 transfer migration preserves every source and review collection and fails wrong passwords/tampering',async()=>{const{snapshot,sources}=fixture(),v1=await writeCompatibleWorkspace(snapshot,sources,'synthetic-project','legacy-zip','unused'),v2=await migrateCompatibleWorkspace(v1,undefined,'secure-v2','test-transfer-password'),v3=await migrateCompatibleWorkspace(v2,'test-transfer-password','secure-v3','second-transfer-password');expect((await readNativeOrReferencePortable(v3,{password:'second-transfer-password'})).kind).toBe('native');await expect(readNativeOrReferencePortable(v3,{password:'wrong-password'})).rejects.toThrow();const raw=await readPortableWorkspace(v1),extension=raw.snapshot.tuominwangNative;extension.assets[0].base64=Buffer.from('tampered').toString('base64');expect(()=>recoverNativeExtension(raw)).toThrow('PORTABLE_NATIVE_EXTENSION_INVALID');});
it('source profile honors high-risk filtering, manual override, hidden-by-type, explicit skip and pseudonym conflicts',()=>{const{snapshot,sources}=fixture(),projected=nativeToReference(snapshot,sources,'synthetic-project'),d=projected.snapshot.documents[0];d.review.entities=[{id:'auto-short',text:'甲',type:'name_cn',normalizedText:'甲',deleted:false},{id:'manual-short',text:'乙',type:'客户A',normalizedText:'乙',userAdded:true},{id:'hidden',text:'不应沿用',type:'org_name',hiddenByType:true},{id:'skip',text:'完整保留',type:'客户B',deleted:true}];d.review.pseudonymStyle='custom';d.review.pseudonymEntries=[{key:'客户A:乙',autoValue:'【乙1】',currentValue:'【乙2】',action:'pseudonym'},{key:'客户A:乙',autoValue:'【乙3】',currentValue:'【乙3】',action:'pseudonym'}];const profile=workspaceReviewProfile({...projected,format:'legacy-zip',manifest:{},archiveEntries:new Map()});expect(profile.corrections.map(c=>c.pattern).sort()).toEqual(['乙','完整保留','合成客户甲'].sort());expect(profile.conflicts[0]).toMatchObject({choices:['【乙2】','【乙3】']});expect(profile.pseudonyms.reservedTokens).toEqual(expect.arrayContaining(['【乙1】','【乙2】','【乙3】']));});

it('source snapshot policy applies all profile fields, source legacy migrations and per-route active rules without manufacturing party slots',async()=>{
 const {referenceWorkspacePolicy}=await import('../packages/core/workspace-compat.ts'),{defaultProfile}=await import('../packages/core/presets.ts'),{applyActiveRulesetCandidates}=await import('../packages/core/user-memory-rules.ts');const profile:any=defaultProfile();profile.enabledEntityTypeIds=['case_number'];delete profile.certNoPreferenceRecorded;profile.docx={defaultMode:'selective_pseudonym',removeHeaderFooter:true,removeImages:true,commentHandlingMode:'anonymize',exportMarkdown:true};profile.pdf={defaultMode:'custom_pseudonym',maskStyle:'purple',exportPdfAsDocx:true,exportMarkdown:true};profile.image={defaultMode:'selective_pseudonym',maskStyle:'white',exportMarkdown:true};profile.markdown={defaultMode:'default_pseudonym'};profile.batch.docxDefaultMode='selective_pseudonym';profile.pseudonymTemplate={kind:'party_slots',slots:[{id:'a',label:'甲'},{id:'b',label:'乙'}]};profile.pseudonymTypeActions={case_number:'partial_star'};const raw:any={snapshot:{profileSnapshot:profile,rulesetSnapshot:{applicability:{mode:'materialTypes',materialRouteKeys:['contract']},entries:[{entityType:'客户代码',pattern:'合成客户',kind:'forceDetect',enabled:true}]}}},inherited:any={profile:{corrections:[],pseudonyms:{entries:[],reservedTokens:[]},conflicts:[]}};const policy=referenceWorkspacePolicy(raw,inherited);expect(policy.profile!.settings.docx).toEqual({...profile.docx,defaultMode:'default_star'});expect(policy.profile!.settings.pdf).toEqual(profile.pdf);expect(policy.profile!.settings.image).toEqual(profile.image);expect(policy.profile!.settings.markdown.defaultMode).toBe('custom_pseudonym');expect(policy.profile!.settings.enabledEntityTypeIds).toEqual(['case_number','cert_no']);expect(policy.profile!.settings.pseudonymTemplate).toEqual({kind:'standard'});expect(policy.profile!.settings.pseudonymTypeActions).toEqual(profile.pseudonymTypeActions);expect(policy.ruleset!.settings.entries[0].materialRouteKeys).toEqual(['contract']);expect(applyActiveRulesetCandidates('合成客户',[],[],policy.ruleset!.settings,'general')).toEqual([]);expect(applyActiveRulesetCandidates('合成客户',[],[],policy.ruleset!.settings,'contract')[0].rawEntityType).toBe('客户代码');expect(profile.pseudonymTemplate.kind).toBe('party_slots');
});

it('Markdown and MARKDOWN extension state exactly matches source sidecar in all three codecs',async()=>{for(const name of ['source.markdown','source.MARKDOWN']){const{snapshot,sources}=fixture();snapshot.documents[0].name=name;snapshot.documents[0].format='md';snapshot.documents[0].content='合成客户甲 13800138000';for(const format of ['legacy-zip','secure-v2','secure-v3']as const){const projected=nativeToReference(snapshot,sources,'markdown-extension');expect(projected.snapshot.documents[0].sourceEntry.endsWith('/source.markdown')).toBe(true);expect(projected.snapshot.documents[0].exportState.sourceExtension).toBe('.markdown');expect(projected.snapshot.documents[0].exportState.sourceExtension).toBe(projected.snapshot.documents[0].detection.markdownSourceSidecar.originalExtension);const output=await writeCompatibleWorkspace(snapshot,sources,'markdown-extension',format,'synthetic-extension-password'),opened=await readPortableWorkspace(output,{password:'synthetic-extension-password'});expect(opened.snapshot.documents[0].exportState.sourceExtension).toBe(opened.snapshot.documents[0].detection.markdownSourceSidecar.originalExtension);}}},30_000);

it('source-compatible projection retains selected document and stable workspace creation time',async()=>{
 const {snapshot,sources}=fixture(),first=snapshot.documents[0],secondId=randomUUID(),second={...first,id:secondId,name:'第二份.txt',sourceEntry:`sources/${secondId}/original.txt`};
 snapshot.documents.push(second);sources.set(second.sourceEntry,sources.get(first.sourceEntry)!);
 snapshot.project.createdAt='2020-01-01T00:00:00Z';snapshot.project.activeDocumentId=secondId;
 const projected=nativeToReference(snapshot,sources,'synthetic-project');
 expect(projected.snapshot.createdAt).toBe('2020-01-01T00:00:00Z');
 expect(projected.snapshot.activeDocumentId).toBe(secondId);
 const bytes=await writeCompatibleWorkspace(snapshot,sources,'synthetic-project','legacy-zip','unused');
 const reopened=await readPortableWorkspace(bytes);
 expect(reopened.snapshot.createdAt).toBe('2020-01-01T00:00:00Z');
 expect(reopened.snapshot.activeDocumentId).toBe(secondId);
});

it('empty saved draft type actions fall back through document rules to profile actions',async()=>{
 const {snapshot,sources}=fixture(),document=snapshot.documents[0] as any,profile=defaultProfile();
 profile.pseudonymTypeActions={phone:'full_star',email:'partial_star'};
 snapshot.project.presetPolicy={profile:{settings:profile}} as any;
 document.documentPolicy={configuration:{pseudonymRules:{phone:'mask'}}};
 const draft=(await updateOriginalDraft({text:document.content,sourceHash:draftSourceHash(document.content),revision:document.revision,entities:[],style:'selective'})).draft;
 draft.typeActions={};
 (snapshot.project as any).importedPortable={activePseudonymDrafts:{[document.id]:draft}};
 const projected=nativeToReference(snapshot,sources,'empty-type-actions').snapshot.documents[0];
 expect(projected.review.pseudonymTypeActions).toEqual({phone:'mask'});
});

it('document profile replaces project profile when no document rule map is present',async()=>{
 const {snapshot,sources}=fixture(),document=snapshot.documents[0] as any,projectProfile=defaultProfile(),documentProfile=defaultProfile();
 projectProfile.pseudonymTypeActions={phone:'full_star',email:'partial_star'};
 documentProfile.pseudonymTypeActions={phone:'mask'};
 snapshot.project.presetPolicy={profile:{settings:projectProfile}} as any;
 document.documentPolicy={profile:documentProfile,configuration:{}};
 const draft=(await updateOriginalDraft({text:document.content,sourceHash:draftSourceHash(document.content),revision:document.revision,entities:[],style:'selective'})).draft;
 draft.typeActions={};
 (snapshot.project as any).importedPortable={activePseudonymDrafts:{[document.id]:draft}};
 const projected=nativeToReference(snapshot,sources,'document-profile-wins').snapshot.documents[0];
 expect(projected.review.pseudonymTypeActions).toEqual({phone:'mask'});
});

it('canonicalizes alias actions in native draft archive projection',async()=>{
 const {snapshot,sources}=fixture(),document=snapshot.documents[0] as any;
 document.marks[0].rawEntityType='signature';
 const draft=(await updateOriginalDraft({text:document.content,sourceHash:draftSourceHash(document.content),revision:document.revision,
  entities:[{type:'signature',text:document.content.slice(0,5),startOffset:0}],style:'selective',typeActions:{signature:'full_star'}})).draft;
 // Emulate an older/imported saved draft whose valid action map still uses the source alias.
 draft.typeActions={signature:'full_star'};
 (snapshot.project as any).importedPortable={activePseudonymDrafts:{[document.id]:draft}};
 const projected=nativeToReference(snapshot,sources,'alias-actions-archive').snapshot.documents[0];
 expect(projected.review.pseudonymTypeActions).toEqual({other:'full_star'});
 expect(projected.review.pseudonymEntries[0]).toMatchObject({action:'full_star'});
});

it('archives explicit selective reset with pseudonym entries and no configured bulk action',async()=>{
 const {snapshot,sources}=fixture(),document=snapshot.documents[0] as any;
 document.marks[0].rawEntityType='phone';
 document.documentPolicy={configuration:{pseudonymRules:{phone:'full_star'}}};
 const initial=(await updateOriginalDraft({text:document.content,sourceHash:draftSourceHash(document.content),revision:document.revision,
  entities:[{type:'phone',text:document.content.slice(0,5),startOffset:0}],style:'selective',typeActions:{phone:'full_star'}})).draft;
 const reset=(await updateOriginalDraft({text:document.content,sourceHash:draftSourceHash(document.content),revision:document.revision,
  entities:[{type:'phone',text:document.content.slice(0,5),startOffset:0}],style:'selective',prior:initial,typeActions:initial.typeActions,reset:true})).draft;
 (snapshot.project as any).importedPortable={activePseudonymDrafts:{[document.id]:reset}};
 const projected=nativeToReference(snapshot,sources,'explicit-reset-archive').snapshot.documents[0];
 expect(projected.review.pseudonymTypeActions).toEqual({});
 expect(projected.review.pseudonymEntries[0]).toMatchObject({action:'pseudonym'});
 // Reopen only the reference review fields, without the native portable extension.
 const referenceOnly=originalDraftFromReferenceReview(projected.review,draftSourceHash(document.content),document.revision,{phone:'full_star'});
 expect(referenceOnly).toMatchObject({typeActions:{},typeActionsReset:true});
 const reopened=await updateOriginalDraft({text:document.content,sourceHash:draftSourceHash(document.content),revision:document.revision,
  entities:[{type:'phone',text:document.content.slice(0,5),startOffset:0}],style:'selective',prior:referenceOnly!,typeActions:referenceOnly!.typeActions});
 expect(reopened.draft).toMatchObject({typeActions:{},typeActionsReset:true});
});

it('keeps a per-entry mask in native archive entries after its mark is saved',async()=>{
 const {snapshot,sources}=fixture(),document=snapshot.documents[0] as any;
 document.marks[0].rawEntityType='phone';
 document.marks[0].replacement={mode:'clear'};
 const initial=(await updateOriginalDraft({text:document.content,sourceHash:draftSourceHash(document.content),revision:document.revision,
  entities:[{type:'phone',text:document.content.slice(0,5),startOffset:0}],style:'selective'})).draft;
 const masked=(await updateOriginalDraft({text:document.content,sourceHash:draftSourceHash(document.content),revision:document.revision,
  entities:[{type:'phone',text:document.content.slice(0,5),startOffset:0}],style:'selective',prior:initial,
  edit:{key:initial.entries[0].key,patch:{action:'mask'},confirmDuplicate:false}})).draft;
 (snapshot.project as any).importedPortable={activePseudonymDrafts:{[document.id]:masked}};
 const projected=nativeToReference(snapshot,sources,'entry-mask-archive').snapshot.documents[0];
 expect(projected.review.pseudonymEntries[0]).toMatchObject({action:'mask'});
});
