import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {pool, rows, scoped, sql} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {queueAutomaticRuntimeRules, closeAndDrainAutomaticRuntimeRules} from '../packages/adapters/automatic-runtime-rules.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app=await buildApp(), admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
after(async()=>{await app.close();await pool.end();await admin.end();});
const root='.data/research/lawbot-2026-10-15/iteration037';
const codeHashes=Object.fromEntries(await Promise.all(['scripts/037.sql','scripts/038.sql','packages/adapters/automatic-runtime-rules.ts','apps/api/automatic-runtime-rules.ts'].map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
async function fixture(){
 const user=randomUUID(),tenant=randomUUID(),username='terminal-'+user,password='synthetic-terminal-password',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any)=>app.inject({method,url,payload,headers:{origin,cookie}});
 const project=(await req('POST','/api/projects',{name:'终态与窗口竞争合成材料'})).json().id;
 const id=(await req('POST',`/api/projects/${project}/documents`,{text:'TERMINAL SAMPLE',requestId:randomUUID()})).json().id;
 const [job]=await scoped(user,tenant,db=>rows(db,sql`SELECT * FROM claim_job()`));
 assert.equal(job.document_id,id);
 const [doc]=(await admin.query('SELECT * FROM documents WHERE id=$1',[id])).rows;
 const b={job:job.id,generation:job.generation,tenant,project,user,document:id,revision:job.revision,sourceHash:doc.source_hash,contentHash:doc.content_hash};
 const body={revision:job.revision,producer:'manual-add',scope:'file',before:[],after:[{start:0,end:8,kind:'自定义',rawEntityType:'terminal_raw',decision:'pending',sources:[{layer:'manual',code:'manual-selection'}]}]};
 return {user,tenant,project,id,job,b,body,req,endpoint:`/api/documents/${id}/runtime-rules/automatic`};
}
async function count(job:string){return Number((await admin.query('SELECT count(*) FROM runtime_rule_deliveries WHERE job_id=$1',[job])).rows[0].count);}
function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return{promise,release};}

test('production scheduler and app-role terminal updates erase sealed deliveries even when no worker finally ran',{timeout:30000},async()=>{
 const results=[];
 for(const branch of ['revoked','exhausted','cancelled','succeeded'] as const){
  const f=await fixture(),queued=await f.req('POST',f.endpoint,f.body);
  assert.equal(queued.statusCode,200,queued.body);assert.equal(queued.json().appliedToTasks,1);assert.equal(await count(f.job.id),1);
  // No processing/finally is invoked. This is the database recovery boundary
  // after a missing process, not a claim that a production worker was SIGKILLed.
  if(branch==='revoked'){
   await admin.query('UPDATE organization_members SET enabled=false WHERE user_id=$1',[f.user]);
   assert.deepEqual(await scoped(f.user,f.tenant,db=>rows(db,sql`SELECT * FROM claim_job()`)),[]);
  }else if(branch==='exhausted'){
   await admin.query("UPDATE jobs SET attempt=3,lease_until=now()-interval '1 second' WHERE id=$1",[f.job.id]);
   assert.deepEqual(await scoped(f.user,f.tenant,db=>rows(db,sql`SELECT * FROM claim_job()`)),[]);
  }else{
   await scoped(f.user,f.tenant,db=>rows(db,sql`UPDATE jobs SET status=${branch},lease_until=NULL WHERE id=${f.job.id}`));
  }
  const [job]=(await admin.query('SELECT status,error_code,runtime_rule_accepting FROM jobs WHERE id=$1',[f.job.id])).rows;
  assert.equal(job.status,branch==='revoked'?'cancelled':branch==='exhausted'?'failed':branch);
  if(branch==='revoked')assert.equal(job.error_code,'PERMISSION_REVOKED');
  if(branch==='exhausted')assert.equal(job.error_code,'RETRY_EXHAUSTED');
  assert.equal(job.runtime_rule_accepting,false);assert.equal(await count(f.job.id),0);
  results.push({branch,...job,temporaryDeliveries:0});
 }
 assert.equal((await admin.query('SELECT count(*) FROM runtime_whitelists')).rows[0].count,'0');
 await mkdir(root,{recursive:true});await writeFile(root+'/automatic-runtime-terminal-actual.json',JSON.stringify({codeHashes,results,processingWorkerKilled:false,scope:'real API delivery, missing-finally recovery through production scheduler and app-role terminal transitions'},null,2)+'\n');
});

test('both real transaction lock orders serialize automatic producer and final drain without acknowledged loss',{timeout:30000},async()=>{
 const f=await fixture(),ready=gate(),release=gate();let drained=false;
 const producer=scoped(f.user,f.tenant,async db=>{
  const result=await queueAutomaticRuntimeRules(db,{tenant:f.tenant,project:f.project,user:f.user,document:f.id,revision:f.job.revision,scope:'file',rules:[{entityType:'terminal_raw',pattern:'TERMINAL'}]});
  ready.release();await release.promise;return result;
 });
 await ready.promise;
 const drain=scoped(f.user,f.tenant,db=>closeAndDrainAutomaticRuntimeRules(db,f.b)).then(result=>{drained=true;return result;});
 try{await delay(30);assert.equal(drained,false);}finally{release.release();}
 assert.equal((await producer).appliedToTasks,1);assert.deepEqual(await drain,[{entityType:'terminal_raw',pattern:'TERMINAL'}]);assert.equal(await count(f.job.id),0);

 await admin.query('UPDATE jobs SET runtime_rule_accepting=true WHERE id=$1',[f.job.id]);
 const closeReady=gate(),closeRelease=gate();let producerFinished=false;
 const closing=scoped(f.user,f.tenant,async db=>{const result=await closeAndDrainAutomaticRuntimeRules(db,f.b);closeReady.release();await closeRelease.promise;return result;});
 await closeReady.promise;
 const late=f.req('POST',f.endpoint,f.body).then(result=>{producerFinished=true;return result;});
 try{await delay(30);assert.equal(producerFinished,false);}finally{closeRelease.release();}
 assert.deepEqual(await closing,[]);const response=await late;assert.equal(response.statusCode,200,response.body);assert.equal(response.json().appliedToTasks,0);assert.equal(await count(f.job.id),0);
 await scoped(f.user,f.tenant,db=>rows(db,sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE id=${f.job.id}`));
 await writeFile(root+'/automatic-runtime-lock-orders-actual.json',JSON.stringify({codeHashes,producerFirst:{acknowledged:1,drained:1},closeFirst:{acknowledged:0,drained:0},temporaryDeliveries:0},null,2)+'\n');
});

test('038 upgrade SQL sweeps preexisting terminal ciphertext and preserves an active delivery',{timeout:30000},async()=>{
 const old=await fixture();assert.equal((await old.req('POST',old.endpoint,old.body)).json().appliedToTasks,1);
 // Recreate the exact pre-038 absence of terminal cleanup only in this isolated
 // database, then apply the real migration SQL to its existing encrypted rows.
 await admin.query('DROP TRIGGER cleanup_terminal_runtime_rule_deliveries ON jobs');
 await admin.query('DROP FUNCTION cleanup_terminal_runtime_rule_deliveries()');
 await admin.query("UPDATE jobs SET status='failed',lease_until=NULL WHERE id=$1",[old.job.id]);
 assert.equal(await count(old.job.id),1);
 const live=await fixture();assert.equal((await live.req('POST',live.endpoint,live.body)).json().appliedToTasks,1);
 const c=await admin.connect();
 try{await c.query('BEGIN');await c.query(await readFile('scripts/038.sql','utf8'));await c.query('COMMIT');}
 catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 assert.equal(await count(old.job.id),0);assert.equal(await count(live.job.id),1);
 const [closed]=(await admin.query('SELECT runtime_rule_accepting FROM jobs WHERE id=$1',[old.job.id])).rows;
 assert.equal(closed.runtime_rule_accepting,false);
 const rules=await scoped(live.user,live.tenant,db=>closeAndDrainAutomaticRuntimeRules(db,live.b));
 assert.deepEqual(rules,[{entityType:'terminal_raw',pattern:'TERMINAL'}]);
 await scoped(live.user,live.tenant,db=>rows(db,sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE id=${live.job.id}`));
 await writeFile(root+'/automatic-runtime-migration-sweep-actual.json',JSON.stringify({codeHashes,preexistingTerminalDeleted:1,liveDeliveryPreserved:1,livePayloadStillAuthentic:true,oldWindowClosed:true},null,2)+'\n');
});
