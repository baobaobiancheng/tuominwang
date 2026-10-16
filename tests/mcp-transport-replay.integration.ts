import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,unseal,hash} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
const origin=process.env.APP_ORIGIN!;
const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};

async function session(){
 const tenant=randomUUID(),user=randomUUID(),username='mcp-auto-'+randomUUID(),password='synthetic-automatic-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,extra?:Record<string,string>)=>app.inject({method,url,headers:{origin,cookie,...extra},payload});
 const initialized=await req('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'codex',version:'1'}}});assert.equal(initialized.statusCode,200,initialized.body);
 const headers={'mcp-session-id':String(initialized.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
 await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers);
 let seq=1;
 const tool=async(name:string,args:Record<string,unknown>,transportId?:string)=>{const response=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++seq,method:'tools/call',params:{name,arguments:args}},{...headers,...transportId?{'x-tuomin-mcp-request-id':transportId}:{}});assert.equal(response.statusCode,200,response.body);return response.json().result;};
 const project=(await req('POST','/api/projects',{name:'automatic synthetic'})).json().id as string;
 const create=async(text:string)=>{const response=await req('POST',`/api/projects/${project}/documents`,{text,requestId:randomUUID()});assert.equal(response.statusCode,200,response.body);const doc=response.json().id as string;for(let attempt=0;attempt<20;attempt++){const rows=(await admin.query("SELECT status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NULL ORDER BY created_at DESC LIMIT 1",[doc])).rows;if(rows[0]?.status==='succeeded')return doc;assert.notEqual(rows[0]?.status,'failed');await tick();}throw new Error('INITIAL_DETECTION_NOT_COMPLETE');};
 const task=async(job:string)=>(await req('GET',`/api/ai-collab/tasks/${job}`)).json();
 const start=async(name:string,doc:string,advanced?:Record<string,unknown>)=>tool(name,{project_id:project,document_ids:[doc],masking_mode:'default_mask',task_mode:'redact_only',output_formats:['original','md'],request_id:randomUUID(),...advanced?{advanced}:{}});
 const authorize=async(job:string)=>{const t=await task(job),result=await req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:t.revision,authorization:consent});assert.equal(result.statusCode,200,result.body);};
 const gateway=(method:string,params:Record<string,unknown>)=>req('POST','/api/ai-collab/gateway',{method,params},headers);
 return{tenant,user,project,cookie,req,tool,gateway,create,task,start,authorize};
}

async function ready(f:Awaited<ReturnType<typeof session>>,jobId:string){
 await f.authorize(jobId);
 for(let attempt=0;attempt<30;attempt++){
  const state=await f.tool('check_document_delivery',{job_id:jobId,wait_seconds:0});assert.equal(state.isError,false,JSON.stringify(state));
  if(state.structuredContent.status==='sanitized_artifact_ready')return;
  assert.notEqual(state.structuredContent.status,'failed',JSON.stringify(state));await tick();
 }
 throw new Error('OWNED_EXPORT_NOT_READY');
}

test('committed start and redact-only delivery can be read back under the exact transport identity without another task or revision',async()=>{
 const f=await session(),doc=await f.create('合成电话 13800138000'),requestId=randomUUID();
 const args={project_id:f.project,document_ids:[doc],task_mode:'redact_only',masking_mode:'default_mask',output_formats:['original','md']};
 // The caller deliberately discards a committed response, as in a broken socket.
 const first=await f.tool('start_lawbot_redaction',args,requestId);assert.equal(first.isError,false,JSON.stringify(first));const jobId=first.structuredContent.jobId;
 const second=await f.tool('start_lawbot_redaction',args,requestId);assert.equal(second.isError,false,JSON.stringify(second));assert.equal(second.structuredContent.jobId,jobId);assert.equal(second.structuredContent.revision,first.structuredContent.revision);
 assert.equal((await admin.query('SELECT count(*)::int n FROM ai_collab_tasks WHERE request_id=$1',[requestId])).rows[0].n,1);
 await ready(f,jobId);const receiveId=randomUUID(),receiveArgs={job_id:jobId};
 const received=await f.tool('receive_sanitized_document',receiveArgs,receiveId);assert.equal(received.isError,false,JSON.stringify(received));assert.equal(received.structuredContent.status,'completed');
 const replay=await f.tool('receive_sanitized_document',receiveArgs,receiveId);assert.equal(replay.isError,false,JSON.stringify(replay));assert.deepEqual(replay.structuredContent,received.structuredContent);
 assert.equal((await f.task(jobId)).revision,received.structuredContent.revision);
 const changed=await f.tool('receive_sanitized_document',{...receiveArgs,output_format:'docx'},receiveId);assert.equal(changed.isError,true,'same identity changed body must not replay');
 const fresh=await f.tool('receive_sanitized_document',receiveArgs,randomUUID());assert.equal(fresh.isError,true,'completed receive is not a fresh delivery');
 const repeatedStart=await f.tool('start_lawbot_redaction',args,requestId);assert.equal(repeatedStart.isError,false,JSON.stringify(repeatedStart));assert.equal(repeatedStart.structuredContent.jobId,jobId,'private transport receipt must not contaminate original start options equality');
 const [current]=(await admin.query('SELECT revision FROM documents WHERE id=$1',[doc])).rows;
 await admin.query('UPDATE documents SET revision=revision+1 WHERE id=$1',[doc]);
 try{const stale=await f.tool('receive_sanitized_document',receiveArgs,receiveId);assert.equal(stale.isError,true,'cached identity cannot bypass source/artifact validation');}
 finally{await admin.query('UPDATE documents SET revision=$2 WHERE id=$1',[doc,current.revision]);}
});

test('slot replacement response loss returns the committed slot and rejects changed payload or superseded replacement',async()=>{
 const f=await session(),doc=await f.create('合成电话 13900139000');
 const started=await f.tool('start_lawbot_redaction',{project_id:f.project,document_ids:[doc],task_mode:'ai_process',masking_mode:'default_mask',output_formats:['original','md']},randomUUID());assert.equal(started.isError,false,JSON.stringify(started));const jobId=started.structuredContent.jobId;await ready(f,jobId);
 const initial=await f.tool('receive_sanitized_document',{job_id:jobId,output_format:'md'},randomUUID());assert.equal(initial.isError,false,JSON.stringify(initial));
 const requestId=randomUUID(),args={job_id:jobId,output_format:'docx',replace_slot_id:initial.structuredContent.slotId};
 const first=await f.tool('receive_sanitized_document',args,requestId);assert.equal(first.isError,false,JSON.stringify(first));assert.notEqual(first.structuredContent.slotId,initial.structuredContent.slotId);
 const again=await f.tool('receive_sanitized_document',args,requestId);assert.equal(again.isError,false,JSON.stringify(again));assert.deepEqual(again.structuredContent,first.structuredContent);assert.equal((await f.task(jobId)).rounds.length,1);
 assert.equal((await f.tool('receive_sanitized_document',{...args,output_format:'md'},requestId)).isError,true);
 const next=await f.tool('receive_sanitized_document',{job_id:jobId,output_format:'md',replace_slot_id:first.structuredContent.slotId},randomUUID());assert.equal(next.isError,false,JSON.stringify(next));
 assert.equal((await f.tool('receive_sanitized_document',args,requestId)).isError,true,'old receipt cannot replace the newer slot');
 assert.equal((await f.task(jobId)).rounds.length,1);assert.equal((await f.task(jobId)).transportReceipts,undefined,'private transport bookkeeping must not appear in human task view');
});

test('continue ready readback and approved same-caller resume replay leave task revisions and authorization unchanged',async()=>{
 const f=await session(),doc=await f.create('合成电话 13700137000');
 const started=await f.tool('start_lawbot_redaction',{project_id:f.project,document_ids:[doc],task_mode:'ai_process',masking_mode:'default_mask',output_formats:['original','md']},randomUUID());assert.equal(started.isError,false,JSON.stringify(started));const jobId=started.structuredContent.jobId;await ready(f,jobId);
 const before=await f.task(jobId),continued=await f.tool('continue_current_document_review',{job_id:jobId},randomUUID());assert.equal(continued.isError,false,JSON.stringify(continued));assert.equal((await f.task(jobId)).revision,before.revision);
 const initialized=await f.req('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'codex',version:'synthetic-resume'}}});assert.equal(initialized.statusCode,200,initialized.body);
 const headers={'mcp-session-id':String(initialized.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL,'x-tuomin-mcp-request-id':randomUUID()};
 assert.equal((await f.req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers)).statusCode,202);
 const message={jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'resume_lawbot_task',arguments:{job_id:jobId}}};
 const requested=await f.req('POST','/api/mcp',message,headers);assert.equal(requested.statusCode,200,requested.body);assert.equal(requested.json().result.isError,false,requested.body);
 const pending=await f.task(jobId);assert.equal(pending.state,'waiting_for_session_authorization');
 const approved=await f.req('POST',`/api/ai-collab/tasks/${jobId}/authorize`,{revision:pending.revision,authorization:consent});assert.equal(approved.statusCode,200,approved.body);
 const approvedTask=await f.task(jobId);assert.equal(approvedTask.state,'sanitized_artifact_ready');assert.equal(approvedTask.pendingResume,undefined);
 const replay=await f.req('POST','/api/mcp',message,headers);assert.equal(replay.statusCode,200,replay.body);assert.equal(replay.json().result.isError,false,replay.body);
 const final=await f.task(jobId);assert.equal(final.revision,approvedTask.revision);assert.equal(final.state,approvedTask.state);assert.equal(final.pendingResume,undefined);assert.deepEqual(final.authorization,approvedTask.authorization);
});

test('combined committed delivery replay rechecks export permission and current constituent artifacts',async()=>{
 const f=await session(),a=await f.create('合成电话 13600136000'),b=await f.create('合成电话 13500135000');
 const started=await f.tool('start_lawbot_redaction',{project_id:f.project,document_ids:[a,b],task_mode:'redact_only',masking_mode:'default_mask',output_formats:['original','md'],batch_result_mode:'combined'},randomUUID());assert.equal(started.isError,false,JSON.stringify(started));const jobId=started.structuredContent.jobId;await ready(f,jobId);
 const status=await f.tool('check_document_delivery',{job_id:jobId,wait_seconds:0},randomUUID());assert.equal(status.isError,false,JSON.stringify(status));
 const artifactId=status.structuredContent.sanitizedArtifact?.artifactId;assert.ok(artifactId,'combined parent must publish a real selectable artifact');
 const requestId=randomUUID(),args={job_id:jobId,artifact_id:artifactId};const first=await f.tool('receive_sanitized_document',args,requestId);assert.equal(first.isError,false,JSON.stringify(first));
 const newOwner=randomUUID();await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[newOwner,f.tenant,'synthetic-owner-'+randomUUID(),passwordHash('synthetic-only')]);
 // Retain view_original and review, revoke only export through the real RLS
 // permission function. Task ownership and its AEAD owner remain unchanged.
 await admin.query('INSERT INTO project_members(tenant_id,project_id,user_id,permissions) VALUES($1,$2,$3,$4)',[f.tenant,f.project,f.user,['view_original','review']]);
 await admin.query('UPDATE projects SET owner_id=$2 WHERE id=$1',[f.project,newOwner]);
 assert.equal((await f.req('GET',`/api/ai-collab/tasks/${jobId}`)).statusCode,200);
 const denied=await f.tool('receive_sanitized_document',args,requestId);assert.equal(denied.isError,true,'same identity cannot replay combined bytes after export revocation');
 await admin.query('UPDATE project_members SET permissions=$3 WHERE project_id=$1 AND user_id=$2',[f.project,f.user,['view_original','review','export']]);
 const restored=await f.tool('receive_sanitized_document',args,requestId);assert.equal(restored.isError,false,JSON.stringify(restored));assert.equal(restored.structuredContent.sha256,first.structuredContent.sha256);
 const [prior]=(await admin.query('SELECT revision,source_hash,content_hash FROM documents WHERE id=$1',[a])).rows;await admin.query('UPDATE documents SET revision=revision+1 WHERE id=$1',[a]);
 try{assert.equal((await f.tool('receive_sanitized_document',args,requestId)).isError,true,'constituent changed revision cannot replay old aggregate');}
 finally{await admin.query('UPDATE documents SET revision=$2 WHERE id=$1',[a,prior.revision]);}
 await admin.query('UPDATE documents SET source_hash=$2 WHERE id=$1',[a,'f'.repeat(64)]);
 try{assert.equal((await f.tool('receive_sanitized_document',args,requestId)).isError,true,'constituent changed source cannot replay old aggregate');}
 finally{await admin.query('UPDATE documents SET source_hash=$2 WHERE id=$1',[a,prior.source_hash]);}
});

async function lockedTaskRace<T,U>(jobId:string,first:()=>Promise<T>,second:()=>Promise<U>,ordered=false){
 const hold=await admin.connect();let a:Promise<T>|undefined,b:Promise<U>|undefined;
 async function blocked(minimum:number){
  const until=Date.now()+30_000;
  while(Date.now()<until){const result=await admin.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()");if(result.rows[0].n>=minimum)return;await new Promise(resolve=>setTimeout(resolve,25));}
  assert.fail(`expected ${minimum} actual task-row waiters before releasing fixture lock`);
 }
 try{
  await hold.query('BEGIN');await hold.query('SELECT id FROM ai_collab_tasks WHERE id=$1 FOR UPDATE',[taskUUID(jobId)]);
  a=first();if(ordered)await blocked(1);b=second();await blocked(2);
  await hold.query('COMMIT');return await Promise.all([a,b]);
 }finally{await hold.query('ROLLBACK').catch(()=>{});hold.release();if(a||b)await Promise.allSettled([a,b]);}
}

test('in-flight duplicate receive and approval-before-resume retry read back the committed task under real row-lock races',async()=>{
 const f=await session(),doc=await f.create('合成电话 13400134000');
 const start=await f.tool('start_lawbot_redaction',{project_id:f.project,document_ids:[doc],task_mode:'ai_process',masking_mode:'default_mask',output_formats:['original','md']},randomUUID());assert.equal(start.isError,false,JSON.stringify(start));const jobId=start.structuredContent.jobId;await ready(f,jobId);
 const before=await f.task(jobId),receiveId=randomUUID(),receiveArgs={job_id:jobId,output_format:'md'};
 const initial=await lockedTaskRace(jobId,()=>f.tool('receive_sanitized_document',receiveArgs,receiveId),()=>f.tool('receive_sanitized_document',receiveArgs,receiveId));
 for(const r of initial)assert.equal(r.isError,false,JSON.stringify(r));assert.equal(initial[0].structuredContent.slotId,initial[1].structuredContent.slotId);assert.equal((await f.task(jobId)).revision,before.revision+1);assert.equal((await f.task(jobId)).rounds.length,1);
 const replaceId=randomUUID(),replaceArgs={job_id:jobId,output_format:'docx',replace_slot_id:initial[0].structuredContent.slotId},beforeReplace=await f.task(jobId);
 const replaced=await lockedTaskRace(jobId,()=>f.tool('receive_sanitized_document',replaceArgs,replaceId),()=>f.tool('receive_sanitized_document',replaceArgs,replaceId));
 for(const r of replaced)assert.equal(r.isError,false,JSON.stringify(r));assert.equal(replaced[0].structuredContent.slotId,replaced[1].structuredContent.slotId);assert.equal((await f.task(jobId)).revision,beforeReplace.revision+1);assert.equal((await f.task(jobId)).rounds.length,1);
 const initialized=await f.req('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'codex',version:'synthetic-race'}}});assert.equal(initialized.statusCode,200,initialized.body);
 const headers={'mcp-session-id':String(initialized.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL,'x-tuomin-mcp-request-id':randomUUID()};
 await f.req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers);
 const message={jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'resume_lawbot_task',arguments:{job_id:jobId}}};
 const requested=await f.req('POST','/api/mcp',message,headers);assert.equal(requested.json().result.isError,false,requested.body);const pending=await f.task(jobId);assert.equal(pending.state,'waiting_for_session_authorization');
 const [authorized,replayed]=await lockedTaskRace(jobId,()=>f.req('POST',`/api/ai-collab/tasks/${jobId}/authorize`,{revision:pending.revision,authorization:consent}),()=>f.req('POST','/api/mcp',message,headers),true);
 assert.equal(authorized.statusCode,200,authorized.body);assert.equal(replayed.statusCode,200,replayed.body);assert.equal(replayed.json().result.isError,false,replayed.body);
 const final=await f.task(jobId);assert.equal(final.pendingResume,undefined);assert.equal(final.state,'analyzing_by_ai');assert.equal(final.revision,pending.revision+1,'approved replacement must not be undone by the blocked retry');
});
