import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import {buildApp} from '../apps/api/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {hash,passwordHash,readOriginal,seal,unseal,writeArtifact,writeOriginal} from '../packages/adapters/storage.ts';
import {filterCertificateSealCandidates} from '../packages/core/visual-morphology.ts';
import {detectVisual,canonicalVisualResult} from '../packages/core/visual-detection.ts';
import {openPageReview} from '../packages/adapters/page-review-storage.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(process.env.DATA_DIR?.includes('/.data/test-runs/'));
const app=await buildApp(),admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
after(async()=>{await app.close();await pool.end();await admin.end();});

test('no requested detectors preserves prior visual suggestions and partial diagnostics',async()=>{
 const tenant=randomUUID(),user=randomUUID(),username='ocr-visual-'+user,password='synthetic-ocr-visual',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0],req=(method:any,url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload});
 const projectResponse=await req('POST','/api/projects',{name:'OCR visual postfilter synthetic'});assert.equal(projectResponse.statusCode,200,projectResponse.body);const project=projectResponse.json().id;
 const doc=randomUUID(),source=randomUUID(),preview=randomUUID(),mapId=randomUUID(),before='居民身分证',afterText='居民身份证',page={index:0,width:140,height:60,rotation:0,confidence:90} as any;
 const bytes=await sharp({create:{width:140,height:60,channels:3,background:'#ffffff'}}).png().toBuffer(),glyphs=Array.from(before,(_,i)=>[i,i+1,10+i*18,15,14,25]),map=JSON.stringify(glyphs),aad=`${tenant}:${project}:${doc}`;
 await writeOriginal(source,bytes,doc);await writeOriginal(preview,bytes,doc);await writeArtifact(mapId,map,doc);
 Object.assign(page,{previewId:preview,previewHash:hash(bytes),mapId,mapHash:hash(map)});
 // A fixed, synthetic postfilter input. This does not claim a visual model produced this box.
 const sealCandidate={page:0,x:100,y:25,width:20,height:20,reason:'印章',score:.9,detector:'fixed-postfilter-probe'} as any;
 assert.equal(filterCertificateSealCandidates([sealCandidate],{text:before,filename:'sample.png'},page).candidates.length,1);
 assert.equal(filterCertificateSealCandidates([sealCandidate],{text:afterText,filename:'sample.png'},page).excludedCandidates.length,1);
 const visualDiagnostic={complete:false,pages:[{page:0,detectors:['seal'],warnings:['COLOR_SEGMENTATION_FAILED']}]};
 await admin.query(`INSERT INTO documents(id,tenant_id,project_id,request_id,content,content_hash,source_id,source_name,source_format,source_hash,source_bytes,state,marks,anchors,coverage,page_data,visual_candidates,recognition) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'png',$9,$10,'review','[]',$11,$12,$13,$14,$15)`,
  [doc,tenant,project,randomUUID(),seal(before,aad),hash(before),source,seal('sample.png',aad+':name'),hash(bytes),bytes.length,JSON.stringify([{kind:'page',page:0,start:0,end:before.length}]),JSON.stringify([{id:'page:0',status:'complete'}]),JSON.stringify([page]),JSON.stringify([sealCandidate]),JSON.stringify({visual:visualDiagnostic})]);
 const changed=await req('PUT',`/api/documents/${doc}/pages/0/ocr-text`,{revision:0,start:3,end:4,expectedText:'分',text:'份'});assert.equal(changed.statusCode,200,changed.body);
 const stored=(await admin.query('SELECT * FROM documents WHERE id=$1',[doc])).rows[0],actual=unseal(stored.content,aad);
 assert.equal(actual,afterText);assert.equal(stored.content_hash,hash(afterText));assert.deepEqual(await readOriginal(source),bytes);
 assert.deepEqual(stored.visual_candidates,[sealCandidate]);assert.deepEqual(stored.recognition.visual,visualDiagnostic);
 const rechecked=filterCertificateSealCandidates(stored.visual_candidates,{text:actual,filename:'sample.png'},page);
 assert.equal(rechecked.candidates.length,0);assert.equal(rechecked.excludedCandidates.length,1);
 console.log('OCR_VISUAL_PROOF '+JSON.stringify({input:{before,after:afterText,candidate:sealCandidate,page:{width:page.width,height:page.height}},postfilterBefore:{kept:1,excluded:0},api:{status:changed.statusCode,revision:changed.json().revision,storedText:actual,sourceHash:stored.source_hash,sourceBytesUnchanged:true,storedVisualCandidates:stored.visual_candidates,recognitionVisual:stored.recognition.visual},postfilterAfter:{kept:rechecked.candidates.length,excluded:rechecked.excludedCandidates.length,exclusion:rechecked.excludedCandidates[0].exclusion}}));
 // Model-independent reverse fixture: simulate the postfiltered persisted state
 // after identity text suppresses this known candidate. A later OCR edit cannot
 // recover an item that was never stored in visual_candidates.
 await admin.query("UPDATE documents SET visual_candidates='[]'::jsonb WHERE id=$1",[doc]);
 const reverted=await req('PUT',`/api/documents/${doc}/pages/0/ocr-text`,{revision:1,start:3,end:4,expectedText:'份',text:'分'});assert.equal(reverted.statusCode,200,reverted.body);
 const reverse=(await admin.query('SELECT content,visual_candidates FROM documents WHERE id=$1',[doc])).rows[0];
 assert.equal(unseal(reverse.content,aad),before);assert.deepEqual(reverse.visual_candidates,[]);
 const restoredFilter=filterCertificateSealCandidates([sealCandidate],{text:before,filename:'sample.png'},page);
 assert.equal(restoredFilter.candidates.length,1);
 console.log('OCR_VISUAL_REVERSE_PROOF '+JSON.stringify({fixture:'synthetic previously suppressed persisted candidate list',apiStatus:reverted.statusCode,revision:reverted.json().revision,currentText:before,storedCandidates:reverse.visual_candidates,sameRawCandidatePostfilter:{kept:restoredFilter.candidates.length,excluded:restoredFilter.excludedCandidates.length}}));
});

test('actual seal detector is rescanned after both OCR directions, preserving source and human page region',async()=>{
 const tenant=randomUUID(),user=randomUUID(),username='ocr-visual-model-'+user,password='synthetic-ocr-visual-model',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0],req=(method:any,url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload});
 const made=await req('POST','/api/projects',{name:'OCR visual real seal detector'});assert.equal(made.statusCode,200,made.body);const project=made.json().id;
 const profileResponse=await req('POST','/api/presets/profiles',{name:'seal scan '+user});assert.equal(profileResponse.statusCode,200,profileResponse.body);const profile=profileResponse.json();
 const settings={...profile.settings,enabledEntityTypeIds:[...new Set([...profile.settings.enabledEntityTypeIds,'seal'])]};
 const updated=await req('PUT',`/api/presets/profiles/${profile.settings.id}`,{revision:profile.revision,settings});assert.equal(updated.statusCode,200,updated.body);
 const applied=await req('PUT',`/api/projects/${project}/presets`,{revision:0,profileId:profile.settings.id,profileRevision:updated.json().revision,rulesetId:null});assert.equal(applied.statusCode,200,applied.body);
 const oldText='居民身分证',newText='居民身份证',doc=randomUUID(),source=randomUUID(),preview=randomUUID(),mapId=randomUUID(),aad=`${tenant}:${project}:${doc}`;
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700"><rect width="500" height="700" fill="white"/><circle cx="100" cy="550" r="45" fill="none" stroke="red" stroke-width="5"/></svg>',bytes=await sharp(Buffer.from(svg)).png().toBuffer();
 const page={index:0,width:500,height:700,rotation:0,confidence:90} as any,raw=canonicalVisualResult(await detectVisual(bytes,['seal']),page).candidates;
 assert.ok(raw.length>=1,'same source preview emits at least one actual seal candidate');
 const beforeCandidates=filterCertificateSealCandidates(raw,{text:oldText,filename:'sample.png'},page).candidates.map(c=>({...c,page:0}));assert.ok(beforeCandidates.length>=1);
 const glyphs=Array.from(oldText,(_,i)=>[i,i+1,10+i*20,20,14,25]),map=JSON.stringify(glyphs),review={mode:'raster',regions:[{id:randomUUID(),page:0,x:300,y:300,width:15,height:15,reason:'敏感区域'}],deletedPages:[]};
 await writeOriginal(source,bytes,doc);await writeOriginal(preview,bytes,doc);await writeArtifact(mapId,map,doc);Object.assign(page,{previewId:preview,previewHash:hash(bytes),mapId,mapHash:hash(map)});
 await admin.query(`INSERT INTO documents(id,tenant_id,project_id,request_id,content,content_hash,source_id,source_name,source_format,source_hash,source_bytes,state,marks,anchors,coverage,page_data,page_review,visual_candidates,recognition) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'png',$9,$10,'review','[]',$11,$12,$13,$14,$15,$16)`,
  [doc,tenant,project,randomUUID(),seal(oldText,aad),hash(oldText),source,seal('sample.png',aad+':name'),hash(bytes),bytes.length,JSON.stringify([{kind:'page',page:0,start:0,end:oldText.length}]),JSON.stringify([{id:'page:0',status:'complete'}]),JSON.stringify([page]),JSON.stringify(review),JSON.stringify(beforeCandidates),JSON.stringify({visual:{complete:true,pages:[{page:0,detectors:['seal'],warnings:[]}]}})]);
 const edit=(revision:number,expectedText:string,text:string)=>req('PUT',`/api/documents/${doc}/pages/0/ocr-text`,{revision,start:3,end:4,expectedText,text});
 const forward=await edit(0,'分','份');assert.equal(forward.statusCode,200,forward.body);
 const afterForward=(await admin.query('SELECT * FROM documents WHERE id=$1',[doc])).rows[0];assert.equal(unseal(afterForward.content,aad),newText);assert.deepEqual(afterForward.visual_candidates,[]);assert.equal(afterForward.recognition.visual.complete,true);assert.deepEqual(openPageReview(afterForward),review);
 const reverse=await edit(1,'份','分');assert.equal(reverse.statusCode,200,reverse.body);
 const afterReverse=(await admin.query('SELECT * FROM documents WHERE id=$1',[doc])).rows[0];assert.equal(unseal(afterReverse.content,aad),oldText);assert.ok(afterReverse.visual_candidates.length>=1);assert.equal(afterReverse.recognition.visual.complete,true);assert.deepEqual(openPageReview(afterReverse),review);assert.deepEqual(await readOriginal(source),bytes);assert.deepEqual(await readOriginal(preview),bytes);assert.equal(afterReverse.source_hash,hash(bytes));
 console.log('OCR_VISUAL_REAL_DETECTOR '+JSON.stringify({rawCount:raw.length,rawDetectors:raw.map(c=>c.detector),beforeCount:beforeCandidates.length,forward:{status:forward.statusCode,storedCandidates:afterForward.visual_candidates.length,visual:afterForward.recognition.visual},reverse:{status:reverse.statusCode,storedCandidates:afterReverse.visual_candidates.length,visual:afterReverse.recognition.visual},sourceHash:hash(bytes),sourceAndPreviewUnchanged:true,pageRegionUnchanged:true}));
});
