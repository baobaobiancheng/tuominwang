import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
import type {InjectOptions} from 'fastify';
import sharp from 'sharp';
import {buildApp} from '../apps/api/main.ts';
import {registerWorkspacePortableRoutes} from '../apps/api/workspace-portable.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {hash,passwordHash,readArtifact,readOriginal} from '../packages/adapters/storage.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(new URL(process.env.MIGRATION_DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(process.env.DATA_DIR?.includes('/.data/test-runs/run-'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
if(!app.hasRoute({method:'POST',url:'/api/portable/import'}))registerWorkspacePortableRoutes(app);
after(async()=>{await app.close();await pool.end();await admin.end();});

test('native OCR map restoration releases only newly written maps on real heavy-slot busy and a known callback rollback',{timeout:180000},async()=>{
 const tenant=randomUUID(),user=randomUUID(),username='map-cleanup-'+user,password='synthetic-map-cleanup',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:string,url:string,payload?:InjectOptions['payload'],binary=false)=>app.inject({method:method as any,url,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload});
 const sourceProjectResponse=await req('POST','/api/projects',{name:'map-cleanup-source'});assert.equal(sourceProjectResponse.statusCode,200,sourceProjectResponse.body);
 const sourceProject=sourceProjectResponse.json().id as string;
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="900" height="180"><rect width="100%" height="100%" fill="white"/><text x="30" y="110" font-family="Arial" font-size="66">13800138000</text></svg>';
 const image=await sharp(Buffer.from(svg)).png().toBuffer(),batch=randomUUID(),requestId=randomUUID();
 const batchResponse=await req('POST',`/api/projects/${sourceProject}/upload-batches`,{id:batch,files:[{requestId,path:'map-cleanup.png',size:image.length}]});assert.equal(batchResponse.statusCode,200,batchResponse.body);
 const uploaded=await req('POST',`/api/projects/${sourceProject}/files?batchId=${batch}&requestId=${requestId}`,image,true);assert.equal(uploaded.statusCode,200,uploaded.body);
 const sourceDoc=uploaded.json().id as string;assert.equal(await tick(),true);
 const beforeCorrection=(await admin.query('SELECT * FROM documents WHERE id=$1',[sourceDoc])).rows[0];assert.equal(beforeCorrection.state,'review');
 const ocr=await req('GET',`/api/documents/${sourceDoc}/pages/0/ocr-text?revision=${beforeCorrection.revision}`);assert.equal(ocr.statusCode,200,ocr.body);
 const oldText=ocr.json().text as string,index=oldText.indexOf('13800138000')+10;assert.ok(index>=10,oldText);
 const corrected=await req('PUT',`/api/documents/${sourceDoc}/pages/0/ocr-text`,{revision:beforeCorrection.revision,start:index,end:index+1,expectedText:'0',text:'1'});assert.equal(corrected.statusCode,200,corrected.body);
 const backup=await req('POST',`/api/projects/${sourceProject}/portable/export`,{password:'synthetic-map-backup',format:'native'});assert.equal(backup.statusCode,200,backup.body);
 const imported=await req('POST','/api/portable/import',{name:'map-cleanup-import',password:'synthetic-map-backup',bytesBase64:backup.rawPayload.toString('base64')});assert.equal(imported.statusCode,200,imported.body);
 const project=imported.json().id as string,[freshIndex]=(await admin.query('SELECT id FROM documents WHERE project_id=$1',[project])).rows;assert.ok(freshIndex);
 assert.equal(await tick(),true);
 const freshId=freshIndex.id as string,fresh=(await admin.query('SELECT * FROM documents WHERE id=$1',[freshId])).rows[0];assert.equal(fresh.state,'review');
 const ownerDir=resolve(process.env.DATA_DIR!,'.owners',freshId),owned=async()=>(await readdir(ownerDir)).sort();
 const originalOwnerFiles=await owned(),oldMap=fresh.page_data[0].mapId as string,oldMapHash=fresh.page_data[0].mapHash as string,oldMapText=await readArtifact(oldMap),sourceBytes=await readOriginal(fresh.source_id);
 assert.ok(originalOwnerFiles.includes(oldMap));assert.equal(hash(oldMapText),oldMapHash);assert.deepEqual(sourceBytes,image);
 const row=async()=>{const [d]=(await admin.query('SELECT revision,state,content,content_hash,marks,anchors,page_data,recognition,visual_candidates,page_review FROM documents WHERE id=$1',[freshId])).rows;const [p]=(await admin.query('SELECT portable_state FROM projects WHERE id=$1',[project])).rows;return{document:d,portableState:p.portable_state};};
 const before=await row(),url=`/api/documents/${freshId}/portable-draft/restore`,payload={revision:fresh.revision};
 // This dedicated PostgreSQL session holds the same production heavy-slot
 // advisory lock. The adapter writes the new map before runProcessing tries it.
 const locker=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});await locker.connect();
 try{
  const lock=await locker.query('SELECT pg_try_advisory_lock(7843,2) AS owned');assert.equal(lock.rows[0].owned,true);
  const busy=await req('POST',url,payload);assert.equal(busy.statusCode,409,busy.body);assert.equal(busy.json().error,'PROCESSING_BUSY');
  assert.deepEqual(await row(),before);assert.deepEqual(await owned(),originalOwnerFiles);assert.equal(await readArtifact(oldMap),oldMapText);assert.deepEqual(await readOriginal(fresh.source_id),sourceBytes);
  console.log('PORTABLE_MAP_BUSY '+JSON.stringify({status:busy.statusCode,error:busy.json().error,revision:before.document.revision,oldMap,ownerCount:originalOwnerFiles.length,ownedFilesUnchanged:true,sqlUnchanged:true,sourceUnchanged:true}));
 }finally{await locker.query('SELECT pg_advisory_unlock(7843,2)');await locker.end();}
 // A test-only audit trigger aborts *after* document/project writes, before
 // the projectScope callback completes. Transaction rollback is known here.
 await admin.query('CREATE SEQUENCE synthetic_restore_callback_probe');
 // The application role needs access to this test-only witness sequence.
 assert.equal((await pool.query('SELECT current_user AS name')).rows[0].name,'tmw_app');
 await admin.query('GRANT USAGE ON SEQUENCE synthetic_restore_callback_probe TO tmw_app');
 await admin.query(`CREATE FUNCTION synthetic_restore_abort() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.event='portable_draft_restored' AND NEW.project_id='${project}'::uuid THEN PERFORM nextval('synthetic_restore_callback_probe'); RAISE EXCEPTION 'SYNTHETIC_RESTORE_CALLBACK_ABORT'; END IF; RETURN NEW; END$$`);
 await admin.query('CREATE TRIGGER synthetic_restore_abort BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION synthetic_restore_abort()');
 try{
  const failed=await req('POST',url,payload);assert.equal(failed.statusCode,500,failed.body);assert.equal(failed.json().error,'INTERNAL_ERROR');
  const witness=(await admin.query('SELECT last_value,is_called FROM synthetic_restore_callback_probe')).rows[0];assert.equal(witness.is_called,true);assert.equal(String(witness.last_value),'1','trigger was reached after prior document/project SQL');
  assert.deepEqual(await row(),before);assert.deepEqual(await owned(),originalOwnerFiles);assert.equal(await readArtifact(oldMap),oldMapText);assert.deepEqual(await readOriginal(fresh.source_id),sourceBytes);
  console.log('PORTABLE_MAP_CALLBACK_ROLLBACK '+JSON.stringify({status:failed.statusCode,error:failed.json().error,revision:before.document.revision,oldMap,ownerCount:originalOwnerFiles.length,ownedFilesUnchanged:true,sqlUnchanged:true,sourceUnchanged:true}));
 }finally{await admin.query('DROP TRIGGER synthetic_restore_abort ON audit');await admin.query('DROP FUNCTION synthetic_restore_abort()');await admin.query('DROP SEQUENCE synthetic_restore_callback_probe');}
 const good=await req('POST',url,payload);assert.equal(good.statusCode,200,good.body);
 const successful=(await admin.query('SELECT revision,page_data FROM documents WHERE id=$1',[freshId])).rows[0];assert.equal(successful.revision,fresh.revision+1);
 assert.notEqual(successful.page_data[0].mapId,oldMap);assert.equal(hash(await readArtifact(successful.page_data[0].mapId)),successful.page_data[0].mapHash);
 assert.ok((await owned()).includes(oldMap));assert.deepEqual(await readOriginal(fresh.source_id),sourceBytes);
 console.log('PORTABLE_MAP_SUCCESS '+JSON.stringify({status:good.statusCode,oldMap,newMap:successful.page_data[0].mapId,revision:successful.revision,oldMapPreserved:true,sourceUnchanged:true}));
});
