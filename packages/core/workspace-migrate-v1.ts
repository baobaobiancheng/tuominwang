import {createHash} from 'node:crypto';
import {access} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import {Readable,Transform} from 'node:stream';
import yauzl,{type Entry,type ZipFile} from 'yauzl';
import {originalEntryPath} from './reference/tmm-original-predicates.js';
import {assertSourceWorkspaceV1} from './reference/workspace-snapshot-schema.js';
import {originalV3JsonParser,OriginalV3Assembler} from './reference/tmm-v3-stream-json.js';
import {writePortableWorkspaceV2ToFile,type TmmFileRef} from './workspace-portable-stream.ts';
import type {PortableObject} from './workspace-portable.ts';

// Dedicated migration of original R_ (main.js:25081-25171). These limits do
// not apply to the ordinary V1/V2 open path in workspace-legacy-stream.ts.
const ENTRY_MAX=100000,EXPANDED_MAX=34359738368,SOURCE_MAX=4294967296;
const MANIFEST_MAX=67108864,DOCUMENT_MAX=10000,RATIO_MAX=200,DEPTH_MAX=64;
const TOP_KEYS=new Set(['schemaVersion','projectId','projectName','createdAt','updatedAt',
  'activeDocumentId','contentRevision','rulesetSnapshot','profileSnapshot',
  'projectModeSnapshot','reviewDecisionEvents','workspaceCorrections','folderBatch',
  'inheritedPseudonymProfile']);
const REQUIRED_TOP=['schemaVersion','projectId','projectName','createdAt','updatedAt',
  'activeDocumentId','contentRevision'];
const fail=(code:string):never=>{throw new Error(code);};
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

function migrationPath(name:string){
  // Original v_ is the same normalized path predicate as original _x.
  return originalEntryPath(name);
}
function openZip(path:string){return new Promise<ZipFile>((resolve,reject)=>yauzl.open(path,
  {autoClose:false,lazyEntries:true,decodeStrings:true,validateEntrySizes:true,strictFileNames:true},
  (error,zip)=>error||!zip?reject(error??new Error('TMM_V1_INVALID_ZIP')):resolve(zip)));}
function openEntry(zip:ZipFile,entry:Entry){return new Promise<Readable>((resolve,reject)=>
  zip.openReadStream(entry,(error,stream)=>error||!stream?reject(error??new Error('TMM_V1_ENTRY_INVALID')):resolve(stream)));}
async function scan(zip:ZipFile){
  const entries=new Map<string,Entry>();let expanded=0;
  await new Promise<void>((resolve,reject)=>{
    let settled=false;
    const stop=(error:unknown)=>{if(!settled){settled=true;reject(error);}};
    zip.on('error',stop);
    zip.on('entry',entry=>{
      if(settled)return;
      try{
        const name=migrationPath(entry.fileName);
        if(entries.has(name))fail('TMM_V1_DUPLICATE_ENTRY');
        if(entry.isEncrypted())fail('TMM_V1_INNER_ENCRYPTION_REJECTED');
        if(![0,8].includes(entry.compressionMethod))fail('TMM_V1_COMPRESSION_UNSUPPORTED');
        if(!Number.isSafeInteger(entry.uncompressedSize)||!Number.isSafeInteger(entry.compressedSize)||
           entry.uncompressedSize<0||entry.compressedSize<0)fail('TMM_V1_ENTRY_INVALID');
        if(entry.uncompressedSize>0&&(entry.compressedSize===0||
           entry.uncompressedSize/entry.compressedSize>RATIO_MAX))fail('TMM_V1_COMPRESSION_RATIO_EXCEEDED');
        expanded+=entry.uncompressedSize;
        if(expanded>EXPANDED_MAX||entries.size>=ENTRY_MAX)fail('TMM_V1_LIMIT_EXCEEDED');
        entries.set(name,entry);zip.readEntry();
      }catch(error){stop(error);}
    });
    zip.on('end',()=>{if(!settled){settled=true;resolve();}});
    zip.readEntry();
  });
  return entries;
}
async function boundedBytes(zip:ZipFile,entry:Entry,limit:number){
  if(entry.uncompressedSize>limit)fail('TMM_V1_LIMIT_EXCEEDED');
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of await openEntry(zip,entry)){
    size+=chunk.length;if(size>limit||size>entry.uncompressedSize)fail('TMM_V1_LIMIT_EXCEEDED');
    chunks.push(Buffer.from(chunk));
  }
  if(size!==entry.uncompressedSize)fail('TMM_V1_ENTRY_INVALID');
  return Buffer.concat(chunks,size);
}
async function verifyEntry(zip:ZipFile,entry:Entry,expected:string){
  const digest=createHash('sha256');let size=0;
  for await(const chunk of await openEntry(zip,entry)){
    size+=chunk.length;if(size>entry.uncompressedSize)fail('TMM_V1_ENTRY_INVALID');
    digest.update(chunk);
  }
  if(size!==entry.uncompressedSize||digest.digest('hex')!==expected)fail('TMM_V1_CHECKSUM_MISMATCH');
}

// Original R_ uses a streaming tokenizer, top-level pick, and document
// streamArray. The parser and assembler here are mechanically vendored from
// main.js; only their token routing replaces stream-chain plumbing.
async function parseWorkspace(zip:ZipFile,entry:Entry,expected:string,signal?:AbortSignal){
  const digest=createHash('sha256');let size=0,depth=0,topKey:string|null=null;
  let active:OriginalV3Assembler|null=null,activeDepth=0,activeKey:string|null=null;
  let doc:OriginalV3Assembler|null=null,docDepth=0,inDocuments=false,seenDocuments=false;
  const top:Record<string,unknown>=Object.create(null),documents:PortableObject[]=[],seen=new Set<string>();
  const parser=originalV3JsonParser();
  const source=await openEntry(zip,entry);
  const guard=new Transform({transform(chunk:Buffer,_enc,done){
    size+=chunk.length;digest.update(chunk);
    done(size>entry.uncompressedSize?new Error('TMM_V1_ENTRY_INVALID'):null,chunk);
  }});
  source.on('error',error=>parser.destroy(error));
  guard.on('error',error=>parser.destroy(error));
  source.pipe(guard).pipe(parser);
  try{
    for await(const token of parser as AsyncIterable<{name:string;value?:unknown}>){
      signal?.throwIfAborted();
      // Gate keys before the original assembler writes to plain objects.
      if(token.name==='keyValue'&&['__proto__','constructor','prototype'].includes(String(token.value)))
        fail('TMM_V1_UNSAFE_KEY');
      const before=depth,start=token.name==='startObject'||token.name==='startArray';
      const end=token.name==='endObject'||token.name==='endArray';
      if(start){depth++;if(depth>DEPTH_MAX)fail('TMM_V1_JSON_DEPTH_EXCEEDED');}
      if(before===0&&token.name!=='startObject'&&!end)fail('TMM_V1_SNAPSHOT_INVALID');
      if(inDocuments){
        if(doc){doc.consume(token);if(start)docDepth++;if(end)docDepth--;
          if(docDepth===0){
            const value=doc.current;
            if(!value||typeof value!=='object'||Array.isArray(value)||
               typeof (value as any).id!=='string')fail('TMM_V1_SNAPSHOT_INVALID');
            documents.push(value as PortableObject);
            if(documents.length>DOCUMENT_MAX)fail('TMM_V1_LIMIT_EXCEEDED');
            doc=null;
          }
        }else if(before===2&&token.name==='startObject'){
          doc=new OriginalV3Assembler();doc.consume(token);docDepth=1;
        }else if(before===2&&token.name==='endArray'){
          inDocuments=false;topKey=null;
        }else if(before===2&&['startString','stringValue','numberValue','nullValue','trueValue','falseValue','startArray'].includes(token.name))
          fail('TMM_V1_SNAPSHOT_INVALID');
      }else if(active){
        active.consume(token);if(start)activeDepth++;if(end)activeDepth--;
        if(activeDepth===0){top[activeKey!]=active.current;active=null;activeKey=null;topKey=null;}
      }else if(before===1&&token.name==='keyValue'){
        topKey=String(token.value);
        if(TOP_KEYS.has(topKey)||topKey==='documents'){
          if(seen.has(topKey))fail('TMM_V1_SNAPSHOT_INVALID');
          seen.add(topKey);
        }
      }else if(before===1&&topKey==='documents'&&token.name==='startArray'){
        inDocuments=true;seenDocuments=true;
      }else if(before===1&&topKey&&TOP_KEYS.has(topKey)&&
        (start||['stringValue','numberValue','nullValue','trueValue','falseValue'].includes(token.name))){
        active=new OriginalV3Assembler();activeKey=topKey;active.consume(token);
        activeDepth=start?1:0;
        if(!activeDepth){top[activeKey]=active.current;active=null;activeKey=null;topKey=null;}
      }
      if(end)depth--;
      if(depth<0)fail('TMM_V1_SNAPSHOT_INVALID');
    }
    if(depth!==0||inDocuments||doc||active||!seenDocuments||
       size!==entry.uncompressedSize||digest.digest('hex')!==expected)fail('TMM_V1_CHECKSUM_MISMATCH');
    for(const key of REQUIRED_TOP)if(!Object.hasOwn(top,key))fail('TMM_V1_SNAPSHOT_INVALID');
    top.reviewDecisionEvents??=[];top.workspaceCorrections??=[];
    return {...top,documents} as PortableObject;
  }finally{source.destroy();guard.destroy();parser.destroy();}
}

export async function migrateLegacyWorkspaceV1ToV2File(input:{
  sourcePath:string;targetPath:string;dek:Buffer;keySlots:Record<string,unknown>[];
  appVersion?:string;signal?:AbortSignal;
}){
  const sourcePath=resolve(input.sourcePath),targetPath=resolve(input.targetPath);
  if(extname(sourcePath).toLowerCase()!=='.tmm'||extname(targetPath).toLowerCase()!=='.tmm')
    fail('TMM_V1_EXTENSION_REQUIRED');
  if(sourcePath.toLowerCase()===targetPath.toLowerCase())fail('TMM_V1_TARGET_MUST_DIFFER');
  await access(sourcePath);input.signal?.throwIfAborted();
  const zip=await openZip(sourcePath);
  try{
    const entries=await scan(zip),manifestEntry=entries.get('manifest.json')??fail('TMM_V1_REQUIRED_ENTRY_MISSING'),
      workspaceEntry=entries.get('workspace.json')??fail('TMM_V1_REQUIRED_ENTRY_MISSING');
    let manifest:any;
    try{manifest=JSON.parse((await boundedBytes(zip,manifestEntry,MANIFEST_MAX)).toString('utf8'));}
    catch{fail('TMM_V1_MANIFEST_INVALID');}
    if(manifest?.format!=='lawbot-tmm'||manifest.schemaVersion!==1||
       !manifest.checksums||typeof manifest.checksums!=='object'||Array.isArray(manifest.checksums))
      fail('TMM_V1_SCHEMA_UNSUPPORTED');
    if(!Number.isSafeInteger(manifest.documentCount)||manifest.documentCount<0||
       manifest.documentCount>DOCUMENT_MAX)fail('TMM_V1_LIMIT_EXCEEDED');
    const checksums:Record<string,string>=manifest.checksums;
    if(!Object.hasOwn(checksums,'workspace.json'))fail('TMM_V1_CHECKSUM_MISSING');
    for(const [name,expected] of Object.entries(checksums)){
      migrationPath(name);
      if(!/^[a-f0-9]{64}$/i.test(expected)||!entries.has(name))fail('TMM_V1_CHECKSUM_INVALID');
    }
    for(const name of entries.keys())if(name!=='manifest.json'&&!Object.hasOwn(checksums,name))
      fail('TMM_V1_UNDECLARED_ENTRY');
    const snapshot=await parseWorkspace(zip,workspaceEntry,checksums['workspace.json'],input.signal);
    assertSourceWorkspaceV1(snapshot);
    if(snapshot.projectId!==manifest.projectId||snapshot.documents.length!==manifest.documentCount||
       snapshot.activeDocumentId!==manifest.activeDocumentId)fail('TMM_V1_MANIFEST_MISMATCH');
    const sources=new Map<string,TmmFileRef>(),sourceNames=new Set<string>();
    for(const document of snapshot.documents){
      const name=migrationPath(document.sourceEntry),entry=entries.get(name)??fail('TMM_V1_SOURCE_MISSING'),expected=checksums[name];
      if(!name.startsWith(`documents/${document.id}/source`))fail('TMM_V1_SOURCE_ENTRY_INVALID');
      if(!expected)fail('TMM_V1_SOURCE_MISSING');
      if(entry.uncompressedSize>SOURCE_MAX)fail('TMM_V1_LIMIT_EXCEEDED');
      sourceNames.add(name);
      sources.set(name,{bytes:entry.uncompressedSize,sha256:expected,
        openReadStream:()=>openEntry(zip,entry)});
    }
    for(const [name,expected] of Object.entries(checksums))
      if(name!=='workspace.json'&&!sourceNames.has(name))await verifyEntry(zip,entries.get(name)!,expected);
    input.signal?.throwIfAborted();
    const converted:PortableObject={...snapshot,auditEvents:[{
      event:'tmm_v1_migrated',at:new Date().toISOString(),sourceSchemaVersion:1,
    }]};
    // The existing V2 writer emits per-document meta/state/OCR entries and
    // streams every source. It never buffers the entire V1 workspace.json.
    const result=await writePortableWorkspaceV2ToFile({snapshot:converted,sources,
      outputPath:targetPath,dek:input.dek,keySlots:input.keySlots,appVersion:input.appVersion,
      signal:input.signal});
    return {sourcePath,targetPath,...result};
  }finally{zip.close();}
}
