// Candidate when copied to tests/portable-fresh-rules.integration.ts. Run only with the isolated integration runner.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {registerWorkspacePortableRoutes} from '../apps/api/workspace-portable.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {hash,passwordHash,readOriginal,unseal} from '../packages/adapters/storage.ts';
import {readNativeOrReferencePortable} from '../packages/core/native-portable.ts';
import {importedEntries} from '../packages/core/presets.ts';
assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(new URL(process.env.MIGRATION_DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(process.env.DATA_DIR?.includes('/.data/test-runs/'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
if(!app.hasRoute({method:'POST',url:'/api/portable/import'}))registerWorkspacePortableRoutes(app);
after(async()=>{await app.close();await pool.end();await admin.end();});

test('native portable fresh restore reapplies current exact force rules while retaining old manual review slots', {timeout:180000}, async()=>{
 const tenant=randomUUID(),user=randomUUID(),username='fresh-rules-'+user,password='synthetic-fresh-rules',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:string,url:string,payload?:any,binary=false)=>app.inject({method:method as any,url,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload});
 const view=async(id:string)=>{const response=await req('GET',`/api/documents/${id}`);assert.equal(response.statusCode,200,response.body);return response.json();};
 const text='人工旧槽ZX8 内部合成代号QX581 手机号：13800138000';
 const bytes=Buffer.from(text),oldManualStart=text.indexOf('ZX8'),forceStart=text.indexOf('QX581'),phoneStart=text.indexOf('13800138000');
 const sourceProject=(await req('POST','/api/projects',{name:'054 规则备份源'})).json().id as string;
 const makeRuleset=async(name:string,detect:boolean)=>{
  const made=await req('POST','/api/presets/rulesets',{name,description:null,applicability:null});assert.equal(made.statusCode,200,made.body);
  const initial=made.json();const entries=importedEntries([
   {row:1,pattern:'13800138000',entityType:'phone',kind:'forceSkip',enabled:true},
   ...detect?[{row:2,pattern:'QX581',entityType:'内部代号',kind:'forceDetect' as const,enabled:true}]:[]
  ],'manual');
  const saved=await req('PUT',`/api/presets/rulesets/${initial.settings.id}`,{revision:initial.revision,settings:{...initial.settings,entries}});assert.equal(saved.statusCode,200,saved.body);
  return saved.json();
 };
 const oldRules=await makeRuleset('054 源仅跳过',false);
 const sourceRuleApply=await req('PUT',`/api/projects/${sourceProject}/presets`,{revision:0,profileId:null,rulesetId:oldRules.settings.id,rulesetRevision:oldRules.revision});assert.equal(sourceRuleApply.statusCode,200,sourceRuleApply.body);
 const batch=randomUUID(),requestId=randomUUID();const uploadBatch=await req('POST',`/api/projects/${sourceProject}/upload-batches`,{id:batch,files:[{requestId,path:'source-fresh-rules.txt',size:bytes.length}]});assert.equal(uploadBatch.statusCode,200,uploadBatch.body);const created=await req('POST',`/api/projects/${sourceProject}/files?batchId=${batch}&requestId=${requestId}`,bytes,true);assert.equal(created.statusCode,200,created.body);
 const sourceId=created.json().id as string;assert.equal(await tick(),true);
 let source=await view(sourceId);assert.equal(source.state,'review');
 assert.equal(source.marks.some((m:any)=>m.start===phoneStart&&m.end===phoneStart+11&&m.kind==='手机号'),false);
 assert.equal(source.marks.some((m:any)=>m.start===forceStart&&m.end===forceStart+5&&m.rawEntityType==='内部代号'),false);
 const manual={start:oldManualStart,end:oldManualStart+3,kind:'自定义',rawEntityType:'人工旧槽',decision:'ignore'};
 const reviewed=await req('PUT',`/api/documents/${sourceId}/review`,{revision:source.revision,marks:[...source.marks,manual]});assert.equal(reviewed.statusCode,200,reviewed.body);
 source=await view(sourceId);assert.ok(source.marks.some((m:any)=>m.rawEntityType==='人工旧槽'&&m.userAdded===true&&m.decision==='ignore'));
 const sourceRow=(await admin.query('SELECT source_id,source_hash FROM documents WHERE id=$1',[sourceId])).rows[0];
 assert.equal(sourceRow.source_hash,hash(bytes));assert.deepEqual(await readOriginal(sourceRow.source_id),bytes);
 const backup=await req('POST',`/api/projects/${sourceProject}/portable/export`,{password:'synthetic-native-fresh',format:'native'});assert.equal(backup.statusCode,200,backup.body);
 const native=await readNativeOrReferencePortable(backup.rawPayload,{password:'synthetic-native-fresh'});assert.equal(native.kind,'native');
 if(native.kind!=='native')throw Error('native fixture');
 assert.ok(native.snapshot.documents.some((d:any)=>d.id===sourceId&&d.marks.some((m:any)=>m.rawEntityType==='人工旧槽')));
 const imported=await req('POST','/api/portable/import',{name:'054 当前规则重开',password:'synthetic-native-fresh',bytesBase64:backup.rawPayload.toString('base64')});assert.equal(imported.statusCode,200,imported.body);
 const project=imported.json().id as string;
 const [freshRow]=(await admin.query('SELECT id,source_id,source_hash FROM documents WHERE project_id=$1',[project])).rows;
 assert.ok(freshRow);assert.equal(freshRow.source_hash,hash(bytes));assert.deepEqual(await readOriginal(freshRow.source_id),bytes);
 const dictionaryBefore=(await req('GET',`/api/projects/${project}/dictionary`)).json();const dictionarySaved=await req('PUT',`/api/projects/${project}/dictionary`,{revision:dictionaryBefore.revision,entries:[...dictionaryBefore.entries,{value:'绝不会命中的测试词',kind:'自定义',action:'exclude'}]});assert.equal(dictionarySaved.statusCode,200,dictionarySaved.body);assert.equal(dictionarySaved.json().revision,dictionaryBefore.revision+1);
 const current=await makeRuleset('054 当前检测与跳过',true);
 const inherited=(await req('GET',`/api/projects/${project}/presets`)).json();
 const apply=await req('PUT',`/api/projects/${project}/presets`,{revision:inherited.revision,profileId:inherited.profile?.settings.id??null,profileRevision:inherited.profile?.revision,rulesetId:current.settings.id,rulesetRevision:current.revision});assert.equal(apply.statusCode,200,apply.body);
 // The import job may have been invalidated by the preset change; explicitly queue recognition under current policy.
 let fresh=await view(freshRow.id);
 const recognized=await req('POST',`/api/documents/${freshRow.id}/recognize`,{revision:fresh.revision,ner:false});assert.equal(recognized.statusCode,200,recognized.body);
 assert.equal(await tick(),true);fresh=await view(freshRow.id);assert.equal(fresh.state,'review');
 const hasForced=(marks:any[])=>marks.some(m=>m.start===forceStart&&m.end===forceStart+5&&m.rawEntityType==='内部代号'&&m.decision==='pending'&&m.sources?.some((s:any)=>s.code===`ruleset-force-detect:${current.settings.entries[1].id}`));
 const hasPhone=(marks:any[])=>marks.some(m=>m.start===phoneStart&&m.end===phoneStart+11&&m.kind==='手机号');
 assert.ok(hasForced(fresh.marks),JSON.stringify(fresh.marks));assert.equal(hasPhone(fresh.marks),false);
 const restored=await req('POST',`/api/documents/${freshRow.id}/portable-draft/restore`,{revision:fresh.revision});assert.equal(restored.statusCode,200,restored.body);
 const after=await view(freshRow.id),afterRow=(await admin.query('SELECT source_id,source_hash,content,marks,recognition FROM documents WHERE id=$1',[freshRow.id])).rows[0];
 assert.ok(hasForced(after.marks),JSON.stringify(after.marks));assert.equal(hasPhone(after.marks),false,JSON.stringify(after.marks));assert.equal(afterRow.recognition.dictionaryRevision,dictionarySaved.json().revision);
 assert.ok(after.marks.some((m:any)=>m.start===oldManualStart&&m.end===oldManualStart+3&&m.rawEntityType==='人工旧槽'&&m.decision==='pending'&&m.userAdded===true&&m.sources?.some((s:any)=>s.code==='imported-draft-requires-review')),JSON.stringify(after.marks));
 assert.equal(unseal(afterRow.content,`${tenant}:${project}:${freshRow.id}`),text);
 assert.equal(afterRow.source_id,freshRow.source_id);assert.equal(afterRow.source_hash,hash(bytes));assert.deepEqual(await readOriginal(afterRow.source_id),bytes);
 assert.ok(afterRow.marks.every((m:any)=>m.decision==='pending'));
});
