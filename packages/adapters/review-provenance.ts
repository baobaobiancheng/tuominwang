import {rows,sql,type DB} from './db.ts';
import {hash,seal,unseal} from './storage.ts';
import {deriveReviewProvenance,assertReviewProvenance,transitionReviewProvenance,type ReviewProvenance} from '../core/review-provenance.ts';
import type{ReviewEntityLink}from'../core/review-entity-slots.ts';
import type {Mark} from '../contracts/index.ts';
const context=(d:any,revision=d.revision)=>({documentId:d.id,contentHash:d.content_hash,revision});
const aad=(d:any,revision=d.revision)=>`${d.tenant_id}:${d.project_id}:${d.id}:${revision}:${d.content_hash}:review-entity-metadata`;
/** Historical snapshots retain their own canonical text inside authenticated
 * metadata. A missing historical payload must never borrow current OCR text. */
export async function readReviewProvenanceArchive(db:DB,d:any,snapshot?:any):Promise<{frame:ReviewProvenance;canonicalText:string|null}>{
 let row=snapshot??(await rows(db,sql`SELECT * FROM review_snapshots WHERE document_id=${d.id} AND revision=${d.revision} AND content_hash=${d.content_hash}`))[0];
 const revision=row?.revision??d.revision,contentHash=row?.content_hash??d.content_hash,ctx={documentId:d.id,contentHash,revision};
 if(!row?.entity_metadata){const[history]=await rows(db,sql`SELECT * FROM review_entity_history WHERE document_id=${d.id} AND revision=${revision} AND content_hash=${contentHash}`);if(history)row=history;}
 if(row?.document_id&&row.document_id!==d.id)throw new Error('REVIEW_PROVENANCE_INVALID');
 if(row?.entity_metadata){
  let stored:{frame:ReviewProvenance;canonicalText:string};try{const body=unseal(row.entity_metadata,aad({...d,content_hash:contentHash},revision));if(row.metadata_hash&&hash(body)!==row.metadata_hash)throw Error();stored=JSON.parse(body);}catch{throw new Error('REVIEW_PROVENANCE_INVALID');}
  if(typeof stored.canonicalText!=='string'||hash(stored.canonicalText)!==contentHash)throw new Error('SOURCE_MISMATCH');assertReviewProvenance(stored.frame,ctx);
  if(stored.frame.entries.some(e=>e.end>stored.canonicalText.length))throw new Error('REVIEW_PROVENANCE_INVALID');
  return stored;
 }
 let canonicalText:string|null=null;if(contentHash===d.content_hash){canonicalText=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);if(hash(canonicalText)!==contentHash)throw new Error('SOURCE_MISMATCH');}
 return{frame:deriveReviewProvenance(ctx,row?.marks??d.marks),canonicalText};
}
export async function readReviewProvenance(db:DB,d:any):Promise<ReviewProvenance>{return(await readReviewProvenanceArchive(db,d)).frame;}
/** Called in the same locked transaction as the new immutable review snapshot. */
export async function sealNextReviewProvenance(db:DB,d:any,marks:Mark[],actorId:string,links?:ReviewEntityLink[],transform?:(frame:ReviewProvenance)=>ReviewProvenance){
 const text=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);if(hash(text)!==d.content_hash)throw new Error('SOURCE_MISMATCH');
 const previous=await readReviewProvenance(db,d),next=transitionReviewProvenance(previous,context(d,d.revision+1),d.marks,marks,actorId,new Date().toISOString(),links),frame=transform?transform(next):next;
 assertReviewProvenance(frame,context(d,d.revision+1));return seal(JSON.stringify({frame,canonicalText:text}),aad(d,d.revision+1));
}
