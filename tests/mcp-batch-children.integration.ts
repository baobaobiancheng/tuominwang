import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,unseal} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';
import {parseReferenceMarkdown} from '../packages/core/reference-markdown.ts';

assert.match(new URL(process.env.DATABASE_URL!).pathname,/^\/tmw_test_/u);
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
const origin=process.env.APP_ORIGIN!;
const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};
async function fixture(){
 const tenant=randomUUID(),user=randomUUID(),username=`batch-child-${randomUUID()}`,password='synthetic-batch-child-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0],req=(method:any,url:string,payload?:any,extra:Record<string,string>={})=>app.inject({method,url,payload,headers:{origin,cookie,...extra}});
 const projectResponse=await req('POST','/api/projects',{name:'synthetic real child batch'});assert.equal(projectResponse.statusCode,200,projectResponse.body);const project=projectResponse.json().id as string;
 const init=await req('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'batch-test',version:'1'}}});assert.equal(init.statusCode,200,init.body);
 const headers={'mcp-session-id':String(init.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
 const acknowledged=await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers);assert.equal(acknowledged.statusCode,202,acknowledged.body);
 let sequence=1;const tool=async(name:string,args:Record<string,unknown>)=>{const result=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++sequence,method:'tools/call',params:{name,arguments:args}},headers);assert.equal(result.statusCode,200,result.body);return result.json().result;};
 const makeDoc=async(phone:string,sharedPhone?:string)=>{const response=await req('POST',`/api/projects/${project}/documents`,{text:`合成电话 ${phone}${sharedPhone?`；共同电话 ${sharedPhone}`:''}`,requestId:randomUUID()});assert.equal(response.statusCode,200,response.body);const id=response.json().id as string;for(let i=0;i<30;i++){const [j]=(await admin.query("SELECT status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NULL ORDER BY created_at DESC LIMIT 1",[id])).rows;if(j?.status==='succeeded')return id;assert.notEqual(j?.status,'failed');await tick();}throw new Error('INITIAL_DETECTION_NOT_COMPLETE');};
 const newClient=async()=>{const opened=await req('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'batch-resume-test',version:'1'}}});assert.equal(opened.statusCode,200,opened.body);const otherHeaders={'mcp-session-id':String(opened.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};assert.equal((await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},otherHeaders)).statusCode,202);let otherSequence=1;return async(name:string,args:Record<string,unknown>)=>{const response=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++otherSequence,method:'tools/call',params:{name,arguments:args}},otherHeaders);assert.equal(response.statusCode,200,response.body);return response.json().result;};};
 return {tenant,user,project,req,tool,newClient,makeDoc,headers};
}

test('real batch children keep independent artifact selectors, task states and top-level display',async()=>{
 const f=await fixture(),docs=[await f.makeDoc('13800138000'),await f.makeDoc('13900139000')];
 const started=await f.tool('start_lawbot_redaction',{project_id:f.project,document_ids:docs,masking_mode:'default_mask',task_mode:'redact_only',batch_result_mode:'individual',output_formats:['original','md'],request_id:randomUUID()});
 assert.equal(started.isError,false,JSON.stringify(started));const parentId=started.structuredContent.jobId as string,childIds=started.structuredContent.childJobIds as string[];
 assert.equal(childIds.length,2);assert.equal(new Set(childIds).size,2);
 const list=await f.req('GET','/api/ai-collab/tasks');assert.equal(list.statusCode,200,list.body);assert.deepEqual(list.json().items.map((x:any)=>x.jobId),[parentId]);
 for(const [index,childId] of childIds.entries()){
  const response=await f.req('GET',`/api/ai-collab/tasks/${childId}`);assert.equal(response.statusCode,200,response.body);
  assert.equal(response.json().parentJobId,parentId);assert.deepEqual(response.json().sources.map((x:any)=>x.documentId),[docs[index]]);
 }
 const parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();
 const authorized=await f.req('POST',`/api/ai-collab/tasks/${parentId}/authorize`,{revision:parent.revision,authorization:consent});assert.equal(authorized.statusCode,200,authorized.body);
 const [listedDuringProgress,pollDuringProgress]=await Promise.all([f.req('GET','/api/ai-collab/tasks'),f.tool('check_document_delivery',{job_id:parentId,wait_seconds:0})]);
 assert.equal(listedDuringProgress.statusCode,200,listedDuringProgress.body);
 assert.equal(pollDuringProgress.isError,false,JSON.stringify(pollDuringProgress));
 let ready:any;
 for(let i=0;i<60;i++){
  await tick();const progress=await f.tool('check_document_delivery',{job_id:parentId,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));
  ready=progress.structuredContent;
  if(progress.structuredContent.documents?.every((d:any)=>d.status==='sanitized_artifact_ready'||d.status==='completed'))break;
  if(i===59)throw new Error(`BATCH_NOT_READY:${JSON.stringify(progress.structuredContent.documents)}`);
 }
 for(const [index,document] of ready.documents.entries()){
  assert.equal(document.jobId,childIds[index]);
  assert.match(document.sanitizedArtifact?.artifactId??'',/^lba_[a-f0-9]{32}$/u);
  assert.match(document.sanitizedArtifact?.sha256??'',/^[a-f0-9]{64}$/u);
  assert.equal(document.sanitizedArtifact?.format,'md');
 }
 const owned=(await admin.query("SELECT kind,collab_task_id FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind IN ('detect','export')",[childIds.map(taskUUID)])).rows;
 assert.equal(owned.filter((job:any)=>job.kind==='detect').length,2);
 assert.equal(owned.filter((job:any)=>job.kind==='export').length,2);
 const parentReceive=await f.tool('receive_sanitized_document',{job_id:parentId,output_format:'md'});assert.equal(parentReceive.isError,true);assert.equal(parentReceive.structuredContent.error,'BATCH_CHILD_JOB_REQUIRED');
 assert.match(parentReceive.structuredContent.instructions,/documents/u);
 const stale=await f.tool('receive_sanitized_document',{job_id:parentId,artifact_id:`lba_${'f'.repeat(32)}`,output_format:'md'});
 assert.equal(stale.isError,true);assert.equal(stale.structuredContent.error,'BATCH_ARTIFACT_NOT_RECEIVABLE');
 for(const [index,childId] of childIds.entries()){
  const received=await f.tool('receive_sanitized_document',{job_id:index===0?parentId:childId,...(index===0?{artifact_id:ready.documents[index].sanitizedArtifact.artifactId}:{}),output_format:'md'});assert.equal(received.isError,false,JSON.stringify(received));
  assert.equal(received.structuredContent.jobId,childId);assert.equal(received.structuredContent.format,'md');
  assert.equal(received.structuredContent.artifactId,ready.documents[index].sanitizedArtifact.artifactId);
  const bytes=Buffer.from(received.structuredContent.bytesBase64,'base64');assert.ok(bytes.length>0);assert.equal(bytes.includes(Buffer.from(index===0?'13800138000':'13900139000')),false);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),received.structuredContent.sha256);
  const jobs=(await admin.query('SELECT DISTINCT collab_task_id FROM jobs WHERE document_id=$1 AND kind IN ($2,$3) AND collab_task_id IS NOT NULL',[docs[index],'detect','export'])).rows;
  assert.deepEqual(jobs.map(x=>x.collab_task_id),[taskUUID(childId)]);
 }
 const repeated=await f.tool('check_document_delivery',{job_id:parentId,wait_seconds:0});assert.equal(repeated.isError,false,JSON.stringify(repeated));assert.deepEqual(repeated.structuredContent.documents.map((d:any)=>d.jobId),childIds);
});

test('combined parent publishes only real successful children after one owned detect fails',async()=>{
 const f=await fixture(),docs=[await f.makeDoc('13700137000'),await f.makeDoc('13600136000')];
 const started=await f.tool('start_lawbot_redaction',{project_id:f.project,document_ids:docs,masking_mode:'default_mask',task_mode:'redact_only',batch_result_mode:'combined',output_formats:['original','md'],request_id:randomUUID()});
 assert.equal(started.isError,false,JSON.stringify(started));const parentId=started.structuredContent.jobId as string,childIds=started.structuredContent.childJobIds as string[];
 const parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();
 const authorization=await f.req('POST',`/api/ai-collab/tasks/${parentId}/authorize`,{revision:parent.revision,authorization:consent});assert.equal(authorization.statusCode,200,authorization.body);
 const [first]=(await admin.query("SELECT id,status FROM jobs WHERE collab_task_id=$1 AND kind='detect' ORDER BY created_at DESC LIMIT 1",[taskUUID(childIds[0])])).rows;
 assert.equal(first?.status,'queued');
 await admin.query("UPDATE jobs SET status='failed',error_code='SYNTHETIC_CHILD_FAILURE' WHERE id=$1 AND status='queued'",[first.id]);
 let progress:any;for(let i=0;i<60;i++){
  await tick();progress=await f.tool('check_document_delivery',{job_id:parentId,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));
  if(progress.structuredContent.status==='sanitized_artifact_ready')break;
  if(i===59)throw new Error(`PARTIAL_COMBINED_NOT_READY:${JSON.stringify(progress.structuredContent.documents)}`);
 }
 assert.equal(progress.structuredContent.documents.length,2);
 assert.equal(progress.structuredContent.documents[0].jobId,childIds[0]);assert.equal(progress.structuredContent.documents[0].status,'failed');
 assert.equal(progress.structuredContent.documents[1].jobId,childIds[1]);assert.equal(progress.structuredContent.documents[1].status,'sanitized_artifact_ready');
 assert.equal(progress.structuredContent.documents[0].sanitizedArtifact,undefined);
 assert.match(progress.structuredContent.documents[1].sanitizedArtifact?.artifactId??'',/^lba_[a-f0-9]{32}$/u);
 assert.equal(progress.structuredContent.redactionOptions.batchResultMode,'combined');
 assert.equal(progress.structuredContent.sanitizedArtifact?.format,'md');
 assert.match(progress.structuredContent.sanitizedArtifact?.artifactId??'',/^lba_[a-f0-9]{32}$/u);
 const failed=await f.tool('receive_sanitized_document',{job_id:childIds[0]});assert.equal(failed.isError,true);
 const good=await f.tool('receive_sanitized_document',{job_id:childIds[1],output_format:'md'});assert.equal(good.isError,false,JSON.stringify(good));
 const combined=await f.tool('receive_sanitized_document',{job_id:parentId,artifact_id:progress.structuredContent.sanitizedArtifact.artifactId,output_format:'md'});assert.equal(combined.isError,false,JSON.stringify(combined));
 assert.equal(combined.structuredContent.artifactId,progress.structuredContent.sanitizedArtifact.artifactId);
 const body=Buffer.from(combined.structuredContent.bytesBase64,'base64').toString('utf8');
 assert.equal(body.includes('材料 1'),true);assert.equal(body.includes('材料 2'),false);assert.equal(body.includes('13700137000'),false);assert.equal(body.includes('13600136000'),false);
 const delivered=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json().deliveries;assert.ok(delivered.length>0);assert.ok(delivered.every((d:any)=>d.documentId===docs[1]));
});

test('combined parent keeps its real result round through submit, review, restore and completion poll',async()=>{
 const f=await fixture(),docs=[await f.makeDoc('13500135000'),await f.makeDoc('13400134000')];
 const started=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,document_ids:docs,masking_mode:'pseudonym',task_mode:'ai_process_restore',batch_result_mode:'combined',output_formats:['original','md'],request_id:randomUUID()});
 assert.equal(started.isError,false,JSON.stringify(started));const parentId=started.structuredContent.jobId as string,childIds=started.structuredContent.childJobIds as string[];
 let parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();
 const authorized=await f.req('POST',`/api/ai-collab/tasks/${parentId}/authorize`,{revision:parent.revision,authorization:{...consent,allowRestorePath:true}});assert.equal(authorized.statusCode,200,authorized.body);
 for(let attempt=0;attempt<80;attempt++){
  await tick();const owned=(await admin.query("SELECT collab_task_id,status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind='detect'",[childIds.map(taskUUID)])).rows;
  if(owned.length===2&&owned.every((j:any)=>j.status==='succeeded'))break;
  if(attempt===79)throw new Error(`CHILD_DETECTION_NOT_COMPLETE:${JSON.stringify(owned)}`);
 }
 for(const documentId of docs){const d=(await f.req('GET',`/api/documents/${documentId}`)).json();assert.equal(d.state,'review');assert.ok(d.marks.length>0);assert.ok(d.marks.every((m:any)=>m.replacement?.mode==='alias'));const saved=await f.req('PUT',`/api/documents/${documentId}/review`,{revision:d.revision,marks:d.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(saved.statusCode,200,saved.body);}
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();const prepared=await f.req('POST',`/api/ai-collab/tasks/${parentId}/prepare-export`,{revision:parent.revision});assert.equal(prepared.statusCode,200,prepared.body);
 for(let attempt=0;attempt<80;attempt++){
  await tick();const jobs=(await admin.query("SELECT status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind='export'",[childIds.map(taskUUID)])).rows;
  if(jobs.length===2&&jobs.every((j:any)=>j.status==='succeeded'))break;
  if(attempt===79)throw new Error(`CHILD_EXPORT_NOT_COMPLETE:${JSON.stringify(jobs)}`);
 }
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();const released=await f.req('POST',`/api/ai-collab/tasks/${parentId}/release-export`,{revision:parent.revision});assert.equal(released.statusCode,200,released.body);
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal(parent.state,'waiting_for_task_selection');
 const intent=await f.req('POST',`/api/ai-collab/tasks/${parentId}/action`,{revision:parent.revision,method:'set-review-intent',intent:{goals:['proofreading'],outputKinds:['clean_copy'],outputFormat:'md',restorationRequested:true}});assert.equal(intent.statusCode,200,intent.body);
 const selection=await f.tool('check_document_delivery',{job_id:parentId,wait_seconds:0});assert.equal(selection.isError,false,JSON.stringify(selection));assert.match(selection.structuredContent.sanitizedArtifact?.artifactId??'',/^lba_[a-f0-9]{32}$/u);
 const received=await f.tool('receive_sanitized_document',{job_id:parentId,artifact_id:selection.structuredContent.sanitizedArtifact.artifactId,output_format:'md'});assert.equal(received.isError,false,JSON.stringify(received));const input=received.structuredContent;
 assert.equal(input.jobId,parentId);assert.equal(input.resultFormat,'md');const bytes=Buffer.from(input.bytesBase64,'base64');assert.equal(bytes.includes(Buffer.from('13500135000')),false);assert.equal(bytes.includes(Buffer.from('13400134000')),false);
 const submitted=await f.tool('submit_reviewed_document',{job_id:parentId,round_id:input.roundId,slot_id:input.slotId,sha256:createHash('sha256').update(bytes).digest('hex'),suggested_name:'reviewed.md',bytes_base64:bytes.toString('base64')});assert.equal(submitted.isError,false,JSON.stringify(submitted));assert.equal(submitted.structuredContent.validation.valid,true);
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();const reviewed=await f.req('POST',`/api/ai-collab/tasks/${parentId}/review-result`,{revision:parent.revision,roundId:input.roundId,approved:true});assert.equal(reviewed.statusCode,200,reviewed.body);
 const restoration=await f.tool('start_lawbot_restoration',{job_id:parentId,round_id:input.roundId});assert.equal(restoration.isError,false,JSON.stringify(restoration));
 const completion=await f.tool('check_restore_completion',{job_id:parentId,round_id:input.roundId,wait_seconds:0});assert.equal(completion.isError,false,JSON.stringify(completion));assert.equal(completion.structuredContent.status,'round_completed');
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();const restoredId=parent.rounds.at(-1)?.restoredArtifactId;assert.ok(restoredId);const download=await f.req('GET',`/api/projects/${f.project}/restoration/files/${restoredId}`);assert.equal(download.statusCode,200);assert.ok(download.body.includes('13500135000'));assert.ok(download.body.includes('13400134000'));
 const second=await f.newClient();const requested=await second('resume_lawbot_task',{job_id:parentId});assert.equal(requested.isError,false,JSON.stringify(requested));const requestId=requested.structuredContent.jobId;assert.notEqual(requestId,parentId);assert.equal(requested.structuredContent.resumeSourceJobId,parentId);assert.equal(requested.structuredContent.status,'waiting_for_session_authorization');
 assert.equal((await second('check_document_delivery',{job_id:parentId,wait_seconds:0})).structuredContent.error,'SESSION_AUTHORIZATION_REQUIRED');
 const requestTask=(await f.req('GET',`/api/ai-collab/tasks/${requestId}`)).json();const resumeConsent={...consent,allowRedactionPath:false,createExchangeFolder:false,allowRestorePath:true};
 const denied=await f.req('POST',`/api/ai-collab/tasks/${requestId}/authorize`,{revision:requestTask.revision,authorization:{...resumeConsent,allowRestorePath:false}});assert.equal(denied.statusCode,403,denied.body);assert.equal(denied.json().error,'RESTORE_AUTHORIZATION_REQUIRED');
 const resumed=await f.req('POST',`/api/ai-collab/tasks/${requestId}/authorize`,{revision:requestTask.revision,authorization:resumeConsent});assert.equal(resumed.statusCode,200,resumed.body);assert.equal(resumed.json().jobId,parentId);
 assert.equal((await f.req('GET',`/api/ai-collab/tasks/${requestId}`)).json().resumedJobId,parentId);
 const resumedPoll=await second('check_document_delivery',{job_id:parentId,wait_seconds:0});assert.equal(resumedPoll.isError,false,JSON.stringify(resumedPoll));assert.deepEqual(resumedPoll.structuredContent.documents.map((d:any)=>d.jobId),childIds);
 const aliasPoll=await second('check_document_delivery',{job_id:requestId,wait_seconds:0});assert.equal(aliasPoll.isError,false,JSON.stringify(aliasPoll));assert.equal(aliasPoll.structuredContent.jobId,parentId);assert.deepEqual(aliasPoll.structuredContent.documents.map((d:any)=>d.jobId),childIds);
 const aliasContinue=await second('continue_current_document_review',{job_id:requestId});assert.equal(aliasContinue.isError,false,JSON.stringify(aliasContinue));assert.equal(aliasContinue.structuredContent.jobId,parentId);
 const aliasReceive=await second('receive_sanitized_document',{job_id:requestId,artifact_id:selection.structuredContent.sanitizedArtifact.artifactId,output_format:'md'});assert.equal(aliasReceive.isError,false,JSON.stringify(aliasReceive));assert.equal(aliasReceive.structuredContent.jobId,parentId);
 for(const childId of childIds)assert.equal((await f.req('GET',`/api/ai-collab/tasks/${childId}`)).json().caller.sessionId,requestTask.caller.sessionId);
 assert.equal((await f.tool('check_document_delivery',{job_id:parentId,wait_seconds:0})).structuredContent.error,'SESSION_AUTHORIZATION_REQUIRED');
});

test('two individual children keep separate AI rounds and restoration while sharing the batch mapping',async()=>{
 const f=await fixture(),shared='13700137000',docs=[await f.makeDoc('13800138000',shared),await f.makeDoc('13900139000',shared)];
 const start=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,document_ids:docs,masking_mode:'pseudonym',task_mode:'ai_process_restore',batch_result_mode:'individual',output_formats:['original','md'],request_id:randomUUID()});
 assert.equal(start.isError,false,JSON.stringify(start));const parentId=start.structuredContent.jobId as string,childIds=start.structuredContent.childJobIds as string[];assert.equal(childIds.length,2);
 let parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();
 const authorized=await f.req('POST',`/api/ai-collab/tasks/${parentId}/authorize`,{revision:parent.revision,authorization:{...consent,allowRestorePath:true}});assert.equal(authorized.statusCode,200,authorized.body);
 for(let attempt=0;attempt<80;attempt++){
  await tick();const owned=(await admin.query("SELECT collab_task_id,status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind='detect'",[childIds.map(taskUUID)])).rows;
  if(owned.length===2&&owned.every((j:any)=>j.status==='succeeded'))break;
  if(attempt===79)throw new Error(`CHILD_DETECTION_NOT_COMPLETE:${JSON.stringify(owned)}`);
 }
 const sharedTokens:string[]=[],uniqueTokens:string[]=[];
 for(const [index,documentId] of docs.entries()){const d=(await f.req('GET',`/api/documents/${documentId}`)).json();assert.equal(d.state,'review');assert.ok(d.marks.length>0);
  const tokenFor=(value:string)=>d.marks.find((m:any)=>d.text.slice(m.start,m.end)===value&&m.replacement?.mode==='alias')?.replacement?.token;
  const sharedToken=tokenFor(shared),uniqueToken=tokenFor(index===0?'13800138000':'13900139000');assert.ok(sharedToken,JSON.stringify(d.marks));assert.ok(uniqueToken,JSON.stringify(d.marks));sharedTokens.push(sharedToken);uniqueTokens.push(uniqueToken);
  const saved=await f.req('PUT',`/api/documents/${documentId}/review`,{revision:d.revision,marks:d.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(saved.statusCode,200,saved.body);}
 assert.equal(sharedTokens[0],sharedTokens[1]);assert.notEqual(uniqueTokens[0],uniqueTokens[1]);assert.notEqual(uniqueTokens[0],sharedTokens[0]);
 const savedSharedTokens:string[]=[],savedUniqueTokens:string[]=[];
 for(const [index,documentId] of docs.entries()){
  const current=(await f.req('GET',`/api/documents/${documentId}`)).json();
  const tokenFor=(value:string)=>current.marks.find((m:any)=>current.text.slice(m.start,m.end)===value&&m.decision==='redact'&&m.replacement?.mode==='alias')?.replacement?.token;
  savedSharedTokens.push(tokenFor(shared));savedUniqueTokens.push(tokenFor(index===0?'13800138000':'13900139000'));
 }
 assert.ok(savedSharedTokens.every(Boolean));assert.ok(savedUniqueTokens.every(Boolean));assert.equal(savedSharedTokens[0],savedSharedTokens[1]);assert.notEqual(savedUniqueTokens[0],savedUniqueTokens[1]);
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal((await f.req('POST',`/api/ai-collab/tasks/${parentId}/prepare-export`,{revision:parent.revision})).statusCode,200);
 for(let attempt=0;attempt<80;attempt++){
  await tick();const owned=(await admin.query("SELECT collab_task_id,status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind='export'",[childIds.map(taskUUID)])).rows;
  if(owned.length===2&&owned.every((j:any)=>j.status==='succeeded'))break;
  if(attempt===79)throw new Error(`CHILD_EXPORT_NOT_COMPLETE:${JSON.stringify(owned)}`);
 }
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();const released=await f.req('POST',`/api/ai-collab/tasks/${parentId}/release-export`,{revision:parent.revision});assert.equal(released.statusCode,200,released.body);
 const firstCompletion=[] as Array<{childId:string;roundId:string;restoredId:string;bytes:string}>;
 for(const [index,childId] of childIds.entries()){
  let child=(await f.req('GET',`/api/ai-collab/tasks/${childId}`)).json();assert.equal(child.parentJobId,parentId);
  const intent=await f.req('POST',`/api/ai-collab/tasks/${childId}/action`,{revision:child.revision,method:'set-review-intent',intent:{goals:['proofreading'],outputKinds:['clean_copy'],outputFormat:'md',restorationRequested:true}});assert.equal(intent.statusCode,200,intent.body);
  const ready=await f.tool('check_document_delivery',{job_id:childId,wait_seconds:0});assert.equal(ready.isError,false,JSON.stringify(ready));
  const received=await f.tool('receive_sanitized_document',{job_id:childId,artifact_id:ready.structuredContent.sanitizedArtifact.artifactId,output_format:'md'});assert.equal(received.isError,false,JSON.stringify(received));const input=received.structuredContent;
  assert.equal(input.jobId,childId);assert.equal(input.roundId,'lbr_0001');assert.equal(input.resultFormat,'md');
  const bytes=Buffer.from(input.bytesBase64,'base64');assert.ok(bytes.length>0);assert.equal(bytes.includes(Buffer.from(index===0?'13800138000':'13900139000')),false);assert.equal(bytes.includes(Buffer.from(shared)),false);
  const visibleText=parseReferenceMarkdown(bytes).scanText;
  assert.ok(visibleText.includes(savedSharedTokens[index]!));assert.ok(visibleText.includes(savedUniqueTokens[index]!));
  const submitted=await f.tool('submit_reviewed_document',{job_id:childId,round_id:input.roundId,slot_id:input.slotId,sha256:createHash('sha256').update(bytes).digest('hex'),suggested_name:`reviewed-${index}.md`,bytes_base64:bytes.toString('base64')});assert.equal(submitted.isError,false,JSON.stringify(submitted));assert.equal(submitted.structuredContent.validation.valid,true);
  child=(await f.req('GET',`/api/ai-collab/tasks/${childId}`)).json();const reviewed=await f.req('POST',`/api/ai-collab/tasks/${childId}/review-result`,{revision:child.revision,roundId:input.roundId,approved:true});assert.equal(reviewed.statusCode,200,reviewed.body);
  const restoration=await f.tool('start_lawbot_restoration',{job_id:childId,round_id:input.roundId});assert.equal(restoration.isError,false,JSON.stringify(restoration));
  const completion=await f.tool('check_restore_completion',{job_id:childId,round_id:input.roundId,wait_seconds:0});assert.equal(completion.isError,false,JSON.stringify(completion));assert.equal(completion.structuredContent.status,'round_completed');
  child=(await f.req('GET',`/api/ai-collab/tasks/${childId}`)).json();const restoredId=child.rounds.at(-1)?.restoredArtifactId;assert.ok(restoredId);
  const download=await f.req('GET',`/api/projects/${f.project}/restoration/files/${restoredId}`);assert.equal(download.statusCode,200,download.body);
  assert.ok(download.body.includes(index===0?'13800138000':'13900139000'));assert.ok(download.body.includes(shared));assert.equal(download.body.includes(index===0?'13900139000':'13800138000'),false);
  firstCompletion.push({childId,roundId:input.roundId,restoredId,bytes:download.body});
  if(index===0){const untouched=(await f.req('GET',`/api/ai-collab/tasks/${childIds[1]}`)).json();assert.equal(untouched.rounds.length,0);assert.equal(untouched.state,'waiting_for_task_selection');}
 }
 assert.notEqual(firstCompletion[0]!.restoredId,firstCompletion[1]!.restoredId);
 const finished=await f.tool('check_document_delivery',{job_id:parentId,wait_seconds:0});assert.equal(finished.isError,false,JSON.stringify(finished));assert.deepEqual(finished.structuredContent.documents.map((d:any)=>d.jobId),childIds);
});

test('failed child preparation restarts only failed sources in a linked new task',async()=>{
 const f=await fixture(),docs=[await f.makeDoc('13300133000'),await f.makeDoc('13200132000')];
 const start=await f.tool('start_lawbot_redaction',{project_id:f.project,document_ids:docs,masking_mode:'default_mask',task_mode:'redact_only',batch_result_mode:'individual',output_formats:['original','md'],request_id:randomUUID()});assert.equal(start.isError,false,JSON.stringify(start));const parentId=start.structuredContent.jobId as string,childIds=start.structuredContent.childJobIds as string[];
 let parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal((await f.req('POST',`/api/ai-collab/tasks/${parentId}/authorize`,{revision:parent.revision,authorization:consent})).statusCode,200);
 const ids=childIds.map(taskUUID),jobs=(await admin.query("SELECT id,collab_task_id,status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind='detect'",[ids])).rows;assert.equal(jobs.length,2);assert.ok(jobs.every((j:any)=>j.status==='queued'));
 for(const current of jobs)await admin.query("UPDATE jobs SET status='failed',error_code='SYNTHETIC_CHILD_FAILURE' WHERE id=$1 AND status='queued'",[current.id]);
 const failed=await f.tool('check_document_delivery',{job_id:parentId,wait_seconds:0});assert.equal(failed.isError,false,JSON.stringify(failed));assert.equal(failed.structuredContent.status,'failed');
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();const restarted=await f.req('POST',`/api/ai-collab/tasks/${parentId}/action`,{revision:parent.revision,method:'restart-preparation'});assert.equal(restarted.statusCode,200,restarted.body);const replacement=restarted.json();assert.notEqual(replacement.jobId,parentId);assert.equal(replacement.resumedFromJobId,parentId);assert.equal(replacement.childJobIds.length,2);
 const old=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal(old.resumedJobId,replacement.jobId);assert.equal(old.state,'failed');
 assert.deepEqual((await f.req('GET',`/api/ai-collab/tasks/${replacement.jobId}`)).json().sources.map((s:any)=>s.documentId),docs);
});

test('parent cancellation stops pending children without changing their source documents',async()=>{
 const f=await fixture(),docs=[await f.makeDoc('13100131000'),await f.makeDoc('13000130000')];
 const start=await f.tool('start_lawbot_redaction',{project_id:f.project,document_ids:docs,masking_mode:'default_mask',task_mode:'redact_only',batch_result_mode:'individual',output_formats:['original','md'],request_id:randomUUID()});assert.equal(start.isError,false,JSON.stringify(start));const parentId=start.structuredContent.jobId as string,childIds=start.structuredContent.childJobIds as string[];
 const before=(await admin.query('SELECT id,source_hash,content_hash FROM documents WHERE id = ANY($1::uuid[]) ORDER BY id',[docs])).rows;
 let parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal((await f.req('POST',`/api/ai-collab/tasks/${parentId}/authorize`,{revision:parent.revision,authorization:consent})).statusCode,200);
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();const cancelled=await f.req('POST',`/api/ai-collab/tasks/${parentId}/action`,{revision:parent.revision,method:'cancel'});assert.equal(cancelled.statusCode,200,cancelled.body);assert.equal(cancelled.json().state,'cancelled_by_user');
 for(const childId of childIds){const child=(await f.req('GET',`/api/ai-collab/tasks/${childId}`)).json();assert.equal(child.state,'cancelled_by_user');const jobs=(await admin.query("SELECT status FROM jobs WHERE collab_task_id=$1 AND status IN ('queued','running')",[taskUUID(childId)])).rows;assert.equal(jobs.length,0);}
 const after=(await admin.query('SELECT id,source_hash,content_hash FROM documents WHERE id = ANY($1::uuid[]) ORDER BY id',[docs])).rows;assert.deepEqual(after,before);
 assert.equal((await f.tool('check_document_delivery',{job_id:parentId,wait_seconds:0})).structuredContent.status,'cancelled_by_user');
});

test('a disconnected delivered batch resumes through its approved request without rerunning detect or export',async()=>{
 const f=await fixture(),docs=[await f.makeDoc('12900129000'),await f.makeDoc('12800128000')];
 const started=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,document_ids:docs,masking_mode:'pseudonym',task_mode:'ai_process_restore',batch_result_mode:'combined',output_formats:['original','md'],request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));const parentId=started.structuredContent.jobId as string,childIds=started.structuredContent.childJobIds as string[];
 let parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal((await f.req('POST',`/api/ai-collab/tasks/${parentId}/authorize`,{revision:parent.revision,authorization:{...consent,allowRestorePath:true}})).statusCode,200);
 for(let attempt=0;attempt<80;attempt++){await tick();const owned=(await admin.query("SELECT status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind='detect'",[childIds.map(taskUUID)])).rows;if(owned.length===2&&owned.every((j:any)=>j.status==='succeeded'))break;if(attempt===79)throw new Error(`CHILD_DETECTION_NOT_COMPLETE:${JSON.stringify(owned)}`);}
 for(const documentId of docs){const d=(await f.req('GET',`/api/documents/${documentId}`)).json();const saved=await f.req('PUT',`/api/documents/${documentId}/review`,{revision:d.revision,marks:d.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(saved.statusCode,200,saved.body);}
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal((await f.req('POST',`/api/ai-collab/tasks/${parentId}/prepare-export`,{revision:parent.revision})).statusCode,200);
 for(let attempt=0;attempt<80;attempt++){await tick();const owned=(await admin.query("SELECT status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind='export'",[childIds.map(taskUUID)])).rows;if(owned.length===2&&owned.every((j:any)=>j.status==='succeeded'))break;if(attempt===79)throw new Error(`CHILD_EXPORT_NOT_COMPLETE:${JSON.stringify(owned)}`);}
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal((await f.req('POST',`/api/ai-collab/tasks/${parentId}/release-export`,{revision:parent.revision})).statusCode,200);
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal((await f.req('POST',`/api/ai-collab/tasks/${parentId}/action`,{revision:parent.revision,method:'set-review-intent',intent:{goals:['proofreading'],outputKinds:['clean_copy'],outputFormat:'md',restorationRequested:true}})).statusCode,200);
 const ready=await f.tool('check_document_delivery',{job_id:parentId,wait_seconds:0});assert.equal(ready.isError,false,JSON.stringify(ready));const artifactId=ready.structuredContent.sanitizedArtifact.artifactId as string;
 const oldJobs=(await admin.query("SELECT id,status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) ORDER BY id",[childIds.map(taskUUID)])).rows;
 const closed=await f.req('DELETE','/api/mcp',undefined,f.headers);assert.equal(closed.statusCode,200,closed.body);
 assert.equal((await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json().state,'client_disconnected');
 const replacement=await f.newClient();const requested=await replacement('resume_lawbot_task',{job_id:parentId});assert.equal(requested.isError,false,JSON.stringify(requested));const requestId=requested.structuredContent.jobId as string;assert.notEqual(requestId,parentId);
 const request=(await f.req('GET',`/api/ai-collab/tasks/${requestId}`)).json();const approved=await f.req('POST',`/api/ai-collab/tasks/${requestId}/authorize`,{revision:request.revision,authorization:{...consent,allowRedactionPath:false,createExchangeFolder:false,allowRestorePath:true}});assert.equal(approved.statusCode,200,approved.body);assert.equal(approved.json().jobId,parentId);
 const polled=await replacement('check_document_delivery',{job_id:requestId,wait_seconds:0});assert.equal(polled.isError,false,JSON.stringify(polled));assert.equal(polled.structuredContent.jobId,parentId);
 const received=await replacement('receive_sanitized_document',{job_id:requestId,artifact_id:artifactId,output_format:'md'});assert.equal(received.isError,false,JSON.stringify(received));assert.equal(received.structuredContent.jobId,parentId);
 const currentJobs=(await admin.query("SELECT id,status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) ORDER BY id",[childIds.map(taskUUID)])).rows;assert.deepEqual(currentJobs,oldJobs);
});

test('batch resume denies quarantined source and changed combined bytes before moving any caller',async()=>{
 const f=await fixture(),docs=[await f.makeDoc('12700127000'),await f.makeDoc('12600126000')];
 const started=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,document_ids:docs,masking_mode:'pseudonym',task_mode:'ai_process_restore',batch_result_mode:'combined',output_formats:['original','md'],request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));const parentId=started.structuredContent.jobId as string,childIds=started.structuredContent.childJobIds as string[];
 let parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal((await f.req('POST',`/api/ai-collab/tasks/${parentId}/authorize`,{revision:parent.revision,authorization:{...consent,allowRestorePath:true}})).statusCode,200);
 for(let attempt=0;attempt<80;attempt++){await tick();const owned=(await admin.query("SELECT status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind='detect'",[childIds.map(taskUUID)])).rows;if(owned.length===2&&owned.every((j:any)=>j.status==='succeeded'))break;if(attempt===79)throw new Error(`CHILD_DETECTION_NOT_COMPLETE:${JSON.stringify(owned)}`);}
 for(const documentId of docs){const d=(await f.req('GET',`/api/documents/${documentId}`)).json();const saved=await f.req('PUT',`/api/documents/${documentId}/review`,{revision:d.revision,marks:d.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(saved.statusCode,200,saved.body);}
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal((await f.req('POST',`/api/ai-collab/tasks/${parentId}/prepare-export`,{revision:parent.revision})).statusCode,200);
 for(let attempt=0;attempt<80;attempt++){await tick();const owned=(await admin.query("SELECT status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind='export'",[childIds.map(taskUUID)])).rows;if(owned.length===2&&owned.every((j:any)=>j.status==='succeeded'))break;if(attempt===79)throw new Error(`CHILD_EXPORT_NOT_COMPLETE:${JSON.stringify(owned)}`);}
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal((await f.req('POST',`/api/ai-collab/tasks/${parentId}/release-export`,{revision:parent.revision})).statusCode,200);
 parent=(await f.req('GET',`/api/ai-collab/tasks/${parentId}`)).json();assert.equal((await f.req('POST',`/api/ai-collab/tasks/${parentId}/action`,{revision:parent.revision,method:'set-review-intent',intent:{goals:['proofreading'],outputKinds:['clean_copy'],outputFormat:'md',restorationRequested:true}})).statusCode,200);
 const second=await f.newClient(),requested=await second('resume_lawbot_task',{job_id:parentId});assert.equal(requested.isError,false,JSON.stringify(requested));const requestId=requested.structuredContent.jobId as string;
 const request=(await f.req('GET',`/api/ai-collab/tasks/${requestId}`)).json(),approval={revision:request.revision,authorization:{...consent,allowRedactionPath:false,createExchangeFolder:false,allowRestorePath:true}};
 const parentRow=(await admin.query('SELECT * FROM ai_collab_tasks WHERE id=$1',[taskUUID(parentId)])).rows[0],payloadHash=createHash('sha256').update(parentRow.payload).digest('hex');
 await admin.query("INSERT INTO ai_collab_task_quarantine(receipt_id,task_id,tenant_id,project_id,owner_id,actor_id,request_id,task_revision,payload_ciphertext,payload_sha256,task_created_at,task_updated_at,failure_code) SELECT $2,id,tenant_id,project_id,owner_id,$3,$4,revision,payload,$5,created_at,updated_at,'TASK_STORAGE_INVALID' FROM ai_collab_tasks WHERE id=$1",[taskUUID(parentId),randomUUID(),f.user,randomUUID(),payloadHash]);
 const quarantined=await f.req('POST',`/api/ai-collab/tasks/${requestId}/authorize`,approval);assert.equal(quarantined.statusCode,409,quarantined.body);assert.equal(quarantined.json().error,'TASK_QUARANTINED');
 assert.equal((await f.req('GET',`/api/ai-collab/tasks/${requestId}`)).json().state,'waiting_for_session_authorization');
 await admin.query('DELETE FROM ai_collab_task_quarantine WHERE task_id=$1',[taskUUID(parentId)]);
 const privateTask=JSON.parse(unseal(parentRow.payload,`${f.tenant}:${f.user}:ai-collab:${taskUUID(parentId)}`));assert.ok(privateTask.combined?.id);
 const target=resolve(process.env.DATA_DIR!,privateTask.combined.id),oldBytes=await readFile(target);assert.ok(oldBytes.length>0);await writeFile(target,Buffer.from('synthetic changed encrypted object'));
 const corrupted=await f.req('POST',`/api/ai-collab/tasks/${requestId}/authorize`,approval);assert.ok(corrupted.statusCode>=400,corrupted.body);
 assert.equal((await f.req('GET',`/api/ai-collab/tasks/${requestId}`)).json().state,'waiting_for_session_authorization');
 assert.equal((await admin.query('SELECT revision FROM ai_collab_tasks WHERE id=$1',[taskUUID(parentId)])).rows[0].revision,parentRow.revision);
 for(const childId of childIds)assert.notEqual((await f.req('GET',`/api/ai-collab/tasks/${childId}`)).json().caller.sessionId,request.caller.sessionId);
});
