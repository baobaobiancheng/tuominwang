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
import {hash,passwordHash} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';

function requireIsolation(){
 const app=new URL(process.env.DATABASE_URL??''),migration=new URL(process.env.MIGRATION_DATABASE_URL??'');
 assert.match(decodeURIComponent(app.pathname),/^\/tmw_test_[a-z0-9_]+$/);
 assert.equal(app.pathname,migration.pathname);assert.equal(app.hostname,migration.hostname);assert.equal(app.port,migration.port);
 assert.ok(resolve(process.env.DATA_DIR??'').startsWith(resolve('.data/test-runs')+sep));
}
requireIsolation();

test('review revocation after committed preflight cannot mutate invalid UTF-8 AI result', {timeout:180_000}, async()=>{
 const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
 let app:Awaited<ReturnType<typeof buildApp>>|undefined;
 try{
  assert.match((await admin.query('SELECT current_database() AS name')).rows[0].name,/^tmw_test_/);
  app=await buildApp();if(!app.hasRoute({method:'POST',url:'/api/mcp'}))registerMcpRoutes(app,applyDocumentConfiguration);
  const tenant=randomUUID(),origin=process.env.APP_ORIGIN!,password='synthetic-revoke-race-password';
  async function account(){const uid=randomUUID(),username='race-'+uid;await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
   const login=await app!.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
   const cookie=String(login.headers['set-cookie']).split(';')[0];let nextRequestAt=0;
   return {uid,request:async(method:any,url:string,payload?:any,extra?:any)=>{const delay=nextRequestAt-Date.now();nextRequestAt=Math.max(nextRequestAt,Date.now())+550;if(delay>0)await new Promise(r=>setTimeout(r,delay));return app!.inject({method,url,headers:{origin,cookie,...extra},payload});}};
  }
  const owner=await account(),member=await account();const req=member.request;
  const p=await owner.request('POST','/api/projects',{name:'合成撤权事务竞态'});assert.equal(p.statusCode,200,p.body);const project=p.json().id;
  const d=await owner.request('POST',`/api/projects/${project}/documents`,{text:'邮箱：race@example.com；手机号：13800138000',requestId:randomUUID()});assert.equal(d.statusCode,200,d.body);const doc=d.json().id;await tick();
  const grant=await owner.request('PUT',`/api/projects/${project}/members/${member.uid}`,{revision:null,permissions:['view_original','review','export','view_mapping']});assert.equal(grant.statusCode,200,grant.body);
  let rpcId=0;const init=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++rpcId,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'revoke-race',version:'1'}}});assert.equal(init.statusCode,200,init.body);
  const headers={'mcp-session-id':String(init.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};assert.equal((await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers)).statusCode,202);
  async function tool(name:string,args:any={}){const response=await req('POST','/api/mcp',{jsonrpc:'2.0',id:++rpcId,method:'tools/call',params:{name,arguments:args}},headers);assert.equal(response.statusCode,200,response.body);return response.json().result.structuredContent;}
  const started=await tool('start_lawbot_redaction',{project_id:project,document_ids:[doc],output_formats:['original','md'],masking_mode:'pseudonym',task_mode:'ai_process',request_id:randomUUID()});assert.ok(started.jobId,JSON.stringify(started));const job=started.jobId;
  const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};
  let task=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();const authorized=await req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:task.revision,authorization:consent});assert.equal(authorized.statusCode,200,authorized.body);await tick();
  const document=(await req('GET',`/api/documents/${doc}`)).json();assert.equal(document.state,'review');assert.ok(document.marks.length);
  const reviewed=await req('PUT',`/api/documents/${doc}/review`,{revision:document.revision,marks:document.marks.map((m:any)=>({...m,decision:'redact'}))});assert.equal(reviewed.statusCode,200,reviewed.body);
  task=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();const prepared=await req('POST',`/api/ai-collab/tasks/${job}/prepare-export`,{revision:task.revision});assert.equal(prepared.statusCode,200,prepared.body);await tick();
  task=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();const released=await req('POST',`/api/ai-collab/tasks/${job}/release-export`,{revision:task.revision});assert.equal(released.statusCode,200,released.body);
  const received=await tool('receive_sanitized_document',{job_id:job,output_format:'md'});assert.ok(received.slotId,JSON.stringify(received));
  const invalid=Buffer.from([0xff,0xfe,0x61]);const uploaded=await req('PUT',`/api/ai-collab/tasks/${job}/slots/${received.slotId}`,{bytesBase64:invalid.toString('base64')});assert.equal(uploaded.statusCode,200,uploaded.body);
  const frozen=(await req('GET',`/api/ai-collab/tasks/${job}`)).json(),before=(await admin.query('SELECT revision,payload,updated_at FROM ai_collab_tasks WHERE id=$1',[taskUUID(job)])).rows[0];
  let armed=true,seenProject=false,seenReview=false,signal!:()=>void,release!:()=>void;
  const atBarrier=new Promise<void>(r=>signal=r),releasedBarrier=new Promise<void>(r=>release=r),wrapped=new WeakSet<object>();
  pool.on('acquire',(client:any)=>{if(wrapped.has(client))return;wrapped.add(client);const original=client.query.bind(client);
   client.query=(...args:any[])=>{const sql=typeof args[0]==='string'?args[0]:String(args[0]?.text??''),values=Array.isArray(args[1])?args[1]:Array.isArray(args[0]?.values)?args[0].values:[];
    if(armed&&sql.includes('SELECT id FROM projects WHERE id=')&&sql.includes('FOR UPDATE')&&values.includes(project))seenProject=true;
    if(armed&&seenProject&&sql.includes('project_permission')&&values.includes('review'))seenReview=true;
    if(armed&&seenProject&&seenReview&&sql.trim()==='COMMIT'){armed=false;return Promise.resolve(original(...args)).then(async(result:any)=>{signal();console.log('BARRIER committed preflight before revoke');await releasedBarrier;return result;});}
    return original(...args);
   };
  });
  const submission=req('POST','/api/ai-collab/gateway',{method:'submit_pseudonymized_result',params:{jobId:job,roundId:received.roundId,slotId:received.slotId,sha256:hash(invalid),suggestedName:'invalid.md'}},headers);
  try{await Promise.race([atBarrier,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`BARRIER_NOT_REACHED project=${seenProject} review=${seenReview}`)),20_000))]);
   const revoke=await owner.request('PUT',`/api/projects/${project}/members/${member.uid}`,{revision:grant.json().revision,permissions:['view_original','export','view_mapping']});assert.equal(revoke.statusCode,200,revoke.body);console.log('BARRIER review revoked after COMMIT');
  }finally{release();}
  const response=await submission;const after=(await admin.query('SELECT revision,payload,updated_at FROM ai_collab_tasks WHERE id=$1',[taskUUID(job)])).rows[0];
  const archives=(await admin.query('SELECT count(*)::integer AS n FROM ai_result_archives WHERE task_id=$1',[taskUUID(job)])).rows[0].n;
  const fixed=process.env.EXPECT_FIXED==='1';
  assert.equal(response.statusCode,fixed?403:400,response.body);
  if(fixed){assert.deepEqual(after,before,'revoked review cannot change task row or frozen slot');assert.equal(archives,0);}
  else{assert.equal(after.revision,before.revision+1);assert.notEqual(after.payload,before.payload);assert.equal(archives,0);const changed=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();assert.equal(changed.state,'ai_result_rejected');assert.equal(changed.rounds[0].validated,false);}
  console.log(JSON.stringify({fixed,status:response.statusCode,beforeRevision:before.revision,afterRevision:after.revision,frozenState:frozen.state,archives,committedPreflight:true,revokedBeforeCatch:true}));
 }finally{if(app)await app.close();await pool.end();await admin.end();}
});
