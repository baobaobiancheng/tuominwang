import {test,expect} from 'vitest';
import {mkdtemp,readFile,writeFile,lstat,access,rm,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {writeOriginal,readOriginal} from '../packages/adapters/storage.ts';
import {writeOriginalStream,readOriginalToPrivateFile,TMM_CONTAINER_MAX_BYTES} from '../packages/adapters/workspace-original-stream.ts';
const hash=(v:Buffer)=>createHash('sha256').update(v).digest('hex');
async function* chunks(bytes:Buffer){let at=0,index=0;const sizes=[1,2,3,7,8191,16384];while(at<bytes.length){const next=Math.min(bytes.length,at+sizes[index++%sizes.length]);yield bytes.subarray(at,next);at=next;}}
async function fixture(run:(root:string,owner:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),'tmw-storage-stream-')),prior={DATA_DIR:process.env.DATA_DIR,DATA_KEY:process.env.DATA_KEY};process.env.DATA_DIR=join(root,'objects');process.env.DATA_KEY='ab'.repeat(32);try{await run(root,randomUUID());}finally{for(const [k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;await rm(root,{recursive:true,force:true});}}

test('TMM source streams preserve the existing encrypted objects in both directions at padding and chunk boundaries',async()=>fixture(async(root,owner)=>{
 for(const length of [0,1,2,3,4,7,36839,36840,36841,36842,36843,65533,65534,65535,65536,65537,2*1024*1024+1]){
  const bytes=Buffer.alloc(length);for(let i=0;i<length;i++)bytes[i]=i%251;
  const id=randomUUID(),written=await writeOriginalStream(id,chunks(bytes),owner,{expectedHash:hash(bytes),expectedBytes:length});expect(written).toEqual({bytes:length,sha256:hash(bytes)});expect((await readOriginal(id)).equals(bytes)).toBe(true);
  const flat=await lstat(join(process.env.DATA_DIR!,id)),registered=await lstat(join(process.env.DATA_DIR!,'.owners',owner,id));expect(flat.ino).toBe(registered.ino);expect(flat.mode&0o777).toBe(0o600);
  const legacy=randomUUID();await writeOriginal(legacy,bytes,owner);const output=join(root,'spool-'+length),spooled=await readOriginalToPrivateFile(legacy,output,hash(bytes),{expectedBytes:length});expect(spooled).toEqual({path:output,bytes:length,sha256:hash(bytes)});expect((await readFile(output)).equals(bytes)).toBe(true);expect((await lstat(output)).mode&0o777).toBe(0o600);
 }
}),30000);

test('corruption, mismatched source identity and byte budgets never return or retain a plaintext spool',async()=>fixture(async(root,owner)=>{
 const bytes=Buffer.from('public synthetic immutable material'),id=randomUUID();await writeOriginal(id,bytes,owner);const path=join(process.env.DATA_DIR!,id),encoded=await readFile(path);
 const failures=[{name:'wrong-hash',stored:encoded,expectedHash:'00'.repeat(32),options:{}},{name:'wrong-size',stored:encoded,expectedHash:hash(bytes),options:{expectedBytes:bytes.length+1}},{name:'over-budget',stored:encoded,expectedHash:hash(bytes),options:{maxBytes:bytes.length-1}},{name:'truncated',stored:encoded.subarray(0,-1),expectedHash:hash(bytes),options:{}}];
 const binary=Buffer.from(encoded.toString(),'base64');binary[binary.length-1]^=1;failures.push({name:'tag',stored:Buffer.from(binary.toString('base64')),expectedHash:hash(bytes),options:{}});
 const highBit=Buffer.from(encoded);highBit[0]|=0x80;failures.push({name:'non-ascii',stored:highBit,expectedHash:hash(bytes),options:{}});
 for(const item of failures){await writeFile(path,item.stored);const output=join(root,item.name);await expect(readOriginalToPrivateFile(id,output,item.expectedHash,item.options)).rejects.toThrow();await expect(access(output)).rejects.toThrow();}
 await writeFile(path,encoded);expect(await readOriginal(id)).toEqual(bytes);
 const existing=join(root,'existing');await writeFile(existing,'keep');await expect(readOriginalToPrivateFile(id,existing,hash(bytes))).rejects.toThrow();expect(await readFile(existing,'utf8')).toBe('keep');
}));

test('stream writes preserve prior owners and clean only their own failed reservation',async()=>fixture(async(root,owner)=>{
 const bytes=Buffer.from('original bytes retained'),id=randomUUID(),other=randomUUID();await writeOriginal(id,bytes,owner);
 await expect(writeOriginalStream(id,chunks(Buffer.from('replacement')),other)).rejects.toThrow();expect(await readOriginal(id)).toEqual(bytes);await expect(access(join(process.env.DATA_DIR!,'.owners',other,id))).rejects.toThrow();
 await expect(writeOriginalStream(id,chunks(Buffer.from('replacement')),owner)).rejects.toThrow();expect(await readOriginal(id)).toEqual(bytes);
 async function* failed(){yield Buffer.from('partial');throw Error('producer failed');}
 for(const [source,options]of [[failed(),{}],[chunks(bytes),{maxBytes:bytes.length-1}],[chunks(bytes),{expectedHash:'00'.repeat(32)}]]as const){const target=randomUUID();await expect(writeOriginalStream(target,source,owner,options)).rejects.toThrow();await expect(access(join(process.env.DATA_DIR!,target))).rejects.toThrow();await expect(access(join(process.env.DATA_DIR!,'.owners',owner,target))).rejects.toThrow();}
 const abort=new AbortController();abort.abort();const cancelled=randomUUID();await expect(writeOriginalStream(cancelled,chunks(bytes),owner,{signal:abort.signal})).rejects.toThrow();await expect(access(join(process.env.DATA_DIR!,cancelled))).rejects.toThrow();expect(await readOriginal(id)).toEqual(bytes);
}));

test('a missing key creates no plaintext or object reservation',async()=>fixture(async(root,owner)=>{
 const bytes=Buffer.from('public fixture'),id=randomUUID();await writeOriginal(id,bytes,owner);delete process.env.DATA_KEY;
 const output=join(root,'no-key');await expect(readOriginalToPrivateFile(id,output,hash(bytes))).rejects.toThrow('DATA_KEY_REQUIRED');await expect(access(output)).rejects.toThrow();
 const target=randomUUID();await expect(writeOriginalStream(target,chunks(bytes),owner)).rejects.toThrow('DATA_KEY_REQUIRED');await expect(access(join(process.env.DATA_DIR!,target))).rejects.toThrow();await expect(access(join(process.env.DATA_DIR!,'.owners',owner,target))).rejects.toThrow();
}));

// A completed archive is a TMM container, not one 4 GiB source. Only an
// explicit internal purpose plus an explicit bound permits that result budget.
test('TMM result containers have their own explicit framing budget without widening ordinary sources',async()=>fixture(async(root,owner)=>{
 const bytes=Buffer.from('public completed TMM envelope bytes'),ordinary=randomUUID();
 await expect(writeOriginalStream(ordinary,chunks(bytes),owner,{maxBytes:4*1024**3+1})).rejects.toThrow('SOURCE_MISMATCH');await expect(access(join(process.env.DATA_DIR!,ordinary))).rejects.toThrow();
 for(const missing of [{expectedBytes:bytes.length},{expectedHash:hash(bytes)}]){const incomplete=randomUUID();await expect(writeOriginalStream(incomplete,chunks(bytes),owner,{purpose:'tmm-container',maxBytes:TMM_CONTAINER_MAX_BYTES,...missing})).rejects.toThrow('SOURCE_MISMATCH');await expect(access(join(process.env.DATA_DIR!,incomplete))).rejects.toThrow();}
 const id=randomUUID(),options={purpose:'tmm-container' as const,maxBytes:TMM_CONTAINER_MAX_BYTES,expectedBytes:bytes.length,expectedHash:hash(bytes)};
 expect(await writeOriginalStream(id,chunks(bytes),owner,options)).toEqual({bytes:bytes.length,sha256:hash(bytes)});expect(await readOriginal(id)).toEqual(bytes);
 const output=join(root,'container-spool');expect((await readOriginalToPrivateFile(id,output,hash(bytes),options)).bytes).toBe(bytes.length);expect(await readFile(output)).toEqual(bytes);
 const excessive=randomUUID();await expect(writeOriginalStream(excessive,chunks(bytes),owner,{purpose:'tmm-container',maxBytes:TMM_CONTAINER_MAX_BYTES+1,expectedBytes:bytes.length,expectedHash:hash(bytes)})).rejects.toThrow('SOURCE_MISMATCH');await expect(access(join(process.env.DATA_DIR!,excessive))).rejects.toThrow();
}));
