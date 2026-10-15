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

function requireIsolation(){
 const app=new URL(process.env.DATABASE_URL??''),migration=new URL(process.env.MIGRATION_DATABASE_URL??'');
 assert.match(decodeURIComponent(app.pathname),/^\/tmw_test_[a-z0-9_]+$/);
 assert.equal(app.pathname,migration.pathname);
 assert.equal(app.hostname,migration.hostname);
 assert.equal(app.port,migration.port);
 assert.ok(resolve(process.env.DATA_DIR??'').startsWith(resolve('.data/test-runs')+sep));
}
requireIsolation();

test('validated AI return archives immutable project receipt and verified private bytes', {timeout:240_000}, async()=>{
 const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
 let app:Awaited<ReturnType<typeof buildApp>>|undefined;
 try{
  assert.match((await admin.query('SELECT current_database() AS name')).rows[0].name,/^tmw_test_/);
  app=await buildApp();
  if(!app.hasRoute({method:'POST',url:'/api/mcp'}))registerMcpRoutes(app,applyDocumentConfiguration);
  const tenant=randomUUID(),origin=process.env.APP_ORIGIN!,password='synthetic-archive-password';
  async function account(tenantId=tenant){
   const uid=randomUUID(),username='archive-'+uid;
   await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenantId,username,passwordHash(password)]);
   const login=await app!.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
   assert.equal(login.statusCode,200,login.body);
   const cookie=String(login.headers['set-cookie']).split(';')[0];let nextRequestAt=0;
   return {uid,request:async(method:any,url:string,payload?:any,extra?:any)=>{
    const delay=nextRequestAt-Date.now();nextRequestAt=Math.max(nextRequestAt,Date.now())+550;if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
    return app!.inject({method,url,headers:{origin,cookie,...extra},payload});
   }};
  }
  const owner=await account(),other=await account(),cross=await account(randomUUID()),req=owner.request;
  let rpcId=0;const initialized=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++rpcId,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'archive-regression',version:'1'}}});
  assert.equal(initialized.statusCode,200,initialized.body);
  const headers={'mcp-session-id':String(initialized.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
  assert.equal((await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers)).statusCode,202);
  async function tool(name:string,args:any={}){const r=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++rpcId,method:'tools/call',params:{name,arguments:args}},headers);assert.equal(r.statusCode,200,r.body);return r.json().result.structuredContent;}
  const caps=await tool('get_lawbot_capabilities');
  assert.equal(caps.file.archiveValidatedAiResult,true);
  assert.equal(caps.file.archiveLocation,'private_cloud_project');
  assert.equal(caps.file.outputOverride,'none_browser_managed');
  const p=await req('POST','/api/projects',{name:'归档隔离验收'});assert.equal(p.statusCode,200,p.body);const project=p.json().id;
  const originalText='邮箱：archive@example.com；手机号：13800138000';
  const d=await req('POST',`/api/projects/${project}/documents`,{text:originalText,requestId:randomUUID()});assert.equal(d.statusCode,200,d.body);const doc=d.json().id;
  await tick();
  const beforeSource=(await req('GET',`/api/documents/${doc}`)).json();
  const started=await tool('start_lawbot_redaction',{project_id:project,document_ids:[doc],output_formats:['original','md'],masking_mode:'pseudonym',task_mode:'ai_process',request_id:randomUUID()});
  assert.ok(started.jobId,JSON.stringify(started));const job=started.jobId;
  const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};
  let t=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();
  const authorized=await req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:t.revision,authorization:consent});assert.equal(authorized.statusCode,200,authorized.body);
  await tick();
  let review=(await req('GET',`/api/documents/${doc}`)).json();assert.equal(review.state,'review');assert.ok(review.marks.length>0);
  const saved=await req('PUT',`/api/documents/${doc}/review`,{revision:review.revision,marks:review.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(saved.statusCode,200,saved.body);
  t=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();
  const prepared=await req('POST',`/api/ai-collab/tasks/${job}/prepare-export`,{revision:t.revision});assert.equal(prepared.statusCode,200,prepared.body);
  await tick();
  t=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();
  const released=await req('POST',`/api/ai-collab/tasks/${job}/release-export`,{revision:t.revision});assert.equal(released.statusCode,200,released.body);
  const received=await tool('receive_sanitized_document',{job_id:job,output_format:'md'});
  assert.ok(received.slotId,JSON.stringify(received));const source=Buffer.from(received.bytesBase64,'base64');
  assert.equal(hash(source),received.sha256);assert.equal(source.toString().includes(originalText),false);
  const sourceBefore=(await admin.query('SELECT content,content_hash,source_id,source_hash FROM documents WHERE id=$1',[doc])).rows[0];
  const issuedBefore=(await admin.query('SELECT id,hash,issued_until FROM artifacts WHERE document_id=$1 ORDER BY id',[doc])).rows;
  assert.ok(issuedBefore.length>0);
  assert.equal((await req('GET',`/api/ai-collab/tasks/${job}/archives`)).json().items.length,0);
  const returned=Buffer.from(source.toString()+'\n已完成审阅。');
  const bad=await tool('submit_reviewed_document',{job_id:job,round_id:received.roundId,slot_id:received.slotId,sha256:hash(Buffer.from('different')),suggested_name:'归档稿.md',bytes_base64:returned.toString('base64')});
  assert.equal(bad.error,'RESULT_HASH_MISMATCH');
  assert.equal((await req('GET',`/api/ai-collab/tasks/${job}/archives`)).json().items.length,0);
  const uploaded=await req('PUT',`/api/ai-collab/tasks/${job}/slots/${received.slotId}`,{bytesBase64:returned.toString('base64')});assert.equal(uploaded.statusCode,200,uploaded.body);
  const result=await tool('submit_reviewed_document',{job_id:job,round_id:received.roundId,slot_id:received.slotId,sha256:hash(returned),suggested_name:'归档稿.md'});
  assert.equal(result.validation.valid,true,JSON.stringify(result));assert.equal(result.archivedResult.humanReviewed,false);
  const receipt=result.archivedResult;
  assert.equal(receipt.location,'private_cloud_project');assert.equal(receipt.sourceArtifactId,received.artifactId);
  assert.equal(receipt.sourceSha256,hash(source));assert.equal(receipt.sha256,hash(returned));
  const list=(await req('GET',`/api/ai-collab/tasks/${job}/archives`)).json().items;
  assert.equal(list.length,1);assert.deepEqual(list[0],receipt);
  const row=(await admin.query('SELECT * FROM ai_result_archives WHERE task_id=$1',[taskUUID(job)])).rows[0];
  assert.ok(row);assert.equal(row.payload.includes('归档稿'),false);
  const metadata=JSON.parse(unseal(row.payload,`ai-result-archive:v1:${tenant}:${project}:${owner.uid}:${taskUUID(job)}:${received.roundId}:${row.id}`));
  assert.equal(metadata.actorId,owner.uid);assert.equal(metadata.humanReviewed,false);
  assert.equal(metadata.resultObjectId,(await req('GET',`/api/ai-collab/tasks/${job}`)).json().rounds[0].objectId);
  const downloaded=await req('GET',`/api/ai-collab/tasks/${job}/archives/${received.roundId}/download`);
  assert.equal(downloaded.statusCode,200,downloaded.body);assert.equal(hash(downloaded.rawPayload),hash(returned));
  // Synthetic receipt corruption must not make a wrong result object
  // downloadable, even though the AEAD tag is valid for this receipt row.
  const altered={...metadata,resultSha256:hash(Buffer.from('wrong-result'))};
  await admin.query('UPDATE ai_result_archives SET payload=$2 WHERE id=$1',[row.id,seal(JSON.stringify(altered),`ai-result-archive:v1:${tenant}:${project}:${owner.uid}:${taskUUID(job)}:${received.roundId}:${row.id}`)]);
  assert.equal((await req('GET',`/api/ai-collab/tasks/${job}/archives/${received.roundId}/download`)).statusCode,409);
  await admin.query('UPDATE ai_result_archives SET payload=$2 WHERE id=$1',[row.id,row.payload]);
  assert.equal((await other.request('GET',`/api/ai-collab/tasks/${job}/archives`)).statusCode,404);
  assert.equal((await cross.request('GET',`/api/ai-collab/tasks/${job}/archives/${received.roundId}/download`)).statusCode,404);
  t=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();const revision=t.revision;
  const repeated=await tool('submit_reviewed_document',{job_id:job,round_id:received.roundId,slot_id:received.slotId,sha256:hash(returned),suggested_name:'归档稿.md'});
  assert.deepEqual(repeated.archivedResult,receipt);
  assert.equal((await req('GET',`/api/ai-collab/tasks/${job}`)).json().revision,revision);
  const renamed=await tool('submit_reviewed_document',{job_id:job,round_id:received.roundId,slot_id:received.slotId,sha256:hash(returned),suggested_name:'冲突名称.md'});
  assert.equal(renamed.error,'AI_RESULT_ARCHIVE_CONFLICT');
  assert.equal((await req('GET',`/api/ai-collab/tasks/${job}`)).json().revision,revision);
  const conflict=await tool('submit_reviewed_document',{job_id:job,round_id:received.roundId,slot_id:received.slotId,sha256:hash(Buffer.from('different')),suggested_name:'归档稿.md'});
  assert.ok(conflict.error);assert.equal((await req('GET',`/api/ai-collab/tasks/${job}/archives`)).json().items.length,1);
  const afterSource=(await req('GET',`/api/documents/${doc}`)).json();
  assert.equal(afterSource.id,beforeSource.id);
  const sourceAfter=(await admin.query('SELECT content,content_hash,source_id,source_hash FROM documents WHERE id=$1',[doc])).rows[0];
  const issuedAfter=(await admin.query('SELECT id,hash,issued_until FROM artifacts WHERE document_id=$1 ORDER BY id',[doc])).rows;
  assert.deepEqual(sourceAfter,sourceBefore,'archive cannot rewrite original document source');
  assert.deepEqual(issuedAfter,issuedBefore,'archive cannot alter previously issued artifact validity');
  // Synthetic administrator corruption of an otherwise valid task must not turn
  // an idempotent submit into an unverified receipt read.
  const taskId=taskUUID(job),taskAad=`${tenant}:${owner.uid}:ai-collab:${taskId}`;
  const stored=(await admin.query('SELECT payload,revision FROM ai_collab_tasks WHERE id=$1',[taskId])).rows[0];
  const taskPayload=JSON.parse(unseal(stored.payload,taskAad));
  taskPayload.deliveries.find((x:any)=>`lba_${x.artifactId.replaceAll('-','')}`===received.artifactId).hash=hash(Buffer.from('synthetic-corruption'));
  await admin.query('UPDATE ai_collab_tasks SET payload=$2 WHERE id=$1',[taskId,seal(JSON.stringify(taskPayload),taskAad)]);
  assert.equal((await tool('submit_reviewed_document',{job_id:job,round_id:received.roundId,slot_id:received.slotId,sha256:hash(returned),suggested_name:'归档稿.md'})).error,'STALE_ARTIFACT');
  await admin.query('UPDATE ai_collab_tasks SET payload=$2 WHERE id=$1',[taskId,stored.payload]);
  // Real second round: the first receipt and bytes remain addressable after a
  // later validated return replaces the task's current round.
  t=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();
  const reviewed=await req('POST',`/api/ai-collab/tasks/${job}/review-result`,{revision:t.revision,roundId:received.roundId,approved:true});
  assert.equal(reviewed.statusCode,200,reviewed.body);
  assert.equal((await tool('continue_current_document_review',{job_id:job})).status,'sanitized_artifact_ready');
  const next=await tool('receive_sanitized_document',{job_id:job,output_format:'md'});
  assert.notEqual(next.roundId,received.roundId);
  const nextBytes=Buffer.from(Buffer.from(next.bytesBase64,'base64').toString()+'\n第二轮已核验。');
  assert.equal((await req('PUT',`/api/ai-collab/tasks/${job}/slots/${next.slotId}`,{bytesBase64:nextBytes.toString('base64')})).statusCode,200);
  const second=await tool('submit_reviewed_document',{job_id:job,round_id:next.roundId,slot_id:next.slotId,sha256:hash(nextBytes),suggested_name:'第二轮.md'});
  assert.equal(second.validation.valid,true,JSON.stringify(second));
  const historical=(await req('GET',`/api/ai-collab/tasks/${job}/archives`)).json().items;
  assert.deepEqual(historical.map((x:any)=>x.roundId),[received.roundId,next.roundId]);
  assert.equal(hash((await req('GET',`/api/ai-collab/tasks/${job}/archives/${received.roundId}/download`)).rawPayload),hash(returned));
  assert.equal(hash((await req('GET',`/api/ai-collab/tasks/${job}/archives/${next.roundId}/download`)).rawPayload),hash(nextBytes));
  // Synthetic owner fixture isolates the permission lifecycle from the MCP
  // workflow: a project member can read their own archive, then loses it on
  // real member revocation while the admin-visible rows remain unchanged.
  const grant=await req('PUT',`/api/projects/${project}/members/${other.uid}`,{revision:null,permissions:['view_original','review','export','view_mapping']});
  assert.equal(grant.statusCode,200,grant.body);
  const otherInitialized=await other.request('POST','/api/mcp',{jsonrpc:'2.0',id:++rpcId,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'revoked-member',version:'1'}}});
  assert.equal(otherInitialized.statusCode,200,otherInitialized.body);
  const otherHeaders={'mcp-session-id':String(otherInitialized.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
  assert.equal((await other.request('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},otherHeaders)).statusCode,202);
  async function otherTool(name:string,args:any={}){const r=await other.request('POST','/api/mcp',{jsonrpc:'2.0',id:++rpcId,method:'tools/call',params:{name,arguments:args}},otherHeaders);assert.equal(r.statusCode,200,r.body);return r.json().result.structuredContent;}
  const memberStarted=await otherTool('start_lawbot_redaction',{project_id:project,document_ids:[doc],output_formats:['original','md'],masking_mode:'pseudonym',task_mode:'ai_process',request_id:randomUUID()});
  assert.ok(memberStarted.jobId,JSON.stringify(memberStarted));const realMemberJob=memberStarted.jobId;
  let memberTask=(await other.request('GET',`/api/ai-collab/tasks/${realMemberJob}`)).json();
  assert.equal((await other.request('POST',`/api/ai-collab/tasks/${realMemberJob}/authorize`,{revision:memberTask.revision,authorization:consent})).statusCode,200);
  await tick();
  review=(await other.request('GET',`/api/documents/${doc}`)).json();
  assert.equal(review.state,'review');
  assert.equal((await other.request('PUT',`/api/documents/${doc}/review`,{revision:review.revision,marks:review.marks.map((m:any)=>({...m,decision:'redact'}))})).statusCode,200);
  memberTask=(await other.request('GET',`/api/ai-collab/tasks/${realMemberJob}`)).json();
  assert.equal((await other.request('POST',`/api/ai-collab/tasks/${realMemberJob}/prepare-export`,{revision:memberTask.revision})).statusCode,200);
  await tick();
  memberTask=(await other.request('GET',`/api/ai-collab/tasks/${realMemberJob}`)).json();
  assert.equal((await other.request('POST',`/api/ai-collab/tasks/${realMemberJob}/release-export`,{revision:memberTask.revision})).statusCode,200);
  const memberDelivery=await otherTool('receive_sanitized_document',{job_id:realMemberJob,output_format:'md'});
  assert.ok(memberDelivery.slotId,JSON.stringify(memberDelivery));
  const memberBytes=Buffer.from(memberDelivery.bytesBase64,'base64');
  assert.equal((await other.request('PUT',`/api/ai-collab/tasks/${realMemberJob}/slots/${memberDelivery.slotId}`,{bytesBase64:memberBytes.toString('base64')})).statusCode,200);
  const frozenMember=(await other.request('GET',`/api/ai-collab/tasks/${realMemberJob}`)).json();
  // Synthetic DB fault after validation computation: the archive INSERT and
  // task revision/state must commit or roll back together.
  await admin.query("CREATE FUNCTION synthetic_archive_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic archive insert fault'; END $$");
  await admin.query('CREATE TRIGGER synthetic_archive_reject BEFORE INSERT ON ai_result_archives FOR EACH ROW EXECUTE FUNCTION synthetic_archive_reject()');
  const failedWrite=await otherTool('submit_reviewed_document',{job_id:realMemberJob,round_id:memberDelivery.roundId,slot_id:memberDelivery.slotId,sha256:hash(memberBytes),suggested_name:'member.md'});
  assert.ok(failedWrite.error,JSON.stringify(failedWrite));
  await admin.query('DROP TRIGGER synthetic_archive_reject ON ai_result_archives');
  await admin.query('DROP FUNCTION synthetic_archive_reject()');
  const afterFault=(await other.request('GET',`/api/ai-collab/tasks/${realMemberJob}`)).json();
  assert.equal(afterFault.revision,frozenMember.revision);
  assert.equal(afterFault.state,frozenMember.state);
  assert.equal(afterFault.rounds[0].validated,undefined);
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM ai_result_archives WHERE task_id=$1',[taskUUID(realMemberJob)])).rows[0].n,0);
  const memberJob=`lbj_${randomUUID().replaceAll('-','')}`,memberTaskId=taskUUID(memberJob),memberPayload={...JSON.parse(unseal(stored.payload,taskAad)),jobId:memberJob,revision:1};
  await admin.query('INSERT INTO ai_collab_tasks(id,tenant_id,owner_id,project_id,revision,payload) VALUES($1,$2,$3,$4,$5,$6)',[memberTaskId,tenant,other.uid,project,1,seal(JSON.stringify(memberPayload),`${tenant}:${other.uid}:ai-collab:${memberTaskId}`)]);
  const memberReceiptId=randomUUID(),memberMetadata={...metadata,taskJobId:memberJob,actorId:other.uid};
  await admin.query('INSERT INTO ai_result_archives(id,tenant_id,project_id,owner_id,task_id,round_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7)',[memberReceiptId,tenant,project,other.uid,memberTaskId,received.roundId,seal(JSON.stringify(memberMetadata),`ai-result-archive:v1:${tenant}:${project}:${other.uid}:${memberTaskId}:${received.roundId}:${memberReceiptId}`)]);
  assert.equal((await other.request('GET',`/api/ai-collab/tasks/${memberJob}/archives`)).json().items.length,1);
  assert.equal((await other.request('GET',`/api/ai-collab/tasks/${memberJob}/archives/${received.roundId}/download`)).statusCode,200);
  // Exercise the immutable-receipt fallback under the same real permission
  // revocation; corruption cannot turn it into an authorization bypass.
  const damagedMemberCipher='synthetic damaged member task before quarantine';
  await admin.query('UPDATE ai_collab_tasks SET payload=$2 WHERE id=$1',[memberTaskId,damagedMemberCipher]);
  const damagedBefore=(await admin.query('SELECT revision,payload,updated_at FROM ai_collab_tasks WHERE id=$1',[memberTaskId])).rows[0];
  const memberArchiveUrl=`/api/ai-collab/tasks/${memberJob}/archives/${received.roundId}/download`,memberResultUrl=`/api/ai-collab/tasks/${memberJob}/results/${received.roundId}`;
  for(const path of [memberArchiveUrl,memberResultUrl]){const response=await other.request('GET',path);assert.equal(response.statusCode,200,response.body);assert.equal(hash(response.rawPayload),metadata.resultSha256);}
  const revoke=await req('PUT',`/api/projects/${project}/members/${other.uid}`,{revision:grant.json().revision,permissions:['view_original','export','view_mapping']});
  assert.equal(revoke.statusCode,200,revoke.body);
  const revokedSubmit=await otherTool('submit_reviewed_document',{job_id:realMemberJob,round_id:memberDelivery.roundId,slot_id:memberDelivery.slotId,sha256:hash(memberBytes),suggested_name:'revoked.md'});
  assert.equal(revokedSubmit.error,'PERMISSION_DENIED');
  const stillFrozen=(await other.request('GET',`/api/ai-collab/tasks/${realMemberJob}`)).json();
  assert.equal(stillFrozen.revision,frozenMember.revision);
  assert.equal(stillFrozen.rounds[0].sha256,frozenMember.rounds[0].sha256);
  assert.equal(stillFrozen.rounds[0].objectId,frozenMember.rounds[0].objectId);
  assert.equal(stillFrozen.rounds[0].validated,undefined);
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM ai_result_archives WHERE task_id=$1',[taskUUID(realMemberJob)])).rows[0].n,0);
  assert.equal((await other.request('GET',`/api/ai-collab/tasks/${memberJob}/archives`)).statusCode,403);
  assert.equal((await other.request('GET',`/api/ai-collab/tasks/${memberJob}/archives/${received.roundId}/download`)).statusCode,403);
  assert.equal((await other.request('GET',memberResultUrl)).statusCode,403);
  assert.deepEqual((await admin.query('SELECT revision,payload,updated_at FROM ai_collab_tasks WHERE id=$1',[memberTaskId])).rows[0],damagedBefore);
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM ai_result_archives WHERE task_id=$1',[memberTaskId])).rows[0].n,1);
  console.log(JSON.stringify({archiveId:receipt.archiveId,roundId:receipt.roundId,sourceSha256:receipt.sourceSha256,resultSha256:receipt.sha256,revision,other:404,cross:404}));
 }finally{if(app)await app.close();await pool.end();await admin.end();}
});

