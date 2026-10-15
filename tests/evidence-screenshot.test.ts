import {describe,expect,it} from 'vitest';
import {detectComplete} from '../packages/core/recognition-pipeline.ts';
import {applyDocumentRoute} from '../packages/core/document-route.ts';
import {selectEvidenceScene,isEvidenceChatText,applyEvidenceScene} from '../packages/core/evidence-screenshot.ts';
import {classifyReferenceDocumentDetail} from '../packages/core/reference-rules.ts';
import {freshPortableMarks} from '../packages/adapters/portable-draft.ts';
import type {DocumentPolicy} from '../packages/contracts/document-policy.ts';
import type {Anchor,Mark} from '../packages/contracts/index.ts';

const sceneCodes=(marks:ReturnType<typeof detectComplete>['marks'])=>marks.flatMap(m=>m.sources?.map(s=>s.code)??[]).filter(code=>code.startsWith('SCENE-'));
const detect=(text:string,format:'txt'|'docx'|'pdf'|'png'|'jpg'|'jpeg',configuration?:{documentType:'auto'|'general'|'contract'|'judgment'|'screenshot'})=>{
 const anchors:Anchor[]=[{kind:'text',start:0,end:text.length}];
 const result=detectComplete(text,anchors,[],{sourceFormat:format,configuration});
 return {...result,marks:applyDocumentRoute(text,anchors,result.marks,configuration,{suppressEvidenceScene:result.evidenceScene.controlled})};
};

describe('public 0.5.9 evidence screenshot scene contract',()=>{
 it('uses text and selected route, never image extension, as screenshot hint',()=>{
  const text='申请方 转账 收款方 __masked_id__';
  for(const format of ['png','jpg','jpeg'] as const){
   expect(sceneCodes(detect(text,format,{documentType:'auto'}).marks)).not.toContain('SCENE-receipt-standalone-wechat');
   expect(sceneCodes(detect(text,format,{documentType:'screenshot'}).marks)).toContain('SCENE-receipt-standalone-wechat');
  }
 });
 it('returns existing legal candidates without adding form or transaction scene candidates',()=>{
  const text='民事判决书\n原告 张三，被告 李四。本院认为，应判决如下。\n姓名：张三\n金额：1000元\n银行帐号：12345678';
  for(const format of ['pdf','png'] as const){
   const result=detect(text,format,{documentType:'auto'});
   expect(result.classification.type).toBe('judgment');
   expect(result.classification.confidence).toBeGreaterThanOrEqual(.75);
   expect(result.evidenceScene.mode).toBe('none');
   expect(sceneCodes(result.marks).some(code=>code.startsWith('SCENE-form-'))).toBe(false);
   expect(result.marks.some(m=>m.kind==='金额')).toBe(true);
  }
 });
 it('honors explicit legal and explicit screenshot routes in opposite directions',()=>{
  const text='姓名：张三\n金额：1000元\n银行帐号：12345678';
  expect(sceneCodes(detect(text,'pdf',{documentType:'contract'}).marks).some(code=>code.startsWith('SCENE-form-'))).toBe(false);
  expect(sceneCodes(detect(text,'pdf',{documentType:'screenshot'}).marks)).toContain('SCENE-form-bank_card');
 });
 it('uses the public router 0.75 automatic strategy threshold before the 0.5 legal gate',()=>{
  const text='姓名：张三\n金额：1000元\n银行帐号：12345678',scores=classifyReferenceDocumentDetail(text).scores;
  for(const confidence of [.49,.5,.74])expect(selectEvidenceScene(text,'pdf',{type:'judgment',confidence,scores}).mode).toBe('form');
  expect(selectEvidenceScene(text,'pdf',{type:'judgment',confidence:.75,scores}).mode).toBe('none');
  expect(selectEvidenceScene(text,'pdf',{type:'other',confidence:.49,scores},{documentType:'contract'}).mode).toBe('none');
  expect(selectEvidenceScene(text,'pdf',{type:'judgment',confidence:.98,scores},{documentType:'screenshot'}).mode).toBe('form');
 });
 it('ports automatic chat evidence and nickname extraction as a separate branch',()=>{
  const text='【客服】您好，您的账号ID 12345678 昵称：张小雨 微信转账信息';
  expect(isEvidenceChatText(text)).toBe(true);
  const result=detect(text,'png',{documentType:'auto'});
  expect(result.evidenceScene.mode).toBe('chat');
  // Source's earlier nickname branch wins same-kind overlap before account_nickname.
  expect(result.marks.some(m=>text.slice(m.start,m.end)==='张小雨'&&m.sources?.some(s=>s.code==='SCENE-chat-nickname'))).toBe(true);
  expect(sceneCodes(result.marks).some(code=>code.startsWith('SCENE-form-'))).toBe(false);
  // The static source also admits these noisy matches; they stay visible for human review.
  expect(result.marks.some(m=>m.kind==='机构'&&text.slice(m.start,m.end)==='客服')).toBe(true);
  expect(result.marks.some(m=>m.kind==='姓名'&&text.slice(m.start,m.end)==='转账信息')).toBe(true);
 });
 it('matches the public nickname closing brace and respects existing same-kind matches',()=>{
  const text='【腾讯云】您好，昵称：张小雨}';
  const found=detect(text,'png',{documentType:'auto'}).marks;
  expect(found.some(m=>text.slice(m.start,m.end)==='张小雨'&&m.sources?.some(s=>s.code==='SCENE-chat-nickname'))).toBe(true);
  const start=text.indexOf('张小雨'),seed:Mark={start,end:start+3,kind:'姓名',decision:'pending',sources:[{layer:'rules',code:'BASELINE-name'}]},anchors:Anchor[]=[{kind:'text',start:0,end:text.length}];
  const merged=applyEvidenceScene(text,anchors,[seed],{controlled:true,mode:'chat',explicitScreenshot:false});
  expect(merged.filter(m=>m.kind==='姓名'&&m.start===start)).toEqual([seed]);
 });
 it('removes a seeded person name contained in a seeded organization in chat mode',()=>{
  const text='【腾讯云】您好，张小雨有限公司，昵称：张小雨';
  const orgStart=text.indexOf('张小雨有限公司'),nameStart=text.lastIndexOf('张小雨');
  const seeds:Mark[]=[{start:orgStart,end:orgStart+7,kind:'机构',decision:'pending',sources:[{layer:'rules',code:'BASELINE-org'}]},{start:nameStart,end:nameStart+3,kind:'姓名',decision:'pending',sources:[{layer:'rules',code:'BASELINE-name'}]}];
  const actual=applyEvidenceScene(text,[{kind:'text',start:0,end:text.length}],seeds,{controlled:true,mode:'chat',explicitScreenshot:false});
  expect(actual.some(m=>m.kind==='姓名'&&m.start===nameStart)).toBe(false);
  expect(actual.some(m=>m.kind==='机构'&&m.start===orgStart)).toBe(true);
 });
 it('keeps the chat negative gate and legal early return ahead of text hints',()=>{
  const text='民事判决书 原告 被告 【腾讯云】您好，昵称：张小雨';
  expect(isEvidenceChatText(text)).toBe(false);
  const classification=classifyReferenceDocumentDetail(text,'判决书.pdf');
  expect(selectEvidenceScene(text,'pdf',classification,{documentType:'judgment'}).mode).toBe('none');
 });
 it('preserves TXT and Word scene rules and explicit screenshot route',()=>{
  const form='姓名：张三\n金额：1000元\n银行帐号：12345678';
  for(const format of ['txt','docx'] as const){
   expect(sceneCodes(detect(form,format,{documentType:'auto'}).marks)).toContain('SCENE-form-bank_card');
   expect(sceneCodes(detect('申请方 转账 收款方 __masked_id__',format,{documentType:'screenshot'}).marks)).toContain('SCENE-receipt-standalone-wechat');
  }
 });
 it('keeps candidates inside original object anchors',()=>{
  const text='【腾讯云】您好，昵称：张小雨';
  const split=text.indexOf('昵称');
  const anchors:Anchor[]=[{kind:'cell',row:1,column:1,start:0,end:split},{kind:'cell',row:2,column:1,start:split,end:text.length}];
  const result=detectComplete(text,anchors,[],{sourceFormat:'pdf'});
  expect(result.marks.every(m=>anchors.some(a=>a.start<=m.start&&m.end<=a.end))).toBe(true);
 });
 it('rebuilds portable fresh candidates with the resolved document route',()=>{
  const text='申请方 转账 收款方 __masked_id__',anchors:Anchor[]=[{kind:'text',start:0,end:text.length}];
  const policy=(documentType:'auto'|'screenshot')=>({configuration:{documentType}} as DocumentPolicy);
  expect(sceneCodes(freshPortableMarks(text,anchors,[],{},'png',policy('auto'),1))).not.toContain('SCENE-receipt-standalone-wechat');
  expect(sceneCodes(freshPortableMarks(text,anchors,[],{},'png',policy('screenshot'),1))).toContain('SCENE-receipt-standalone-wechat');
  expect(sceneCodes(freshPortableMarks(text,anchors,[],{},'txt',policy('screenshot'),0))).toContain('SCENE-receipt-standalone-wechat');
 });
 it('uses the public form postprocessor on real baseline amount overlap',()=>{
  const text='姓名：李四\n金额：1000元\n银行帐号：12345678\n合同金额：人民币1000元';
  const result=detect(text,'pdf',{documentType:'screenshot'});
  const tail=text.lastIndexOf('人民币1000元');
  expect(result.marks.filter(m=>m.kind==='金额'&&m.start>=tail).map(m=>text.slice(m.start,m.end))).toEqual(['人民币1000元']);
  expect(result.marks.find(m=>m.kind==='金额'&&m.start===tail)?.sources?.some(s=>s.code==='SCENE-form-contract_amount')).toBe(true);
 });
 it('limits public form pruning to fresh candidates and protects dictionary and reviewed slots',()=>{
  const text='姓名：李四\n金额：1000元\n银行帐号：12345678\n住所：北京市\n海淀区\n中关村路\n1号',anchors:Anchor[]=[{kind:'text',start:0,end:text.length}];
  const start=text.indexOf('北京市'),end=text.length,span={start,end,kind:'地址' as const};
  const automatic:Mark={...span,decision:'pending',sources:[{layer:'rules',code:'REF41-address_labeled_door',score:.95}]};
  const dictionary:Mark={...span,decision:'pending',sources:[{layer:'rules',code:'project-dictionary'}]};
  const reviewed:Mark={...span,decision:'redact',sources:[{layer:'manual',code:'human-mark'}]};
  const route={controlled:true,mode:'form' as const,explicitScreenshot:false};
  expect(applyEvidenceScene(text,anchors,[automatic],route).some(m=>m.kind==='地址'&&m.start===start)).toBe(false);
  expect(applyEvidenceScene(text,anchors,[dictionary],route).some(m=>m.kind==='地址'&&m.start===start)).toBe(true);
  expect(applyEvidenceScene(text,anchors,[reviewed],route).find(m=>m.kind==='地址'&&m.start===start)?.decision).toBe('redact');
  expect(applyEvidenceScene(text,anchors,[automatic],{controlled:false,mode:'none',explicitScreenshot:false})).toEqual([automatic]);
 });
 it('normalizes mobile and phone overlap and lets the later equal-score candidate win',()=>{
  const text='姓名 金额 银行帐号 ABCDEFGH',anchors:Anchor[]=[{kind:'text',start:0,end:text.length}],route={controlled:true,mode:'form' as const,explicitScreenshot:false};
  const first:Mark={start:0,end:3,kind:'机构',decision:'pending',sources:[{layer:'rules',code:'SOURCE-first',score:.8}]};
  const later:Mark={start:1,end:4,kind:'机构',decision:'pending',sources:[{layer:'rules',code:'SOURCE-later',score:.8}]};
  expect(applyEvidenceScene(text,anchors,[first,later],route).filter(m=>m.kind==='机构').map(m=>m.start)).toEqual([1]);
  const mobile:Mark={start:0,end:5,kind:'手机号',decision:'pending',sources:[{layer:'rules',code:'SOURCE-mobile',score:.8}]};
  const phone:Mark={start:1,end:7,kind:'固定电话',decision:'pending',sources:[{layer:'rules',code:'SCENE-form-phone',score:.8}]};
  expect(applyEvidenceScene(text,anchors,[mobile,phone],route).filter(m=>m.kind==='手机号'||m.kind==='固定电话').map(m=>m.kind)).toEqual(['固定电话']);
  const landline:Mark={...phone,sources:[{layer:'rules',code:'INT-phone',score:.8}]};
  expect(applyEvidenceScene(text,anchors,[mobile,landline],route).filter(m=>m.kind==='手机号'||m.kind==='固定电话').map(m=>m.kind)).toEqual(['手机号','固定电话']);
 });
});
