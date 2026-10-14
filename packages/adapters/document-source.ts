import {hash,readOriginal} from './storage.ts';
/** Originals remain immutable. An unlocked derivative is bound to both hashes;
 * neither a password nor caller-supplied plaintext is accepted here. */
export async function verifiedDocumentSource(d:{source_id:string;source_hash:string;unlocked_source_id?:string|null;unlocked_source_hash?:string|null;unlock_source_hash?:string|null}):Promise<Buffer>{
 const original=await readOriginal(d.source_id);
 if(hash(original)!==d.source_hash)throw new Error('SOURCE_MISMATCH');
 if(!d.unlocked_source_id){if(d.unlocked_source_hash||d.unlock_source_hash)throw new Error('SOURCE_MISMATCH');return original;}
 if(d.unlock_source_hash!==d.source_hash||!d.unlocked_source_hash)throw new Error('SOURCE_MISMATCH');
 const derived=await readOriginal(d.unlocked_source_id);
 if(hash(derived)!==d.unlocked_source_hash)throw new Error('SOURCE_MISMATCH');
 return derived;
}
