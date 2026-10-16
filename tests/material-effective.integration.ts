import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {defaultProfile} from '../packages/core/presets.ts';
import {passwordHash,readOriginal} from '../packages/adapters/storage.ts';
import {officeFixture} from './office-fixtures.ts';
import {pdfFixture} from './pdf-fixtures.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(new URL(process.env.MIGRATION_DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(process.env.DATA_DIR?.includes('/.data/test-runs/'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
const app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});

test('configuration GET projects only source-applicable optional outputs from sealed profile and explicit configuration', {timeout:120000},async()=>{
  const tenant=randomUUID(),user=randomUUID(),password='synthetic-effective-outputs',username='effective-'+user,origin=process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
  const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
  assert.equal(login.statusCode,200,login.body);
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  const req=(method:'GET'|'POST'|'PUT',url:string,payload?:any,binary=false)=>app.inject({method,url,payload,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}}});
  const createdProject=await req('POST','/api/projects',{name:'effective outputs synthetic'});
  assert.equal(createdProject.statusCode,200,createdProject.body);
  const project=createdProject.json().id as string;
  const base=defaultProfile();
  const settings={...base,
    docx:{...base.docx,exportMarkdown:true},
    pdf:{...base.pdf,exportMarkdown:true,exportPdfAsDocx:true},
    image:{...base.image,exportMarkdown:true},
    batch:{...base.batch,exportMarkdownByKind:{docx:false,pdf:true,image:false}}};
  const createdProfile=await req('POST','/api/presets/profiles',{name:'optional-output-profile-'+randomUUID(),profile:settings});
  assert.equal(createdProfile.statusCode,200,createdProfile.body);
  const applied=await req('PUT',`/api/projects/${project}/presets`,{revision:0,profileId:createdProfile.json().settings.id,profileRevision:createdProfile.json().revision,rulesetId:null});
  assert.equal(applied.statusCode,200,applied.body);

  async function upload(files:{path:string;bytes:Buffer}[]){
    const batch=randomUUID(),entries=files.map(f=>({...f,requestId:randomUUID()}));
    const accepted=await req('POST',`/api/projects/${project}/upload-batches`,{id:batch,files:entries.map(e=>({requestId:e.requestId,path:e.path,size:e.bytes.length}))});
    assert.equal(accepted.statusCode,200,accepted.body);
    const ids:string[]=[];
    for(const e of entries){
      const response=await req('POST',`/api/projects/${project}/files?batchId=${batch}&requestId=${e.requestId}`,e.bytes,true);
      assert.equal(response.statusCode,200,response.body);
      ids.push(response.json().id);
      const source=(await admin.query('SELECT source_id FROM documents WHERE id=$1',[ids.at(-1)])).rows[0];
      assert.deepEqual(await readOriginal(source.source_id),e.bytes);
    }
    return ids;
  }
  const [txt]=await upload([{path:'optional.txt',bytes:Buffer.from('手机号 13800138000')}]);
  assert.equal(await tick(),true);
  const txtView=await req('GET',`/api/documents/${txt}`);
  assert.equal(txtView.statusCode,200,txtView.body);
  assert.equal(txtView.json().job.status,'succeeded',txtView.body);
  let get=await req('GET',`/api/documents/${txt}/configuration`);
  assert.equal(get.statusCode,200,get.body);
  assert.deepEqual(get.json().effective.additionalOutputs,{markdown:false,pdfDocx:false,legacyDoc:false});
  assert.equal(get.json().effective.unifiedPseudonyms,true);
  const configured=await req('POST',`/api/documents/${txt}/configuration`,{revision:txtView.json().revision,configuration:{outputFormats:['md'],unifiedPseudonyms:false}});
  assert.equal(configured.statusCode,200,configured.body);
  get=await req('GET',`/api/documents/${txt}/configuration`);
  assert.equal(get.statusCode,200,get.body);
  assert.deepEqual(get.json().effective.additionalOutputs,{markdown:true,pdfDocx:false,legacyDoc:false});
  assert.equal(get.json().effective.unifiedPseudonyms,false);
  assert.deepEqual(get.json().configuration.outputFormats,['md']);

  const [docx]=await upload([{path:'optional.docx',bytes:await officeFixture('docx')}]);
  const [pdf]=await upload([{path:'optional.pdf',bytes:pdfFixture({text:'synthetic phone 13800138000'})}]);
  const [png]=await upload([{path:'optional.png',bytes:await readFile('tests/fixtures/image-utilities-synthetic.png')}]);
  for(const [documentId,expected] of [
    [docx,{markdown:true,pdfDocx:false,legacyDoc:false}],
    [pdf,{markdown:true,pdfDocx:true,legacyDoc:false}],
    [png,{markdown:true,pdfDocx:false,legacyDoc:false}],
  ] as const){
    const response=await req('GET',`/api/documents/${documentId}/configuration`);
    assert.equal(response.statusCode,200,response.body);
    assert.equal(response.json().batch,false);
    assert.deepEqual(response.json().effective.additionalOutputs,expected);
    assert.equal(response.json().effective.unifiedPseudonyms,true);
  }
  const [batchDocx,batchPdf]=await upload([
    {path:'batch.docx',bytes:await officeFixture('docx')},
    {path:'batch.pdf',bytes:pdfFixture({text:'synthetic batch 13800138000'})},
  ]);
  const batchWord=await req('GET',`/api/documents/${batchDocx}/configuration`);
  const batchVisual=await req('GET',`/api/documents/${batchPdf}/configuration`);
  assert.equal(batchWord.statusCode,200,batchWord.body);
  assert.equal(batchVisual.statusCode,200,batchVisual.body);
  assert.equal(batchWord.json().batch,true);
  assert.equal(batchVisual.json().batch,true);
  assert.deepEqual(batchWord.json().effective.additionalOutputs,{markdown:false,pdfDocx:false,legacyDoc:false});
  assert.deepEqual(batchVisual.json().effective.additionalOutputs,{markdown:true,pdfDocx:true,legacyDoc:false});
  const [legacy]=await upload([{path:'optional.doc',bytes:await readFile('tests/fixtures/legacy-office/simple.doc')}]);
  const pendingLegacy=await req('GET',`/api/documents/${legacy}`);
  assert.equal(pendingLegacy.statusCode,200,pendingLegacy.body);
  const beforeLegacy=await req('GET',`/api/documents/${legacy}/configuration`);
  assert.equal(beforeLegacy.statusCode,200,beforeLegacy.body);
  assert.deepEqual(beforeLegacy.json().effective.additionalOutputs,{markdown:true,pdfDocx:false,legacyDoc:false});
  const cancelled=await req('POST',`/api/jobs/${pendingLegacy.json().job.id}/cancel`);
  assert.equal(cancelled.statusCode,200,cancelled.body);
  const cancelledLegacy=await req('GET',`/api/documents/${legacy}`);
  assert.equal(cancelledLegacy.statusCode,200,cancelledLegacy.body);
  const selected=await req('POST',`/api/documents/${legacy}/configuration`,{
    revision:cancelledLegacy.json().revision,configuration:{outputFormats:['doc','md']},
  });
  assert.equal(selected.statusCode,200,selected.body);
  const effectiveLegacy=await req('GET',`/api/documents/${legacy}/configuration`);
  assert.equal(effectiveLegacy.statusCode,200,effectiveLegacy.body);
  assert.deepEqual(effectiveLegacy.json().effective.additionalOutputs,{markdown:true,pdfDocx:false,legacyDoc:true});
  assert.deepEqual(effectiveLegacy.json().configuration.outputFormats,['doc','md']);
});
