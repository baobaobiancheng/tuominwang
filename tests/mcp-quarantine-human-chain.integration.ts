import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {hash,passwordHash,seal,unseal} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';
import {tick} from '../apps/worker/main.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});

test('automatic task quarantine recovers a later real human review only through its owned detect receipt',async()=>{
 const origin=process.env.APP_ORIGIN!,uid=randomUUID(),tenant=randomUUID(),username=`quarantine-human-${uid}`,password='synthetic-quarantine-human';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,extra:Record<string,string>={})=>app.inject({method,url,payload,headers:{origin,cookie,...extra}});
 const projectResponse=await req('POST','/api/projects',{name:'合成人审来源恢复'});assert.equal(projectResponse.statusCode,200,projectResponse.body);
 const project=projectResponse.json().id as string;
 const uploaded=await req('POST',`/api/projects/${project}/documents`,{text:'邮箱：archive-human@example.com',requestId:randomUUID()});assert.equal(uploaded.statusCode,200,uploaded.body);
 const doc=uploaded.json().id as string;
 for(let i=0;i<8;i++){if((await req('GET',`/api/documents/${doc}`)).json().state==='review')break;await tick();}
 const init=await req('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'quarantine-human',version:'1'}}});assert.equal(init.statusCode,200,init.body);
 const session={'mcp-session-id':String(init.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
 assert.equal((await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},session)).statusCode,202);
 const started=await req('POST','/api/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'start_lawbot_redaction',arguments:{project_id:project,document_ids:[doc],masking_mode:'pseudonym',task_mode:'ai_process',output_formats:['original','md'],request_id:randomUUID()}}},session);
 assert.equal(started.statusCode,200,started.body);assert.equal(started.json().result.isError,false,started.body);
 const job=started.json().result.structuredContent.jobId as string,taskId=taskUUID(job);
 let task=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();
 const authorized=await req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:task.revision,authorization:{allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false}});assert.equal(authorized.statusCode,200,authorized.body);
 await tick();const detected=(await req('GET',`/api/documents/${doc}`)).json();assert.equal(detected.state,'review');assert.ok(detected.marks.length);
 const human=await req('PUT',`/api/documents/${doc}/review`,{revision:detected.revision,marks:detected.marks.map((mark:any)=>({...mark,decision:'redact'}))});assert.equal(human.statusCode,200,human.body);
 task=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();const prepared=await req('POST',`/api/ai-collab/tasks/${job}/prepare-export`,{revision:task.revision});assert.equal(prepared.statusCode,200,prepared.body);
 await tick();const released=await req('POST',`/api/ai-collab/tasks/${job}/release-export`,{revision:prepared.json().revision});assert.equal(released.statusCode,200,released.body);
 task=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();assert.equal(task.executionMode,'automatic');assert.equal(task.reviewResolutions.at(-1).decisionOrigin,'human_review');assert.equal(task.sources[0].revision,human.json().revision);
 const detectJob=task.recognitionJobIds[0] as string;const originalJobRevision=(await admin.query('SELECT revision FROM jobs WHERE id=$1',[detectJob])).rows[0].revision as number;
 assert.equal(task.reviewResolutions.at(-1).fromRevision,originalJobRevision);
 assert.equal(task.reviewResolutions.at(-1).toRevision,task.sources[0].revision);
 const corrupted=`corrupt:automatic-human:${randomUUID()}`;await admin.query('UPDATE ai_collab_tasks SET payload=$2 WHERE id=$1',[taskId,corrupted]);
 const issue=(await req('GET','/api/ai-collab/tasks')).json().issues.find((value:any)=>value.jobId===job);assert.ok(issue);
 const isolated=await req('POST',`/api/ai-collab/tasks/${job}/quarantine`,{revision:issue.revision,payloadSha256:issue.payloadSha256,requestId:randomUUID(),confirm:true});assert.equal(isolated.statusCode,200,isolated.body);
 const receiptId=isolated.json().receiptId as string;
 const detail=()=>req('GET',`/api/ai-collab/quarantine/${receiptId}`);
 const baseline=await detail();assert.equal(baseline.statusCode,200,baseline.body);assert.equal(baseline.json().recoveryAvailable,true,'the signed human receipt must resolve to the original owned detect revision');
 await admin.query('UPDATE review_snapshots SET review_mode=$3 WHERE document_id=$1 AND revision=$2',[doc,task.sources[0].revision,'legacy']);
 try{assert.equal((await detail()).json().recoveryAvailable,false,'an unreviewed replacement cannot stand in for the human snapshot');}
 finally{await admin.query('UPDATE review_snapshots SET review_mode=$3 WHERE document_id=$1 AND revision=$2',[doc,task.sources[0].revision,'human_review']);}
 await admin.query('UPDATE jobs SET revision=revision+1 WHERE id=$1',[detectJob]);
 try{assert.equal((await detail()).json().recoveryAvailable,false,'the detect job must keep the exact original revision');}
 finally{await admin.query('UPDATE jobs SET revision=$2 WHERE id=$1',[detectJob,originalJobRevision]);}
 const snapshot=(await admin.query('SELECT payload_ciphertext,payload_sha256 FROM ai_collab_task_snapshot WHERE task_id=$1 AND revision=$2',[taskId,task.revision])).rows[0];
 const aad=`${tenant}:${uid}:ai-collab:${taskId}`;
 async function alteredSnapshot(alter:(value:any)=>void,reason:string){
  const value=JSON.parse(unseal(snapshot.payload_ciphertext,aad));alter(value);
  const ciphertext=seal(JSON.stringify(value),aad);
  await admin.query('UPDATE ai_collab_task_snapshot SET payload_ciphertext=$3,payload_sha256=$4 WHERE task_id=$1 AND revision=$2',[taskId,task.revision,ciphertext,hash(ciphertext)]);
  try{assert.equal((await detail()).json().recoveryAvailable,false,reason);}
  finally{await admin.query('UPDATE ai_collab_task_snapshot SET payload_ciphertext=$3,payload_sha256=$4 WHERE task_id=$1 AND revision=$2',[taskId,task.revision,snapshot.payload_ciphertext,snapshot.payload_sha256]);}
 }
 await alteredSnapshot(value=>{value.reviewResolutions[0].fromRevision=0;},'a broken signed human receipt must not borrow a detection');
 const foreignDocResponse=await req('POST',`/api/projects/${project}/documents`,{text:'邮箱：other-task@example.com',requestId:randomUUID()});assert.equal(foreignDocResponse.statusCode,200,foreignDocResponse.body);
 const foreignDoc=foreignDocResponse.json().id as string;
 for(let i=0;i<8;i++){if((await req('GET',`/api/documents/${foreignDoc}`)).json().state==='review')break;await tick();}
 const foreignStart=await req('POST','/api/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'start_lawbot_redaction',arguments:{project_id:project,document_ids:[foreignDoc],task_mode:'ai_process',request_id:randomUUID()}}},session);
 assert.equal(foreignStart.statusCode,200,foreignStart.body);assert.equal(foreignStart.json().result.isError,false,foreignStart.body);
 const foreignJob=foreignStart.json().result.structuredContent.jobId as string;
 const foreignTask=(await req('GET',`/api/ai-collab/tasks/${foreignJob}`)).json();
 const foreignAuthorized=await req('POST',`/api/ai-collab/tasks/${foreignJob}/authorize`,{revision:foreignTask.revision,authorization:{allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false}});
 assert.equal(foreignAuthorized.statusCode,200,foreignAuthorized.body);
 const foreignDetection=(await req('GET',`/api/ai-collab/tasks/${foreignJob}`)).json().recognitionJobIds[0] as string;
 await alteredSnapshot(value=>{value.recognitionJobIds[0]=foreignDetection;},'another task detect job cannot authorize recovery');
 const sourceRow=(await admin.query('SELECT revision,source_hash FROM documents WHERE id=$1',[doc])).rows[0];
 await admin.query('UPDATE documents SET source_hash=$2 WHERE id=$1',[doc,'f'.repeat(64)]);
 try{assert.equal((await detail()).json().recoveryAvailable,false,'changed source bytes cannot authorize recovery');}
 finally{await admin.query('UPDATE documents SET source_hash=$2 WHERE id=$1',[doc,sourceRow.source_hash]);}
 await admin.query('UPDATE documents SET revision=$2 WHERE id=$1',[doc,task.sources[0].revision-1]);
 try{assert.equal((await detail()).json().recoveryAvailable,false,'document revision cannot precede the delivered review');}
 finally{await admin.query('UPDATE documents SET revision=$2 WHERE id=$1',[doc,sourceRow.revision]);}
 assert.equal((await detail()).json().recoveryAvailable,true);
 const recovered=await req('POST',`/api/ai-collab/quarantine/${receiptId}/recover`,{revision:task.revision,snapshotSha256:baseline.json().snapshotSha256,requestId:randomUUID(),confirm:true});assert.equal(recovered.statusCode,200,recovered.body);
 assert.equal(recovered.json().revision,task.revision+1);
});
