import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {hash,passwordHash} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL} from '../packages/core/mcp-tools.ts';
import {pdfFixture} from './pdf-fixtures.ts';
import {officeFixture} from './office-fixtures.ts';

const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
const origin=process.env.APP_ORIGIN!;
const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};

async function fixture(){
 const tenant=randomUUID(),user=randomUUID(),username=`mcp-visual-${randomUUID()}`,password='synthetic-visual-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,extra?:Record<string,string>)=>app.inject({method,url,headers:{origin,cookie,...extra},payload});
 const initialized=await req('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'visual-test',version:'1'}}});assert.equal(initialized.statusCode,200,initialized.body);
 const headers={'mcp-session-id':String(initialized.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
 await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers);
 let id=1;
 const tool=async(name:string,args:Record<string,unknown>)=>{const response=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:args}},headers);assert.equal(response.statusCode,200,response.body);return response.json().result;};
 const gateway=async(method:string,params:Record<string,unknown>)=>{const response=await req('POST','/api/ai-collab/gateway',{method,params},headers);return response;};
 const projectResponse=await req('POST','/api/projects',{name:'visual fallback synthetic'});assert.equal(projectResponse.statusCode,200,projectResponse.body);const project=projectResponse.json().id as string;
 const upload=async(filename:string,bytes:Buffer)=>{const batchId=randomUUID(),requestId=randomUUID();const batch=await req('POST',`/api/projects/${project}/upload-batches`,{id:batchId,files:[{requestId,path:filename,size:bytes.length}]});assert.equal(batch.statusCode,200,batch.body);const uploaded=await req('POST',`/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`,bytes,{'content-type':'application/octet-stream'});assert.equal(uploaded.statusCode,200,uploaded.body);const documentId=uploaded.json().id as string;for(let i=0;i<20;i++){const rows=(await admin.query("SELECT status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NULL ORDER BY created_at DESC LIMIT 1",[documentId])).rows;if(rows[0]?.status==='succeeded')return documentId;assert.notEqual(rows[0]?.status,'failed');await tick();}throw new Error('INITIAL_DETECTION_NOT_COMPLETE');};
 const task=async(jobId:string)=>(await req('GET',`/api/ai-collab/tasks/${jobId}`)).json();
 const approve=async(jobId:string)=>{const current=await task(jobId),approved=await req('POST',`/api/ai-collab/tasks/${jobId}/authorize`,{revision:current.revision,authorization:consent});assert.equal(approved.statusCode,200,approved.body);};
 const waitOwned=async(jobIds:string[],kind:'detect'|'export')=>{
  assert.ok(jobIds.length,'owned job IDs must be persisted');
  for(let attempt=0;attempt<80;attempt++){
   const found=(await admin.query('SELECT id,status,kind,error_code,attempt,generation,lease_until,created_at,available_at,document_id,revision FROM jobs WHERE id=ANY($1::uuid[])',[jobIds])).rows;
   assert.equal(found.some(j=>j.kind!==kind||['failed','cancelled'].includes(j.status)),false,JSON.stringify(found));
   if(found.length===jobIds.length&&found.every(j=>j.status==='succeeded'))return;
   await tick();
  }
  const final=(await admin.query('SELECT id,status,kind,error_code,attempt,generation,lease_until,created_at,available_at,document_id,revision FROM jobs WHERE id=ANY($1::uuid[])',[jobIds])).rows;const attempts=(await admin.query('SELECT job_id,generation,outcome,started_at,finished_at FROM attempts WHERE job_id=ANY($1::uuid[]) ORDER BY job_id,generation',[jobIds])).rows;const events=(await admin.query('SELECT job_id,generation,count(*)::int AS count,max(sequence) AS last_sequence FROM processing_events WHERE job_id=ANY($1::uuid[]) GROUP BY job_id,generation',[jobIds])).rows;throw new Error(`${kind.toUpperCase()}_JOBS_NOT_SUCCEEDED ${JSON.stringify({jobs:final,attempts,events})}`);
 };
 const ready=async(jobId:string,docs:string[])=>{
  await approve(jobId);let current=await task(jobId);assert.equal(current.recognitionJobIds?.length,docs.length);await waitOwned(current.recognitionJobIds,'detect');
  for(const doc of docs){const view=(await req('GET',`/api/documents/${doc}`)).json();assert.equal(view.state,'review');const saved=await req('PUT',`/api/documents/${doc}/review`,{revision:view.revision,marks:view.marks.map((m:any)=>({...m,decision:'redact'})),...(view.format==='pdf'?{pageReview:{...view.pageReview,mode:'raster'}}:{})});assert.equal(saved.statusCode,200,saved.body);}
  current=await task(jobId);const prepared=await req('POST',`/api/ai-collab/tasks/${jobId}/prepare-export`,{revision:current.revision});assert.equal(prepared.statusCode,200,prepared.body);
  current=await task(jobId);assert.equal(current.exportJobIds?.length,docs.length);await waitOwned(current.exportJobIds,'export');
  current=await task(jobId);const released=await req('POST',`/api/ai-collab/tasks/${jobId}/release-export`,{revision:current.revision});assert.equal(released.statusCode,200,released.body);
  current=await task(jobId);assert.equal(current.state,'waiting_for_task_selection');const intent=await req('POST',`/api/ai-collab/tasks/${jobId}/action`,{revision:current.revision,method:'set-review-intent',intent:{goals:['summary']}});assert.equal(intent.statusCode,200,intent.body);
  current=await task(jobId);assert.equal(current.state,'sanitized_artifact_ready');return current;
 };
 return{tenant,user,project,req,tool,gateway,upload,ready};
}

test('verified PDF is delivered as a visual attachment with a derived report slot and exact replay',async()=>{
 const f=await fixture(),original=pdfFixture({text:'合成手机号 13800138000'}),doc=await f.upload('synthetic.pdf',original);
 const started=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,document_ids:[doc],masking_mode:'pseudonym',task_mode:'ai_process_restore',output_formats:['original'],request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));const jobId=started.structuredContent.jobId as string;
 const task=await f.ready(jobId,[doc]);assert.ok(task.deliveries.some((x:any)=>x.format==='pdf'));assert.equal(task.deliveries.some((x:any)=>x.format==='md'),false);
 const notice=await f.tool('check_document_delivery',{job_id:jobId,wait_seconds:0});assert.equal(notice.isError,false,JSON.stringify(notice));
 assert.equal(notice.structuredContent.sanitizedArtifact?.fallbackReason,'markdown_unavailable');assert.equal(notice.structuredContent.visualFallbackCount,1);assert.match(notice.structuredContent.userMessage,/其中 1 份 Markdown 未能交付，已改用校验通过的假名 PDF\/图片继续审查/);
 const markdown=task.deliveries.find((x:any)=>x.role==='markdown');
 const received=await f.tool('receive_sanitized_document',{job_id:jobId,...markdown?{artifact_id:`lba_${markdown.artifactId.replaceAll('-','')}`}:{}});assert.equal(received.isError,false,JSON.stringify(received));
 const value=received.structuredContent;assert.equal(value.resultKind,'derived_report');assert.equal(value.resultFormat,'docx');assert.ok(value.format==='md'||value.format==='pdf');
 const visual=value.format==='pdf'?value:value.attachments.find((x:any)=>x.format==='pdf');assert.ok(visual);assert.equal(hash(Buffer.from(visual.bytesBase64,'base64')),visual.sha256);assert.notEqual(visual.sha256,hash(original));
 const wire=JSON.stringify(value),currentDoc=(await f.req('GET',`/api/documents/${doc}`)).json();assert.equal(wire.includes(doc),false);assert.equal(wire.includes(f.project),false);assert.equal(wire.includes('13800138000'),false);for(const mark of currentDoc.marks??[])if(mark.replacement?.mappingId)assert.equal(wire.includes(mark.replacement.mappingId),false);
 const again=await f.tool('receive_sanitized_document',{job_id:jobId,...markdown?{artifact_id:`lba_${markdown.artifactId.replaceAll('-','')}`}:{}});assert.equal(again.isError,false,JSON.stringify(again));assert.equal(again.structuredContent.slotId,value.slotId);assert.equal(again.structuredContent.roundId,value.roundId);
 const wrongKind=await f.tool('receive_sanitized_document',{job_id:jobId,result_kind:'reviewed_document',output_format:'md',...markdown?{artifact_id:`lba_${markdown.artifactId.replaceAll('-','')}`}:{}});assert.equal(wrongKind.structuredContent.error,'OUTPUT_FORMAT_ALREADY_BOUND');
 const wrongPurpose=await f.tool('receive_sanitized_document',{job_id:jobId,result_kind:'reviewed_document',output_format:'docx',...markdown?{artifact_id:`lba_${markdown.artifactId.replaceAll('-','')}`}:{}});assert.equal(wrongPurpose.isError,false,JSON.stringify(wrongPurpose));assert.equal(wrongPurpose.structuredContent.resultKind,'derived_report');assert.equal(wrongPurpose.structuredContent.slotId,value.slotId);
 const wrongArtifact=await f.tool('receive_sanitized_document',{job_id:jobId,artifact_id:`lba_${randomUUID().replaceAll('-','')}`});assert.equal(wrongArtifact.structuredContent.error,'ARTIFACT_MISMATCH');
 const foreign=await fixture();const denied=await foreign.tool('receive_sanitized_document',{job_id:jobId});assert.equal(denied.isError,true);assert.equal(denied.structuredContent.bytesBase64,undefined);
 const current=(await f.req('GET',`/api/ai-collab/tasks/${jobId}`)).json();assert.equal(current.mapping,undefined);assert.equal(current.allowedTokens?.every((x:string)=>typeof x==='string'),true);
 const visualArtifact=task.deliveries.find((x:any)=>x.format==='pdf');assert.ok(visualArtifact);
 await admin.query('UPDATE artifacts SET hash=$1 WHERE id=$2',['0'.repeat(64),visualArtifact.artifactId]);
 const corrupted=await f.tool('receive_sanitized_document',{job_id:jobId,...markdown?{artifact_id:`lba_${markdown.artifactId.replaceAll('-','')}`}:{}});assert.equal(corrupted.isError,true);assert.equal(corrupted.structuredContent.bytesBase64,undefined);
});

test('combined Markdown keeps all approved PDF attachments, preserves an explicit md result format, and rejects a parent artifact selector',async()=>{
 const f=await fixture(),plain=await f.upload('plain.txt',Buffer.from('合成公司 公示材料')),visual=await f.upload('visual.pdf',pdfFixture({text:'合成图片材料'}));
 const started=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,document_ids:[plain,visual],masking_mode:'default_mask',task_mode:'ai_process',output_formats:['original','md'],file_settings:[{source_path:`document:${visual}`,output_formats:['original']}],batch_result_mode:'combined',request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));const jobId=started.structuredContent.jobId as string;
 const task=await f.ready(jobId,[plain,visual]);assert.ok(task.deliveries.some((x:any)=>x.documentId===plain&&x.format==='md'));assert.ok(task.deliveries.some((x:any)=>x.documentId===visual&&x.format==='pdf'));assert.equal(task.deliveries.some((x:any)=>x.documentId===visual&&x.format==='md'),false);const parentStatus=await f.tool('check_document_delivery',{job_id:jobId,wait_seconds:0});assert.equal(parentStatus.isError,false,JSON.stringify(parentStatus));const parentArtifact=parentStatus.structuredContent.sanitizedArtifact?.artifactId;assert.match(parentArtifact,/^lba_[a-f0-9]{32}$/);const received=await f.tool('receive_sanitized_document',{job_id:jobId,artifact_id:parentArtifact,result_kind:'derived_report',output_format:'md'});assert.equal(received.isError,false,JSON.stringify(received));const value=received.structuredContent;
 assert.equal(value.format,'md');assert.equal(value.resultFormat,'md');assert.equal(value.resultKind,'derived_report');assert.ok(Buffer.from(value.bytesBase64,'base64').toString().includes('材料 1'));assert.ok(value.attachments.some((x:any)=>x.format==='pdf'&&hash(Buffer.from(x.bytesBase64,'base64'))===x.sha256));const wire=JSON.stringify(value);for(const raw of [plain,visual,f.project,'合成图片材料'])assert.equal(wire.includes(raw),false);
 const disallowed=await f.tool('receive_sanitized_document',{job_id:jobId,result_kind:'derived_report',artifact_id:`lba_${randomUUID().replaceAll('-','')}`});assert.equal(disallowed.structuredContent.error,'BATCH_ARTIFACT_NOT_RECEIVABLE');
 const visualArtifact=task.deliveries.find((x:any)=>x.format==='pdf');assert.ok(visualArtifact);await admin.query('UPDATE artifacts SET hash=$1 WHERE id=$2',['0'.repeat(64),visualArtifact.artifactId]);
 const submitted=await f.tool('submit_reviewed_document',{job_id:jobId,round_id:value.roundId,slot_id:value.slotId,sha256:hash(Buffer.from(value.bytesBase64,'base64')),suggested_name:'derived.md',bytes_base64:value.bytesBase64});assert.equal(submitted.isError,true);assert.equal(submitted.structuredContent.archivedResult,undefined);
});

test('PDF with a verified Markdown export keeps the existing reviewed-document delivery',async()=>{
 const f=await fixture(),doc=await f.upload('markdown-capable.pdf',pdfFixture({text:'合成手机号 13800138000'}));
 const sourceProfile=(await f.req('GET','/api/presets/profiles/system_default')).json().settings;
 const created=await f.req('POST','/api/presets/profiles',{name:`PDF Markdown ${randomUUID()}`,profile:{...sourceProfile,pdf:{...sourceProfile.pdf,exportMarkdown:true}}});assert.equal(created.statusCode,200,created.body);
 const started=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,document_ids:[doc],advanced:{profile:created.json().settings.id},masking_mode:'pseudonym',task_mode:'ai_process',output_formats:['original','md'],request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));const jobId=started.structuredContent.jobId as string;
 const task=await f.ready(jobId,[doc]);assert.ok(task.deliveries.some((x:any)=>x.format==='pdf'));assert.ok(task.deliveries.some((x:any)=>x.role==='markdown'&&x.format==='md'));
 const received=await f.tool('receive_sanitized_document',{job_id:jobId});assert.equal(received.isError,false,JSON.stringify(received));const value=received.structuredContent;
 assert.equal(value.format,'md');assert.equal(value.resultFormat,'md');assert.equal(value.resultKind,'reviewed_document');assert.equal(value.attachments,undefined);
 assert.equal(Buffer.from(value.bytesBase64,'base64').toString().includes('13800138000'),false);
});

test('output_format docx allocates a DOCX result slot from the approved Markdown source',async()=>{
 const f=await fixture(),doc=await f.upload('text.md',Buffer.from('合成手机号 13800138000'));
 const started=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,document_ids:[doc],masking_mode:'default_mask',task_mode:'ai_process',output_formats:['md'],request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));const jobId=started.structuredContent.jobId as string;
 await f.ready(jobId,[doc]);const received=await f.tool('receive_sanitized_document',{job_id:jobId,output_format:'docx'});assert.equal(received.isError,false,JSON.stringify(received));const value=received.structuredContent;
 assert.equal(value.format,'md');assert.equal(value.resultFormat,'docx');assert.equal(value.resultKind,'reviewed_document');assert.equal(value.attachments,undefined);
});

test('TXT primary with original-only export still supplies an MD result slot',async()=>{
 const f=await fixture(),doc=await f.upload('primary.txt',Buffer.from('合成手机号 13800138000'));
 const started=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,document_ids:[doc],masking_mode:'default_mask',task_mode:'ai_process',output_formats:['original'],request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));const jobId=started.structuredContent.jobId as string;
 await f.ready(jobId,[doc]);const received=await f.tool('receive_sanitized_document',{job_id:jobId,output_format:'md'});assert.equal(received.isError,false,JSON.stringify(received));
 assert.equal(received.structuredContent.format,'txt');assert.equal(received.structuredContent.resultFormat,'md');assert.equal(received.structuredContent.resultKind,'reviewed_document');
});

test('a Word primary remains the selected source while output_format controls the result slot',async()=>{
 const f=await fixture(),doc=await f.upload('source.docx',await officeFixture('docx'));
 const started=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,document_ids:[doc],masking_mode:'default_mask',task_mode:'ai_process',output_formats:['original','md'],request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));const jobId=started.structuredContent.jobId as string;
 await f.ready(jobId,[doc]);const defaultSlot=await f.tool('receive_sanitized_document',{job_id:jobId});assert.equal(defaultSlot.isError,false,JSON.stringify(defaultSlot));assert.equal(defaultSlot.structuredContent.format,'docx');assert.equal(defaultSlot.structuredContent.resultFormat,'docx');
 const received=await f.tool('receive_sanitized_document',{job_id:jobId,output_format:'md',replace_slot_id:defaultSlot.structuredContent.slotId});assert.equal(received.isError,false,JSON.stringify(received));
 assert.equal(received.structuredContent.format,'docx');assert.equal(received.structuredContent.resultFormat,'md');assert.equal(received.structuredContent.resultKind,'reviewed_document');assert.notEqual(received.structuredContent.slotId,defaultSlot.structuredContent.slotId);
});

test('a visual token retains its protected mapping reference for later authorized restoration',async()=>{
 const f=await fixture(),doc=await f.upload('late-restore.pdf',pdfFixture({text:'合成手机号 13800138000'}));
 const started=await f.tool('start_lawbot_redaction_for_user_manual_review',{project_id:f.project,document_ids:[doc],masking_mode:'pseudonym',task_mode:'ai_process_restore',output_formats:['original'],request_id:randomUUID()});assert.equal(started.isError,false,JSON.stringify(started));const jobId=started.structuredContent.jobId as string;
 const task=await f.ready(jobId,[doc]);assert.ok(task.deliveries.some((x:any)=>x.format==='pdf'));assert.equal(task.deliveries.some((x:any)=>x.format==='md'),false);const reviewed=(await f.req('GET',`/api/documents/${doc}`)).json(),token=reviewed.marks.find((m:any)=>m.decision==='redact'&&m.replacement?.mode==='alias')?.replacement?.token;assert.ok(token,'a real alias mark is required for this test');
 const delivery=await f.tool('receive_sanitized_document',{job_id:jobId,output_format:'md'});assert.equal(delivery.isError,false,JSON.stringify(delivery));assert.equal(delivery.structuredContent.resultKind,'derived_report');
 const bytes=Buffer.from(`核验稿 ${token}`),submitted=await f.tool('submit_reviewed_document',{job_id:jobId,round_id:delivery.structuredContent.roundId,slot_id:delivery.structuredContent.slotId,sha256:hash(bytes),suggested_name:'derived.md',bytes_base64:bytes.toString('base64')});assert.equal(submitted.isError,false,JSON.stringify(submitted));
 const before=(await f.req('GET',`/api/ai-collab/tasks/${jobId}`)).json();assert.equal(before.authorization.allowRestorePath,false);assert.equal(before.mapping,undefined);assert.equal(before.status??before.state,'waiting_for_restore_approval');
 const foreign=await fixture(),denied=await foreign.req('POST',`/api/ai-collab/tasks/${jobId}/authorize-restoration`,{revision:before.revision,allowRestorePath:true});assert.notEqual(denied.statusCode,200);
 const approved=await f.req('POST',`/api/ai-collab/tasks/${jobId}/authorize-restoration`,{revision:before.revision,allowRestorePath:true});assert.equal(approved.statusCode,200,approved.body);
 const granted=(await f.req('GET',`/api/ai-collab/tasks/${jobId}`)).json();assert.equal(granted.authorization.allowRestorePath,true);const humanReview=await f.req('POST',`/api/ai-collab/tasks/${jobId}/review-result`,{revision:granted.revision,roundId:delivery.structuredContent.roundId,approved:true});assert.equal(humanReview.statusCode,200,humanReview.body);
 const restore=await f.tool('start_lawbot_restoration',{job_id:jobId,round_id:delivery.structuredContent.roundId});assert.equal(restore.isError,false,JSON.stringify(restore));const completed=(await f.req('GET',`/api/ai-collab/tasks/${jobId}`)).json();const restoredId=completed.rounds.at(-1)?.restoredArtifactId;assert.ok(restoredId);assert.equal(completed.rounds.at(-1)?.residualTokenCount,0);const downloaded=await f.req('GET',`/api/projects/${f.project}/restoration/files/${restoredId}`);assert.equal(downloaded.statusCode,200,downloaded.body);assert.ok(downloaded.body.includes('13800138000'));assert.equal(downloaded.body.includes(token),false);
});
