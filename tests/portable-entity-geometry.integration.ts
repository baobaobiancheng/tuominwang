import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,readOriginal,hash,unseal} from '../packages/adapters/storage.ts';
import {readPortableWorkspace,writePortableWorkspace} from '../packages/core/workspace-portable.ts';
import {officeImageFixture} from './office-fixtures.ts';
import {pdfFixture} from './pdf-fixtures.ts';
import {geometryEnvelope,geometryMarkIdentity,transformEntityGeometry,type EntityGeometryDescriptor} from '../packages/contracts/entity-geometry.ts';

const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
const proof:any[]=[];let s:Awaited<ReturnType<typeof session>>;const old=new Map<string,any>();
after(async()=>{try{if(proof.length===12){await mkdir('.data/research/lawbot-2026-10-15/iteration035',{recursive:true});await writeFile('.data/research/lawbot-2026-10-15/iteration035/portable-entity-geometry-actual.json',JSON.stringify({runtime:process.version,fixtures:'synthetic-only',rows:proof,competitorRuntime:'R0'},null,2));}}finally{await app.close();await pool.end();await admin.end();}});
async function session(){
 const tenant=randomUUID(),user=randomUUID(),username='portable-geometry-'+randomUUID(),password='synthetic-portable-geometry';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const origin=process.env.APP_ORIGIN!,login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}}),cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,binary=false)=>app.inject({method,url,payload,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}}});
 return{tenant,user,req,project:(await req('POST','/api/projects',{name:'原实体几何完整备份重开'})).json().id};
}
async function upload(s:Awaited<ReturnType<typeof session>>,name:string,source:Buffer){
 const batch=randomUUID(),request=randomUUID();assert.equal((await s.req('POST',`/api/projects/${s.project}/upload-batches`,{id:batch,files:[{requestId:request,path:name,size:source.length}]})).statusCode,200);
 const uploaded=await s.req('POST',`/api/projects/${s.project}/files?batchId=${batch}&requestId=${request}`,source,true);assert.equal(uploaded.statusCode,200,uploaded.body);await tick();
 const id=uploaded.json().id,url='/api/documents/'+id,view=(await s.req('GET',url)).json();assert.equal(view.state,'review',JSON.stringify(view.job));return{id,url,view};
}
before(async()=>{
 s=await session();const image=await readFile('tests/fixtures/image-utilities-synthetic.png'),sources=[['png',image],['docx',await officeImageFixture(image)],['pdf',pdfFixture({pages:1})]] as const;
 for(const[format,source]of sources){
  const doc=await upload(s,'portable-geometry.'+format,source),descriptors=await s.req('POST',doc.url+'/pages/0/entity-geometries',{revision:0});assert.equal(descriptors.statusCode,200,descriptors.body);
  const descriptor=(descriptors.json().entities as EntityGeometryDescriptor[]).find(e=>e.text.replace(/\s/gu,'')==='13800138000');assert.ok(descriptor,descriptors.body);
  const row=(await admin.query('SELECT * FROM documents WHERE id=$1',[doc.id])).rows[0],mark=row.marks[descriptor.markIndex],bound=geometryEnvelope(descriptor.bboxes),expanded={x:Math.max(0,bound.x-3),y:Math.max(0,bound.y-3),width:bound.width+3,height:bound.height+3},bboxes=transformEntityGeometry(descriptor.bboxes,expanded),region={id:randomUUID(),page:descriptor.page,...geometryEnvelope(bboxes),shape:'rect',reason:'敏感区域',entityType:descriptor.entityType,text:descriptor.text,meta:{entityGeometryBinding:{reviewEntityId:descriptor.reviewEntityId,markIndex:descriptor.markIndex,start:mark.start,end:mark.end,identity:geometryMarkIdentity(mark)},entityGeometryOverride:{version:1,token:descriptor.token,bboxes}}};
  const marks=doc.view.marks.map((m:any,i:number)=>({...m,decision:i===descriptor.markIndex?'redact':'ignore'}));
  const saved=await s.req('PUT',doc.url+'/review',{revision:0,marks,pageReview:{mode:'raster',regions:[region],deletedPages:[]}});assert.equal(saved.statusCode,200,saved.body);
  const current=(await s.req('GET',doc.url)).json();old.set(format,{sourceHash:hash(source),geometry:current.pageReview.regions[0],source,oldId:doc.id});
 }
},{timeout:240000});
for(const format of['native','legacy-zip','secure-v2','secure-v3'] as const)test(`actual PNG/PDF/Word entity edits survive ${format} backup with fresh scoped tokens, exact slots and pending human confirmation`,{timeout:240000},async()=>{
 {
  const password='synthetic-geometry-backup',backup=await s.req('POST',`/api/projects/${s.project}/portable/export`,{format,password});assert.equal(backup.statusCode,200,backup.body);
  let bytes=backup.rawPayload;
  if(format!=='native'){
   const source=await readPortableWorkspace(bytes,{password});delete source.snapshot.tuominwangNative;
   for(const d of source.snapshot.documents){assert.equal(d.entityGeometryArchive.version,1);assert.ok(d.entityGeometryArchive.regions.length);}
   bytes=await writePortableWorkspace(source.snapshot,source.sources,{format,...format==='legacy-zip'?{}:{password}});
  }
  const imported=await s.req('POST','/api/portable/import',{name:'几何重开 '+format,password,bytesBase64:bytes.toString('base64')});assert.equal(imported.statusCode,200,imported.body);
  for(let i=0;i<3;i++)await tick();
  const docs=(await admin.query('SELECT * FROM documents WHERE project_id=$1 ORDER BY source_format',[imported.json().id])).rows;assert.equal(docs.length,3);
  for(const d of docs){
   assert.equal(d.state,'review');const previous=old.get(d.source_format),restored=await s.req('POST',`/api/documents/${d.id}/portable-draft/restore`,{revision:d.revision});assert.equal(restored.statusCode,200,JSON.stringify({format,source:d.source_format,body:restored.body}));
   assert.deepEqual(restored.json().pending.unresolved,[],JSON.stringify(restored.json().pending));
   const candidates=restored.json().pending.regions.filter((r:any)=>r.meta?.entityGeometryOverride);assert.equal(candidates.length,1,JSON.stringify(restored.json().pending));
   const candidate=candidates[0];assert.notEqual(candidate.meta.entityGeometryOverride.token,previous.geometry.meta.entityGeometryOverride.token);assert.notEqual(candidate.meta.entityGeometryBinding.reviewEntityId,previous.geometry.meta.entityGeometryBinding.reviewEntityId);assert.deepEqual(candidate.meta.entityGeometryOverride.bboxes,previous.geometry.meta.entityGeometryOverride.bboxes);
   const confirmed=await s.req('POST',`/api/documents/${d.id}/portable-draft/confirm-region`,{revision:restored.json().revision,regionId:candidate.id});assert.equal(confirmed.statusCode,200,confirmed.body);
   let view=(await s.req('GET',`/api/documents/${d.id}`)).json();assert.ok(view.marks.every((m:any)=>m.decision==='pending'));assert.equal(view.pageReview.regions.length,1);
   const row=(await admin.query('SELECT * FROM documents WHERE id=$1',[d.id])).rows[0];assert.deepEqual(await readOriginal(row.source_id),previous.source);
   const index=candidate.meta.entityGeometryBinding.markIndex,marks=view.marks.map((m:any,i:number)=>({...m,decision:i===index?'redact':'ignore'})),review={...view.pageReview,mode:'raster'},preview=await s.req('POST',`/api/documents/${d.id}/pages/0/preview`,{revision:view.revision,marks,pageReview:review});assert.equal(preview.statusCode,200,preview.body.slice(0,180));
   const saved=await s.req('PUT',`/api/documents/${d.id}/review`,{revision:view.revision,marks,pageReview:review});assert.equal(saved.statusCode,200,saved.body);view=(await s.req('GET',`/api/documents/${d.id}`)).json();
   assert.equal((await s.req('POST',`/api/documents/${d.id}/export`,{revision:view.revision})).statusCode,200);await tick();view=(await s.req('GET',`/api/documents/${d.id}`)).json();assert.equal(view.job.status,'succeeded',JSON.stringify({format,source:d.source_format,job:view.job}));
   const link=await s.req('POST',`/api/documents/${d.id}/download-link`,{revision:view.revision});assert.equal(link.statusCode,200,link.body);assert.equal((await app.inject({url:link.json().url})).statusCode,200);
   const privateState=(await admin.query('SELECT portable_state FROM projects WHERE id=$1',[imported.json().id])).rows[0].portable_state;assert.ok(!privateState.includes('13800138000'));
   proof.push({archiveFormat:format,materialFormat:d.source_format,sourceHash:previous.sourceHash,newScope:true,exactSlot:index,pendingBeforeConfirmation:true,previewExport:true});
  }
 }
});
