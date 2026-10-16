import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
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
 return {uid,tenant,req:(method:'GET'|'POST'|'PUT',url:string,payload?:any,binary=false)=>app.inject({method,url,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload})};
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

const queue=()=>admin.query(`SELECT id,document_id,tenant_id,project_id,user_id,status,available_at,COALESCE(pdf_ocr_slot_id,id) slot_id FROM jobs WHERE status='queued' ORDER BY available_at,COALESCE(pdf_ocr_slot_id,id)`);
const slot=(j:any)=>[new Date(j.available_at).toISOString(),j.slot_id];
async function jobFor(doc:string){return (await admin.query('SELECT id,revision FROM jobs WHERE document_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[doc])).rows[0];}
function worker(){
 const {MIGRATION_DATABASE_URL,POSTGRES_PASSWORD,APP_DB_PASSWORD,ADMIN_PASSWORD,...env}=process.env;
 const child=spawn(process.execPath,['--import','tsx','apps/worker/main.ts'],{env,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout?.on('data',v=>output+=String(v));child.stderr?.on('data',v=>output+=String(v));
 const exited=new Promise<void>((resolve,reject)=>{child.once('exit',()=>resolve());child.once('error',reject);});
 return{output:()=>output,async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;}};
}

test('priority preempts only the same owner project, consumes old slot once and preserves B between target and continuation',{timeout:90000},async()=>{
 const owner=await user(),other=await user(),project=(await owner.req('POST','/api/projects',{name:'priority scope'})).json().id;
 const otherProject=(await owner.req('POST','/api/projects',{name:'other project'})).json().id;
 const a=await upload(owner.req,project,2),b=await upload(owner.req,project,2),selected=await upload(owner.req,project,2),foreign=await upload(owner.req,otherProject,2),foreignTenantProject=(await other.req('POST','/api/projects',{name:'foreign tenant'})).json().id,foreignTenant=await upload(other.req,foreignTenantProject,2);
 const ja=await jobFor(a),jb=await jobFor(b),jt=await jobFor(selected),jf=await jobFor(foreign),jft=await jobFor(foreignTenant);
 const at=['2020-01-01T00:00:00.000Z','2020-01-01T00:00:01.000Z','2020-01-01T00:00:02.000Z','2020-01-01T00:00:03.000Z','2020-01-01T00:00:04.000Z'];
 for(const [index,j] of [ja,jb,jt,jf,jft].entries())await admin.query('UPDATE jobs SET available_at=$2 WHERE id=$1',[j.id,at[index]]);
 await admin.query("UPDATE jobs SET status='running',generation=1,attempt=1,lease_until=now()+interval '60 seconds' WHERE id=$1",[ja.id]);
 await admin.query('INSERT INTO attempts(job_id,generation) VALUES($1,1)',[ja.id]);
 assert.equal((await owner.req('POST',`/api/jobs/${jt.id}/pdf-ocr/pause`,{revision:jt.revision})).statusCode,200);
 const before=(await queue()).rows,otherBefore=new Map(before.filter(j=>[jf.id,jft.id].includes(j.id)).map(j=>[j.id,slot(j)]));
 const requestId=randomUUID(),url=`/api/jobs/${jt.id}/pdf-ocr/prioritize`,body={revision:jt.revision,requestId};
 const [first,replay]=await Promise.all([owner.req('POST',url,body),owner.req('POST',url,body)]);
 assert.deepEqual([first.statusCode,replay.statusCode],[200,200],first.body+' '+replay.body);
 const responses=[first.json(),replay.json()];assert.deepEqual(responses.map(r=>r.replayed).sort(),[false,true]);
 const selectedJobId=responses[0].jobId,continuation=responses[0].continuationJobId;
 assert.equal(selectedJobId,responses[1].jobId);
 assert.ok(continuation&&continuation===responses[1].continuationJobId);
 const [old]=(await admin.query('SELECT status,error_code FROM jobs WHERE id=$1',[ja.id])).rows;
 assert.deepEqual([old.status,old.error_code],['cancelled','PDF_OCR_PRIORITY_PREEMPTED']);
 const after=(await queue()).rows;
 assert.deepEqual(after.filter(j=>[selectedJobId,jb.id,continuation].includes(j.id)).map(j=>j.id),[selectedJobId,jb.id,continuation]);
 assert.deepEqual(slot(after.find(j=>j.id===selectedJobId)),[at[0],ja.id]);
 assert.deepEqual(slot(after.find(j=>j.id===continuation))[1],selectedJobId);
 assert.deepEqual(slot(after.find(j=>j.id===jb.id)),[at[1],jb.id]);
 for(const [id,prior] of otherBefore)assert.deepEqual(slot(after.find(j=>j.id===id)),prior);
 assert.equal((await admin.query('SELECT count(*)::int n FROM jobs WHERE document_id=$1',[a])).rows[0].n,2);
 const waitingView=await owner.req('GET',`/api/documents/${a}`);
 assert.equal(waitingView.statusCode,200,waitingView.body);
 assert.equal(waitingView.json().job.id,continuation);
 assert.equal(waitingView.json().job.pdfOcrPriorityWaiting,true);
 const moved=await owner.req('POST',`/api/jobs/${continuation}/pdf-ocr/prioritize`,{revision:ja.revision,requestId:randomUUID()});
 assert.equal(moved.statusCode,200,moved.body);assert.equal(moved.json().jobId,continuation);
 const reordered=(await queue()).rows;
 assert.deepEqual(reordered.filter(j=>[selectedJobId,jb.id,continuation].includes(j.id)).map(j=>j.id),[continuation,jb.id,selectedJobId]);
 const selectedView=await owner.req('GET',`/api/documents/${a}`);
 assert.equal(selectedView.json().job.pdfOcrPriorityWaiting,false);
 assert.equal((await other.req('POST',url,body)).statusCode,404);
 assert.equal((await owner.req('POST',url,{revision:jt.revision+1,requestId})).statusCode,409);
 await admin.query('UPDATE documents SET source_hash=$2 WHERE id=$1',[selected,'0'.repeat(64)]);
 assert.equal((await owner.req('POST',url,body)).statusCode,409);
 await admin.query("UPDATE jobs SET status='cancelled' WHERE status IN ('queued','running')");
});

test('queued selected PDF swaps exact slot with first same-scope PDF while other scopes retain tuple',{timeout:90000},async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'queued priority'})).json().id,elsewhere=(await owner.req('POST','/api/projects',{name:'untouched'})).json().id;
 const a=await upload(owner.req,project,2),outside=await upload(owner.req,elsewhere,2),b=await upload(owner.req,project,2);
 const ja=await jobFor(a),jo=await jobFor(outside),jb=await jobFor(b);
 const at=['2020-01-02T00:00:00.000Z','2020-01-02T00:00:01.000Z','2020-01-02T00:00:02.000Z'];
 for(const [i,j] of [ja,jo,jb].entries())await admin.query('UPDATE jobs SET available_at=$2 WHERE id=$1',[j.id,at[i]]);
 assert.equal((await owner.req('POST',`/api/jobs/${jb.id}/pdf-ocr/pause`,{revision:jb.revision})).statusCode,200);
 const response=await owner.req('POST',`/api/jobs/${jb.id}/pdf-ocr/prioritize`,{revision:jb.revision,requestId:randomUUID()});
 assert.equal(response.statusCode,200,response.body);assert.equal(response.json().continuationJobId,null);
 const selectedJobId=response.json().jobId,after=(await queue()).rows;
 assert.deepEqual(after.filter(j=>[ja.id,jo.id,selectedJobId].includes(j.id)).map(j=>j.id),[selectedJobId,jo.id,ja.id]);
 assert.deepEqual(slot(after.find(j=>j.id===selectedJobId)),[at[0],ja.id]);
 assert.equal(slot(after.find(j=>j.id===ja.id))[1],selectedJobId);
 assert.deepEqual(slot(after.find(j=>j.id===jo.id)),[at[1],jo.id]);
 await admin.query("UPDATE jobs SET status='cancelled' WHERE status='queued'");
});

test('real worker preempts A after its page draft, finishes selected B, then resumes A with saved pages and human decision',{timeout:180000},async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'priority actual worker'})).json().id;
 const a=await upload(owner.req,project,20),b=await upload(owner.req,project,2),ja=await jobFor(a),jb=await jobFor(b);
 const pausedB=await owner.req('POST',`/api/jobs/${jb.id}/pdf-ocr/pause`,{revision:jb.revision});assert.equal(pausedB.statusCode,200,pausedB.body);
 const background=worker();
 try{
  await until(async()=>{const [job]=(await admin.query('SELECT status FROM jobs WHERE id=$1',[ja.id])).rows;const [pages]=(await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[a])).rows;return{status:job?.status,pages:pages.n};},v=>v.status==='running'&&v.pages>=2&&v.pages<20,90000);
  const draft=await owner.req('GET',`/api/jobs/${ja.id}/pdf-ocr/draft`);assert.equal(draft.statusCode,200,draft.body);
  const first=draft.json().pages[0],phone='13800138000',start=first.text.indexOf(phone);assert.ok(start>=0);
  const saved=await owner.req('PUT',`/api/jobs/${ja.id}/pdf-ocr/draft`,{revision:ja.revision,draftRevision:0,pageIndex:first.pageIndex,marks:[{start,end:start+phone.length,kind:'手机号',decision:'redact'}],removed:[]});assert.equal(saved.statusCode,200,saved.body);
  const before=(await admin.query('SELECT page_index,preview_id,preview_hash,map_id,map_hash FROM pdf_ocr_checkpoints WHERE document_id=$1 ORDER BY page_index',[a])).rows;assert.ok(before.length>=2&&before.length<20);
  const chosen=await owner.req('POST',`/api/jobs/${jb.id}/pdf-ocr/prioritize`,{revision:jb.revision,requestId:randomUUID()});assert.equal(chosen.statusCode,200,chosen.body);
  const selected=chosen.json().jobId as string,continuation=chosen.json().continuationJobId as string;assert.ok(continuation);
  const [preempted]=(await admin.query('SELECT status,error_code,pdf_ocr_pause_binding FROM jobs WHERE id=$1',[ja.id])).rows;
  assert.deepEqual([preempted.status,preempted.error_code],['cancelled','PDF_OCR_PRIORITY_PREEMPTED']);assert.ok(preempted.pdf_ocr_pause_binding);
  // The request can wait while A completes one more page. Its committed
  // cancellation fences later checkpoint writes, so this is the reuse boundary.
  const preemptedPages=(await admin.query('SELECT page_index,preview_id,preview_hash,map_id,map_hash FROM pdf_ocr_checkpoints WHERE document_id=$1 ORDER BY page_index',[a])).rows;
  for(const page of before)assert.deepEqual(preemptedPages.find((row:any)=>row.page_index===page.page_index),page);
  const [lineage]=(await admin.query('SELECT pdf_ocr_root_job_id,pdf_ocr_parent_job_id FROM jobs WHERE id=$1',[continuation])).rows;
  assert.deepEqual([lineage.pdf_ocr_root_job_id,lineage.pdf_ocr_parent_job_id],[ja.id,ja.id]);
  const inherited=await owner.req('GET',`/api/jobs/${continuation}/pdf-ocr/draft`);assert.equal(inherited.statusCode,200,inherited.body);
  assert.equal(inherited.json().pages.find((page:any)=>page.pageIndex===first.pageIndex).draftRevision,1);
  const bResult=await until(async()=>{const [j]=(await admin.query('SELECT status,error_code FROM jobs WHERE id=$1',[selected])).rows;return j;},j=>j?.status==='succeeded'||j?.status==='failed',90000);assert.equal(bResult.status,'succeeded',JSON.stringify({bResult,worker:background.output()}));
  const aResult=await until(async()=>{const [j]=(await admin.query('SELECT status,error_code FROM jobs WHERE id=$1',[continuation])).rows;return j;},j=>j?.status==='succeeded'||j?.status==='failed',90000);assert.equal(aResult.status,'succeeded',JSON.stringify({aResult,worker:background.output()}));
  const started=(await admin.query('SELECT job_id,started_at FROM attempts WHERE job_id=ANY($1::uuid[]) AND generation=1',[ [selected,continuation] ])).rows;
  assert.equal(started.length,2);assert.ok(new Date(started.find((row:any)=>row.job_id===selected).started_at).getTime()<=new Date(started.find((row:any)=>row.job_id===continuation).started_at).getTime());
  const after=(await admin.query('SELECT page_index,preview_id,preview_hash,map_id,map_hash FROM pdf_ocr_checkpoints WHERE document_id=$1 ORDER BY page_index',[a])).rows;
  assert.equal(after.length,20);for(const page of preemptedPages)assert.deepEqual(after.find((row:any)=>row.page_index===page.page_index),page);
  const events=(await owner.req('GET',`/api/jobs/${continuation}/events?limit=1000`)).json().items;
  assert.deepEqual(events.filter((item:any)=>item.event.type==='page-processed'&&item.event.stage==='ocr').map((item:any)=>item.event.pageNumber-1),Array.from({length:20},(_,index)=>index).filter(index=>!preemptedPages.some((row:any)=>row.page_index===index)));
  const [document]=(await admin.query('SELECT state,marks,anchors FROM documents WHERE id=$1',[a])).rows;assert.equal(document.state,'review');
  const page=document.anchors.find((item:any)=>item.kind==='page'&&item.page===first.pageIndex);
  const human=document.marks.find((item:any)=>item.start===page.start+start&&item.end===page.start+start+phone.length&&item.kind==='手机号');
  assert.equal(human?.decision,'redact');assert.equal(human?.userAdded,true);
 }finally{await background.stop();}
});
