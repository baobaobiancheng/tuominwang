import {test,expect} from 'vitest';
import {mkdtemp,open,readFile,writeFile,lstat,access,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {hash,seal,unseal,writeOriginal} from '../packages/adapters/storage.ts';
import {persistWorkspaceSaveFile,decodeWorkspaceSavePayload,openWorkspaceSaveFile,releaseWorkspaceSavePayload} from '../packages/adapters/workspace-save-payload.ts';
async function fixture(run:(root:string,owner:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'tmw-save-payload-')),prior={DATA_DIR:process.env.DATA_DIR,DATA_KEY:process.env.DATA_KEY};process.env.DATA_DIR=join(root,'objects');process.env.DATA_KEY='cd'.repeat(32);try{await run(root,randomUUID());}finally{for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;await rm(root,{recursive:true,force:true});}}
async function fileHash(path:string){const h=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(path)){h.update(chunk);bytes+=chunk.length;}return {bytes,sha256:h.digest('hex')};}

test('an archive above the old 50 MiB whole-file limit persists and authenticates without an inline database payload',async()=>fixture(async(root,owner)=>{
 const path=join(root,'public-synthetic-archive'),handle=await open(path,'wx',0o600),chunk=Buffer.alloc(1024*1024);for(let i=0;i<chunk.length;i++)chunk[i]=i%251;
 try{for(let i=0;i<51;i++)await handle.writeFile(chunk);await handle.writeFile(Buffer.from([1]));}finally{await handle.close();}
 const expected=await fileHash(path),aad=owner+':session:snapshot';const saved=await persistWorkspaceSaveFile(path,owner,aad);
 expect(saved.pointer.storageId).toBe(owner);expect(saved.outputHash).toBe(expected.sha256);expect(saved.pointer.bytes).toBe(51*1024**2+1);expect(saved.payload.length).toBeLessThan(1024);
 const decoded=decodeWorkspaceSavePayload(saved.payload,aad,saved.outputHash);expect(decoded).toEqual(saved.pointer);
 expect(unseal(saved.payload,aad)).not.toContain(path);expect((await lstat(join(process.env.DATA_DIR!,saved.pointer.storageId))).mode&0o777).toBe(0o600);
 const spool=join(root,'verified-download');await openWorkspaceSaveFile(saved.pointer,spool);expect(await fileHash(spool)).toEqual(expected);expect((await lstat(spool)).mode&0o777).toBe(0o600);
 await expect(releaseWorkspaceSavePayload(saved.payload,aad,saved.outputHash,randomUUID())).rejects.toThrow('ARTIFACT_OWNER_MISSING');expect(await fileHash(spool)).toEqual(expected);
 await releaseWorkspaceSavePayload(saved.payload,aad,saved.outputHash,owner);await expect(access(join(process.env.DATA_DIR!,saved.pointer.storageId))).rejects.toThrow();
}),60000);

test('old inline receipts remain byte-identical; session binding and pointer/hash tampering fail closed',async()=>fixture(async(root,owner)=>{
 const bytes=Buffer.from('synthetic old workspace receipt'),aad=owner+':bound-session-snapshot',legacy=seal(bytes.toString('base64'),aad);
 expect(decodeWorkspaceSavePayload(legacy,aad,hash(bytes))).toEqual({kind:'inline',bytes});await releaseWorkspaceSavePayload(legacy,aad,hash(bytes),owner);
 expect(()=>decodeWorkspaceSavePayload(legacy,'other-session',hash(bytes))).toThrow();expect(()=>decodeWorkspaceSavePayload(legacy,aad,'0'.repeat(64))).toThrow('WORKSPACE_SAVE_HASH_MISMATCH');
 const path=join(root,'archive');await writeFile(path,bytes);const saved=await persistWorkspaceSaveFile(path,owner,aad);
 expect(()=>decodeWorkspaceSavePayload(saved.payload,aad,'0'.repeat(64))).toThrow('WORKSPACE_SAVE_HASH_MISMATCH');
 for(const change of[{storageId:'../outside'},{bytes:-1},{bytes:2**53},{unexpected:'x'},{sha256:'broken'}])expect(()=>decodeWorkspaceSavePayload(seal(JSON.stringify({...saved.pointer,...change}),aad),aad,saved.outputHash)).toThrow();
 const flat=join(process.env.DATA_DIR!,saved.pointer.storageId),encoded=await readFile(flat,'utf8'),binary=Buffer.from(encoded,'base64');binary[binary.length-1]^=1;await writeFile(flat,binary.toString('base64'));
 const target=join(root,'never-exposed');await expect(openWorkspaceSaveFile(saved.pointer,target)).rejects.toThrow();await expect(access(target)).rejects.toThrow();
 await releaseWorkspaceSavePayload(saved.payload,aad,saved.outputHash,owner);
 const other=randomUUID();await writeOriginal(other,Buffer.from('another owner'),randomUUID());const forged=seal(JSON.stringify({...saved.pointer,storageId:other}),aad);await expect(releaseWorkspaceSavePayload(forged,aad,saved.outputHash,owner)).rejects.toThrow('ARTIFACT_OWNER_MISSING');expect(await readFile(join(process.env.DATA_DIR!,other),'utf8')).toBeTruthy();
}));
