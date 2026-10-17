import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {pdfFixture} from './pdf-fixtures.ts';
import {openPdf} from '../packages/core/pdf-reader.ts';
import sharp from 'sharp';

const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
async function user(){const uid=randomUUID(),tenant=randomUUID(),username='pdf-draft-'+randomUUID(),password='synthetic-pdf-draft-password';await admin.query('INSERT INTO users(id,tenant_id,username,password_hash) VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);const login=await app.inject({method:'POST',url:'/api/login',headers:{origin:process.env.APP_ORIGIN!},payload:{username,password}});assert.equal(login.statusCode,200);const cookie=String(login.headers['set-cookie']).split(';')[0];return{uid,tenant,req:(method:'GET'|'POST'|'PUT',url:string,payload?:any,binary=false)=>app.inject({method,url,headers:{origin:process.env.APP_ORIGIN!,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload})};}
async function upload(req:Awaited<ReturnType<typeof user>>['req'],project:string,pages:number){const bytes=pdfFixture({pages,text:'Phone 13800138000 - synthetic page'}),batchId=randomUUID(),requestId=randomUUID();assert.equal((await req('POST',`/api/projects/${project}/upload-batches`,{id:batchId,files:[{requestId,path:'draft.pdf',size:bytes.length}]})).statusCode,200);const response=await req('POST',`/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`,bytes,true);assert.equal(response.statusCode,200,response.body);return response.json().id as string;}
async function until<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('PDF_DRAFT_WAIT_TIMEOUT');}
function worker(){const {MIGRATION_DATABASE_URL,POSTGRES_PASSWORD,APP_DB_PASSWORD,ADMIN_PASSWORD,...env}=process.env;const child=spawn(process.execPath,['--import','tsx','apps/worker/main.ts'],{env,stdio:['ignore','pipe','pipe']});let output='';child.stdout?.on('data',v=>output+=String(v));child.stderr?.on('data',v=>output+=String(v));const exited=new Promise<void>((resolve,reject)=>{child.once('exit',()=>resolve());child.once('error',reject);});return{output:()=>output,async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;}};}

test('zero-page draft cannot invent a reviewed page; resume carries root detect lineage',{timeout:90000},async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'PDF draft zero'})).json().id,doc=await upload(owner.req,project,2),[first]=(await admin.query('SELECT id,revision FROM jobs WHERE document_id=$1',[doc])).rows;
 const list=await owner.req('GET',`/api/jobs/${first.id}/pdf-ocr/draft`);assert.equal(list.statusCode,200,list.body);assert.deepEqual(list.json().pages,[]);
 assert.equal((await owner.req('PUT',`/api/jobs/${first.id}/pdf-ocr/draft`,{revision:first.revision,draftRevision:0,pageIndex:0,marks:[],removed:[]})).statusCode,409);
 assert.equal((await owner.req('POST',`/api/jobs/${first.id}/pdf-ocr/pause`,{revision:first.revision})).statusCode,200);
 const resumed=await owner.req('POST',`/api/jobs/${first.id}/pdf-ocr/resume`,{revision:first.revision});assert.equal(resumed.statusCode,200,resumed.body);
 const [child]=(await admin.query('SELECT pdf_ocr_root_job_id FROM jobs WHERE id=$1',[resumed.json().jobId])).rows;assert.equal(child.pdf_ocr_root_job_id,first.id);
 const continuedDraft=await owner.req('GET',`/api/jobs/${resumed.json().jobId}/pdf-ocr/draft`);assert.equal(continuedDraft.statusCode,200,continuedDraft.body);
 const other=await upload(owner.req,project,2),[unrelated]=(await admin.query('SELECT id FROM jobs WHERE document_id=$1',[other])).rows;
 await admin.query('UPDATE jobs SET pdf_ocr_parent_job_id=$2 WHERE id=$1',[resumed.json().jobId,unrelated.id]);
 assert.equal((await owner.req('GET',`/api/jobs/${resumed.json().jobId}/pdf-ocr/draft`)).statusCode,409);
});

test('partial root draft survives a competing priority preemption, automatic continuation, review and export',{timeout:270000},async()=>{
 const owner=await user(),project=(await owner.req('POST','/api/projects',{name:'PDF draft merged'})).json().id,doc=await upload(owner.req,project,20),background=worker();
 try{
  const partial=await until(async()=>{const [j]=(await admin.query('SELECT id,revision,status FROM jobs WHERE document_id=$1',[doc])).rows;const count=(await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[doc])).rows[0].n;return{j,count};},v=>v.j?.status==='running'&&v.count>=2&&v.count<20,90000);
  const competing=await upload(owner.req,project,20),[competingRoot]=(await admin.query('SELECT id,revision FROM jobs WHERE document_id=$1',[competing])).rows;
  const pausedCompeting=await owner.req('POST',`/api/jobs/${competingRoot.id}/pdf-ocr/pause`,{revision:competingRoot.revision});assert.equal(pausedCompeting.statusCode,200,pausedCompeting.body);
  const draft=await owner.req('GET',`/api/jobs/${partial.j.id}/pdf-ocr/draft`);assert.equal(draft.statusCode,200,draft.body);
  const [first,second]=draft.json().pages;assert.ok(first&&second);
  const phone='13800138000',a=first.text.indexOf(phone),b=second.text.indexOf(phone);assert.ok(a>=0&&b>=0);
  assert.ok(first.machineCandidates.some((candidate:any)=>candidate.start===a&&candidate.end===a+phone.length&&candidate.kind==='手机号'),JSON.stringify(first.machineCandidates));
  const region={id:randomUUID(),x:5,y:5,width:20,height:20,shape:'rect',reason:'敏感区域'};
  const previewInput={revision:partial.j.revision,draftRevision:0,pageIndex:first.pageIndex,previewHash:first.previewHash,mapHash:first.mapHash,textHash:first.textHash,marks:[{start:a,end:a+phone.length,kind:'手机号',decision:'redact'}],removed:[],regions:[region],pageDeleted:false};
  const processed=await owner.req('POST',`/api/jobs/${partial.j.id}/pdf-ocr/draft/pages/${first.pageIndex}/preview`,previewInput);
  assert.equal(processed.statusCode,200,processed.body);
  assert.equal(processed.headers['cache-control'],'no-store');
  const processedPixels=await sharp(processed.rawPayload).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const maskedX=Math.floor(15*processedPixels.info.width/first.width),maskedY=Math.floor(15*processedPixels.info.height/first.height),maskedOffset=(maskedY*processedPixels.info.width+maskedX)*3;
  assert.deepEqual([...processedPixels.data.subarray(maskedOffset,maskedOffset+3)],[0,0,0]);
  assert.equal((await owner.req('POST',`/api/jobs/${partial.j.id}/pdf-ocr/draft/pages/${first.pageIndex}/preview`,{...previewInput,mapHash:'0'.repeat(64)})).statusCode,409);
  assert.equal((await owner.req('POST',`/api/jobs/${partial.j.id}/pdf-ocr/draft/pages/20/preview`,{...previewInput,pageIndex:20})).statusCode,409);
  assert.equal((await admin.query('SELECT count(*)::int n FROM pdf_ocr_review_drafts WHERE document_id=$1',[doc])).rows[0].n,0);
  assert.equal((await admin.query('SELECT state FROM documents WHERE id=$1',[doc])).rows[0].state,'queued');
  const preview=await owner.req('GET',`/api/jobs/${partial.j.id}/pdf-ocr/draft/pages/${first.pageIndex}`);assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.headers['cache-control'],'no-store');assert.equal((await sharp(preview.rawPayload).metadata()).format,'png');
  const originalPixels=await sharp(preview.rawPayload).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const originalX=Math.floor(15*originalPixels.info.width/first.width),originalY=Math.floor(15*originalPixels.info.height/first.height),originalOffset=(originalY*originalPixels.info.width+originalX)*3;
  assert.notDeepEqual([...originalPixels.data.subarray(originalOffset,originalOffset+3)],[0,0,0]);
  const add=await owner.req('PUT',`/api/jobs/${partial.j.id}/pdf-ocr/draft`,{revision:partial.j.revision,draftRevision:0,pageIndex:first.pageIndex,marks:[{start:a,end:a+phone.length,kind:'手机号',decision:'redact'}],removed:[],regions:[region],pageDeleted:false});assert.equal(add.statusCode,200,add.body);
  assert.equal((await owner.req('PUT',`/api/jobs/${partial.j.id}/pdf-ocr/draft`,{revision:partial.j.revision,draftRevision:1,pageIndex:first.pageIndex,marks:[],removed:[],regions:[{...region,x:first.width}],pageDeleted:false})).statusCode,400);
  const remove=await owner.req('PUT',`/api/jobs/${partial.j.id}/pdf-ocr/draft`,{revision:partial.j.revision,draftRevision:0,pageIndex:second.pageIndex,marks:[],removed:[{start:b,end:b+phone.length,kind:'手机号'}],regions:[],pageDeleted:true});assert.equal(remove.statusCode,200,remove.body);
  assert.equal((await owner.req('PUT',`/api/jobs/${partial.j.id}/pdf-ocr/draft`,{revision:partial.j.revision,draftRevision:0,pageIndex:first.pageIndex,marks:[],removed:[]})).statusCode,409);
  const [stillRunning]=(await admin.query('SELECT status FROM jobs WHERE id=$1',[partial.j.id])).rows;assert.equal(stillRunning.status,'running');
  const prioritized=await owner.req('POST',`/api/jobs/${competingRoot.id}/pdf-ocr/prioritize`,{revision:competingRoot.revision,requestId:randomUUID()});assert.equal(prioritized.statusCode,200,prioritized.body);assert.ok(prioritized.json().continuationJobId);
  const selectedB=prioritized.json().jobId,next=prioritized.json().continuationJobId,[child]=(await admin.query('SELECT pdf_ocr_root_job_id,pdf_ocr_parent_job_id,required_permissions FROM jobs WHERE id=$1',[next])).rows;assert.equal(child.pdf_ocr_root_job_id,partial.j.id);assert.equal(child.pdf_ocr_parent_job_id,partial.j.id);assert.ok(child.required_permissions.includes('review'));
  const inherited=await owner.req('GET',`/api/jobs/${next}/pdf-ocr/draft`);assert.equal(inherited.statusCode,200,inherited.body);assert.equal(inherited.json().pages.find((p:any)=>p.pageIndex===first.pageIndex).draftRevision,1);
  const competingOutcome=await until(async()=>{const[j]=(await admin.query('SELECT status,error_code FROM jobs WHERE id=$1',[selectedB])).rows;return j;},j=>j?.status==='succeeded'||j?.status==='failed',90000);assert.equal(competingOutcome.status,'succeeded',JSON.stringify(competingOutcome));
  const outcome=await until(async()=>{const[j]=(await admin.query('SELECT status,error_code FROM jobs WHERE id=$1',[next])).rows;return j;},j=>j?.status==='succeeded'||j?.status==='failed',90000);assert.equal(outcome.status,'succeeded',JSON.stringify({outcome,worker:background.output()}));
  const [order]=(await admin.query('SELECT (SELECT finished_at FROM attempts WHERE job_id=$1 ORDER BY generation DESC LIMIT 1) AS competing_finished,(SELECT started_at FROM attempts WHERE job_id=$2 ORDER BY generation DESC LIMIT 1) AS continuation_started',[selectedB,next])).rows;assert.ok(new Date(order.competing_finished).getTime()<=new Date(order.continuation_started).getTime());
  const [document]=(await admin.query('SELECT state,revision,marks,anchors FROM documents WHERE id=$1',[doc])).rows;assert.equal(document.state,'review');assert.equal(document.revision,partial.j.revision);
  const p0=document.anchors.find((a:any)=>a.kind==='page'&&a.page===first.pageIndex),p1=document.anchors.find((a:any)=>a.kind==='page'&&a.page===second.pageIndex);
  const human=document.marks.find((m:any)=>m.start===p0.start+a&&m.end===p0.start+a+phone.length&&m.kind==='手机号');assert.equal(human.decision,'redact');assert.equal(human.userAdded,true);
  const deleted=document.marks.find((m:any)=>m.start===p1.start+b&&m.end===p1.start+b+phone.length&&m.kind==='手机号');assert.equal(deleted.decision,'ignore');assert.ok(deleted.sources.some((s:any)=>s.code==='pdf-ocr-draft-remove'));
  const [snapshot]=(await admin.query('SELECT review_mode FROM review_snapshots WHERE document_id=$1 AND revision=$2',[doc,document.revision])).rows;assert.notEqual(snapshot.review_mode,'human_review');assert.notEqual(snapshot.review_mode,'automatic');
  let view=(await owner.req('GET',`/api/documents/${doc}`)).json();assert.deepEqual(view.pageReview.regions,[{...region,page:first.pageIndex}]);assert.deepEqual(view.pageReview.deletedPages,[second.pageIndex]);assert.equal(view.pageReview.mode,'unselected');
  const lateRegion={...region,x:35};
  const lateInput={revision:partial.j.revision,draftRevision:1,pageIndex:first.pageIndex,previewHash:first.previewHash,mapHash:first.mapHash,textHash:first.textHash,marks:[{start:a,end:a+phone.length,kind:'手机号',decision:'redact'}],removed:[],regions:[lateRegion],pageDeleted:false};
  assert.equal((await owner.req('PUT',`/api/jobs/${partial.j.id}/pdf-ocr/draft`,{revision:partial.j.revision,draftRevision:1,pageIndex:first.pageIndex,marks:[],removed:[]})).statusCode,409);
  assert.equal((await owner.req('PUT',`/api/jobs/${partial.j.id}/pdf-ocr/draft/complete`,{...lateInput,mapHash:'0'.repeat(64)})).statusCode,409);
  assert.equal((await owner.req('GET',`/api/documents/${doc}`)).json().revision,partial.j.revision);
  const late=await owner.req('PUT',`/api/jobs/${partial.j.id}/pdf-ocr/draft/complete`,lateInput);assert.equal(late.statusCode,200,late.body);assert.equal(late.json().reviewRequired,true);
  view=(await owner.req('GET',`/api/documents/${doc}`)).json();assert.equal(view.revision,partial.j.revision+1);assert.deepEqual(view.pageReview.regions,[{...lateRegion,page:first.pageIndex}]);assert.deepEqual(view.pageReview.deletedPages,[second.pageIndex]);
  const[humanSnapshot]=(await admin.query('SELECT review_mode FROM review_snapshots WHERE document_id=$1 AND revision=$2',[doc,view.revision])).rows;assert.equal(humanSnapshot.review_mode,'human_review');
  const reviewed=await owner.req('PUT',`/api/documents/${doc}/review`,{revision:view.revision,marks:view.marks.map((m:any)=>({...m,decision:m.kind==='手机号'?'redact':m.decision==='redact'?'redact':'ignore'})),pageReview:{...view.pageReview,mode:'raster'}});assert.equal(reviewed.statusCode,200,reviewed.body);
  const approved=(await owner.req('GET',`/api/documents/${doc}`)).json(),exported=await owner.req('POST',`/api/documents/${doc}/export`,{revision:approved.revision});assert.equal(exported.statusCode,200,exported.body);
  const exportJob=exported.json().jobId??exported.json().id;assert.ok(exportJob,exported.body);
  const delivered=await until(async()=>{const[j]=(await admin.query('SELECT status,error_code FROM jobs WHERE id=$1',[exportJob])).rows;return j;},j=>j?.status==='succeeded'||j?.status==='failed',90000);assert.equal(delivered.status,'succeeded',JSON.stringify(delivered));
  const link=await owner.req('POST',`/api/documents/${doc}/download-link`,{revision:approved.revision});assert.equal(link.statusCode,200,link.body);
  const output=await app.inject({url:link.json().url});assert.equal(output.statusCode,200,output.body);
  const exportedPdf=await openPdf(output.rawPayload);try{assert.equal(exportedPdf.count,19);const rendered=await exportedPdf.page(0),pixels=await sharp(rendered.png).removeAlpha().raw().toBuffer({resolveWithObject:true});const x=Math.floor((lateRegion.x+lateRegion.width/2)*pixels.info.width/first.width),y=Math.floor((lateRegion.y+lateRegion.height/2)*pixels.info.height/first.height);assert.deepEqual([...pixels.data.subarray((y*pixels.info.width+x)*3,(y*pixels.info.width+x)*3+3)],[0,0,0]);}finally{exportedPdf.close();}
 }finally{await background.stop();}
});
