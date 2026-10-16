import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app=await buildApp(),admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),origin=process.env.APP_ORIGIN!;
after(async()=>{await app.close();await pool.end();await admin.end();});
async function account(){const tenant=randomUUID(),uid=randomUUID(),username='entity-'+uid,password='synthetic-account-only';await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);const cookie=String(login.headers['set-cookie']).split(';')[0];return{req:(method:any,url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload})};}
async function doc(a:Awaited<ReturnType<typeof account>>,project:string,text:string){const r=await a.req('POST',`/api/projects/${project}/documents`,{requestId:randomUUID(),text});assert.equal(r.statusCode,200,r.body);for(let attempt=0;attempt<12;attempt++){await tick();const d=await a.req('GET',`/api/documents/${r.json().id}`);assert.equal(d.statusCode,200);if(d.json().state==='review')return r.json().id as string;assert.notEqual(d.json().state,'failed',d.body);}assert.fail(`own document detection did not finish: ${r.json().id}`);}
async function state(a:Awaited<ReturnType<typeof account>>,project:string){const r=await a.req('GET',`/api/projects/${project}/unified-aliases`);assert.equal(r.statusCode,200,r.body);return r.json();}
async function call(a:Awaited<ReturnType<typeof account>>,project:string,command:unknown,preview=false){const s=await state(a,project);return a.req('POST',`/api/projects/${project}/unified-aliases${preview?'/preview':''}`,{revision:s.revision,documents:s.documents,command});}
test('project entity panel adds and soft deletes across the project with preview, CAS, tenant and source preservation',async()=>{
 const a=await account(),p=(await a.req('POST','/api/projects',{name:'合成实体面板'})).json().id as string;
 const one=await doc(a,p,'秘密甲乙在这里'),two=await doc(a,p,'这里也有秘密甲乙');
 const original=(await admin.query('SELECT id,content,content_hash,source_hash FROM documents WHERE project_id=$1 ORDER BY id',[p])).rows;
 const disabled=await call(a,p,{action:'add-entity',text:'秘密甲乙',type:'raw_%E8%87%AA%E5%AE%9A%E4%B9%89'},true);assert.equal(disabled.statusCode,409,disabled.body);
 assert.equal((await call(a,p,{action:'enable'})).statusCode,200);
 const oldSnapshots=(await admin.query('SELECT document_id,revision,content_hash,marks FROM review_snapshots WHERE project_id=$1 ORDER BY document_id,revision',[p])).rows;
 const before=await state(a,p),other=await account();assert.equal((await other.req('GET',`/api/projects/${p}/unified-aliases`)).statusCode,404);
 const command={action:'add-entity',text:'秘密甲乙',type:'raw_%E5%90%88%E6%88%90%E7%B1%BB%E5%9E%8B'};
 const preview=await call(a,p,command,true);assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.json().affectedDocuments,2);assert.equal(preview.json().affectedOccurrences,2);assert.deepEqual((await state(a,p)).documents,before.documents);
 const added=await call(a,p,command);assert.equal(added.statusCode,200,added.body);assert.equal(added.json().affectedDocuments,2);assert.equal(Object.keys(added.json().changedDocuments).length,2);
 const oneView=(await a.req('GET',`/api/documents/${one}`)).json(),twoView=(await a.req('GET',`/api/documents/${two}`)).json();assert.ok(oneView.marks.some((m:any)=>m.rawEntityType==='合成类型'));assert.ok(twoView.marks.some((m:any)=>m.rawEntityType==='合成类型'));
 const row=(await state(a,p)).rows.find((r:any)=>r.baseType==='raw_%E5%90%88%E6%88%90%E7%B1%BB%E5%9E%8B');assert.ok(row);
 assert.equal((await call(a,p,{action:'split',key:row.key,documentIds:[two]})).statusCode,200);
 const split=(await state(a,p)).rows.find((r:any)=>r.isSplitEntry);assert.ok(split);
 const deletePreview=await call(a,p,{action:'delete-entity',keys:[split.key]},true);assert.equal(deletePreview.statusCode,200,deletePreview.body);assert.equal(deletePreview.json().affectedDocuments,2);
 const deleted=await call(a,p,{action:'delete-entity',keys:[split.key]});assert.equal(deleted.statusCode,200,deleted.body);assert.equal(deleted.json().affectedDocuments,2);
 for(const id of [one,two]){const view=(await a.req('GET',`/api/documents/${id}`)).json();assert.ok(view.marks.some((m:any)=>m.rawEntityType==='合成类型'&&m.decision==='ignore'));}
 assert.deepEqual((await admin.query('SELECT id,content,content_hash,source_hash FROM documents WHERE project_id=$1 ORDER BY id',[p])).rows,original);
 for(const snapshot of oldSnapshots){const [current]=(await admin.query('SELECT document_id,revision,content_hash,marks FROM review_snapshots WHERE document_id=$1 AND revision=$2',[snapshot.document_id,snapshot.revision])).rows;assert.deepEqual(current,snapshot);}
 const stale=await a.req('POST',`/api/projects/${p}/unified-aliases`,{revision:before.revision,documents:before.documents,command});assert.equal(stale.statusCode,409,stale.body);
 const forged=await call(a,p,{action:'delete-entity',keys:['raw_fake:不存在']},true);assert.equal(forged.statusCode,404,forged.body);
 assert.equal((await other.req('POST',`/api/projects/${p}/unified-aliases/preview`,{revision:before.revision,documents:before.documents,command})).statusCode,404);
 const memberName='entity-reviewer-'+randomUUID(),memberPassword='synthetic-reviewer-only',memberCreated=await a.req('POST','/api/organization/members',{username:memberName,password:memberPassword});assert.equal(memberCreated.statusCode,200,memberCreated.body);
 const granted=await a.req('PUT',`/api/projects/${p}/members/${memberCreated.json().id}`,{revision:null,permissions:['review']});assert.equal(granted.statusCode,200,granted.body);
 const memberLogin=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username:memberName,password:memberPassword}});assert.equal(memberLogin.statusCode,200,memberLogin.body);
 const memberCookie=String(memberLogin.headers['set-cookie']).split(';')[0],current=await state(a,p);
 const memberPreview=await app.inject({method:'POST',url:`/api/projects/${p}/unified-aliases/preview`,headers:{origin,cookie:memberCookie},payload:{revision:current.revision,documents:current.documents,command:{action:'audit-entity',text:'秘密甲乙',type:'raw_%E5%90%88%E6%88%90%E7%B1%BB%E5%9E%8B'}}});assert.equal(memberPreview.statusCode,403,memberPreview.body);
});
test('audit finds a partially overlapping different type and replaces only the authenticated selected occurrence',async()=>{
 const a=await account(),p=(await a.req('POST','/api/projects',{name:'合成审计交叠'})).json().id as string,id=await doc(a,p,'前文甲乙丙丁后文甲乙丙丁');
 let view=(await a.req('GET',`/api/documents/${id}`)).json();const manual=(start:number)=>({start,end:start+3,kind:'自定义',rawEntityType:'旧类别',decision:'pending',sources:[{layer:'manual',code:'test-overlap'}]});
 const reviewed=await a.req('PUT',`/api/documents/${id}/review`,{revision:view.revision,marks:[...view.marks,manual(2),manual(8)]});assert.equal(reviewed.statusCode,200,reviewed.body);
 assert.equal((await call(a,p,{action:'enable'})).statusCode,200);
 const audit=await call(a,p,{action:'audit-entity',text:'乙丙丁',type:'raw_%E6%96%B0%E7%B1%BB%E5%88%AB'},true);assert.equal(audit.statusCode,200,audit.body);assert.equal(audit.json().audit.otherTypeMatches.length,2,JSON.stringify(audit.json().audit));
 const row=audit.json().audit.otherTypeMatches[0];assert.equal(row.documentId,id);assert.equal(row.covering.entityType,'旧类别');
 const replaced=await call(a,p,{action:'apply-audit-entity',text:'乙丙丁',type:'raw_%E6%96%B0%E7%B1%BB%E5%88%AB',operation:'replace-other-one',target:{documentId:id,start:row.start,end:row.end,...row.hitId?{hitId:row.hitId}:{}}});assert.equal(replaced.statusCode,200,replaced.body);
 view=(await a.req('GET',`/api/documents/${id}`)).json();assert.ok(view.marks.some((m:any)=>m.rawEntityType==='新类别'&&m.start===3&&m.end===6));assert.equal(view.marks.filter((m:any)=>m.rawEntityType==='旧类别'&&m.decision!=='ignore').length,1);
 const bulk=await call(a,p,{action:'apply-audit-entity',text:'乙丙丁',type:'raw_%E6%96%B0%E7%B1%BB%E5%88%AB',operation:'replace-other-all'});assert.equal(bulk.statusCode,200,bulk.body);assert.equal(bulk.json().affectedOccurrences,1);
 view=(await a.req('GET',`/api/documents/${id}`)).json();assert.equal(view.marks.filter((m:any)=>m.rawEntityType==='新类别'&&m.decision!=='ignore').length,2);assert.equal(view.marks.filter((m:any)=>m.rawEntityType==='旧类别'&&m.decision!=='ignore').length,0);
});
test('panel audit adds every proven miss, reports skipped queued material and makes zero-hit preview read only',async()=>{
 const a=await account(),p=(await a.req('POST','/api/projects',{name:'合成面板检查'})).json().id as string;
 const ready=await doc(a,p,'暗号甲乙出现两次，暗号甲乙。');
 assert.equal((await call(a,p,{action:'enable'})).statusCode,200);
 const pending=await a.req('POST',`/api/projects/${p}/documents`,{requestId:randomUUID(),text:'尚在识别的暗号甲乙'});assert.equal(pending.statusCode,200,pending.body);
 const nohitBefore=await state(a,p),nohit=await call(a,p,{action:'audit-entity',text:'完全不存在',type:'raw_%E5%AF%86%E7%A0%81'},true);assert.equal(nohit.statusCode,200,nohit.body);assert.equal(nohit.json().audit.totalCount,0);assert.deepEqual((await state(a,p)).documents,nohitBefore.documents);
 const audit=await call(a,p,{action:'audit-entity',text:'暗号甲乙',type:'raw_%E5%AF%86%E7%A0%81'},true);assert.equal(audit.statusCode,200,audit.body);assert.equal(audit.json().audit.uncoveredMatches.length,2);assert.ok(audit.json().audit.skippedFiles.some((row:any)=>row.fileId===pending.json().id));
 const applied=await call(a,p,{action:'apply-audit-entity',text:'暗号甲乙',type:'raw_%E5%AF%86%E7%A0%81',operation:'add-uncovered'});assert.equal(applied.statusCode,200,applied.body);assert.equal(applied.json().affectedOccurrences,2);
 const after=(await a.req('GET',`/api/documents/${ready}`)).json();assert.equal(after.marks.filter((m:any)=>m.rawEntityType==='密码'&&m.decision!=='ignore').length,2);
 const auditedAgain=await call(a,p,{action:'audit-entity',text:'暗号甲乙',type:'raw_%E5%AF%86%E7%A0%81'},true);assert.equal(auditedAgain.statusCode,200,auditedAgain.body);assert.equal(auditedAgain.json().audit.sameTypeCount,2);assert.equal(auditedAgain.json().audit.uncoveredMatches.length,0);
});
test('direct project add does not revive a wider ignored mark and preserves a distinct overlapping active mark',async()=>{
 const a=await account(),p=(await a.req('POST','/api/projects',{name:'合成不同跨度补录'})).json().id as string;
 const ignoredId=await doc(a,p,'前文甲乙丙丁后文'),activeId=await doc(a,p,'前文甲乙丙丁后文');
 for(const [id,decision] of [[ignoredId,'ignore'],[activeId,'pending']] as const){const view=(await a.req('GET',`/api/documents/${id}`)).json(),reviewed=await a.req('PUT',`/api/documents/${id}/review`,{revision:view.revision,marks:[...view.marks,{start:2,end:6,kind:'自定义',rawEntityType:'新类别',decision,sources:[{layer:'manual',code:'test-wider-mark'}]}]});assert.equal(reviewed.statusCode,200,reviewed.body);}
 assert.equal((await call(a,p,{action:'enable'})).statusCode,200);
 const command={action:'add-entity',text:'乙丙',type:'raw_%E6%96%B0%E7%B1%BB%E5%88%AB'},preview=await call(a,p,command,true);assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.json().affectedOccurrences,2);
 const applied=await call(a,p,command);assert.equal(applied.statusCode,200,applied.body);
 const ignored=(await a.req('GET',`/api/documents/${ignoredId}`)).json(),active=(await a.req('GET',`/api/documents/${activeId}`)).json();
 assert.ok(ignored.marks.some((m:any)=>m.start===2&&m.end===6&&m.rawEntityType==='新类别'&&m.decision==='ignore'));
 assert.ok(ignored.marks.some((m:any)=>m.start===3&&m.end===5&&m.rawEntityType==='新类别'&&m.decision!=='ignore'));
 assert.ok(active.marks.some((m:any)=>m.start===2&&m.end===6&&m.rawEntityType==='新类别'&&m.decision!=='ignore'));
 assert.ok(active.marks.some((m:any)=>m.start===3&&m.end===5&&m.rawEntityType==='新类别'&&m.decision!=='ignore'));
});
test('deleting a merged visible row expands all underlying keys without deleting an unselected entity',async()=>{
 const a=await account(),p=(await a.req('POST','/api/projects',{name:'合成合并实体删除'})).json().id as string;
 const one=await doc(a,p,'秘密甲乙和秘密丙丁及保留戊己'),two=await doc(a,p,'秘密甲乙及秘密丙丁');
 const original=(await admin.query('SELECT id,content,content_hash FROM documents WHERE project_id=$1 ORDER BY id',[p])).rows;
 assert.equal((await call(a,p,{action:'enable'})).statusCode,200);
 const type='raw_%E5%90%88%E6%88%90%E7%B1%BB%E5%9E%8B';
 for(const text of ['秘密甲乙','秘密丙丁','保留戊己']){const added=await call(a,p,{action:'add-entity',text,type});assert.equal(added.statusCode,200,added.body);}
 const rowsBefore=(await state(a,p)).rows,first=rowsBefore.find((row:any)=>row.normalized==='秘密甲乙'&&row.baseType===type),second=rowsBefore.find((row:any)=>row.normalized==='秘密丙丁'&&row.baseType===type),kept=rowsBefore.find((row:any)=>row.normalized==='保留戊己'&&row.baseType===type);assert.ok(first&&second&&kept);
 const historical=(await admin.query('SELECT document_id,revision,content_hash,marks FROM review_snapshots WHERE project_id=$1 ORDER BY document_id,revision',[p])).rows;
 const merged=await call(a,p,{action:'merge',keys:[first.key,second.key],token:first.token});assert.equal(merged.statusCode,200,merged.body);
 const stateAfterMerge=await state(a,p),visible=stateAfterMerge.rows.find((row:any)=>row.key===first.key&&row.mergedKeys?.includes(second.key));assert.ok(visible,JSON.stringify(stateAfterMerge.rows));
 const preview=await call(a,p,{action:'delete-entity',keys:[visible.key]},true);assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.json().affectedOccurrences,4);assert.equal(preview.json().affectedDocuments,2);
 const deleted=await call(a,p,{action:'delete-entity',keys:[visible.key]});assert.equal(deleted.statusCode,200,deleted.body);assert.equal(deleted.json().affectedOccurrences,4);assert.equal(deleted.json().affectedDocuments,2);
 const sources:Record<string,string>={[one]:'秘密甲乙和秘密丙丁及保留戊己',[two]:'秘密甲乙及秘密丙丁'};
 for(const id of [one,two]){const view=(await a.req('GET',`/api/documents/${id}`)).json();for(const value of ['秘密甲乙','秘密丙丁'])assert.ok(view.marks.some((m:any)=>m.rawEntityType==='合成类型'&&m.decision==='ignore'&&sources[id].slice(m.start,m.end)===value));}
 const keptView=(await a.req('GET',`/api/documents/${one}`)).json();assert.ok(keptView.marks.some((m:any)=>m.rawEntityType==='合成类型'&&m.decision!=='ignore'&&sources[one].slice(m.start,m.end)==='保留戊己'));
 assert.deepEqual((await admin.query('SELECT id,content,content_hash FROM documents WHERE project_id=$1 ORDER BY id',[p])).rows,original);
 for(const snapshot of historical){const [current]=(await admin.query('SELECT document_id,revision,content_hash,marks FROM review_snapshots WHERE document_id=$1 AND revision=$2',[snapshot.document_id,snapshot.revision])).rows;assert.deepEqual(current,snapshot);}
 const oldCas=await a.req('POST',`/api/projects/${p}/unified-aliases`,{revision:stateAfterMerge.revision,documents:stateAfterMerge.documents,command:{action:'delete-entity',keys:[visible.key]}});assert.equal(oldCas.statusCode,409,oldCas.body);
});
