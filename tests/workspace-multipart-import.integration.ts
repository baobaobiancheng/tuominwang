import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { passwordHash, hash } from '../packages/adapters/storage.ts';
import { writeCompatibleWorkspace } from '../packages/core/workspace-compat.ts';
const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
after(async()=>{ await app.close(); await pool.end(); await admin.end(); });
function multipart(parts: [string,string|Buffer][]) {
 const boundary='tmw-'+randomUUID(), pieces:Buffer[]=[];
 for(const [name,value] of parts) {
  pieces.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${Buffer.isBuffer(value)?'; filename="archive.tmm"\r\nContent-Type: application/octet-stream':''}\r\n\r\n`));
  pieces.push(Buffer.isBuffer(value)?value:Buffer.from(value)); pieces.push(Buffer.from('\r\n'));
 }
 pieces.push(Buffer.from(`--${boundary}--\r\n`));
 return {body:Buffer.concat(pieces),type:`multipart/form-data; boundary=${boundary}`};
}
test('multipart import accepts either field order and keeps old format, duplicate and source guards',async()=>{
 const tenant=randomUUID(),uid=randomUUID(),username='portable-multipart-'+randomUUID(),loginPassword='synthetic-login',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(loginPassword)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password:loginPassword}});
 assert.equal(login.statusCode,200,login.body); const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(parts:[string,string|Buffer][])=>{const body=multipart(parts);return app.inject({method:'POST',url:'/api/portable/import-file',headers:{origin,cookie,'content-type':body.type},payload:body.body});};
 const doc=randomUUID(),content='公开合成文本',source=Buffer.from(content),snapshot:any={format:'tuominwang-workspace',schemaVersion:1,project:{name:'来源',dictionary:[],dictionaryRevision:0,presetPolicy:null,presetRevision:0},mappings:[],snapshots:[],documents:[{id:doc,name:'source.txt',format:'txt',content,contentHash:hash(content),sourceEntry:`sources/${doc}/original.txt`,sourceHash:hash(source),marks:[],revision:0,state:'review',anchors:[],coverage:[],pages:[],pageReview:null,recognition:{},nerEnabled:false}]};
 const archive=await writeCompatibleWorkspace(snapshot,new Map([[snapshot.documents[0].sourceEntry,source]]),'synthetic-project','secure-v3','synthetic-transfer-password');
 for(const fileFirst of [false,true]){
  const parts:[string,string|Buffer][] = fileFirst?[['file',archive],['name','重开工程'],['password','synthetic-transfer-password']]:[['name','重开工程'],['password','synthetic-transfer-password'],['file',archive]];
  const response=await req(parts);assert.equal(response.statusCode,200,response.body);assert.equal(response.json().documentCount,1);
 }
 const duplicate=await req([['name','重复文件'],['file',archive],['file',archive]]);assert.equal(duplicate.statusCode,400,duplicate.body);
 const unknown=await req([['name','未知字段'],['other','x'],['file',archive]]);assert.equal(unknown.statusCode,400,unknown.body);
 const wrongPassword=await req([['name','错密码'],['password','wrong-password'],['file',archive]]);assert.notEqual(wrongPassword.statusCode,200,wrongPassword.body);
 const unauthenticated=multipart([['name','无权'],['file',archive]]);
 assert.equal((await app.inject({method:'POST',url:'/api/portable/import-file',headers:{origin,'content-type':unauthenticated.type},payload:unauthenticated.body})).statusCode,401);
});
