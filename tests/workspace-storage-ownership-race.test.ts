import {test,expect} from 'vitest';
import {mkdtemp,access,rm,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {writeOriginal,readOriginal,removeOwnedArtifact,hash} from '../packages/adapters/storage.ts';
import {writeOriginalStream,readOriginalToPrivateFile} from '../packages/adapters/workspace-original-stream.ts';
async function fixture(run:(root:string,owner:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'tmw-storage-inode-')),dir=process.env.DATA_DIR,key=process.env.DATA_KEY;process.env.DATA_DIR=join(root,'objects');process.env.DATA_KEY='ab'.repeat(32);try{await run(root,randomUUID());}finally{if(dir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=dir;if(key===undefined)delete process.env.DATA_KEY;else process.env.DATA_KEY=key;await rm(root,{recursive:true,force:true});}}
test('a failed long writer cannot unlink another owners replacement of its released object',async()=>fixture(async(root,owner)=>{
 const id=randomUUID(),other=randomUUID(),fresh=Buffer.from('new owner immutable public bytes');let started!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>started=r),hold=new Promise<void>(r=>release=r);
 async function* oldSource(){yield Buffer.from('old');started();await hold;throw Error('old-source-failed');}
 const old=writeOriginalStream(id,oldSource(),owner).then(()=>null,error=>error);
 try{await ready;await removeOwnedArtifact(id,owner);await writeOriginal(id,fresh,other);}finally{release();}
 const oldError=await old;expect(await readOriginal(id)).toEqual(fresh);expect(oldError?.message).toContain('old-source-failed');expect(await access(join(process.env.DATA_DIR!,'.owners',other,id))).toBeUndefined();await expect(access(join(process.env.DATA_DIR!,'.owners',owner,id))).rejects.toThrow();
}),15000);
test('a cancelled source read returns no private spool and retains the encrypted original',async()=>fixture(async(root,owner)=>{
 const bytes=Buffer.from('public source that must remain unchanged'),id=randomUUID();await writeOriginal(id,bytes,owner);const original=await readFile(join(process.env.DATA_DIR!,id));const abort=new AbortController();abort.abort();const output=join(root,'cancelled-spool');await expect(readOriginalToPrivateFile(id,output,hash(bytes),{signal:abort.signal})).rejects.toThrow();await expect(access(output)).rejects.toThrow();expect(await readFile(join(process.env.DATA_DIR!,id))).toEqual(original);expect(await readOriginal(id)).toEqual(bytes);
}));
