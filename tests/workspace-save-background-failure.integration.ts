import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {access} from 'node:fs/promises';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app=await buildApp(),admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
after(async()=>{await app.close();await pool.end();await admin.end();});
test('failure to create a private archive directory persists failed state, never an eternal running receipt or download',{timeout:30000},async()=>{
 const uid=randomUUID(),tenant=randomUUID(),username='save-background-'+uid,password='synthetic-background-password',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload});
 const project=(await req('POST','/api/projects',{name:'synthetic temp failure'})).json().id,requestId=randomUUID(),body={requestId,password:'synthetic-backup-password'};
 const prior=process.env.TMPDIR,invalid=join(process.env.DATA_DIR!,'missing-parent',randomUUID());process.env.TMPDIR=invalid;
 try{
  const begin=await req('POST',`/api/projects/${project}/portable/save`,body);assert.equal(begin.statusCode,200,begin.body);assert.equal(begin.json().state,'running');
  let result:any;for(let i=0;i<200;i++){const status=await req('POST',`/api/projects/${project}/portable/save-result`,{requestId});assert.equal(status.statusCode,200,status.body);result=status.json();if(result.state!=='running')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(result.state,'failed',JSON.stringify(result));assert.equal(result.error,'WORKSPACE_SAVE_FAILED');assert.equal(result.downloadPath,undefined);
  const stored=(await admin.query('SELECT state,payload,output_hash FROM workspace_save_receipts WHERE id=$1',[result.receiptId])).rows[0];assert.deepEqual(stored,{state:'failed',payload:null,output_hash:null});
  assert.equal((await req('POST',`/api/projects/${project}/portable/save`,body)).json().receiptId,result.receiptId);const download=await req('GET',`/api/projects/${project}/portable/saves/${result.receiptId}/download`);assert.equal(download.statusCode,409,download.body);assert.equal(download.json().error,'WORKSPACE_SAVE_NOT_COMPLETE');await assert.rejects(access(invalid));
 }finally{if(prior===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=prior;}
});
