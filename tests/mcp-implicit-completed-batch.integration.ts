import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,seal,unseal} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';

assert.match(new URL(process.env.DATABASE_URL!).pathname,/^\/tmw_test_/u);
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp(),origin=process.env.APP_ORIGIN!;
after(async()=>{await app.close();await pool.end();await admin.end();});

test('implicit resume selects latest valid completed ai_process batch and still requires approval',async()=>{
 const tenant=randomUUID(),user=randomUUID(),username=`implicit-completed-${randomUUID()}`,password='synthetic-completed-batch-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,extra:Record<string,string>={})=>app.inject({method,url,payload,headers:{origin,cookie,...extra}});
 const created=await req('POST','/api/projects',{name:'completed ai process batch'});assert.equal(created.statusCode,200,created.body);const project=created.json().id as string;
 const docs:string[]=[];
 for(const phone of ['13700137000','13800138000','13900139000']){
  const document=await req('POST',`/api/projects/${project}/documents`,{text:`合成电话 ${phone}`,requestId:randomUUID()});assert.equal(document.statusCode,200,document.body);const doc=document.json().id as string;docs.push(doc);
  for(let attempt=0;attempt<40;attempt++){const [job]=(await admin.query("SELECT status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NULL ORDER BY created_at DESC LIMIT 1",[doc])).rows;if(job?.status==='succeeded')break;assert.notEqual(job?.status,'failed');assert.ok(attempt<39);await tick();}
 }
 async function client(name:string){
  const initialized=await req('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name,version:'1'}}});assert.equal(initialized.statusCode,200,initialized.body);
  const headers={'mcp-session-id':String(initialized.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
  const ack=await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers);assert.equal(ack.statusCode,202,ack.body);
  let id=1;return {headers,tool:async(tool:string,args:Record<string,unknown>)=>{const result=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++id,method:'tools/call',params:{name:tool,arguments:args}},headers);assert.equal(result.statusCode,200,result.body);return result.json().result;}};
 }
 const olderDoc=docs.shift()!;assert.equal(docs.length,2);
 const first=await client('original-client');
 const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};
 const older=await first.tool('start_lawbot_redaction',{project_id:project,document_ids:[olderDoc],masking_mode:'default_mask',task_mode:'redact_only',output_formats:['original','md'],request_id:randomUUID()});assert.equal(older.isError,false,JSON.stringify(older));
 const olderId=older.structuredContent.jobId as string,olderTask=(await req('GET',`/api/ai-collab/tasks/${olderId}`)).json();
 const olderAuthorized=await req('POST',`/api/ai-collab/tasks/${olderId}/authorize`,{revision:olderTask.revision,authorization:consent});assert.equal(olderAuthorized.statusCode,200,olderAuthorized.body);
 for(let attempt=0;attempt<60;attempt++){await tick();const ready=await first.tool('check_document_delivery',{job_id:olderId,wait_seconds:0});assert.equal(ready.isError,false,JSON.stringify(ready));if(ready.structuredContent.status==='sanitized_artifact_ready')break;assert.ok(attempt<59,JSON.stringify(ready.structuredContent));}
 const started=await first.tool('start_lawbot_redaction',{project_id:project,document_ids:docs,masking_mode:'default_mask',task_mode:'ai_process',batch_result_mode:'combined',output_formats:['original','md'],request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));
 const parentId=started.structuredContent.jobId as string;assert.equal(started.structuredContent.childJobIds.length,2);
 const before=(await req('GET',`/api/ai-collab/tasks/${parentId}`)).json();
 const authorized=await req('POST',`/api/ai-collab/tasks/${parentId}/authorize`,{revision:before.revision,authorization:consent});assert.equal(authorized.statusCode,200,authorized.body);
 let delivery:any;
 for(let attempt=0;attempt<80;attempt++){await tick();delivery=await first.tool('check_document_delivery',{job_id:parentId,wait_seconds:0});assert.equal(delivery.isError,false,JSON.stringify(delivery));if(delivery.structuredContent.status==='sanitized_artifact_ready')break;assert.ok(attempt<79,JSON.stringify(delivery.structuredContent));}
 assert.match(delivery.structuredContent.sanitizedArtifact?.artifactId??'',/^lba_[a-f0-9]{32}$/u);
 // A valid persisted completion from the original implementation: preserve the
 // real owned children, delivered artifact, authorization, and sealed snapshot.
 const taskId=taskUUID(parentId),row=(await admin.query('SELECT * FROM ai_collab_tasks WHERE id=$1',[taskId])).rows[0];
 const aad=`${tenant}:${user}:ai-collab:${taskId}`,task=JSON.parse(unseal(row.payload,aad));
 assert.equal(task.options.task_mode,'ai_process');assert.equal(task.state,'sanitized_artifact_ready');assert.equal(task.childJobIds.length,2);
 task.state='completed';task.revision++;task.updatedAt=new Date().toISOString();
 const payload=seal(JSON.stringify(task),aad),digest=createHash('sha256').update(payload).digest('hex');
 await admin.query('UPDATE ai_collab_tasks SET revision=$2,payload=$3,updated_at=now() WHERE id=$1',[taskId,task.revision,payload]);
 await admin.query('INSERT INTO ai_collab_task_snapshot(task_id,tenant_id,project_id,owner_id,revision,payload_ciphertext,payload_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)',[taskId,tenant,project,user,task.revision,payload,digest]);
 const persisted=(await req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal(persisted.state,'completed');
 assert.equal((await req('GET',`/api/ai-collab/tasks/${olderId}`)).json().state,'sanitized_artifact_ready');
 const replacement=await client('replacement-client');
 const implicit=await replacement.tool('resume_lawbot_task',{});assert.equal(implicit.isError,false,JSON.stringify(implicit));
 assert.equal(implicit.structuredContent.resumeSourceJobId,parentId);assert.equal(implicit.structuredContent.status,'waiting_for_session_authorization');
 const requestId=implicit.structuredContent.jobId as string;assert.notEqual(requestId,parentId);
 const explicit=await replacement.tool('resume_lawbot_task',{job_id:parentId});assert.equal(explicit.isError,false,JSON.stringify(explicit));assert.equal(explicit.structuredContent.jobId,requestId);
 const still=(await req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal(still.caller.sessionId,first.headers['mcp-session-id']);
 const blocked=await replacement.tool('check_document_delivery',{job_id:parentId,wait_seconds:0});assert.equal(blocked.structuredContent.error,'SESSION_AUTHORIZATION_REQUIRED');
});
