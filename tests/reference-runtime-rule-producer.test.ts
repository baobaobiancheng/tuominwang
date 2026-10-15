import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {automaticRuntimeRules} from '../packages/core/reference-runtime-rule-producer.ts';
import {runtimeWhitelistCandidates} from '../packages/core/runtime-rule-update.ts';
import {referenceDetectedMask} from '../packages/core/reference-detected-mask.ts';
import type {ReviewFeedbackEntity} from '../packages/core/reference-review-feedback.ts';
const e=(id:string,text='张三',type='name_cn',startOffset=0):ReviewFeedbackEntity=>({id,text,type,startOffset,endOffset:startOffset+text.length});
describe('automatic runtime rule producers',()=>{
 it('actual additions only; spot, edits, hidden/no-op and non-add producer never inject',()=>{
  expect(automaticRuntimeRules({producer:'manual-add',before:[],after:[e('new')]})).toEqual([{entityType:'name_cn',pattern:'张三'}]);
  for(const producer of ['single-delete','tree-delete','type-hide'] as const)expect(automaticRuntimeRules({producer,before:[e('old')],after:[e('new')]})).toEqual([]);
  expect(automaticRuntimeRules({producer:'manual-add',before:[e('old')],after:[{...e('old'),text:'李四'}]})).toEqual([]);
  expect(automaticRuntimeRules({producer:'manual-add',before:[e('old')],after:[e('new')]})).toEqual([]);
  expect(automaticRuntimeRules({producer:'audit-add',before:[],after:[{...e('new'),deleted:true}]})).toEqual([]);
  expect(automaticRuntimeRules({producer:'manual-add',before:[],after:[e('new')],scope:'spot'})).toEqual([]);
 });
 it('arbitrary raw types and source literal variants preserve exact mask algorithms',()=>{
  const rules=automaticRuntimeRules({producer:'one-click-add',before:[],after:[e('1','甲公司','org_name'),e('2','甲公司','org_name',8),{...e('3','甲公司','自定义',16),rawEntityType:'__proto__'},e('4','北京市朝阳区合成路88号','address',24)]});
  expect(rules.map(r=>r.entityType)).toEqual(['org_name','__proto__','address']);const text='甲公司 甲公司 北京市朝阳区合成路88号',marks=runtimeWhitelistCandidates(text,[],[],rules);expect(marks.some(m=>m.rawEntityType==='__proto__')).toBe(true);for(const m of marks){const masked=referenceDetectedMask(text,m);expect(masked).not.toBe(text.slice(m.start,m.end));if(m.rawEntityType==='__proto__')expect(masked).toBe('****');}
  expect(runtimeWhitelistCandidates('甲（北京）公司',[],[],[{entityType:'org_name',pattern:'甲(北京)公司'}])).toHaveLength(1);
 });
 it('exact source Word RPC guard/trim/scope and failure swallowing oracle',async()=>{
  const source=readFileSync('.data/research/lawbot-2026-10-13/readable/renderer.js','utf8').split('\n').slice(6184,6191).join('\n'),calls:any[]=[];
  const fn=runInNewContext(`(${source.trim()})`,{window:{anbao:{desensitization:{updateRuntimeRules:async(v:any)=>{calls.push(v);}}}},C2:{requestId:' job ',runtimeSessionId:'session',runtimeRuleScope:'project'}});
  await fn({pattern:' 张三 ',entityType:' name_cn ',ruleType:'whitelist'});expect(calls).toEqual([{requestId:'job',sessionId:'session',scope:'project',entityType:'name_cn',pattern:'张三',ruleType:'whitelist'}]);await fn({pattern:'张三',entityType:'name_cn',scope:'spot'});expect(calls).toHaveLength(1);
 });
});
it('browser dispatcher no-op/spot do not call, audit is file-only, covered selection is explicit, flush waits and failure never claims application',async()=>{
 const {createAutomaticRuntimeRuleDispatcher}=await import('../apps/web/automatic-runtime-rules.ts');const calls:any[]=[];let release!:()=>void;const waiting=new Promise<void>(r=>release=r),dispatcher=createAutomaticRuntimeRuleDispatcher(async(path,method,body)=>{calls.push({path,method,body});await waiting;return{success:true,appliedToTasks:1};}),mark={kind:'姓名' as const,start:0,end:2,decision:'pending' as const};
 await dispatcher.dispatch('doc',1,{producer:'manual-add',before:[mark],after:[mark]});await dispatcher.dispatch('doc',1,{producer:'manual-add',before:[],after:[mark]},'spot');expect(calls).toHaveLength(0);
 const work=dispatcher.dispatch('doc',1,{producer:'audit-add',before:[],after:[mark]},'project');expect(calls).toHaveLength(1);expect(calls[0].body.scope).toBe('file');let flushed=false;const flush=dispatcher.flush().then(()=>{flushed=true;});await Promise.resolve();expect(flushed).toBe(false);release();await work;await flush;expect(flushed).toBe(true);
 const covered=dispatcher.dispatch('doc',1,{producer:'manual-add',before:[mark],after:[mark]},'file',{start:0,end:2,pattern:'张三',entityType:'name_cn'});await covered;expect(calls[1].body.selection.pattern).toBe('张三');
 const failed=createAutomaticRuntimeRuleDispatcher(async()=>{throw Error('OFFLINE');});expect(await failed.dispatch('doc',1,{producer:'manual-add',before:[],after:[mark]})).toEqual({success:false,appliedToTasks:0});await failed.flush();
});
