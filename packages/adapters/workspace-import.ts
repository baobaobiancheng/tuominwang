import {randomUUID} from 'node:crypto';
import {mkdir,open,link,unlink,readdir,lstat,rmdir,readFile,type FileHandle} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {rows,sql,scoped,globalDb,type DB} from './db.ts';
import {validateWorkspaceImportJournal,v2Header,v2Claim,v2Ready,v2Abort,readJournalIdentity,parseWorkspaceImportJournal,type WorkspaceImportJournal,type OwnerClaim} from './workspace-import-journal.ts';
export type {WorkspaceImportJournal} from './workspace-import-journal.ts';
const uuid=z.string().uuid();
const root=()=>resolve(process.env.DATA_DIR??'.data/files'),directory=()=>resolve(root(),'.workspace-imports'),file=(id:string)=>resolve(directory(),uuid.parse(id));
const lock=(id:string)=>sql`hashtextextended(${`workspace-import:${id}`},0)`;
async function missing(action:()=>Promise<unknown>){try{return await action();}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
async function syncDirectory(path:string){const handle=await open(path,'r');try{await handle.sync();}finally{await handle.close();}}
async function writeAt(handle:FileHandle,value:string|Buffer,position:number){
 const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);
 for(let done=0;done<bytes.length;){const {bytesWritten}=await handle.write(bytes,done,bytes.length-done,position+done);if(bytesWritten<=0)throw Error('WORKSPACE_IMPORT_JOURNAL_WRITE_FAILED');done+=bytesWritten;}
 return bytes.length;
}
async function publishHeader(journal:WorkspaceImportJournal){
 const {bytes,headerHash}=v2Header(journal),temp=resolve(directory(),`${journal.id}.${randomUUID()}.tmp`),handle=await open(temp,'wx',0o600);
 try{await writeAt(handle,bytes,0);await handle.sync();}finally{await handle.close();}
 try{await link(temp,file(journal.id));await missing(()=>unlink(temp));await syncDirectory(directory());}
 catch(e){await missing(()=>unlink(temp));throw e;}
 return {headerHash,length:bytes.length};
}
// The caller owns this SAME transaction until material rows and commit witness commit.
export async function beginWorkspaceImport(db:DB,journal:WorkspaceImportJournal){
 validateWorkspaceImportJournal(journal);if(journal.owners.length)throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');await rows(db,sql`SELECT pg_advisory_xact_lock(${lock(journal.id)})`);
 await mkdir(directory(),{recursive:true,mode:0o700});await mkdir(resolve(root(),'.owners'),{recursive:true,mode:0o700});
 const {headerHash,length}=await publishHeader(journal),handle=await open(file(journal.id),'r+');
 let position=length,createdId:string|undefined,createdBinding:OwnerClaim|undefined;
 const claims:string[]=[];
 try{
  for(const id of journal.planned){
   const path=resolve(root(),'.owners',id);await mkdir(path,{mode:0o700});createdId=id;
   const stat=await lstat(path,{bigint:true});createdBinding={id,device:String(stat.dev),inode:String(stat.ino)};
   const line=v2Claim(journal.id,headerHash,claims.length,createdBinding);
   position+=await writeAt(handle,line,position);claims.push(line);journal.owners.push(createdBinding);
   createdId=undefined;createdBinding=undefined;
  }
  // READY is durable before the caller can write its first material object.
  const ready=v2Ready(journal.id,headerHash,claims);await writeAt(handle,ready,position);await handle.sync();
  await syncDirectory(resolve(root(),'.owners'));
 }catch(error){
  // Ordinary failures seal an ABORT with the proven prefix and any freshly created owner.
  // A crash or repeated I/O failure leaves an incomplete journal for manual review.
  try{
   if(createdId&&!createdBinding){
    try{const stat=await lstat(resolve(root(),'.owners',createdId),{bigint:true});if(stat.isDirectory())createdBinding={id:createdId,device:String(stat.dev),inode:String(stat.ino)};}
    catch{/* No durable inode binding is available. */}
   }
   await handle.truncate(position);
   const abort=v2Abort(journal.id,headerHash,claims,createdBinding,!!createdId&&!createdBinding);
   await writeAt(handle,abort,position);await handle.sync();
  }catch{/* Preserve the journal; never continue to material writes. */}
  throw error;
 }finally{await handle.close();}
}
export async function commitWorkspaceImport(db:DB,journal:WorkspaceImportJournal){
 await rows(db,sql`SELECT record_workspace_import_commit(${journal.id}::uuid,${journal.project}::uuid,${JSON.stringify(journal.planned)}::jsonb)`);
}
async function discardJournal(db:DB,id:string){await missing(()=>unlink(file(id)));await syncDirectory(directory());await rows(db,sql`SELECT forget_workspace_import_commit(${id}::uuid)`);}
export async function cleanupWorkspaceImport(id:string):Promise<'missing'|'active'|'committed'|'purged'|'unknown'|'error'>{
 try{
  let encoded:Buffer;try{encoded=await readFile(file(id));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return'missing';throw e;}
  // Re-read under the lock: another cleaner may have removed or replaced the journal.
  const first=readJournalIdentity(encoded,id);
  return await scoped(first.user,first.tenant,async db=>{
   if(!(await rows(db,sql`SELECT pg_try_advisory_xact_lock(${lock(id)}) AS owned`))[0]?.owned)return'active';
   let current:Buffer;try{current=await readFile(file(id));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return'missing';throw e;}
   const journal=parseWorkspaceImportJournal(current,id);if(journal.id!==id||journal.user!==first.user||journal.tenant!==first.tenant)throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
   const result=(await rows(db,sql`SELECT workspace_import_commit_state(${id}::uuid,${journal.tenant}::uuid,${journal.project}::uuid,${JSON.stringify(journal.planned)}::jsonb,${JSON.stringify(journal.owners.map(o=>o.id))}::jsonb) AS state`))[0]?.state;
   if(result==='committed'){if(journal.state!=='ready')return'unknown';await discardJournal(db,id);return'committed';}
   if(result!=='absent')return'unknown';
   for(const binding of journal.owners){
    const registry=resolve(root(),'.owners',binding.id);let stat;try{stat=await lstat(registry,{bigint:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
    if(!stat.isDirectory()||String(stat.dev)!==binding.device||String(stat.ino)!==binding.inode)throw Error('WORKSPACE_IMPORT_OWNER_CHANGED');
    for(const object of await readdir(registry)){
     uuid.parse(object);const target=resolve(root(),object),registered=resolve(registry,object),entry=await lstat(registered,{bigint:true});let material;
     try{material=await lstat(target,{bigint:true});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
     // New object registrations are hard links to the exact newly created inode.
     const same=material&&material.isFile()&&entry.isFile()&&material.dev===entry.dev&&material.ino===entry.ino;
     if(material&&!same&&entry.size!==0n)throw Error('WORKSPACE_IMPORT_OBJECT_CHANGED');
     if(same)await missing(()=>unlink(target));
     // Only an empty interrupted reservation can coexist with a foreign flat inode.
     await missing(()=>unlink(registered));
    }
    await missing(()=>rmdir(registry));
   }
   if(journal.state==='incomplete'||journal.unresolved)return'unknown';
   await discardJournal(db,id);return'purged';
  });
 }catch{console.error('WORKSPACE_IMPORT_CLEANUP_FAILED');return'error';}
}
export async function cleanupWorkspaceImports(){
 let names:string[];try{names=await readdir(directory());}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return 0;throw e;}
 let cleaned=0;
 for(const name of names){
  if(uuid.safeParse(name).success){if(['committed','purged'].includes(await cleanupWorkspaceImport(name)))cleaned++;}
  else if(/^[a-f0-9-]{36}\.[a-f0-9-]{36}\.tmp$/.test(name)){
   const path=resolve(directory(),name);let stat;
   try{stat=await lstat(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
   if(Date.now()-stat.mtimeMs>86400000)await missing(()=>unlink(path));
  }
 }
 // Only forget acknowledgement metadata; a missing journal never authorizes material deletion.
 for(const row of await rows(globalDb,sql`SELECT * FROM retained_workspace_import_commits()`)){
  try{await lstat(file(row.import_id));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')await rows(globalDb,sql`SELECT forget_workspace_import_commit(${row.import_id}::uuid)`);else throw e;}
 }
 return cleaned;
}
