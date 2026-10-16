import { createCipheriv, createDecipheriv, createHash, randomBytes, type DecipherGCM } from 'node:crypto';
import { constants, type BigIntStats } from 'node:fs';
import { link, mkdir, open, unlink, lstat, type FileHandle } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// TMM-only adapter. Keep storage.ts's existing envelope byte format:
// base64(iv12 || AES-GCM(id AAD, base64(original bytes)) || tag16).
// Original V2 source bound (main.js:24512); V3 uses its own source budget (20528).
// Ordinary uploads and implicit source reads keep the V2 default.
const sourceMaxBytes = 4 * 1024 ** 3;
export const TMM_V3_SOURCE_MAX_BYTES = 8 * 1024 ** 3;
// Original secure plaintext bound plus its exact fixed/chunk framing bytes.
export const TMM_CONTAINER_MAX_BYTES = 32 * 1024 ** 3 + 65552 + 28 * Math.ceil(32 * 1024 ** 3 / 4194304);
const objectId = /^[a-f0-9-]{36}$/;
type Options = { purpose?: "tmm-container" | "tmm-v3-source"; maxBytes?: number; expectedBytes?: number; expectedHash?: string; signal?: AbortSignal };
const fail = (code: string): never => { throw Error(code); };
function dataKey() {
 const value=process.env.DATA_KEY??'';
 if(!/^[a-f0-9]{64}$/i.test(value))fail('DATA_KEY_REQUIRED');
 return Buffer.from(value,'hex');
}
function meter(options: Options) {
 const maximum=options.maxBytes??sourceMaxBytes;
 const allowed=options.purpose==='tmm-container'?TMM_CONTAINER_MAX_BYTES:options.purpose==='tmm-v3-source'?TMM_V3_SOURCE_MAX_BYTES:sourceMaxBytes;
 if(options.purpose!==undefined&&options.purpose!=='tmm-container'&&options.purpose!=='tmm-v3-source')fail('SOURCE_MISMATCH');
 if(options.purpose==='tmm-container'&&(options.expectedBytes===undefined||options.expectedHash===undefined)||options.purpose==='tmm-v3-source'&&options.expectedHash===undefined)fail('SOURCE_MISMATCH');
 if(!Number.isSafeInteger(maximum)||maximum<0||maximum>allowed||options.expectedBytes!==undefined&&(!Number.isSafeInteger(options.expectedBytes)||options.expectedBytes<0||options.expectedBytes>maximum)||options.expectedHash!==undefined&&!/^[a-f0-9]{64}$/.test(options.expectedHash))fail('SOURCE_MISMATCH');
 const digest=createHash('sha256');let size=0;
 return {
  add(part:Uint8Array){size+=part.byteLength;if(size>maximum)fail('FILE_SIZE_LIMIT');digest.update(part);},
  finish(){const sha256=digest.digest('hex');if(options.expectedBytes!==undefined&&size!==options.expectedBytes||options.expectedHash!==undefined&&sha256!==options.expectedHash)fail('SOURCE_MISMATCH');return{bytes:size,sha256};},
 };
}
async function* base64Encode(source:AsyncIterable<Uint8Array>) {
 let tail=Buffer.alloc(0);
 for await(const part of source){const bytes=tail.length?Buffer.concat([tail,part]):Buffer.from(part),length=bytes.length-bytes.length%3;if(length)yield Buffer.from(bytes.subarray(0,length).toString('base64'),'ascii');tail=Buffer.from(bytes.subarray(length));}
 if(tail.length)yield Buffer.from(tail.toString('base64'),'ascii');
}
async function* base64Decode(source:AsyncIterable<Uint8Array>) {
 let tail='';
 for await(const part of source){
  // latin1 preserves high bits so corrupt input cannot be masked into ASCII.
  const text=tail+Buffer.from(part).toString('latin1');
  if(!/^[A-Za-z0-9+/=]*$/.test(text))fail('SOURCE_MISMATCH');
  // Retain the final quartet; padding may straddle incoming stream chunks.
  const length=Math.max(0,Math.floor((text.length-4)/4)*4),body=text.slice(0,length);
  if(body.includes('='))fail('SOURCE_MISMATCH');
  if(length)yield Buffer.from(body,'base64');
  tail=text.slice(length);
 }
 if(tail.length){if(tail.length%4||!/^(?:[A-Za-z0-9+/]{4})*[A-Za-z0-9+/]{2,4}={0,2}$/.test(tail))fail('SOURCE_MISMATCH');const bytes=Buffer.from(tail,'base64');if(bytes.toString('base64')!==tail)fail('SOURCE_MISMATCH');yield bytes;}
}

// Match the existing removeOwnedArtifact dev/ino guard against path reuse.
async function removeSameObject(path:string,identity:BigIntStats){
 let current:BigIntStats;try{current=await lstat(path,{bigint:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
 if(current.isFile()&&current.dev===identity.dev&&current.ino===identity.ino)await unlink(path);
}
// FileHandle owns and closes each descriptor exactly once. A pipeline-destroyed
// fs stream must not close a raw descriptor behind a live FileHandle.
async function writeChunks(handle:FileHandle,source:AsyncIterable<Uint8Array>,signal?:AbortSignal){
 for await(const part of source){signal?.throwIfAborted();const bytes=Buffer.from(part);let at=0;while(at<bytes.length){const result=await handle.write(bytes,at,bytes.length-at,null);if(!result.bytesWritten)fail('SOURCE_MISMATCH');at+=result.bytesWritten;}}
 signal?.throwIfAborted();
}
async function* readChunks(handle:FileHandle){
 const buffer=Buffer.allocUnsafe(65536);while(true){const{bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)return;yield Buffer.from(buffer.subarray(0,bytesRead));}
}

export async function writeOriginalStream(id:string,source:AsyncIterable<Uint8Array>,owner:string,options:Options={}) {
 if(!objectId.test(id)||!objectId.test(owner))fail('INVALID_OBJECT');
 const digest=meter(options),key=dataKey(),iv=randomBytes(12),root=resolve(process.env.DATA_DIR??'.data/files'),registry=resolve(root,'.owners',owner),registered=resolve(registry,id),target=resolve(root,id);
 let handle:FileHandle|undefined,identity:BigIntStats|undefined,linked=false,completed=false;
 try{
  await mkdir(registry,{recursive:true,mode:0o700});handle=await open(registered,'wx',0o600);identity=await handle.stat({bigint:true});await link(registered,target);linked=true;
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(id));
  const measured=(async function*(){for await(const part of source){digest.add(part);yield part;}})();
  const encrypted=(async function*(){yield iv;for await(const part of base64Encode(measured))yield cipher.update(part);yield cipher.final();yield cipher.getAuthTag();})();
  await pipeline(Readable.from(base64Encode(encrypted)),source=>writeChunks(handle!,source,options.signal),{signal:options.signal});
  const result=digest.finish();await handle.sync();completed=true;return result;
 }finally{
  key.fill(0);
  try{await handle?.close();}finally{
   // Only our successfully-created reservation may be removed. A collision
   // belongs to the prior owner; never unlink it or an existing flat object.
   if(handle&&!completed&&identity){if(linked)await removeSameObject(target,identity).catch(()=>{});await removeSameObject(registered,identity).catch(()=>{});}
  }
 }
}

// Plaintext exists only at an exclusively-created 0600 spool. Return it only
// after GCM final/tag, size and source hash all pass; remove it on any failure.
export async function readOriginalToPrivateFile(id:string,path:string,expectedHash:string,options:Options={}) {
 if(!objectId.test(id)||!/^[a-f0-9]{64}$/.test(expectedHash))fail('INVALID_OBJECT');
 const digest=meter({...options,expectedHash}),key=dataKey(),target=resolve(process.env.DATA_DIR??'.data/files',id);
 let input:FileHandle|undefined,output:FileHandle|undefined,outputIdentity:BigIntStats|undefined,completed=false;
 try{
  input=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);if(!(await input.stat()).isFile())fail('SOURCE_MISMATCH');output=await open(path,'wx',0o600);outputIdentity=await output.stat({bigint:true});
  const source=readChunks(input);
  const decrypted=(async function*(){
   let iv=Buffer.alloc(0),tail=Buffer.alloc(0),decipher:DecipherGCM|undefined;
   for await(const incoming of base64Decode(source)){
    let bytes=Buffer.from(incoming);
    if(!decipher){const combined=Buffer.concat([iv,bytes]);if(combined.length<12){iv=combined;continue;}decipher=createDecipheriv('aes-256-gcm',key,combined.subarray(0,12),{authTagLength:16});decipher.setAAD(Buffer.from(id));bytes=combined.subarray(12);}
    const combined=Buffer.concat([tail,bytes]),length=Math.max(0,combined.length-16);if(length)yield decipher.update(combined.subarray(0,length));tail=Buffer.from(combined.subarray(length));
   }
   if(!decipher||tail.length!==16)return fail('SOURCE_MISMATCH');decipher.setAuthTag(tail);try{yield decipher.final();}catch{fail('SOURCE_MISMATCH');}
  })();
  const measured=(async function*(){for await(const part of base64Decode(decrypted)){digest.add(part);yield part;}})();
  await pipeline(Readable.from(measured),source=>writeChunks(output!,source,options.signal),{signal:options.signal});
  const result=digest.finish();await output.sync();completed=true;return{path,...result};
 }finally{
  key.fill(0);
  try{await input?.close();}finally{try{await output?.close();}finally{if(output&&!completed&&outputIdentity)await removeSameObject(path,outputIdentity).catch(()=>{});}}
 }
}
