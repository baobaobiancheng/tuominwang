import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeLegacyWorkspaceToFile} from '../packages/core/workspace-legacy-stream.ts';
import {convertReferenceWorkspaceFile,openReferenceWorkspaceFile,referenceProfileFromFile,referenceProfileMappingsFromFile} from '../packages/core/workspace-reference-file-actions.ts';
import {writePortableWorkspace,readPortableWorkspace} from '../packages/core/workspace-portable.ts';
import {migrateCompatibleWorkspace} from '../packages/core/workspace-compat.ts';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function snapshot(entry:string){return {schemaVersion:2,projectId:'synthetic-project',projectName:'public synthetic',createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z',activeDocumentId:'synthetic-doc',contentRevision:1,workspaceCorrections:[],reviewDecisionEvents:[],profileSnapshot:null,documents:[{id:'synthetic-doc',fileName:'synthetic.pdf',fileKind:'pdf',sourceEntry:entry,detection:{entities:[],bboxes:[],ocrCachePages:[],documentText:'PUBLIC 13800138000'},review:{schemaVersion:1,kind:'pdf',isPreviewMode:false,hasVisitedPreview:false,enablePseudonymization:false,pseudonymEntries:[],maskStyle:'black',entities:[],pageRotations:{},manualOnlyRotationPages:[],viewport:{pageNumber:1,scale:1}},exportState:{kind:'pdf',mode:'default_star',exportMarkdown:false,pseudonymTableName:'synthetic',redact:true,redactPseudo:false,maskStyle:'black',exportDocx:false}}]};}
test('file conversion preserves >50 MiB source bytes and review for every format', {timeout:300000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tmw-file3-core-'));
 try{
  for(const [kind,bytes] of [['compressible',Buffer.alloc(52*1024*1024,65)],['incompressible',randomBytes(52*1024*1024)]] as const){
   const entry='documents/synthetic-doc/source.pdf',source=join(dir,kind+'.pdf'),legacy=join(dir,kind+'.tmm');
   await writeFile(source,bytes);
   await writeLegacyWorkspaceToFile({snapshot:snapshot(entry) as any,sources:new Map([[entry,{bytes:bytes.length,sha256:sha(bytes),openReadStream:()=>createReadStream(source)}]]),outputPath:legacy});
   const formats=kind==='compressible'?['legacy-zip','secure-v2','secure-v3'] as const:['secure-v3'] as const;
   for(const format of formats){
    const out=join(dir,kind+'-'+format+'.tmm');
    const result=await convertReferenceWorkspaceFile({sourcePath:legacy,outputPath:out,newPassword:'synthetic-transfer-password',format});
    assert.equal(result.projectId,'synthetic-project');assert.equal(result.sourceHashes[entry],sha(bytes));
    const opened=await openReferenceWorkspaceFile(out,format==='legacy-zip'?undefined:'synthetic-transfer-password');
    try{const chunks:Buffer[]=[];for await(const part of await opened.sources.get(entry)!.openReadStream())chunks.push(Buffer.from(part));assert.equal(sha(Buffer.concat(chunks)),sha(bytes));assert.equal(opened.snapshot.documents[0].detection.documentText,'PUBLIC 13800138000');}finally{await opened.close();}
    assert.ok((await referenceProfileFromFile(out,format==='legacy-zip'?undefined:'synthetic-transfer-password')).corrections);
    assert.ok((await referenceProfileMappingsFromFile(out,format==='legacy-zip'?undefined:'synthetic-transfer-password',{})).profile);
   }
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('old Buffer migration keeps V1 normalized review and source in secure V2 and V3',async()=>{
 const entry='documents/synthetic-doc/source.pdf',source=Buffer.from('PUBLIC 13800138000');
 const legacy=await writePortableWorkspace({...snapshot(entry),schemaVersion:1} as any,
  new Map([[entry,source]]),{format:'legacy-zip'});
 for(const format of ['secure-v2','secure-v3'] as const){
  const output=await migrateCompatibleWorkspace(legacy,undefined,format,'synthetic-transfer-password');
  const restored=await readPortableWorkspace(output,{password:'synthetic-transfer-password'});
  assert.equal(restored.snapshot.schemaVersion,2);assert.equal(restored.snapshot.projectId,'synthetic-project');
  assert.equal(restored.snapshot.documents[0].detection.documentText,'PUBLIC 13800138000');
  assert.deepEqual(restored.sources.get(entry),source);
 }
});
test('old Buffer V3 writer is accepted by the file reader with declared source hash',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tmw-file3-buffer-v3-'));
 try{
  const entry='documents/synthetic-doc/source.pdf',source=Buffer.from('PUBLIC 13800138000');
  const output=await writePortableWorkspace(snapshot(entry) as any,new Map([[entry,source]]),
   {format:'secure-v3',password:'synthetic-transfer-password'});
  const path=join(dir,'buffer-v3.tmm');await writeFile(path,output);
  const opened=await openReferenceWorkspaceFile(path,'synthetic-transfer-password');
  try{assert.equal(opened.sources.get(entry)?.sha256,sha(source));assert.equal(opened.snapshot.projectId,'synthetic-project');}
  finally{await opened.close();}
 }finally{await rm(dir,{recursive:true,force:true});}
});
