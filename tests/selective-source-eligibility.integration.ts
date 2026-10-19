import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash} from '../packages/adapters/storage.ts';
import {tick} from '../apps/worker/main.ts';
import {sourceMarkdownDocument} from '../packages/core/reference/workspace-renderer-source.js';
import {parseReferenceMarkdown} from '../packages/core/reference-markdown.ts';
import {assertSourceWorkspaceV2} from '../packages/core/reference/workspace-snapshot-schema.js';
import {writePortableWorkspace} from '../packages/core/workspace-portable.ts';
import {reviewProfileMappings} from '../packages/core/workspace-compat.ts';

test('source-valid selective partial-star review remains eligible after import, recognition and human review', {timeout:120_000}, async()=>{
 const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
 let app:Awaited<ReturnType<typeof buildApp>>|undefined;
 try{
  app=await buildApp();
  const tenant=randomUUID(),uid=randomUUID(),username='selective-'+randomUUID(),password='synthetic-selective-pass',origin=process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
  const login=await app.inject({method:'POST',url:'/api/login',remoteAddress:'198.18.59.66',headers:{origin},payload:{username,password}});
  assert.equal(login.statusCode,200,login.body);
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  const req=(method:string,url:string,payload?:unknown)=>app!.inject({method,url,remoteAddress:'198.18.59.66',headers:{origin,cookie},payload} as never);
  const source=Buffer.from('# 电话 13800138000\n');
  const parsed=parseReferenceMarkdown(source,'a.md');
  const start=parsed.scanText.indexOf('13800138000');assert.ok(start>=0);
  const entity={id:'phone1',type:'phone',text:'13800138000',startOffset:start,endOffset:start+11,sourceStart:start,sourceEnd:start+11,sourceExact:true};
  const oldId=randomUUID(),document=sourceMarkdownDocument({documentId:oldId,fileName:'a.md',sourceText:parsed.source,scanText:parsed.scanText,sidecar:parsed.sidecar,detectedEntities:[entity],reviewDraft:{entities:[entity],enablePseudonymization:true,pseudonymStyle:'selective',pseudonymEntries:[{key:'phone:13800138000',autoValue:'【联系001】',currentValue:'【联系001】',action:'partial_star'}],pseudonymTypeActions:{phone:'partial_star'}},exportMode:'selective_pseudonym',pseudonymTableName:'表'});
  const now=new Date().toISOString(),snapshot={schemaVersion:2,projectId:'foreign',projectName:'源合法选择性',createdAt:now,updatedAt:now,contentRevision:1,activeDocumentId:oldId,documents:[document],reviewDecisionEvents:[],workspaceCorrections:[],projectModeSnapshot:null};
  assertSourceWorkspaceV2(snapshot);
  assert.equal(document.review.pseudonymStyle,'selective');
  assert.ok(document.review.pseudonymEntries.some((entry:any)=>!!entry.key));
  assert.equal(reviewProfileMappings({snapshot,sources:new Map([[document.sourceEntry,source]]),format:'secure-v2'} as any).mappings.length,0);
  const archive=await writePortableWorkspace(snapshot as any,new Map([[document.sourceEntry,source]]),{format:'secure-v2',password:'selective-transfer-password'});
  const imported=await req('POST','/api/portable/import',{name:'导入原合法选择性',bytesBase64:archive.toString('base64'),password:'selective-transfer-password'});
  assert.equal(imported.statusCode,200,imported.body);
  const project=imported.json().id,doc=(await admin.query('SELECT id FROM documents WHERE project_id=$1',[project])).rows[0].id;
  for(let i=0;i<20;i++){const status=(await admin.query("SELECT status FROM jobs WHERE document_id=$1 AND kind='detect' ORDER BY created_at DESC LIMIT 1",[doc])).rows[0]?.status;if(status==='succeeded')break;assert.notEqual(status,'failed');await tick();if(i===19)throw Error('DETECTION_NOT_COMPLETE');}
  const url=`/api/documents/${doc}`;let view=(await req('GET',url)).json();assert.equal(view.state,'review',JSON.stringify(view));
  const restored=await req('POST',url+'/portable-draft/restore',{revision:view.revision});assert.equal(restored.statusCode,200,restored.body);
  view=(await req('GET',url)).json();
  const mark=view.marks.find((item:any)=>item.start===start&&item.end===start+11);assert.ok(mark,JSON.stringify(view.marks));
  assert.equal(mark.decision,'pending');assert.notEqual(mark.replacement?.mode,'alias');
  const reviewed=await req('PUT',url+'/review',{revision:view.revision,marks:view.marks.map((item:any)=>({...item,decision:'redact'}))});assert.equal(reviewed.statusCode,200,reviewed.body);
  view=(await req('GET',url)).json();assert.equal(view.state,'review');
  const preview=await req('POST',`/api/projects/${project}/review-mode-batch/preview`,{documents:[{id:doc,revision:view.revision}],scope:'markdown',mode:'selective_pseudonym'});
  assert.equal(preview.statusCode,200,preview.body);
  const result=preview.json().documents[0];
  console.log('SELECTIVE_SOURCE_REAL_CHAIN '+JSON.stringify({originalDh2:true,importedProject:project,documentId:doc,markMode:mark.replacement?.mode??null,oldKey:document.review.pseudonymEntries[0]?.key,previewStatus:result.status,previousMode:result.previousMode}));
  assert.notEqual(result.status,'selective-skipped','source dh2 accepts a keyed selective draft');
 }finally{await app?.close();await pool.end();await admin.end();}
});
