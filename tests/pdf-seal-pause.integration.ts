import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,unseal} from '../packages/adapters/storage.ts';
import {pdfSealImageFixture} from './pdf-seal-image-fixture.ts';
import {readProcessingEvent} from '../packages/adapters/processing-events.ts';

const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
async function account(tenant=randomUUID()){
 const uid=randomUUID(),username='seal-pause-'+randomUUID(),password='synthetic-seal-pause-password';
 await admin.query('INSERT INTO users(id,tenant_id,username,password_hash) VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const origin=process.env.APP_ORIGIN!,login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 return {uid,tenant,req:(method:'GET'|'POST'|'PUT',url:string,payload?:any,binary=false)=>app.inject({method,url,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload})};
}
async function until<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,timeout=30000){
 const end=Date.now()+timeout;
 while(Date.now()<end){const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,20));}
 throw Error('SEAL_PAUSE_WAIT_TIMEOUT');
}

test('active own PDF detect defers seals while other recognition reaches review',{timeout:600000},async()=>{
 const owner=await account(),project=(await owner.req('POST','/api/projects',{name:'Seal pause real detect',applyDefaultPresets:true})).json().id;
 const source=pdfSealImageFixture(20),batchId=randomUUID(),requestId=randomUUID();
 assert.equal((await owner.req('POST',`/api/projects/${project}/upload-batches`,{id:batchId,files:[{requestId,path:'seals.pdf',size:source.length}]})).statusCode,200);
 const uploaded=await owner.req('POST',`/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`,source,true);
 assert.equal(uploaded.statusCode,200,uploaded.body);
 const doc=uploaded.json().id as string,[job]=(await admin.query('SELECT id,revision FROM jobs WHERE document_id=$1',[doc])).rows;
 const stop=new AbortController(),running=tick(stop.signal);
 try{
  await until(async()=>(await admin.query('SELECT status FROM jobs WHERE id=$1',[job.id])).rows[0]?.status,(status)=>status==='running');
  let lastSequence=0,sealPages=0;
  await until(async()=>{
   const events=(await admin.query('SELECT * FROM processing_events WHERE job_id=$1 AND sequence>$2 ORDER BY sequence',[job.id,lastSequence])).rows;
   for(const row of events){lastSequence=row.sequence;if(readProcessingEvent(row).event.type==='pdf-seal-page')sealPages++;}
   const status=(await admin.query('SELECT status,error_code FROM jobs WHERE id=$1',[job.id])).rows[0];
   if(status?.status==='failed')throw Error('SEAL_JOB_FAILED '+JSON.stringify(status));
   return sealPages;
  },count=>count>=1,480000);
  const first=await owner.req('GET',`/api/jobs/${job.id}/pdf-seals/progress`);
  assert.equal(first.statusCode,200,first.body);
  const beforePause=first.json();
  const eventCount=(await admin.query('SELECT count(*)::int AS n FROM processing_events WHERE job_id=$1',[job.id])).rows[0].n;
  assert.ok(beforePause.sealProgress.completedPageNumbers.length<20,`pause must precede last seal page; ${JSON.stringify({progress:beforePause,eventCount})}`);
  const paused=await owner.req('POST',`/api/jobs/${job.id}/pdf-seals/pause`,{revision:job.revision});
  assert.equal(paused.statusCode,200,paused.body);
  assert.equal(paused.json().status,'deferred');
  assert.equal(paused.json().paused,true);
  const progress=await owner.req('GET',`/api/jobs/${job.id}/pdf-seals/progress`);
  assert.equal(progress.statusCode,200,progress.body);
  assert.equal(progress.json().paused,true);
  await until(async()=>(await admin.query('SELECT state,recognition FROM documents WHERE id=$1',[doc])).rows[0],row=>row?.state==='review',480000);
  const [finished]=(await admin.query('SELECT state,recognition,marks,content FROM documents WHERE id=$1',[doc])).rows;
  assert.equal(finished.state,'review');
  assert.equal(finished.recognition.visual.sealProgress.status,'deferred');
  assert.equal(finished.recognition.visual.complete,false);
  const originalText=unseal(finished.content,`${owner.tenant}:${project}:${doc}`);
  assert.ok(finished.marks.some((mark:any)=>originalText.slice(mark.start,mark.end)==='13800138000'));
  assert.ok(finished.recognition.visual.sealProgress.completedPageNumbers.length>=1);
  assert.ok(finished.recognition.visual.sealProgress.completedPageNumbers.length<20);
  await running;
  const view=(await owner.req('GET',`/api/documents/${doc}`)).json();
  assert.equal(view.revision,0);
  const unscanned=Array.from({length:20},(_,i)=>i).find(i=>!finished.recognition.visual.sealProgress.completedPageNumbers.includes(i+1));
  assert.ok(unscanned!==undefined);
  const reviewed=await owner.req('PUT',`/api/documents/${doc}/review`,{revision:view.revision,marks:view.marks.map((mark:any)=>({...mark,decision:'redact'})),pageReview:{...view.pageReview,mode:'raster',deletedPages:[unscanned]}});
  assert.equal(reviewed.statusCode,200,reviewed.body);
  const human=(await owner.req('GET',`/api/documents/${doc}`)).json();
  assert.equal(human.revision,1);
  const beforeMarks=JSON.stringify(human.marks),beforeReview=JSON.stringify(human.pageReview);
  const password='synthetic-seal-pause-password',origin=process.env.APP_ORIGIN!;
  async function member(permissions:string[]){
   const username='seal-member-'+randomUUID(),created=await owner.req('POST','/api/organization/members',{username,password});
   assert.equal(created.statusCode,200,created.body);
   const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
   assert.equal(login.statusCode,200,login.body);
   const cookie=String(login.headers['set-cookie']).split(';')[0];
   const granted=await owner.req('PUT',`/api/projects/${project}/members/${created.json().id}`,{revision:null,permissions});
   assert.equal(granted.statusCode,200,granted.body);
   return (method:'GET'|'POST',url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload});
  }
  const reviewer=await member(['review','view_original','export']);
  const acknowledged=await reviewer('POST',`/api/documents/${doc}/export`,{revision:human.revision,manualSealChecked:true,pseudonymTableName:'seal-checked-before-supplement'});
  assert.equal(acknowledged.statusCode,200,acknowledged.body);
  const exporter=await member(['export']);
  const falseAck=await exporter('POST',`/api/documents/${doc}/export`,{revision:human.revision,manualSealChecked:true,pseudonymTableName:'not-reviewed'});
  assert.equal(falseAck.statusCode,403,falseAck.body);
  await tick();
  const [ackJob]=(await admin.query('SELECT status,pdf_seal_manual_checked FROM jobs WHERE id=$1',[acknowledged.json().id])).rows;
  assert.equal(ackJob.status,'succeeded');assert.equal(ackJob.pdf_seal_manual_checked,true);
  const supplementId=randomUUID(),supplement=await owner.req('POST',`/api/jobs/${job.id}/pdf-seals/supplement`,{revision:human.revision,requestId:supplementId});
  assert.equal(supplement.statusCode,200,supplement.body);
  assert.equal(supplement.json().sealProgress.status,'complete');
  assert.ok(!supplement.json().sealProgress.completedPageNumbers.includes(unscanned+1));
  const replay=await owner.req('POST',`/api/jobs/${job.id}/pdf-seals/supplement`,{revision:human.revision,requestId:supplementId});
  assert.equal(replay.statusCode,200,replay.body);assert.deepEqual(replay.json(),supplement.json());
  const after=(await owner.req('GET',`/api/documents/${doc}`)).json();
  assert.equal(after.revision,human.revision);assert.equal(JSON.stringify(after.marks),beforeMarks);assert.equal(JSON.stringify(after.pageReview),beforeReview);
  assert.equal(after.visualDiagnostics.sealProgress.status,'complete');
  const exported=await exporter('POST',`/api/documents/${doc}/export`,{revision:human.revision,pseudonymTableName:'seal-supplement-member'});
  assert.equal(exported.statusCode,200,exported.body);
  await tick();
  const [memberJob]=(await admin.query('SELECT status,pdf_seal_manual_checked FROM jobs WHERE id=$1',[exported.json().id])).rows;
  assert.equal(memberJob.status,'succeeded');assert.equal(memberJob.pdf_seal_manual_checked,false);
  await assert.rejects(admin.query('SELECT pdf_seal_lineage_witness($1::uuid,$2::integer,true,$3::integer[])',[doc,human.revision,Array.from({length:20},(_,i)=>i)]),(error:any)=>error.code==='42883');
 }finally{stop.abort();await running.catch(()=>{});}
});

test('pausing PDF seals after the first OCR checkpoint lets remaining OCR finish',{timeout:600000},async()=>{
 const owner=await account(),project=(await owner.req('POST','/api/projects',{name:'Seal pause during OCR',applyDefaultPresets:true})).json().id;
 const source=pdfSealImageFixture(20),batchId=randomUUID(),requestId=randomUUID();
 assert.equal((await owner.req('POST',`/api/projects/${project}/upload-batches`,{id:batchId,files:[{requestId,path:'early-seals.pdf',size:source.length}]})).statusCode,200);
 const uploaded=await owner.req('POST',`/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`,source,true);
 assert.equal(uploaded.statusCode,200,uploaded.body);
 const doc=uploaded.json().id as string,[job]=(await admin.query('SELECT id,revision FROM jobs WHERE document_id=$1',[doc])).rows;
 const stop=new AbortController(),running=tick(stop.signal);
 try{
  let ocrPages=0,sealPages=0,lastSequence=0;
  await until(async()=>{
   const events=(await admin.query('SELECT * FROM processing_events WHERE job_id=$1 AND sequence>$2 ORDER BY sequence',[job.id,lastSequence])).rows;
   for(const row of events){lastSequence=row.sequence;const event=readProcessingEvent(row).event;if(event.type==='page-processed'&&event.stage==='ocr')ocrPages++;if(event.type==='pdf-seal-page')sealPages++;}
   const status=(await admin.query('SELECT status,error_code FROM jobs WHERE id=$1',[job.id])).rows[0];
   if(status?.status==='failed')throw Error('SEAL_JOB_FAILED '+JSON.stringify(status));
   return ocrPages;
  },count=>count>=1,480000);
  assert.ok(ocrPages<20,`pause must precede last OCR page: ${ocrPages}`);
  assert.equal(sealPages,0,'seal scan must not have started');
  const paused=await owner.req('POST',`/api/jobs/${job.id}/pdf-seals/pause`,{revision:job.revision});
  assert.equal(paused.statusCode,200,paused.body);
  assert.equal(paused.json().paused,true);
  await until(async()=>(await admin.query('SELECT state,recognition,marks,content FROM documents WHERE id=$1',[doc])).rows[0],row=>row?.state==='review',480000);
  await running;
  const [finished]=(await admin.query('SELECT state,recognition,marks,content FROM documents WHERE id=$1',[doc])).rows;
  const events=(await admin.query('SELECT * FROM processing_events WHERE job_id=$1 ORDER BY sequence',[job.id])).rows.map(row=>readProcessingEvent(row).event);
  const finalOcrPages=new Set(events.flatMap(event=>event.type==='page-processed'&&event.stage==='ocr'?[event.pageNumber]:[]));
  assert.equal(finalOcrPages.size,20,'all remaining OCR pages must finish after the seal pause');
  assert.equal(finished.recognition.visual.sealProgress.status,'deferred');
  assert.deepEqual(finished.recognition.visual.sealProgress.completedPageNumbers,[]);
  const text=unseal(finished.content,`${owner.tenant}:${project}:${doc}`);
  assert.ok(finished.marks.some((mark:any)=>text.slice(mark.start,mark.end)==='13800138000'));
 }finally{stop.abort();await running.catch(()=>{});}
});
