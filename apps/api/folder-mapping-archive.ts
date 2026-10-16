import type {FastifyInstance,FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {id,type Mark} from '../../packages/contracts/index.ts';
import {rows,sql,type DB} from '../../packages/adapters/db.ts';
import {hash,seal,unseal} from '../../packages/adapters/storage.ts';
import {mappingExportData} from '../../packages/core/mapping-export.ts';
import {validateMappingMarks} from '../../packages/core/mappings.ts';
import {entityLabel} from '../../packages/core/entity-identity.ts';
import {mappingsForMarks} from './mappings.ts';
import {denied,projectScope} from './access.ts';

export type FrozenBinding={id:string;revision:number;sourceHash:string;contentHash:string;reviewHash:string};
export type PublishedBinding=FrozenBinding&{jobId:string;artifactId:string;artifactHash:string};
type Frozen={schemaVersion:1;sessionId:string;tableName:string;mappingHash:string;mappingJson:string;bindings:FrozenBinding[];createdBy:string};
type Publication={schemaVersion:1;sessionId:string;sessionPayloadHash:string;zipHash:string;bindings:PublishedBinding[]};
const aad=(tenant:string,project:string,archive:string)=>`${tenant}:${project}:${archive}:folder-mapping-archive`;
const publicationAad=(tenant:string,project:string,archive:string)=>`${tenant}:${project}:${archive}:folder-mapping-publication`;
function decode(row:any):Frozen {
 const p=JSON.parse(unseal(row.payload,aad(row.tenant_id,row.project_id,row.id))) as Frozen;
 if(p.schemaVersion!==1||p.sessionId!==row.session_id||p.createdBy!==row.owner_id||!p.mappingJson||hash(p.mappingJson)!==p.mappingHash||!Array.isArray(p.bindings)||!p.bindings.length)denied('MAPPING_ARCHIVE_INVALID',409);
 return p;
}
async function publication(db:DB,row:any){const[r]=await rows(db,sql`SELECT payload FROM folder_mapping_publications WHERE archive_id=${row.id}`);if(!r)return null;const p=JSON.parse(unseal(r.payload,publicationAad(row.tenant_id,row.project_id,row.id))) as Publication;if(p.schemaVersion!==1||p.sessionId!==row.session_id||!Array.isArray(p.bindings))denied('MAPPING_ARCHIVE_INVALID',409);return p;}

// The batch mapping is sealed before any export job is queued. SQL rollback
// removes it atomically; no plaintext mapping object is created on disk.
export async function freezeFolderMappingArchive(db:DB,req:FastifyRequest,project:string,sessionId:string,tableName:string,documents:any[]){
 const all=new Map<string,any>(),occurrences: {token:string;original:string;entityType:string;documentId:string;start:number;end:number}[]=[],bindings:FrozenBinding[]=[];
 for(const d of documents){
  const[s]=await rows(db,sql`SELECT * FROM review_snapshots WHERE document_id=${d.id} AND revision=${d.revision}`);
  if(d.state!=='review'||!s||s.content_hash!==d.content_hash||hash(JSON.stringify(s.marks))!==hash(JSON.stringify(d.marks)))denied('SNAPSHOT_MISMATCH',409);
  const text=unseal(d.content,`${d.tenant_id}:${project}:${d.id}`);
  if(hash(text)!==d.content_hash)denied('SOURCE_MISMATCH',409);
  const marks=(d.marks as Mark[]).filter(m=>m.decision==='redact'&&m.replacement?.mode==='alias');
  const mappings=await mappingsForMarks(db,d,marks,req.user.id);
  validateMappingMarks(text,marks,mappings);
  for(const m of mappings)all.set(m.id,m);
  for(const m of marks)occurrences.push({token:(m.replacement as Extract<Mark['replacement'],{mode:'alias'}>).token,original:text.slice(m.start,m.end),entityType:entityLabel(m),documentId:d.id,start:m.start,end:m.end});
  bindings.push({id:d.id,revision:d.revision,sourceHash:d.source_hash,contentHash:d.content_hash,reviewHash:hash(JSON.stringify(s.marks))});
 }
 if(!all.size)return null;
 const base=mappingExportData([...all.values()],occurrences),data={...base,_meta:{...base._meta,tableName:tableName.slice(0,-4),scope:'project',sessionId,sourceFiles:documents.map(d=>unseal(d.source_name,`${d.tenant_id}:${project}:${d.id}:name`)),sourceDocumentIds:documents.map(d=>d.id)}};
 const mappingJson=JSON.stringify(data),archiveId=randomUUID();
 const payload:Frozen={schemaVersion:1,sessionId,tableName,mappingHash:hash(mappingJson),mappingJson,bindings,createdBy:req.user.id};
 await rows(db,sql`INSERT INTO folder_mapping_archives(id,tenant_id,project_id,session_id,owner_id,payload) VALUES(${archiveId},${req.user.tenant_id},${project},${sessionId},${req.user.id},${seal(JSON.stringify(payload),aad(req.user.tenant_id,project,archiveId))})`);
 for(const d of documents)await rows(db,sql`INSERT INTO folder_mapping_archive_documents(archive_id,document_id) VALUES(${archiveId},${d.id})`);
 return archiveId;
}

// Completion is a second immutable row; the pre-export vault never changes.
export async function publishFolderMappingArchive(db:DB,req:FastifyRequest,project:string,sessionId:string,sessionPayloadHash:string,zipHash:string,bindings:PublishedBinding[]){
 const[row]=await rows(db,sql`SELECT * FROM folder_mapping_archives WHERE session_id=${sessionId} AND project_id=${project}`);
 if(!row)return null;
 const frozen=decode(row),selected=new Map(frozen.bindings.map(b=>[b.id,b]));
 for(const b of bindings){const prior=selected.get(b.id);if(!prior||JSON.stringify(prior)!==JSON.stringify({id:b.id,revision:b.revision,sourceHash:b.sourceHash,contentHash:b.contentHash,reviewHash:b.reviewHash}))denied('MAPPING_ARCHIVE_INVALID',409);}
 const payload:Publication={schemaVersion:1,sessionId,sessionPayloadHash,zipHash,bindings};
 await rows(db,sql`INSERT INTO folder_mapping_publications(archive_id,payload) VALUES(${row.id},${seal(JSON.stringify(payload),publicationAad(req.user.tenant_id,project,row.id))})`);
 return row.id as string;
}

export function registerFolderMappingArchives(app:FastifyInstance){
 app.get('/api/projects/:id/folder-mapping-archives',async req=>{const project=id.parse((req.params as any).id);return projectScope(req,{project},['view_original','view_mapping','export'],async db=>{
  const records=await rows(db,sql`SELECT * FROM folder_mapping_archives WHERE project_id=${project} ORDER BY created_at DESC,id DESC`);
  return Promise.all(records.map(async row=>{const p=decode(row),published=await publication(db,row);return{id:row.id,sessionId:p.sessionId,tableName:p.tableName,hash:p.mappingHash,documents:p.bindings.length,state:published?'completed':'prepared',createdAt:row.created_at};}));
 });});
 app.get('/api/projects/:id/folder-mapping-archives/:archive/download',async(req,reply)=>{const{id:project,archive}=z.object({id,archive:id}).parse(req.params);return projectScope(req,{project},['view_original','view_mapping','export'],async db=>{
  const[row]=await rows(db,sql`SELECT * FROM folder_mapping_archives WHERE id=${archive} AND project_id=${project}`);
  if(!row)denied('NOT_FOUND',404);const p=decode(row),[s]=await rows(db,sql`SELECT * FROM folder_mapping_session_witness(${p.sessionId}::uuid,${row.id}::uuid)`);
  if(!s||s.owner_id!==p.createdBy)denied('MAPPING_ARCHIVE_INVALID',409);
  const linked=await rows(db,sql`SELECT document_id FROM folder_mapping_archive_documents WHERE archive_id=${row.id}`),ids=new Set(linked.map(r=>r.document_id));
  if(ids.size!==p.bindings.length||p.bindings.some(b=>!ids.has(b.id)))denied('MAPPING_ARCHIVE_INVALID',409);
  for(const b of p.bindings){const[d]=await rows(db,sql`SELECT id,source_hash FROM documents WHERE id=${b.id} AND project_id=${project}`);if(!d||d.source_hash!==b.sourceHash)denied('MAPPING_ARCHIVE_INVALID',409);}
  const published=await publication(db,row);if(published){
   if(s.state!=='completed'||s.payload_hash!==published.sessionPayloadHash||s.zip_hash!==published.zipHash)denied('MAPPING_ARCHIVE_INVALID',409);
   for(const b of published.bindings){const frozen=p.bindings.find(v=>v.id===b.id);if(!frozen||JSON.stringify(frozen)!==JSON.stringify({id:b.id,revision:b.revision,sourceHash:b.sourceHash,contentHash:b.contentHash,reviewHash:b.reviewHash}))denied('MAPPING_ARCHIVE_INVALID',409);const[a]=await rows(db,sql`SELECT id,hash,document_id,revision,job_id FROM artifacts WHERE id=${b.artifactId}`);const[j]=await rows(db,sql`SELECT id,status,document_id,revision FROM jobs WHERE id=${b.jobId}`);if(!a||a.hash!==b.artifactHash||a.document_id!==b.id||a.revision!==b.revision||a.job_id!==b.jobId||!j||j.status!=='succeeded'||j.document_id!==b.id||j.revision!==b.revision)denied('MAPPING_ARCHIVE_INVALID',409);}
  }
  reply.header('Cache-Control','no-store').header('Content-Type','application/octet-stream').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(p.tableName)}`);
  return reply.send(Buffer.from(p.mappingJson));
 });});
}
