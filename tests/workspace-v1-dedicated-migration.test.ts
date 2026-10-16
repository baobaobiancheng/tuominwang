import {test} from 'vitest';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,rm,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {writePortableWorkspace} from '../packages/core/workspace-portable.ts';
import {readZip,writeZip} from '../packages/core/office-zip.ts';
import {readPortableWorkspaceV2FromFile} from '../packages/core/workspace-portable-stream.ts';
import {migrateLegacyWorkspaceV1ToV2File} from '../packages/core/workspace-migrate-v1.ts';

const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function fixture(){return {schemaVersion:1,projectId:'synthetic-project',projectName:'public synthetic',createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z',activeDocumentId:'doc-1',contentRevision:1,workspaceCorrections:[],reviewDecisionEvents:[],profileSnapshot:null,documents:[{id:'doc-1',fileName:'synthetic.pdf',fileKind:'pdf',sourceEntry:'documents/doc-1/source.pdf',detection:{entities:[],bboxes:[],ocrCachePages:[],documentText:'synthetic'},review:{schemaVersion:1,kind:'pdf',isPreviewMode:false,hasVisitedPreview:false,enablePseudonymization:false,pseudonymEntries:[],maskStyle:'black',entities:[],pageRotations:{},manualOnlyRotationPages:[],viewport:{pageNumber:1,scale:1}},exportState:{kind:'pdf',mode:'default_star',exportMarkdown:false,pseudonymTableName:'synthetic',redact:true,redactPseudo:false,maskStyle:'black',exportDocx:false}}]};}
async function syntheticParts(){
 const snapshot=fixture(),source=Buffer.from('synthetic source bytes');
 const archive=await writePortableWorkspace(snapshot as any,new Map([[snapshot.documents[0].sourceEntry,source]]),{format:'legacy-zip'});
 const parts=await readZip(archive),manifest=JSON.parse(parts.get('manifest.json')!.toString());
 assert.equal(manifest.schemaVersion,1);
 return {parts,manifest,source};
}
async function inTmp(run:(root:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'tmw-v1-migrate-peer-'));try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}

test('dedicated original V1 migration accepts more than the ordinary 2000-entry cap and preserves source bytes',async()=>inTmp(async root=>{
 const {parts,manifest,source}=await syntheticParts();
 for(let i=0;i<2001;i++){const entry=`audit/legacy-${String(i).padStart(5,'0')}.txt`,bytes=Buffer.from(String(i));parts.set(entry,bytes);manifest.checksums[entry]=sha(bytes);}
 parts.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
 const input=join(root,'old.tmm'),output=join(root,'new.tmm'),dek=randomBytes(32);
 await writeFile(input,await writeZip(parts));
 const result=await migrateLegacyWorkspaceV1ToV2File({sourcePath:input,targetPath:output,dek,keySlots:[]});
 assert.equal(result.documentCount,1);
 const opened=await readPortableWorkspaceV2FromFile(output,dek);
 try{assert.equal(opened.snapshot.documents[0].detection.documentText,'synthetic');
  const entry=opened.manifest.documents[0].sourceEntry,chunks:Buffer[]=[];
  for await(const piece of await opened.archive.openEntry(entry))chunks.push(Buffer.from(piece));
  assert.deepEqual(Buffer.concat(chunks),source);
  assert.equal(opened.snapshot.auditEvents?.[0]?.event,'tmm_v1_migrated');
 }finally{await opened.archive.close();dek.fill(0);}
 assert.deepEqual(await readFile(input),await writeZip(parts));
}));

test('dedicated migration requires a declared and matching checksum for every V1 entry',async()=>inTmp(async root=>{
 const {parts,manifest}=await syntheticParts();const input=join(root,'old.tmm'),output=join(root,'new.tmm'),dek=randomBytes(32);
 delete manifest.checksums['documents/doc-1/source.pdf'];parts.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
 await writeFile(input,await writeZip(parts));
 await assert.rejects(migrateLegacyWorkspaceV1ToV2File({sourcePath:input,targetPath:output,dek,keySlots:[]}),/TMM_V1_UNDECLARED_ENTRY/);
 await assert.rejects(readFile(output));dek.fill(0);
}));

test('migration refuses to replace its original file',async()=>inTmp(async root=>{
 const {parts}=await syntheticParts(),input=join(root,'old.tmm');await writeFile(input,await writeZip(parts));
 const before=sha(await readFile(input)),dek=randomBytes(32);
 await assert.rejects(migrateLegacyWorkspaceV1ToV2File({sourcePath:input,targetPath:input,dek,keySlots:[]}),/TMM_V1_TARGET_MUST_DIFFER/);
 assert.equal(sha(await readFile(input)),before);dek.fill(0);
}));

test('dedicated migration preserves ordered PDF OCR pages in V2 segments',async()=>inTmp(async root=>{
 const snapshot=fixture();
 snapshot.documents[0].detection.ocrCachePages=[
  {pageNumber:1,pageWidth:600,pageHeight:800,ocrText:'第一页',lines:[]},
  {pageNumber:3,pageWidth:600,pageHeight:800,ocrText:'第三页',lines:[]},
 ] as any;
 const source=Buffer.from('synthetic source bytes'),dek=randomBytes(32),input=join(root,'old.tmm'),output=join(root,'new.tmm');
 await writeFile(input,await writePortableWorkspace(snapshot as any,new Map([[snapshot.documents[0].sourceEntry,source]]),{format:'legacy-zip'}));
 await migrateLegacyWorkspaceV1ToV2File({sourcePath:input,targetPath:output,dek,keySlots:[]});
 const opened=await readPortableWorkspaceV2FromFile(output,dek);
 try{assert.deepEqual(opened.snapshot.documents[0].detection.ocrCachePages,snapshot.documents[0].detection.ocrCachePages);
  assert.equal(opened.manifest.documents[0].ocrSegments[0].pageCount,2);
 }finally{await opened.archive.close();dek.fill(0);}
}));

test('declared source checksum mismatch aborts before publishing a V2 target',async()=>inTmp(async root=>{
 const {parts}=await syntheticParts(),input=join(root,'old.tmm'),output=join(root,'new.tmm'),dek=randomBytes(32);
 parts.set('documents/doc-1/source.pdf',Buffer.from('synthetic source changed'));
 await writeFile(input,await writeZip(parts));
 await assert.rejects(migrateLegacyWorkspaceV1ToV2File({sourcePath:input,targetPath:output,dek,keySlots:[]}),/TMM_V2_CHECKSUM_MISMATCH|TMM_V1_CHECKSUM_MISMATCH/);
 await assert.rejects(readFile(output));
 assert.deepEqual(await readdir(root),['old.tmm']);
 dek.fill(0);
}));

test('original V1 schema refuses a Markdown document before target creation',async()=>inTmp(async root=>{
 const {parts,manifest}=await syntheticParts(),input=join(root,'old.tmm'),output=join(root,'new.tmm'),dek=randomBytes(32);
 const snapshot=JSON.parse(parts.get('workspace.json')!.toString());
 snapshot.documents[0].fileKind='markdown';
 parts.set('workspace.json',Buffer.from(JSON.stringify(snapshot)));
 manifest.checksums['workspace.json']=sha(parts.get('workspace.json')!);
 parts.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
 await writeFile(input,await writeZip(parts));
 await assert.rejects(migrateLegacyWorkspaceV1ToV2File({sourcePath:input,targetPath:output,dek,keySlots:[]}),/fileKind|markdown|Workspace/i);
 await assert.rejects(readFile(output));dek.fill(0);
}));

test('dangerous nested JSON keys are rejected before original assembler writes object properties',async()=>inTmp(async root=>{
 const {parts,manifest}=await syntheticParts(),input=join(root,'old.tmm'),output=join(root,'new.tmm'),dek=randomBytes(32);
 const before=parts.get('workspace.json')!.toString('utf8');
 const malicious=before.replace('"detection":{','"detection":{"__proto__":{"polluted":true},');
 assert.notEqual(malicious,before);
 parts.set('workspace.json',Buffer.from(malicious));
 manifest.checksums['workspace.json']=sha(parts.get('workspace.json')!);
 parts.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
 await writeFile(input,await writeZip(parts));
 await assert.rejects(migrateLegacyWorkspaceV1ToV2File({sourcePath:input,targetPath:output,dek,keySlots:[]}),/TMM_V1_UNSAFE_KEY/);
 assert.equal((Object.prototype as any).polluted,undefined);
 await assert.rejects(readFile(output));
 assert.deepEqual(await readdir(root),['old.tmm']);
 dek.fill(0);
}));
