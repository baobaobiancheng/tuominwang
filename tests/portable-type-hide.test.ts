import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {hash} from '../packages/adapters/storage.ts';
import {nativeToReference,workspaceReviewProfile} from '../packages/core/workspace-compat.ts';

for(const format of ['png','pdf'])it(`${format} source visual review saves hidden origins separately from ordinary deleted whitelist entries`,()=>{
 const id=randomUUID(),content='13800138000 合成人工甲 support@example.com',source=Buffer.from('synthetic-source-only'),start=content.indexOf('合成人工甲'),email=content.indexOf('support@'),marks=[
  {start:0,end:11,kind:'手机号',decision:'ignore',hiddenByType:true,hiddenTypeWasUserAdded:false,sources:[{layer:'rules',code:'cn-mobile'}]},
  {start,end:start+5,kind:'自定义',rawEntityType:'原人工类型',decision:'ignore',hiddenByType:true,hiddenTypeWasUserAdded:true,sources:[{layer:'manual',code:'human-mark'}]},
  {start:email,end:content.length,kind:'邮箱',decision:'ignore',sources:[{layer:'rules',code:'email'}]},
 ],map=Buffer.from(JSON.stringify(Array.from({length:content.length},(_,i)=>[i,i+1,i*5,0,5,10]))),sourceEntry='source.'+format,mapEntry='page.map',d:any={id,name:'visual.'+format,format,content,contentHash:hash(content),sourceEntry,sourceHash:hash(source),marks,revision:1,state:'review',anchors:[{kind:'page',page:0,start:0,end:content.length}],coverage:[{id:'page:0',status:'complete'}],pages:[{index:0,width:300,height:100,rotation:0,mapEntry,mapHash:hash(map),textSource:'ocr',nativeTextLength:0}],pageReview:{mode:'raster',regions:[],deletedPages:[]},recognition:{},nerEnabled:false},snapshot:any={format:'tuominwang-workspace',schemaVersion:1,project:{name:'视觉隐藏',dictionary:[],dictionaryRevision:0,presetPolicy:null,presetRevision:0},documents:[d],mappings:[],snapshots:[]},result=nativeToReference(snapshot,new Map([[sourceEntry,source],[mapEntry,map]]),'synthetic-project'),projected:any=result.snapshot.documents[0],entities=format==='png'?projected.review.deletedBBoxes:projected.review.entities;
 expect(entities.filter((e:any)=>e.hiddenByType||e.meta?.hiddenByType)).toHaveLength(2);
 expect(entities.find((e:any)=>(e.entityType??e.type)==='原人工类型').meta.hiddenTypeWasUserAdded).toBe(true);
 expect(entities.find((e:any)=>(e.entityType??e.type)==='phone').meta.hiddenTypeWasUserAdded).toBe(false);
 const profile=workspaceReviewProfile({format:'legacy-zip',snapshot:result.snapshot,sources:result.sources} as any);
 expect(profile.corrections.some((r:any)=>r.pattern==='13800138000'||r.pattern==='合成人工甲')).toBe(false);
 expect(profile.corrections.some((r:any)=>r.pattern==='support@example.com'&&r.kind==='forceSkip')).toBe(true);
});

it('final serialized Word manual birth survives real source qU reader and d2 while cloud decisions stay pending',()=>{
 const id=randomUUID(),content='13800138000 合成人工甲',source=Buffer.from(content),sourceEntry='source.docx',manualStart=content.indexOf('合成人工甲'),d:any={id,name:'birth.docx',format:'docx',content,contentHash:hash(content),sourceEntry,sourceHash:hash(source),revision:1,state:'review',anchors:[{kind:'text',start:0,end:content.length}],coverage:[{id:'text',status:'complete'}],pages:[],pageReview:null,recognition:{},marks:[
  {start:0,end:11,kind:'手机号',decision:'pending',userAdded:false,sources:[{layer:'manual',code:'imported-draft-requires-review'}]},
  {start:manualStart,end:content.length,kind:'自定义',rawEntityType:'原人工类型',decision:'pending',userAdded:true,sources:[{layer:'manual',code:'human-mark'}]},
 ]},snapshot:any={format:'tuominwang-workspace',schemaVersion:1,project:{name:'出生来源',dictionary:[],dictionaryRevision:0,presetPolicy:null,presetRevision:0},documents:[d],mappings:[],snapshots:[]},projected:any=nativeToReference(snapshot,new Map([[sourceEntry,source]]),'synthetic-project').snapshot.documents[0];
 expect(projected.review.entities[0].userAdded).toBe(false);expect(projected.review.entities[1].userAdded).toBe(true);expect(projected.review.entities[1].reviewState.status).toBe('user_added');expect(projected.review.entities[1].meta.reviewState.status).toBe('user-added');
 const original=readFileSync('.data/research/lawbot-2026-10-13/readable/renderer.js','utf8'),lines=original.split('\n'),q=original.indexOf('function qU('),end=original.indexOf('\nfunction GU(',q);expect(q).toBeGreaterThan(0);expect(end).toBeGreaterThan(q);
 const reader=vm.runInNewContext(`(()=>{${original.slice(q,end)}\n${lines.slice(6046,6060).join('\n')}\n${lines.slice(6087,6092).join('\n')}\nreturn{qU,d2,o2};})()`),read=reader.qU(projected.review);
 expect(reader.d2(read.entities[0])).toBe(false);expect(reader.d2(read.entities[1])).toBe(true);expect(reader.o2(read.entities[1])).toBe('user-added');expect(read.entities[1].confirmed).toBe(false);expect(d.marks.every((m:any)=>m.decision==='pending')).toBe(true);
});
