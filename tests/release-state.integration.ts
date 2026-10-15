import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
const origin=process.env.APP_ORIGIN!;
async function account(tenant=randomUUID()){
 const id=randomUUID(),username='release-'+randomUUID(),password='synthetic-release-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[id,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 return {tenant,req:(method:any,url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload})};
}
test('public environment fields identify the actual web runtime without native claims or secrets',async()=>{
 const a=await account(),result=await a.req('GET','/api/app/environment');assert.equal(result.statusCode,200,result.body);
 const value=result.json();assert.equal(value.runtime,'web-server');assert.equal(value.versions.node,process.versions.node);assert.equal(value.versions.electron,undefined);assert.equal(value.capabilities.nativeWindow,false);assert.equal(value.capabilities.browserFileUpload,true);assert.equal(value.appVersion,(await a.req('GET','/api/app/version')).json().version);assert.equal(result.headers['cache-control'],'no-store');assert.ok(!result.body.includes('DATA_KEY'));assert.equal((await app.inject({method:'GET',url:'/api/app/environment'})).statusCode,401);
});
test('strict-true preference replacement persists per-user; acknowledgment is idempotent and a new deployment reintroduces only its own release',async()=>{
 const oldVersion=process.env.RELEASE_VERSION,oldId=process.env.RELEASE_ID;
 try {
 process.env.RELEASE_VERSION='2026.10.15-032';process.env.RELEASE_ID='synthetic-release-A';
 const a=await account(),b=await account(a.tenant),other=await account();
 const initial=(await a.req('GET','/api/software-update/state')).json();assert.equal(initial.currentVersion,'2026.10.15-032');assert.equal(initial.whatsNewRelease.releaseId,'synthetic-release-A');assert.equal(initial.supported,false);assert.equal(initial.capabilities.nativeInstall,false);
 const saved=await a.req('PUT','/api/software-update/preferences',{setupCompleted:true,checkAutomatically:true,downloadAutomatically:'true',installAutomatically:1,unknown:true});assert.equal(saved.statusCode,200,saved.body);assert.deepEqual(saved.json().state.preferences,{setupCompleted:true,checkAutomatically:true,downloadAutomatically:false,installAutomatically:false});
 assert.equal((await a.req('GET','/api/software-update/state')).json().preferences.checkAutomatically,true);
 for(const user of[b,other])assert.equal((await user.req('GET','/api/software-update/state')).json().preferences.checkAutomatically,false);
 const ack=await a.req('POST','/api/software-update/acknowledge-whats-new',{});assert.equal(ack.statusCode,200,ack.body);assert.equal(ack.json().state.whatsNewRelease,undefined);assert.equal(ack.json().state.preferences.checkAutomatically,true);
 assert.equal((await a.req('POST','/api/software-update/acknowledge-whats-new',{})).json().state.whatsNewRelease,undefined);
 assert.ok((await b.req('GET','/api/software-update/state')).json().whatsNewRelease);
 process.env.RELEASE_ID='synthetic-release-B';assert.equal((await a.req('GET','/api/software-update/state')).json().whatsNewRelease.releaseId,'synthetic-release-B');
 const replaced=await a.req('PUT','/api/software-update/preferences',{});assert.deepEqual(replaced.json().state.preferences,{setupCompleted:false,checkAutomatically:false,downloadAutomatically:false,installAutomatically:false});
 } finally {if(oldVersion===undefined)delete process.env.RELEASE_VERSION;else process.env.RELEASE_VERSION=oldVersion;if(oldId===undefined)delete process.env.RELEASE_ID;else process.env.RELEASE_ID=oldId;}
});
