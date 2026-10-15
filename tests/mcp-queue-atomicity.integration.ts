import {test,after,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,seal,unseal} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';

// Candidate for a dedicated isolated DB. No production DB or fixed port.
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
const origin=process.env.APP_ORIGIN!;
async function fixture(t:TestContext){
 const tenant=randomUUID(),uid=randomUUID(),username='mcp-queue-'+randomUUID(),password='synthetic-queue-password';
 t.after(async()=>{
  await admin.query("UPDATE attempts SET finished_at=now(),outcome='test_cleanup' WHERE finished_at IS NULL AND job_id IN (SELECT id FROM jobs WHERE tenant_id=$1 AND status IN ('queued','running'))",[tenant]);
  await admin.query("UPDATE jobs SET status='cancelled',lease_until=NULL WHERE tenant_id=$1 AND status IN ('queued','running')",[tenant]);
 });
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}}),cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,extra?:Record<string,string>)=>app.inject({method,url,headers:{origin,cookie,...extra},payload});
 let n=0;const initial=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++n,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'queue-regression',version:'1'}}});
 assert.equal(initial.statusCode,200,initial.body);
 const h={'mcp-session-id':String(initial.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
 await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},h);
 const call=async(name:string,args:Record<string,unknown>)=>{const r=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++n,method:'tools/call',params:{name,arguments:args}},h);assert.equal(r.statusCode,200,r.body);const result=r.json().result;assert.equal(result.isError,false,JSON.stringify(result));return result.structuredContent;};
 const project=(await req('POST','/api/projects',{name:'synthetic queue atomicity'})).json().id;
 const create=async(text:string)=>{const r=await req('POST',`/api/projects/${project}/documents`,{text,requestId:randomUUID()});assert.equal(r.statusCode,200,r.body);await tick();return r.json().id as string;};
 const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};
 const start=async(docs:string[])=>{const r=await call('start_lawbot_redaction',{project_id:project,document_ids:docs,output_formats:['original'],masking_mode:'default_mask',task_mode:'redact_only',request_id:randomUUID()});return r.jobId as string;};
 const task=async(job:string)=>(await req('GET',`/api/ai-collab/tasks/${job}`)).json();
 return {admin,req,call,create,start,task,consent,project,tenant,uid};
}

// Current code commits export job 1, then rejects source 2 before recording any IDs in the task.
test('batch prepare rollback leaves no orphan export job',async ctx=>{
 const f=await fixture(ctx),first=await f.create('公开甲材料。'),second=await f.create('公开乙材料。'),job=await f.start([first,second]);
 let t=await f.task(job);const authorized=await f.req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:t.revision,authorization:f.consent});assert.equal(authorized.statusCode,200,authorized.body);
 await tick();await tick();
 for(const doc of [first,second]){const d=(await f.req('GET',`/api/documents/${doc}`)).json();assert.equal(d.state,'review');const review=await f.req('PUT',`/api/documents/${doc}/review`,{revision:d.revision,marks:d.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(review.statusCode,200,review.body);}
 // Deliberately make the second source fail the export gate after the first is valid.
 await admin.query("UPDATE documents SET state='outdated' WHERE id=$1",[second]);
 const before=(await admin.query("SELECT id FROM jobs WHERE document_id=$1 AND kind='export'",[first])).rows.map(r=>r.id);
 t=await f.task(job);const rejected=await f.req('POST',`/api/ai-collab/tasks/${job}/prepare-export`,{revision:t.revision});assert.equal(rejected.statusCode,409,rejected.body);
 const after=(await admin.query("SELECT id FROM jobs WHERE document_id=$1 AND kind='export'",[first])).rows.map(r=>r.id);
 assert.deepEqual(after,before,'a later source rejection must roll back earlier queued exports');
 assert.equal((await f.task(job)).exportJobIds,undefined);
});

// Hold a DB barrier at the detect INSERT. The task cancel races at the exact
// boundary where the old code has committed configuration but has not queued detect.
test('cancel cannot leave a later detect job or queued document',async ctx=>{
 const f=await fixture(ctx),doc=await f.create('邮箱：queue@example.com'),job=await f.start([doc]);
 const functionName='queue_barrier_'+randomUUID().replaceAll('-','');
 const triggerName='queue_barrier_trigger_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.document_id='${doc}'::uuid AND NEW.kind='detect' THEN PERFORM pg_advisory_xact_lock(5050,hashtext(NEW.document_id::text)); END IF; RETURN NEW; END $$`);
 await admin.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON jobs FOR EACH ROW EXECUTE FUNCTION ${functionName}()`);
 const holder=await admin.connect();await holder.query('SELECT pg_advisory_lock(5050,hashtext($1::text))',[doc]);
 try{
  const t=await f.task(job),authorize=f.req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:t.revision,authorization:f.consent}).then(r=>r);
  const deadline=Date.now()+10000;let blocked=false;
  while(Date.now()<deadline){const q=await admin.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=5050::oid AND NOT granted");if(q.rows[0].n>0){blocked=true;break;}await new Promise(r=>setTimeout(r,25));}
  assert.equal(blocked,true,'detect INSERT did not reach barrier');
  // A fully transactional implementation serializes cancel behind prepare/authorize.
  // The old implementation lets cancel commit while detect is still blocked.
  const cancel=f.req('POST',`/api/ai-collab/tasks/${job}/action`,{revision:t.revision+1,method:'cancel'}).then(r=>r);
  await holder.query('SELECT pg_advisory_unlock(5050,hashtext($1::text))',[doc]);
  const [authorized,cancelled]=await Promise.all([authorize,cancel]);
  assert.equal(authorized.statusCode,200,authorized.body);
  assert.equal(cancelled.statusCode,200,cancelled.body);
  const final=await f.task(job),d=(await f.req('GET',`/api/documents/${doc}`)).json();
  assert.equal(final.state,'cancelled_by_user');
  const active=(await admin.query("SELECT id FROM jobs WHERE document_id=$1 AND kind='detect' AND status IN ('queued','running')",[doc])).rows;
  assert.equal(active.length,0,'a canceled task must not leave a runnable detect job');
  assert.notEqual(d.state,'queued','document cannot remain queued after its owned detect was canceled');
 }finally{
  await holder.query('SELECT pg_advisory_unlock(5050,hashtext($1::text))',[doc]);holder.release();
  await admin.query(`DROP TRIGGER IF EXISTS ${triggerName} ON jobs`);await admin.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
 }
});

// A direct export and a second task on the same document/revision must not
// borrow this task's job. Release must read only its own successful artifacts.
test('task cancel and release preserve independent export provenance',async ctx=>{
 const f=await fixture(ctx),doc=await f.create('公开共享来源。'),first=await f.start([doc]),second=await f.start([doc]);
 assert.notEqual(first,second);
 for(const taskId of [first,second]){const t=await f.task(taskId),r=await f.req('POST',`/api/ai-collab/tasks/${taskId}/authorize`,{revision:t.revision,authorization:f.consent});assert.equal(r.statusCode,200,r.body);await tick();}
 const d=(await f.req('GET',`/api/documents/${doc}`)).json();assert.equal(d.state,'review');const reviewed=await f.req('PUT',`/api/documents/${doc}/review`,{revision:d.revision,marks:d.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(reviewed.statusCode,200,reviewed.body);
 const current=reviewed.json().revision;
 async function prepare(taskId:string){const t=await f.task(taskId),r=await f.req('POST',`/api/ai-collab/tasks/${taskId}/prepare-export`,{revision:t.revision});assert.equal(r.statusCode,200,r.body);return r.json().exportJobIds[0] as string;}
 const firstJob=await prepare(first),secondJob=await prepare(second);
 const direct=await f.req('POST',`/api/documents/${doc}/export`,{revision:current});assert.equal(direct.statusCode,200,direct.body);const directJob=direct.json().id as string;
 assert.equal(new Set([firstJob,secondJob,directJob]).size,3,'distinct tasks and direct export require distinct job ownership');
 const canceled=await f.req('POST',`/api/ai-collab/tasks/${first}/action`,{revision:(await f.task(first)).revision,method:'cancel'});assert.equal(canceled.statusCode,200,canceled.body);
 const jobs=(await admin.query('SELECT id,status,collab_task_id FROM jobs WHERE id=ANY($1::uuid[])',[[firstJob,secondJob,directJob]])).rows;
 assert.equal(jobs.find(j=>j.id===firstJob)?.status,'cancelled');
 assert.equal(jobs.find(j=>j.id===secondJob)?.status,'queued');
 assert.equal(jobs.find(j=>j.id===directJob)?.status,'queued');
 assert.equal(jobs.find(j=>j.id===firstJob)?.collab_task_id,taskUUID(first));
 assert.equal(jobs.find(j=>j.id===secondJob)?.collab_task_id,taskUUID(second));
 assert.equal(jobs.find(j=>j.id===directJob)?.collab_task_id,null);
 // Let only the normal export finish: an unrelated artifact must not satisfy
 // second task's release even though the document and revision match.
 await admin.query("UPDATE jobs SET available_at=now()+interval '5 minutes' WHERE id=$1",[secondJob]);await tick();
 assert.equal((await admin.query('SELECT status FROM jobs WHERE id=$1',[directJob])).rows[0].status,'succeeded');
 let t=await f.task(second),premature=await f.req('POST',`/api/ai-collab/tasks/${second}/release-export`,{revision:t.revision});assert.equal(premature.statusCode,409,premature.body);
 await admin.query('UPDATE jobs SET available_at=now() WHERE id=$1',[secondJob]);await tick();
 assert.equal((await admin.query('SELECT status FROM jobs WHERE id=$1',[secondJob])).rows[0].status,'succeeded');
 t=await f.task(second);const released=await f.req('POST',`/api/ai-collab/tasks/${second}/release-export`,{revision:t.revision});assert.equal(released.statusCode,200,released.body);
 const artifactIds=(released.json().deliveries as Array<{artifactId:string}>).map(x=>x.artifactId);
 assert.ok(artifactIds.length>0);
 const provenance=(await admin.query('SELECT DISTINCT job_id FROM artifacts WHERE id=ANY($1::uuid[])',[artifactIds])).rows.map(x=>x.job_id);
 assert.deepEqual(provenance,[secondJob],'all delivered artifacts must come from this exact task job');
 const normalOutputs=await f.req('GET',`/api/documents/${doc}/outputs?revision=${current}`);assert.equal(normalOutputs.statusCode,200,normalOutputs.body);
 assert.ok(normalOutputs.json().length>0,'normal output remains available from the direct job');
});


// Historical task payloads may point at a previously shared direct job. With
// no trustworthy old ownership, cancellation must leave that job intact while
// release still reads the already authorized direct artifact.
test('legacy shared export is not canceled and remains releasable',async ctx=>{
 const f=await fixture(ctx),doc=await f.create('公开历史兼容。'),oldA=await f.start([doc]),oldB=await f.start([doc]);
 const d=(await f.req('GET',`/api/documents/${doc}`)).json();const reviewed=await f.req('PUT',`/api/documents/${doc}/review`,{revision:d.revision,marks:d.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(reviewed.statusCode,200,reviewed.body);
 const exported=await f.req('POST',`/api/documents/${doc}/export`,{revision:reviewed.json().revision});assert.equal(exported.statusCode,200,exported.body);const directJob=exported.json().id as string;
 async function makeLegacy(taskId:string){const id=taskUUID(taskId),aad=`${f.tenant}:${f.uid}:ai-collab:${id}`;const row=(await admin.query('SELECT revision,payload FROM ai_collab_tasks WHERE id=$1',[id])).rows[0],task=JSON.parse(unseal(row.payload,aad));task.state='building_sanitized_artifact';task.authorization=f.consent;task.exportJobIds=[directJob];task.revision=row.revision+1;task.updatedAt=new Date().toISOString();assert.equal((await admin.query('UPDATE ai_collab_tasks SET revision=$2,payload=$3 WHERE id=$1 AND revision=$4',[id,task.revision,seal(JSON.stringify(task),aad),row.revision])).rowCount,1);return task.revision as number;}
 const cancelRevision=await makeLegacy(oldA),releaseRevision=await makeLegacy(oldB);
 const canceled=await f.req('POST',`/api/ai-collab/tasks/${oldA}/action`,{revision:cancelRevision,method:'cancel'});assert.equal(canceled.statusCode,200,canceled.body);
 assert.equal((await admin.query('SELECT status FROM jobs WHERE id=$1',[directJob])).rows[0].status,'queued','unknown historical ownership cannot justify canceling a shared job');
 await tick();const released=await f.req('POST',`/api/ai-collab/tasks/${oldB}/release-export`,{revision:releaseRevision});assert.equal(released.statusCode,200,released.body);
 assert.ok(released.json().deliveries.length>0);
 const linked=(await admin.query('SELECT DISTINCT job_id FROM artifacts WHERE id=ANY($1::uuid[])',[(released.json().deliveries as Array<{artifactId:string}>).map(x=>x.artifactId)])).rows.map(x=>x.job_id);
 assert.deepEqual(linked,[directJob]);
});

// A user who requested only a collaboration export still has the document
// page's normal download button. Another member cannot pick its private job ID.
test('document downloads preserve project export access and restrict explicit task job selection',async ctx=>{
 const f=await fixture(ctx),doc=await f.create('公开下载兼容。'),taskId=await f.start([doc]);
 let task=await f.task(taskId);const authorized=await f.req('POST',`/api/ai-collab/tasks/${taskId}/authorize`,{revision:task.revision,authorization:f.consent});assert.equal(authorized.statusCode,200,authorized.body);await tick();
 const d=(await f.req('GET',`/api/documents/${doc}`)).json(),reviewed=await f.req('PUT',`/api/documents/${doc}/review`,{revision:d.revision,marks:d.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(reviewed.statusCode,200,reviewed.body);
 task=await f.task(taskId);const prepared=await f.req('POST',`/api/ai-collab/tasks/${taskId}/prepare-export`,{revision:task.revision});assert.equal(prepared.statusCode,200,prepared.body);const ownedJob=prepared.json().exportJobIds[0];await tick();
 assert.equal((await admin.query("SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND kind='export' AND collab_task_id IS NULL",[doc])).rows[0].n,0,'no direct export was requested');
 const revision=reviewed.json().revision,ownOutputs=await f.req('GET',`/api/documents/${doc}/outputs?revision=${revision}`);assert.equal(ownOutputs.statusCode,200,ownOutputs.body);assert.ok(ownOutputs.json().some((o:any)=>o.role==='primary'));
 const ownLink=await f.req('POST',`/api/documents/${doc}/download-link`,{revision,role:'primary'});assert.equal(ownLink.statusCode,200,ownLink.body);
 const memberId=randomUUID(),username='queue-member-'+randomUUID(),password='synthetic-member-password';await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[memberId,f.tenant,username,passwordHash(password)]);
 const grant=await f.req('PUT',`/api/projects/${f.project}/members/${memberId}`,{revision:null,permissions:['view_original','export']});assert.equal(grant.statusCode,200,grant.body);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}}),cookie=String(login.headers['set-cookie']).split(';')[0];
 const member=(method:any,url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload});
 assert.equal((await member('GET',`/api/documents/${doc}/outputs?revision=${revision}&jobId=${ownedJob}`)).statusCode,404);
 assert.equal((await member('POST',`/api/documents/${doc}/download-link`,{revision,role:'primary',jobId:ownedJob})).statusCode,404);
 const memberOutputs=await member('GET',`/api/documents/${doc}/outputs?revision=${revision}`);assert.equal(memberOutputs.statusCode,200,memberOutputs.body);assert.ok(memberOutputs.json().some((o:any)=>o.role==='primary'));
 assert.equal((await member('POST',`/api/documents/${doc}/download-link`,{revision,role:'primary'})).statusCode,200,'existing project export permission remains effective');
});

// A project reviewer may explicitly cancel a child detect job. The document
// must leave queued, while the parent collaboration task remains resumable.
test('ordinary reviewer cancel of task-owned detect is recoverable without canceling parent',async ctx=>{
 const f=await fixture(ctx),doc=await f.create('邮箱：child-cancel@example.com'),taskId=await f.start([doc]);
 let task=await f.task(taskId);const authorized=await f.req('POST',`/api/ai-collab/tasks/${taskId}/authorize`,{revision:task.revision,authorization:f.consent});assert.equal(authorized.statusCode,200,authorized.body);
 const pending=(await f.req('GET',`/api/documents/${doc}`)).json();assert.equal(pending.state,'queued');
 const child=(await admin.query("SELECT id,revision,status FROM jobs WHERE collab_task_id=$1 AND document_id=$2 AND kind='detect' ORDER BY created_at DESC LIMIT 1",[taskUUID(taskId),doc])).rows[0];assert.ok(child);assert.equal(child.status,'queued');assert.equal(child.revision,pending.revision);
 const reviewerId=randomUUID(),username='queue-reviewer-'+randomUUID(),password='synthetic-reviewer-password';await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[reviewerId,f.tenant,username,passwordHash(password)]);
 const grant=await f.req('PUT',`/api/projects/${f.project}/members/${reviewerId}`,{revision:null,permissions:['view_original','review']});assert.equal(grant.statusCode,200,grant.body);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}}),cookie=String(login.headers['set-cookie']).split(';')[0];
 const reviewer=(method:any,url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload});
 const canceled=await reviewer('POST',`/api/jobs/${child.id}/cancel`,{});assert.equal(canceled.statusCode,200,canceled.body);
 assert.equal((await admin.query('SELECT status FROM jobs WHERE id=$1',[child.id])).rows[0].status,'cancelled');
 const after=(await f.req('GET',`/api/documents/${doc}`)).json();assert.equal(after.state,'outdated');assert.equal(after.revision,pending.revision+1);
 task=await f.task(taskId);assert.equal(task.state,'waiting_for_human_review','child cancellation must not falsely finish or cancel parent task');
 const restarted=await f.req('POST',`/api/documents/${doc}/recognize`,{revision:after.revision,ner:false});assert.equal(restarted.statusCode,200,restarted.body);await tick();
 const recognized=(await f.req('GET',`/api/documents/${doc}`)).json();assert.equal(recognized.state,'review');assert.ok(recognized.marks.length>0);
 const reviewed=await f.req('PUT',`/api/documents/${doc}/review`,{revision:recognized.revision,marks:recognized.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(reviewed.statusCode,200,reviewed.body);
 task=await f.task(taskId);const prepared=await f.req('POST',`/api/ai-collab/tasks/${taskId}/prepare-export`,{revision:task.revision});assert.equal(prepared.statusCode,200,prepared.body);assert.equal(prepared.json().state,'building_sanitized_artifact');assert.equal(prepared.json().exportJobIds.length,1);
});
