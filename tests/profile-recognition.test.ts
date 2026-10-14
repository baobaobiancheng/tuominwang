import {test} from 'vitest';
import assert from 'node:assert/strict';
import {defaultProfile} from '../packages/core/presets.ts';
import {profileReplacementPolicies,finalizeProfileReplacements} from '../packages/core/profile-recognition.ts';
import {applyReplacementPolicies} from '../packages/core/replacement-policies.ts';
import type {Mark,Anchor} from '../packages/contracts/index.ts';
test('source selective actions and official-name rules follow the actual object without changing manual exceptions',()=>{
 const profile=defaultProfile();profile.pseudonymTypeActions={name_cn:'mask'};
 assert.deepEqual(profileReplacementPolicies(profile,'docx').types,[]);
 const text='欧阳明张三',marks:Mark[]=[{start:0,end:3,kind:'姓名',decision:'pending',sources:[{layer:'rules',code:'OFFICIAL-recipient'}]},{start:3,end:5,kind:'姓名',decision:'pending'}],anchors:Anchor[]=[{kind:'object',object:'image-text',part:'word/media/p.png',start:0,end:3},{kind:'text',start:3,end:5}];
 const defaults=applyReplacementPolicies(text,marks,profileReplacementPolicies(profile,'docx')).marks;
 assert.equal(finalizeProfileReplacements(defaults,anchors,profile,'docx')[0].replacement?.mode,'reference-mask');
 assert.deepEqual(finalizeProfileReplacements(defaults,anchors,profile,'docx')[0].replacement,{mode:'reference-mask',variant:'official-name'});
 profile.docx.defaultMode='selective_pseudonym';
 const selective=applyReplacementPolicies(text,marks,profileReplacementPolicies(profile,'docx')).marks;
 assert.deepEqual(finalizeProfileReplacements(selective,anchors,profile,'docx').map(m=>m.replacement?.mode),['clear','full']);
 const manual:Mark={...selective[0],replacementOrigin:'manual',replacement:{mode:'full'}};
 assert.deepEqual(finalizeProfileReplacements([manual],anchors,profile,'docx'),[manual]);
 assert.deepEqual(profileReplacementPolicies(profile,'docx',false,'full_star').types,[]);
 profile.pseudonymTypeActions={id_card:'full_star',passport_no:'partial_star',uscc:'mask',case_number:'full_star'};
 const family=new Map(profileReplacementPolicies(profile,'docx').types.map(t=>[t.kind,t.rule.mode]));
 assert.equal(family.get('护照号'),'reference-mask');assert.equal(family.get('国际身份证号'),'full');assert.equal(family.get('社保号'),'full');assert.equal(family.get('税号'),'full');assert.equal(family.get('雇主识别号'),'full');assert.equal(family.get('公文编号'),'full');
});

test('an official-name default exception does not overwrite source selective partial-star or explicit per-value policy',()=>{const profile=defaultProfile();profile.docx.defaultMode='selective_pseudonym';profile.pseudonymTypeActions={name_cn:'partial_star'};const text='张三丰',mark:Mark={start:0,end:text.length,kind:'姓名',decision:'redact',sources:[{layer:'rules',code:'OFFICIAL-signature'}]},anchors:Anchor[]=[{kind:'text',start:0,end:text.length}],selected=applyReplacementPolicies(text,[mark],profileReplacementPolicies(profile,'docx')).marks;assert.deepEqual(finalizeProfileReplacements(selected,anchors,profile,'docx')[0].replacement,{mode:'reference-mask',variant:'default'});for(const replacementOrigin of ['value','manual'] as const)assert.deepEqual(finalizeProfileReplacements([{...selected[0],replacementOrigin}],anchors,profile,'docx')[0].replacement,{mode:'reference-mask',variant:'default'});});
