import {sealPageReview} from './page-review-storage.ts';
/** Runs under the migration transaction. Existing geometry/approvals/revisions are unchanged. */
export async function migrateLegacyPageReviewMetadata(client:{query:(text:string,values?:any[])=>Promise<{rows:any[];rowCount?:number|null}>}){
 const predicate="EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(page_review->'regions','[]'::jsonb)) r WHERE r ?| ARRAY['entityType','text','meta'])";
 let documents=0,snapshots=0;
 const docs=await client.query(`SELECT * FROM documents WHERE ${predicate} FOR UPDATE`);
 for(const doc of docs.rows){const stored=sealPageReview(doc,doc.page_review);await client.query('UPDATE documents SET page_review=$2::jsonb WHERE id=$1',[doc.id,JSON.stringify(stored)]);documents++;}
 const old=await client.query(`SELECT s.*,d.source_hash FROM review_snapshots s JOIN documents d ON d.id=s.document_id WHERE ${predicate.replaceAll('page_review','s.page_review')} FOR UPDATE OF s`);
 for(const snapshot of old.rows){const stored=sealPageReview({...snapshot,id:snapshot.document_id},snapshot.page_review);await client.query('UPDATE review_snapshots SET page_review=$3::jsonb WHERE document_id=$1 AND revision=$2',[snapshot.document_id,snapshot.revision,JSON.stringify(stored)]);snapshots++;}
 return{documents,snapshots};
}
