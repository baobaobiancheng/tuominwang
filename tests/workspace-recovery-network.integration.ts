import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {managedNetworkFetch} from '../packages/adapters/network-policy.ts';
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
test('encrypted auto recovery retains every draft decision/exception with revision/hash/owner CAS and cannot approve or cross sessions',async()=>{
 const tenant=randomUUID(),uid=randomUUID(),username='recovery-'+randomUUID(),password='synthetic-recovery',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}}),cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload});
 const project=(await req('POST','/api/projects',{name:'自动恢复验收'})).json().id,doc=(await req('POST',`/api/projects/${project}/documents`,{text:'13800138000 13900139000',requestId:randomUUID()})).json().id;await tick();
 const original=(await req('GET',`/api/documents/${doc}`)).json(),draft={revision:0,marks:original.marks.map((m:any,i:number)=>({...m,decision:i===0?'redact':'ignore',replacement:{mode:'custom',value:'合成私有替换'}}))};
 assert.equal((await req('GET',`/api/documents/${doc}/recovery`)).json(),null);
 const saved=await req('PUT',`/api/documents/${doc}/recovery`,{recoveryRevision:0,draft});assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().revision,1);
 const storage=(await admin.query('SELECT * FROM workspace_recoveries WHERE document_id=$1',[doc])).rows[0];assert.ok(!storage.payload.includes('合成私有替换'));assert.equal((await req('GET',`/api/documents/${doc}`)).json().revision,0);
 assert.equal((await req('PUT',`/api/documents/${doc}/recovery`,{recoveryRevision:0,draft})).statusCode,409);
 const opened=await req('POST',`/api/documents/${doc}/recovery/open`,{recoveryRevision:1});assert.equal(opened.statusCode,200,opened.body);assert.deepEqual(opened.json().draft.marks.map((m:any)=>m.decision),['redact','ignore']);assert.ok(opened.json().draft.marks.every((m:any)=>m.replacement.value==='合成私有替换'));
 const next=await req('PUT',`/api/documents/${doc}/recovery`,{recoveryRevision:1,draft:{...draft,marks:draft.marks.map((m:any)=>({...m,decision:'ignore'}))}});assert.equal(next.json().revision,2);
 assert.equal((await req('GET','/api/workspace/recoveries')).json().length,1);
 await req('POST',`/api/projects/${project}/workspace/recent`,{documentId:doc});assert.equal((await req('GET','/api/workspace/recent')).json()[0].documentId,doc);await req('DELETE',`/api/projects/${project}/workspace/recent`);assert.equal((await req('GET','/api/workspace/recent')).json().length,0);assert.equal((await req('GET',`/api/documents/${doc}`)).statusCode,200);
 const foreign=randomUUID(),foreignName='foreign-'+foreign;await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[foreign,randomUUID(),foreignName,passwordHash(password)]);const logged=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username:foreignName,password}}),foreignCookie=String(logged.headers['set-cookie']).split(';')[0];
 assert.deepEqual((await app.inject({url:'/api/workspace/recoveries',headers:{cookie:foreignCookie}})).json(),[]);assert.equal((await app.inject({method:'POST',url:`/api/documents/${doc}/recovery/open`,headers:{origin,cookie:foreignCookie},payload:{recoveryRevision:2}})).statusCode,404);
 await admin.query('UPDATE documents SET content_hash=$2 WHERE id=$1',[doc,'0'.repeat(64)]);assert.equal((await req('POST',`/api/documents/${doc}/recovery/open`,{recoveryRevision:2})).json().error,'RECOVERY_OUTDATED');await admin.query('UPDATE documents SET content_hash=$2 WHERE id=$1',[doc,storage.content_hash]);
 assert.equal((await req('DELETE',`/api/documents/${doc}/recovery`,{recoveryRevision:1})).statusCode,409);assert.equal((await req('DELETE',`/api/documents/${doc}/recovery`,{recoveryRevision:2})).statusCode,200);assert.equal((await req('GET',`/api/documents/${doc}`)).json().revision,0);
 await req('PUT',`/api/documents/${doc}/recovery`,{recoveryRevision:0,draft});assert.equal((await req('PUT',`/api/documents/${doc}/review`,draft)).statusCode,200);assert.equal((await req('GET',`/api/documents/${doc}/recovery`)).json(),null);
});
test('network offline policy blocks real outbound work, accounts real received/sent bytes and retains restrictions across resets/revocation',async()=>{
 const tenant=randomUUID(),uid=randomUUID(),username='network-'+randomUUID(),password='synthetic-network',origin=process.env.APP_ORIGIN!;await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}}),cookie=String(login.headers['set-cookie']).split(';')[0];const req=(method:any,url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload});const project=(await req('POST','/api/projects',{name:'外部网络统计'})).json().id,context={user:uid,tenant,project};
 let received=0;const server=createServer((req,res)=>{received++;req.resume();res.end('synthetic-reply');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number},target=`http://127.0.0.1:${address.port}/fixed-synthetic-test`;
 try{
  const initial=(await req('GET',`/api/projects/${project}/network`)).json();assert.equal(initial.offline,true);assert.equal(initial.requests,'0');
  await assert.rejects(managedNetworkFetch(context,target),/NETWORK_OFFLINE/);assert.equal(received,0);let stats=(await req('GET',`/api/projects/${project}/network`)).json();assert.equal(stats.requests,'1');assert.equal(stats.blocked,'1');
  assert.equal((await req('PUT',`/api/projects/${project}/network`,{revision:0,offline:false})).statusCode,409);let changed=(await req('PUT',`/api/projects/${project}/network`,{revision:stats.revision,offline:false})).json();
  const result=await managedNetworkFetch(context,target,{method:'POST',body:'hello'});assert.equal(result.bytes.toString(),'synthetic-reply');assert.equal(received,1);stats=(await req('GET',`/api/projects/${project}/network`)).json();assert.equal(stats.requests,'2');assert.equal(stats.bytesOut,'5');assert.equal(stats.bytesIn,String(Buffer.byteLength('synthetic-reply')));
  const reset=(await req('POST',`/api/projects/${project}/network/reset`,{revision:changed.revision})).json();assert.equal(reset.requests,'0');assert.equal(reset.bytesIn,'0');assert.equal(reset.offline,false);
  await admin.query('UPDATE organization_members SET enabled=false WHERE user_id=$1',[uid]);await assert.rejects(managedNetworkFetch(context,target),/NOT_FOUND/);assert.equal(received,1);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
