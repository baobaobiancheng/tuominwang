import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,unseal,hash} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL} from '../packages/core/mcp-tools.ts';

const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
const origin=process.env.APP_ORIGIN!;
let sessionNumber=0;
const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};

async function session(){
 const tenant=randomUUID(),user=randomUUID(),username='mcp-auto-'+randomUUID(),password='synthetic-automatic-password',remoteAddress=`198.18.0.${++sessionNumber}`;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',remoteAddress,headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,extra?:Record<string,string>)=>app.inject({method,url,remoteAddress,headers:{origin,cookie,...extra},payload});
 const initialized=await req('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'codex',version:'1'}}});assert.equal(initialized.statusCode,200,initialized.body);
 const headers={'mcp-session-id':String(initialized.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
 await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers);
 let seq=1;
 const tool=async(name:string,args:Record<string,unknown>)=>{const response=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++seq,method:'tools/call',params:{name,arguments:args}},headers);assert.equal(response.statusCode,200,response.body);return response.json().result;};
 const project=(await req('POST','/api/projects',{name:'automatic synthetic'})).json().id as string;
 const create=async(text:string)=>{const response=await req('POST',`/api/projects/${project}/documents`,{text,requestId:randomUUID()});assert.equal(response.statusCode,200,response.body);const doc=response.json().id as string;for(let attempt=0;attempt<20;attempt++){const rows=(await admin.query("SELECT status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NULL ORDER BY created_at DESC LIMIT 1",[doc])).rows;if(rows[0]?.status==='succeeded')return doc;assert.notEqual(rows[0]?.status,'failed');await tick();}throw new Error('INITIAL_DETECTION_NOT_COMPLETE');};
 const task=async(job:string)=>(await req('GET',`/api/ai-collab/tasks/${job}`)).json();
 const start=async(name:string,doc:string,advanced?:Record<string,unknown>)=>tool(name,{project_id:project,document_ids:[doc],masking_mode:'default_mask',task_mode:'redact_only',output_formats:['original','md'],request_id:randomUUID(),...advanced?{advanced}:{}});
 const authorize=async(job:string)=>{const t=await task(job),result=await req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:t.revision,authorization:consent});assert.equal(result.statusCode,200,result.body);};
 const gateway=(method:string,params:Record<string,unknown>)=>req('POST','/api/ai-collab/gateway',{method,params},headers);
 return{tenant,user,project,cookie,remoteAddress,req,tool,gateway,create,task,start,authorize};
}

test('public gateway start contract maps execution mode and per-file camel settings without allowing mode spoofing',async()=>{
 const f=await session(),doc=await f.create('合成联系 13800138000'),foreign=await f.create('合成联系 13900139000'),sourcePath=`document:${doc}`;
 const capabilities=await f.tool('get_lawbot_capabilities',{});assert.equal(capabilities.isError,false,JSON.stringify(capabilities));assert.deepEqual(capabilities.structuredContent.reviewModes,['automatic','human_review']);
 const fields={sourcePath,taskMode:'redact_only',outputFormats:['original','md'],fileSettings:[{sourcePath,documentType:'contract',maskingMode:'default_mask',outputFormats:['md']}]} as const;
 const automatic=await f.gateway('start_secure_review',{...fields,executionMode:'automatic'});assert.equal(automatic.statusCode,200,automatic.body);assert.equal(automatic.json().executionMode,'automatic');
 const manual=await f.gateway('start_secure_review',{...fields,executionMode:'human_review'});assert.equal(manual.statusCode,200,manual.body);assert.equal(manual.json().executionMode,'human_review');
 const invalid=await f.gateway('start_secure_review',{...fields,executionMode:'machine'});assert.equal(invalid.statusCode,400,invalid.body);
 const inappropriate=await f.gateway('get_review_status',{jobId:automatic.json().jobId,executionMode:'human_review'});assert.equal(inappropriate.statusCode,400,inappropriate.body);
 const unknownSetting=await f.gateway('start_secure_review',{...fields,fileSettings:[{sourcePath,maskingMode:'default_mask',unknownOverride:true}]});assert.equal(unknownSetting.statusCode,400,unknownSetting.body);
 const foreignSetting=await f.gateway('start_secure_review',{...fields,fileSettings:[{sourcePath:`document:${foreign}`,maskingMode:'default_mask'}]});assert.equal(foreignSetting.statusCode,400,foreignSetting.body);
});

test('ordinary MCP start automatically commits a machine review and delivers actual sanitized bytes through owned jobs',async()=>{
 const f=await session(),source='联系 13800138000',doc=await f.create(source);
 const started=await f.start('start_lawbot_redaction',doc);assert.equal(started.isError,false,JSON.stringify(started));const job=started.structuredContent.jobId as string;
 assert.equal(started.structuredContent.executionMode,'automatic');await f.authorize(job);await tick();
 let progress=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));
 assert.equal(progress.structuredContent.status,'building_sanitized_artifact');
 const prepared=await f.task(job);assert.equal(prepared.reviewResolutions?.[0]?.decisionOrigin,'automatic');
 const [snapshot]= (await admin.query('SELECT review_mode,automatic_task_id,automatic_source_revision FROM review_snapshots WHERE document_id=$1 AND revision=$2',[doc,prepared.sources[0].revision])).rows;
 assert.equal(snapshot.review_mode,'automatic');assert.equal(snapshot.automatic_task_id,job.slice(4).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5'));
 assert.equal(snapshot.automatic_source_revision,prepared.reviewResolutions[0].fromRevision);
 await tick();progress=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));assert.equal(progress.structuredContent.status,'sanitized_artifact_ready');
 const ready=await f.task(job);assert.equal(ready.deliveries.length>0,true);assert.equal(ready.reviewResolutions[0].decisionOrigin,'automatic');
 const direct=await f.req('POST',`/api/documents/${doc}/download-link`,{revision:ready.sources[0].revision,role:'markdown'});assert.equal(direct.statusCode,200,direct.body);
 const directBytes=await f.req('GET',direct.json().url);assert.equal(directBytes.statusCode,200,directBytes.body);assert.equal(directBytes.body.includes('13800138000'),false);
 const wrongSelector=await f.req('POST',`/api/documents/${doc}/download-link`,{revision:ready.sources[0].revision,role:'markdown',artifactId:randomUUID()});assert.equal(wrongSelector.statusCode,404,wrongSelector.body);assert.equal(wrongSelector.json().error,'NOT_FOUND');
 const wrongJob=await f.req('POST',`/api/documents/${doc}/download-link`,{revision:ready.sources[0].revision,role:'markdown',jobId:randomUUID()});assert.equal(wrongJob.statusCode,404,wrongJob.body);assert.equal(wrongJob.json().error,'NOT_FOUND');
 const ownerLink=await f.req('POST',`/api/documents/${doc}/download-link`,{revision:ready.sources[0].revision,role:'markdown',artifactId:ready.deliveries.find((x:any)=>x.role==='markdown')?.artifactId});assert.equal(ownerLink.statusCode,200,ownerLink.body);
 const ownerJobLink=await f.req('POST',`/api/documents/${doc}/download-link`,{revision:ready.sources[0].revision,role:'markdown',jobId:ready.exportJobIds[0]});assert.equal(ownerJobLink.statusCode,200,ownerJobLink.body);
 const memberName='automatic-export-member-'+randomUUID(),memberPassword='synthetic-export-password';
 const invited=await f.req('POST','/api/organization/members',{username:memberName,password:memberPassword});assert.equal(invited.statusCode,200,invited.body);
 const grant=await f.req('PUT',`/api/projects/${f.project}/members/${invited.json().id}`,{revision:null,permissions:['export']});assert.equal(grant.statusCode,200,grant.body);
 const memberLogin=await app.inject({method:'POST',url:'/api/login',remoteAddress:f.remoteAddress,headers:{origin},payload:{username:memberName,password:memberPassword}});assert.equal(memberLogin.statusCode,200,memberLogin.body);
 const memberCookie=String(memberLogin.headers['set-cookie']).split(';')[0],memberReq=(payload:any)=>app.inject({method:'POST',url:`/api/documents/${doc}/download-link`,remoteAddress:f.remoteAddress,headers:{origin,cookie:memberCookie},payload});
 const memberArtifact=await memberReq({revision:ready.sources[0].revision,role:'markdown',artifactId:ready.deliveries.find((x:any)=>x.role==='markdown')?.artifactId});assert.equal(memberArtifact.statusCode,404,memberArtifact.body);assert.equal(memberArtifact.json().error,'NOT_FOUND');
 const memberJob=await memberReq({revision:ready.sources[0].revision,role:'markdown',jobId:ready.exportJobIds[0]});assert.equal(memberJob.statusCode,404,memberJob.body);assert.equal(memberJob.json().error,'NOT_FOUND');
 const memberDirect=await memberReq({revision:ready.sources[0].revision,role:'markdown'});assert.equal(memberDirect.statusCode,200,memberDirect.body);
 const memberRestore=await app.inject({method:'POST',url:`/api/documents/${doc}/restore`,remoteAddress:f.remoteAddress,headers:{origin,cookie:memberCookie},payload:{revision:ready.sources[0].revision,text:'公开文本'}});assert.equal(memberRestore.statusCode,403,memberRestore.body);
 const replay=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(replay.isError,false,JSON.stringify(replay));assert.equal(replay.structuredContent.status,'sanitized_artifact_ready');
 assert.equal((await admin.query("SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND kind='export'",[doc])).rows[0].n,1,'poll replay must not create a second export job');
 const received=await f.tool('receive_sanitized_document',{job_id:job,output_format:'md'});assert.equal(received.isError,false,JSON.stringify(received));
 const text=Buffer.from(received.structuredContent.bytesBase64,'base64').toString('utf8');assert.equal(text.includes('13800138000'),false);assert.equal(text.length>0,true);
 const original=(await admin.query('SELECT content FROM documents WHERE id=$1',[doc])).rows[0];assert.ok(unseal(original.content,`${f.tenant}:${f.project}:${doc}`).includes('13800138000'));
 const jobs=(await admin.query("SELECT kind,status,collab_task_id FROM jobs WHERE document_id=$1 AND collab_task_id IS NOT NULL AND kind IN ('detect','export') ORDER BY created_at",[doc])).rows;
 assert.deepEqual(jobs.map(x=>[x.kind,x.status]),[['detect','succeeded'],['export','succeeded']]);
 assert.equal(jobs[0].collab_task_id,jobs[1].collab_task_id);
 const normalExport=await f.req('POST',`/api/documents/${doc}/export`,{revision:ready.sources[0].revision});assert.equal(normalExport.statusCode,200,normalExport.body);await tick();
 const normalLink=await f.req('POST',`/api/documents/${doc}/download-link`,{revision:ready.sources[0].revision,role:'markdown'});assert.equal(normalLink.statusCode,200,normalLink.body);
 const normalBytes=await f.req('GET',normalLink.json().url);assert.equal(normalBytes.statusCode,200,normalBytes.body);assert.equal(normalBytes.body.includes('13800138000'),false);
 const fakeActor=randomUUID();await admin.query('UPDATE review_snapshots SET automatic_actor_id=$3 WHERE document_id=$1 AND revision=$2',[doc,ready.sources[0].revision,fakeActor]);
 const forgedActor=await f.req('POST',`/api/documents/${doc}/download-link`,{revision:ready.sources[0].revision,role:'markdown'});assert.equal(forgedActor.statusCode,409,forgedActor.body);
 await admin.query('UPDATE review_snapshots SET automatic_actor_id=$3 WHERE document_id=$1 AND revision=$2',[doc,ready.sources[0].revision,f.user]);
 const another=await f.req('POST',`/api/projects/${f.project}/documents`,{text:'另一合成材料 13900139000',requestId:randomUUID()});assert.equal(another.statusCode,200,another.body);const otherDoc=another.json().id as string;
 const otherTask=await f.start('start_lawbot_redaction',otherDoc);assert.equal(otherTask.isError,false,JSON.stringify(otherTask));const otherId=otherTask.structuredContent.jobId as string,otherUUID=otherId.slice(4).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');assert.notEqual(otherId,job);
 await admin.query('UPDATE review_snapshots SET automatic_task_id=$3 WHERE document_id=$1 AND revision=$2',[doc,ready.sources[0].revision,otherUUID]);
 const forgedTask=await f.req('POST',`/api/documents/${doc}/download-link`,{revision:ready.sources[0].revision,role:'markdown'});assert.equal(forgedTask.statusCode,409,forgedTask.body);
 await admin.query('UPDATE review_snapshots SET automatic_task_id=$3 WHERE document_id=$1 AND revision=$2',[doc,ready.sources[0].revision,jobs[0].collab_task_id]);
 const view=(await f.req('GET',`/api/documents/${doc}`)).json(),spoofedReview=await f.req('PUT',`/api/documents/${doc}/review`,{revision:view.revision,marks:view.marks,reviewMode:'automatic'});assert.equal(spoofedReview.statusCode,200,spoofedReview.body);
 const origins=(await admin.query('SELECT revision,review_mode,automatic_task_id FROM review_snapshots WHERE document_id=$1 AND revision IN($2,$3) ORDER BY revision',[doc,ready.sources[0].revision,spoofedReview.json().revision])).rows;assert.equal(origins[0].review_mode,'automatic');assert.equal(origins[0].automatic_task_id,jobs[0].collab_task_id);assert.equal(origins[1].review_mode,'human_review');assert.equal(origins[1].automatic_task_id,null);
 const audit=(await admin.query('SELECT event FROM audit WHERE object_id=$1 ORDER BY id DESC LIMIT 1',[doc])).rows[0];assert.equal(audit.event,'review_saved');
});

test('automatic pseudonym output remains restorable through the ordinary document API',async()=>{
 const f=await session(),doc=await f.create('联系 13800138000');
 const started=await f.tool('start_lawbot_redaction',{project_id:f.project,document_ids:[doc],masking_mode:'pseudonym',task_mode:'redact_only',output_formats:['original','md'],request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));
 const job=started.structuredContent.jobId as string;await f.authorize(job);await tick();let status=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(status.isError,false,JSON.stringify(status));await tick();status=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(status.structuredContent.status,'sanitized_artifact_ready',JSON.stringify(status));
 const delivered=await f.tool('receive_sanitized_document',{job_id:job,output_format:'md'});assert.equal(delivered.isError,false,JSON.stringify(delivered));
 const text=Buffer.from(delivered.structuredContent.bytesBase64,'base64').toString('utf8');assert.equal(text.includes('13800138000'),false);assert.match(text,/【[^】]+】/u);
 const task=await f.task(job),primary=task.deliveries.find((x:any)=>x.role==='primary');assert.ok(primary);
 const link=await f.req('POST',`/api/documents/${doc}/download-link`,{revision:task.sources[0].revision,role:'primary',artifactId:primary.artifactId});assert.equal(link.statusCode,200,link.body);
 const canonical=(await f.req('GET',link.json().url)).body;assert.match(canonical,/【敏感项_\d+】/u);
 const restored=await f.req('POST',`/api/documents/${doc}/restore`,{revision:task.sources[0].revision,text:canonical});assert.equal(restored.statusCode,200,JSON.stringify({body:restored.body,text:canonical}));assert.ok(restored.json().text.includes('13800138000'));
});

test('automatic MCP AI review accepts real Markdown, requires separate human result approval, and restores aliases',async()=>{
 const f=await session(),doc=await f.create('联系 13800138000');
 const started=await f.tool('start_lawbot_redaction',{project_id:f.project,document_ids:[doc],masking_mode:'pseudonym',task_mode:'ai_process_restore',output_formats:['original','md'],request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));const job=started.structuredContent.jobId as string;
 const pending=await f.task(job),authorization=await f.req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:pending.revision,authorization:{...consent,allowRestorePath:true}});assert.equal(authorization.statusCode,200,authorization.body);
 await tick();let status=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(status.structuredContent.status,'building_sanitized_artifact',JSON.stringify(status));await tick();status=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(status.structuredContent.status,'sanitized_artifact_ready',JSON.stringify(status));
 const received=await f.tool('receive_sanitized_document',{job_id:job,output_format:'md'});assert.equal(received.isError,false,JSON.stringify(received));const delivery=received.structuredContent,bytes=Buffer.from(delivery.bytesBase64,'base64');assert.equal(bytes.toString().includes('13800138000'),false);
 const submitted=await f.tool('submit_reviewed_document',{job_id:job,round_id:delivery.roundId,slot_id:delivery.slotId,sha256:hash(bytes),suggested_name:'synthetic-reviewed.md',bytes_base64:bytes.toString('base64')});assert.equal(submitted.isError,false,JSON.stringify(submitted));assert.equal(submitted.structuredContent.validation.valid,true);
 const early=await f.tool('open_lawbot_restore',{job_id:job,round_id:delivery.roundId});assert.equal(early.structuredContent.error,'RESULT_HUMAN_REVIEW_REQUIRED');
 const task=await f.task(job),approved=await f.req('POST',`/api/ai-collab/tasks/${job}/review-result`,{revision:task.revision,roundId:delivery.roundId,approved:true});assert.equal(approved.statusCode,200,approved.body);
 const restored=await f.tool('open_lawbot_restore',{job_id:job,round_id:delivery.roundId});assert.equal(restored.isError,false,JSON.stringify(restored));assert.equal(restored.structuredContent.status,'round_completed');
 const done=await f.task(job),restoredId=done.rounds.at(-1)?.restoredArtifactId;assert.ok(restoredId);const downloaded=await f.req('GET',`/api/projects/${f.project}/restoration/files/${restoredId}`);assert.equal(downloaded.statusCode,200,downloaded.body);assert.ok(downloaded.body.includes('13800138000'));
});

test('manual entry waits for actual person and automatic entry rejects explicit retained Word content',async()=>{
 const f=await session(),doc=await f.create('联系 13800138000');
 const blocked=await f.start('start_lawbot_redaction',doc,{removeHeaderFooter:false});assert.equal(blocked.structuredContent.error,'MANUAL_REVIEW_REQUIRED');
 const keep=await f.start('start_lawbot_redaction',doc,{commentHandlingMode:'keep'});assert.equal(keep.structuredContent.error,'MANUAL_REVIEW_REQUIRED');
 const manual=await f.start('start_lawbot_redaction_for_user_manual_review',doc);assert.equal(manual.isError,false,JSON.stringify(manual));const job=manual.structuredContent.jobId;
 assert.equal(manual.structuredContent.executionMode,'human_review');await f.authorize(job);await tick();
 const status=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(status.isError,false,JSON.stringify(status));assert.equal(status.structuredContent.status,'waiting_for_human_review');
 assert.equal((await admin.query("SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND kind='export'",[doc])).rows[0].n,0);
});

test('automatic task preserves a new actual human intervention snapshot after its own detect job',async()=>{
 const f=await session(),doc=await f.create('联系 13800138000');const started=await f.start('start_lawbot_redaction',doc);assert.equal(started.isError,false,JSON.stringify(started));const job=started.structuredContent.jobId;
 await f.authorize(job);await tick();const d=(await f.req('GET',`/api/documents/${doc}`)).json();assert.equal(d.state,'review');
 const reviewed=await f.req('PUT',`/api/documents/${doc}/review`,{revision:d.revision,marks:d.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(reviewed.statusCode,200,reviewed.body);
 const status=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(status.isError,false,JSON.stringify(status));assert.equal(status.structuredContent.status,'building_sanitized_artifact');
 const task=await f.task(job);assert.equal(task.reviewResolutions[0].decisionOrigin,'human_review');assert.equal(task.sources[0].revision,reviewed.json().revision);
 const snaps=(await admin.query('SELECT revision,review_mode FROM review_snapshots WHERE document_id=$1 ORDER BY revision',[doc])).rows;
 assert.equal(snaps.at(-1).review_mode,'human_review');assert.equal(snaps.filter(s=>s.review_mode==='automatic').length,0);
});

test('automatic delivery refreshes to a later real human snapshot and queues a new export',async()=>{
 const f=await session(),doc=await f.create('联系 13800138000'),started=await f.start('start_lawbot_redaction',doc);assert.equal(started.isError,false,JSON.stringify(started));const job=started.structuredContent.jobId as string;
 await f.authorize(job);await tick();let progress=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.structuredContent.status,'building_sanitized_artifact');
 const machine=(await f.req('GET',`/api/documents/${doc}`)).json();const human=await f.req('PUT',`/api/documents/${doc}/review`,{revision:machine.revision,marks:machine.marks});assert.equal(human.statusCode,200,human.body);
 await tick();progress=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));assert.equal(progress.structuredContent.status,'waiting_for_human_review');
 progress=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));assert.equal(progress.structuredContent.status,'building_sanitized_artifact');
 await tick();progress=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));assert.equal(progress.structuredContent.status,'sanitized_artifact_ready');
 const done=await f.task(job);assert.equal(done.sources[0].revision,human.json().revision);assert.equal(done.deliveries[0].revision,human.json().revision);assert.equal(done.reviewResolutions.at(-1).decisionOrigin,'human_review');
 assert.equal((await admin.query("SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND collab_task_id IS NOT NULL AND kind='export'",[doc])).rows[0].n,2);
});

test('cancelled automatic tasks never resume review or export on later polls',async()=>{
 const f=await session(),doc=await f.create('联系 13800138000'),started=await f.start('start_lawbot_redaction',doc);assert.equal(started.isError,false,JSON.stringify(started));const job=started.structuredContent.jobId as string;
 await f.authorize(job);const before=await f.task(job),cancelled=await f.req('POST',`/api/ai-collab/tasks/${job}/action`,{revision:before.revision,method:'cancel'});assert.equal(cancelled.statusCode,200,cancelled.body);
 await tick();const status=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(status.structuredContent.status,'cancelled_by_user');
 assert.equal((await admin.query("SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND collab_task_id IS NOT NULL AND kind='export'",[doc])).rows[0].n,0);
});

test('revoked project export permission prevents automatic review and delivery',async()=>{
 const owner=await session(),doc=await owner.create('联系 13800138000'),username='automatic-revoked-'+randomUUID(),password='synthetic-revoked-password';
 const invited=await owner.req('POST','/api/organization/members',{username,password});assert.equal(invited.statusCode,200,invited.body);
 const memberId=invited.json().id,grant=await owner.req('PUT',`/api/projects/${owner.project}/members/${memberId}`,{revision:null,permissions:['view_original','review','export']});assert.equal(grant.statusCode,200,grant.body);
 const login=await app.inject({method:'POST',url:'/api/login',remoteAddress:owner.remoteAddress,headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0],request=(method:any,url:string,payload?:any,extra?:Record<string,string>)=>app.inject({method,url,remoteAddress:owner.remoteAddress,headers:{origin,cookie,...extra},payload});
 const init=await request('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'codex',version:'1'}}});assert.equal(init.statusCode,200,init.body);
 const headers={'mcp-session-id':String(init.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};await request('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers);
 const start=await request('POST','/api/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'start_lawbot_redaction',arguments:{project_id:owner.project,document_ids:[doc],task_mode:'redact_only',masking_mode:'default_mask',output_formats:['original','md']}}},headers);assert.equal(start.statusCode,200,start.body);
 const job=start.json().result.structuredContent.jobId as string;assert.ok(job);const task=(await request('GET',`/api/ai-collab/tasks/${job}`)).json();
 const authorized=await request('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:task.revision,authorization:consent});assert.equal(authorized.statusCode,200,authorized.body);
 for(let attempt=0;attempt<20;attempt++){const j=(await admin.query("SELECT status FROM jobs WHERE document_id=$1 AND collab_task_id IS NOT NULL AND kind='detect' ORDER BY created_at DESC LIMIT 1",[doc])).rows[0];if(j?.status==='succeeded')break;assert.notEqual(j?.status,'failed');await tick();}
 const revoked=await owner.req('PUT',`/api/projects/${owner.project}/members/${memberId}`,{revision:grant.json().revision,permissions:['view_original','review']});assert.equal(revoked.statusCode,200,revoked.body);
 const poll=await request('POST','/api/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'check_document_delivery',arguments:{job_id:job,wait_seconds:0}}},headers);assert.equal(poll.statusCode,200,poll.body);assert.equal(poll.json().result.isError,true);
 assert.equal((await admin.query("SELECT count(*)::int n FROM review_snapshots WHERE document_id=$1 AND review_mode='automatic'",[doc])).rows[0].n,0);
 assert.equal((await admin.query("SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND collab_task_id IS NOT NULL AND kind='export'",[doc])).rows[0].n,0);
});

test('immediate authorization while initial upload detection is active persists consent and resumes without a second click',async()=>{
 const f=await session(),created=await f.req('POST',`/api/projects/${f.project}/documents`,{text:'联系 13800138000',requestId:randomUUID()});assert.equal(created.statusCode,200,created.body);const doc=created.json().id as string;
 const started=await f.start('start_lawbot_redaction',doc);assert.equal(started.isError,false,JSON.stringify(started));const job=started.structuredContent.jobId as string;
 const pending=await f.task(job),authorized=await f.req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:pending.revision,authorization:consent});assert.equal(authorized.statusCode,200,authorized.body);assert.equal(authorized.json().pendingInitialDetection,true);
 let progress=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));assert.equal(progress.structuredContent.awaitingInitialDetection,true);
 for(let attempt=0;attempt<20;attempt++){await tick();progress=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));if(progress.structuredContent.status==='building_sanitized_artifact'||progress.structuredContent.status==='sanitized_artifact_ready')break;}
 assert.ok(['building_sanitized_artifact','sanitized_artifact_ready'].includes(progress.structuredContent.status),JSON.stringify(progress));assert.equal(progress.structuredContent.awaitingInitialDetection,false);
 if(progress.structuredContent.status==='building_sanitized_artifact'){await tick();progress=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));}assert.equal(progress.structuredContent.status,'sanitized_artifact_ready',JSON.stringify(progress));
 const manualCreated=await f.req('POST',`/api/projects/${f.project}/documents`,{text:'联系 13900139000',requestId:randomUUID()});assert.equal(manualCreated.statusCode,200,manualCreated.body);const manualDoc=manualCreated.json().id as string;
 const manualStarted=await f.start('start_lawbot_redaction_for_user_manual_review',manualDoc);assert.equal(manualStarted.isError,false,JSON.stringify(manualStarted));const manualJob=manualStarted.structuredContent.jobId as string;
 const manualPending=await f.task(manualJob),manualAuth=await f.req('POST',`/api/ai-collab/tasks/${manualJob}/authorize`,{revision:manualPending.revision,authorization:consent});assert.equal(manualAuth.statusCode,200,manualAuth.body);assert.equal(manualAuth.json().pendingInitialDetection,true);
 for(let attempt=0;attempt<20;attempt++){await tick();progress=await f.tool('check_document_delivery',{job_id:manualJob,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));if(progress.structuredContent.awaitingInitialDetection===false)break;}
 assert.equal(progress.structuredContent.awaitingInitialDetection,false);assert.equal(progress.structuredContent.status,'waiting_for_human_review');assert.equal((await admin.query("SELECT count(*)::int n FROM review_snapshots WHERE document_id=$1 AND review_mode='automatic'",[manualDoc])).rows[0].n,0);
 const selectedCreated=await f.req('POST',`/api/projects/${f.project}/documents`,{text:'联系 13700137000',requestId:randomUUID()});assert.equal(selectedCreated.statusCode,200,selectedCreated.body);const selectedDoc=selectedCreated.json().id as string;
 const empty=await f.tool('start_lawbot_redaction',{project_id:f.project,task_mode:'redact_only',masking_mode:'default_mask',output_formats:['original','md'],request_id:randomUUID()});assert.equal(empty.isError,false,JSON.stringify(empty));const emptyJob=empty.structuredContent.jobId as string;
 await f.authorize(emptyJob);const choosing=await f.task(emptyJob);assert.equal(choosing.state,'waiting_for_user_file_selection');
 const attached=await f.req('POST',`/api/ai-collab/tasks/${emptyJob}/attach-sources`,{revision:choosing.revision,documentIds:[selectedDoc]});assert.equal(attached.statusCode,200,attached.body);assert.equal(attached.json().pendingInitialDetection,true);assert.equal(attached.json().state,'waiting_for_human_review');
 progress=await f.tool('check_document_delivery',{job_id:emptyJob,wait_seconds:0});assert.equal(progress.structuredContent.awaitingInitialDetection,true);
 for(let attempt=0;attempt<20;attempt++){await tick();progress=await f.tool('check_document_delivery',{job_id:emptyJob,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));if(progress.structuredContent.status==='building_sanitized_artifact'||progress.structuredContent.status==='sanitized_artifact_ready')break;}
 assert.ok(['building_sanitized_artifact','sanitized_artifact_ready'].includes(progress.structuredContent.status),JSON.stringify(progress));assert.equal(progress.structuredContent.awaitingInitialDetection,false);
 if(progress.structuredContent.status==='building_sanitized_artifact'){await tick();progress=await f.tool('check_document_delivery',{job_id:emptyJob,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));}assert.equal(progress.structuredContent.status,'sanitized_artifact_ready',JSON.stringify(progress));
 const selectedManualCreated=await f.req('POST',`/api/projects/${f.project}/documents`,{text:'联系 13600136000',requestId:randomUUID()});assert.equal(selectedManualCreated.statusCode,200,selectedManualCreated.body);const selectedManualDoc=selectedManualCreated.json().id as string;
 const emptyManual=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,task_mode:'redact_only',masking_mode:'default_mask',output_formats:['original','md'],request_id:randomUUID()});assert.equal(emptyManual.isError,false,JSON.stringify(emptyManual));const emptyManualJob=emptyManual.structuredContent.jobId as string;
 await f.authorize(emptyManualJob);const manualChoosing=await f.task(emptyManualJob);assert.equal(manualChoosing.state,'waiting_for_user_file_selection');
 const manualAttached=await f.req('POST',`/api/ai-collab/tasks/${emptyManualJob}/attach-sources`,{revision:manualChoosing.revision,documentIds:[selectedManualDoc]});assert.equal(manualAttached.statusCode,200,manualAttached.body);assert.equal(manualAttached.json().pendingInitialDetection,true);
 for(let attempt=0;attempt<20;attempt++){await tick();progress=await f.tool('check_document_delivery',{job_id:emptyManualJob,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));if(progress.structuredContent.awaitingInitialDetection===false)break;}
 assert.equal(progress.structuredContent.awaitingInitialDetection,false);assert.equal(progress.structuredContent.status,'waiting_for_human_review');assert.equal((await admin.query("SELECT count(*)::int n FROM review_snapshots WHERE document_id=$1 AND review_mode='automatic'",[selectedManualDoc])).rows[0].n,0);
});

test('HTTP-only manual refresh preserves existing human review while adding a pending source and concurrent reads queue once',async()=>{
 const f=await session(),oldDoc=await f.create('联系 13800138000'),started=await f.start('start_lawbot_redaction_for_user_manual_review',oldDoc);assert.equal(started.isError,false,JSON.stringify(started));const job=started.structuredContent.jobId as string;
 await f.authorize(job);let task=await f.task(job);
 for(let attempt=0;attempt<20&&task.taskDetectionStatus!=='succeeded';attempt++){await tick();task=await f.task(job);}
 assert.equal(task.taskDetectionStatus,'succeeded');assert.equal(task.awaitingTaskDetection,false);
 const prior=(await f.req('GET',`/api/documents/${oldDoc}`)).json(),reviewed=await f.req('PUT',`/api/documents/${oldDoc}/review`,{revision:prior.revision,marks:prior.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(reviewed.statusCode,200,reviewed.body);
 const saved=(await f.req('GET',`/api/documents/${oldDoc}`)).json(),oldJobs=(await admin.query("SELECT id,revision,status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NOT NULL ORDER BY created_at",[oldDoc])).rows;assert.equal((await admin.query('SELECT review_mode FROM review_snapshots WHERE document_id=$1 AND revision=$2',[oldDoc,saved.revision])).rows[0].review_mode,'human_review');
 const created=await f.req('POST',`/api/projects/${f.project}/documents`,{text:'联系 13900139000',requestId:randomUUID()});assert.equal(created.statusCode,200,created.body);const newDoc=created.json().id as string;
 task=await f.task(job);const attached=await f.req('POST',`/api/ai-collab/tasks/${job}/attach-sources`,{revision:task.revision,documentIds:[newDoc]});assert.equal(attached.statusCode,200,attached.body);assert.equal(attached.json().pendingInitialDetection,true);assert.equal(attached.json().pendingAttachedSourceIds?.length,1);
 for(let attempt=0;attempt<20;attempt++){await tick();const reads=await Promise.all([f.req('GET',`/api/ai-collab/tasks/${job}`),f.req('GET',`/api/ai-collab/tasks/${job}`)]);assert.ok(reads.every(r=>r.statusCode===200),reads.map(r=>r.body).join('\n'));task=reads[0]!.json();if(task.taskDetectionStatus==='succeeded')break;}
 assert.equal(task.taskDetectionStatus,'succeeded',JSON.stringify(task));assert.equal(task.awaitingTaskDetection,false);assert.equal(task.state,'waiting_for_human_review');
 const after=(await f.req('GET',`/api/documents/${oldDoc}`)).json(),afterJobs=(await admin.query("SELECT id,revision,status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NOT NULL ORDER BY created_at",[oldDoc])).rows;assert.equal(after.revision,saved.revision);assert.deepEqual(after.marks,saved.marks);assert.deepEqual(afterJobs,oldJobs);
 assert.equal((await admin.query('SELECT review_mode FROM review_snapshots WHERE document_id=$1 AND revision=$2',[oldDoc,saved.revision])).rows[0].review_mode,'human_review');
 const newJobs=(await admin.query("SELECT id,status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NOT NULL",[newDoc])).rows;assert.equal(newJobs.length,1);assert.equal(newJobs[0].status,'succeeded');
 const cancelledCreated=await f.req('POST',`/api/projects/${f.project}/documents`,{text:'联系 13700137000',requestId:randomUUID()});assert.equal(cancelledCreated.statusCode,200,cancelledCreated.body);const cancelledDoc=cancelledCreated.json().id as string;
 const cancelledStart=await f.start('start_lawbot_redaction_for_user_manual_review',cancelledDoc);assert.equal(cancelledStart.isError,false,JSON.stringify(cancelledStart));const cancelledJob=cancelledStart.structuredContent.jobId as string;await f.authorize(cancelledJob);const pending=await f.task(cancelledJob);assert.equal(pending.pendingInitialDetection,true);
 const cancel=await f.req('POST',`/api/ai-collab/tasks/${cancelledJob}/action`,{revision:pending.revision,method:'cancel'});assert.equal(cancel.statusCode,200,cancel.body);for(let attempt=0;attempt<5;attempt++){await tick();const read=await f.req('GET',`/api/ai-collab/tasks/${cancelledJob}`);assert.equal(read.statusCode,200,read.body);assert.equal(read.json().state,'cancelled_by_user');assert.equal(read.json().taskDetectionStatus,'not_started');assert.equal(read.json().awaitingTaskDetection,false);}
 const cancelledList=await f.req('GET','/api/ai-collab/tasks');assert.equal(cancelledList.statusCode,200,cancelledList.body);const cancelledItem=cancelledList.json().items.find((item:any)=>item.jobId===cancelledJob);assert.equal(cancelledItem?.state,'cancelled_by_user');assert.equal(cancelledItem?.taskDetectionStatus,'not_started');assert.equal(cancelledItem?.awaitingTaskDetection,false);
 assert.equal((await admin.query("SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NOT NULL",[cancelledDoc])).rows[0].n,0);
 const queuedDoc=await f.create('联系 13500135000'),queuedStart=await f.start('start_lawbot_redaction_for_user_manual_review',queuedDoc);assert.equal(queuedStart.isError,false,JSON.stringify(queuedStart));const queuedJob=queuedStart.structuredContent.jobId as string;await f.authorize(queuedJob);
 const queuedTask=await f.task(queuedJob);assert.equal(queuedTask.state,'waiting_for_human_review');assert.equal(queuedTask.taskDetectionStatus,'pending');assert.equal(queuedTask.awaitingTaskDetection,true);
 const ownedBefore=(await admin.query("SELECT id,status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NOT NULL",[queuedDoc])).rows;assert.equal(ownedBefore.length,1);assert.equal(ownedBefore[0].status,'queued');
 const queuedCancel=await f.req('POST',`/api/ai-collab/tasks/${queuedJob}/action`,{revision:queuedTask.revision,method:'cancel'});assert.equal(queuedCancel.statusCode,200,queuedCancel.body);
 for(let attempt=0;attempt<3;attempt++){await tick();const read=await f.req('GET',`/api/ai-collab/tasks/${queuedJob}`);assert.equal(read.statusCode,200,read.body);assert.equal(read.json().state,'cancelled_by_user');assert.equal(read.json().taskDetectionStatus,'not_started');assert.equal(read.json().awaitingTaskDetection,false);}
 const queuedList=await f.req('GET','/api/ai-collab/tasks');assert.equal(queuedList.statusCode,200,queuedList.body);const queuedItem=queuedList.json().items.find((item:any)=>item.jobId===queuedJob);assert.equal(queuedItem?.state,'cancelled_by_user');assert.equal(queuedItem?.taskDetectionStatus,'not_started');assert.equal(queuedItem?.awaitingTaskDetection,false);
 const ownedAfter=(await admin.query("SELECT id,status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NOT NULL",[queuedDoc])).rows;assert.deepEqual(ownedAfter,[{id:ownedBefore[0].id,status:'cancelled'}]);assert.equal((await admin.query("SELECT count(*)::int n FROM review_snapshots WHERE document_id=$1 AND review_mode='automatic'",[queuedDoc])).rows[0].n,0);
});

test('new API instance resumes an authorized automatic task and continues durable delivery',async()=>{
 const f=await session(),doc=await f.create('联系 13800138000'),started=await f.start('start_lawbot_redaction',doc);assert.equal(started.isError,false,JSON.stringify(started));const job=started.structuredContent.jobId as string;await f.authorize(job);await tick();
 const restarted=await buildApp();try{
  const request=(method:any,url:string,payload?:any,extra?:Record<string,string>)=>restarted.inject({method,url,payload,remoteAddress:f.remoteAddress,headers:{origin,cookie:f.cookie,...extra}});
  const initialized=await request('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'codex',version:'1'}}});assert.equal(initialized.statusCode,200,initialized.body);
  const headers={'mcp-session-id':String(initialized.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};await request('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers);
  const resumed=await request('POST','/api/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'resume_lawbot_task',arguments:{job_id:job}}},headers);assert.equal(resumed.statusCode,200,resumed.body);assert.equal(resumed.json().result.structuredContent.resumeRequested,true);
  const waiting=(await request('GET',`/api/ai-collab/tasks/${job}`)).json(),approved=await request('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:waiting.revision,authorization:consent});assert.equal(approved.statusCode,200,approved.body);
  let poll=await request('POST','/api/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'check_document_delivery',arguments:{job_id:job,wait_seconds:0}}},headers);assert.equal(poll.json().result.structuredContent.status,'building_sanitized_artifact',poll.body);
  await tick();poll=await request('POST','/api/mcp',{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'check_document_delivery',arguments:{job_id:job,wait_seconds:0}}},headers);assert.equal(poll.json().result.structuredContent.status,'sanitized_artifact_ready',poll.body);
 }finally{await restarted.close();}
});

test('three-source automatic batches deliver combined and individual outputs with one unified alias',async()=>{
 const f=await session();
 for(const batchMode of ['combined','individual'] as const){
  const docs=[] as string[];for(let index=0;index<3;index++)docs.push(await f.create(`第${index+1}份联系 13800138000`));
  const started=await f.tool('start_lawbot_redaction',{project_id:f.project,document_ids:docs,masking_mode:'pseudonym',task_mode:'redact_only',output_formats:['original','md'],unified_pseudonyms:true,batch_result_mode:batchMode,request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));const job=started.structuredContent.jobId as string;await f.authorize(job);
  let progress:any;for(let attempt=0;attempt<30;attempt++){progress=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(progress.isError,false,JSON.stringify(progress));if(progress.structuredContent.status==='sanitized_artifact_ready')break;await tick();}
  assert.equal(progress.structuredContent.status,'sanitized_artifact_ready',JSON.stringify(progress));const done=await f.task(job);assert.equal(done.sources.length,3);assert.equal(done.sources.every((x:any)=>done.reviewResolutions.some((r:any)=>r.documentId===x.documentId&&r.decisionOrigin==='automatic')),true);
  if(batchMode==='combined'){const artifactId=progress.structuredContent.sanitizedArtifact?.artifactId;assert.match(artifactId,/^lba_[a-f0-9]{32}$/);const received=await f.tool('receive_sanitized_document',{job_id:job,artifact_id:artifactId,output_format:'md'});assert.equal(received.isError,false,JSON.stringify(received));const text=Buffer.from(received.structuredContent.bytesBase64,'base64').toString('utf8');assert.equal(text.includes('13800138000'),false);for(let index=1;index<=3;index++)assert.ok(text.includes(`材料 ${index}`));}
  else{const tokens=[] as string[];for(const source of done.sources){const primary=done.deliveries.find((x:any)=>x.documentId===source.documentId&&x.role==='primary');assert.ok(primary);const link=await f.req('POST',`/api/documents/${source.documentId}/download-link`,{revision:source.revision,role:'primary',artifactId:primary.artifactId});assert.equal(link.statusCode,200,link.body);const bytes=(await f.req('GET',link.json().url)).body;assert.equal(bytes.includes('13800138000'),false);const token=bytes.match(/【[^】]+】/u)?.[0];assert.ok(token,bytes);tokens.push(token);}assert.equal(new Set(tokens).size,1);}
 }
});

test('parallel status polls converge to one machine snapshot and one export job',async()=>{
 const f=await session(),doc=await f.create('联系 13800138000'),started=await f.start('start_lawbot_redaction',doc);assert.equal(started.isError,false,JSON.stringify(started));const job=started.structuredContent.jobId as string;await f.authorize(job);await tick();
 const polls=await Promise.all([f.tool('check_document_delivery',{job_id:job,wait_seconds:0}),f.tool('check_document_delivery',{job_id:job,wait_seconds:0})]);assert.ok(polls.some(x=>x.structuredContent?.status==='building_sanitized_artifact'),JSON.stringify(polls));
 const prepared=await f.task(job);assert.equal(prepared.state,'building_sanitized_artifact');assert.equal(prepared.reviewResolutions.length,1);assert.equal((await admin.query("SELECT count(*)::int n FROM review_snapshots WHERE document_id=$1 AND review_mode='automatic'",[doc])).rows[0].n,1);
 assert.equal((await admin.query("SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND collab_task_id IS NOT NULL AND kind='export'",[doc])).rows[0].n,1);
 await tick();const ready=await f.tool('check_document_delivery',{job_id:job,wait_seconds:0});assert.equal(ready.structuredContent.status,'sanitized_artifact_ready',JSON.stringify(ready));
});
