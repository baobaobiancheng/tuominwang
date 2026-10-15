import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve,sep} from 'node:path';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {registerMcpRoutes} from '../apps/api/mcp.ts';
import {applyDocumentConfiguration} from '../apps/api/document-policy.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {hash,passwordHash,seal,unseal} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';

// Copy to tests/ and run only through tests/run-isolated.ts integration.
// Fail before opening any connection if invoked against a normal .env database.
function requireIsolation(){
 const app=new URL(process.env.DATABASE_URL??''),migration=new URL(process.env.MIGRATION_DATABASE_URL??'');
 assert.match(decodeURIComponent(app.pathname),/^\/tmw_test_[a-z0-9_]+$/);
 assert.equal(app.pathname,migration.pathname);
 assert.equal(app.hostname,migration.hostname);
 assert.equal(app.port,migration.port);
 assert.ok(resolve(process.env.DATA_DIR??'').startsWith(resolve('.data/test-runs')+sep));
}
requireIsolation();

test('MCP implicit resume prefers newest real delivered task and retains authorization boundary', {timeout:240_000}, async()=>{
 const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
 let app:Awaited<ReturnType<typeof buildApp>>|undefined;
 try{
  assert.match((await admin.query('SELECT current_database() AS name')).rows[0].name,/^tmw_test_/);
  app=await buildApp();
  if(!app.hasRoute({method:'POST',url:'/api/mcp'}))registerMcpRoutes(app,applyDocumentConfiguration);
  const origin=process.env.APP_ORIGIN!,password='synthetic-resume-selection-password',tenant=randomUUID();
  async function account(tenantId=tenant){
   const uid=randomUUID(),username=`resume-${uid}`;
   await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenantId,username,passwordHash(password)]);
   const login=await app!.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
   assert.equal(login.statusCode,200,login.body);
   const cookie=String(login.headers['set-cookie']).split(';')[0];
   let nextRequestAt=0;
   return {uid,tenant:tenantId,request:async(method:any,url:string,payload?:any,extra?:any)=>{
    const delay=nextRequestAt-Date.now();nextRequestAt=Math.max(nextRequestAt,Date.now())+550;
    if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
    return app!.inject({method,url,headers:{origin,cookie,...extra},payload});
   }};
  }
  const owner=await account(),cross=await account(randomUUID()),req=owner.request;
  let rpcId=0;
  async function initialize(request=req){
   const response=await request('POST','/api/mcp',{jsonrpc:'2.0',id:++rpcId,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'resume-selection',version:'1'}}});
   assert.equal(response.statusCode,200,response.body);
   const headers={'mcp-session-id':String(response.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
   const initialized=await request('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers);
   assert.equal(initialized.statusCode,202,initialized.body);
   return {headers,close:()=>request('DELETE','/api/mcp',undefined,headers),call:async(name:string,args:any={})=>{
    const r=await request('POST','/api/mcp',{jsonrpc:'2.0',id:++rpcId,method:'tools/call',params:{name,arguments:args}},headers);
    assert.equal(r.statusCode,200,`MCP transport ${r.statusCode} ${r.body}`);
    return r.json().result;
   }};
  }
  const consent={allowRedactionPath:true,allowRestorePath:true,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};
  async function human(jobId:string){const r=await req('GET',`/api/ai-collab/tasks/${jobId}`);assert.equal(r.statusCode,200,r.body);return r.json();}
  async function createDelivered(label:string,email:string){
   const projectResponse=await req('POST','/api/projects',{name:`合成接续 ${label}`});assert.equal(projectResponse.statusCode,200,projectResponse.body);
   const project=projectResponse.json().id;
   const docResponse=await req('POST',`/api/projects/${project}/documents`,{text:`邮箱：${email}；手机号：13800138000`,requestId:randomUUID()});
   assert.equal(docResponse.statusCode,200,docResponse.body);const documentId=docResponse.json().id;
   await tick();
   const client=await initialize();
   const started=await client.call('start_lawbot_redaction',{project_id:project,document_ids:[documentId],output_formats:['original','md'],masking_mode:'pseudonym',task_mode:'ai_process_restore',request_id:randomUUID()});
   assert.equal(started.isError,false,JSON.stringify(started));const jobId=started.structuredContent.jobId;
   let task=await human(jobId);
   const authorized=await req('POST',`/api/ai-collab/tasks/${jobId}/authorize`,{revision:task.revision,authorization:consent});
   assert.equal(authorized.statusCode,200,authorized.body);
   await tick();
   const documentResponse=await req('GET',`/api/documents/${documentId}`);assert.equal(documentResponse.statusCode,200,documentResponse.body);
   const document=documentResponse.json();assert.equal(document.state,'review');assert.ok(document.marks.length>0);
   const reviewed=await req('PUT',`/api/documents/${documentId}/review`,{revision:document.revision,marks:document.marks.map((m:any)=>({...m,decision:'redact'}))});
   assert.equal(reviewed.statusCode,200,reviewed.body);
   task=await human(jobId);
   const prepared=await req('POST',`/api/ai-collab/tasks/${jobId}/prepare-export`,{revision:task.revision});
   assert.equal(prepared.statusCode,200,prepared.body);await tick();
   task=await human(jobId);
   const released=await req('POST',`/api/ai-collab/tasks/${jobId}/release-export`,{revision:task.revision});
   assert.equal(released.statusCode,200,released.body);
   const received=await client.call('receive_sanitized_document',{job_id:jobId,output_format:'md'});
   assert.equal(received.isError,false,JSON.stringify(received));
   const bytes=Buffer.from(received.structuredContent.bytesBase64,'base64');
   assert.ok(bytes.length>0);assert.equal(hash(bytes),received.structuredContent.sha256);
   assert.ok(!bytes.toString().includes(email),'real delivery contains pseudonyms');
   assert.equal((await client.close()).statusCode,200);
   task=await human(jobId);
   assert.equal(task.state,'client_disconnected');
   assert.equal(task.resumeState,'analyzing_by_ai');
   assert.ok(task.deliveries.length>0);
   return {project,documentId,jobId,bytes,sha256:hash(bytes)};
  }
  async function storageRow(jobId:string){
   const r=await admin.query('SELECT revision,payload,updated_at FROM ai_collab_tasks WHERE id=$1',[taskUUID(jobId)]);
   assert.equal(r.rows.length,1);return r.rows[0];
  }
  const B=await createDelivered('B','b@example.com');
  const aClient=await initialize();
  const aStart=await aClient.call('start_lawbot_redaction',{project_id:B.project,task_mode:'redact_only',request_id:randomUUID()});
  assert.equal(aStart.isError,false,JSON.stringify(aStart));const A=aStart.structuredContent.jobId;
  const aBefore=await storageRow(A),bBefore=await storageRow(B.jobId);
  assert.ok(new Date(aBefore.updated_at).getTime()>=new Date(bBefore.updated_at).getTime(),'A must be the newer task');

  const resumedClient=await initialize();
  const chosen=await resumedClient.call('resume_lawbot_task',{});
  assert.equal(chosen.isError,false,JSON.stringify(chosen));
  assert.equal(chosen.structuredContent.jobId,B.jobId,'implicit resume must skip newer unapproved A');
  assert.equal(chosen.structuredContent.authorizationRequired,true);
  assert.deepEqual(await storageRow(A),aBefore,'A SQL revision, ciphertext, and timestamp stay exact');
  const blocked=await resumedClient.call('receive_sanitized_document',{job_id:B.jobId,output_format:'md'});
  assert.equal(blocked.structuredContent.error,'SESSION_AUTHORIZATION_REQUIRED','pending human consent cannot expose bytes');
  assert.equal(JSON.stringify(blocked).includes(B.bytes.toString('base64')),false);
  const pending=await human(B.jobId);
  const reauthorized=await req('POST',`/api/ai-collab/tasks/${B.jobId}/authorize`,{revision:pending.revision,authorization:consent});
  assert.equal(reauthorized.statusCode,200,reauthorized.body);
  const replay=await resumedClient.call('receive_sanitized_document',{job_id:B.jobId,output_format:'md'});
  assert.equal(replay.isError,false,JSON.stringify(replay));
  assert.equal(hash(Buffer.from(replay.structuredContent.bytesBase64,'base64')),B.sha256);

  const explicitClient=await initialize();
  const explicit=await explicitClient.call('resume_lawbot_task',{job_id:A});
  assert.equal(explicit.isError,false,JSON.stringify(explicit));
  assert.equal(explicit.structuredContent.jobId,A,'explicit ID retains preauthorization takeover');
  assert.equal(explicit.structuredContent.authorizationRequired,true);
  const noABytes=await explicitClient.call('receive_sanitized_document',{job_id:A,output_format:'md'});
  assert.equal(noABytes.structuredContent.error,'SESSION_AUTHORIZATION_REQUIRED');

  const C=await createDelivered('C','c@example.com');
  const beforeC=await storageRow(C.jobId),beforeB=await storageRow(B.jobId);
  assert.ok(new Date(beforeC.updated_at).getTime()>new Date(beforeB.updated_at).getTime(),'C must be newest delivered');
  const multiClient=await initialize();
  const newest=await multiClient.call('resume_lawbot_task',{});
  assert.equal(newest.isError,false,JSON.stringify(newest));
  assert.equal(newest.structuredContent.jobId,C.jobId,'multiple delivered tasks choose newest eligible, no new 409');
  assert.deepEqual(await storageRow(B.jobId),beforeB,'older delivered B stays untouched');

  // Synthetic storage ordering edge: a newer delivered-looking task in an
  // in-flight restore phase must not displace C. This is not a real restore.
  const copied=await storageRow(C.jobId),copiedId=taskUUID(C.jobId);
  const synthetic=JSON.parse(unseal(copied.payload,`${tenant}:${owner.uid}:ai-collab:${copiedId}`));
  const runningId=`lbj_${randomUUID().replaceAll('-','')}`,runningUuid=taskUUID(runningId);
  synthetic.jobId=runningId;synthetic.revision=1;synthetic.state='restoring';
  delete synthetic.resumeState;delete synthetic.pendingResume;
  await admin.query("INSERT INTO ai_collab_tasks(id,tenant_id,owner_id,project_id,revision,payload,created_at,updated_at) VALUES($1,$2,$3,$4,1,$5,now(),now()+interval '10 minutes')",
   [runningUuid,tenant,owner.uid,C.project,seal(JSON.stringify(synthetic),`${tenant}:${owner.uid}:ai-collab:${runningUuid}`)]);
  const runningBefore=await storageRow(runningId);
  const stableClient=await initialize();
  const stable=await stableClient.call('resume_lawbot_task',{});
  assert.equal(stable.isError,false,JSON.stringify(stable));
  assert.equal(stable.structuredContent.jobId,C.jobId,'newer in-flight restore cannot preempt stable delivered C');
  assert.deepEqual(await storageRow(runningId),runningBefore);

  // Synthetic damaged saved phase: explicit ID reports the existing error;
  // implicit selection skips it and keeps looking for valid delivered tasks.
  const damagedId=`lbj_${randomUUID().replaceAll('-','')}`,damagedUuid=taskUUID(damagedId);
  const damaged={...synthetic,jobId:damagedId,state:'client_disconnected',revision:1};
  await admin.query("INSERT INTO ai_collab_tasks(id,tenant_id,owner_id,project_id,revision,payload,created_at,updated_at) VALUES($1,$2,$3,$4,1,$5,now(),now()+interval '11 minutes')",
   [damagedUuid,tenant,owner.uid,C.project,seal(JSON.stringify(damaged),`${tenant}:${owner.uid}:ai-collab:${damagedUuid}`)]);
  const damagedBefore=await storageRow(damagedId);
  const badExplicit=await stableClient.call('resume_lawbot_task',{job_id:damagedId});
  assert.equal(badExplicit.structuredContent.error,'RESUME_STATE_UNAVAILABLE');
  assert.deepEqual(await storageRow(damagedId),damagedBefore);
  const afterBad=await initialize();
  const stillC=await afterBad.call('resume_lawbot_task',{});
  assert.equal(stillC.isError,false,JSON.stringify(stillC));
  assert.equal(stillC.structuredContent.jobId,C.jobId);

  const aPending=await human(A);
  const cancelled=await req('POST',`/api/ai-collab/tasks/${A}/action`,{revision:aPending.revision,method:'cancel'});
  assert.equal(cancelled.statusCode,200,cancelled.body);
  const cancelledBefore=await storageRow(A);
  const terminal=await afterBad.call('resume_lawbot_task',{job_id:A});
  assert.equal(terminal.structuredContent.error,'INVALID_STATE');
  assert.deepEqual(await storageRow(A),cancelledBefore);

  const foreign=await initialize(cross.request);
  const unseen=await foreign.call('resume_lawbot_task',{job_id:B.jobId});
  assert.equal(unseen.structuredContent.error,'NOT_FOUND','cross-tenant explicit ID is invisible');
  const foreignDefault=await foreign.call('resume_lawbot_task',{});
  assert.equal(foreignDefault.structuredContent.error,'TASK_NOT_FOUND','cross-tenant implicit list is empty');
  console.log(JSON.stringify({actualDeliveries:[B.jobId,C.jobId],selected:[chosen.structuredContent.jobId,newest.structuredContent.jobId,stable.structuredContent.jobId],syntheticEdges:['running','damaged','terminal'],crossTenant:'hidden'}));
 }finally{
  await app?.close();await pool.end();await admin.end();
 }
});
