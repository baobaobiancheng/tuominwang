import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve,sep} from 'node:path';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {registerMcpRoutes} from '../apps/api/mcp.ts';
import {applyDocumentConfiguration} from '../apps/api/document-policy.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';
import {readZip} from '../packages/core/office-zip.ts';

test('real MCP task diagnostic ZIP is owner scoped, source free and leaves task CAS untouched',{timeout:60_000},async()=>{
 const dbName=new URL(process.env.DATABASE_URL??'').pathname;
 assert.match(decodeURIComponent(dbName),/^\/tmw_test_[a-z0-9_]+$/u);
 assert.equal(dbName,new URL(process.env.MIGRATION_DATABASE_URL??'').pathname);
 assert.ok(resolve(process.env.DATA_DIR??'').startsWith(resolve('.data/test-runs')+sep));
 const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
 const app=await buildApp();if(!app.hasRoute({method:'POST',url:'/api/mcp'}))registerMcpRoutes(app,applyDocumentConfiguration);
 try{
  const origin=process.env.APP_ORIGIN!,tenant=randomUUID(),password='synthetic-ai-diagnostic-password';
  async function account(tenantId=tenant){
   const user=randomUUID(),username='diagnostic-'+user;
   await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenantId,username,passwordHash(password)]);
   const logged=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
   assert.equal(logged.statusCode,200,logged.body);
   const cookie=String(logged.headers['set-cookie']).split(';')[0];
   return {user,request:async(method:string,url:string,payload?:unknown,extra?:Record<string,string>)=>await app.inject({method:method as any,url,headers:{origin,cookie,...extra},payload:payload as any})};
  }
  const owner=await account(),other=await account(),cross=await account(randomUUID());
  const projectResponse=await owner.request('POST','/api/projects',{name:'合成诊断项目'});
  assert.equal(projectResponse.statusCode,200,projectResponse.body);const project=projectResponse.json().id;
  const init=await owner.request('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'dsh',version:'1.0'}}});
  assert.equal(init.statusCode,200,init.body);const headers={'mcp-session-id':String(init.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
  assert.equal((await owner.request('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers)).statusCode,202);
  const start=await owner.request('POST','/api/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'start_lawbot_redaction',arguments:{project_id:project,request_id:randomUUID()}}},headers);
  assert.equal(start.statusCode,200,start.body);const job=start.json().result.structuredContent.jobId as string;
  assert.match(job,/^lbj_[a-f0-9]{32}$/u);
  // The polling tool must leave its start record before a real long wait
  // returns. Its external status must be recorded as waiting, not succeeded.
  let waitSettled=false;
  const waitRequest=owner.request('POST','/api/mcp',{jsonrpc:'2.0',id:13,method:'tools/call',params:{name:'check_document_delivery',arguments:{job_id:job,wait_seconds:3}}},headers).finally(()=>{waitSettled=true;});
  let started=false;
  for(let attempt=0;attempt<40;attempt++){
   const row=await admin.query("SELECT 1 FROM ai_collab_diagnostic_events WHERE task_id=$1 AND payload->>'tool'='check_document_delivery' AND payload->>'outcome'='started' LIMIT 1",[taskUUID(job)]);
   if(row.rowCount){started=true;break;}
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(started,true,'poll start must persist before the wait settles');
  assert.equal(waitSettled,false,'start record must precede the held business call');
  const waited=await waitRequest;
  assert.equal(waited.statusCode,200,waited.body);
  assert.equal(waited.json().result.structuredContent.status,'waiting_for_session_authorization');
  const waitingRow=await admin.query("SELECT 1 FROM ai_collab_diagnostic_events WHERE task_id=$1 AND payload->>'tool'='check_document_delivery' AND payload->>'outcome'='waiting' AND payload->>'state'='waiting_for_session_authorization' LIMIT 1",[taskUUID(job)]);
  assert.equal(waitingRow.rowCount,1,'externalTask.status must classify the wait outcome');
  const before=(await owner.request('GET',`/api/ai-collab/tasks/${job}`)).json();assert.equal(before.revision,1);
  assert.equal((await owner.request('GET',`/api/ai-collab/tasks/${job}/diagnostics`)).statusCode,404);
  const failed=await owner.request('POST','/api/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'receive_sanitized_document',arguments:{job_id:job}}},headers);
  assert.equal(failed.statusCode,200,failed.body);assert.equal(failed.json().result.isError,true);
  const after=(await owner.request('GET',`/api/ai-collab/tasks/${job}`)).json();assert.equal(after.revision,1,'diagnostics must not advance task CAS');
  const download=await owner.request('GET',`/api/ai-collab/tasks/${job}/diagnostics`);
  assert.equal(download.statusCode,200,download.body);assert.match(String(download.headers['content-type']),/application\/zip/u);
  const files=await readZip(download.rawPayload);assert.deepEqual([...files.keys()].sort(),['协作过程.jsonl','环境信息.json','问题摘要.txt'].sort());
  const text=[...files.values()].map(x=>x.toString()).join('\n');
  assert.match(text,/check_document_delivery|receive_sanitized_document/u);assert.match(text,/INTERNAL_ERROR|INVALID_STATE/u);
  assert.doesNotMatch(text,/synthetic-ai-diagnostic-password|合成诊断项目|\/Users\/|source_path/u);
  assert.equal((await other.request('GET',`/api/ai-collab/tasks/${job}/diagnostics`)).statusCode,404);
  assert.equal((await cross.request('GET',`/api/ai-collab/tasks/${job}/diagnostics`)).statusCode,404);
  const rows=(await admin.query('SELECT payload FROM ai_collab_diagnostic_events WHERE task_id=$1 ORDER BY id',[taskUUID(job)])).rows;
  assert.ok(rows.length>=2);assert.ok(rows.every(row=>!JSON.stringify(row).includes(password)));
  // A fresh task of another owner proves the SECURITY DEFINER insertion trigger
  // expires dormant owners' diagnostic rows across RLS scopes.
  const otherProjectResponse=await other.request('POST','/api/projects',{name:'另一个合成诊断项目'});
  assert.equal(otherProjectResponse.statusCode,200,otherProjectResponse.body);
  const otherInit=await other.request('POST','/api/mcp',{jsonrpc:'2.0',id:11,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'dsh',version:'1.0'}}});
  assert.equal(otherInit.statusCode,200,otherInit.body);
  const otherHeaders={'mcp-session-id':String(otherInit.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
  assert.equal((await other.request('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},otherHeaders)).statusCode,202);
  const otherStart=await other.request('POST','/api/mcp',{jsonrpc:'2.0',id:12,method:'tools/call',params:{name:'start_lawbot_redaction',arguments:{project_id:otherProjectResponse.json().id,request_id:randomUUID()}}},otherHeaders);
  assert.equal(otherStart.statusCode,200,otherStart.body);
  const otherJob=otherStart.json().result.structuredContent.jobId as string;
  const aged=await admin.query("UPDATE ai_collab_diagnostic_events SET created_at=now()-interval '31 days' WHERE task_id=$1 RETURNING id",[taskUUID(otherJob)]);
  assert.ok(aged.rowCount&&aged.rowCount>0);
  const ownerNext=await owner.request('POST','/api/mcp',{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'receive_sanitized_document',arguments:{job_id:job}}},headers);
  assert.equal(ownerNext.statusCode,200,ownerNext.body);
  assert.equal(Number((await admin.query('SELECT count(*)::integer AS n FROM ai_collab_diagnostic_events WHERE task_id=$1',[taskUUID(otherJob)])).rows[0].n),0);
 }finally{await app.close();await pool.end();await admin.end();}
});
