import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';
import {readZip} from '../packages/core/office-zip.ts';

const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
const app=await buildApp();
const origin=process.env.APP_ORIGIN!;
const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};
after(async()=>{await app.close();await pool.end();await admin.end();});

async function fixture(){
 const uid=randomUUID(),tenant=randomUUID(),username='original-actions-'+uid,password='synthetic-action-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:string,url:string,payload?:unknown)=>app.inject({method:method as any,url,headers:{origin,cookie},payload:payload as any});
 const init=await req('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'dsh',version:'1'}}});
 assert.equal(init.statusCode,200,init.body);
 const headers={origin,cookie,'mcp-session-id':String(init.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
 assert.equal((await app.inject({method:'POST',url:'/api/mcp',headers,payload:{jsonrpc:'2.0',method:'notifications/initialized'}})).statusCode,202);
 const projectResponse=await req('POST','/api/projects',{name:'合成协议合同'});
 assert.equal(projectResponse.statusCode,200,projectResponse.body);
 const project=projectResponse.json().id as string;
 let sequence=1;
 async function start(documentIds?:string[],manual=false){
  const response=await app.inject({method:'POST',url:'/api/mcp',headers,payload:{jsonrpc:'2.0',id:++sequence,method:'tools/call',params:{name:manual?'start_lawbot_redaction_for_user_manual_review':'start_lawbot_redaction',arguments:{project_id:project,...documentIds?{document_ids:documentIds}:{},masking_mode:'pseudonym',output_formats:['original','md'],request_id:randomUUID()}}}});
  assert.equal(response.statusCode,200,response.body);
  const result=response.json().result;assert.equal(result.isError,false,JSON.stringify(result));
  return result.structuredContent.jobId as string;
 }
 async function task(job:string){const response=await req('GET',`/api/ai-collab/tasks/${job}`);assert.equal(response.statusCode,200,response.body);return response.json();}
 async function action(job:string,method:string,extra:Record<string,unknown>={}){const current=await task(job);return req('POST',`/api/ai-collab/tasks/${job}/action`,{revision:current.revision,method,...extra});}
 async function doc(text:string){const response=await req('POST',`/api/projects/${project}/documents`,{text,requestId:randomUUID()});assert.equal(response.statusCode,200,response.body);const id=response.json().id as string;await tick();return id;}
 async function authorize(job:string){const current=await task(job),response=await req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:current.revision,authorization:consent});assert.equal(response.statusCode,200,response.body);return response.json();}
 return {uid,tenant,project,req,start,task,action,doc,authorize};
}

test('source review intent requires verified delivery and preserves original finite fields and old goals input',async()=>{
 const f=await fixture(),job=await f.start();
 const before=await f.task(job),early=await f.action(job,'set-review-intent',{intent:{goals:['proofreading']}});
 assert.equal(early.statusCode,409,early.body);assert.equal(early.json().error,'INVALID_STATE');
 assert.equal((await f.task(job)).revision,before.revision);
 const documentId=await f.doc('邮箱：intent@example.com'),ready=await f.start([documentId],true);
 await f.authorize(ready);await tick();
 const d=(await f.req('GET',`/api/documents/${documentId}`)).json();assert.equal(d.job.status,'succeeded');
 const marks=d.marks.map((mark:any)=>({...mark,decision:'redact'}));
 const review=await f.req('PUT',`/api/documents/${documentId}/review`,{revision:d.revision,marks});assert.equal(review.statusCode,200,review.body);
 const queued=await f.action(ready,'prepare-export');assert.equal(queued.statusCode,200,queued.body);await tick();
 const released=await f.action(ready,'release-export');assert.equal(released.statusCode,200,released.body);assert.equal(released.json().state,'waiting_for_task_selection');
 const original={taskType:'contract_review',depth:'deep',outputModes:['redline','risk_report'],focusAreas:['付款'],customInstruction:'请核付款条款'};
 const intent=await f.action(ready,'set-review-intent',{intent:original});assert.equal(intent.statusCode,200,intent.body);
 assert.equal(intent.json().state,'sanitized_artifact_ready');assert.deepEqual(intent.json().intent,original);
});

test('source diagnostic stage outcome code and safe details reach existing owner scoped ZIP',async()=>{
 const f=await fixture(),job=await f.start();
 const response=await f.action(job,'diagnostic-event',{stage:'export',outcome:'fallback',code:'MARKDOWN_UNAVAILABLE',details:{visualFallback:true,sourcePath:'/private/sensitive'}});
 assert.equal(response.statusCode,200,response.body);
 const entries=(await admin.query('SELECT payload FROM ai_collab_diagnostic_events WHERE task_id=$1 ORDER BY id',[taskUUID(job)])).rows;
 assert.ok(entries.some(({payload}:any)=>payload.stage==='export'&&payload.outcome==='fallback'&&payload.code==='MARKDOWN_UNAVAILABLE'&&payload.details?.visualFallback===true));
 assert.ok(entries.every(({payload}:any)=>!JSON.stringify(payload).includes('/private/sensitive')));
 const failed=await f.action(job,'diagnostic-event',{stage:'export',outcome:'failed',code:'MARKDOWN_UNAVAILABLE'});assert.equal(failed.statusCode,200,failed.body);
 const zip=await f.req('GET',`/api/ai-collab/tasks/${job}/diagnostics`);assert.equal(zip.statusCode,200,zip.body);
 const files=await readZip(zip.rawPayload),history=files.get('协作过程.jsonl')!.toString();assert.match(history,/MARKDOWN_UNAVAILABLE/u);assert.match(history,/visualFallback/u);assert.doesNotMatch(history,/private\/sensitive/u);
 const other=await fixture();assert.equal((await other.req('GET',`/api/ai-collab/tasks/${job}/diagnostics`)).statusCode,404);
 const old=await f.action(job,'diagnostic-event',{event:'succeeded',failureCode:'SYNTHETIC_PROBE'});assert.equal(old.statusCode,200,old.body);assert.ok(old.json().eventLog.some((e:any)=>e.event==='diagnostic_succeeded'));
});

test('source per-document statistics and actual mode are bounded without trusting client review claims',async()=>{
 const f=await fixture(),documentId=await f.doc('邮箱：stats@example.com'),job=await f.start([documentId]);await f.authorize(job);await tick();
 const before=await f.task(job),wrong=await f.action(job,'report-statistics',{statistics:{entityCount:1,appliedExportMode:'full_star'}});assert.equal(wrong.statusCode,409,wrong.body);assert.equal((await f.task(job)).revision,before.revision);
 const payload={entityCount:3,lowConfidenceCount:9,unknownConfidenceCount:9,documentCount:1,humanReviewed:true,perDocument:[{safeDisplayName:'文档1.docx',entityCount:3,lowConfidenceCount:9,unknownConfidenceCount:9}],appliedExportMode:'default_pseudonym'};
 const response=await f.action(job,'report-statistics',{statistics:payload});assert.equal(response.statusCode,200,response.body);
 const stored=response.json().statistics;assert.equal(stored.entityCount,3);assert.equal(stored.lowConfidenceCount,3);assert.equal(stored.unknownConfidenceCount,0);assert.equal(stored.perDocument.length,1);assert.equal(stored.appliedExportMode,'default_pseudonym');
 assert.equal(stored.humanReviewed,false,'unreviewed source cannot be promoted by client flag');
 const old=await f.action(job,'report-statistics',{statistics:{entityCount:2}});assert.equal(old.statusCode,200,old.body);assert.equal(old.json().statistics.entityCount,2);
});

test('failed cloud source selection can revoke its unbound authorization with version and owner protection',async()=>{
 const f=await fixture(),job=await f.start(),authorized=await f.authorize(job);assert.equal(authorized.state,'waiting_for_user_file_selection');
 const failed=await f.req('POST',`/api/ai-collab/tasks/${job}/attach-sources`,{revision:authorized.revision,documentIds:[randomUUID()]});assert.equal(failed.statusCode,404,failed.body);
 const current=await f.task(job);assert.equal(current.revision,authorized.revision);assert.equal(current.sources.length,0);
 const rollback=await f.action(job,'retry-authorization');assert.equal(rollback.statusCode,200,rollback.body);
 const task=rollback.json();assert.equal(task.state,'waiting_for_session_authorization');assert.equal(task.authorization,undefined);assert.equal(task.sources.length,0);assert.equal(task.childJobIds,undefined);
 const stale=await f.req('POST',`/api/ai-collab/tasks/${job}/action`,{revision:authorized.revision,method:'retry-authorization'});assert.equal(stale.statusCode,409,stale.body);
});
