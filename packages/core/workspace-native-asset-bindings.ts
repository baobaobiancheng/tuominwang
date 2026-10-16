import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import type {PortableObject} from './workspace-portable.ts';
import type {TmmFileRef} from './workspace-portable-stream.ts';
type NativeAsset=Buffer|TmmFileRef;
const sha=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const assetHash=(asset:NativeAsset)=>Buffer.isBuffer(asset)?sha(asset):asset.sha256;
const assetBytes=(asset:NativeAsset)=>Buffer.isBuffer(asset)?asset.length:asset.bytes;
const fail=(code:string):never=>{throw new Error(code);};
/** Original V2 accepts only its declared entries. Keep byte-identical native
 * sources bound to a declared source entry, and inline only bounded remaining
 * assets in the original 64 MiB workspace/index.json entry. */
export async function bindNativeAssetsToOriginalV2(snapshot:PortableObject,assets:Map<string,NativeAsset>,sources:Map<string,NativeAsset>){
 const ext=snapshot.tuominwangNative;if(ext?.version!==2||!Array.isArray(ext.assets))fail('PORTABLE_NATIVE_EXTENSION_INVALID');
 const remaining=67108864;let inlineBytes=0;
 for(const item of ext.assets){const asset=assets.get(item.entry) ?? fail('PORTABLE_NATIVE_EXTENSION_INVALID');if(assetHash(asset)!==item.sha256||assetBytes(asset)!==item.bytes)fail('PORTABLE_NATIVE_EXTENSION_INVALID');
  const same=[...sources].find(([,source])=>assetBytes(source)===item.bytes&&assetHash(source)===item.sha256);
  if(same){item.projectedSourceEntry=same[0];continue;}
  if(item.bytes>Math.floor(remaining*3/4)||inlineBytes+Math.ceil(item.bytes/3)*4>remaining)fail('TMM_V2_LIMIT_EXCEEDED');
  let count=0;const digest=createHash('sha256'),chunks:Buffer[]=[];
  const stream=Buffer.isBuffer(asset)?Readable.from([asset]):await asset.openReadStream();
  for await(const chunk of stream){const part=Buffer.from(chunk);count+=part.length;if(count>item.bytes)fail('PORTABLE_NATIVE_EXTENSION_INVALID');digest.update(part);chunks.push(part);}
  if(count!==item.bytes||digest.digest('hex')!==item.sha256)fail('PORTABLE_NATIVE_EXTENSION_INVALID');
  item.base64=Buffer.concat(chunks,count).toString('base64');inlineBytes+=item.base64.length;
 }
 return snapshot;
}
/** Native V3 may keep extra history entries, but a byte-identical original
 * already stored as a declared source needs only an authenticated reference. */
export function bindNativeSourceDuplicates(snapshot:PortableObject,assets:Map<string,NativeAsset>,sources:Map<string,NativeAsset>){
 const ext=snapshot.tuominwangNative;if(ext?.version!==2||!Array.isArray(ext.assets))fail('PORTABLE_NATIVE_EXTENSION_INVALID');
 const extra=new Map<string,NativeAsset>();
 for(const item of ext.assets){const asset=assets.get(item.entry)??fail('PORTABLE_NATIVE_EXTENSION_INVALID');
  if(assetHash(asset)!==item.sha256||assetBytes(asset)!==item.bytes)fail('PORTABLE_NATIVE_EXTENSION_INVALID');
  const same=[...sources].find(([,source])=>assetBytes(source)===item.bytes&&assetHash(source)===item.sha256);
  if(same)item.projectedSourceEntry=same[0];else extra.set(item.entry,asset);
 }
 return extra;
}
/** The old V1 reader expects the native extension assets inline. Its own
 * workspace.json entry budget remains 256 MiB; the writer checks the final
 * serialized entry after this bounded conversion. */
export async function inlineNativeAssetsForLegacy(snapshot:PortableObject,assets:Map<string,NativeAsset>){
 const ext=snapshot.tuominwangNative;if(ext?.version!==2||!Array.isArray(ext.assets))fail('PORTABLE_NATIVE_EXTENSION_INVALID');
 let encoded=0;const output=[];
 for(const item of ext.assets){const asset=assets.get(item.entry) ?? fail('PORTABLE_NATIVE_EXTENSION_INVALID');if(assetHash(asset)!==item.sha256||assetBytes(asset)!==item.bytes)fail('PORTABLE_NATIVE_EXTENSION_INVALID');
  if(item.bytes>Math.floor(268435456*3/4)||encoded+Math.ceil(item.bytes/3)*4>268435456)fail('WORKSPACE_V1_REQUIRES_V2');
  const stream=Buffer.isBuffer(asset)?Readable.from([asset]):await asset.openReadStream();
  const digest=createHash('sha256'),chunks:Buffer[]=[];let count=0;
  for await(const chunk of stream){const part=Buffer.from(chunk);count+=part.length;if(count>item.bytes)fail('PORTABLE_NATIVE_EXTENSION_INVALID');digest.update(part);chunks.push(part);}
  if(count!==item.bytes||digest.digest('hex')!==item.sha256)fail('PORTABLE_NATIVE_EXTENSION_INVALID');
  const base64=Buffer.concat(chunks,count).toString('base64');encoded+=base64.length;
  output.push({entry:item.entry,sha256:item.sha256,base64});
 }
 ext.version=1;ext.assets=output;
 return snapshot;
}

/** Original V2 has no undeclared ZIP entries. Rebind cloud history only to a
 * verified declared source entry or to bytes held inside the authenticated
 * 64 MiB index; never take a path from the extension as an archive entry. */
export function recoverNativeAssetsFromOriginalV2(snapshot:PortableObject,sources:Map<string,TmmFileRef>){
 const ext=snapshot.tuominwangNative;if(ext?.version!==2||ext.snapshot?.format!=='tuominwang-workspace'||!Array.isArray(ext.assets))fail('PORTABLE_NATIVE_EXTENSION_INVALID');
 const result=new Map<string,TmmFileRef>();
 for(const item of ext.assets){
  if(typeof item.entry!=='string'||!item.entry||item.entry.startsWith('/')||/[\\\0]/u.test(item.entry)||item.entry.split('/').some((part:string)=>!part||part==='..')||!Number.isSafeInteger(item.bytes)||item.bytes<0||!/^[a-f0-9]{64}$/u.test(item.sha256)||result.has(item.entry))fail('PORTABLE_NATIVE_EXTENSION_INVALID');
  if(typeof item.projectedSourceEntry==='string'&&item.base64===undefined){
   const source=sources.get(item.projectedSourceEntry) ?? fail('PORTABLE_NATIVE_EXTENSION_INVALID');if(source.bytes!==item.bytes||source.sha256!==item.sha256)fail('PORTABLE_NATIVE_EXTENSION_INVALID');
   result.set(item.entry,source);continue;
  }
  if(typeof item.base64!=='string'||item.projectedSourceEntry!==undefined||item.bytes>Math.floor(67108864*3/4))fail('PORTABLE_NATIVE_EXTENSION_INVALID');
  const value=Buffer.from(item.base64,'base64');if(value.toString('base64')!==item.base64||value.length!==item.bytes||sha(value)!==item.sha256)fail('PORTABLE_NATIVE_EXTENSION_INVALID');
  result.set(item.entry,{bytes:value.length,sha256:item.sha256,openReadStream:()=>Readable.from([value])});
 }
 const native=ext.snapshot;
 if(!Array.isArray(native.documents)||native.documents.length!==snapshot.documents.length)fail('PORTABLE_NATIVE_EXTENSION_MISMATCH');
 for(const d of native.documents){const projected=snapshot.documents.find((p:any)=>p.id===d.id) ?? fail('PORTABLE_NATIVE_EXTENSION_MISMATCH'),asset=result.get(d.sourceEntry) ?? fail('PORTABLE_NATIVE_EXTENSION_MISMATCH');
  if(asset.sha256!==d.sourceHash||sha(Buffer.from(d.content))!==d.contentHash||projected.detection.documentText!==d.content)fail('PORTABLE_NATIVE_EXTENSION_MISMATCH');
  const projectedSource=sources.get(projected.sourceEntry);if(!projectedSource||(!projected.convertedOriginalFormat&&projectedSource.sha256!==asset.sha256))fail('PORTABLE_NATIVE_EXTENSION_MISMATCH');
 }
 return{snapshot:native,assets:result};
}
