import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../packages/core/mcp-tools.ts';

assert.match(new URL(process.env.DATABASE_URL!).pathname,/^\/tmw_test_[a-z0-9_]+$/u);

test('MCP internal route reuse preserves auth while only public requests spend the account limit',{timeout:120_000},async()=>{
 const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
 const app=await buildApp(),origin=process.env.APP_ORIGIN!;
 try{
  const createUser=async(label:string)=>{
   const tenant=randomUUID(),user=randomUUID(),username=`internal-rate-${label}-${user}`,password='synthetic-internal-rate-password';
   await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
   const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
   assert.equal(login.statusCode,200,login.body);
   return {user,tenant,cookie:String(login.headers['set-cookie']).split(';')[0]};
  };
  const a=await createUser('a'),b=await createUser('b');
  const req=(cookie:string,method:any,url:string,payload?:any,extra:Record<string,string>={})=>app.inject({method,url,payload,headers:{origin,cookie,...extra}});
  const remaining=(response:{headers:Record<string,unknown>})=>Number(response.headers['x-ratelimit-remaining']);
  const init=await req(a.cookie,'POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'internal-rate-test',version:'1'}}});
  assert.equal(init.statusCode,200,init.body);
  const mcpHeaders={'mcp-session-id':String(init.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
  assert.equal((await req(a.cookie,'POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},mcpHeaders)).statusCode,202);
  const tool=(name:string,args:Record<string,unknown>={})=>req(a.cookie,'POST','/api/mcp',{jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name,arguments:args}},mcpHeaders);

  const bProfile=await req(b.cookie,'POST','/api/presets/profiles',{name:'other-owner-private-profile'});
  assert.equal(bProfile.statusCode,200,bProfile.body);
  const beforeCatalogue=remaining(await req(a.cookie,'GET','/api/session'));
  const catalogue=await tool('list_lawbot_saved_settings');
  assert.equal(catalogue.statusCode,200,catalogue.body);
  assert.equal(catalogue.json().result.isError,false,catalogue.body);
  assert.equal(remaining(catalogue),beforeCatalogue-1);
  assert.equal(remaining(await req(a.cookie,'GET','/api/session')),beforeCatalogue-2,
   'the two owner-filtered internal catalogue routes must not spend the public account budget');
  assert.equal(catalogue.json().result.structuredContent.profiles.some((p:any)=>p.name==='other-owner-private-profile'),false);
  const wrongOwner=await req(b.cookie,'POST','/api/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'list_lawbot_saved_settings',arguments:{}}},mcpHeaders);
  assert.equal(wrongOwner.statusCode,403,wrongOwner.body);
  const noCookie=await app.inject({method:'POST',url:'/api/mcp',headers:{origin,...mcpHeaders},payload:{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'list_lawbot_saved_settings',arguments:{}}}});
  assert.equal(noCookie.statusCode,401,noCookie.body);

  const beforeConcurrent=remaining(await req(a.cookie,'GET','/api/session'));
  const [catalogueAgain,parallelPublic]=await Promise.all([tool('list_lawbot_saved_settings'),req(a.cookie,'GET','/api/session')]);
  assert.equal(catalogueAgain.statusCode,200,catalogueAgain.body);
  assert.equal(parallelPublic.statusCode,200,parallelPublic.body);
  assert.equal(remaining(await req(a.cookie,'GET','/api/session')),beforeConcurrent-3,
   'parallel external traffic must not inherit the private internal-request scope');

  const projectResponse=await req(a.cookie,'POST','/api/projects',{name:'synthetic internal-rate batch'});
  assert.equal(projectResponse.statusCode,200,projectResponse.body);
  const project=projectResponse.json().id as string,docs:string[]=[];
  for(const phone of ['13800138000','13900139000']){
   const created=await req(a.cookie,'POST',`/api/projects/${project}/documents`,{text:`synthetic phone ${phone}`,requestId:randomUUID()});
   assert.equal(created.statusCode,200,created.body);const documentId=created.json().id as string;docs.push(documentId);
   for(let n=0;n<40;n++){
    const [job]=(await admin.query("SELECT status FROM jobs WHERE document_id=$1 AND kind='detect' AND collab_task_id IS NULL ORDER BY created_at DESC LIMIT 1",[documentId])).rows;
    if(job?.status==='succeeded')break;
    assert.notEqual(job?.status,'failed');await tick();
    if(n===39)throw new Error('INITIAL_DETECTION_NOT_READY');
   }
  }
  const started=await tool('start_lawbot_redaction_for_user_manual_review',{project_id:project,document_ids:docs,masking_mode:'default_mask',task_mode:'ai_process',batch_result_mode:'combined',output_formats:['original','md'],request_id:randomUUID()});
  assert.equal(started.statusCode,200,started.body);assert.equal(started.json().result.isError,false,started.body);
  const parentId=started.json().result.structuredContent.jobId as string;
  let parent=(await req(a.cookie,'GET',`/api/ai-collab/tasks/${parentId}`)).json();
  const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};
  const authorized=await req(a.cookie,'POST',`/api/ai-collab/tasks/${parentId}/authorize`,{revision:parent.revision,authorization:consent});
  assert.equal(authorized.statusCode,200,authorized.body);
  const children=authorized.json().childJobIds as string[];assert.equal(children.length,2);
  for(let n=0;n<80;n++){
   const owned=(await admin.query("SELECT status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind='detect'",[children.map(taskUUID)])).rows;
   if(owned.length===2&&owned.every((job:any)=>job.status==='succeeded'))break;
   assert.equal(owned.some((job:any)=>job.status==='failed'),false);await tick();
   if(n===79)throw new Error('OWNED_DETECTION_NOT_READY');
  }
  for(const documentId of docs){
   const view=await req(a.cookie,'GET',`/api/documents/${documentId}`);assert.equal(view.statusCode,200,view.body);
   const d=view.json();assert.equal(d.state,'review');assert.ok(d.marks.length>0);
   const saved=await req(a.cookie,'PUT',`/api/documents/${documentId}/review`,{revision:d.revision,marks:d.marks.map((mark:any)=>({...mark,decision:'redact'}))});
   assert.equal(saved.statusCode,200,saved.body);
  }
  parent=(await req(a.cookie,'GET',`/api/ai-collab/tasks/${parentId}`)).json();
  const beforePrepare=remaining(await req(a.cookie,'GET','/api/session'));
  const prepared=await req(a.cookie,'POST',`/api/ai-collab/tasks/${parentId}/prepare-export`,{revision:parent.revision});
  assert.equal(prepared.statusCode,200,prepared.body);assert.equal(prepared.json().state,'building_sanitized_artifact');
  assert.equal(remaining(prepared),beforePrepare-1);
  assert.equal(remaining(await req(a.cookie,'GET','/api/session')),beforePrepare-2,
   'two internal document reads must not spend public account slots');
  for(let n=0;n<80;n++){
   const jobs=(await admin.query("SELECT status FROM jobs WHERE collab_task_id = ANY($1::uuid[]) AND kind='export'",[children.map(taskUUID)])).rows;
   if(jobs.length===2&&jobs.every((job:any)=>job.status==='succeeded'))break;
   assert.equal(jobs.some((job:any)=>job.status==='failed'),false);await tick();
   if(n===79)throw new Error('OWNED_EXPORT_NOT_READY');
  }
  parent=(await req(a.cookie,'GET',`/api/ai-collab/tasks/${parentId}`)).json();
  const beforeRelease=remaining(await req(a.cookie,'GET','/api/session'));
  const released=await req(a.cookie,'POST',`/api/ai-collab/tasks/${parentId}/release-export`,{revision:parent.revision});
  assert.equal(released.statusCode,200,released.body);
  assert.equal(released.json().state,'waiting_for_task_selection');
  assert.ok(released.json().deliveries.length>=2);
  assert.equal(remaining(released),beforeRelease-1);
  assert.equal(remaining(await req(a.cookie,'GET','/api/session')),beforeRelease-2,
   'document, output and download-link self-injections must not spend public account slots');

  const c=await createUser('c');
  for(let n=0;n<120;n++){
   const response=await req(c.cookie,'GET','/api/session');
   assert.equal(response.statusCode,200,`public request ${n+1}: ${response.body}`);
   assert.equal(remaining(response),119-n);
  }
  const denied=await req(c.cookie,'GET','/api/session');
  assert.equal(denied.statusCode,429,denied.body);
  assert.equal(denied.json().error,'RATE_LIMITED');
  const loginFromOtherIp=(n:number)=>app.inject({method:'POST',url:'/api/login',remoteAddress:'198.51.100.77',headers:{origin},payload:{username:`missing-${n}`,password:'invalid'}});
  for(let n=0;n<10;n++)assert.equal((await loginFromOtherIp(n)).statusCode,401);
  assert.equal((await loginFromOtherIp(10)).statusCode,429,'the independent login 10/min limit remains active');
 }finally{await app.close();await pool.end();await admin.end();}
});
