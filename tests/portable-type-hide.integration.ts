import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,readOriginal,hash} from '../packages/adapters/storage.ts';
import {writeZip} from '../packages/core/office-zip.ts';
import {readNativeOrReferencePortable} from '../packages/core/native-portable.ts';
import {readPortableWorkspace,writePortableWorkspace} from '../packages/core/workspace-portable.ts';
import {workspaceReviewProfile} from '../packages/core/workspace-compat.ts';
import {hideReviewEntityType,restoreHiddenReviewEntities,reviewEntityWasUserAdded} from '../packages/core/review-type-hide.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app=await buildApp(),admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
after(async()=>{await app.close();await pool.end();await admin.end();});

test('persistent type hiding survives native and source V1/V2/V3 without native extension, preserves manual origin and never becomes a force-skip review rule',{timeout:120000},async()=>{
 const tenant=randomUUID(),uid=randomUUID(),username='hidden-portable-'+uid,password='synthetic-hidden-backup',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200);
 const cookie=String(login.headers['set-cookie']).split(';')[0],req=(method:any,url:string,payload?:any,headers:Record<string,string>={})=>app.inject({method,url,payload,headers:{origin,cookie,...headers}}),created=await req('POST','/api/projects',{name:'持久按类型隐藏工程'});assert.equal(created.statusCode,200);
 const project=created.json().id,text='13800138000 合成手工甲 support@example.com',manual='合成手工甲',originals=new Map<string,Buffer>();
 for(const format of ['md','docx']){
  const bytes=format==='md'?Buffer.from(text):await writeZip(new Map(Object.entries({
   '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
   '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
   'word/document.xml':`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  }).map(([name,value])=>[name,Buffer.from(value)])));
  originals.set(format,bytes);const batch=randomUUID(),requestId=randomUUID(),name='hidden.'+format;
  assert.equal((await req('POST',`/api/projects/${project}/upload-batches`,{id:batch,files:[{requestId,path:name,size:bytes.length}]})).statusCode,200);
  const upload=await req('POST',`/api/projects/${project}/files?batchId=${batch}&requestId=${requestId}`,bytes,{'content-type':'application/octet-stream'});assert.equal(upload.statusCode,200,upload.body);await tick();
  const url=`/api/documents/${upload.json().id}`,view=(await req('GET',url)).json();assert.equal(view.state,'review',JSON.stringify(view.job));assert.ok(view.marks.some((m:any)=>m.kind==='手机号'));
  const start=view.text.indexOf(manual);assert.ok(start>=0);
  let marks=[...view.marks.map((m:any)=>({...m,decision:'ignore'})),{start,end:start+manual.length,kind:'自定义' as const,rawEntityType:'原人工类型',decision:'pending' as const,sources:[{layer:'manual' as const,code:'human-mark'}]}];
  marks=hideReviewEntityType(marks,{kind:'手机号'});marks=hideReviewEntityType(marks,{kind:'自定义',rawEntityType:'原人工类型'});
  const saved=await req('PUT',url+'/review',{revision:view.revision,marks});assert.equal(saved.statusCode,200,saved.body);
 }
 const rows:any[]=[];
 for(const archiveFormat of ['native','legacy-zip','secure-v2','secure-v3'] as const){
  const exported=await req('POST',`/api/projects/${project}/portable/export`,{format:archiveFormat,password});assert.equal(exported.statusCode,200,exported.body);let bytes=exported.rawPayload;
  if(archiveFormat==='native'){
   const opened=await readNativeOrReferencePortable(bytes,{password});assert.equal(opened.kind,'native');if(opened.kind!=='native')throw Error('fixture');
   for(const d of opened.snapshot.documents){assert.equal(d.marks.filter((m:any)=>m.hiddenByType).length,2);assert.equal(d.marks.find((m:any)=>m.rawEntityType==='原人工类型').hiddenTypeWasUserAdded,true);}
  }else{
   const source=await readPortableWorkspace(bytes,{password});delete source.snapshot.tuominwangNative;
   for(const d of source.snapshot.documents){const hidden=d.review.entities.filter((e:any)=>e.hiddenByType||e.meta?.hiddenByType);assert.equal(hidden.length,2);assert.ok(hidden.every((e:any)=>e.deleted));assert.equal(hidden.find((e:any)=>e.type==='原人工类型').meta.hiddenTypeWasUserAdded,true);assert.equal(hidden.find((e:any)=>e.type==='phone').meta.hiddenTypeWasUserAdded,false);}
   const profile=workspaceReviewProfile(source);assert.ok(!profile.corrections.some((r:any)=>['13800138000',manual].includes(r.pattern)),JSON.stringify(profile.corrections));assert.ok(profile.corrections.some((r:any)=>r.pattern==='support@example.com'&&r.kind==='forceSkip'),'ordinary ignore remains a true skip rule');
   bytes=await writePortableWorkspace(source.snapshot,source.sources,{format:archiveFormat,...archiveFormat==='legacy-zip'?{}:{password}});
  }
  const imported=await req('POST','/api/portable/import',{name:'隐藏重开 '+archiveFormat,bytesBase64:bytes.toString('base64'),password});assert.equal(imported.statusCode,200,imported.body);await tick();await tick();
  const docs=(await admin.query('SELECT * FROM documents WHERE project_id=$1 ORDER BY source_format',[imported.json().id])).rows;assert.equal(docs.length,2);
  for(const d of docs){
   const url=`/api/documents/${d.id}`;let view=(await req('GET',url)).json();assert.equal(view.state,'review',JSON.stringify(view.job));const restore=await req('POST',url+'/portable-draft/restore',{revision:view.revision});assert.equal(restore.statusCode,200,restore.body);assert.deepEqual(restore.json().pending.unresolved,[]);
   view=(await req('GET',url)).json();const hidden=view.marks.filter((m:any)=>m.hiddenByType);assert.equal(hidden.length,2);assert.ok(hidden.every((m:any)=>m.decision==='ignore'));
   const phone=hidden.find((m:any)=>m.kind==='手机号'),added=hidden.find((m:any)=>m.rawEntityType==='原人工类型');assert.equal(phone.hiddenTypeWasUserAdded,false);assert.equal(added.hiddenTypeWasUserAdded,true);assert.equal(phone.userAdded,false);assert.equal(added.userAdded,true);
   assert.ok(view.marks.filter((m:any)=>!m.hiddenByType).every((m:any)=>m.decision==='pending'),'ordinary ignore is not imported approval');
   const visible=restoreHiddenReviewEntities(view.marks);assert.ok(visible.every((m:any)=>m.hiddenByType===undefined&&m.hiddenTypeWasUserAdded===undefined&&m.decision==='pending'));
   assert.equal(reviewEntityWasUserAdded(visible.find((m:any)=>m.kind==='手机号')!),false);assert.equal(reviewEntityWasUserAdded(visible.find((m:any)=>m.rawEntityType==='原人工类型')!),true);
   const saved=await req('PUT',url+'/review',{revision:view.revision,marks:visible});assert.equal(saved.statusCode,200,saved.body);const current=(await req('GET',url)).json();assert.ok(current.marks.every((m:any)=>m.decision==='pending'));
   assert.equal(current.marks.find((m:any)=>m.kind==='手机号').userAdded,false);assert.equal(current.marks.find((m:any)=>m.rawEntityType==='原人工类型').userAdded,true);
   const hiddenAgain=hideReviewEntityType(current.marks,{kind:'手机号'});assert.equal(hiddenAgain.find((m:any)=>m.kind==='手机号')!.hiddenTypeWasUserAdded,false,'generic import trace must not change creation provenance after restore and re-hide');
   const blocked=await req('POST',url+'/export',{revision:current.revision});assert.equal(blocked.statusCode,400,blocked.body);assert.equal(blocked.json().error,'INVALID_MARKS','restored pending types require fresh confirmation');assert.deepEqual(await readOriginal(d.source_id),originals.get(d.source_format));
   rows.push({archiveFormat,materialFormat:d.source_format,hidden:2,manualOriginPreserved:true,ordinaryIgnorePending:true,restorePending:true,originalHash:hash(originals.get(d.source_format)!)});
  }
 }
 await mkdir('.data/research/lawbot-2026-10-15/iteration036',{recursive:true});await writeFile('.data/research/lawbot-2026-10-15/iteration036/portable-type-hide-actual-C.json',JSON.stringify({runtime:process.version,fixtures:'synthetic-only',rows,competitorRuntime:'R0'},null,2)+'\n');
});
