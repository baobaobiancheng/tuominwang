import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { InjectOptions } from 'fastify';
import { buildApp } from '../apps/api/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { passwordHash, hash, readOriginal, readArtifact } from '../packages/adapters/storage.ts';
import { tick } from '../apps/worker/main.ts';
import { pdfFixture } from './pdf-fixtures.ts';
import { readNativeOrReferencePortable } from '../packages/core/native-portable.ts';
import { writeCompatibleWorkspace } from '../packages/core/workspace-compat.ts';
const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
after(async()=>{ await app.close(); await pool.end(); await admin.end(); });
function multipart(parts: [string,string|Buffer][]) {
 const boundary='tmw-'+randomUUID(), pieces:Buffer[]=[];
 for(const [name,value] of parts) {
  pieces.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${Buffer.isBuffer(value)?'; filename="archive.tmm"\r\nContent-Type: application/octet-stream':''}\r\n\r\n`));
  pieces.push(Buffer.isBuffer(value)?value:Buffer.from(value)); pieces.push(Buffer.from('\r\n'));
 }
 pieces.push(Buffer.from(`--${boundary}--\r\n`));
 return {body:Buffer.concat(pieces),type:`multipart/form-data; boundary=${boundary}`};
}
test('multipart import accepts either field order and keeps old format, duplicate and source guards',async()=>{
 const tenant=randomUUID(),uid=randomUUID(),username='portable-multipart-'+randomUUID(),loginPassword='synthetic-login',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(loginPassword)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password:loginPassword}});
 assert.equal(login.statusCode,200,login.body); const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(parts:[string,string|Buffer][])=>{const body=multipart(parts);return app.inject({method:'POST',url:'/api/portable/import-file',headers:{origin,cookie,'content-type':body.type},payload:body.body});};
 const doc=randomUUID(),content='公开合成文本',source=Buffer.from(content),snapshot:any={format:'tuominwang-workspace',schemaVersion:1,project:{name:'来源',dictionary:[],dictionaryRevision:0,presetPolicy:null,presetRevision:0},mappings:[],snapshots:[],documents:[{id:doc,name:'source.txt',format:'txt',content,contentHash:hash(content),sourceEntry:`sources/${doc}/original.txt`,sourceHash:hash(source),marks:[],revision:0,state:'review',anchors:[],coverage:[],pages:[],pageReview:null,recognition:{},nerEnabled:false}]};
 const archive=await writeCompatibleWorkspace(snapshot,new Map([[snapshot.documents[0].sourceEntry,source]]),'synthetic-project','secure-v3','synthetic-transfer-password');
 for(const fileFirst of [false,true]){
  const parts:[string,string|Buffer][] = fileFirst?[['file',archive],['name','重开工程'],['password','synthetic-transfer-password']]:[['name','重开工程'],['password','synthetic-transfer-password'],['file',archive]];
  const response=await req(parts);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().documentCount,1);
 }
 const duplicate=await req([['name','重复文件'],['file',archive],['file',archive]]);assert.equal(duplicate.statusCode,400,duplicate.body);
 const unknown=await req([['name','未知字段'],['other','x'],['file',archive]]);assert.equal(unknown.statusCode,400,unknown.body);
 const wrongPassword=await req([['name','错密码'],['password','wrong-password'],['file',archive]]);assert.notEqual(wrongPassword.statusCode,200,wrongPassword.body);
 const unauthenticated=multipart([['name','无权'],['file',archive]]);
 assert.equal((await app.inject({method:'POST',url:'/api/portable/import-file',headers:{origin,'content-type':unauthenticated.type},payload:unauthenticated.body})).statusCode,401);
});

test('native PDF save with real page and glyph map reimports through multipart and records reusable recent profile',async()=>{
 const tenant=randomUUID(),uid=randomUUID(),username='portable-pdf-recent-'+randomUUID(),loginPassword='synthetic-pdf-login',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(loginPassword)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password:loginPassword}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:'GET'|'POST',url:string,payload?:InjectOptions['payload'],binary=false)=>app.inject({method,url,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload});
 const projectResponse=await req('POST','/api/projects',{name:'public synthetic PDF source'});
 assert.equal(projectResponse.statusCode,200,projectResponse.body);
 const project=projectResponse.json().id,source=pdfFixture({pages:1,text:'PUBLIC 13800138000'}),batch=randomUUID(),uploadId=randomUUID();
 const declared=await req('POST',`/api/projects/${project}/upload-batches`,{id:batch,files:[{requestId:uploadId,path:'public.pdf',size:source.length}]});
 assert.equal(declared.statusCode,200,declared.body);
 const uploaded=await req('POST',`/api/projects/${project}/files?batchId=${batch}&requestId=${uploadId}`,source,true);
 assert.equal(uploaded.statusCode,200,uploaded.body);
 const doc=uploaded.json().id;
 let document:any;
 for(let i=0;i<24;i++){
  const [row]=(await admin.query('SELECT source_id,page_data,state FROM documents WHERE id=$1',[doc])).rows;
  document=row;
  if(row?.state==='review'&&row.page_data?.length>0)break;
  const [job]=(await admin.query('SELECT status,error_code,available_at FROM jobs WHERE document_id=$1 ORDER BY created_at DESC LIMIT 1',[doc])).rows;
  assert.notEqual(job?.status,'failed',JSON.stringify(job));
  if(job?.available_at&&new Date(job.available_at).getTime()>Date.now())await new Promise(resolve=>setTimeout(resolve,Math.min(1000,new Date(job.available_at).getTime()-Date.now())));
  await tick();
 }
 assert.ok(document?.page_data?.length>0,'real PDF processing produced page data: '+JSON.stringify({state:document?.state}));
 assert.equal(hash(await readOriginal(document.source_id)),hash(source),'stored source is the uploaded PDF');
 const page=document.page_data[0],map=Buffer.from(await readArtifact(page.mapId));
 assert.ok(page.previewId&&page.mapId,'real PDF page retains preview and glyph map');
 assert.equal(hash(map),page.mapHash,'page map is source-bound');
 const requestId=randomUUID(),password='synthetic-pdf-transfer-password';
 const saving=await req('POST',`/api/projects/${project}/portable/save`,{requestId,password,format:'native'});
 assert.equal(saving.statusCode,200,saving.body);
 let saved:any;
 for(let i=0;i<200;i++){
  const result=await req('POST',`/api/projects/${project}/portable/save-result`,{requestId});
  assert.equal(result.statusCode,200,result.body);
  saved=result.json();if(saved.state!=='running')break;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 assert.equal(saved?.state,'completed',JSON.stringify(saved));
 const download=await req('GET',saved.downloadPath);
 assert.equal(download.statusCode,200,download.body.slice(0,200));
 const archive=download.rawPayload;
 assert.equal(hash(archive),saved.sha256,'download is the verified native stream save');
 const opened=await readNativeOrReferencePortable(archive,{password});
 assert.equal(opened.kind,'native');
 if(opened.kind!=='native')throw Error('native PDF save expected');
 const native=opened.snapshot.documents.find((d:any)=>d.id===doc);
 assert.ok(native?.pages?.[0]?.mapEntry,'saved native PDF retains page map');
 assert.equal(hash(opened.sources.get(native.sourceEntry)!),hash(source),'native archive preserves original PDF bytes');
 assert.equal(hash(opened.sources.get(native.pages[0].mapEntry)!),page.mapHash,'native archive preserves verified glyph map');
 const upload=multipart([['name','public synthetic PDF reopen'],['password',password],['file',archive]]);
 const imported=await app.inject({method:'POST',url:'/api/portable/import-file',headers:{origin,cookie,'content-type':upload.type},payload:upload.body});
 assert.equal(imported.statusCode,200,imported.body);
 const importedProject=imported.json().id;
 const [importedDoc]=(await admin.query('SELECT source_id FROM documents WHERE project_id=$1',[importedProject])).rows;
 assert.ok(importedDoc?.source_id,'import committed a source-bound PDF document');
 assert.equal(hash(await readOriginal(importedDoc.source_id)),hash(source),'import preserved the original PDF SHA');
 const recent=await req('GET','/api/workspace/recent');
 assert.equal(recent.statusCode,200,recent.body);
 const entry=recent.json().find((row:any)=>row.projectId===importedProject);
 assert.ok(entry,'imported PDF is recorded in recent workspaces');
 assert.equal(entry.reusableContentKnown,true,'recent profile was computed from the PDF review and page map');
});
