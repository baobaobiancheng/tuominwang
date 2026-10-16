import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,readOriginal} from '../packages/adapters/storage.ts';
import {pdfFixture} from './pdf-fixtures.ts';

const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
async function session(){const uid=randomUUID(),tenant=randomUUID(),username='pdf-rotation-'+randomUUID(),password='synthetic-rotation-password';await admin.query('INSERT INTO users(id,tenant_id,username,password_hash) VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);const origin=process.env.APP_ORIGIN!,login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200);const cookie=String(login.headers['set-cookie']).split(';')[0];return{uid,tenant,req:(method:'GET'|'POST'|'PUT',url:string,payload?:any,binary=false)=>app.inject({method,url,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload})};}
async function upload(req:Awaited<ReturnType<typeof session>>['req'],project:string,pages=20){const bytes=pdfFixture({pages,text:'Phone 13800138000 - synthetic page'}),batchId=randomUUID(),requestId=randomUUID();assert.equal((await req('POST',`/api/projects/${project}/upload-batches`,{id:batchId,files:[{requestId,path:'rotate.pdf',size:bytes.length}]})).statusCode,200);const response=await req('POST',`/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`,bytes,true);assert.equal(response.statusCode,200,response.body);return{id:response.json().id as string,bytes};}
async function until<T>(read:()=>Promise<T>,accept:(value:T)=>boolean,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('PDF_ROTATION_WAIT_TIMEOUT');}
function worker(){const {MIGRATION_DATABASE_URL,POSTGRES_PASSWORD,APP_DB_PASSWORD,ADMIN_PASSWORD,...env}=process.env;const child=spawn(process.execPath,['--import','tsx','apps/worker/main.ts'],{env,stdio:['ignore','pipe','pipe']});let output='';child.stdout?.on('data',v=>output+=String(v));child.stderr?.on('data',v=>output+=String(v));const exited=new Promise<void>((resolve,reject)=>{child.once('exit',()=>resolve());child.once('error',reject);});return{output:()=>output,async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;}};}

test('running PDF rotation preserves untouched page drafts and deleted page across another rotation',{timeout:270000},async()=>{
 const owner=await session(),project=(await owner.req('POST','/api/projects',{name:'Running PDF rotation'})).json().id,{id:doc,bytes}=await upload(owner.req,project),background=worker();
 try{
  const partial=await until(async()=>{const[j]=(await admin.query('SELECT id,revision,status FROM jobs WHERE document_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[doc])).rows;const count=(await admin.query('SELECT count(*)::int n FROM pdf_ocr_checkpoints WHERE document_id=$1',[doc])).rows[0].n;return{j,count};},v=>v.j?.status==='running'&&v.count>=3&&v.count<20);
  const paused=await owner.req('POST',`/api/jobs/${partial.j.id}/pdf-ocr/pause`,{revision:partial.j.revision});assert.equal(paused.statusCode,200,paused.body);
  await background.stop();
  const [oldDoc]=(await admin.query('SELECT revision,source_id,source_hash FROM documents WHERE id=$1',[doc])).rows,oldRows=(await admin.query('SELECT page_index,preview_id,preview_hash,map_id,map_hash FROM pdf_ocr_checkpoints WHERE document_id=$1 AND revision=$2 ORDER BY page_index',[doc,oldDoc.revision])).rows;
  const draft=await owner.req('GET',`/api/jobs/${partial.j.id}/pdf-ocr/draft`);assert.equal(draft.statusCode,200,draft.body);const [first,second]=draft.json().pages;assert.ok(first&&second);
  const phone='13800138000',at=second.text.indexOf(phone);assert.ok(at>=0);
  const deleted=await owner.req('PUT',`/api/jobs/${partial.j.id}/pdf-ocr/draft`,{revision:oldDoc.revision,draftRevision:0,pageIndex:first.pageIndex,marks:[],removed:[],regions:[],pageDeleted:true});assert.equal(deleted.statusCode,200,deleted.body);
  const retained=await owner.req('PUT',`/api/jobs/${partial.j.id}/pdf-ocr/draft`,{revision:oldDoc.revision,draftRevision:0,pageIndex:second.pageIndex,marks:[{start:at,end:at+phone.length,kind:'手机号',decision:'redact'}],removed:[],regions:[],pageDeleted:false});assert.equal(retained.statusCode,200,retained.body);
  const manual=await owner.req('POST',`/api/documents/${doc}/page-rotations`,{revision:oldDoc.revision,mode:'manual',pages:[first.pageIndex],rotations:{[first.pageIndex]:90}});assert.equal(manual.statusCode,200,manual.body);assert.equal(manual.json().revision,oldDoc.revision+1);
  assert.equal(manual.json().status,'paused');assert.equal(await tick(),false);
  const manualJob=manual.json().jobId,manualDraft=await owner.req('GET',`/api/jobs/${manualJob}/pdf-ocr/draft`);assert.equal(manualDraft.statusCode,200,manualDraft.body);
  assert.equal(manualDraft.json().pages.find((p:any)=>p.pageIndex===first.pageIndex).draft.pageDeleted,true);
  assert.deepEqual(manualDraft.json().pages.find((p:any)=>p.pageIndex===first.pageIndex).draft.marks,[]);
  assert.deepEqual(manualDraft.json().pages.find((p:any)=>p.pageIndex===first.pageIndex).machineCandidates,[]);
  assert.equal(manualDraft.json().pages.find((p:any)=>p.pageIndex===second.pageIndex).draft.marks[0].decision,'redact');
  const manualRows=(await admin.query('SELECT page_index,preview_id,preview_hash,map_id,map_hash FROM pdf_ocr_checkpoints WHERE document_id=$1 AND revision=$2 ORDER BY page_index',[doc,oldDoc.revision+1])).rows;
  const [oldWitness]=(await admin.query('SELECT * FROM pdf_ocr_checkpoints WHERE document_id=$1 AND revision=$2 AND page_index=$3',[doc,oldDoc.revision,second.pageIndex])).rows;
  const [newWitness]=(await admin.query('SELECT * FROM pdf_ocr_checkpoints WHERE document_id=$1 AND revision=$2 AND page_index=$3',[doc,oldDoc.revision+1,second.pageIndex])).rows;
  const witness={pageIndex:second.pageIndex,sourceHash:oldWitness.source_hash,contentHash:oldWitness.content_hash,parseVersion:oldWitness.parse_version,processingHash:oldWitness.processing_hash,oldRotationPlanHash:oldWitness.rotation_plan_hash,rotationPlanHash:newWitness.rotation_plan_hash,parserFingerprint:oldWitness.parser_fingerprint,totalPages:oldWitness.total_pages,oldPreviewId:oldWitness.preview_id,oldPreviewHash:oldWitness.preview_hash,oldMapId:oldWitness.map_id,oldMapHash:oldWitness.map_hash,previewId:newWitness.preview_id,previewHash:newWitness.preview_hash,mapId:newWitness.map_id,mapHash:newWitness.map_hash,payload:newWitness.payload,payloadHash:newWitness.payload_hash};
  const conn=await admin.connect();try{await conn.query('BEGIN');await conn.query("SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)",[owner.uid,owner.tenant]);for(const missing of ['sourceHash','oldPreviewHash']){const probe={...witness};delete (probe as Record<string,unknown>)[missing];const result=await conn.query('SELECT rebase_owned_pdf_ocr_checkpoint($1,$2,$3::jsonb) AS outcome',[partial.j.id,manualJob,JSON.stringify(probe)]);assert.equal(result.rows[0].outcome,'stale',missing);}await conn.query('ROLLBACK');}finally{conn.release();}
  const beforeSecond=oldRows.find((r:any)=>r.page_index===second.pageIndex),afterSecond=manualRows.find((r:any)=>r.page_index===second.pageIndex);
  assert.deepEqual([afterSecond.preview_id,afterSecond.preview_hash,afterSecond.map_id,afterSecond.map_hash],[beforeSecond.preview_id,beforeSecond.preview_hash,beforeSecond.map_id,beforeSecond.map_hash]);
  assert.notEqual(manualRows.find((r:any)=>r.page_index===first.pageIndex).preview_id,oldRows.find((r:any)=>r.page_index===first.pageIndex).preview_id);
  const resumed=await owner.req('POST',`/api/jobs/${manualJob}/pdf-ocr/resume`,{revision:oldDoc.revision+1});assert.equal(resumed.statusCode,200,resumed.body);
  const recognized=await owner.req('POST',`/api/documents/${doc}/page-rotations`,{revision:oldDoc.revision+1,mode:'recognize',pages:[first.pageIndex],rotations:{[first.pageIndex]:180}});assert.equal(recognized.statusCode,200,recognized.body);
  const latest=recognized.json().jobId,[carry]=(await admin.query('SELECT pdf_ocr_rotation_deleted_pages FROM jobs WHERE id=$1',[latest])).rows;assert.deepEqual(carry.pdf_ocr_rotation_deleted_pages,[first.pageIndex]);
  const currentDraft=await owner.req('GET',`/api/jobs/${latest}/pdf-ocr/draft`);assert.equal(currentDraft.statusCode,200,currentDraft.body);assert.equal(currentDraft.json().pages.find((p:any)=>p.pageIndex===second.pageIndex).draft.marks[0].decision,'redact');
  const recognitionWorker=worker();
  try{
   await until(async()=>{const[j]=(await admin.query('SELECT status FROM jobs WHERE id=$1',[latest])).rows;const[frame]=(await admin.query('SELECT page_index FROM pdf_ocr_checkpoints WHERE job_id=$1 AND page_index=$2',[latest,first.pageIndex])).rows;return{status:j?.status,frame};},v=>v.status==='running'&&!!v.frame);
   const stopped=await owner.req('POST',`/api/jobs/${latest}/pdf-ocr/pause`,{revision:oldDoc.revision+2});assert.equal(stopped.statusCode,200,stopped.body);
  }finally{await recognitionWorker.stop();}
  const carriedPage=await owner.req('GET',`/api/jobs/${latest}/pdf-ocr/draft`);assert.equal(carriedPage.statusCode,200,carriedPage.body);
  const carriedView=carriedPage.json().pages.find((p:any)=>p.pageIndex===first.pageIndex);assert.equal(carriedView.draftRevision,0);assert.equal(carriedView.draft.pageDeleted,true,'real rotated frame shows inherited deletion without a saved draft row');
  const clear=await owner.req('PUT',`/api/jobs/${latest}/pdf-ocr/draft`,{revision:oldDoc.revision+2,draftRevision:0,pageIndex:first.pageIndex,marks:[],removed:[],regions:[],pageDeleted:false});assert.equal(clear.statusCode,200,clear.body);
  const clearedView=(await owner.req('GET',`/api/jobs/${latest}/pdf-ocr/draft`)).json().pages.find((p:any)=>p.pageIndex===first.pageIndex);assert.equal(clearedView.draftRevision,1);assert.equal(clearedView.draft.pageDeleted,false,'explicit saved choice overrides rotation carry');
  const restore=await owner.req('PUT',`/api/jobs/${latest}/pdf-ocr/draft`,{revision:oldDoc.revision+2,draftRevision:1,pageIndex:first.pageIndex,marks:[],removed:[],regions:[],pageDeleted:true});assert.equal(restore.statusCode,200,restore.body);
  const allButSecond=Array.from({length:20},(_,index)=>index).filter(index=>index!==second.pageIndex);
  await admin.query('UPDATE jobs SET pdf_ocr_rotation_deleted_pages=$2::integer[] WHERE id=$1',[latest,allButSecond]);
  const beforeRejected=(await admin.query('SELECT page_index,draft_revision,payload_hash FROM pdf_ocr_review_drafts WHERE document_id=$1 AND revision=$2 ORDER BY page_index',[doc,oldDoc.revision+2])).rows;
  const lastDelete=await owner.req('PUT',`/api/jobs/${latest}/pdf-ocr/draft`,{revision:oldDoc.revision+2,draftRevision:0,pageIndex:second.pageIndex,marks:[],removed:[],regions:[],pageDeleted:true});assert.equal(lastDelete.statusCode,409,lastDelete.body);assert.match(lastDelete.body,/PDF_OCR_DRAFT_ALL_PAGES_DELETED/);
  assert.deepEqual((await admin.query('SELECT page_index,draft_revision,payload_hash FROM pdf_ocr_review_drafts WHERE document_id=$1 AND revision=$2 ORDER BY page_index',[doc,oldDoc.revision+2])).rows,beforeRejected,'rejected final-page deletion has no draft write');
  await admin.query('UPDATE jobs SET pdf_ocr_rotation_deleted_pages=$2::integer[] WHERE id=$1',[latest,[first.pageIndex]]);
  const continueRecognize=await owner.req('POST',`/api/jobs/${latest}/pdf-ocr/resume`,{revision:oldDoc.revision+2});assert.equal(continueRecognize.statusCode,200,continueRecognize.body);const completedJob=continueRecognize.json().jobId;
  assert.equal(await tick(),true);
  const [final]=(await admin.query('SELECT d.state,d.revision,d.page_review,j.status,j.error_code FROM documents d JOIN jobs j ON j.id=$2 WHERE d.id=$1',[doc,completedJob])).rows;
  assert.equal(final.status,'succeeded',JSON.stringify({final,worker:background.output()}));assert.equal(final.state,'review');assert.equal(final.revision,oldDoc.revision+2);assert.ok(final.page_review.deletedPages.includes(first.pageIndex));
  assert.deepEqual(await readOriginal(oldDoc.source_id),bytes);
  assert.equal((await admin.query('SELECT count(*)::int n FROM pdf_ocr_review_drafts WHERE document_id=$1 AND revision=$2',[doc,oldDoc.revision])).rows[0].n,2);
 }finally{await background.stop();}
});
