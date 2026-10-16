import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';
import sharp from 'sharp';
import {RasterPdf} from '../packages/core/page-redaction.ts';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {pdfFixture} from './pdf-fixtures.ts';

const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
async function user(tenant=randomUUID()){
 const uid=randomUUID(),username='pdf-pause-'+randomUUID(),password='synthetic-pdf-pause-password';
 await admin.query('INSERT INTO users(id,tenant_id,username,password_hash) VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const origin=process.env.APP_ORIGIN!,login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 return {uid,tenant,req:(method:'GET'|'POST',url:string,payload?:any,binary=false)=>app.inject({method,url,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload})};
}
async function upload(req:Awaited<ReturnType<typeof user>>['req'],project:string,pages:number,source?:Buffer){
 const bytes=source??pdfFixture({pages,text:'Phone 13800138000 - synthetic page'}),batchId=randomUUID(),requestId=randomUUID();
 assert.equal((await req('POST',`/api/projects/${project}/upload-batches`,{id:batchId,files:[{requestId,path:'pause.pdf',size:bytes.length}]})).statusCode,200);
 const uploaded=await req('POST',`/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`,bytes,true);
 assert.equal(uploaded.statusCode,200,uploaded.body);
 return uploaded.json().id as string;
}
async function until<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,timeout=30000){
 const end=Date.now()+timeout;
 while(Date.now()<end){const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,30));}
 throw Error('PDF_OCR_CONTROL_WAIT_TIMEOUT');
}
function worker(){
 const {MIGRATION_DATABASE_URL,POSTGRES_PASSWORD,APP_DB_PASSWORD,ADMIN_PASSWORD,...env}=process.env;
 const child=spawn(process.execPath,['--import','tsx','apps/worker/main.ts'],{env,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout?.on('data',value=>{output+=String(value);});child.stderr?.on('data',value=>{output+=String(value);});
 const exited=new Promise<void>((resolve,reject)=>{child.once('exit',()=>resolve());child.once('error',reject);});
 return {output:()=>output,async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;}};
}

test('queued PDF can pause with zero pages and resume same revision; another member and generic retry cannot take it',{timeout:90000},async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'PDF OCR zero page pause'})).json().id,member=await user(owner.tenant);
 await admin.query('INSERT INTO project_members(tenant_id,project_id,user_id,permissions) VALUES($1,$2,$3,$4)',[owner.tenant,project,member.uid,['upload','review','view_original']]);
 const doc=await upload(owner.req,project,2),[first]=(await admin.query('SELECT id,revision FROM jobs WHERE document_id=$1',[doc])).rows;
 const paused=await owner.req('POST',`/api/jobs/${first.id}/pdf-ocr/pause`,{revision:first.revision});
 assert.equal(paused.statusCode,200,paused.body);
 const [state]=(await admin.query('SELECT state,revision FROM documents WHERE id=$1',[doc])).rows;
 assert.equal(state.state,'queued');assert.equal(state.revision,first.revision);
 assert.equal((await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[doc])).rows[0].n,0);
 assert.equal((await member.req('POST',`/api/jobs/${first.id}/pdf-ocr/resume`,{revision:first.revision})).statusCode,404);
 assert.equal((await owner.req('POST',`/api/jobs/${first.id}/retry`,{revision:first.revision})).statusCode,409);
 const resumed=await owner.req('POST',`/api/jobs/${first.id}/pdf-ocr/resume`,{revision:first.revision});
 assert.equal(resumed.statusCode,200,resumed.body);
 const next=resumed.json().jobId as string;
 assert.notEqual(next,first.id);
 assert.equal((await owner.req('POST',`/api/jobs/${first.id}/pdf-ocr/resume`,{revision:first.revision})).statusCode,409);
 assert.equal(await tick(),true);
 const [final]=(await admin.query('SELECT d.state,d.revision,j.status FROM documents d JOIN jobs j ON j.id=$2 WHERE d.id=$1',[doc,next])).rows;
 assert.equal(final.state,'review');assert.equal(final.revision,first.revision);assert.equal(final.status,'succeeded');
});

test('paused identity rejects version, source, rotation and parser drift before a new job is queued',{timeout:90000},async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'PDF OCR identity guards'})).json().id;
 const make=async()=>{const doc=await upload(owner.req,project,2),[job]=(await admin.query('SELECT id,revision FROM jobs WHERE document_id=$1',[doc])).rows;assert.equal((await owner.req('POST',`/api/jobs/${job.id}/pdf-ocr/pause`,{revision:job.revision})).statusCode,200);return{doc,job};};
 {
  const {doc,job}=await make();await admin.query('UPDATE documents SET revision=revision+1 WHERE id=$1',[doc]);
  assert.equal((await owner.req('POST',`/api/jobs/${job.id}/pdf-ocr/resume`,{revision:job.revision})).statusCode,409);
 }
 {
  const {doc,job}=await make();await admin.query('UPDATE documents SET source_hash=$2 WHERE id=$1',[doc,'0'.repeat(64)]);
  const response=await owner.req('POST',`/api/jobs/${job.id}/pdf-ocr/resume`,{revision:job.revision});assert.equal(response.statusCode,409,response.body);
  assert.equal((await admin.query('SELECT count(*)::int n FROM jobs WHERE document_id=$1',[doc])).rows[0].n,1);
 }
 {
  const {doc,job}=await make();await admin.query("UPDATE jobs SET pdf_ocr_pause_binding=jsonb_set(pdf_ocr_pause_binding,'{parserFingerprint}',to_jsonb($2::text)) WHERE id=$1",[job.id,'0'.repeat(64)]);
  assert.equal((await owner.req('POST',`/api/jobs/${job.id}/pdf-ocr/resume`,{revision:job.revision})).statusCode,409);
  assert.equal((await admin.query('SELECT count(*)::int n FROM jobs WHERE document_id=$1',[doc])).rows[0].n,1);
 }
 {
  const {doc,job}=await make();await admin.query("UPDATE documents SET page_rotation_state='not-a-valid-sealed-plan' WHERE id=$1",[doc]);
  assert.equal((await owner.req('POST',`/api/jobs/${job.id}/pdf-ocr/resume`,{revision:job.revision})).statusCode,409);
  assert.equal((await admin.query('SELECT count(*)::int n FROM jobs WHERE document_id=$1',[doc])).rows[0].n,1);
 }
});

test('revoked required review and manage_models permission blocks a paused NER-grade job',{timeout:90000},async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'PDF OCR permission guard'})).json().id,member=await user(owner.tenant);
 await admin.query('INSERT INTO project_members(tenant_id,project_id,user_id,permissions) VALUES($1,$2,$3,$4)',[owner.tenant,project,member.uid,['upload','view_original','review','manage_models']]);
 const doc=await upload(member.req,project,2),[job]=(await admin.query('SELECT id,revision FROM jobs WHERE document_id=$1',[doc])).rows;
 await admin.query("UPDATE jobs SET required_permissions=ARRAY['review','manage_models']::text[] WHERE id=$1",[job.id]);
 assert.equal((await member.req('POST',`/api/jobs/${job.id}/pdf-ocr/pause`,{revision:job.revision})).statusCode,200);
 await admin.query("UPDATE project_members SET permissions=ARRAY['upload','view_original','review']::text[] WHERE project_id=$1 AND user_id=$2",[project,member.uid]);
 assert.equal((await member.req('POST',`/api/jobs/${job.id}/pdf-ocr/resume`,{revision:job.revision})).statusCode,403);
 assert.equal((await admin.query('SELECT count(*)::int n FROM jobs WHERE document_id=$1',[doc])).rows[0].n,1);
});

test('actual raster PDF OCR retains recognized text/map and only computes unsaved bitmap pages on resume',{timeout:180000},async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'PDF OCR raster pause'})).json().id;
 const width=1000,height=220,png=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/><text x="32" y="145" font-family="Arial" font-size="72" fill="black">PHONE 13800138000</text></svg>`)).png().toBuffer();
 const rgb=await sharp(png).removeAlpha().raw().toBuffer(),pdf=new RasterPdf();for(let index=0;index<8;index++)pdf.add({index,width,height},rgb,width,height);
 const doc=await upload(owner.req,project,8,pdf.finish()),background=worker();
 try{
  const partial=await until(async()=>{const [job]=(await admin.query('SELECT id,revision,status FROM jobs WHERE document_id=$1',[doc])).rows;const count=(await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[doc])).rows[0].n;return{job,count};},value=>value.job?.status==='running'&&value.count>0&&value.count<8,90000);
  const paused=await owner.req('POST',`/api/jobs/${partial.job.id}/pdf-ocr/pause`,{revision:partial.job.revision});assert.equal(paused.statusCode,200,paused.body);
  const saved=(await admin.query('SELECT page_index,preview_id,preview_hash,map_id,map_hash FROM pdf_ocr_checkpoints WHERE document_id=$1 ORDER BY page_index',[doc])).rows;
  assert.ok(saved.length>0&&saved.length<8);
  const events=(await owner.req('GET',`/api/jobs/${partial.job.id}/events?limit=1000`)).json().items;
  const ocr=events.filter((item:any)=>item.event.type==='page-processed'&&item.event.stage==='ocr'&&saved.some(row=>row.page_index===item.event.pageNumber-1));
  assert.ok(ocr.some((item:any)=>item.event.ocrCachePage.text.trim().length>0&&item.event.ocrCachePage.glyphs.length>0),'bitmap OCR populated text and glyph map');
  const progress=await owner.req('GET',`/api/jobs/${partial.job.id}/pdf-ocr/progress`);assert.equal(progress.statusCode,200,progress.body);assert.deepEqual(progress.json().completedPageNumbers,saved.map(row=>row.page_index+1));
  const resumed=await owner.req('POST',`/api/jobs/${partial.job.id}/pdf-ocr/resume`,{revision:partial.job.revision});assert.equal(resumed.statusCode,200,resumed.body);
  const next=resumed.json().jobId as string;
  const outcome=await until(async()=>{const [job]=(await admin.query('SELECT status,error_code FROM jobs WHERE id=$1',[next])).rows;return job;},job=>job?.status==='succeeded'||job?.status==='failed',120000);
  assert.equal(outcome.status,'succeeded',JSON.stringify({outcome,output:background.output()}));
  const after=(await admin.query('SELECT page_index,preview_id,preview_hash,map_id,map_hash FROM pdf_ocr_checkpoints WHERE document_id=$1 ORDER BY page_index',[doc])).rows;
  assert.equal(after.length,8);for(const page of saved)assert.deepEqual(after.find(row=>row.page_index===page.page_index),page);
  const nextEvents=(await owner.req('GET',`/api/jobs/${next}/events?limit=1000`)).json().items;
  assert.deepEqual(nextEvents.filter((item:any)=>item.event.type==='page-processed'&&item.event.stage==='ocr').map((item:any)=>item.event.pageNumber-1),Array.from({length:8},(_,i)=>i).filter(i=>!saved.some(row=>row.page_index===i)));
 }finally{await background.stop();}
});

test('running PDF pause commits durable pages, worker exits before next claim, and resume reuses each saved page',{timeout:120000},async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'PDF OCR partial page pause'})).json().id;
 const doc=await upload(owner.req,project,20),background=worker();
 try{
  const partial=await until(async()=>{const [job]=(await admin.query('SELECT id,revision,status FROM jobs WHERE document_id=$1',[doc])).rows;const count=(await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[doc])).rows[0].n;return{job,count};},value=>value.job?.status==='running'&&value.count>0&&value.count<20,60000);
  const pause=await owner.req('POST',`/api/jobs/${partial.job.id}/pdf-ocr/pause`,{revision:partial.job.revision});
  assert.equal(pause.statusCode,200,pause.body);
  const saved=(await admin.query('SELECT page_index,preview_id,preview_hash FROM pdf_ocr_checkpoints WHERE document_id=$1 ORDER BY page_index',[doc])).rows;
  assert.ok(saved.length>0&&saved.length<20);
  const [paused]=(await admin.query('SELECT d.state,d.revision,j.status,j.error_code FROM documents d JOIN jobs j ON j.id=$2 WHERE d.id=$1',[doc,partial.job.id])).rows;
  assert.deepEqual([paused.state,paused.revision,paused.status,paused.error_code],['queued',partial.job.revision,'cancelled','PDF_OCR_PAUSED']);
  const resumed=await owner.req('POST',`/api/jobs/${partial.job.id}/pdf-ocr/resume`,{revision:partial.job.revision});
  assert.equal(resumed.statusCode,200,resumed.body);
  const next=resumed.json().jobId as string;
  await until(async()=>{const [j]=(await admin.query('SELECT status,error_code FROM jobs WHERE id=$1',[next])).rows;return j;},j=>j?.status==='succeeded'||j?.status==='failed',90000);
  const [finished]=(await admin.query('SELECT d.state,d.revision,j.status,j.error_code FROM documents d JOIN jobs j ON j.id=$2 WHERE d.id=$1',[doc,next])).rows;
  assert.equal(finished.status,'succeeded',JSON.stringify({finished,worker:background.output()}));
  assert.equal(finished.state,'review');assert.equal(finished.revision,partial.job.revision);
  const after=(await admin.query('SELECT page_index,preview_id,preview_hash FROM pdf_ocr_checkpoints WHERE document_id=$1 ORDER BY page_index',[doc])).rows;
  assert.equal(after.length,20);
  for(const page of saved){const actual=after.find(row=>row.page_index===page.page_index);assert.deepEqual(actual,page,'saved preview and hash were reused');}
  const events=(await owner.req('GET',`/api/jobs/${next}/events?limit=1000`)).json().items;
  const computed=events.filter((item:any)=>item.event.type==='page-processed'&&item.event.stage==='ocr').map((item:any)=>item.event.pageNumber-1);
  assert.deepEqual(computed,Array.from({length:20},(_,index)=>index).filter(index=>!saved.some(row=>row.page_index===index)));
 }finally{await background.stop();}
});
