import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import officeCrypto from 'officecrypto-tool';
import {officeFixture} from './office-fixtures.ts';
import {hash,passwordHash,readOriginal,writeOriginal} from '../packages/adapters/storage.ts';
import {verifiedDocumentSource} from '../packages/adapters/document-source.ts';
import {buildApp} from '../apps/api/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {tick} from '../apps/worker/main.ts';
let admin:pg.Client,app:Awaited<ReturnType<typeof buildApp>>;
before(async()=>{admin=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});await admin.connect();app=await buildApp();});
after(async()=>{await app.close();await pool.end();await admin.end();});
test('known-password API decrypts PDF/DOCX/XLSX, re-detects and exports real bytes while encrypted originals remain immutable',{timeout:120000},async()=>{
 const tenant=randomUUID(),uid=randomUUID(),username='unlock-'+randomUUID(),password='synthetic-login',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}}),cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,binary=false)=>app.inject({method,url,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload});
 const project=(await req('POST','/api/projects',{name:'合法文件密码解锁'})).json().id;
 for(const format of ['pdf','docx','xlsx'] as const){
  const filePassword=format==='pdf'?'演示-synthetic-password':'合成文档密码2026';
  const encrypted=format==='pdf'?await readFile(new URL('./fixtures/document-unlock/aes256.pdf',import.meta.url)):Buffer.from(officeCrypto.encrypt(await officeFixture(format),{password:filePassword}));
  const batchId=randomUUID(),requestId=randomUUID();
  await req('POST',`/api/projects/${project}/upload-batches`,{id:batchId,files:[{requestId,path:`encrypted.${format}`,size:encrypted.length}]});
  const uploaded=await req('POST',`/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`,encrypted,true);assert.equal(uploaded.statusCode,200,uploaded.body);const doc=uploaded.json().id;
  await tick();let view=(await req('GET',`/api/documents/${doc}`)).json();assert.equal(view.job.status,'failed',JSON.stringify(view.job));assert.equal(view.job.error_code,format==='pdf'?'ENCRYPTED_PDF':'ENCRYPTED_OFFICE');
  const before=(await admin.query('SELECT * FROM documents WHERE id=$1',[doc])).rows[0];
  assert.equal((await req('POST',`/api/documents/${doc}/unlock`,{revision:0,password:'wrong-synthetic-password'})).statusCode,400);
  let after=(await admin.query('SELECT * FROM documents WHERE id=$1',[doc])).rows[0];assert.equal(after.revision,0);assert.equal(after.unlocked_source_id,null);
  assert.equal((await req('POST',`/api/documents/${doc}/unlock`,{revision:1,password:filePassword})).statusCode,409);
  const unlocked=await req('POST',`/api/documents/${doc}/unlock`,{revision:0,password:filePassword});assert.equal(unlocked.statusCode,200,unlocked.body);assert.equal(unlocked.json().revision,1);assert.ok(!unlocked.body.includes(filePassword));
  await tick();view=(await req('GET',`/api/documents/${doc}`)).json();assert.equal(view.job.status,'succeeded',JSON.stringify(view.job));assert.equal(view.revision,1);assert.ok(view.marks.length);assert.ok(view.marks.every((m:any)=>m.decision==='pending'));
  after=(await admin.query('SELECT * FROM documents WHERE id=$1',[doc])).rows[0];assert.equal(after.source_id,before.source_id);assert.equal(after.source_hash,hash(encrypted));assert.equal(after.unlock_source_hash,hash(encrypted));assert.notEqual(after.unlocked_source_id,before.source_id);assert.equal(hash(await readOriginal(before.source_id)),hash(encrypted));assert.equal(hash(await verifiedDocumentSource(after)),after.unlocked_source_hash);
  assert.equal((await req('POST',`/api/documents/${doc}/unlock`,{revision:1,password:filePassword})).statusCode,409);
  const tampered={...after,unlocked_source_hash:'0'.repeat(64)};await assert.rejects(verifiedDocumentSource(tampered),/SOURCE_MISMATCH/);
  const marks=view.marks.map((m:any)=>({...m,decision:m.kind==='手机号'?'redact':'ignore',replacement:{mode:'full'}}));
  const reviewed=await req('PUT',`/api/documents/${doc}/review`,{revision:1,marks,...format==='pdf'?{pageReview:{mode:'raster',regions:[],deletedPages:[]}}:{}});assert.equal(reviewed.statusCode,200,reviewed.body);
  const exporting=await req('POST',`/api/documents/${doc}/export`,{revision:2});assert.equal(exporting.statusCode,200,exporting.body);await tick();view=(await req('GET',`/api/documents/${doc}`)).json();assert.equal(view.job.status,'succeeded',JSON.stringify(view.job));
  const link=await req('POST',`/api/documents/${doc}/download-link`,{revision:2});assert.equal(link.statusCode,200,link.body);assert.equal((await app.inject({url:link.json().url})).statusCode,200);assert.equal(hash(await readOriginal(before.source_id)),hash(encrypted));
 }
 // Membership is checked before parsing or decrypting a foreign original.
 const foreignUid=randomUUID(),foreignTenant=randomUUID();await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[foreignUid,foreignTenant,'foreign-'+foreignUid,passwordHash(password)]);
 const foreign=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username:'foreign-'+foreignUid,password}}),doc=(await admin.query('SELECT id FROM documents WHERE project_id=$1 LIMIT 1',[project])).rows[0].id;
 assert.equal((await app.inject({method:'POST',url:`/api/documents/${doc}/unlock`,headers:{origin,cookie:String(foreign.headers['set-cookie']).split(';')[0]},payload:{revision:2,password:'known-synthetic'}})).statusCode,404);
});
