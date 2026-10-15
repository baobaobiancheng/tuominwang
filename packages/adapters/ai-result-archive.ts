import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {id} from '../contracts/index.ts';
import {rows,sql,type DB} from './db.ts';
import {seal,unseal} from './storage.ts';

const sha=z.string().regex(/^[a-f0-9]{64}$/u);
const archiveMetadata=z.object({
 version:z.literal(1),taskJobId:z.string().regex(/^lbj_[a-f0-9]{32}$/u),roundId:z.string().regex(/^lbr_\d{4}$/u),slotId:z.string().regex(/^lbs_[a-f0-9]{32}$/u),
 sourceArtifactId:z.string().regex(/^lba_[a-f0-9]{32}$/u),sourceSha256:sha,
 resultObjectId:id,resultSha256:sha,format:z.enum(['docx','md']),resultKind:z.enum(['reviewed_document','derived_report']),fileName:z.string().min(1).max(80).regex(/^[^\x00-\x1f/\\]+$/u),
 actorId:id,validation:z.object({knownTokenCount:z.number().int().nonnegative(),unknownTokenCount:z.number().int().nonnegative(),newCandidateCount:z.number().int().nonnegative()}).strict(),humanReviewed:z.literal(false),
}).strict();
export type AiResultArchiveMetadata=z.infer<typeof archiveMetadata>;
export type AiResultArchiveScope={tenantId:string;projectId:string;ownerId:string;taskId:string};
type ArchiveRow={id:string;tenant_id:string;project_id:string;owner_id:string;task_id:string;round_id:string;payload:string;created_at:Date|string};
function invalid():never{throw Object.assign(new Error('AI_RESULT_ARCHIVE_INVALID'),{statusCode:409});}
function aad(row:Pick<ArchiveRow,'id'|'tenant_id'|'project_id'|'owner_id'|'task_id'|'round_id'>){return `ai-result-archive:v1:${row.tenant_id}:${row.project_id}:${row.owner_id}:${row.task_id}:${row.round_id}:${row.id}`;}
function decode(row:ArchiveRow){try{const value=archiveMetadata.parse(JSON.parse(unseal(row.payload,aad(row))));if(value.taskJobId.replace(/^lbj_/u,'')!==row.task_id.replaceAll('-','')||value.roundId!==row.round_id||value.actorId!==row.owner_id)invalid();return value;}catch(error){if((error as Error).message==='DATA_KEY_REQUIRED')throw error;invalid();}}
function publicReceipt(row:ArchiveRow,metadata:AiResultArchiveMetadata){return{archiveId:row.id,location:'private_cloud_project' as const,roundId:row.round_id,fileName:metadata.fileName,format:metadata.format,sha256:metadata.resultSha256,sourceArtifactId:metadata.sourceArtifactId,sourceSha256:metadata.sourceSha256,validation:metadata.validation,humanReviewed:false as const,createdAt:new Date(row.created_at).toISOString()};}
export async function readAiResultArchive(db:DB,scope:AiResultArchiveScope,roundId:string){const[row]=await rows(db,sql`SELECT * FROM ai_result_archives WHERE task_id=${scope.taskId} AND round_id=${roundId} AND tenant_id=${scope.tenantId} AND project_id=${scope.projectId} AND owner_id=${scope.ownerId}`);if(!row)return undefined;const metadata=decode(row as ArchiveRow);return{row:row as ArchiveRow,metadata,receipt:publicReceipt(row as ArchiveRow,metadata)};}
export async function listAiResultArchives(db:DB,scope:AiResultArchiveScope){const found=await rows(db,sql`SELECT * FROM ai_result_archives WHERE task_id=${scope.taskId} AND tenant_id=${scope.tenantId} AND project_id=${scope.projectId} AND owner_id=${scope.ownerId} ORDER BY created_at,round_id`);return found.map(row=>{const metadata=decode(row as ArchiveRow);return publicReceipt(row as ArchiveRow,metadata);});}
export async function writeAiResultArchive(db:DB,scope:AiResultArchiveScope,expected:AiResultArchiveMetadata){const metadata=archiveMetadata.parse(expected);if(metadata.actorId!==scope.ownerId||metadata.taskJobId.replace(/^lbj_/u,'')!==scope.taskId.replaceAll('-',''))invalid();
 const existing=await readAiResultArchive(db,scope,metadata.roundId);if(existing){if(JSON.stringify(existing.metadata)!==JSON.stringify(metadata))throw Object.assign(new Error('AI_RESULT_ARCHIVE_CONFLICT'),{statusCode:409});return existing.receipt;}
 const row={id:randomUUID(),tenant_id:scope.tenantId,project_id:scope.projectId,owner_id:scope.ownerId,task_id:scope.taskId,round_id:metadata.roundId};
 const[inserted]=await rows(db,sql`INSERT INTO ai_result_archives(id,tenant_id,project_id,owner_id,task_id,round_id,payload) VALUES(${row.id},${row.tenant_id},${row.project_id},${row.owner_id},${row.task_id},${row.round_id},${seal(JSON.stringify(metadata),aad(row))}) RETURNING *`);
 if(!inserted)invalid();return publicReceipt(inserted as ArchiveRow,metadata);
}
