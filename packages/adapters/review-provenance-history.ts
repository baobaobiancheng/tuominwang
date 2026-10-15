import type{Mark}from'../contracts/index.ts';import{rows,sql,type DB}from'./db.ts';import{hash,seal,unseal}from'./storage.ts';import{readReviewProvenance}from'./review-provenance.ts';import{rebindReviewProvenance,type ProvenanceRebinding}from'../core/review-provenance-rebind.ts';import{assertReviewProvenance,type ReviewProvenance}from'../core/review-provenance.ts';
const aad=(d:any)=>`${d.tenant_id}:${d.project_id}:${d.id}:${d.revision}:${d.content_hash}:review-entity-metadata`;
async function appendHistory(db:DB,d:any,frame:ReviewProvenance,text:string){
 assertReviewProvenance(frame,{documentId:d.id,contentHash:d.content_hash,revision:d.revision});if(hash(text)!==d.content_hash||frame.entries.some(e=>e.end>text.length))throw Error('REVIEW_PROVENANCE_INVALID');
 const body=JSON.stringify({frame,canonicalText:text}),digest=hash(body);await rows(db,sql`INSERT INTO review_entity_history(document_id,revision,content_hash,tenant_id,project_id,entity_metadata,metadata_hash)VALUES(${d.id},${d.revision},${d.content_hash},${d.tenant_id},${d.project_id},${seal(body,aad(d))},${digest}) ON CONFLICT(document_id,revision,content_hash) DO NOTHING`);
 const[stored]=await rows(db,sql`SELECT metadata_hash FROM review_entity_history WHERE document_id=${d.id} AND revision=${d.revision} AND content_hash=${d.content_hash}`);if(stored?.metadata_hash!==digest)throw Error('REVIEW_PROVENANCE_CONFLICT');
}
/** Caller holds project and document locks and commits both history and the
 * canonical mutation atomically. This never writes an accepted review row. */
export async function recordReboundReviewProvenance(db:DB,oldDoc:any,nextDoc:any,input:{links:ProvenanceRebinding[];actorId:string;operation:string}){
 if(oldDoc.id!==nextDoc.id||oldDoc.tenant_id!==nextDoc.tenant_id||oldDoc.project_id!==nextDoc.project_id||nextDoc.revision!==oldDoc.revision+1||!input.operation)throw Error('REVIEW_PROVENANCE_REBIND_INVALID');
 const source=unseal(oldDoc.content,`${oldDoc.tenant_id}:${oldDoc.project_id}:${oldDoc.id}`),text=unseal(nextDoc.content,`${nextDoc.tenant_id}:${nextDoc.project_id}:${nextDoc.id}`);if(hash(source)!==oldDoc.content_hash||hash(text)!==nextDoc.content_hash)throw Error('SOURCE_MISMATCH');
 const previous=await readReviewProvenance(db,oldDoc),frame=rebindReviewProvenance(previous,source,{documentId:nextDoc.id,contentHash:nextDoc.content_hash,revision:nextDoc.revision},text,oldDoc.marks as Mark[],nextDoc.marks as Mark[],input.links,input.actorId,input.operation,new Date().toISOString());await appendHistory(db,oldDoc,previous,source);await appendHistory(db,nextDoc,frame,text);return frame;
}
