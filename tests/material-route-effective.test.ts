import {test} from 'vitest';
import assert from 'node:assert/strict';
import {detectComplete} from '../packages/core/recognition-pipeline.ts';
import {applyDocumentRoute} from '../packages/core/document-route.ts';
import {contextualDocumentMarks,contextualDocumentType} from '../packages/adapters/recognition-context.ts';
const has=(marks:any[],code:string)=>marks.some(m=>m.sources?.some((s:any)=>s.code===code));
test('explicit general suppresses auto official-letter reference candidate without changing classification',()=>{
 const text='签发人张三',anchors=[{kind:'text' as const,start:0,end:text.length}];
 const automatic=detectComplete(text,anchors,[],{filename:'律师函.docx'});
 assert.equal(automatic.classification.type,'official_letter');assert.ok(has(automatic.marks,'OFFICIAL-signer'));
 const selected=detectComplete(text,anchors,[],{filename:'律师函.docx',configuration:{documentType:'general'}});
 assert.equal(selected.classification.type,'official_letter');
 assert.ok(!has(applyDocumentRoute(text,anchors,selected.marks,{documentType:'general'}),'OFFICIAL-signer'));
});
test('explicit official-letter activates its reference candidate despite other auto classification',()=>{
 const text='兹证明张三先生，本材料仅作合成路由测试。',anchors=[{kind:'text' as const,start:0,end:text.length}];
 const selected=detectComplete(text,anchors,[],{configuration:{documentType:'official_letter'}});
 assert.equal(selected.classification.type,'other');assert.ok(has(selected.marks,'OFFICIAL-cert-subject'));
});
test('disclosure uses contract route in legacy contextual fragment processing',async()=>{
 const text='1.张三丰，男，代理人。',anchors=[{kind:'text' as const,start:0,end:text.length}],configuration={referenceStrategy:'legacy' as const,fragmentRecomposer:true,documentType:'disclosure' as const};
 const effective=contextualDocumentType('other',configuration);
 assert.equal(effective,'contract');
 const marks=await contextualDocumentMarks(Buffer.from(text),text,anchors,[],'txt',[],{configuration,documentType:effective});
 assert.ok(marks.some(m=>text.slice(m.start,m.end)==='张三丰'&&has([m],'fragment_recomposer')));
});
