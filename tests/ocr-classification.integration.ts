// Real API regression for OCR edits and signed-table recognition.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,readOriginal,unseal} from '../packages/adapters/storage.ts';
import {detectComplete} from '../packages/core/recognition-pipeline.ts';
import {importedEntries} from '../packages/core/presets.ts';
import {officeImageFixture} from './office-fixtures.ts';
import {readZip,writeZip} from '../packages/core/office-zip.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app=await buildApp(),admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
after(async()=>{await app.close();await pool.end();await admin.end();});
async function fixture(){
 const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',cell=(value:string)=>`<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
 const parts=await readZip(await officeImageFixture(await readFile('tests/fixtures/image-utilities-synthetic.png'))),xml=parts.get('word/document.xml')!.toString();
 const pieces=['张','三','李','四','张','三'],table=`<w:tbl><w:tr>${pieces.map(()=>cell('签名')).join('')}</w:tr><w:tr>${pieces.map(cell).join('')}</w:tr></w:tbl>`;
 parts.set('word/document.xml',Buffer.from(xml.replace('</w:body>',`${table}</w:body>`)));
 return writeZip(parts);
}

async function session(){
 const tenant=randomUUID(),user=randomUUID(),username='ocr-signature-'+user,password='synthetic-ocr-signature';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const origin=process.env.APP_ORIGIN!,login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,binary=false)=>app.inject({method,url,payload,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}}});
 const made=await req('POST','/api/projects',{name:'OCR 分类与签署组隔离回归'});assert.equal(made.statusCode,200,made.body);
 return {req,project:made.json().id as string};
}
async function upload(s:Awaited<ReturnType<typeof session>>,source:Buffer){
 const batch=randomUUID(),requestId=randomUUID(),manifest=await s.req('POST',`/api/projects/${s.project}/upload-batches`,{id:batch,files:[{requestId,path:'signature-image.docx',size:source.length}]});assert.equal(manifest.statusCode,200,manifest.body);
 const sent=await s.req('POST',`/api/projects/${s.project}/files?batchId=${batch}&requestId=${requestId}`,source,true);assert.equal(sent.statusCode,200,sent.body);
 await tick();const id=sent.json().id as string,url=`/api/documents/${id}`,view=(await s.req('GET',url)).json();assert.equal(view.state,'review',JSON.stringify(view));
 return {id,url,view};
}
async function editAndReview(s:Awaited<ReturnType<typeof session>>,id:string,url:string,source:Buffer,expectedSignatureTexts:string[],replacement:'1'|'01'){
 const before=(await admin.query('SELECT * FROM documents WHERE id=$1',[id])).rows[0];
 const ocr=await s.req('GET',url+`/pages/0/ocr-text?revision=${before.revision}`);assert.equal(ocr.statusCode,200,ocr.body);
 const imageText=ocr.json().text as string,at=imageText.indexOf('13800138000')+10;assert.ok(at>=10,imageText);
 const changed=await s.req('PUT',url+'/pages/0/ocr-text',{revision:before.revision,start:at,end:at+1,expectedText:'0',text:replacement});assert.equal(changed.statusCode,200,changed.body);
 const current=(await admin.query('SELECT * FROM documents WHERE id=$1',[id])).rows[0],text=unseal(current.content,`${current.tenant_id}:${current.project_id}:${current.id}`),classified=detectComplete(text,current.anchors,[],{ocr:true,sourceFormat:'docx',filename:'signature-image.docx'}).classification;
 assert.equal(current.revision,before.revision+1);assert.deepEqual(current.recognition.classification,classified,'OCR edit must persist fresh classification');
 assert.deepEqual(current.marks.filter((m:any)=>m.signatureGroup).map((m:any)=>text.slice(m.start,m.end)),expectedSignatureTexts,'OCR edit must preserve full-name rules on signature fragments');
 assert.ok(current.marks.every((m:any)=>m.decision==='pending'),'OCR edit never approves findings');
 assert.deepEqual(await readOriginal(current.source_id),source,'OCR edit must not alter original bytes');
 const review=await s.req('PUT',url+'/review',{revision:current.revision,marks:current.marks.map((m:any)=>({...m,decision:'ignore'}))});assert.equal(review.statusCode,200,review.body);
 assert.deepEqual(await readOriginal(current.source_id),source);
}

for(const replacement of ['1','01'] as const)test(`embedded Word OCR ${replacement.length===1?'same-length':'plus-one'} edit keeps fresh classification and allows signed table review`,{timeout:240000},async()=>{
 const s=await session(),source=await fixture(),{id,url,view}=await upload(s,source);
 assert.equal(view.marks.filter((m:any)=>m.signatureGroup).length,6);
 await editAndReview(s,id,url,source,['张','三','李','四','张','三'],replacement);
});

for(const replacement of ['1','01'] as const)test(`embedded Word OCR ${replacement.length===1?'same-length':'plus-one'} edit preserves full logical-name forceSkip`,{timeout:240000},async()=>{
 const s=await session(),source=await fixture(),created=await s.req('POST','/api/presets/rulesets',{name:'OCR完整姓名跳过'});assert.equal(created.statusCode,200,created.body);
 const settings=created.json().settings,entries=importedEntries([{row:1,pattern:'张三',entityType:'name_cn',kind:'forceSkip',enabled:true}],'manual');
 const changed=await s.req('PUT',`/api/presets/rulesets/${settings.id}`,{revision:1,settings:{...settings,entries}});assert.equal(changed.statusCode,200,changed.body);
 const applied=await s.req('PUT',`/api/projects/${s.project}/presets`,{revision:0,profileId:null,rulesetId:settings.id,rulesetRevision:2});assert.equal(applied.statusCode,200,applied.body);
 const {id,url,view}=await upload(s,source);assert.deepEqual(view.marks.filter((m:any)=>m.signatureGroup).map((m:any)=>view.text.slice(m.start,m.end)),['李','四']);
 await editAndReview(s,id,url,source,['李','四'],replacement);
});

test('single-character forceSkip does not remove one physical signature member after OCR edit',{timeout:240000},async()=>{
 const s=await session(),source=await fixture(),created=await s.req('POST','/api/presets/rulesets',{name:'OCR单字跳过对照'});assert.equal(created.statusCode,200,created.body);
 const settings=created.json().settings,entries=importedEntries([{row:1,pattern:'张',entityType:'name_cn',kind:'forceSkip',enabled:true}],'manual');
 const changed=await s.req('PUT',`/api/presets/rulesets/${settings.id}`,{revision:1,settings:{...settings,entries}});assert.equal(changed.statusCode,200,changed.body);
 const applied=await s.req('PUT',`/api/projects/${s.project}/presets`,{revision:0,profileId:null,rulesetId:settings.id,rulesetRevision:2});assert.equal(applied.statusCode,200,applied.body);
 const {id,url,view}=await upload(s,source);assert.deepEqual(view.marks.filter((m:any)=>m.signatureGroup).map((m:any)=>view.text.slice(m.start,m.end)),['张','三','李','四','张','三']);
 await editAndReview(s,id,url,source,['张','三','李','四','张','三'],'01');
});
