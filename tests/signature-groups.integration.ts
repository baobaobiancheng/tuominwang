import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {hash,passwordHash,readOriginal} from '../packages/adapters/storage.ts';
import {parseFile} from '../packages/core/files.ts';
import {parse as parseCsv} from 'csv-parse/sync';
import {parseOffice} from '../packages/core/office.ts';
import {readNativeOrReferencePortable,writeNativePortable} from '../packages/core/native-portable.ts';
import {officeFixture} from './office-fixtures.ts';
import {importedEntries} from '../packages/core/presets.ts';
import type {Mark} from '../packages/contracts/index.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app=await buildApp(),admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
after(async()=>{await app.close();await pool.end();await admin.end();});
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const pieces=['张','三','李','四','张','三'];
const cell=(value:string)=>`<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
async function material(format:'csv'|'docx'){
 if(format==='csv')return Buffer.from('签名,签名,签名,签名,签名,签名\n张,三,李,四,张,三\n');
 return officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:tbl><w:tr>${pieces.map(()=>cell('签名')).join('')}</w:tr><w:tr>${pieces.map(cell).join('')}</w:tr></w:tbl></w:body></w:document>`});
}
async function session(){
 const tenant=randomUUID(),user=randomUUID(),username='signature-'+user,password='synthetic-signature';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const origin=process.env.APP_ORIGIN!,login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,binary=false)=>app.inject({method,url,payload,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}}});
 const created=await req('POST','/api/projects',{name:'签名碎片隔离验收'});assert.equal(created.statusCode,200,created.body);
 return {tenant,req,project:created.json().id as string};
}
type Session=Awaited<ReturnType<typeof session>>;
async function upload(s:Session,format:'csv'|'docx'|'doc'|'wps',bytes:Buffer){
 const batch=randomUUID(),requestId=randomUUID();
 const manifest=await s.req('POST',`/api/projects/${s.project}/upload-batches`,{id:batch,files:[{requestId,path:`signature.${format}`,size:bytes.length}]});assert.equal(manifest.statusCode,200,manifest.body);
 const uploaded=await s.req('POST',`/api/projects/${s.project}/files?batchId=${batch}&requestId=${requestId}`,bytes,true);assert.equal(uploaded.statusCode,200,uploaded.body);
 await tick();const id=uploaded.json().id as string,url=`/api/documents/${id}`,view=(await s.req('GET',url)).json();
 assert.equal(view.state,'review',JSON.stringify(view.job));assert.equal(view.job.status,'succeeded',JSON.stringify(view.job));
 return {id,url,view};
}
function groups(marks:Mark[]){
 const signature=marks.filter(m=>m.signatureGroup),ids=[...new Set(signature.map(m=>m.signatureGroup!.id))];
 assert.equal(signature.length,6,JSON.stringify(signature));assert.equal(ids.length,3);
 assert.deepEqual(ids.map(id=>signature.filter(m=>m.signatureGroup!.id===id).length),[2,2,2]);
 assert.ok(signature.every(m=>!Object.hasOwn(m.signatureGroup!,'value')),'group JSON must not add complete names');
 return {signature,ids};
}
function reviewed(marks:Mark[]){const {ids}=groups(marks);return marks.map(m=>({...m,decision:m.signatureGroup?.id===ids[0]?'redact':'ignore'} as Mark));}
async function state(id:string){
 const d=(await admin.query('SELECT revision,marks,source_id,source_hash,content_hash FROM documents WHERE id=$1',[id])).rows[0];
 const snapshotCount=Number((await admin.query('SELECT count(*)::int AS n FROM review_snapshots WHERE document_id=$1',[id])).rows[0].n);
 return {revision:d.revision,marks:d.marks,sourceId:d.source_id,sourceHash:d.source_hash,contentHash:d.content_hash,snapshotCount};
}
async function rejectWithoutMutation(s:Session,url:string,id:string,revision:number,marks:Mark[],expected=409){
 const before=await state(id),response=await s.req('PUT',url+'/review',{revision,marks});
 assert.equal(response.statusCode,expected,response.body);assert.deepEqual(await state(id),before,'rejected review changed document or snapshots');
}

test('synthetic CSV and DOCX API upload → worker → atomic review → export/download; rejected edits are transactionally inert',{timeout:180000},async()=>{
 const s=await session(),uploads=[] as {id:string;url:string;format:'csv'|'docx';bytes:Buffer}[];
 for(const format of ['csv','docx'] as const){
  const bytes=await material(format),{id,url,view}=await upload(s,format,bytes),originalRevision=view.revision as number;
  const original=view.marks as Mark[],{signature}=groups(original),full=reviewed(original);
  const half=full.map(m=>m.start===signature[0].start&&m.end===signature[0].end?{...m,decision:'redact' as const}:m.start===signature[1].start&&m.end===signature[1].end?{...m,decision:'ignore' as const}:m);
  await rejectWithoutMutation(s,url,id,originalRevision,half);
  await rejectWithoutMutation(s,url,id,originalRevision,full.filter(m=>m!==full.find(v=>v.start===signature[0].start&&v.end===signature[0].end)));
  const forged=full.map(m=>m.start===signature[0].start&&m.end===signature[0].end?{...m,signatureGroup:{...m.signatureGroup!,id:'sig_'+'f'.repeat(32)}}:m);
  await rejectWithoutMutation(s,url,id,originalRevision,forged);
  const saved=await s.req('PUT',url+'/review',{revision:originalRevision,marks:full});assert.equal(saved.statusCode,200,saved.body);
  const revision=saved.json().revision as number;assert.equal(revision,originalRevision+1);
  await rejectWithoutMutation(s,url,id,originalRevision,full);
  const queued=await s.req('POST',url+'/export',{revision});assert.equal(queued.statusCode,200,queued.body);await tick();
  const current=(await s.req('GET',url)).json();assert.equal(current.job.status,'succeeded',JSON.stringify(current.job));
  const link=await s.req('POST',url+'/download-link',{revision});assert.equal(link.statusCode,200,link.body);
  const output=await app.inject({url:link.json().url});assert.equal(output.statusCode,200,output.body);
  const text=format==='csv'?parseFile(output.rawPayload,'csv').text:(await parseOffice(output.rawPayload,'docx')).text;
  assert.equal(text.split('【姓名】').length-1,2,JSON.stringify({format,text}));
  for(const fragment of ['李','四','张','三'])assert.ok(text.includes(fragment),JSON.stringify({format,text}));
  const stored=await state(id);assert.equal(hash(await readOriginal(stored.sourceId)),stored.sourceHash);assert.deepEqual(await readOriginal(stored.sourceId),bytes);
  uploads.push({id,url,format,bytes});
 }
 // Native portable includes reviewed group metadata. Import must never treat it
 // as authority, even when a self-consistent archive supplies an altered claim.
 const password='synthetic-signature-backup',backup=await s.req('POST',`/api/projects/${s.project}/portable/export`,{format:'native',password});assert.equal(backup.statusCode,200,backup.body);
 const opened=await readNativeOrReferencePortable(backup.rawPayload,{password});assert.equal(opened.kind,'native');if(opened.kind!=='native')throw Error('fixture');
 const native=structuredClone(opened.snapshot);for(const d of native.documents){
  const members=d.marks.filter((m:Mark)=>m.signatureGroup);assert.equal(members.length,6);
  for(const m of d.marks)m.decision='ignore';
  members[0].signatureGroup.id='sig_'+'e'.repeat(32);
 }
 const archiveSources=new Map([...opened.sources].filter(([name])=>name!=='workspace.json'&&name!=='manifest.json'));
 const manipulated=await writeNativePortable(native,archiveSources,{password});
 const imported=await s.req('POST','/api/portable/import',{name:'签名碎片重新复核',password,bytesBase64:manipulated.toString('base64')});assert.equal(imported.statusCode,200,imported.body);
 await tick();await tick();const rows=(await admin.query('SELECT id,source_format,source_id,source_hash FROM documents WHERE project_id=$1',[imported.json().id])).rows;
 assert.equal(rows.length,2);
 for(const d of rows){
  const url=`/api/documents/${d.id}`;let view=(await s.req('GET',url)).json();assert.equal(view.state,'review',JSON.stringify(view.job));
  const restored=await s.req('POST',url+'/portable-draft/restore',{revision:view.revision});assert.equal(restored.statusCode,200,restored.body);
  view=(await s.req('GET',url)).json();const {signature}=groups(view.marks as Mark[]);
  assert.ok(signature.every(m=>m.decision==='pending'),'imported approval was carried into fresh group');
  assert.ok(signature.every(m=>m.signatureGroup!.id!=='sig_'+'e'.repeat(32)),'foreign group identity survived restore');
  const original=uploads.find(item=>item.format===d.source_format)!;assert.ok(original);
  assert.deepEqual(await readOriginal(d.source_id),original.bytes);assert.equal(hash(original.bytes),d.source_hash);
  const denied=await s.req('POST',url+'/export',{revision:view.revision});assert.notEqual(denied.statusCode,200,'pending imported signature exported');
 }
});

test('legacy reviewed marks without group metadata cannot start a new export and keep their state',{timeout:180000},async()=>{
 const s=await session(),bytes=await material('csv'),{id,url,view}=await upload(s,'csv',bytes),allIgnored=(view.marks as Mark[]).map(m=>({...m,decision:'ignore' as const}));
 groups(allIgnored);const saved=await s.req('PUT',url+'/review',{revision:view.revision,marks:allIgnored});assert.equal(saved.statusCode,200,saved.body);
 const revision=saved.json().revision as number,stored=await state(id),first=allIgnored.find(m=>m.signatureGroup)!;
 const legacy=allIgnored.map(m=>{const {signatureGroup:_group,...plain}=m;return {...plain,decision:m.start===first.start&&m.end===first.end?'redact':'ignore'};});
 // Model a valid pre-upgrade snapshot, never a production write. Current
 // revision/marks/snapshot agree; only the historical group metadata is absent.
 await admin.query('UPDATE documents SET marks=$2::jsonb WHERE id=$1',[id,JSON.stringify(legacy)]);
 await admin.query('UPDATE review_snapshots SET marks=$3::jsonb WHERE document_id=$1 AND revision=$2',[id,revision,JSON.stringify(legacy)]);
 const before=await state(id),response=await s.req('POST',url+'/export',{revision});
 assert.equal(response.statusCode,409,response.body);assert.equal(response.json().error,'SIGNATURE_GROUP_RECOGNITION_REQUIRED');
 assert.deepEqual(await state(id),before,'legacy gate must not silently migrate or revoke review');
 assert.equal(hash(await readOriginal(stored.sourceId)),stored.sourceHash);
});

test('disabled name profile recognizes no signature group and still permits ordinary review/export',{timeout:180000},async()=>{
 const s=await session();
 const profile=await s.req('POST','/api/presets/profiles',{name:'合成禁用姓名'});assert.equal(profile.statusCode,200,profile.body);
 const settings=profile.json().settings;
 const changed=await s.req('PUT',`/api/presets/profiles/${settings.id}`,{revision:1,settings:{...settings,enabledEntityTypeIds:settings.enabledEntityTypeIds.filter((id:string)=>id!=='name_cn')}});
 assert.equal(changed.statusCode,200,changed.body);
 const applied=await s.req('PUT',`/api/projects/${s.project}/presets`,{revision:0,profileId:settings.id,profileRevision:2,rulesetId:null});assert.equal(applied.statusCode,200,applied.body);
 for(const format of ['csv','docx'] as const){
  const original=await material(format),{id,url,view}=await upload(s,format,original);
  assert.equal((view.marks as Mark[]).filter(m=>m.signatureGroup).length,0,JSON.stringify(view.marks));
  const marks=(view.marks as Mark[]).map(m=>({...m,decision:'ignore' as const}));
  const saved=await s.req('PUT',url+'/review',{revision:view.revision,marks});assert.equal(saved.statusCode,200,saved.body);
  const queued=await s.req('POST',url+'/export',{revision:saved.json().revision});assert.equal(queued.statusCode,200,queued.body);await tick();
  const link=await s.req('POST',url+'/download-link',{revision:saved.json().revision});assert.equal(link.statusCode,200,link.body);
  const bytes=(await app.inject({url:link.json().url})).rawPayload;
  const text=format==='csv'?parseFile(bytes,'csv').text:(await parseOffice(bytes,'docx')).text;
  assert.ok(text.includes('张')&&text.includes('三')&&text.includes('李')&&text.includes('四'),JSON.stringify({format,text}));
  assert.equal((await state(id)).sourceHash,hash(original));
 }
});

test('full logical-name forceSkip removes only the matching physical group',{timeout:180000},async()=>{
 const s=await session();
 const created=await s.req('POST','/api/presets/rulesets',{name:'合成完整姓名跳过'});assert.equal(created.statusCode,200,created.body);
 const settings=created.json().settings;
 const entries=importedEntries([{row:1,pattern:'张三',entityType:'name_cn',kind:'forceSkip',enabled:true}],'manual');
 const changed=await s.req('PUT',`/api/presets/rulesets/${settings.id}`,{revision:1,settings:{...settings,entries}});assert.equal(changed.statusCode,200,changed.body);
 const applied=await s.req('PUT',`/api/projects/${s.project}/presets`,{revision:0,profileId:null,rulesetId:settings.id,rulesetRevision:2});assert.equal(applied.statusCode,200,applied.body);
 const {url,view}=await upload(s,'csv',await material('csv'));
 const signatures=(view.marks as Mark[]).filter(m=>m.signatureGroup);
 assert.equal(signatures.length,2,JSON.stringify(signatures));
 assert.deepEqual(signatures.map(m=>view.text.slice(m.start,m.end)),['李','四']);
 const marks=(view.marks as Mark[]).map(m=>({...m,decision:m.signatureGroup?'redact' as const:'ignore' as const}));
 const saved=await s.req('PUT',url+'/review',{revision:view.revision,marks});assert.equal(saved.statusCode,200,saved.body);
 const queued=await s.req('POST',url+'/export',{revision:saved.json().revision});assert.equal(queued.statusCode,200,queued.body);await tick();
 const link=await s.req('POST',url+'/download-link',{revision:saved.json().revision});assert.equal(link.statusCode,200,link.body);
 const downloaded=await app.inject({url:link.json().url});assert.equal(downloaded.statusCode,200,downloaded.body);
 assert.deepEqual(parseCsv(downloaded.rawPayload.toString('utf8')), [pieces.map(()=> '签名'), ['张','三','【姓名】','【姓名】','张','三']]);
});

test('full logical-name forceDetect survives the disabled name profile only for its matching groups',{timeout:180000},async()=>{
 const s=await session();
 const profile=await s.req('POST','/api/presets/profiles',{name:'合成禁用姓名强制检测'});assert.equal(profile.statusCode,200,profile.body);
 const profileSettings=profile.json().settings;
 const profileUpdate=await s.req('PUT',`/api/presets/profiles/${profileSettings.id}`,{revision:1,settings:{...profileSettings,enabledEntityTypeIds:profileSettings.enabledEntityTypeIds.filter((id:string)=>id!=='name_cn')}});assert.equal(profileUpdate.statusCode,200,profileUpdate.body);
 const rules=await s.req('POST','/api/presets/rulesets',{name:'合成完整姓名强制检测'});assert.equal(rules.statusCode,200,rules.body);
 const ruleSettings=rules.json().settings;
 const entries=importedEntries([{row:1,pattern:'张三',entityType:'name_cn',kind:'forceDetect',enabled:true}],'manual');
 const rulesUpdate=await s.req('PUT',`/api/presets/rulesets/${ruleSettings.id}`,{revision:1,settings:{...ruleSettings,entries}});assert.equal(rulesUpdate.statusCode,200,rulesUpdate.body);
 const applied=await s.req('PUT',`/api/projects/${s.project}/presets`,{revision:0,profileId:profileSettings.id,profileRevision:2,rulesetId:ruleSettings.id,rulesetRevision:2});assert.equal(applied.statusCode,200,applied.body);
 const {url,view}=await upload(s,'csv',await material('csv'));
 const signatures=(view.marks as Mark[]).filter(m=>m.signatureGroup);
 assert.equal(signatures.length,4,JSON.stringify(signatures));
 assert.deepEqual(signatures.map(m=>view.text.slice(m.start,m.end)),['张','三','张','三']);
 assert.ok(signatures.every(m=>m.sources?.some(s=>s.code.startsWith('ruleset-force-detect:'))));
 const marks=(view.marks as Mark[]).map(m=>({...m,decision:m.signatureGroup?'redact' as const:'ignore' as const}));
 const saved=await s.req('PUT',url+'/review',{revision:view.revision,marks});assert.equal(saved.statusCode,200,saved.body);
 const queued=await s.req('POST',url+'/export',{revision:saved.json().revision});assert.equal(queued.statusCode,200,queued.body);await tick();
 const link=await s.req('POST',url+'/download-link',{revision:saved.json().revision});assert.equal(link.statusCode,200,link.body);
 const downloaded=await app.inject({url:link.json().url});assert.equal(downloaded.statusCode,200,downloaded.body);
 assert.deepEqual(parseCsv(downloaded.rawPayload.toString('utf8')), [pieces.map(()=> '签名'), ['*','*','李','四','*','*']]);
});

test('DOC and WPS normalize to DOCX for trusted signature groups; old missing metadata blocks a new review/export only',{timeout:180000},async()=>{
 const s=await session();
 for(const extension of ['doc','wps'] as const){
  const original=await material('docx'),{id,url,view}=await upload(s,extension,original),source=(await admin.query('SELECT source_format,source_id,source_hash,normalized_source_id,normalized_source_hash,normalization_metadata FROM documents WHERE id=$1',[id])).rows[0];
  assert.equal(source.source_format,extension);assert.ok(source.normalized_source_id&&source.normalized_source_hash&&source.normalization_metadata);
  assert.equal(hash(await readOriginal(source.source_id)),source.source_hash);
  assert.equal(hash(await readOriginal(source.normalized_source_id)),source.normalized_source_hash);
  groups(view.marks as Mark[]);
  const accepted=(view.marks as Mark[]).map(m=>({...m,decision:'ignore' as const}));
  const saved=await s.req('PUT',url+'/review',{revision:view.revision,marks:accepted});assert.equal(saved.statusCode,200,saved.body);
  const revision=saved.json().revision as number;
  const queued=await s.req('POST',url+'/export',{revision});assert.equal(queued.statusCode,200,queued.body);await tick();
  const link=await s.req('POST',url+'/download-link',{revision});assert.equal(link.statusCode,200,link.body);
  const signed=await app.inject({url:link.json().url});assert.equal(signed.statusCode,200,signed.body);
  assert.ok((await parseOffice(signed.rawPayload,'docx')).text.includes('张'));
  const legacy=accepted.map(m=>{const {signatureGroup:_group,...plain}=m;return plain;});
  await admin.query('UPDATE documents SET marks=$2::jsonb WHERE id=$1',[id,JSON.stringify(legacy)]);
  await admin.query('UPDATE review_snapshots SET marks=$3::jsonb WHERE document_id=$1 AND revision=$2',[id,revision,JSON.stringify(legacy)]);
  const before=await state(id);
  const deniedReview=await s.req('PUT',url+'/review',{revision,marks:legacy});assert.equal(deniedReview.statusCode,409,deniedReview.body);
  assert.equal(deniedReview.json().error,'SIGNATURE_GROUP_RECOGNITION_REQUIRED');
  const deniedExport=await s.req('POST',url+'/export',{revision});assert.equal(deniedExport.statusCode,409,deniedExport.body);
  assert.equal(deniedExport.json().error,'SIGNATURE_GROUP_RECOGNITION_REQUIRED');
  assert.deepEqual(await state(id),before);
  assert.equal((await app.inject({url:link.json().url})).statusCode,200,'issued immutable link must remain valid');
 }
});
