import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {hash,seal,unseal,removeOwnedArtifact} from './storage.ts';
import {writeOriginalStream,readOriginalToPrivateFile,TMM_CONTAINER_MAX_BYTES} from './workspace-original-stream.ts';

const pointerSchema=z.object({kind:z.literal('tmm-stream-v1'),storageId:z.uuid(),bytes:z.number().int().nonnegative().max(TMM_CONTAINER_MAX_BYTES),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
type Pointer=z.infer<typeof pointerSchema>;
const options=(p:Pointer)=>({purpose:'tmm-container' as const,maxBytes:TMM_CONTAINER_MAX_BYTES,expectedBytes:p.bytes,expectedHash:p.sha256});
// Existing inline receipts keep their bytes and AAD. New receipts seal only a
// pointer; the archive uses the existing encrypted immutable object store.
export function decodeWorkspaceSavePayload(payload:string,aad:string,outputHash:string):{kind:'inline';bytes:Buffer}|Pointer{
 const plain=unseal(payload,aad);
 if(plain.startsWith('{')){const p=pointerSchema.parse(JSON.parse(plain));if(p.sha256!==outputHash)throw Error('WORKSPACE_SAVE_HASH_MISMATCH');return p;}
 const bytes=Buffer.from(plain,'base64');
 if(bytes.toString('base64')!==plain||hash(bytes)!==outputHash)throw Error('WORKSPACE_SAVE_HASH_MISMATCH');
 return {kind:'inline',bytes};
}
export async function persistWorkspaceSaveFile(path:string,owner:string,aad:string,signal?:AbortSignal){
 const digest=createHash('sha256');let bytes=0;
 for await(const chunk of createReadStream(path)){signal?.throwIfAborted();bytes+=chunk.length;if(bytes>TMM_CONTAINER_MAX_BYTES)throw Error('WORKSPACE_SAVE_TOO_LARGE');digest.update(chunk);}
 if(!bytes)throw Error('WORKSPACE_SAVE_EMPTY');
 const pointer:Pointer={kind:'tmm-stream-v1',storageId:owner,bytes,sha256:digest.digest('hex')};
 await writeOriginalStream(pointer.storageId,createReadStream(path),owner,{...options(pointer),signal});
 try{return {pointer,payload:seal(JSON.stringify(pointer),aad),outputHash:pointer.sha256};}
 catch(error){await removeOwnedArtifact(pointer.storageId,owner);throw error;}
}
export async function openWorkspaceSaveFile(pointer:Pointer,path:string,signal?:AbortSignal){
 pointerSchema.parse(pointer);
 return readOriginalToPrivateFile(pointer.storageId,path,pointer.sha256,{...options(pointer),signal});
}
export async function releaseWorkspaceSavePayload(payload:string|null,aad:string,outputHash:string|null,owner:string){
 if(!payload||!outputHash)return;
 const decoded=decodeWorkspaceSavePayload(payload,aad,outputHash);
 if(decoded.kind==='tmm-stream-v1')await removeOwnedArtifact(decoded.storageId,owner);
}
