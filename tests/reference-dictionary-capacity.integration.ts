import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {exportReferenceDictionary,importReferenceDictionary} from '../packages/core/reference-dictionary-workbook.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp(),origin=process.env.APP_ORIGIN!;
after(async()=>{await app.close();await pool.end();await admin.end();});

test('valid source XLSX above five MiB previews without writing, then explicit import and export keep the full pattern',async()=>{
 const user=randomUUID(),tenant=randomUUID(),username='dictionary-capacity-'+randomUUID(),password='synthetic-dictionary-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0],request=(method:any,url:string,payload?:any,headers:Record<string,string>={})=>app.inject({method,url,payload,headers:{origin,cookie,...headers}});
 const projectResponse=await request('POST','/api/projects',{name:'大个人名单纯合成'});assert.equal(projectResponse.statusCode,200,projectResponse.body);const project=projectResponse.json().id;
 const largePattern=randomBytes(5*1024*1024).toString('base64');
 const workbook=await exportReferenceDictionary([{pattern:largePattern,entity_type:'name_cn',rule_type:'whitelist'}]);assert.ok(workbook.length>5*1024*1024);
 const preview=await request('POST',`/api/projects/${project}/reference-dictionary/import`,workbook,{'content-type':'application/octet-stream'});
 assert.equal(preview.statusCode,200,preview.body.slice(0,200));assert.equal(preview.json().preview,true);assert.ok(preview.json().entries[0].pattern===largePattern);assert.equal(preview.json().errors.length,0);
 assert.equal((await request('GET','/api/review-memory')).json().items.length,0);
 const imported=await request('POST','/api/review-memory/import',{revision:preview.json().revision,entries:preview.json().entries.map(({row,...entry}:any)=>entry)});
 assert.equal(imported.statusCode,200,imported.body);assert.equal(imported.json().importedCount,1);
 const exported=await request('GET',`/api/projects/${project}/reference-dictionary/export.xlsx`);assert.equal(exported.statusCode,200,exported.body.slice(0,200));
 const round=await import('../packages/core/reference-dictionary-workbook.ts').then(m=>m.importReferenceDictionary(exported.rawPayload));
 assert.equal(round.entries.length,1);assert.ok(round.entries[0].pattern===largePattern);
 assert.equal(round.errors.length,0);assert.ok(createHash('sha256').update(exported.rawPayload).digest('hex'));
});

test('explicit personal-list confirmation above 64 MiB preserves JSON and XLSX full bytes with CAS protection',async()=>{
 const user=randomUUID(),tenant=randomUUID(),username='dictionary-confirm-'+randomUUID(),password='synthetic-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200);
 const cookie=String(login.headers['set-cookie']).split(';')[0],pattern='A'.repeat(64*1024*1024+1024);
 const body={revision:0,entries:[{pattern,entity_type:'name_cn',rule_type:'whitelist'}]};
 assert.ok(Buffer.byteLength(JSON.stringify(body))>64*1024*1024);
 const result=await app.inject({method:'POST',url:'/api/review-memory/import',headers:{origin,cookie},payload:body});
 assert.equal(result.statusCode,200,result.body.slice(0,200));assert.equal(result.json().importedCount,1);
 const count=await admin.query('SELECT COUNT(*)::integer AS n, MAX(octet_length(payload))::integer AS stored_bytes FROM feedback_memories WHERE owner_id=$1 AND user_dictionary',[user]);
 assert.equal(count.rows[0].n,1);assert.ok(count.rows[0].stored_bytes>64*1024*1024);
 const digest=(value:string)=>createHash('sha256').update(value).digest('hex'),expected=digest(pattern);
 const jsonExport=await app.inject({method:'GET',url:'/api/review-memory/export',headers:{origin,cookie}});assert.equal(jsonExport.statusCode,200);const json=jsonExport.json();assert.equal(json._meta.count,1);assert.equal(json.entries.length,1);assert.equal(json.entries[0].pattern.length,pattern.length);assert.ok(digest(json.entries[0].pattern)===expected,'JSON export must preserve every imported character');assert.equal(json.entries[0].entity_type,'name_cn');assert.equal(json.entries[0].rule_type,'whitelist');
 const projectResponse=await app.inject({method:'POST',url:'/api/projects',headers:{origin,cookie},payload:{name:'大个人名单只读导出'}});assert.equal(projectResponse.statusCode,200);const project=projectResponse.json().id;
 const xlsxExport=await app.inject({method:'GET',url:`/api/projects/${project}/reference-dictionary/export.xlsx`,headers:{origin,cookie}});assert.equal(xlsxExport.statusCode,200);const readBack=await importReferenceDictionary(xlsxExport.rawPayload);assert.equal(readBack.errors.length,0);assert.equal(readBack.entries.length,1);assert.equal(readBack.entries[0].pattern.length,pattern.length);assert.ok(digest(readBack.entries[0].pattern)===expected,'XLSX roundtrip must preserve every imported character beyond former shared Office inflated-byte budget');assert.equal(readBack.entries[0].entity_type,'name_cn');assert.equal(readBack.entries[0].rule_type,'whitelist');
 const stale=await app.inject({method:'POST',url:'/api/review-memory/import',headers:{origin,cookie},payload:{revision:0,entries:[{pattern:'另一个',entity_type:'name_cn',rule_type:'whitelist'}]}});
 assert.equal(stale.statusCode,409,stale.body);
});

