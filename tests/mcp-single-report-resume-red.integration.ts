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
import {hash,passwordHash,unseal} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';

const db=new URL(process.env.DATABASE_URL??''),migration=new URL(process.env.MIGRATION_DATABASE_URL??'');
assert.match(decodeURIComponent(db.pathname),/^\/tmw_test_[a-z0-9_]+$/);
assert.equal(db.pathname,migration.pathname);
assert.ok(resolve(process.env.DATA_DIR??'').startsWith(resolve('.data/test-runs')+sep));

test('default automatic single valid ai_process report resumes without permitting a pre-restore next round', {timeout:240_000}, async()=>{
 const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
 let app:Awaited<ReturnType<typeof buildApp>>|undefined;
 try{
  app=await buildApp();if(!app.hasRoute({method:'POST',url:'/api/mcp'}))registerMcpRoutes(app,applyDocumentConfiguration);
  const tenant=randomUUID(),uid=randomUUID(),username='single-resume-'+randomUUID(),password='synthetic-single-resume',origin=process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
  const login=await app.inject({method:'POST',url:'/api/login',remoteAddress:'198.18.59.1',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
  const cookie=String(login.headers['set-cookie']).split(';')[0];let nextRequestAt=0;
  const req=async(method:string,url:string,payload?:unknown,extra?:Record<string,string>)=>{
   const delay=nextRequestAt-Date.now();nextRequestAt=Math.max(nextRequestAt,Date.now())+550;if(delay>0)await new Promise(r=>setTimeout(r,delay));
   const response=await app!.inject({method,url,remoteAddress:'198.18.59.1',headers:{origin,cookie,...extra},payload} as never);
   return response as unknown as {statusCode:number;body:string;headers:Record<string,string|string[]|undefined>;json():any;rawPayload:Buffer};
  };
  let seq=0;
  async function client(){const init=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++seq,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'automatic-report-red',version:'1'}}});assert.equal(init.statusCode,200,init.body);const headers={'mcp-session-id':String(init.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};assert.equal((await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers)).statusCode,202);return {call:async(name:string,args:Record<string,unknown>={})=>{const response=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++seq,method:'tools/call',params:{name,arguments:args}},headers);assert.equal(response.statusCode,200,response.body);return response.json().result.structuredContent;},close:()=>req('DELETE','/api/mcp',undefined,headers)};}
  const task=async(job:string)=>(await req('GET',`/api/ai-collab/tasks/${job}`)).json();
  const privateTask=async(job:string)=>{const uuid=taskUUID(job),row=(await admin.query('SELECT payload FROM ai_collab_tasks WHERE id=$1',[uuid])).rows[0];assert.ok(row);return JSON.parse(unseal(row.payload,`${tenant}:${uid}:ai-collab:${uuid}`));};
  const projectResponse=await req('POST','/api/projects',{name:'单文件自动报告接续反例'});assert.equal(projectResponse.statusCode,200,projectResponse.body);const project=projectResponse.json().id;
  const sourceResponse=await req('POST',`/api/projects/${project}/documents`,{text:'联系邮箱：resume059@example.com；手机号：13800138000',requestId:randomUUID()});assert.equal(sourceResponse.statusCode,200,sourceResponse.body);const doc=sourceResponse.json().id;
  for(let i=0;i<20;i++){const rows=(await admin.query("SELECT status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NULL ORDER BY created_at DESC LIMIT 1",[doc])).rows;if(rows[0]?.status==='succeeded')break;assert.notEqual(rows[0]?.status,'failed');await tick();if(i===19)throw new Error('INITIAL_DETECTION_NOT_COMPLETE');}
  const aliases=(await req('GET',`/api/projects/${project}/unified-aliases`)).json();const enabled=await req('POST',`/api/projects/${project}/unified-aliases`,{revision:aliases.revision,documents:aliases.documents,command:{action:'enable'}});assert.equal(enabled.statusCode,200,enabled.body);
  let first=await client();const started=await first.call('start_lawbot_redaction',{project_id:project,document_ids:[doc],masking_mode:'pseudonym',task_mode:'ai_process',output_formats:['original','md'],request_id:randomUUID()});assert.ok(started.jobId,JSON.stringify(started));assert.equal(started.executionMode,'automatic');const job=started.jobId;
  const consent={allowRedactionPath:true,allowRestorePath:true,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};
  let t=await task(job),authorized=await req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:t.revision,authorization:consent});assert.equal(authorized.statusCode,200,authorized.body);
  await tick();let progress=await first.call('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.error,undefined,JSON.stringify(progress));assert.equal(progress.status,'building_sanitized_artifact');
  await tick();progress=await first.call('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.error,undefined,JSON.stringify(progress));assert.equal(progress.status,'sanitized_artifact_ready');
  const ready=await task(job);assert.equal(ready.executionMode,'automatic');assert.ok(ready.reviewResolutions?.some((x:any)=>x.decisionOrigin==='automatic'));assert.ok((await privateTask(job)).mappingReferences?.length>0,'real automatic export must bind restorable pseudonym references');
  const delivery=await first.call('receive_sanitized_document',{job_id:job,output_format:'md',result_kind:'derived_report'});assert.ok(delivery.slotId,JSON.stringify(delivery));const sanitized=Buffer.from(delivery.bytesBase64,'base64');assert.equal(hash(sanitized),delivery.sha256);assert.equal(sanitized.toString().includes('resume059@example.com'),false);
  const returned=Buffer.from(sanitized.toString()+'\n已完成报告审阅。');const upload=await req('PUT',`/api/ai-collab/tasks/${job}/slots/${delivery.slotId}`,{bytesBase64:returned.toString('base64')});assert.equal(upload.statusCode,200,upload.body);
  const submitted=await first.call('submit_reviewed_document',{job_id:job,round_id:delivery.roundId,slot_id:delivery.slotId,sha256:hash(returned),suggested_name:'合成报告.md'});assert.equal(submitted.validation.valid,true,JSON.stringify(submitted));assert.equal(submitted.status,'waiting_for_restore_approval');
  const early=await first.call('start_lawbot_restoration',{job_id:job,round_id:delivery.roundId});assert.equal(early.error,'RESULT_HUMAN_REVIEW_REQUIRED');
  t=await task(job);const review=await req('POST',`/api/ai-collab/tasks/${job}/review-result`,{revision:t.revision,roundId:delivery.roundId,approved:true});assert.equal(review.statusCode,200,review.body);assert.equal(review.json().state,'round_completed');const reportStatus=await first.call('check_restore_completion',{job_id:job,round_id:delivery.roundId,wait_seconds:0});assert.equal(reportStatus.status,'completed','external report-only state follows original completed semantics');
  const before=await task(job),round=before.rounds.at(-1);assert.equal(round.roundId,delivery.roundId);assert.equal(round.validated,true);assert.equal(round.reviewed,true);assert.equal(round.restoredArtifactId,undefined);assert.ok((await privateTask(job)).mappingReferences?.length>0);
  const beforeArchive=await req('GET',`/api/ai-collab/tasks/${job}/archives/${delivery.roundId}/download`);assert.equal(beforeArchive.statusCode,200,beforeArchive.body);assert.equal(hash(beforeArchive.rawPayload),hash(returned));
  assert.equal((await first.close()).statusCode,200);
  const implicit=await client(),implicitlySelected=await implicit.call('resume_lawbot_task',{});assert.equal(implicitlySelected.resumeRequested,true,JSON.stringify(implicitlySelected));assert.equal(implicitlySelected.jobId,job);t=await task(job);assert.equal(t.resumeState,'round_completed');
  authorized=await req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:t.revision,authorization:consent});assert.equal(authorized.statusCode,200,authorized.body);assert.equal(authorized.json().state,'round_completed');assert.equal(authorized.json().rounds.at(-1).roundId,delivery.roundId);assert.equal((await implicit.call('check_restore_completion',{job_id:job,round_id:delivery.roundId,wait_seconds:0})).status,'completed');
  assert.equal((await implicit.close()).statusCode,200);
  const explicit=await client(),explicitlySelected=await explicit.call('resume_lawbot_task',{job_id:job});assert.equal(explicitlySelected.resumeRequested,true,JSON.stringify(explicitlySelected));assert.equal(explicitlySelected.jobId,job);t=await task(job);assert.equal(t.resumeState,'round_completed');
  authorized=await req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:t.revision,authorization:{...consent,allowRestorePath:true}});assert.equal(authorized.statusCode,200,authorized.body);assert.equal(authorized.json().state,'round_completed');assert.equal(authorized.json().rounds.at(-1).roundId,delivery.roundId);assert.equal((await explicit.call('check_restore_completion',{job_id:job,round_id:delivery.roundId,wait_seconds:0})).status,'completed');
  t=await task(job);const restoreApproval=await req('POST',`/api/ai-collab/tasks/${job}/authorize-restoration`,{revision:t.revision,allowRestorePath:true});assert.equal(restoreApproval.statusCode,200,restoreApproval.body);
  const beforeContinue=await task(job);assert.equal(beforeContinue.rounds.at(-1).restoredArtifactId,undefined);assert.equal(beforeContinue.rounds.at(-1).roundId,delivery.roundId);
  if(process.env.RESTORE_CONTROL==='1'){const actual=await explicit.call('start_lawbot_restoration',{job_id:job,round_id:delivery.roundId});assert.equal(actual.status,'round_completed',JSON.stringify(actual));const after=await task(job);assert.ok(after.rounds.at(-1).restoredArtifactId);assert.equal(after.rounds.at(-1).roundId,delivery.roundId);const postRestoreContinue=await explicit.call('continue_current_document_review',{job_id:job});assert.equal(postRestoreContinue.status,'sanitized_artifact_ready',JSON.stringify(postRestoreContinue));const next=await explicit.call('receive_sanitized_document',{job_id:job,output_format:'md',result_kind:'derived_report'});assert.notEqual(next.roundId,delivery.roundId);console.log('SINGLE_REPORT_RESTORE_CONTROL '+JSON.stringify({mode:after.executionMode,roundId:delivery.roundId,status:actual.status,restoredArtifactId:after.rounds.at(-1).restoredArtifactId}));return;}
  const continued=await explicit.call('continue_current_document_review',{job_id:job});
  let nextRoundId:string|undefined,oldRestoreError:string|undefined,archiveHashAfter:string|undefined;
  if(!continued.error){const next=await explicit.call('receive_sanitized_document',{job_id:job,output_format:'md',result_kind:'derived_report'});nextRoundId=next.roundId;const oldRestore=await explicit.call('start_lawbot_restoration',{job_id:job,round_id:delivery.roundId});oldRestoreError=oldRestore.error;const archive=await req('GET',`/api/ai-collab/tasks/${job}/archives/${delivery.roundId}/download`);assert.equal(archive.statusCode,200,archive.body);archiveHashAfter=hash(archive.rawPayload);}
  console.log('SINGLE_REPORT_RESUME_OBSERVATION '+JSON.stringify({mode:before.executionMode,validatedRound:delivery.roundId,mappingReferenceCount:(await privateTask(job)).mappingReferences.length,implicitSelected:implicitlySelected.jobId,explicitSelected:explicitlySelected.jobId,approvedState:(await task(job)).state,continueResult:continued.error??continued.status,nextRoundId,oldRestoreError,archiveHashAfter}));
  assert.equal(continued.error,'INVALID_STATE','original main.js:23785 rejects a completed ai_process report before restoration');
 }finally{await app?.close();await pool.end();await admin.end();}
});
