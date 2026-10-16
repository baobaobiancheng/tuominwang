import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {access,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool,rows,globalDb,sql} from '../packages/adapters/db.ts';
import {writeOriginal,readOriginal,removeOwnedArtifact,hash} from '../packages/adapters/storage.ts';
import {purgeRequestedWorkspaceSaves} from '../packages/adapters/deletions.ts';
assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
after(async()=>{await pool.end();await admin.end();});
async function fixture(){const tenant=randomUUID(),user=randomUUID(),project=randomUUID();await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,'save-cleanup-'+user,'synthetic unused password']);await admin.query('INSERT INTO projects(id,tenant_id,owner_id,name) VALUES($1,$2,$3,$4)',[project,tenant,user,'synthetic cleanup project']);return {tenant,user,project};}
async function receipt(f:Awaited<ReturnType<typeof fixture>>,expired=true){const id=randomUUID();await admin.query(`INSERT INTO workspace_save_receipts(id,tenant_id,owner_id,project_id,run_instance,request_hash,session_hash,input_hash,snapshot_hash,format,state,expires_at) VALUES($1,$2,$3,$4,'stopped-api',$6,$6,$6,$6,'native','running',now()+($5::integer*interval '1 second'))`,[id,f.tenant,f.user,f.project,expired?-1:3600,id]);return id;}
const object=(id:string)=>resolve(process.env.DATA_DIR!,id);
test('expired running receipt reclaims pre-pointer interrupted object without another owner request, preserving live receipts and arbitrary materials',async()=>{
 const f=await fixture(),expired=await receipt(f),live=await receipt(f,false),other=randomUUID(),otherOwner=randomUUID(),bytes=Buffer.from('synthetic immutable saved archive');
 await writeOriginal(expired,bytes,expired);await writeOriginal(live,bytes,live);await writeOriginal(other,bytes,otherOwner);
 assert.equal(await purgeRequestedWorkspaceSaves(),1);assert.equal((await admin.query('SELECT id FROM workspace_save_receipts WHERE id=$1',[expired])).rowCount,0);await assert.rejects(access(object(expired)));
 assert.deepEqual(await readOriginal(live),bytes);assert.deepEqual(await readOriginal(other),bytes);assert.equal((await admin.query('SELECT * FROM workspace_save_deletions')).rowCount,0);
 await assert.rejects(rows(globalDb,sql`SELECT * FROM workspace_save_deletions`),(error:any)=>error.cause?.code==='42501');
});
test('project cascade persists cleanup identity even after its receipt disappears',async()=>{
 const f=await fixture(),id=await receipt(f,false);await writeOriginal(id,Buffer.from('synthetic cascade backup'),id);await admin.query('DELETE FROM projects WHERE id=$1',[f.project]);
 assert.equal((await admin.query('SELECT receipt_id FROM workspace_save_deletions WHERE receipt_id=$1',[id])).rowCount,1);assert.equal(await purgeRequestedWorkspaceSaves(),1);await assert.rejects(access(object(id)));assert.equal((await admin.query('SELECT * FROM workspace_save_deletions')).rowCount,0);
});
test('expired writer row lock is skipped; cleanup follows its commit and cannot release a different object owner',async()=>{
 const f=await fixture(),id=await receipt(f),bytes=Buffer.from('synthetic locked archive');await writeOriginal(id,bytes,id);const c=await admin.connect();
 try{await c.query('BEGIN');await c.query('SELECT id FROM workspace_save_receipts WHERE id=$1 FOR UPDATE',[id]);assert.equal(await purgeRequestedWorkspaceSaves(),0);assert.deepEqual(await readOriginal(id),bytes);await c.query('COMMIT');}finally{c.release();}
 assert.equal(await purgeRequestedWorkspaceSaves(),1);await assert.rejects(access(object(id)));
 const collision=await receipt(f),foreignOwner=randomUUID();await writeOriginal(collision,bytes,foreignOwner);const before=await readFile(object(collision));
 assert.equal(await purgeRequestedWorkspaceSaves(),0);assert.deepEqual(await readFile(object(collision)),before);assert.equal((await admin.query('SELECT receipt_id FROM workspace_save_deletions WHERE receipt_id=$1',[collision])).rowCount,1);
 const token=randomUUID();await admin.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hash(token),f.user]);
 const app=await buildApp();try{
  const cookieName=(process.env.APP_BASE_PATH??'/')==='/'?'session':'tuominwang_session';
  const uploaded=await app.inject({method:'POST',url:`/api/projects/${f.project}/documents`,headers:{origin:process.env.APP_ORIGIN!,cookie:`${cookieName}=${token}`},payload:{text:'13800138000',requestId:randomUUID()}});assert.equal(uploaded.statusCode,200,uploaded.body);const document=uploaded.json().id;
  // Make the persistent poison entry due again in the same tick as real work.
  await admin.query('UPDATE workspace_save_deletions SET available_at=now() WHERE receipt_id=$1',[collision]);
  assert.equal(await tick(),true);const result=(await admin.query('SELECT state,marks FROM documents WHERE id=$1',[document])).rows[0];assert.equal(result.state,'review');assert.ok(result.marks.some((m:any)=>m.kind==='手机号'));assert.deepEqual(await readFile(object(collision)),before);
 }finally{await app.close();}
 await removeOwnedArtifact(collision,foreignOwner);await admin.query('UPDATE workspace_save_deletions SET available_at=now() WHERE receipt_id=$1',[collision]);assert.equal(await purgeRequestedWorkspaceSaves(),1);assert.equal((await admin.query('SELECT * FROM workspace_save_deletions')).rowCount,0);
});
