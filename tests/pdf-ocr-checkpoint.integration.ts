import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool,scoped,rows,sql} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {pdfFixture} from './pdf-fixtures.ts';
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
async function user(tenant=randomUUID()){
 const uid=randomUUID(),username='checkpoint-'+randomUUID(),password='synthetic-checkpoint-password';
 await admin.query('INSERT INTO users(id,tenant_id,username,password_hash) VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const origin=process.env.APP_ORIGIN!,login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 return {tenant,uid,req:(method:any,url:string,payload?:any,binary=false)=>app.inject({method,url,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload})};
}
async function upload(req:Awaited<ReturnType<typeof user>>['req'],project:string,pages:number){
 const bytes=pdfFixture({pages,text:'Phone 13800138000 - synthetic page'}),batchId=randomUUID(),requestId=randomUUID();
 assert.equal((await req('POST',`/api/projects/${project}/upload-batches`,{id:batchId,files:[{requestId,path:'checkpoint.pdf',size:bytes.length}]})).statusCode,200);
 const response=await req('POST',`/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`,bytes,true);
 assert.equal(response.statusCode,200,response.body);
 return response.json().id as string;
}
function startWorker(){
 const {MIGRATION_DATABASE_URL,POSTGRES_PASSWORD,APP_DB_PASSWORD,ADMIN_PASSWORD,...env}=process.env;
 const child=spawn(process.execPath,['--import','tsx','apps/worker/main.ts'],{env,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout?.on('data',chunk=>{output+=String(chunk);});child.stderr?.on('data',chunk=>{output+=String(chunk);});
 const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',reject);});
 return{child,output:()=>output,async stop(signal:NodeJS.Signals='SIGKILL'){if(child.exitCode===null&&child.signalCode===null)child.kill(signal);return exited;}};
}
async function until<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,diagnostic:()=>string){
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,20));}
 throw Error(`PDF_CHECKPOINT_WAIT_TIMEOUT ${diagnostic()}`);
}
test('upload plus view_original without review still completes PDF detect and sees only sealed checkpoint rows',async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'PDF checkpoint permission'})).json().id;
 const member=await user(owner.tenant);
 await admin.query('INSERT INTO project_members(tenant_id,project_id,user_id,permissions) VALUES($1,$2,$3,$4)',[owner.tenant,project,member.uid,['upload','view_original']]);
 const doc=await upload(member.req,project,2);
 await tick();
 const [job]=(await admin.query('SELECT status,error_code FROM jobs WHERE document_id=$1',[doc])).rows;
 assert.equal(job.status,'succeeded',JSON.stringify(job));
 assert.equal((await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[doc])).rows[0].n,2);
 const visible=await scoped(member.uid,member.tenant,db=>rows(db,sql`SELECT page_index,payload FROM pdf_ocr_checkpoints WHERE document_id=${doc}`));
 assert.equal(visible.length,2);assert.ok(visible.every(row=>!row.payload.includes('13800138000')),'checkpoint page payload remains AEAD sealed');
});
test('real worker SIGKILL after a committed page; expired lease reclaims the same job and skips cached OCR pages',{timeout:90000},async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'PDF interrupted resume'})).json().id,doc=await upload(owner.req,project,20),worker=startWorker();
 let first:any,exitSignal:NodeJS.Signals|null=null;
 try{
  first=await until(async()=>{const [job]=(await admin.query('SELECT id,revision,status,generation,attempt FROM jobs WHERE document_id=$1',[doc])).rows;const count=(await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[doc])).rows[0].n;return{job,count};},value=>value.job?.status==='running'&&value.count>0&&value.count<20,worker.output);
  const stopped=await worker.stop('SIGKILL');exitSignal=stopped.signal;assert.equal(stopped.signal,'SIGKILL',worker.output());
 }finally{await worker.stop('SIGKILL');}
 const persisted=(await admin.query('SELECT page_index FROM pdf_ocr_checkpoints WHERE document_id=$1 ORDER BY page_index',[doc])).rows.map(r=>r.page_index as number);
 assert.ok(persisted.length>0&&persisted.length<20,`expected partial durable pages: ${JSON.stringify(persisted)}`);
 const [stopped]=(await admin.query('SELECT id,revision,status,generation,attempt FROM jobs WHERE document_id=$1',[doc])).rows;
 assert.equal(stopped.id,first.job.id);assert.equal(stopped.status,'running');assert.equal(stopped.generation,1);
 // Advance only the real claimed job's clock. Do not forge its status or the document revision.
 await admin.query("UPDATE jobs SET lease_until=now()-interval '1 second',available_at=now() WHERE id=$1 AND status='running' AND generation=$2",[stopped.id,stopped.generation]);
 assert.equal(await tick(),true,'claim_job must reclaim the expired real worker generation');
 const [finished]=(await admin.query('SELECT status,error_code,generation,attempt FROM jobs WHERE id=$1',[stopped.id])).rows;
 assert.equal(finished.status,'succeeded',JSON.stringify(finished));assert.equal(finished.generation,2);assert.equal(finished.attempt,2);
 const [firstAttempt]=(await admin.query('SELECT outcome,finished_at FROM attempts WHERE job_id=$1 AND generation=1',[stopped.id])).rows;
 assert.equal(firstAttempt.outcome,'lease_expired');assert.ok(firstAttempt.finished_at);
 const [d]=(await admin.query('SELECT state,page_data,content_hash FROM documents WHERE id=$1',[doc])).rows;
 assert.equal(d.state,'review');assert.equal(d.page_data.length,20);
 const afterRows=(await admin.query('SELECT page_index FROM pdf_ocr_checkpoints WHERE document_id=$1 ORDER BY page_index',[doc])).rows.map(r=>r.page_index as number);
 assert.deepEqual(afterRows,Array.from({length:20},(_,index)=>index));
 const events=(await owner.req('GET',`/api/jobs/${stopped.id}/events?limit=1000`)).json().items;
 const retryOcr=events.filter((e:any)=>e.event.type==='page-processed'&&e.event.stage==='ocr').map((e:any)=>e.event.pageNumber-1);
 assert.deepEqual(retryOcr,Array.from({length:20},(_,index)=>index).filter(index=>!persisted.includes(index)));
 console.log(JSON.stringify({kind:'pdf-checkpoint-real-sigkill',signal:exitSignal,firstGeneration:stopped.generation,nextGeneration:finished.generation,attempt:finished.attempt,firstAttemptOutcome:firstAttempt.outcome,persistedPages:persisted,recomputedPages:retryOcr,finalStatus:finished.status}));
});
test('real cancel API invalidates the old revision and never offers its checkpoint as a resumable prompt',{timeout:90000},async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'PDF explicit cancel guard'})).json().id,doc=await upload(owner.req,project,20),worker=startWorker();
 try{
  const observed=await until(async()=>{const [job]=(await admin.query('SELECT id,revision,status FROM jobs WHERE document_id=$1',[doc])).rows;const count=(await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[doc])).rows[0].n;return{job,count};},value=>value.job?.status==='running'&&value.count>0&&value.count<20,worker.output);
  const cancelled=await owner.req('POST',`/api/jobs/${observed.job.id}/cancel`);
  assert.equal(cancelled.statusCode,200,cancelled.body);
  const [current]=(await admin.query('SELECT state,revision FROM documents WHERE id=$1',[doc])).rows;
  assert.equal(current.state,'outdated');assert.equal(current.revision,observed.job.revision+1);
  assert.ok((await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[doc])).rows[0].n>0,'old-revision sealed cache still exists');
  const {listRecoverablePdfOcrCheckpoints}=await import('../packages/adapters/pdf-ocr-checkpoints.ts');
  const prompts=await scoped(owner.uid,owner.tenant,db=>listRecoverablePdfOcrCheckpoints(db,owner.uid,project));assert.deepEqual(prompts,[],'old revision cannot become a recoverable PDF prompt');
  const retry=await owner.req('POST',`/api/jobs/${observed.job.id}/retry`,{revision:observed.job.revision});assert.equal(retry.statusCode,409,retry.body);
  const events=await owner.req('GET',`/api/jobs/${observed.job.id}/events`);assert.equal(events.statusCode,409,events.body);
  console.log(JSON.stringify({kind:'pdf-checkpoint-real-cancel',cancelStatus:cancelled.statusCode,documentState:current.state,oldRevision:observed.job.revision,newRevision:current.revision,promptCount:prompts.length,retryStatus:retry.statusCode,eventStatus:events.statusCode}));
 }finally{await worker.stop('SIGKILL');}
});
test('checkpoint transaction rollback leaves no visible page; synthetic job termination waits for commit',async()=>{
 const {parsePages}=await import('../packages/adapters/page-parser.ts');
 const {setObjectOwner,hash}=await import('../packages/adapters/storage.ts');
 const {pdfOcrParserFingerprint,pdfOcrRotationPlanHash,savePdfOcrCheckpoint,listRecoverablePdfOcrCheckpoints}=await import('../packages/adapters/pdf-ocr-checkpoints.ts');
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'PDF commit witness'})).json().id,member=await user(owner.tenant);
 await admin.query('INSERT INTO project_members(tenant_id,project_id,user_id,permissions) VALUES($1,$2,$3,$4)',[owner.tenant,project,member.uid,['upload','view_original']]);
 const doc=await upload(member.req,project,1);
 const bytes=pdfFixture({pages:1,text:'Phone 13800138000 - synthetic page'});
 const [job]=(await admin.query("UPDATE jobs SET status='running',generation=1,lease_until=now()+interval '30 seconds' WHERE document_id=$1 RETURNING *",[doc])).rows;
 const [d]=(await admin.query('SELECT * FROM documents WHERE id=$1',[doc])).rows;
 setObjectOwner(doc);
 let frame:import('../packages/adapters/pdf-ocr-checkpoints.ts').PdfOcrCheckpoint|undefined;
 await assert.rejects(parsePages(bytes,'pdf',undefined,{onCheckpoint:value=>{frame=value;throw Error('stop-before-publish');}}),/stop-before-publish/);
 assert.ok(frame);
 const binding={jobId:job.id,generation:job.generation,tenantId:owner.tenant,projectId:project,userId:member.uid,documentId:doc,revision:d.revision,sourceHash:d.source_hash,contentHash:d.content_hash,processingHash:hash(bytes),rotationPlanHash:pdfOcrRotationPlanHash(d),parserFingerprint:await pdfOcrParserFingerprint(),parseVersion:d.parse_version};
 await assert.rejects(scoped(member.uid,member.tenant,async db=>{await savePdfOcrCheckpoint(db,binding,frame!);throw Error('rollback-before-commit');}),/rollback-before-commit/);
 assert.equal((await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[doc])).rows[0].n,0);
 let signalEntered:()=>void=()=>{},release:()=>void=()=>{};
 const entered=new Promise<void>(resolve=>{signalEntered=resolve;}),hold=new Promise<void>(resolve=>{release=resolve;});
 const writer=scoped(member.uid,member.tenant,async db=>{await savePdfOcrCheckpoint(db,binding,frame!);signalEntered();await hold;});
 await entered;
 let cancelled=false;
 const cancel=admin.query("UPDATE jobs SET status='cancelled',lease_until=NULL,error_code='TEST_INTERRUPTED' WHERE id=$1",[job.id]).then(()=>{cancelled=true;});
 await new Promise(resolve=>setTimeout(resolve,75));
 assert.equal(cancelled,false,'synthetic job status update must wait for the checkpoint transaction job lock');
 release();await writer;await cancel;
 assert.equal((await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[doc])).rows[0].n,1);
 await assert.rejects(scoped(member.uid,member.tenant,db=>savePdfOcrCheckpoint(db,binding,frame!)),/PDF_OCR_CHECKPOINT_STALE/);
 const prompt=await scoped(member.uid,member.tenant,db=>listRecoverablePdfOcrCheckpoints(db,member.uid,project));
 assert.equal(prompt.length,1);assert.equal(prompt[0].stage,'recognition_interrupted');assert.deepEqual(prompt[0].completedPages,[0]);
});
