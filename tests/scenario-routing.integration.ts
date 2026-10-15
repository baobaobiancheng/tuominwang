import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import {buildApp} from '../apps/api/main.ts';
import {registerWorkspacePortableRoutes} from '../apps/api/workspace-portable.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {hash,passwordHash,seal,writeOriginal,writeArtifact,unseal} from '../packages/adapters/storage.ts';
import {pdfFixture} from './pdf-fixtures.ts';

// Candidate path when applied: tests/scenario-routing.integration.ts.
// The OCR cache is synthetic and deterministic. Real tick still runs the
// production policy resolver, detection worker and persistence path.
assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(new URL(process.env.MIGRATION_DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(process.env.DATA_DIR?.includes('/.data/test-runs/'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL}),app=await buildApp();
if(!app.hasRoute({method:'POST',url:'/api/portable/import'}))registerWorkspacePortableRoutes(app);
after(async()=>{await app.close();await pool.end();await admin.end();});

const receipt='申请方 转账 收款方 __masked_id__';
const legal='民事判决书\n原告 张三 被告 李四 本院认为 经审理查明 判决如下。申请方 转账 收款方 __masked_id__';
const nearReceipt='申请方 转账 收款方 __masked_i?__';
const code='SCENE-receipt-standalone-wechat';

test('actual PDF/image worker, OCR correction and portable fresh recognition honor the resolved evidence route',{timeout:180000},async()=>{
 const tenant=randomUUID(),user=randomUUID(),username='scene-route-'+user,password='synthetic-scene-route',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:string,url:string,payload?:any,binary=false)=>app.inject({method:method as any,url,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}},payload});
 const project=(await req('POST','/api/projects',{name:'048 合成证据场景'})).json().id;
 const png=await sharp({create:{width:1400,height:200,channels:3,background:'white'}}).png().toBuffer();
 const pdf=pdfFixture({text:''});
 const upload=async(format:'png'|'pdf',bytes:Buffer,name:string)=>{
  const batch=randomUUID(),requestId=randomUUID();
  const accepted=await req('POST',`/api/projects/${project}/upload-batches`,{id:batch,files:[{requestId,path:name,size:bytes.length}]});
  assert.equal(accepted.statusCode,200,accepted.body);
  const response=await req('POST',`/api/projects/${project}/files?batchId=${batch}&requestId=${requestId}`,bytes,true);
  assert.equal(response.statusCode,200,response.body);
  return response.json().id as string;
 };
 const seedOcrCache=async(document:string,ownerProject:string,text:string)=>{
  const row=(await admin.query('SELECT * FROM documents WHERE id=$1',[document])).rows[0];
  assert.equal(row.state,'queued');
  const aad=`${tenant}:${ownerProject}:${document}`,previewId=randomUUID(),mapId=randomUUID();
  const width=row.source_format==='pdf'?612:1400,height=row.source_format==='pdf'?792:200;
  const preview=await sharp({create:{width,height,channels:3,background:'white'}}).png().toBuffer(),map=JSON.stringify(Array.from(text,(_,i)=>[i,i+1,20+(i%40)*9,20+Math.floor(i/40)*30,8,24]));
  await writeOriginal(previewId,preview,document);await writeArtifact(mapId,map,document);
  const page={index:0,width,height,rotation:0,confidence:95,nativeTextLength:0,textSource:'ocr',ocrRevision:1,previewId,previewHash:hash(preview),mapId,mapHash:hash(map)};
  await admin.query('UPDATE documents SET content=$2,content_hash=$3,anchors=$4,coverage=$5,page_data=$6 WHERE id=$1',[
   document,seal(text,aad),hash(text),JSON.stringify([{kind:'page',page:0,start:0,end:text.length}]),JSON.stringify([{id:'page:0',status:'complete'}]),JSON.stringify([page])]);
 };
 const view=async(document:string)=>{const response=await req('GET',`/api/documents/${document}`);assert.equal(response.statusCode,200,response.body);return response.json();};
 const runJob=async(document:string)=>{assert.equal(await tick(),true);const current=await view(document);assert.equal(current.job.status,'succeeded',JSON.stringify(current.job));assert.equal(current.state,'review');const stored=(await admin.query('SELECT recognition FROM documents WHERE id=$1',[document])).rows[0];return {...current,recognition:stored.recognition};};
 const hasCode=(document:any,target=code)=>document.marks.some((m:any)=>m.sources?.some((s:any)=>s.code===target));
 const configure=async(document:string,revision:number,documentType:'auto'|'screenshot')=>{
  const saved=await req('POST',`/api/documents/${document}/configuration`,{revision,configuration:{documentType,entityTypes:['name_cn','org_name','phone','wechat_id','contract_amount']}});
  assert.equal(saved.statusCode,200,saved.body);
  const again=await req('POST',`/api/documents/${document}/recognize`,{revision:saved.json().revision,ner:false});
  assert.equal(again.statusCode,200,again.body);
  return runJob(document);
 };

 // A genuine queued detect job consumes a cached image page. The extension
 // alone must not turn receipt text into an explicit screenshot hint.
 const image=await upload('png',png,'synthetic-receipt.png');await seedOcrCache(image,project,receipt);
 let imageView=await runJob(image);
 assert.ok(!hasCode(imageView),JSON.stringify(imageView.marks));
 assert.equal(imageView.recognition.documentType,'auto');
 const backup=await req('POST',`/api/projects/${project}/portable/export`,{password:'synthetic-backup'});
 assert.equal(backup.statusCode,200,backup.body);
 imageView=await configure(image,imageView.revision,'screenshot');
 assert.ok(hasCode(imageView),JSON.stringify(imageView.marks));
 assert.equal(imageView.recognition.documentType,'screenshot');

 const chat=await upload('png',png,'synthetic-chat.png');
 const chatText='【腾讯云】您好，昵称：张小雨}';
 await seedOcrCache(chat,project,chatText);
 const chatView=await runJob(chat);
 assert.ok(hasCode(chatView,'SCENE-chat-nickname'),JSON.stringify(chatView.marks));

 // The same route contract runs for PDF. Its automatic legal classification
 // suppresses the receipt rule, while the explicit screenshot route enables it.
 const legalPdf=await upload('pdf',pdf,'synthetic-judgment.pdf');await seedOcrCache(legalPdf,project,legal);
 let pdfView=await runJob(legalPdf);
 assert.ok(pdfView.recognition.classification.confidence>=.75,JSON.stringify(pdfView.recognition.classification));
 assert.ok(!hasCode(pdfView),JSON.stringify(pdfView.marks));
 pdfView=await configure(legalPdf,pdfView.revision,'screenshot');
 assert.ok(hasCode(pdfView),JSON.stringify(pdfView.marks));

 // A one-character OCR correction creates a new eligible receipt value.
 // This exercises ocr-correction.ts with the persisted screenshot policy.
 const correction=await upload('png',png,'synthetic-correction.png');await seedOcrCache(correction,project,nearReceipt);
 let correctedView=await runJob(correction);
 correctedView=await configure(correction,correctedView.revision,'screenshot');
 assert.ok(!hasCode(correctedView),JSON.stringify(correctedView.marks));
 const at=nearReceipt.indexOf('?');
 const changed=await req('PUT',`/api/documents/${correction}/pages/0/ocr-text`,{revision:correctedView.revision,start:at,end:at+1,expectedText:'?',text:'d'});
 assert.equal(changed.statusCode,200,changed.body);
 const correctedRow=(await admin.query('SELECT * FROM documents WHERE id=$1',[correction])).rows[0];
 assert.equal(unseal(correctedRow.content,`${tenant}:${project}:${correction}`),receipt);
 assert.ok(hasCode(correctedRow),JSON.stringify(correctedRow.marks));
 assert.equal(correctedRow.recognition.documentType,'screenshot');

 // Import the earlier auto-route backup: its snapshot has no receipt mark.
 // The imported row is raw/encrypted. After the public configuration API sets
 // screenshot, portable-draft/restore must resolve that policy for fresh marks.
 const imported=await req('POST','/api/portable/import',{name:'048 导入后重识别',password:'synthetic-backup',bytesBase64:backup.rawPayload.toString('base64')});
 assert.equal(imported.statusCode,200,imported.body);
 const importedProject=imported.json().id as string;
 const [fresh]=(await admin.query('SELECT id FROM documents WHERE project_id=$1',[importedProject])).rows;
 assert.ok(fresh);
 await seedOcrCache(fresh.id,importedProject,receipt);
 await admin.query("UPDATE jobs SET available_at=now()-interval '1 hour' WHERE document_id=$1 AND kind='detect'",[fresh.id]);
 let freshView=await runJob(fresh.id);
 assert.ok(!hasCode(freshView));
 freshView=await configure(fresh.id,freshView.revision,'screenshot');
 assert.ok(hasCode(freshView));
 const restored=await req('POST',`/api/documents/${fresh.id}/portable-draft/restore`,{revision:freshView.revision});
 assert.equal(restored.statusCode,200,restored.body);
 const restoredRow=(await admin.query('SELECT * FROM documents WHERE id=$1',[fresh.id])).rows[0];
 assert.equal(unseal(restoredRow.content,`${tenant}:${importedProject}:${fresh.id}`),receipt);
 assert.ok(hasCode(restoredRow),JSON.stringify(restoredRow.marks));
 assert.ok(restoredRow.marks.every((m:any)=>m.decision==='pending'));
});
