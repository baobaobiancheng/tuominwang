import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {parseRestorationMapping,restoreMarkdown} from '../packages/core/restoration-files.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app=await buildApp(),admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),origin=process.env.APP_ORIGIN!;
after(async()=>{await app.close();await pool.end();await admin.end();});

async function account(tenant:string){
 const uid=randomUUID(),username='draft-'+uid,password='synthetic-draft-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 return (method:string,url:string,payload?:unknown)=>app.inject({method:method as any,url,headers:{origin,cookie},payload:payload as any});
}
async function view(req:Awaited<ReturnType<typeof account>>,doc:string){
 const response=await req('GET',`/api/documents/${doc}`);assert.equal(response.statusCode,200,response.body);return response.json();
}
async function draft(req:Awaited<ReturnType<typeof account>>,doc:string){
 const response=await req('GET',`/api/documents/${doc}/pseudonym-draft`);assert.equal(response.statusCode,200,response.body);return response.json();
}

test('one document keeps original key actions and requires a selected uniform original for a shared pseudonym archive',{timeout:120000},async()=>{
 const tenant=randomUUID(),req=await account(tenant),outsider=await account(tenant),project=(await req('POST','/api/projects',{name:'局部同值假名'})).json().id;
 const doc=(await req('POST',`/api/projects/${project}/documents`,{text:'张三和张四',requestId:randomUUID()})).json().id;
 assert.equal(await tick(),true);
 let current=await view(req,doc);
 const seeded=await req('PUT',`/api/documents/${doc}/review`,{revision:current.revision,marks:[{start:0,end:2,kind:'姓名',decision:'pending'},{start:3,end:5,kind:'姓名',decision:'pending'}]});
 assert.equal(seeded.statusCode,200,seeded.body);
 let state=await draft(req,doc);assert.deepEqual(state.draft.entries.map((entry:any)=>entry.key),['name_cn:张三','name_cn:张四']);
 assert.equal((await outsider('GET',`/api/documents/${doc}/pseudonym-draft`)).statusCode,404);
 async function edit(key:string,confirmDuplicate=false){
  const response=await req('POST',`/api/documents/${doc}/pseudonym-draft/edit`,{revision:state.revision,sourceHash:state.sourceHash,draftHash:state.draftHash,style:'custom',key,currentValue:'共同别名',locked:true,confirmDuplicate});
  assert.equal(response.statusCode,200,response.body);return response.json();
 }
 let changed=await edit('name_cn:张三');state={...state,...changed};
 const stale=await req('POST',`/api/documents/${doc}/pseudonym-draft/edit`,{revision:state.revision,sourceHash:state.sourceHash,draftHash:'0'.repeat(64),style:'custom',key:'name_cn:张四',currentValue:'共同别名',locked:true});
 assert.equal(stale.statusCode,409);
 const denied=await edit('name_cn:张四');assert.equal(denied.duplicateConfirmationRequired,true);
 assert.equal((await draft(req,doc)).draft.entries.find((entry:any)=>entry.key==='name_cn:张四').currentValue!=='共同别名',true);
 changed=await edit('name_cn:张四',true);state={...state,...changed};
 assert.equal(state.draft.entries.find((entry:any)=>entry.key==='name_cn:张四').canonicalKey,'name_cn:张三');
 current=await view(req,doc);
 assert.deepEqual(current.marks.map((mark:any)=>mark.replacement?.value),['共同别名','共同别名']);
 const reviewed=await req('PUT',`/api/documents/${doc}/review`,{revision:current.revision,marks:current.marks.map((mark:any)=>({...mark,decision:'redact'}))});
 assert.equal(reviewed.statusCode,200,reviewed.body);
 current=await view(req,doc);
 const exported=await req('POST',`/api/documents/${doc}/export`,{revision:current.revision});assert.equal(exported.statusCode,200,exported.body);
 assert.equal(await tick(),true);
 const archives=await req('GET',`/api/projects/${project}/export-mapping-archives`);assert.equal(archives.statusCode,200,archives.body);
 const archive=archives.json().find((item:any)=>item.documentId===doc);assert.ok(archive,archives.body);
 assert.equal((await outsider('GET',`/api/projects/${project}/export-mapping-archives/${archive.id}/download`)).statusCode,404);
 const downloaded=await req('GET',`/api/projects/${project}/export-mapping-archives/${archive.id}/download`);assert.equal(downloaded.statusCode,200,downloaded.body);
 const raw=JSON.parse(downloaded.body),unselected=parseRestorationMapping(raw);
 assert.deepEqual(unselected.ambiguities[0]?.originals,['张三','张四']);
 assert.throws(()=>restoreMarkdown(Buffer.from('共同别名'),unselected),/RESTORE_AMBIGUOUS_MAPPING/);
 const selected=parseRestorationMapping(raw,{choices:{共同别名:'张四'}});
 assert.equal(restoreMarkdown(Buffer.from('共同别名'),selected).output.toString(),'张四');
 const oldLink=await req('POST',`/api/documents/${doc}/download-link`,{revision:current.revision});assert.equal(oldLink.statusCode,200,oldLink.body);
 const oldBytes=await app.inject({url:oldLink.json().url});assert.equal(oldBytes.statusCode,200,oldBytes.body);
 const latest=await draft(req,doc);
 const reset=await req('POST',`/api/documents/${doc}/pseudonym-draft/reset`,{revision:latest.revision,sourceHash:latest.sourceHash,draftHash:latest.draftHash,style:'custom'});
 assert.equal(reset.statusCode,200,reset.body);
 const oldReadback=await app.inject({url:oldLink.json().url});assert.equal(oldReadback.statusCode,200,oldReadback.body);
 assert.deepEqual(oldReadback.rawPayload,oldBytes.rawPayload,'a later draft reset must not rewrite an already issued artifact');
});

test('zero-occurrence key survives native Save As, project import and document ID rebinding',{timeout:120000},async()=>{
 const tenant=randomUUID(),req=await account(tenant),project=(await req('POST','/api/projects',{name:'零出现保存'})).json().id;
 const doc=(await req('POST',`/api/projects/${project}/documents`,{text:'张三和张四',requestId:randomUUID()})).json().id;
 assert.equal(await tick(),true);
 let current=await view(req,doc);
 const seeded=await req('PUT',`/api/documents/${doc}/review`,{revision:current.revision,marks:[{start:0,end:2,kind:'姓名',decision:'pending'},{start:3,end:5,kind:'姓名',decision:'pending'}]});assert.equal(seeded.statusCode,200,seeded.body);
 let state=await draft(req,doc);
 const edited=await req('POST',`/api/documents/${doc}/pseudonym-draft/edit`,{revision:state.revision,sourceHash:state.sourceHash,draftHash:state.draftHash,style:'custom',key:'name_cn:张三',currentValue:'历史别名',locked:true});assert.equal(edited.statusCode,200,edited.body);
 current=await view(req,doc);
 const removed=await req('PUT',`/api/documents/${doc}/review`,{revision:current.revision,marks:current.marks.filter((mark:any)=>mark.start===3)});assert.equal(removed.statusCode,200,removed.body);
 state=await draft(req,doc);
 assert.equal(state.draft.entries.find((entry:any)=>entry.key==='name_cn:张三').occurrences,0);
 assert.equal(state.draft.entries.find((entry:any)=>entry.key==='name_cn:张三').currentValue,'历史别名');
 const backup=await req('POST',`/api/projects/${project}/portable/export`,{format:'native',password:'synthetic-native-password'});assert.equal(backup.statusCode,200,backup.body);
 const imported=await req('POST','/api/portable/import',{name:'原生重开',password:'synthetic-native-password',bytesBase64:backup.rawPayload.toString('base64')});assert.equal(imported.statusCode,200,imported.body);
 const newProject=imported.json().id,[row]=(await admin.query('SELECT id FROM documents WHERE project_id=$1',[newProject])).rows;assert.ok(row);
 assert.notEqual(row.id,doc);
 assert.equal(await tick(),true);
 const reopened=await draft(req,row.id);
 const key=reopened.draft.entries.find((entry:any)=>entry.key==='name_cn:张三');assert.ok(key,JSON.stringify(reopened));
 assert.equal(key.currentValue,'历史别名');assert.equal(key.occurrences,0);assert.equal(key.locked,true);
 const reset=await req('POST',`/api/documents/${row.id}/pseudonym-draft/reset`,{revision:reopened.revision,sourceHash:reopened.sourceHash,draftHash:reopened.draftHash,style:'custom'});assert.equal(reset.statusCode,200,reset.body);
 const after=reset.json();assert.equal(after.draft.entries.find((entry:any)=>entry.key==='name_cn:张三').locked,false);
 assert.equal(after.draft.entries.find((entry:any)=>entry.key==='name_cn:张三').currentValue,key.autoValue);
 assert.equal(after.revision,reopened.revision,'zero-occurrence reset changes the draft without a review revision');
});
