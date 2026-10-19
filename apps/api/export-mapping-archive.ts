import type {FastifyInstance} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {id,type Mark} from '../../packages/contracts/index.ts';
import {rows,sql,type DB} from '../../packages/adapters/db.ts';
import {hash,readArtifact,seal,unseal,writeArtifact} from '../../packages/adapters/storage.ts';
import {singleDocumentDraftMappingData} from '../../packages/core/mapping-export.ts';
import {currentOrImportedDraft,originalDraftEntityKey} from '../../packages/core/original-pseudonym-draft.ts';
import {canonicalRuleEntityType} from '../../packages/core/presets.ts';
import {openEntityCorrections} from '../../packages/adapters/entity-corrections.ts';
import {semanticEntityValue} from '../../packages/core/entity-corrections.ts';
import {validateMappingMarks} from '../../packages/core/mappings.ts';
import {entityLabel} from '../../packages/core/entity-identity.ts';
import {mappingsForMarks} from './mappings.ts';
import {denied,projectScope} from './access.ts';

const aad=(tenant:string,project:string,id:string)=>`${tenant}:${project}:${id}:automatic-mapping-archive`;
type ArchivePayload={schemaVersion:1;jobId:string;documentId:string;revision:number;sourceHash:string;contentHash:string;reviewHash:string;redactedArtifactId:string;redactedArtifactHash:string;mappingObjectId:string;mappingHash:string;tableName:string;createdBy:string};
function decode(row:any):ArchivePayload {
 const payload=JSON.parse(unseal(row.payload,aad(row.tenant_id,row.project_id,row.id))) as ArchivePayload;
 if(payload.schemaVersion!==1||payload.jobId!==row.job_id||payload.documentId!==row.document_id||payload.revision!==row.revision||!payload.mappingObjectId||!payload.mappingHash)denied('MAPPING_ARCHIVE_INVALID',409);
 return payload;
}
// Invoked only in the job's successful publish transaction after export gates.
// The caller owns cleanup of this fresh object when its callback fails before COMMIT.
export async function publishExportMappingArchive(db:DB,job:any,d:any,snapshot:any,redacted:{id:string;hash:string},objectId:string){
 if(!job.mapping_name_ciphertext)return false; // pre-046 jobs are not backfilled.
 const marks=(d.marks as Mark[]).filter(m=>m.decision==='redact'&&m.replacement?.mode==='alias');
 if(!snapshot||snapshot.document_id!==d.id||snapshot.revision!==d.revision||snapshot.content_hash!==d.content_hash||hash(JSON.stringify(snapshot.marks))!==hash(JSON.stringify(d.marks)))throw new Error('SNAPSHOT_MISMATCH');
 const text=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);
 if(hash(text)!==d.content_hash)throw new Error('SOURCE_MISMATCH');
 const [project]=await rows(db,sql`SELECT portable_state FROM projects WHERE id=${d.project_id}`);
 const state=project?.portable_state?JSON.parse(unseal(project.portable_state,`${d.tenant_id}:${d.project_id}:portable-state`)):null;
 const draft=currentOrImportedDraft(state,d.id,hash(text),d.revision);
 const byKey=new Map(draft?.entries.map(entry=>[entry.key,entry])??[]),corrections=draft?openEntityCorrections(d):null;
 const local=(d.marks as Mark[]).flatMap((mark,index)=>{
  if(mark.decision!=='redact'||mark.replacement?.mode!=='custom'||!draft)return[];
  const value=semanticEntityValue({...d,entityCorrections:corrections},mark,text,index),key=originalDraftEntityKey(mark.rawEntityType??canonicalRuleEntityType(mark.kind),value),entry=byKey.get(key);
  if(!entry||entry.currentValue!==mark.replacement.value||(entry.action??'pseudonym')!=='pseudonym')return[];
  return[{token:entry.currentValue,original:text.slice(mark.start,mark.end),entityType:entityLabel(mark),documentId:d.id,start:mark.start,end:mark.end}];
 });
 if(!marks.length&&!local.length)return false;
 const mappings=await mappingsForMarks(db,d,marks,job.user_id);
 validateMappingMarks(text,marks,mappings);
 const occurrences=[...marks.map(m=>({token:(m.replacement as Extract<Mark['replacement'],{mode:'alias'}>).token,original:text.slice(m.start,m.end),entityType:entityLabel(m),documentId:d.id,start:m.start,end:m.end})),...local];
 const tableName=unseal(job.mapping_name_ciphertext,`${job.tenant_id}:${job.project_id}:${job.id}:mapping-name`);
 if(hash(tableName)!==job.mapping_name_hash)throw new Error('MAPPING_ARCHIVE_INVALID');
 const base=singleDocumentDraftMappingData(mappings,local,occurrences),data={...base,_meta:{...base._meta,tableName:tableName.slice(0,-4),scope:'single',sourceHash:d.source_hash,contentHash:d.content_hash,revision:d.revision,jobId:job.id}};
 const json=JSON.stringify(data),mappingHash=hash(json);
 await writeArtifact(objectId,json,d.id);
 const receiptId=randomUUID(),payload:ArchivePayload={schemaVersion:1,jobId:job.id,documentId:d.id,revision:d.revision,sourceHash:d.source_hash,contentHash:d.content_hash,reviewHash:hash(JSON.stringify(snapshot.marks)),redactedArtifactId:redacted.id,redactedArtifactHash:redacted.hash,mappingObjectId:objectId,mappingHash,tableName,createdBy:job.user_id};
 await rows(db,sql`INSERT INTO export_mapping_archives(id,tenant_id,project_id,document_id,job_id,revision,owner_id,payload) VALUES(${receiptId},${d.tenant_id},${d.project_id},${d.id},${job.id},${d.revision},${job.user_id},${seal(JSON.stringify(payload),aad(d.tenant_id,d.project_id,receiptId))})`);
 return true;
}
export function registerExportMappingArchives(app:FastifyInstance){
 app.get('/api/projects/:id/export-mapping-archives',async req=>{const project=id.parse((req.params as any).id);return projectScope(req,{project},['view_original','view_mapping','export'],async db=>{
  const records=await rows(db,sql`SELECT * FROM export_mapping_archives WHERE project_id=${project} ORDER BY created_at DESC,id DESC`);
  return records.map(row=>{const p=decode(row);return{id:row.id,jobId:p.jobId,documentId:p.documentId,revision:p.revision,tableName:p.tableName,hash:p.mappingHash,createdAt:row.created_at};});
 });});
 app.get('/api/projects/:id/export-mapping-archives/:archive/download',async(req,reply)=>{const {id:project,archive}=z.object({id,archive:id}).parse(req.params);return projectScope(req,{project},['view_original','view_mapping','export'],async db=>{
  const[row]=await rows(db,sql`SELECT * FROM export_mapping_archives WHERE id=${archive} AND project_id=${project}`);
  if(!row)denied('NOT_FOUND',404);const p=decode(row);
  const [job]=await rows(db,sql`SELECT id,status,document_id,revision FROM jobs WHERE id=${p.jobId}`);
  const [artifact]=await rows(db,sql`SELECT id,hash,document_id,revision,job_id FROM artifacts WHERE id=${p.redactedArtifactId}`);
  if(!job||job.status!=='succeeded'||job.document_id!==p.documentId||job.revision!==p.revision||!artifact||artifact.hash!==p.redactedArtifactHash||artifact.document_id!==p.documentId||artifact.revision!==p.revision||artifact.job_id!==p.jobId)denied('MAPPING_ARCHIVE_INVALID',409);
  const raw=await readArtifact(p.mappingObjectId);if(hash(raw)!==p.mappingHash)denied('MAPPING_ARCHIVE_INVALID',409);
  reply.header('Cache-Control','no-store').header('Content-Type','application/octet-stream').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(p.tableName)}`);
  return reply.send(Buffer.from(raw));
 });});
}
