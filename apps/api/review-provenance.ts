import type {FastifyInstance} from 'fastify';import {z} from 'zod';
import {id} from '../../packages/contracts/index.ts';import {rows,sql} from '../../packages/adapters/db.ts';
import {readReviewProvenance,readReviewProvenanceArchive} from '../../packages/adapters/review-provenance.ts';
import {assertReviewProvenance,referenceReviewMetadata} from '../../packages/core/review-provenance.ts';import {hash,unseal} from '../../packages/adapters/storage.ts';import {projectScope,denied} from './access.ts';
export function registerReviewProvenanceRoutes(app:FastifyInstance){
 app.get('/api/documents/:id/review-provenance',async req=>{const document=id.parse((req.params as any).id),input=z.object({revision:z.coerce.number().int().nonnegative(),offset:z.coerce.number().int().nonnegative().default(0),limit:z.coerce.number().int().min(1).max(100).default(50),origin:z.enum(['local','inherited']).default('local'),archiveRevision:z.coerce.number().int().nonnegative().optional()}).strict().parse(req.query);return projectScope(req,{document},['view_original'],async db=>{
  const[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${document} FOR SHARE`);if(d.revision!==input.revision)denied('VERSION_CONFLICT',409);
  if(input.origin==='inherited'){
   const[p]=await rows(db,sql`SELECT portable_state FROM projects WHERE id=${d.project_id}`),state=p?.portable_state?JSON.parse(unseal(p.portable_state,`${d.tenant_id}:${d.project_id}:portable-state`)):null,oldId=Object.entries(state?.documentIdMap??{}).find(([,target])=>target===d.id)?.[0],old=state?.importedSnapshot?.documents?.find((item:any)=>item.id===oldId),archives:any[]=[];
   if(old?.reviewProvenance)archives.push({frame:old.reviewProvenance,canonicalText:old.content});
   for(const snapshot of state?.importedSnapshot?.snapshots??[])if(snapshot.documentId===oldId&&snapshot.reviewProvenanceArchive)archives.push(snapshot.reviewProvenanceArchive);
   for(const history of state?.importedSnapshot?.provenanceHistory??[])if(history.documentId===oldId&&history.archive)archives.push(history.archive);
   for(const history of old?.reviewProvenanceHistory??[])if(history.archive)archives.push(history.archive);
   const choices=[...new Set<number>(archives.map(a=>a.frame.revision))].sort((a,b)=>b-a),archive=archives.find(a=>a.frame.revision===(input.archiveRevision??choices[0]));
   if(!archive)return{origin:'inherited',available:false,entries:[],total:0,nextOffset:null,archiveRevisions:choices};
   const frame=archive.frame;assertReviewProvenance(frame,{documentId:oldId!,contentHash:frame.contentHash,revision:frame.revision});
   if(archive.canonicalText!==null&&(typeof archive.canonicalText!=='string'||hash(archive.canonicalText)!==frame.contentHash))denied('SOURCE_MISMATCH',409);
   const entries=frame.entries.slice(input.offset,input.offset+input.limit).map((e:any)=>({...e,meta:archive.canonicalText!==null?referenceReviewMetadata(e,archive.canonicalText):e.meta}));
   return{...frame,origin:'inherited',available:true,authoritativeForLocalReview:false,entries,total:frame.entries.length,nextOffset:input.offset+entries.length<frame.entries.length?input.offset+entries.length:null,archiveRevisions:choices};
  }
  const archiveRevisions=(await rows(db,sql`SELECT DISTINCT revision FROM(SELECT revision FROM review_snapshots WHERE document_id=${d.id} UNION ALL SELECT revision FROM review_entity_history WHERE document_id=${d.id}) h ORDER BY revision DESC`)).map(r=>r.revision);
  if(input.archiveRevision!==undefined&&input.archiveRevision!==d.revision){
   let[archive]=await rows(db,sql`SELECT * FROM review_snapshots WHERE document_id=${d.id} AND revision=${input.archiveRevision}`);if(!archive)[archive]=await rows(db,sql`SELECT * FROM review_entity_history WHERE document_id=${d.id} AND revision=${input.archiveRevision} ORDER BY created_at DESC LIMIT 1`);if(!archive)denied('NOT_FOUND',404);
   const stored=await readReviewProvenanceArchive(db,d,archive),frame=stored.frame,entries=frame.entries.slice(input.offset,input.offset+input.limit).map(e=>({...e,meta:stored.canonicalText!==null?referenceReviewMetadata(e,stored.canonicalText):e.meta}));
   return{...frame,origin:'local',available:true,current:false,archiveRevisions,entries,total:frame.entries.length,nextOffset:input.offset+entries.length<frame.entries.length?input.offset+entries.length:null};
  }
  const text=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);if(hash(text)!==d.content_hash)denied('SOURCE_MISMATCH',409);const frame=await readReviewProvenance(db,d),entries=frame.entries.slice(input.offset,input.offset+input.limit).map(e=>({...e,meta:referenceReviewMetadata(e,text)}));return{...frame,origin:'local',available:true,current:true,archiveRevisions,entries,total:frame.entries.length,nextOffset:input.offset+entries.length<frame.entries.length?input.offset+entries.length:null};
 });});
}
