import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { tick } from '../apps/worker/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { hash, passwordHash, readOriginal } from '../packages/adapters/storage.ts';
import { readZip } from '../packages/core/office-zip.ts';

const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
after(async () => { await app.close(); await pool.end(); await admin.end(); });

test('21 directory files complete real detect, human review, export and one ZIP with truthful skipped entries', async () => {
  const user=randomUUID(),tenant=randomUUID(),username='folder21-complete-'+randomUUID(),password='synthetic-folder-password',origin=process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
  const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
  assert.equal(login.statusCode,200,login.body);
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  const request=(method:'GET'|'POST'|'PUT',url:string,payload?:Record<string,unknown>|Buffer)=>app.inject({method,url,headers:{origin,cookie,...Buffer.isBuffer(payload)?{'content-type':'application/octet-stream'}:{}},payload});
  const created=await request('POST','/api/projects',{name:'完整目录真实处理21份'});
  assert.equal(created.statusCode,200,created.body);
  const project=created.json().id as string,batchId=randomUUID();
  const sources=Array.from({length:21},(_,i)=>({requestId:randomUUID(),path:`完整目录/子目录/${String(i).padStart(2,'0')}.txt`,bytes:Buffer.from(`第${i}份合成电话 13800138000`)}));
  const files=sources.map(s=>({requestId:s.requestId,path:s.path,size:s.bytes.length,sha256:hash(s.bytes)}));
  const skippedEntries=[{sourceRelativePath:'完整目录/不支持.exe',extension:'.exe',reasonCode:'unsupported_format',reason:'格式暂不支持'},{sourceRelativePath:'完整目录/空内容.txt',extension:'.txt',reasonCode:'EMPTY_FILE',reason:'空文件无法导入，处理失败'}];
  const registered=await request('POST',`/api/projects/${project}/upload-batches`,{id:batchId,files,sourceRootName:'完整目录',skippedEntries,emptyDirectories:['完整目录/空文件夹']});
  assert.equal(registered.statusCode,200,registered.body);
  const docs:string[]=[];
  for(const source of sources){
    const uploaded=await request('POST',`/api/projects/${project}/files?batchId=${batchId}&requestId=${source.requestId}`,source.bytes);
    assert.equal(uploaded.statusCode,200,uploaded.body);docs.push(uploaded.json().id);
  }
  for(let i=0;i<docs.length;i++)assert.equal(await tick(),true,`detect ${i}`);
  for(const doc of docs){
    const current=await request('GET',`/api/documents/${doc}`);assert.equal(current.statusCode,200,current.body);
    const d=current.json();assert.equal(d.state,'review');assert.equal(d.job.status,'succeeded');
    assert.ok(d.marks.some((m:{kind:string})=>m.kind==='手机号'));
    const marks=d.marks.map((mark:Record<string,unknown>)=>({...mark,decision:'redact',replacement:{mode:'mask',prefix:3,suffix:4}}));
    const reviewed=await request('PUT',`/api/documents/${doc}/review`,{revision:d.revision,marks});
    assert.equal(reviewed.statusCode,200,reviewed.body);
    const exportJob=await request('POST',`/api/documents/${doc}/export`,{revision:reviewed.json().revision});
    assert.equal(exportJob.statusCode,200,exportJob.body);
  }
  for(let i=0;i<docs.length;i++)assert.equal(await tick(),true,`export ${i}`);
  const prepared=await request('POST',`/api/projects/${project}/folder-exports`,{uploadBatchId:batchId});
  assert.equal(prepared.statusCode,200,prepared.body);
  const base=`/api/projects/${project}/folder-exports/${prepared.json().exportSessionId}`;
  const status=await request('GET',base);assert.equal(status.statusCode,200,status.body);
  const entries=status.json().files.map((f:{path:string;documentId:string;revision:number;artifactId:string})=>{
    assert.ok(f.documentId&&f.artifactId);
    return{sourceRelativePath:f.path,outputRelativePath:f.path,status:'success',documentId:f.documentId,revision:f.revision,artifactId:f.artifactId};
  });
  entries.push(...status.json().extra);
  const output=await request('POST',base+'/manifest',{revision:0,entries});
  assert.equal(output.statusCode,200,output.body);
  assert.deepEqual(output.json().counts,{success:21,failed:1,skipped:2,canceled:0});
  const download=await request('GET',base+'/download');assert.equal(download.statusCode,200,download.body);
  const zip=await readZip(download.rawPayload);assert.equal(zip.size,22);
  for(let i=0;i<sources.length;i++){
    const pair=[...zip].find(([name])=>name.endsWith('/'+sources[i].path));assert.ok(pair,sources[i].path);
    assert.ok(!pair[1].toString().includes('13800138000'));
    const original=(await admin.query('SELECT source_id FROM documents WHERE id=$1',[docs[i]])).rows[0].source_id;
    assert.deepEqual(await readOriginal(original),sources[i].bytes);
  }
  const html=[...zip].find(([name])=>name.endsWith('/脱敏处理清单.html'))?.[1].toString();
  assert.ok(html?.includes('不支持.exe')&&html.includes('空文件夹未处理')&&html.includes('空内容.txt'));
});

test('one directory batch uploads 21 files and retains all skipped and unuploaded entries in the output manifest', async () => {
  const user=randomUUID(),tenant=randomUUID(),username='folder21-'+randomUUID(),password='synthetic-folder-password',origin=process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
  const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
  assert.equal(login.statusCode,200,login.body);
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  const request=(method:'GET'|'POST',url:string,payload?:Record<string,unknown>|Buffer,binary=false)=>app.inject({method,url,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload});
  const created=await request('POST','/api/projects',{name:'完整目录21份'});
  assert.equal(created.statusCode,200,created.body);
  const project=created.json().id as string, batchId=randomUUID(),bytes=Buffer.from('合成材料 13800138000');
  const files=Array.from({length:22},(_,i)=>({requestId:randomUUID(),path:`公开目录/子目录/${String(i).padStart(2,'0')}.txt`,size:bytes.length,sha256:hash(bytes)}));
  const skippedEntries=[{sourceRelativePath:'公开目录/子目录/不支持.exe',extension:'.exe',reasonCode:'unsupported_format',reason:'格式暂不支持'},{sourceRelativePath:'公开目录/.DS_Store',extension:'',reasonCode:'hidden_or_system',reason:'隐藏或系统条目'}];
  const manifest={id:batchId,files,sourceRootName:'公开目录',skippedEntries,emptyDirectories:['公开目录/空目录']};
  const accepted=await request('POST',`/api/projects/${project}/upload-batches`,manifest);
  assert.equal(accepted.statusCode,200,accepted.body);
  assert.equal((await request('POST',`/api/projects/${project}/upload-batches`,manifest)).statusCode,200);
  const changed=await request('POST',`/api/projects/${project}/upload-batches`,{...manifest,skippedEntries:[]});
  assert.equal(changed.statusCode,409,changed.body);
  const duplicate=await request('POST',`/api/projects/${project}/upload-batches`,{...manifest,id:randomUUID(),emptyDirectories:[files[0].path]});
  assert.equal(duplicate.statusCode,400,duplicate.body);
  const traversal=await request('POST',`/api/projects/${project}/upload-batches`,{...manifest,id:randomUUID(),skippedEntries:[{...skippedEntries[0],sourceRelativePath:'../outside.exe'}]});
  assert.equal(traversal.statusCode,400,traversal.body);
  for(const file of files.slice(0,21)){
    const saved=await request('POST',`/api/projects/${project}/files?batchId=${batchId}&requestId=${file.requestId}`,bytes,true);
    assert.equal(saved.statusCode,200,saved.body);
  }
  const read=await request('GET',`/api/projects/${project}/upload-batches/${batchId}`);
  assert.equal(read.statusCode,200,read.body);
  assert.deepEqual(read.json().files.map((f:{path:string})=>f.path),files.map(f=>f.path));
  assert.equal(read.json().files.filter((f:{documentId:string|null})=>f.documentId).length,21);
  assert.deepEqual(read.json().skippedEntries,skippedEntries);
  assert.deepEqual(read.json().emptyDirectories,['公开目录/空目录']);
  const prepared=await request('POST',`/api/projects/${project}/folder-exports`,{uploadBatchId:batchId});
  assert.equal(prepared.statusCode,200,prepared.body);
  const session=prepared.json(),base=`/api/projects/${project}/folder-exports/${session.exportSessionId}`;
  assert.equal(session.sourceRootName,'公开目录');
  assert.equal(session.files.length,22);
  assert.equal(session.extra.length,3);
  const entries=[...files.map(f=>({sourceRelativePath:f.path,status:'skipped'})),...session.extra];
  assert.equal((await request('POST',base+'/manifest',{revision:0,entries:entries.slice(1)})).statusCode,400);
  const output=await request('POST',base+'/manifest',{revision:0,entries});
  assert.equal(output.statusCode,200,output.body);
  assert.deepEqual(output.json().counts,{success:0,failed:0,skipped:25,canceled:0});
  const download=await request('GET',base+'/download');
  assert.equal(download.statusCode,200,download.body);
  const zip=await readZip(download.rawPayload);
  assert.equal(zip.size,1);
  const html=[...zip.values()][0].toString();
  for(const f of files)assert.ok(html.includes(f.path));
  assert.ok(html.includes('不支持.exe'));
  assert.ok(html.includes('空文件夹未处理'));
  assert.ok(html.includes('NOT_UPLOADED'));
});
