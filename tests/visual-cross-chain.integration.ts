import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {posix} from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {hash,passwordHash,readOriginal,unseal} from '../packages/adapters/storage.ts';
import {openEntityCorrections} from '../packages/adapters/entity-corrections.ts';
import {readZip,writeZip} from '../packages/core/office-zip.ts';
import {officeImageFixture} from './office-fixtures.ts';
import {readPortableWorkspace,writePortableWorkspace} from '../packages/core/workspace-portable.ts';
import {hideReviewEntityType,restoreHiddenReviewEntities} from '../packages/core/review-type-hide.ts';
import {geometryEnvelope,geometryMarkIdentity,transformEntityGeometry} from '../packages/contracts/entity-geometry.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'),'isolated test DB required');
assert.ok(new URL(process.env.MIGRATION_DATABASE_URL!).pathname.startsWith('/tmw_test_'),'isolated migration DB required');
assert.ok(process.env.DATA_DIR?.includes('/.data/test-runs/'),'isolated artifact directory required');
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
const app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});

async function sameResourceTwice(image:Buffer){
  const parts=await readZip(await officeImageFixture(image));
  const xml=parts.get('word/document.xml')!.toString();
  const drawing=xml.match(/<w:p><w:r><w:drawing>[\s\S]*?<\/w:drawing><\/w:r><\/w:p>/u)?.[0];
  assert.ok(drawing,'fixture has inline drawing');
  const copy=drawing.replace('wp:docPr id="1"','wp:docPr id="2"').replace('pic:cNvPr id="1"','pic:cNvPr id="2"');
  const next=xml.replace('</w:body>',copy+'</w:body>');
  assert.equal((next.match(/r:embed="img1"/gu)??[]).length,2);
  parts.set('word/document.xml',Buffer.from(next));
  return writeZip(parts);
}
async function session(){
  const tenant=randomUUID(),user=randomUUID(),username='visual-cross-'+user,password='synthetic-visual-cross',origin=process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
  const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
  assert.equal(login.statusCode,200,login.body);
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  const req=(method:any,url:string,payload?:any,binary=false)=>app.inject({method,url,payload,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}}});
  const created=await req('POST','/api/projects',{name:'Word同资源纠错几何隐藏全工程交叉'});assert.equal(created.statusCode,200,created.body);
  return{tenant,user,req,project:created.json().id};
}
async function view(s:Awaited<ReturnType<typeof session>>,id:string){const response=await s.req('GET','/api/documents/'+id);assert.equal(response.statusCode,200,response.body);return response.json();}
async function row(id:string){const result=await admin.query('SELECT * FROM documents WHERE id=$1',[id]);assert.equal(result.rows.length,1);return result.rows[0];}
async function output(s:Awaited<ReturnType<typeof session>>,id:string,revision:number){
  const route='/api/documents/'+id,exported=await s.req('POST',route+'/export',{revision});assert.equal(exported.statusCode,200,exported.body);
  await tick();const current=await view(s,id);assert.equal(current.job.status,'succeeded',JSON.stringify(current.job));
  const link=await s.req('POST',route+'/download-link',{revision:current.revision});assert.equal(link.statusCode,200,link.body);
  const downloaded=await s.req('GET',link.json().url);assert.equal(downloaded.statusCode,200,downloaded.body.slice(0,200));
  const archive=await readZip(downloaded.rawPayload),media=[...archive].filter(([name])=>/^word\/media\//u.test(name));assert.equal(media.length,1,'one shared media resource, referenced twice');
  const documentXml=archive.get('word/document.xml')?.toString(),relationships=archive.get('word/_rels/document.xml.rels')?.toString();
  assert.ok(documentXml&&relationships,'downloaded DOCX contains document and relationship parts');
  const embeddedIds=[...documentXml.matchAll(/\br:embed="([^"]+)"/gu)].map(match=>match[1]);assert.equal(embeddedIds.length,2,'both original placements remain in downloaded Word');assert.equal(embeddedIds[0],embeddedIds[1],'both placements use the same relationship');
  const relationship=[...relationships.matchAll(/<Relationship\b[^>]*>/gu)].map(match=>match[0]).find(tag=>tag.match(/\bId="([^"]+)"/u)?.[1]===embeddedIds[0]);
  assert.ok(relationship,'shared relationship is present');const target=relationship.match(/\bTarget="([^"]+)"/u)?.[1];assert.ok(target,'shared relationship has a media target');
  assert.equal(target.startsWith('/')?target.slice(1):posix.normalize(posix.join('word',target)),media[0][0],'both references resolve to the sole exported media');
  return media[0][1];
}
async function pixels(bytes:Buffer){return sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});}
function assertOnlyBoxesBlack(original:Awaited<ReturnType<typeof pixels>>,result:Awaited<ReturnType<typeof pixels>>,boxes:{x:number;y:number;width:number;height:number}[],label:string){
  assert.equal(result.info.width,original.info.width,label+' width');assert.equal(result.info.height,original.info.height,label+' height');assert.equal(result.info.channels,3,label+' RGB');assert.equal(original.info.channels,3,label+' original RGB');
  const width=result.info.width,height=result.info.height,mask=new Uint8Array(width*height);assert.ok(boxes.length>0,label+' boxes');
  for(const b of boxes){assert.ok([b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0,label+' finite box');const left=Math.floor(b.x),top=Math.floor(b.y),right=Math.ceil(b.x+b.width),bottom=Math.ceil(b.y+b.height);assert.ok(left>=0&&top>=0&&right<=width&&bottom<=height,label+' box within pixels');for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)mask[y*width+x]=1;}
  let changedInside=0,checkedInside=0,checkedOutside=0;
  for(let p=0;p<mask.length;p++){const at=p*3;if(mask[p]){checkedInside++;assert.deepEqual([...result.data.subarray(at,at+3)],[0,0,0],label+' every box pixel black at '+p);if(original.data[at]!==0||original.data[at+1]!==0||original.data[at+2]!==0)changedInside++;}else{checkedOutside++;assert.deepEqual([...result.data.subarray(at,at+3)],[...original.data.subarray(at,at+3)],label+' outside-box pixel unchanged at '+p);}}
  assert.ok(checkedInside>0&&checkedOutside>0&&changedInside>0,label+' black mask changed a nonblack source pixel and kept outside pixels');
}

test('shared Word image: semantic OCR correction, opaque geometry, type hide and four real portable reopen paths keep source and pixels safe',{timeout:900000},async()=>{
  const s=await session(),recognized='13800138000',corrected='14900149000';
  const image=await readFile('tests/fixtures/image-utilities-synthetic.png'),source=await sameResourceTwice(image),sourceHash=hash(source),batch=randomUUID(),requestId=randomUUID();
  assert.equal((await s.req('POST',`/api/projects/${s.project}/upload-batches`,{id:batch,files:[{requestId,path:'same-resource.docx',size:source.length}]})).statusCode,200);
  const uploaded=await s.req('POST',`/api/projects/${s.project}/files?batchId=${batch}&requestId=${requestId}`,source,true);assert.equal(uploaded.statusCode,200,uploaded.body);
  const originalId=uploaded.json().id,originalRoute='/api/documents/'+originalId;
  await tick();let current=await view(s,originalId);assert.equal(current.state,'review',JSON.stringify(current.job));
  const original=await row(originalId);assert.equal(original.source_hash,sourceHash);assert.deepEqual(await readOriginal(original.source_id),source);
  const correctionRoute=`/api/projects/${s.project}/ocr-entity-corrections`,request={recognizedText:recognized,correctedText:corrected,targetType:'phone',source:'highlight-context-menu'};
  const proposal=await s.req('POST',correctionRoute+'/preview',request);assert.equal(proposal.statusCode,200,proposal.body);assert.ok(proposal.json().summary.affectedCount>=1,proposal.body);
  const applied=await s.req('POST',correctionRoute+'/apply',{planToken:proposal.json().planToken});assert.equal(applied.statusCode,200,applied.body);
  current=await view(s,originalId);let stored=await row(originalId),frame=openEntityCorrections(stored)!;
  assert.ok(frame.entries.some(e=>e.recognizedText===recognized&&e.correctedText===corrected),'corrected semantic value has a private frame');
  assert.ok(unseal(stored.content,`${s.tenant}:${s.project}:${originalId}`).includes(recognized),'canonical OCR text remains original');
  assert.equal(stored.source_hash,sourceHash);assert.deepEqual(await readOriginal(stored.source_id),source);
  const found=await s.req('POST',originalRoute+'/entity-filter',{revision:current.revision,query:corrected,marks:current.marks});assert.equal(found.statusCode,200,found.body);assert.ok(found.json().items.length>=1,'corrected semantic value is searchable');
  const geometries=await s.req('POST',originalRoute+'/pages/0/entity-geometries',{revision:current.revision});assert.equal(geometries.statusCode,200,geometries.body);
  const descriptor=geometries.json().entities.find((e:any)=>e.text.replace(/\s/gu,'')===recognized);assert.ok(descriptor,geometries.body);
  const mark=current.marks[descriptor.markIndex],envelope=geometryEnvelope(descriptor.bboxes),expanded={x:Math.max(0,envelope.x-3),y:Math.max(0,envelope.y-3),width:envelope.width+3,height:envelope.height+3},bboxes=transformEntityGeometry(descriptor.bboxes,expanded);
  const region={id:randomUUID(),page:descriptor.page,...geometryEnvelope(bboxes),shape:'rect',reason:'敏感区域',entityType:descriptor.entityType,text:descriptor.text,meta:{entityGeometryBinding:{reviewEntityId:descriptor.reviewEntityId,markIndex:descriptor.markIndex,start:mark.start,end:mark.end,identity:geometryMarkIdentity(mark)},entityGeometryOverride:{version:1,token:descriptor.token,bboxes}}};
  const review={mode:'raster',regions:[region],deletedPages:[]},visible=current.marks.map((m:any,i:number)=>({...m,decision:i===descriptor.markIndex?'redact':'ignore'}));
  let saved=await s.req('PUT',originalRoute+'/review',{revision:current.revision,marks:visible,pageReview:review});assert.equal(saved.statusCode,200,saved.body);
  current=await view(s,originalId);const originalPixels=await pixels(image),visibleOutput=await pixels(await output(s,originalId,current.revision));assertOnlyBoxesBlack(originalPixels,visibleOutput,bboxes,'visible source-project geometry');
  saved=await s.req('PUT',originalRoute+'/review',{revision:current.revision,marks:hideReviewEntityType(current.marks,{kind:'手机号'}),pageReview:current.pageReview});assert.equal(saved.statusCode,200,saved.body);
  current=await view(s,originalId);assert.ok(current.marks.some((m:any)=>m.hiddenByType===true&&m.decision==='ignore'));assert.equal(current.pageReview.regions.length,1);
  const hiddenOutput=await pixels(await output(s,originalId,current.revision));assert.deepEqual(hiddenOutput.data,originalPixels.data,'hidden geometry leaves reused image unchanged');assert.notDeepEqual(hiddenOutput.data,visibleOutput.data,'only type hide switched the approved source-project geometry output');

  for(const format of ['native','legacy-zip','secure-v2','secure-v3'] as const){
    const password='synthetic-cross-portable',backup=await s.req('POST',`/api/projects/${s.project}/portable/export`,{format,password});assert.equal(backup.statusCode,200,backup.body);let bytes=backup.rawPayload;
    if(format!=='native'){const decoded=await readPortableWorkspace(bytes,{password});delete decoded.snapshot.tuominwangNative;bytes=await writePortableWorkspace(decoded.snapshot,decoded.sources,{format,...format==='legacy-zip'?{}:{password}});}
    const imported=await s.req('POST','/api/portable/import',{name:'同资源交叉重开 '+format,password,bytesBase64:bytes.toString('base64')});assert.equal(imported.statusCode,200,imported.body);
    await tick();let rows=(await admin.query('SELECT * FROM documents WHERE project_id=$1',[imported.json().id])).rows;assert.equal(rows.length,1);let importedRow=rows[0];assert.equal(importedRow.state,'review',JSON.stringify((await view(s,importedRow.id)).job));
    assert.equal(importedRow.source_hash,sourceHash);assert.deepEqual(await readOriginal(importedRow.source_id),source);
    const reopenedRoute='/api/documents/'+importedRow.id,restore=await s.req('POST',reopenedRoute+'/portable-draft/restore',{revision:importedRow.revision});assert.equal(restore.statusCode,200,JSON.stringify({format,body:restore.body}));
    assert.deepEqual(restore.json().pending.unresolved,[],JSON.stringify(restore.json().pending));
    const candidates=restore.json().pending.regions.filter((r:any)=>r.meta?.entityGeometryOverride);assert.equal(candidates.length,1,JSON.stringify(restore.json().pending));
    const candidate=candidates[0];assert.notEqual(candidate.meta.entityGeometryOverride.token,region.meta.entityGeometryOverride.token,'new project gets a newly scoped token');assert.deepEqual(candidate.meta.entityGeometryOverride.bboxes,bboxes,format+' restored exact geometry boxes');
    const confirmed=await s.req('POST',reopenedRoute+'/portable-draft/confirm-region',{revision:restore.json().revision,regionId:candidate.id});assert.equal(confirmed.statusCode,200,confirmed.body);
    current=await view(s,importedRow.id);importedRow=await row(importedRow.id);frame=openEntityCorrections(importedRow)!;
    assert.ok(frame.entries.some(e=>e.correctedText===corrected&&e.recognizedText===recognized&&e.inherited===true),format+' correction survives');
    assert.ok(current.marks.some((m:any)=>m.hiddenByType===true&&m.decision==='ignore'),format+' hidden source status survives');
    assert.equal(current.pageReview.regions.length,1);assert.equal(current.pageReview.regions[0].meta.entityGeometryBinding.reviewEntityId,candidate.meta.entityGeometryBinding.reviewEntityId);assert.deepEqual(current.pageReview.regions[0].meta.entityGeometryOverride.bboxes,bboxes,format+' confirmed exact geometry boxes');
    assert.equal(importedRow.source_hash,sourceHash);assert.deepEqual(await readOriginal(importedRow.source_id),source);
    const semantic=await s.req('POST',reopenedRoute+'/entity-filter',{revision:current.revision,query:corrected,marks:current.marks});assert.equal(semantic.statusCode,200,semantic.body);assert.ok(semantic.json().items.length>=1,format+' corrected semantic search');
    saved=await s.req('PUT',reopenedRoute+'/review',{revision:current.revision,marks:current.marks.map((m:any)=>({...m,decision:'ignore'})),pageReview:{...current.pageReview,mode:'raster'}});assert.equal(saved.statusCode,200,saved.body);
    current=await view(s,importedRow.id);assert.deepEqual((await pixels(await output(s,importedRow.id,current.revision))).data,originalPixels.data,format+' hidden export pixels');
    saved=await s.req('PUT',reopenedRoute+'/review',{revision:current.revision,marks:restoreHiddenReviewEntities(current.marks),pageReview:current.pageReview});assert.equal(saved.statusCode,200,saved.body);
    current=await view(s,importedRow.id);const pending=current.marks.find((m:any)=>m.reviewEntityId===candidate.meta.entityGeometryBinding.reviewEntityId);assert.ok(pending);assert.equal(pending.decision,'pending');assert.equal(pending.hiddenByType,undefined);
    const blocked=await s.req('POST',reopenedRoute+'/export',{revision:current.revision});assert.equal(blocked.statusCode,400,blocked.body);assert.equal(blocked.json().error,'INVALID_MARKS');
    const approved=current.marks.map((m:any)=>({...m,decision:m.reviewEntityId===pending.reviewEntityId?'redact':'ignore'}));
    const preview=await s.req('POST',reopenedRoute+'/pages/0/preview',{revision:current.revision,marks:approved,pageReview:current.pageReview});assert.equal(preview.statusCode,200,preview.body.slice(0,180));
    const previewPixels=await pixels(preview.rawPayload);assert.notDeepEqual(previewPixels.data,originalPixels.data,format+' preview uses override');assertOnlyBoxesBlack(originalPixels,previewPixels,bboxes,format+' preview');
    saved=await s.req('PUT',reopenedRoute+'/review',{revision:current.revision,marks:approved,pageReview:current.pageReview});assert.equal(saved.statusCode,200,saved.body);
    current=await view(s,importedRow.id);const finalImage=await pixels(await output(s,importedRow.id,current.revision));assert.notDeepEqual(finalImage.data,originalPixels.data,format+' exported pixels');
    const x=Math.floor(expanded.x+1),y=Math.floor(expanded.y+1),at=(y*finalImage.info.width+x)*3;assert.deepEqual([...finalImage.data.subarray(at,at+3)],[0,0,0],format+' override pixel');assertOnlyBoxesBlack(originalPixels,finalImage,bboxes,format+' exported geometry');
    const beforeHideMarks=current.marks,hiddenAgain=hideReviewEntityType(beforeHideMarks,{kind:'手机号'}),targetIndex=beforeHideMarks.findIndex((m:any)=>m.reviewEntityId===pending.reviewEntityId);assert.ok(targetIndex>=0);assert.equal(hiddenAgain[targetIndex].hiddenByType,true,format+' target type hidden');assert.deepEqual(beforeHideMarks.flatMap((m:any,i:number)=>m.decision===hiddenAgain[i].decision?[]:[i]),[targetIndex],format+' only target decision changes from redact to hidden ignore');assert.deepEqual(hiddenAgain.filter((m:any)=>m.reviewEntityId!==pending.reviewEntityId).map((m:any)=>m.decision),beforeHideMarks.filter((m:any)=>m.reviewEntityId!==pending.reviewEntityId).map((m:any)=>m.decision),format+' unrelated decisions unchanged');
    saved=await s.req('PUT',reopenedRoute+'/review',{revision:current.revision,marks:hiddenAgain,pageReview:current.pageReview});assert.equal(saved.statusCode,200,saved.body);
    current=await view(s,importedRow.id);assert.deepEqual(current.pageReview.regions[0].meta.entityGeometryOverride.bboxes,bboxes,format+' hidden binding unchanged');
    const hiddenAgainImage=await pixels(await output(s,importedRow.id,current.revision));assert.deepEqual(hiddenAgainImage.data,originalPixels.data,format+' hidden output restores original media');assert.notDeepEqual(hiddenAgainImage.data,finalImage.data,format+' only target hide changes reopened output');
    importedRow=await row(importedRow.id);assert.equal(importedRow.source_hash,sourceHash);assert.deepEqual(await readOriginal(importedRow.source_id),source);
  }
});
