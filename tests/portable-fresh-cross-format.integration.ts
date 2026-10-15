// Candidate target: tests/portable-fresh-cross-format.integration.ts
// Research only. Copy/apply inside an isolated repository before running.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import {parse as parseCsv} from 'csv-parse/sync';
import {buildApp} from '../apps/api/main.ts';
import {registerWorkspacePortableRoutes} from '../apps/api/workspace-portable.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {hash,passwordHash,readOriginal,unseal} from '../packages/adapters/storage.ts';
import {importedEntries} from '../packages/core/presets.ts';
import {replacementFor} from '../packages/core/redaction.ts';
import {parseOffice} from '../packages/core/office.ts';
import {parseReferenceMarkdown} from '../packages/core/reference-markdown.ts';
import {openPdf} from '../packages/core/pdf-reader.ts';
import {createOcr,recognizePage} from '../packages/core/ocr.ts';
import {officeFixture} from './office-fixtures.ts';
import {pdfFixture} from './pdf-fixtures.ts';

const dbName=new URL(process.env.DATABASE_URL!).pathname;
assert.ok(dbName.startsWith('/tmw_test_'),'run only in a fresh isolated test database');
assert.ok(new URL(process.env.MIGRATION_DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
const app=await buildApp();
if(!app.hasRoute({method:'POST',url:'/api/portable/import'}))registerWorkspacePortableRoutes(app);
after(async()=>{await app.close();await pool.end();await admin.end();});
const phone='13800138000';
type Format='csv'|'md'|'docx'|'xlsx'|'png'|'pdf';
type Mode='full_star'|'custom_pseudonym';
type Fixture={format:Format;mode:Mode;source:Buffer;name:string;manualValue?:string};

async function fixtures():Promise<Fixture[]> {
 const png=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="180"><rect width="100%" height="100%" fill="white"/><text x="30" y="100" font-family="Arial" font-size="56">Phone 13800138000</text></svg>')).png().toBuffer();
 const xlsx=await officeFixture('xlsx',{
  'xl/sharedStrings.xml':'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1"><si><t>13800138000</t></si></sst>',
  'xl/worksheets/sheet2.xml':'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'
 });
 return [
  {format:'csv',mode:'full_star',name:'fresh.csv',source:Buffer.from('备注,旧人工ZX8\n电话,13800138000\n'),manualValue:'ZX8'},
  {format:'md',mode:'custom_pseudonym',name:'fresh.md',source:Buffer.from('# 合成材料\n\n电话：13800138000\n')},
  {format:'docx',mode:'custom_pseudonym',name:'fresh.docx',source:await officeFixture('docx')},
  {format:'xlsx',mode:'full_star',name:'fresh.xlsx',source:xlsx},
  {format:'png',mode:'custom_pseudonym',name:'fresh.png',source:png},
  {format:'pdf',mode:'full_star',name:'fresh.pdf',source:pdfFixture({pages:1,text:'Phone 13800138000 - public synthetic sample'})}
 ];
}
async function session(){
 const tenant=randomUUID(),user=randomUUID(),username='cross-format-'+randomUUID(),password='synthetic-cross-format',origin=process.env.APP_ORIGIN!;
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
 const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:string,url:string,payload?:any,binary=false)=>app.inject({method:method as any,url,payload,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}}});
 const view=async(id:string)=>{const r=await req('GET',`/api/documents/${id}`);assert.equal(r.statusCode,200,r.body);return r.json();};
 return{tenant,req,view};
}
async function upload(s:Awaited<ReturnType<typeof session>>,project:string,f:Fixture){
 const batch=randomUUID(),requestId=randomUUID();
 const manifest=await s.req('POST',`/api/projects/${project}/upload-batches`,{id:batch,files:[{requestId,path:f.name,size:f.source.length}]});assert.equal(manifest.statusCode,200,manifest.body);
 const posted=await s.req('POST',`/api/projects/${project}/files?batchId=${batch}&requestId=${requestId}`,f.source,true);assert.equal(posted.statusCode,200,posted.body);
 const id=posted.json().id as string,[job]=(await admin.query("SELECT id FROM jobs WHERE document_id=$1 AND kind='detect' ORDER BY created_at DESC LIMIT 1",[id])).rows;assert.ok(job);const view=await finishJob(s,id,job.id,f.format,'source-upload');return{id,view};
}
function phoneMark(marks:any[],text:string){
 const matches=marks.filter(m=>m.kind==='手机号'&&text.slice(m.start,m.end).replace(/\s/gu,'')===phone);
 assert.equal(matches.length,1,JSON.stringify({text,marks}));return matches[0];
}
async function canonical(s:Awaited<ReturnType<typeof session>>,project:string,id:string){
 const [row]=(await admin.query('SELECT * FROM documents WHERE id=$1 AND project_id=$2',[id,project])).rows;assert.ok(row);
 const text=unseal(row.content,`${s.tenant}:${project}:${id}`);assert.equal(hash(text),row.content_hash);
 return{row,text};
}
async function finishJob(s:Awaited<ReturnType<typeof session>>,documentId:string,jobId:string,format:Format,phase:string){
 const deadline=Date.now()+30000;
 for(let attempt=0;Date.now()<deadline&&attempt<40;attempt++){
  const [job]=(await admin.query('SELECT id,document_id,kind,status,error_code,revision,available_at FROM jobs WHERE id=$1',[jobId])).rows;
  assert.ok(job,JSON.stringify({format,phase,jobId}));assert.equal(job.document_id,documentId);
  if(job.status==='succeeded'){const view=await s.view(documentId);assert.equal(view.state,'review',JSON.stringify({format,phase,job}));return view;}
  assert.ok(!['failed','cancelled'].includes(job.status),JSON.stringify({format,phase,job}));
  if(!(await tick()))await new Promise(resolve=>setTimeout(resolve,300));
 }
 const [job]=(await admin.query('SELECT id,document_id,kind,status,error_code,revision,available_at FROM jobs WHERE id=$1',[jobId])).rows;
 assert.fail(JSON.stringify({format,phase,reason:'TARGET_JOB_NOT_COMPLETE',job}));
}
async function downloaded(s:Awaited<ReturnType<typeof session>>,id:string,revision:number){
 const link=await s.req('POST',`/api/documents/${id}/download-link`,{revision});assert.equal(link.statusCode,200,link.body);
 const output=await s.req('GET',link.json().url);assert.equal(output.statusCode,200,output.body.slice(0,150));return output.rawPayload;
}
async function exportSelected(s:Awaited<ReturnType<typeof session>>,id:string,view:any,target:any,visual:boolean,format:Format){
 const marks=view.marks.map((m:any)=>({...m,decision:m===target?'redact':'ignore'}));
 const pageReview=visual?{...(view.pageReview??{}),mode:'raster',regions:[],deletedPages:[]}:undefined;
 const saved=await s.req('PUT',`/api/documents/${id}/review`,{revision:view.revision,marks,...pageReview?{pageReview}:{}});assert.equal(saved.statusCode,200,saved.body);
 const revision=saved.json().revision,queued=await s.req('POST',`/api/documents/${id}/export`,{revision});assert.equal(queued.statusCode,200,queued.body);
 const completed=await finishJob(s,id,queued.json().id as string,format,'export');assert.equal(completed.job.status,'succeeded',JSON.stringify(completed.job));
 return{bytes:await downloaded(s,id,revision),review:completed};
}
async function scanText(f:Fixture,bytes:Buffer){
 if(f.format==='csv')return (parseCsv(bytes.toString('utf8')) as string[][]).flat().join('\n');
 if(f.format==='md')return parseReferenceMarkdown(bytes,f.name).scanText;
 if(f.format==='docx'||f.format==='xlsx')return(await parseOffice(bytes,f.format)).text;
 throw Error('text format required');
}
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function visualPixels(format:'png'|'pdf',bytes:Buffer){
 let image=bytes;
 if(format==='pdf'){const pdf=await openPdf(bytes);try{assert.equal(pdf.count,1);image=(await pdf.page(0)).png;}finally{pdf.close();}}
 const {data,info}=await sharp(image).removeAlpha().raw().toBuffer({resolveWithObject:true});
 return{image,data,digest:digest(data),width:info.width,height:info.height};
}
async function checkOutput(f:Fixture,normal:Buffer,restored:Buffer,expected:string){
 if(f.format==='png'||f.format==='pdf'){
  const a=await visualPixels(f.format,normal),b=await visualPixels(f.format,restored),source=await visualPixels(f.format,f.source);
  assert.deepEqual([a.width,a.height],[b.width,b.height]);assert.deepEqual([b.width,b.height],[source.width,source.height]);assert.equal(a.digest,b.digest,'restored raster pixels must equal normal current-profile export pixels');
  assert.notEqual(b.digest,source.digest,'redaction must change source pixels');
  const ocr=await createOcr();try{const actual=(await recognizePage(ocr,b.image)).text.replace(/\s/gu,'');assert.ok(!actual.includes(phone),actual);}finally{await ocr.terminate();}
  return {kind:'visual',normalPixelSha256:a.digest,restoredPixelSha256:b.digest,sourcePixelSha256:source.digest,width:b.width,height:b.height};
 }
 const a=await scanText(f,normal),b=await scanText(f,restored);
 assert.equal(b,a,'restored canonical output must equal normal current-profile output');
 assert.ok(!b.includes(phone),JSON.stringify({format:f.format,b}));assert.ok(b.includes(expected),JSON.stringify({format:f.format,expected,b}));
 if(f.format==='csv')assert.equal((parseCsv(restored.toString('utf8')) as string[][])[1][1],expected);
 return {kind:'text',normalCanonicalSha256:digest(Buffer.from(a)),restoredCanonicalSha256:digest(Buffer.from(b)),expectedReplacementSha256:digest(Buffer.from(expected))};
}

// Six serial cases: no shared worker queue overlap; one representative mode per format.
test('native portable fresh replacement matches normal current-profile publication across six formats',{timeout:900000},async()=>{
 const s=await session();
 for(const f of await fixtures()){
  console.log('FORMAT_START',f.format);
  const sourceProject=(await s.req('POST','/api/projects',{name:'source skip '+f.format})).json().id as string;
  const created=await s.req('POST','/api/presets/rulesets',{name:'skip-'+f.format+'-'+randomUUID(),description:null,applicability:null});assert.equal(created.statusCode,200,created.body);
  const entries=importedEntries([{row:1,pattern:phone,entityType:'phone',kind:'forceSkip',enabled:true}],'manual');
  const saved=await s.req('PUT',`/api/presets/rulesets/${created.json().settings.id}`,{revision:created.json().revision,settings:{...created.json().settings,entries}});assert.equal(saved.statusCode,200,saved.body);
  const applied=await s.req('PUT',`/api/projects/${sourceProject}/presets`,{revision:0,profileId:null,rulesetId:saved.json().settings.id,rulesetRevision:saved.json().revision});assert.equal(applied.statusCode,200,applied.body);
  const old=await upload(s,sourceProject,f),oldCanonical=await canonical(s,sourceProject,old.id);
  assert.ok(oldCanonical.text.includes(phone),JSON.stringify({format:f.format,text:oldCanonical.text}));
  assert.ok(!old.view.marks.some((m:any)=>m.kind==='手机号'&&oldCanonical.text.slice(m.start,m.end).replace(/\s/gu,'')===phone));
  if(f.manualValue){const at=oldCanonical.text.indexOf(f.manualValue);assert.ok(at>=0);const reviewed=await s.req('PUT',`/api/documents/${old.id}/review`,{revision:old.view.revision,marks:[...old.view.marks,{start:at,end:at+f.manualValue.length,kind:'自定义',rawEntityType:'旧人工槽',decision:'ignore',replacement:{mode:'custom',value:'旧人工替换'}}]});assert.equal(reviewed.statusCode,200,reviewed.body);}
  const backup=await s.req('POST',`/api/projects/${sourceProject}/portable/export`,{password:'cross-format-backup',format:'native'});assert.equal(backup.statusCode,200,backup.body);
  const imported=await s.req('POST','/api/portable/import',{name:'current '+f.format,password:'cross-format-backup',bytesBase64:backup.rawPayload.toString('base64')});assert.equal(imported.statusCode,200,imported.body);
  const project=imported.json().id as string,[row]=(await admin.query('SELECT id,source_id,source_hash FROM documents WHERE project_id=$1',[project])).rows;assert.ok(row);
  const [importJob]=(await admin.query("SELECT id FROM jobs WHERE document_id=$1 AND kind='detect' ORDER BY created_at DESC LIMIT 1",[row.id])).rows;assert.ok(importJob);let view=await finishJob(s,row.id,importJob.id,f.format,'native-import');
  // Replace the imported source forceSkip with an empty current ruleset.
  const currentRules=await s.req('POST','/api/presets/rulesets',{name:'current-no-skip-'+f.format+'-'+randomUUID(),description:null,applicability:null});assert.equal(currentRules.statusCode,200,currentRules.body);
  const configured=await s.req('POST',`/api/documents/${row.id}/configuration`,{revision:view.revision,configuration:{exportMode:f.mode,rulesetId:currentRules.json().settings.id,documentType:'auto'}});assert.equal(configured.statusCode,200,configured.body);
  const recognized=await s.req('POST',`/api/documents/${row.id}/recognize`,{revision:configured.json().revision,ner:false});assert.equal(recognized.statusCode,200,recognized.body);
  view=await finishJob(s,row.id,recognized.json().jobId as string,f.format,'current-recognize');
  const before=await canonical(s,project,row.id),normal=phoneMark(view.marks,before.text),normalReplacement=normal.replacement;
  assert.equal(normal.decision,'pending');assert.equal(normalReplacement?.mode,f.mode==='full_star'?'full':'alias');
  const expected=replacementFor(before.text,{...normal,decision:'redact'});
  const visual=f.format==='png'||f.format==='pdf';
  const baseline=await exportSelected(s,row.id,view,normal,visual,f.format);
  const revision=baseline.review.revision;
  const restored=await s.req('POST',`/api/documents/${row.id}/portable-draft/restore`,{revision});assert.equal(restored.statusCode,200,restored.body);
  view=await s.view(row.id);const after=await canonical(s,project,row.id);assert.equal(after.text,before.text);
  const fresh=phoneMark(view.marks,after.text);assert.equal(fresh.decision,'pending');assert.deepEqual(fresh.replacement,normalReplacement);
  if(visual)assert.equal(fresh.rasterReplacement,normal.rasterReplacement);
  if(f.manualValue){const inherited=view.marks.find((m:any)=>m.rawEntityType==='旧人工槽');assert.ok(inherited);assert.equal(inherited.decision,'pending');assert.deepEqual(inherited.replacement,{mode:'custom',value:'旧人工替换'});}
  const actual=await exportSelected(s,row.id,view,fresh,visual,f.format);
  const contentProof=await checkOutput(f,baseline.bytes,actual.bytes,expected);
  console.log('FORMAT_PASS',JSON.stringify({format:f.format,mode:f.mode,sourceSha256:hash(f.source),normalOutputSha256:digest(baseline.bytes),restoredOutputSha256:digest(actual.bytes),...contentProof}));
  assert.equal(after.row.source_id,row.source_id);assert.equal(after.row.source_hash,row.source_hash);assert.equal(row.source_hash,hash(f.source));assert.deepEqual(await readOriginal(row.source_id),f.source);
 }
});
