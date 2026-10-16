import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import http from 'node:http';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {writeLegacyWorkspaceToFile} from '../packages/core/workspace-legacy-stream.ts';
import {convertReferenceWorkspaceFile,openReferenceWorkspaceFile} from '../packages/core/workspace-reference-file-actions.ts';
import {writePortableWorkspace} from '../packages/core/workspace-portable.ts';
import {openTmmZipFromSecureFile,writeTmmZipToSecureFile,TMM_V3_ZIP_BUDGET} from '../packages/core/workspace-zip-stream.ts';
import {createTmmTransferSlot} from '../packages/core/workspace-secure-stream.ts';
assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app=await buildApp(),admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
after(async()=>{await app.close();await pool.end();await admin.end();});
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function multipart(parts:[string,string|Buffer][],truncate=false){const boundary='tmw-'+randomUUID(),pieces:Buffer[]=[];for(const[name,value]of parts){pieces.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"${Buffer.isBuffer(value)?'; filename="review.tmm"\r\nContent-Type: application/octet-stream':''}\r\n\r\n`));pieces.push(Buffer.isBuffer(value)?value:Buffer.from(value));pieces.push(Buffer.from('\r\n'));}if(!truncate)pieces.push(Buffer.from(`--${boundary}--\r\n`));return{body:Buffer.concat(pieces),type:`multipart/form-data; boundary=${boundary}`};}
const snapshot=(entry:string)=>({schemaVersion:2,projectId:'source-project',projectName:'source review',createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z',activeDocumentId:'source-doc',contentRevision:1,workspaceCorrections:[],reviewDecisionEvents:[],profileSnapshot:null,documents:[{id:'source-doc',fileName:'source.pdf',fileKind:'pdf',sourceEntry:entry,detection:{entities:[],bboxes:[],ocrCachePages:[],documentText:'PUBLIC 13800138000'},review:{schemaVersion:1,kind:'pdf',isPreviewMode:false,hasVisitedPreview:false,enablePseudonymization:false,pseudonymEntries:[],maskStyle:'black',entities:[],pageRotations:{},manualOnlyRotationPages:[],viewport:{pageNumber:1,scale:1}},exportState:{kind:'pdf',mode:'default_star',exportMarkdown:false,pseudonymTableName:'source',redact:true,redactPseudo:false,maskStyle:'black',exportDocx:false}}]});
test('file3 multipart >50 MiB conversion, profile CAS, malformed parts and cleanup',{timeout:180000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tmw-file3-api-test-'));
 try{
  const tenant=randomUUID(),user=randomUUID(),username='file3-'+user,loginPassword='synthetic-login',transferPassword='synthetic-transfer-password',origin=process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(loginPassword)]);
  const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password:loginPassword}});assert.equal(login.statusCode,200,login.body);
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  const send=(url:string,parts:[string,string|Buffer][],truncate=false,authenticated=true)=>{const body=multipart(parts,truncate);return app.inject({method:'POST',url,headers:{origin,...authenticated?{cookie}:{},'content-type':body.type},payload:body.body});};
  const entry='documents/source-doc/source.pdf',source=randomBytes(52*1024*1024),sourcePath=join(directory,'source.pdf'),archivePath=join(directory,'source.tmm');
  await writeFile(sourcePath,source);await writeLegacyWorkspaceToFile({snapshot:snapshot(entry) as any,sources:new Map([[entry,{bytes:source.length,sha256:sha(source),openReadStream:()=>createReadStream(sourcePath)}]]),outputPath:archivePath});
  const archive=await readFile(archivePath);assert.ok(archive.length>50*1024*1024);
  const before=(await readdir(tmpdir())).filter(name=>name.startsWith('tmw-file-action-')).sort();
  const converted=await send('/api/portable/migrate-file',[['file',archive],['newPassword',transferPassword],['format','secure-v3']]);assert.equal(converted.statusCode,200,converted.body.slice(0,200));
  const abortBody=multipart([['file',archive],['newPassword',transferPassword],['format','secure-v3']]);
  const address=await app.listen({host:'127.0.0.1',port:0}),port=Number(new URL(address).port);
  let publishedStatus:number|undefined;
  const client=http.request({hostname:'127.0.0.1',port,path:'/api/portable/migrate-file',method:'POST',headers:{origin,cookie,'content-type':abortBody.type,'content-length':String(abortBody.body.length)}},response=>{publishedStatus=response.statusCode;response.resume();});
  client.on('error',()=>{});
  const sent=new Promise<void>(resolve=>client.once('finish',resolve));client.end(abortBody.body);await sent;
  let uploaded=false;
  for(let i=0;i<250;i++){
    for(const name of(await readdir(tmpdir())).filter(name=>name.startsWith('tmw-file-action-')&&!before.includes(name))){
      try{if((await stat(join(tmpdir(),name,'input.tmm'))).size===archive.length)uploaded=true;}catch{}
    }
    if(uploaded)break;await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(uploaded,true,'actual full multipart file reached private spool before disconnect');
  client.destroy();
  let cleaned=false;
  for(let i=0;i<250;i++){const current=(await readdir(tmpdir())).filter(name=>name.startsWith('tmw-file-action-')).sort();if(JSON.stringify(current)===JSON.stringify(before)){cleaned=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(cleaned,true,'cancelled conversion private spool cleaned');
  assert.notEqual(publishedStatus,200,'disconnected caller received no completed artifact');
  assert.ok(converted.rawPayload.length>50*1024*1024);const outputPath=join(directory,'converted.tmm');await writeFile(outputPath,converted.rawPayload);
  const opened=await openReferenceWorkspaceFile(outputPath,transferPassword);try{assert.equal(opened.snapshot.projectId,'source-project');assert.equal(opened.snapshot.documents[0].detection.documentText,'PUBLIC 13800138000');assert.equal(opened.sources.get(entry)!.sha256,sha(source));}finally{await opened.close();}
  const preview=await send('/api/portable/review-profile-file',[['password',transferPassword],['file',converted.rawPayload]]);assert.equal(preview.statusCode,200,preview.body);assert.ok(Array.isArray(preview.json().corrections));
  const created=await app.inject({method:'POST',url:'/api/projects',headers:{origin,cookie},payload:{name:'file profile target'}});assert.equal(created.statusCode,200,created.body);const project=created.json().id;
  const profile=`/api/projects/${project}/portable/review-profile-file`;
  const unauth=await send(profile,[['file',archive],['revision','0']],false,false);assert.equal(unauth.statusCode,401,unauth.body);
  const applied=await send(profile,[['file',converted.rawPayload],['password',transferPassword],['revision','0'],['choices','{}']]);assert.equal(applied.statusCode,200,applied.body);assert.equal(applied.json().revision,1);assert.equal(applied.json().requiresRecognitionAndReview,true);
  const stale=await send(profile,[['revision','0'],['choices','{}'],['password',transferPassword],['file',converted.rawPayload]]);assert.equal(stale.statusCode,409,stale.body);
  const small=Buffer.from('PUBLIC 13800138000');
  const smallSnapshot=snapshot(entry) as any;
  smallSnapshot.documents[0].review.entities.push({id:'review-one',type:'客户代码A',text:'PUBLIC',startOffset:0,endOffset:6,userAdded:true});
  const validLegacy=await writePortableWorkspace(smallSnapshot,new Map([[entry,small]]),{format:'legacy-zip'});
  const validLegacyPath=join(directory,'valid-legacy.tmm'),validPath=join(directory,'valid-v3.tmm'),tamperedPath=join(directory,'tampered-v3.tmm');
  await writeFile(validLegacyPath,validLegacy);
  await convertReferenceWorkspaceFile({sourcePath:validLegacyPath,outputPath:validPath,newPassword:transferPassword,format:'secure-v3'});
  const zip=await openTmmZipFromSecureFile(validPath,transferPassword,TMM_V3_ZIP_BUDGET);
  const entries:{name:string;bytes:Buffer}[]=[];
  try{for(const name of zip.entries.keys()){const chunks:Buffer[]=[];for await(const part of await zip.openEntry(name))chunks.push(Buffer.from(part));entries.push({name,bytes:Buffer.concat(chunks)});}}
  finally{await zip.close();}
  const sealEntries=async(outputPath:string,parts:{name:string;bytes:Buffer}[])=>{const dek=randomBytes(32);
   try{const slot=await createTmmTransferSlot(transferPassword,dek);await writeTmmZipToSecureFile({outputPath,objectId:'source-project',dek,keySlots:[slot],objectType:'tmm-transfer',budget:TMM_V3_ZIP_BUDGET,entries:parts.map(({name,bytes})=>({name,bytes:bytes.length,sha256:sha(bytes),store:false,openReadStream:()=>Readable.from([bytes])}))});}
   finally{dek.fill(0);}};
  await sealEntries(tamperedPath,entries.map(({name,bytes})=>({name,bytes:name===entry?Buffer.from(bytes):bytes})).map(part=>{if(part.name===entry)part.bytes[0]^=1;return part;}));
  const tamperedZip=await openTmmZipFromSecureFile(tamperedPath,transferPassword,TMM_V3_ZIP_BUDGET);
  try{const m=await tamperedZip.readJson('manifest.json');assert.equal(m.documents[0].sourceSha256,sha(small));assert.equal(tamperedZip.entries.get(entry)?.uncompressedSize,small.length);const chunks:Buffer[]=[];for await(const part of await tamperedZip.openEntry(entry))chunks.push(Buffer.from(part));assert.notEqual(sha(Buffer.concat(chunks)),sha(small));}
  finally{await tamperedZip.close();}
  const tampered=await readFile(tamperedPath);
  const badPreview=await send('/api/portable/review-profile-file',[['file',tampered],['password',transferPassword]]);
  const badApply=await send(profile,[['file',tampered],['password',transferPassword],['revision','1'],['choices','{}']]);
  assert.equal(badPreview.statusCode,400,badPreview.body);assert.equal(badApply.statusCode,400,badApply.body);
  assert.equal(badPreview.json().error,'PORTABLE_SOURCE_MISMATCH');assert.equal(badApply.json().error,'PORTABLE_SOURCE_MISMATCH');
  assert.equal((await admin.query('SELECT preset_revision FROM projects WHERE id=$1',[project])).rows[0].preset_revision,1);
  const manifest=JSON.parse(entries.find(part=>part.name==='manifest.json')!.bytes.toString('utf8'));
  const segments=manifest.documents[0].collections['review.entities'];assert.equal(manifest.documents[0].reviewEntityCount,1);
  const lookupName=`documents/source-doc/lookups/review/${randomUUID()}.bin`,lookupBytes=Buffer.from('{"ordinal":0,"page":0}\n');
  const keyHash=sha(Buffer.from('review-one'));
  manifest.documents[0].reviewLookup={schemaVersion:1,layoutVersion:1,hashKey:sha(Buffer.from('lookup-key')),
   sourceFingerprint:sha(Buffer.from(JSON.stringify(segments.map((segment:any)=>[segment.sha256,segment.itemCount,segment.uncompressedBytes])))),
   entityRecords:1,idRecords:0,pageRecords:1,records:2,buckets:[{name:lookupName.split('/').at(-1),count:2,bytes:lookupBytes.length,
    sha256:sha(lookupBytes),first:`ordinal|${keyHash}`,last:`page:0|${keyHash}`}]};
  const lookupEntries=entries.filter(part=>part.name!=='manifest.json').concat({name:'manifest.json',bytes:Buffer.from(JSON.stringify(manifest))},{name:lookupName,bytes:lookupBytes});
  const lookupPath=join(directory,'lookup-valid-v3.tmm'),badLookupPath=join(directory,'lookup-tampered-v3.tmm');
  await sealEntries(lookupPath,lookupEntries);
  const lookupOpened=await openReferenceWorkspaceFile(lookupPath,transferPassword);await lookupOpened.close();
  await sealEntries(badLookupPath,lookupEntries.map(part=>part.name===lookupName?{name:part.name,bytes:Buffer.from(part.bytes.map((byte,index)=>index===0?byte^1:byte))}:part));
  const badLookup=await readFile(badLookupPath);
  const badLookupPreview=await send('/api/portable/review-profile-file',[['file',badLookup],['password',transferPassword]]);
  const badLookupApply=await send(profile,[['file',badLookup],['password',transferPassword],['revision','1'],['choices','{}']]);
  assert.equal(badLookupPreview.statusCode,400,badLookupPreview.body);assert.equal(badLookupApply.statusCode,400,badLookupApply.body);
  assert.equal(badLookupPreview.json().error,'PORTABLE_SOURCE_MISMATCH');assert.equal(badLookupApply.json().error,'PORTABLE_SOURCE_MISMATCH');
  assert.equal((await admin.query('SELECT preset_revision FROM projects WHERE id=$1',[project])).rows[0].preset_revision,1);
  const duplicate=await send('/api/portable/review-profile-file',[['file',archive],['file',archive]]);assert.equal(duplicate.statusCode,400,duplicate.body);
  const unknown=await send('/api/portable/review-profile-file',[['unknown','x'],['file',archive]]);assert.equal(unknown.statusCode,400,unknown.body);
  const truncated=await send('/api/portable/review-profile-file',[['file',archive]],true);assert.notEqual(truncated.statusCode,200,truncated.body);
  const after=(await readdir(tmpdir())).filter(name=>name.startsWith('tmw-file-action-')).sort();assert.deepEqual(after,before);
  const rows=await admin.query("SELECT event FROM audit WHERE project_id=$1 AND event='workspace_review_profile_applied'",[project]);assert.equal(rows.rows.length,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
