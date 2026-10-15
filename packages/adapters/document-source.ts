import{originalDocumentFormat,isLegacyWordFormat}from'../core/document-format.ts';
import{readNormalizationMetadata}from'./document-normalization.ts';
import {hash,readOriginal} from './storage.ts';
/** Originals remain immutable. An unlocked derivative is bound to both hashes;
 * neither a password nor caller-supplied plaintext is accepted here. */
export async function verifiedDocumentSource(d:any):Promise<Buffer>{
 const original=await readOriginal(d.source_id);
 if(hash(original)!==d.source_hash)throw new Error('SOURCE_MISMATCH');
 if(isLegacyWordFormat(originalDocumentFormat(d))){if(d.unlocked_source_id||!d.normalized_source_id||d.normalization_source_hash!==d.source_hash||!d.normalized_source_hash)throw new Error('LEGACY_OFFICE_NORMALIZATION_REQUIRED');readNormalizationMetadata(d);const normalized=await readOriginal(d.normalized_source_id);if(hash(normalized)!==d.normalized_source_hash)throw new Error('SOURCE_MISMATCH');return normalized;}
 if(d.normalized_source_id||d.normalized_source_hash||d.normalization_source_hash||d.normalization_metadata)throw new Error('SOURCE_MISMATCH');
 if(!d.unlocked_source_id){if(d.unlocked_source_hash||d.unlock_source_hash)throw new Error('SOURCE_MISMATCH');return original;}
 if(d.unlock_source_hash!==d.source_hash||!d.unlocked_source_hash)throw new Error('SOURCE_MISMATCH');
 const derived=await readOriginal(d.unlocked_source_id);
 if(hash(derived)!==d.unlocked_source_hash)throw new Error('SOURCE_MISMATCH');
 return derived;
}
