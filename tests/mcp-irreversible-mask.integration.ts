// Candidate for tests/mcp-irreversible-mask.integration.ts; run only against a fresh tmw_test_ database.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {registerMcpRoutes} from '../apps/api/mcp.ts';
import {applyDocumentConfiguration} from '../apps/api/document-policy.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,seal,unseal} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
const app=await buildApp();
if(!app.hasRoute({method:'POST',url:'/api/mcp'}))registerMcpRoutes(app,applyDocumentConfiguration);
const origin=process.env.APP_ORIGIN!;
after(async()=>{await app.close();await pool.end();await admin.end();});
const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:false,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};

test('restore mode refuses irreversible global, file and selected-profile settings before task creation',async()=>{
 const uid=randomUUID(),tenant=randomUUID(),username=`mcp-irreversible-${uid}`,password='synthetic-mask-mode-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const request=(method:any,url:string,payload?:any,extra:Record<string,string>={})=>app.inject({method,url,payload,headers:{origin,cookie,...extra}});
 const projectResponse=await request('POST','/api/projects',{name:'合成不可逆模式门禁'});
 assert.equal(projectResponse.statusCode,200,projectResponse.body);
 const project=projectResponse.json().id as string;
 const docResponse=await request('POST',`/api/projects/${project}/documents`,{text:'姓名：张三；电话：13800138000',requestId:randomUUID()});
 assert.equal(docResponse.statusCode,200,docResponse.body);const doc=docResponse.json().id as string;
 for(let i=0;i<8;i++){const state=(await request('GET',`/api/documents/${doc}`)).json().state;if(state==='review')break;await tick();}
 const init=await request('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'synthetic',version:'1'}}});
 assert.equal(init.statusCode,200,init.body);
 const session={'mcp-session-id':String(init.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
 assert.equal((await request('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},session)).statusCode,202);
 let rpc=1;
 async function start(args:Record<string,unknown>){const response=await request('POST','/api/mcp',{jsonrpc:'2.0',id:++rpc,method:'tools/call',params:{name:'start_lawbot_redaction',arguments:{project_id:project,document_ids:[doc],request_id:randomUUID(),...args}}},session);assert.equal(response.statusCode,200,response.body);return response.json().result;}
 async function snapshot(){const [d]=(await admin.query('SELECT revision,document_policy FROM documents WHERE id=$1',[doc])).rows;const [p]=(await admin.query('SELECT preset_policy,preset_revision FROM projects WHERE id=$1',[project])).rows;return {tasks:(await admin.query('SELECT count(*)::int AS n FROM ai_collab_tasks WHERE project_id=$1',[project])).rows[0].n,jobs:(await admin.query('SELECT count(*)::int AS n FROM jobs WHERE document_id=$1',[doc])).rows[0].n,document:d,project:p};}
 async function rejected(args:Record<string,unknown>,code:string){const before=await snapshot(),result=await start(args);assert.equal(result.isError,true,JSON.stringify(result));assert.equal(result.structuredContent?.error,code,JSON.stringify(result));assert.deepEqual(await snapshot(),before,`rejected ${code} must leave task, job, document and project unchanged`);}
 // The source defaults to ai_process_restore. The actual system profile defaults to default_star.
 await rejected({},'IRREVERSIBLE_MASK');
 for(const masking_mode of ['default_mask','full_star','purple_overlay'])await rejected({masking_mode},'IRREVERSIBLE_MASK');
 await rejected({masking_mode:'pseudonym',advanced:{exportMode:'default_star'}},'IRREVERSIBLE_MASK');
 await rejected({masking_mode:'pseudonym',advanced:{pseudonymRules:[{entityType:'phone',action:'mask'}]}},'PARTIALLY_IRREVERSIBLE_MASK');
 await rejected({masking_mode:'pseudonym',file_settings:[{source_path:`document:${doc}`,masking_mode:'default_mask'}]},'IRREVERSIBLE_MASK');
 await rejected({masking_mode:'pseudonym',file_settings:[{source_path:`document:${doc}`,advanced:{pseudonymRules:[{entityType:'phone',action:'mask'}]}}]},'PARTIALLY_IRREVERSIBLE_MASK');
 const base=(await request('GET','/api/presets/profiles/system_default')).json().settings;
 const aliasProfileResponse=await request('POST','/api/presets/profiles',{name:'可还原合成方案',profile:{...base,markdown:{...base.markdown,defaultMode:'custom_pseudonym'},batch:{...base.batch,markdownDefaultMode:'custom_pseudonym'}}});
 assert.equal(aliasProfileResponse.statusCode,200,aliasProfileResponse.body);
 const aliasProfile=aliasProfileResponse.json().settings.id as string;
 const selectiveProfileResponse=await request('POST','/api/presets/profiles',{name:'不可还原混合方案',profile:{...base,pseudonymTypeActions:{phone:'mask'},markdown:{...base.markdown,defaultMode:'selective_pseudonym'},batch:{...base.batch,markdownDefaultMode:'selective_pseudonym'}}});
 assert.equal(selectiveProfileResponse.statusCode,200,selectiveProfileResponse.body);
 await rejected({advanced:{profile:selectiveProfileResponse.json().settings.id}},'PARTIALLY_IRREVERSIBLE_MASK');
 const familyProfileResponse=await request('POST','/api/presets/profiles',{name:'护照扩展不可还原',profile:{...base,pseudonymTypeActions:{passport_no:'mask'},markdown:{...base.markdown,defaultMode:'selective_pseudonym'},batch:{...base.batch,markdownDefaultMode:'selective_pseudonym'}}});
 assert.equal(familyProfileResponse.statusCode,200,familyProfileResponse.body);
 assert.ok(base.enabledEntityTypeIds.includes('id_card')&&!base.enabledEntityTypeIds.includes('passport_no'));
 await rejected({advanced:{profile:familyProfileResponse.json().settings.id}},'PARTIALLY_IRREVERSIBLE_MASK');
 await rejected({advanced:{profile:'system_default'}},'IRREVERSIBLE_MASK');
 // A project policy is the effective profile when no explicit masking/export mode is supplied.
 const project2Response=await request('POST','/api/projects',{name:'合成项目默认假名方案'});
 assert.equal(project2Response.statusCode,200,project2Response.body);const project2=project2Response.json().id as string;
 const project2Policy=(await request('GET',`/api/projects/${project2}/presets`)).json();
 const appliedPolicy=await request('PUT',`/api/projects/${project2}/presets`,{revision:project2Policy.revision,profileId:aliasProfile,profileRevision:1,rulesetId:null});
 assert.equal(appliedPolicy.statusCode,200,appliedPolicy.body);
 const project2DocResponse=await request('POST',`/api/projects/${project2}/documents`,{text:'电话：13700137000',requestId:randomUUID()});
 assert.equal(project2DocResponse.statusCode,200,project2DocResponse.body);const project2Doc=project2DocResponse.json().id as string;
 await tick();
 const projectDefaultAlias=await start({project_id:project2,document_ids:[project2Doc]});
 assert.equal(projectDefaultAlias.isError,false,JSON.stringify(projectDefaultAlias));
 const perFileAlias=await start({file_settings:[{source_path:`document:${doc}`,advanced:{profile:aliasProfile}}]});
 assert.equal(perFileAlias.isError,false,JSON.stringify(perFileAlias));
 const selected=await start({advanced:{profile:aliasProfile}});
 assert.equal(selected.isError,false,JSON.stringify(selected));
 const selectedTask=(await request('GET',`/api/ai-collab/tasks/${selected.structuredContent.jobId}`)).json();
 const authorized=await request('POST',`/api/ai-collab/tasks/${selected.structuredContent.jobId}/authorize`,{revision:selectedTask.revision,authorization:consent});
 assert.equal(authorized.statusCode,200,authorized.body);
 const configuration=(await request('GET',`/api/documents/${doc}/configuration`)).json().configuration;
 assert.equal(configuration.exportMode,undefined,'profile default mode remains selected');
 // A reversible explicit override is legal even when system default is star.
 const explicit=await start({masking_mode:'pseudonym',advanced:{exportMode:'custom_pseudonym'}});
 assert.equal(explicit.isError,false,JSON.stringify(explicit));
 const aliasRuleOverride=await start({masking_mode:'default_mask',advanced:{pseudonymRules:[{entityType:'phone',action:'pseudonym'}]}});
 assert.equal(aliasRuleOverride.isError,false,JSON.stringify(aliasRuleOverride));
 // A file mask overrides a global pseudonym export mode, as in source optionsForSource.
 const doc2Response=await request('POST',`/api/projects/${project}/documents`,{text:'电话：13900139000',requestId:randomUUID()});
 assert.equal(doc2Response.statusCode,200,doc2Response.body);const doc2=doc2Response.json().id as string;
 for(let i=0;i<6;i++){await tick();const current=await request('GET',`/api/documents/${doc2}`);if(current.json().state==='review')break;}
 const perFile=await start({task_mode:'redact_only',document_ids:[doc2],masking_mode:'pseudonym',advanced:{exportMode:'custom_pseudonym'},file_settings:[{source_path:`document:${doc2}`,masking_mode:'default_mask'}]});
 assert.equal(perFile.isError,false,JSON.stringify(perFile));
 const perTask=(await request('GET',`/api/ai-collab/tasks/${perFile.structuredContent.jobId}`)).json();
 const perAuthorization=await request('POST',`/api/ai-collab/tasks/${perFile.structuredContent.jobId}/authorize`,{revision:perTask.revision,authorization:consent});
 assert.equal(perAuthorization.statusCode,200,perAuthorization.body);
 assert.equal((await request('GET',`/api/documents/${doc2}/configuration`)).json().configuration.exportMode,'default_star');
 // Mask modes remain legal for tasks that promise no restoration.
 for(const task_mode of ['redact_only','ai_process'])for(const masking_mode of ['default_mask','full_star','purple_overlay']){
  const allowed=await start({task_mode,masking_mode});assert.equal(allowed.isError,false,JSON.stringify(allowed));
 }
});

test('restore promise rejects a later manual non-alias review at prepare and release',async()=>{
 const uid=randomUUID(),tenant=randomUUID(),username=`mcp-review-mask-${uid}`,password='synthetic-review-mask-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const request=(method:any,url:string,payload?:any,extra:Record<string,string>={})=>app.inject({method,url,payload,headers:{origin,cookie,...extra}});
 const project=(await request('POST','/api/projects',{name:'合成复核后局部不可逆'})).json().id as string;
 const uploaded=await request('POST',`/api/projects/${project}/documents`,{text:'邮箱：restore@example.com；手机：13800138000',requestId:randomUUID()});
 assert.equal(uploaded.statusCode,200,uploaded.body);const doc=uploaded.json().id as string;
 for(let i=0;i<8;i++){const state=(await request('GET',`/api/documents/${doc}`)).json().state;if(state==='review')break;await tick();}
 const init=await request('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'synthetic-review',version:'1'}}});
 assert.equal(init.statusCode,200,init.body);
 const session={'mcp-session-id':String(init.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
 assert.equal((await request('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},session)).statusCode,202);
 const started=await request('POST','/api/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'start_lawbot_redaction',arguments:{project_id:project,document_ids:[doc],masking_mode:'pseudonym',task_mode:'ai_process_restore',request_id:randomUUID()}}},session);
 assert.equal(started.statusCode,200,started.body);assert.equal(started.json().result.isError,false,started.body);
 const job=started.json().result.structuredContent.jobId as string;
 let task=(await request('GET',`/api/ai-collab/tasks/${job}`)).json();
 const authorize=await request('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:task.revision,authorization:{...consent,allowRestorePath:true,allowSanitizedDelivery:true}});
 assert.equal(authorize.statusCode,200,authorize.body);
 await tick();
 let current=(await request('GET',`/api/documents/${doc}`)).json();
 assert.equal(current.state,'review');assert.ok(current.marks.length>=2,current.marks);
 assert.ok(current.marks.every((m:any)=>m.replacement?.mode==='alias'));
 const originalAlias=current.marks[0].replacement;
 const mixed=(await request('PUT',`/api/documents/${doc}/review`,{revision:current.revision,marks:current.marks.map((m:any,i:number)=>({...m,decision:'redact',...(i===0?{replacement:{mode:'full'}}:{})}))}));
 assert.equal(mixed.statusCode,200,mixed.body);
 task=(await request('GET',`/api/ai-collab/tasks/${job}`)).json();
 const jobsBefore=(await admin.query('SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND collab_task_id IS NOT NULL',[doc])).rows[0].n;
 const blockedPrepare=await request('POST',`/api/ai-collab/tasks/${job}/prepare-export`,{revision:task.revision});
 assert.equal(blockedPrepare.statusCode,409,blockedPrepare.body);assert.equal(blockedPrepare.json().error,'PARTIALLY_IRREVERSIBLE_MASK');
 const afterBlockedPrepare=(await request('GET',`/api/ai-collab/tasks/${job}`)).json();
 assert.equal(afterBlockedPrepare.revision,task.revision+1,'binding the actual human review receipt advances the automatic task');
 assert.equal(afterBlockedPrepare.state,'waiting_for_human_review');
 assert.equal(afterBlockedPrepare.executionMode,'automatic');
 assert.equal(afterBlockedPrepare.sources[0].revision,mixed.json().revision);
 assert.equal(afterBlockedPrepare.reviewResolutions.length,1);
 assert.deepEqual(afterBlockedPrepare.reviewResolutions[0],{
  documentId:doc,fromRevision:task.sources[0].revision,toRevision:mixed.json().revision,
  snapshotRevision:mixed.json().revision,sourceHash:task.sources[0].hash,
  policyVersion:'human-review',decisionOrigin:'human_review'
 });
 task=afterBlockedPrepare;
 assert.equal((await admin.query('SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND collab_task_id IS NOT NULL',[doc])).rows[0].n,jobsBefore);
 const blockedAgain=await request('POST',`/api/ai-collab/tasks/${job}/prepare-export`,{revision:task.revision});
 assert.equal(blockedAgain.statusCode,409,blockedAgain.body);assert.equal(blockedAgain.json().error,'PARTIALLY_IRREVERSIBLE_MASK');
 const afterBlockedAgain=(await request('GET',`/api/ai-collab/tasks/${job}`)).json();
 assert.equal(afterBlockedAgain.revision,task.revision);
 assert.deepEqual(afterBlockedAgain.reviewResolutions,task.reviewResolutions);
 assert.equal(afterBlockedAgain.state,'waiting_for_human_review');
 assert.equal((await admin.query('SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND collab_task_id IS NOT NULL',[doc])).rows[0].n,jobsBefore);
 current=(await request('GET',`/api/documents/${doc}`)).json();
 const aliases=await request('PUT',`/api/documents/${doc}/review`,{revision:current.revision,marks:current.marks.map((m:any,i:number)=>({...m,decision:'redact',replacement:i===0?originalAlias:m.replacement}))});
 assert.equal(aliases.statusCode,200,aliases.body);
 // Restore the first alias from the prior detector snapshot, not its manually masked state.
 const clean=(await request('GET',`/api/documents/${doc}`)).json();
 assert.ok(clean.marks.every((m:any)=>m.replacement?.mode==='alias'));
 const taskId=taskUUID(job),aad=`${tenant}:${uid}:ai-collab:${taskId}`;
 const originalPayload=(await admin.query('SELECT payload FROM ai_collab_tasks WHERE id=$1',[taskId])).rows[0].payload as string;
 async function rejectedAlteredTask(alter:(value:any)=>void,code:string){
  const value=JSON.parse(unseal(originalPayload,aad));alter(value);
  await admin.query('UPDATE ai_collab_tasks SET payload=$2 WHERE id=$1',[taskId,seal(JSON.stringify(value),aad)]);
  try{
   const denied=await request('POST',`/api/ai-collab/tasks/${job}/prepare-export`,{revision:task.revision});
   assert.equal(denied.statusCode,409,denied.body);assert.equal(denied.json().error,code);
   assert.equal((await admin.query('SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND collab_task_id IS NOT NULL',[doc])).rows[0].n,jobsBefore);
  }finally{await admin.query('UPDATE ai_collab_tasks SET payload=$2 WHERE id=$1',[taskId,originalPayload]);}
 }
 await rejectedAlteredTask(value=>{value.reviewResolutions[0].fromRevision=0;},'HUMAN_INTERVENTION_SNAPSHOT_MISMATCH');
 await rejectedAlteredTask(value=>{value.reviewResolutions[0].sourceHash='f'.repeat(64);},'RECOGNITION_INCOMPLETE');
 const [foreignJob]=(await admin.query('SELECT id FROM jobs WHERE collab_task_id IS NOT NULL AND collab_task_id<>$1 AND kind=$2 LIMIT 1',[taskId,'detect'])).rows;
 assert.ok(foreignJob,'another task detect job exists from the independent preceding case');
 await rejectedAlteredTask(value=>{value.recognitionJobIds[0]=foreignJob.id;},'RECOGNITION_INCOMPLETE');
 const originalSourceHash=(await admin.query('SELECT source_hash FROM documents WHERE id=$1',[doc])).rows[0].source_hash as string;
 await admin.query('UPDATE documents SET source_hash=$2 WHERE id=$1',[doc,'f'.repeat(64)]);
 try{
  const changedSource=await request('POST',`/api/ai-collab/tasks/${job}/prepare-export`,{revision:task.revision});
  assert.equal(changedSource.statusCode,409,changedSource.body);assert.equal(changedSource.json().error,'SOURCE_MISMATCH');
 }finally{await admin.query('UPDATE documents SET source_hash=$2 WHERE id=$1',[doc,originalSourceHash]);}
 await admin.query('UPDATE review_snapshots SET review_mode=$3 WHERE document_id=$1 AND revision=$2',[doc,clean.revision,'legacy']);
 try{
  const unreviewed=await request('POST',`/api/ai-collab/tasks/${job}/prepare-export`,{revision:task.revision});
  assert.equal(unreviewed.statusCode,409,unreviewed.body);assert.equal(unreviewed.json().error,'HUMAN_INTERVENTION_SNAPSHOT_MISMATCH');
 }finally{await admin.query('UPDATE review_snapshots SET review_mode=$3 WHERE document_id=$1 AND revision=$2',[doc,clean.revision,'human_review']);}
 assert.equal((await request('GET',`/api/ai-collab/tasks/${job}`)).json().revision,task.revision);
 assert.equal((await admin.query('SELECT count(*)::int n FROM jobs WHERE document_id=$1 AND collab_task_id IS NOT NULL',[doc])).rows[0].n,jobsBefore);
 const prepared=await request('POST',`/api/ai-collab/tasks/${job}/prepare-export`,{revision:task.revision});
 assert.equal(prepared.statusCode,200,prepared.body);await tick();
 task=(await request('GET',`/api/ai-collab/tasks/${job}`)).json();
 const beforeRelease=(await request('GET',`/api/documents/${doc}`)).json();
 const maskedAgain=await request('PUT',`/api/documents/${doc}/review`,{revision:beforeRelease.revision,marks:beforeRelease.marks.map((m:any,i:number)=>({...m,decision:'redact',...(i===0?{replacement:{mode:'full'}}:{})}))});
 assert.equal(maskedAgain.statusCode,200,maskedAgain.body);
 const blockedRelease=await request('POST',`/api/ai-collab/tasks/${job}/release-export`,{revision:task.revision});
 assert.equal(blockedRelease.statusCode,409,blockedRelease.body);assert.equal(blockedRelease.json().error,'PARTIALLY_IRREVERSIBLE_MASK');
 assert.equal((await request('GET',`/api/ai-collab/tasks/${job}`)).json().revision,task.revision);
});
