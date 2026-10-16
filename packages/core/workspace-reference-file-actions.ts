import {randomBytes} from 'node:crypto';
import {open} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import type {Readable} from 'node:stream';
import {readLegacyWorkspaceFromFile,writeLegacyWorkspaceToFile} from './workspace-legacy-stream.ts';
import {readPortableWorkspaceV2FromFile,readPortableWorkspaceV3FromFile,
  writePortableWorkspaceV2ToFile,writePortableWorkspaceV3ToFile,type TmmFileRef} from './workspace-portable-stream.ts';
import {openTmmZipFromSecureFile,TMM_V3_ZIP_BUDGET} from './workspace-zip-stream.ts';
import {createTmmTransferSlot} from './workspace-secure-stream.ts';
import {workspaceReviewProfile,reviewProfileMappings} from './workspace-compat.ts';
import type {PortableFormat,PortableObject} from './workspace-portable.ts';

type ReferenceFile={format:PortableFormat;snapshot:PortableObject;sources:Map<string,TmmFileRef>;close():Promise<void>};
const fail=(code:string):never=>{throw Error(code);};
const refs=(archive:{openEntry(name:string):Promise<Readable>},sources:Map<string,{bytes:number;sha256:string;archiveEntry?:string}>)=>
  new Map([...sources].map(([name,source])=>[name,{bytes:source.bytes,sha256:source.sha256,
    openReadStream:()=>archive.openEntry(source.archiveEntry??name)} satisfies TmmFileRef]));

// Conversion uses the reference snapshot even when a TMM carries the cloud
// extension. This preserves the source TMM's project ID and review state.
export async function openReferenceWorkspaceFile(filePath:string,password?:string):Promise<ReferenceFile>{
  const handle=await open(filePath,'r'),prefix=Buffer.alloc(8);
  try{await handle.read(prefix,0,prefix.length,0);}finally{await handle.close();}
  if(prefix.subarray(0,2).toString('ascii')==='PK'){
    const opened=await readLegacyWorkspaceFromFile(filePath);
    return{format:'legacy-zip',snapshot:opened.snapshot,sources:opened.sources,close:opened.close};
  }
  if(prefix.toString('ascii')!=='LBTSC001')fail('PORTABLE_FILE_INVALID');
  if(!password)throw Error('PORTABLE_KEY_REQUIRED');
  const probe=await openTmmZipFromSecureFile(filePath,password,TMM_V3_ZIP_BUDGET);
  let version:unknown;
  try{version=(await probe.readJson('manifest.json')).schemaVersion;}finally{await probe.close();}
  if(version===2){
    const opened=await readPortableWorkspaceV2FromFile(filePath,password);
    return{format:'secure-v2',snapshot:opened.snapshot,sources:refs(opened.archive,opened.sources),close:()=>opened.archive.close()};
  }
  if(version===3){
    const opened=await readPortableWorkspaceV3FromFile(filePath,password);
    return{format:'secure-v3',snapshot:opened.snapshot,sources:refs(opened.archive,opened.sources),close:()=>opened.archive.close()};
  }
  return fail('PORTABLE_MANIFEST_INVALID');
}

export async function referenceProfileFromFile(filePath:string,password?:string,fileName='审查.tmm'){
  const opened=await openReferenceWorkspaceFile(filePath,password);
  try{return workspaceReviewProfile({format:opened.format,snapshot:opened.snapshot,sources:new Map()} as any,fileName);}
  finally{await opened.close();}
}

export async function referenceProfileMappingsFromFile(filePath:string,password:string|undefined,choices:Record<string,string>){
  const opened=await openReferenceWorkspaceFile(filePath,password);
  try{return reviewProfileMappings({format:opened.format,snapshot:opened.snapshot,sources:new Map()} as any,choices);}
  finally{await opened.close();}
}

const comparable=(snapshot:PortableObject)=>({...snapshot,
  rulesetSnapshot:snapshot.rulesetSnapshot??null,projectModeSnapshot:snapshot.projectModeSnapshot??null,auditEvents:snapshot.auditEvents??[]});
export async function convertReferenceWorkspaceFile(input:{sourcePath:string;outputPath:string;
  password?:string;newPassword:string;format:PortableFormat;signal?:AbortSignal}){
  const opened=await openReferenceWorkspaceFile(input.sourcePath,input.password);
  const dek=randomBytes(32);
  try{
    input.signal?.throwIfAborted();
    if(input.format==='legacy-zip')
      await writeLegacyWorkspaceToFile({snapshot:opened.snapshot,sources:opened.sources,
        outputPath:input.outputPath,signal:input.signal});
    else{
      const slot=await createTmmTransferSlot(input.newPassword,dek);
      const args={snapshot:opened.snapshot,sources:opened.sources,outputPath:input.outputPath,
        dek,keySlots:[slot],objectType:'tmm-transfer' as const,signal:input.signal};
      if(input.format==='secure-v2')await writePortableWorkspaceV2ToFile(args);
      else if(input.format==='secure-v3')await writePortableWorkspaceV3ToFile(args);
      else fail('PORTABLE_FORMAT_INVALID');
    }
    input.signal?.throwIfAborted();
    const verified=await openReferenceWorkspaceFile(input.outputPath,
      input.format==='legacy-zip'?undefined:input.newPassword);
    try{
      if(!isDeepStrictEqual(comparable(opened.snapshot),comparable(verified.snapshot))||
        opened.sources.size!==verified.sources.size||
        [...opened.sources].some(([entry,source])=>{
          const restored=verified.sources.get(entry);
          return !restored||restored.bytes!==source.bytes||restored.sha256!==source.sha256;
        }))fail('ARTIFACT_MISMATCH');
      return{format:input.format,projectId:verified.snapshot.projectId,
        documentCount:verified.snapshot.documents.length,
        sourceHashes:Object.fromEntries([...verified.sources].map(([entry,source])=>[entry,source.sha256]))};
    }finally{await verified.close();}
  }finally{dek.fill(0);await opened.close();}
}
