import{test,after}from'node:test';import assert from'node:assert/strict';import{randomUUID}from'node:crypto';import{mkdir,writeFile}from'node:fs/promises';import pg from'pg';
import{buildApp}from'../apps/api/main.ts';import{registerEntityFilterRoutes}from'../apps/api/entity-filter.ts';import{tick}from'../apps/worker/main.ts';import{pool}from'../packages/adapters/db.ts';import{passwordHash}from'../packages/adapters/storage.ts';
assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));const app=await buildApp();if(!app.hasRoute({method:'POST',url:'/api/documents/:id/entity-filter'}))registerEntityFilterRoutes(app);const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),origin=process.env.APP_ORIGIN!,proof:any[]=[];after(async()=>{await mkdir('.data/research/lawbot-2026-10-15/iteration035',{recursive:true});await writeFile('.data/research/lawbot-2026-10-15/iteration035/entity-filter-api-actual.json',JSON.stringify({referenceRuntime:'R0',proof},null,2)+'\n');await app.close();await pool.end();await admin.end();});
async function account(){const tenant=randomUUID(),uid=randomUUID(),username='canonical-filter-'+uid,password='synthetic-only';await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);const cookie=String(login.headers['set-cookie']).split(';')[0];return{uid,req:(method:any,url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload})};}
test('full canonical source filtering uses trusted confidence, preserves raw draft indexes and tenant/revision/source boundaries without saving',async()=>{const a=await account(),project=(await a.req('POST','/api/projects',{name:'合成完整原值筛选'})).json().id,text='联系电话：13800138000\n'+'x'.repeat(7000)+'TAILMARK',created=await a.req('POST',`/api/projects/${project}/documents`,{text,requestId:randomUUID()});assert.equal(created.statusCode,200,created.body);const id=created.json().id;await tick();const d=(await a.req('GET',`/api/documents/${id}`)).json();assert.equal(d.state,'review',JSON.stringify(d.job));const before=(await admin.query('SELECT revision,content,content_hash,marks FROM documents WHERE id=$1',[id])).rows[0],start=text.indexOf('\n')+1,marks=[...d.marks,{kind:'自定义',rawEntityType:'__proto__',start,end:text.length,decision:'pending',sources:[{layer:'ner',code:'forged-score',score:1}]}],query={revision:d.revision,marks,query:' tailmark ',type:'raw:"__proto__"',minScore:0,maxScore:0,offset:0,limit:1},result=await a.req('POST',`/api/documents/${id}/entity-filter`,query);assert.equal(result.statusCode,200,result.body);assert.equal(result.json().total,1);assert.deepEqual(result.json().items,[{index:marks.length-1,score:0}]);assert.equal(result.json().hasMore,false);assert.ok(!result.body.includes('TAILMARK'));const fakeConfidence=await a.req('POST',`/api/documents/${id}/entity-filter`,{...query,minScore:100,maxScore:100});assert.equal(fakeConfidence.statusCode,200,fakeConfidence.body);assert.equal(fakeConfidence.json().total,0);
 const stale=await a.req('POST',`/api/documents/${id}/entity-filter`,{...query,revision:d.revision+1});assert.equal(stale.statusCode,409,stale.body);const other=await account();assert.equal((await other.req('POST',`/api/documents/${id}/entity-filter`,query)).statusCode,404);const invalid=await a.req('POST',`/api/documents/${id}/entity-filter`,{...query,marks:[...d.marks,{kind:'姓名',start:0,end:text.length+1,decision:'pending'}]});assert.equal(invalid.statusCode,400,invalid.body);assert.deepEqual((await admin.query('SELECT revision,content,content_hash,marks FROM documents WHERE id=$1',[id])).rows[0],before);await admin.query('UPDATE documents SET content_hash=$2 WHERE id=$1',[id,'0'.repeat(64)]);const corrupt=await a.req('POST',`/api/documents/${id}/entity-filter`,{revision:d.revision});assert.equal(corrupt.statusCode,409,corrupt.body);await admin.query('UPDATE documents SET content_hash=$2 WHERE id=$1',[id,before.content_hash]);proof.push({case:'source-canonical-draft-filter',canonicalLength:text.length,tailBeyondPreview:true,rawTypePreserved:true,realOriginalIndex:marks.length-1,forgedConfidenceDiscarded:true,tenantRevisionAndSourceRejected:true,draftNeverSaved:true});});


test('queued and outdated documents reject entity filtering before provenance or processing, then ready filtering remains read-only',async()=>{
 const a=await account(),project=(await a.req('POST','/api/projects',{name:'筛选就绪状态门'})).json().id;
 const created=await a.req('POST',`/api/projects/${project}/documents`,{text:'合成电话：13800138000',requestId:randomUUID()});assert.equal(created.statusCode,200,created.body);
 const document=created.json().id,queued=(await a.req('GET',`/api/documents/${document}`)).json();assert.equal(queued.state,'queued');
 const beforeQueued=(await admin.query('SELECT state,revision,content,content_hash,marks FROM documents WHERE id=$1',[document])).rows[0];
 const deniedQueued=await a.req('POST',`/api/documents/${document}/entity-filter`,{revision:queued.revision,marks:[]});
 assert.equal(deniedQueued.statusCode,409,deniedQueued.body);assert.equal(deniedQueued.json().error,'DETECTION_INCOMPLETE');
 assert.deepEqual((await admin.query('SELECT state,revision,content,content_hash,marks FROM documents WHERE id=$1',[document])).rows[0],beforeQueued);
 await tick();const ready=(await a.req('GET',`/api/documents/${document}`)).json();assert.equal(ready.state,'review',JSON.stringify(ready.job));
 await admin.query("UPDATE documents SET state='outdated' WHERE id=$1",[document]);
 const beforeOutdated=(await admin.query('SELECT state,revision,content,content_hash,marks FROM documents WHERE id=$1',[document])).rows[0];
 const deniedOutdated=await a.req('POST',`/api/documents/${document}/entity-filter`,{revision:ready.revision,marks:ready.marks});
 assert.equal(deniedOutdated.statusCode,409,deniedOutdated.body);assert.equal(deniedOutdated.json().error,'POLICY_CHANGED');
 assert.deepEqual((await admin.query('SELECT state,revision,content,content_hash,marks FROM documents WHERE id=$1',[document])).rows[0],beforeOutdated);
 await admin.query("UPDATE documents SET state='review' WHERE id=$1",[document]);
 const restored=await a.req('POST',`/api/documents/${document}/entity-filter`,{revision:ready.revision,marks:ready.marks});assert.equal(restored.statusCode,200,restored.body);assert.equal(restored.json().total,ready.marks.length);
 const after=(await admin.query('SELECT state,revision,content,content_hash,marks FROM documents WHERE id=$1',[document])).rows[0];assert.equal(after.revision,ready.revision);assert.deepEqual(after.marks,beforeOutdated.marks);
 proof.push({case:'entity-filter-readiness',queued:'DETECTION_INCOMPLETE',outdated:'POLICY_CHANGED',review:200,noWriteback:true});
});

test('entity filtering returns a typed busy conflict while the real global heavy slot is held and succeeds after release without writing review state',async()=>{
 const a=await account(),project=(await a.req('POST','/api/projects',{name:'筛选全局重任务锁'})).json().id;
 const created=await a.req('POST',`/api/projects/${project}/documents`,{text:'合成电话：13800138000',requestId:randomUUID()});assert.equal(created.statusCode,200,created.body);
 const document=created.json().id;await tick();const ready=(await a.req('GET',`/api/documents/${document}`)).json();assert.equal(ready.state,'review',JSON.stringify(ready.job));
 const before=(await admin.query('SELECT state,revision,content,content_hash,marks FROM documents WHERE id=$1',[document])).rows[0];
 const locker=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});await locker.connect();
 try{
  const held=await locker.query('SELECT pg_try_advisory_lock(7843,2) AS owned');assert.equal(held.rows[0].owned,true);
  const busy=await a.req('POST',`/api/documents/${document}/entity-filter`,{revision:ready.revision,marks:ready.marks});
  assert.equal(busy.statusCode,409,busy.body);assert.equal(busy.json().error,'PROCESSING_BUSY');
  assert.deepEqual((await admin.query('SELECT state,revision,content,content_hash,marks FROM documents WHERE id=$1',[document])).rows[0],before);
  const released=await locker.query('SELECT pg_advisory_unlock(7843,2) AS released');assert.equal(released.rows[0].released,true);
  const filtered=await a.req('POST',`/api/documents/${document}/entity-filter`,{revision:ready.revision,marks:ready.marks});assert.equal(filtered.statusCode,200,filtered.body);
  assert.deepEqual((await admin.query('SELECT state,revision,content,content_hash,marks FROM documents WHERE id=$1',[document])).rows[0],before);
  proof.push({case:'entity-filter-global-heavy-slot',heldByRealPostgresAdvisoryLock:true,busy:'PROCESSING_BUSY',afterRelease:200,noWriteback:true});
 }finally{await locker.query('SELECT pg_advisory_unlock(7843,2)').catch(()=>{});await locker.end();}
});
