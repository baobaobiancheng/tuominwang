import {getProjectMappingRows} from '../../packages/adapters/alias-groups.ts';
import {isBinaryFormat,isWordFormat,isLegacyWordFormat} from '../../packages/core/document-format.ts';
import {verifiedDocumentSource} from '../../packages/adapters/document-source.ts';
import {normalizeLegacyBytes} from '../../packages/adapters/document-normalization.ts';
import {entityLabel} from "../../packages/core/entity-identity.ts";
import type {FastifyInstance,FastifyRequest} from 'fastify';
import {randomUUID,randomBytes} from 'node:crypto';
import {z} from 'zod';
import pg from 'pg';
import {id} from '../../packages/contracts/index.ts';
import {scoped,rows,sql,type DB} from '../../packages/adapters/db.ts';
import {hash,seal,unseal,readOriginal,readArtifact,writeOriginal} from '../../packages/adapters/storage.ts';
import {projectScope,requirePermission,denied} from './access.ts';
import {aiDiagnosticZip,cleanAiDiagnosticEvent,safeAiDiagnosticCode,aiDiagnosticToolOutcome} from '../../packages/core/ai-diagnostics.ts';
import {MCP_PROTOCOL,negotiateMcpProtocol,taskStates,mcpDispatch,externalTask,recognitionNotice,reviewDeliveryProjection,cloudDocumentIds,newOpaqueId,taskUUID,gatewayMethods,collaborationMethods,connectorMethods, type CollabTask,type Caller,type ProtocolSession,type Authorization,type Delivery} from '../../packages/core/mcp-tools.ts';
import {parseOffice} from '../../packages/core/office.ts';
import {parseRestorationMapping,restoreDocx,restoreMarkdown,inspectRestorationTokens,emittedRestorationTokens,type RestorationPlan} from '../../packages/core/restoration-files.ts';
import {getPreset,getProfileCatalogue,getProjectPresetPolicy} from './presets.ts';
import {defaultProfile,profileForFormat} from '../../packages/core/presets.ts';
import type {Profile} from '../../packages/contracts/presets.ts';
import {detectComplete} from '../../packages/core/recognition-pipeline.ts';
import {queueExport,queueRecognition} from './job-queue.ts';
import {resolveAutomaticReview} from './automatic-review.ts';
import {preflightUnifiedAliasExport} from './unified-alias-export.ts';
import {readAiResultArchive,listAiResultArchives,writeAiResultArchive,type AiResultArchiveMetadata,type AiResultArchiveScope} from '../../packages/adapters/ai-result-archive.ts';
import {resolveReceivableJob} from '../../packages/core/reference/batch-delivery.js';

export type CollabConfigurationHook=(db:DB,req:FastifyRequest,documentId:string,settings:Record<string,any>)=>Promise<{revision:number}>;
type ReviewResolution={documentId:string;fromRevision:number;toRevision:number;snapshotRevision:number;sourceHash:string;policyVersion:string;decisionOrigin:'automatic'|'human_review'};
type PrivateTask=CollabTask&{transportReceipts?:{completedDelivery?:{requestId:string;requestHash:string};slotReplacement?:{requestId:string;requestHash:string;previousSlotId:string;currentSlotId:string}};recognitionJobIds?:string[];resolvedOutputs?:Record<string,string[]>;mapping?:RestorationPlan;combined?:{id:string;hash:string};pendingResume?:Caller;resumeState?:PrivateTask['state'];pendingInitialDetection?:boolean;pendingAttachedSourceIds?:string[];allowedTokens?:string[];mappingReferences?:Array<{id:string;token:string;version?:number}>;reviewResolutions?:ReviewResolution[];parentJobId?:string;childJobIds?:string[];resumeSourceJobId?:string;resumedJobId?:string};
function fail(message:string,statusCode=409):never{return denied(message,statusCode);}
const rev=z.number().int().positive();
const authorization=z.object({allowRedactionPath:z.boolean(),allowRestorePath:z.boolean(),allowSanitizedDelivery:z.boolean(),autoEnterReview:z.boolean(),createExchangeFolder:z.boolean(),autoRestoreAfterValidation:z.boolean(),allowSanitizedOutputOverride:z.boolean().optional(),allowRestoredOutputOverride:z.boolean().optional()}).strict();
const safeName=z.string().min(1).max(80).regex(/^[^\x00-\x1f/\\]+$/u),job=z.string().regex(/^lbj_[a-f0-9]{32}$/),round=z.string().regex(/^lbr_\d{4}$/),slot=z.string().regex(/^lbs_[a-f0-9]{32}$/),sha=z.string().regex(/^[a-f0-9]{64}$/);
const bytesSchema=z.string().min(1).max(Math.ceil(20*1024*1024*4/3)+4);
const terminal=new Set(['cancelled_by_user','failed','completed']);
const UNCHANGED=Symbol('UNCHANGED');
const resumableStates=new Set<string>(taskStates.filter(s=>s!=='client_disconnected'&&!terminal.has(s)));
function validResumeState(value:unknown){return typeof value==='string'&&resumableStates.has(value);}
// Public 0.5.9 canResumeDeliveredJob stable phases. Keep cloud explicit-ID
// and initial takeover semantics; implicit resume first prefers a delivered task.
const deliveredResumeStates=new Set<string>(['sanitized_artifact_ready','analyzing_by_ai','ai_result_rejected','round_completed','restore_failed','waiting_for_restore_approval']);
function implicitResumeTask(tasks:PrivateTask[]){
 return tasks.find(t=>!terminal.has(t.state)&&(t.deliveries.length>0||!!t.combined)&&deliveredResumeStates.has((t.pendingResume||t.state==='client_disconnected'?t.resumeState:t.state)??''))
  ?? tasks.find(t=>!terminal.has(t.state));
}
function canResumeBatchDelivery(t:PrivateTask){const phase=t.state==='client_disconnected'?t.resumeState:t.state;return !!t.childJobIds?.length&&(deliveredResumeStates.has(phase??'')||phase==='completed'&&t.options.task_mode==='ai_process');}
function aad(req:FastifyRequest,target:string){return `${req.user.tenant_id}:${req.user.id}:ai-collab:${target}`;}
function decode(value:string){const b=Buffer.from(bytesSchema.parse(value),'base64');if(b.length>20*1024*1024||b.toString('base64')!==value)fail('RESULT_BYTES_INVALID',400);return b;}
const storedCaller=z.object({sessionId:z.string(),adapterId:z.string(),displayName:z.string()}).passthrough();
const storedAdvanced=z.object({pseudonymRules:z.array(z.object({entityType:z.string(),action:z.enum(['pseudonym','mask']).optional(),prefix:z.string().optional()}).passthrough()).optional(),entityTypes:z.array(z.string()).optional(),exportMode:z.string().optional()}).passthrough();
const storedFileSetting=z.object({advanced:storedAdvanced.optional(),output_formats:z.array(z.string()).optional(),masking_mode:z.string().optional(),source_path:z.string().optional()}).passthrough();
const storedTaskShape=z.object({
 jobId:job,revision:rev,projectId:id,state:z.enum(taskStates),executionMode:z.enum(['automatic','human_review']).optional(),caller:storedCaller,previousCaller:storedCaller.optional(),pendingResume:storedCaller.optional(),resumeState:z.enum(taskStates).optional(),
 options:z.object({file_settings:z.array(storedFileSetting).optional(),output_formats:z.array(z.string()).optional(),advanced:storedAdvanced.optional(),task_mode:z.enum(['redact_only','ai_process','ai_process_restore']).optional(),standaloneRestoration:z.boolean().optional(),manualReview:z.boolean().optional(),output_formats_explicit:z.boolean().optional(),use_profile_mode_default:z.boolean().optional(),unified_pseudonyms:z.boolean().optional()}).passthrough(),
 sources:z.array(z.object({documentId:id,hash:sha,revision:z.number().int().nonnegative()}).passthrough()),
 deliveries:z.array(z.object({documentId:id,artifactId:id,format:z.string(),role:z.enum(['primary','markdown','pdf-docx','word-docx']),revision:z.number().int().nonnegative(),hash:sha}).passthrough()),
 rounds:z.array(z.object({roundId:round,slotId:slot,format:z.enum(['docx','md']),resultKind:z.enum(['reviewed_document','derived_report']),artifactId:z.string(),objectId:id.optional(),sha256:sha.optional(),validated:z.boolean().optional(),reviewed:z.boolean().optional(),restoredArtifactId:id.optional()}).passthrough()),
 transportReceipts:z.object({completedDelivery:z.object({requestId:id,requestHash:sha}).strict().optional(),slotReplacement:z.object({requestId:id,requestHash:sha,previousSlotId:slot,currentSlotId:slot}).strict().optional()}).strict().optional(),
 combined:z.object({id:id,hash:sha}).passthrough().optional(),recognitionJobIds:z.array(id).optional(),exportJobIds:z.array(id).optional(),parentJobId:job.optional(),childJobIds:z.array(job).min(1).max(100).optional(),resumeSourceJobId:job.optional(),resumedJobId:job.optional(),resolvedOutputs:z.record(z.string(),z.array(z.string())).optional(),mappingReferences:z.array(z.object({id,token:z.string(),version:z.number().int().positive().optional()}).passthrough()).optional(),allowedTokens:z.array(z.string()).optional(),pendingInitialDetection:z.boolean().optional(),pendingAttachedSourceIds:z.array(id).optional(),reviewResolutions:z.array(z.object({documentId:id,fromRevision:z.number().int().nonnegative(),toRevision:z.number().int().nonnegative(),snapshotRevision:z.number().int().nonnegative(),sourceHash:sha,policyVersion:z.string().min(1),decisionOrigin:z.enum(['automatic','human_review'])}).passthrough()).optional(),
 mapping:z.record(z.string(),z.unknown()).optional(),authorization:authorization.passthrough().optional(),intent:z.record(z.string(),z.unknown()).optional(),statistics:z.record(z.string(),z.number()).optional(),eventLog:z.array(z.object({at:z.string(),event:z.string(),code:z.string().optional()}).passthrough()).optional(),
 createdAt:z.string(),updatedAt:z.string(),failureCode:z.string().optional(),openRequested:z.boolean().optional(),
}).passthrough();
function privateRead(row:any,req:FastifyRequest):PrivateTask{
 let plaintext:string;try{plaintext=unseal(row.payload,aad(req,row.id));}catch(error){if((error as Error).message==='DATA_KEY_REQUIRED')throw error;fail('TASK_STORAGE_INVALID',409);}
 try{const t=storedTaskShape.parse(JSON.parse(plaintext));if(t.revision!==row.revision||taskUUID(t.jobId)!==row.id||t.projectId!==row.project_id)fail('TASK_STORAGE_INVALID',409);return t as PrivateTask;}catch{fail('TASK_STORAGE_INVALID',409);}
}
function unreadable(error:unknown){if((error as Error).message==='DATA_KEY_REQUIRED')throw error;return true;}
async function verifiedBatchParent(db:DB,req:FastifyRequest,child:PrivateTask){
 if(!child.parentJobId)return undefined;
 const [row]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${taskUUID(child.parentJobId)}`);
 if(!row||row.owner_id!==req.user.id||row.tenant_id!==req.user.tenant_id||row.project_id!==child.projectId)fail('BATCH_CHILD_BINDING_INVALID',409);
 const[isolated]=await rows(db,sql`SELECT q.receipt_id FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${row.id} AND r.receipt_id IS NULL`);
 if(isolated)fail('TASK_QUARANTINED',409);
 const parent=privateRead(row,req),index=parent.childJobIds?.indexOf(child.jobId)??-1;
 if(index<0||child.sources.length!==1||parent.sources[index]?.documentId!==child.sources[0]!.documentId||parent.sources[index]?.hash!==child.sources[0]!.hash||parent.executionMode!==child.executionMode)fail('BATCH_CHILD_BINDING_INVALID',409);
 return parent;
}
function checkCaller(t:PrivateTask,c?:Caller){if(c&&(t.caller.sessionId!==c.sessionId||t.caller.adapterId!==c.adapterId||t.pendingResume))fail('SESSION_AUTHORIZATION_REQUIRED',403);}
function note(t:PrivateTask,event:string,code?:string){t.updatedAt=new Date().toISOString();t.eventLog=[...(t.eventLog??[]),{at:t.updatedAt,event,...code?{code}:{}}];}
// The ordinary retry route may replace a failed MCP detect job only while its
// original, authorized task still owns that exact source. Project locking is
// acquired by the route before this task lock, matching change().
export async function withOwnedJobRetry<T extends {id:string;sourceHash:string}>(
 db:DB,req:FastifyRequest,target:{id:string;collab_task_id:string|null;kind:string;revision:number;document_id:string;project_id:string;tenant_id:string},create:()=>Promise<T>
):Promise<T>{
 if(!target.collab_task_id)return create();
 if(target.kind!=='detect'&&target.kind!=='export')fail('JOB_NOT_RETRYABLE',409);
 const[locator]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${target.collab_task_id}`);
 if(!locator)fail('JOB_NOT_RETRYABLE',409);
 const located=privateRead(locator,req);
 let parent:PrivateTask|undefined;
 if(located.parentJobId){
  const[parentRow]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${taskUUID(located.parentJobId)} FOR UPDATE`);
  if(!parentRow||parentRow.owner_id!==req.user.id||parentRow.tenant_id!==req.user.tenant_id||parentRow.project_id!==target.project_id)fail('JOB_NOT_RETRYABLE',409);
  const[parentQuarantine]=await rows(db,sql`SELECT q.receipt_id FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${parentRow.id} AND r.receipt_id IS NULL`);
  if(parentQuarantine)fail('TASK_QUARANTINED',409);
  parent=privateRead(parentRow,req);
  const index=parent.childJobIds?.indexOf(located.jobId)??-1;
  if(index<0||!['waiting_for_human_review','building_sanitized_artifact'].includes(parent.state)||parent.pendingResume||parent.caller.sessionId!==located.caller.sessionId||parent.caller.adapterId!==located.caller.adapterId||parent.sources[index]?.documentId!==located.sources[0]?.documentId||parent.sources[index]?.hash!==located.sources[0]?.hash)fail('JOB_NOT_RETRYABLE',409);
 }
 const[row]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${target.collab_task_id} FOR UPDATE`);
 if(!row||row.owner_id!==req.user.id||row.tenant_id!==req.user.tenant_id||row.project_id!==target.project_id||row.tenant_id!==target.tenant_id)fail('JOB_NOT_RETRYABLE',409);
 const[quarantined]=await rows(db,sql`SELECT q.receipt_id FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${row.id} AND r.receipt_id IS NULL`);
 if(quarantined)fail('TASK_QUARANTINED',409);
 const task=privateRead(row,req),linkedJobs=target.kind==='detect'?task.recognitionJobIds:task.exportJobIds;
 if(parent&&(task.parentJobId!==parent.jobId||task.revision!==located.revision||task.state==='cancelled_by_user'||task.state==='client_disconnected'))fail('JOB_NOT_RETRYABLE',409);
 const index=linkedJobs?.indexOf(target.id)??-1;
 const source=index>=0?task.sources[index]:undefined;
 const expectedState=target.kind==='detect'?'waiting_for_human_review':'building_sanitized_artifact';
 const authorized=target.kind==='detect'?task.authorization?.allowRedactionPath:task.authorization?.allowSanitizedDelivery;
 const recoverableFailure=task.state==='failed'&&task.failureCode===(target.kind==='detect'?'RECOGNITION_INCOMPLETE':'SANITIZED_EXPORT_INCOMPLETE');
 if(task.projectId!==target.project_id||task.state!==expectedState&&!recoverableFailure||task.pendingResume||!authorized||
    !source||source.documentId!==target.document_id||source.revision!==target.revision)
   fail('JOB_NOT_RETRYABLE',409);
 const result=await create();
 if(result.sourceHash!==source.hash)fail('SOURCE_MISMATCH',409);
 linkedJobs![index]=result.id;if(recoverableFailure){task.state=expectedState;delete task.failureCode;}task.revision++;note(task,target.kind==='detect'?'owned_detection_retried':'owned_export_retried');
 const payload=seal(JSON.stringify(task),aad(req,row.id));
 const updated=await rows(db,sql`UPDATE ai_collab_tasks SET revision=${task.revision},updated_at=now(),payload=${payload} WHERE id=${row.id} AND revision=${row.revision} RETURNING id`);
 if(updated.length!==1)fail('VERSION_CONFLICT',409);
 await rows(db,sql`INSERT INTO ai_collab_task_snapshot(task_id,tenant_id,project_id,owner_id,revision,payload_ciphertext,payload_sha256) VALUES(${row.id},${row.tenant_id},${row.project_id},${row.owner_id},${task.revision},${payload},${hash(payload)})`);
 return result;
}
function state(t:PrivateTask,states:string[]){if(!states.includes(t.state))fail('INVALID_STATE',409);}
function canonical(value:any):string{return JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value??null);}
function normalizeToken(s:string){return s.replace(/[\s\u200b-\u200d\ufeff]/gu,'');}
function config(t:PrivateTask,documentId:string){
 const o=t.options,per=(o.file_settings??[]).find((p:any)=>p.source_path===`document:${documentId}`)??{},local=per.advanced??{},a={...(o.advanced??{}),...local},mask=per.masking_mode??o.masking_mode??'pseudonym';
 // Public optionsForSource clears inherited export mode and rules when a file selects its own mask.
 if(per.masking_mode!==undefined&&local.exportMode===undefined){delete a.exportMode;if(local.pseudonymRules===undefined)delete a.pseudonymRules;}
 if(local.pseudonymRules!==undefined&&local.exportMode===undefined)delete a.exportMode;
 return {documentType:per.document_type??o.document_type??'auto',profileId:a.profile,rulesetId:per.rule_set??o.rule_set,exportMode:a.exportMode??((o.use_profile_mode_default===true&&per.masking_mode===undefined&&!a.pseudonymRules?.length)?undefined:(a.pseudonymRules?.some((r:any)=>r.action==='mask')?'selective_pseudonym':a.pseudonymRules?.length?'custom_pseudonym':mask==='full_star'?'full_star':mask==='default_mask'||mask==='purple_overlay'?'default_star':'default_pseudonym')),entityTypes:a.entityTypes,pseudonymRules:a.pseudonymRules?Object.fromEntries(a.pseudonymRules.map((r:any)=>[r.entityType,r.action??'pseudonym'])):undefined,pseudonymPrefixes:a.pseudonymRules?Object.fromEntries(a.pseudonymRules.filter((r:any)=>r.prefix).map((r:any)=>[r.entityType,r.prefix])):undefined,maskStyle:a.maskStyle??(mask==='purple_overlay'?'purple':undefined),removeImages:a.removeImages,removeHeaderFooter:a.removeHeaderFooter,commentHandlingMode:a.commentHandlingMode,outputFormats:per.output_formats??o.output_formats??['original','md'],unifiedPseudonyms:o.unified_pseudonyms??true,batchResultMode:o.batch_result_mode??'individual'};
}
function assertRestorable(t:PrivateTask,c:ReturnType<typeof config>,profile:Profile,format:string){
 if(t.options.task_mode!=='ai_process_restore')return;
 const mode=c.exportMode??profileForFormat(profile,format,true).defaultMode;
 if(c.pseudonymRules&&Object.values(c.pseudonymRules).some(action=>action!=='pseudonym'))fail('PARTIALLY_IRREVERSIBLE_MASK',400);
 // Family switches and force-detect rules can surface a type absent from the
 // enabled list. A selective profile containing any non-alias action cannot
 // promise complete restoration across all authorized source marks.
 if(mode==='selective_pseudonym'&&!c.pseudonymRules&&Object.values(profile.pseudonymTypeActions).some(action=>action!=='pseudonym'))fail('PARTIALLY_IRREVERSIBLE_MASK',400);
 if(!['default_pseudonym','custom_pseudonym','selective_pseudonym'].includes(mode))fail('IRREVERSIBLE_MASK',400);
}
function assertExplicitRestoreMode(input:Record<string,any>){
 if(input.task_mode!=='ai_process_restore')return;
 const rules=input.advanced?.pseudonymRules??[];
 if(rules.some((r:any)=>r.action==='mask'))fail('PARTIALLY_IRREVERSIBLE_MASK',400);
 const mode=input.advanced?.exportMode??(rules.length?'custom_pseudonym':input.use_profile_mode_default?undefined:input.masking_mode);
 if(mode!==undefined&&!['pseudonym','default_pseudonym','custom_pseudonym','selective_pseudonym'].includes(mode))fail('IRREVERSIBLE_MASK',400);
}
function assertReviewedMarksRestorable(t:PrivateTask,marks:unknown){
 if(t.options.task_mode!=='ai_process_restore')return;
 if(!Array.isArray(marks)||marks.some(m=>!m||typeof m!=='object'))fail('REVIEW_MARKS_INVALID',409);
 if(marks.some(m=>m.decision==='redact'&&m.replacement?.mode!=='alias'))fail('PARTIALLY_IRREVERSIBLE_MASK',409);
}
function snapshotMapping(records:any[],projectId:string){const details=records.map(m=>{const original=JSON.parse(unseal(m.payload,`${m.tenant_id}:${projectId}:${m.id}:mapping:${m.version}`));return{pseudonym:m.token,normalized:original.value,entityType:original.kind==='邮箱'?'email':original.kind==='网址'?'website_url':entityLabel(original),forms:(original.forms??[]).map((value:string)=>({original:value}))};});return parseRestorationMapping({_meta:{version:'tuominwang-1'},details});}
async function artifactBytes(a:Delivery){return isBinaryFormat(a.format)?readOriginal(a.artifactId):Buffer.from(await readArtifact(a.artifactId),'utf8');}
const visualFormats=new Set(['pdf','png','jpg','jpeg']);
function visualDelivery(a:Delivery){return visualFormats.has(a.format);}
function markdownDelivery(a:Delivery){return a.role==='markdown'||['md','txt'].includes(a.format);}
function deliveredArtifactId(a:Delivery){return `lba_${a.artifactId.replaceAll('-','')}`;}
async function checkedConfiguration(db:DB,req:FastifyRequest,t:PrivateTask,documentId:string){
 const c=config(t,documentId),[d]=await rows(db,sql`SELECT source_format FROM documents WHERE id=${documentId} AND project_id=${t.projectId}`);if(!d)fail('SOURCE_NOT_FOUND',404);
 if(t.executionMode==='automatic'){
  if(c.removeHeaderFooter===false||c.commentHandlingMode!==undefined&&c.commentHandlingMode!=='remove')fail('MANUAL_REVIEW_REQUIRED',409);
  c.removeHeaderFooter=true;c.commentHandlingMode='remove';
 }
 async function resolve(kind:'profile'|'ruleset',value:unknown){if(value===undefined)return undefined;if(typeof value!=='string')fail('SAVED_SETTING_INVALID',400);if(kind==='profile'&&['system_default','系统默认'].includes(value))return 'system_default';
  if(kind==='profile'){
   // A selected ID must be validated directly; a damaged peer must not block it.
   if(id.safeParse(value).success){
    const [stored]=await rows(db,sql`SELECT id FROM redaction_presets WHERE id=${value} AND kind='profile'`);
    if(stored){await getPreset<Profile>(db,req,'profile',value);return value;}
   }
   // The catalogue verifies the encrypted preference before isolating individual bad rows.
   const {items}=await getProfileCatalogue(db,req),matches=items.filter(item=>item.settings.name===value);
   if(matches.length!==1)fail('SAVED_SETTING_NOT_FOUND',404);
   return matches[0]!.settings.id;
  }
  const records=await rows(db,sql`SELECT * FROM redaction_presets WHERE kind=${kind}`),matches=records.filter(r=>r.id===value||JSON.parse(unseal(r.payload,`${req.user.tenant_id}:${req.user.id}:preset:${r.id}`)).name===value);if(matches.length!==1)fail('SAVED_SETTING_NOT_FOUND',404);return matches[0].id;
 }
 c.profileId=await resolve('profile',c.profileId);c.rulesetId=await resolve('ruleset',c.rulesetId);
 const [project]=await rows(db,sql`SELECT * FROM projects WHERE id=${t.projectId}`);if(!project)fail('NOT_FOUND',404);
 const profile:Profile=c.profileId?(await getPreset<Profile>(db,req,'profile',c.profileId)).settings:getProjectPresetPolicy(project).profile?.settings??defaultProfile();
 assertRestorable(t,c,profile,d.source_format);
 const per=(t.options.file_settings??[]).find((p:any)=>p.source_path===`document:${documentId}`);
 if(d.source_format==='pdf'&&t.options.output_formats_explicit!==true&&per?.output_formats===undefined&&profile.pdf.exportPdfAsDocx)c.outputFormats=[...c.outputFormats,'docx'];
 c.outputFormats=[...new Set(c.outputFormats.map((f:string)=>f==='original'?(['jpg','jpeg'].includes(d.source_format)?'png':isLegacyWordFormat(d.source_format)?'docx':d.source_format):f))];
 return Object.fromEntries(Object.entries(c).filter(([,v])=>v!==undefined));
}
export function registerMcpRoutes(app:FastifyInstance,applyConfiguration?:CollabConfigurationHook,nerReady=false,runInternal:<T>(run:()=>Promise<T>)=>Promise<T>=run=>run()){
 const sessions=new Map<string,ProtocolSession&{user:string;tenant:string}>();
 const headers=(req:FastifyRequest)=>({origin:process.env.APP_ORIGIN??'http://127.0.0.1:5178',cookie:req.headers.cookie??''});
 // Record only the tool request received by this server. A connector's local
 // stdio/transport failures cannot be inferred here. This table never changes
 // the task's AEAD payload or revision.
 async function recordTool(req:FastifyRequest,input:Parameters<typeof cleanAiDiagnosticEvent>[0]){
  const event=cleanAiDiagnosticEvent(input);if(!event)return;
  try{await scoped(req.user.id,req.user.tenant_id,async db=>{
   // Original aiDiagnostics coalesces unchanged successful/waiting polls for 30s.
   if(['waiting','succeeded'].includes(event.outcome)&&['check_document_delivery','check_restore_completion'].includes(event.tool??'')){
    const [recent]=await rows(db,sql`SELECT 1 FROM ai_collab_diagnostic_events
      WHERE task_id=${taskUUID(event.jobId)} AND owner_id=${req.user.id} AND tenant_id=${req.user.tenant_id}
        AND created_at>now()-interval '30 seconds' AND payload->>'tool'=${event.tool}
        AND payload->>'outcome'=${event.outcome} AND coalesce(payload->>'state','')=${event.state??''} LIMIT 1`);
    if(recent)return;
   }
   await rows(db,sql`
    INSERT INTO ai_collab_diagnostic_events(tenant_id,project_id,owner_id,task_id,payload)
    SELECT t.tenant_id,t.project_id,t.owner_id,t.id,${JSON.stringify(event)}::jsonb
    FROM ai_collab_tasks t WHERE t.id=${taskUUID(event.jobId)} AND t.tenant_id=${req.user.tenant_id} AND t.owner_id=${req.user.id}`);
  });}catch{/* Diagnostics never change a tool outcome. */}
 }
 async function observedTool<T>(req:FastifyRequest,tool:string,args:any,caller:Caller,invoke:()=>Promise<T>,method?:string):Promise<T>{
  const began=Date.now(),at=new Date(began).toISOString();let value:T|undefined,error:unknown,failed=false;
  const inputJobId=typeof args?.job_id==='string'&&/^lbj_[a-f0-9]{32}$/u.test(args.job_id)?args.job_id:undefined;
  const commonInput=inputJobId?{jobId:inputJobId,adapter:caller.adapterId,method,tool,stage:'tool'}:undefined;
  if(commonInput)await recordTool(req,{...commonInput,at,outcome:'started'});
  try{value=await invoke();}catch(caught){error=caught;failed=true;}
  const jobId=inputJobId??(typeof (value as any)?.jobId==='string'&&(value as any).jobId);
  if(jobId){
   const common={jobId,adapter:caller.adapterId,method,tool,stage:'tool'};
   if(!inputJobId&&!['check_document_delivery','check_restore_completion'].includes(tool))await recordTool(req,{...common,at,outcome:'started'});
   const state=(value as any)?.status??(value as any)?.state;
   const outcome=failed?'failed':aiDiagnosticToolOutcome(value);
   await recordTool(req,{...common,at:new Date().toISOString(),outcome,state,durationMs:Date.now()-began,...failed?{code:safeAiDiagnosticCode((error as any)?.message)}:{}});
  }
  if(failed)throw error;return value as T;
 }
 async function internal(req:FastifyRequest,method:any,url:string,payload?:any){const r=await runInternal(async()=>await app.inject({method,url,headers:headers(req),payload}));if(r.statusCode>=400)fail(r.json().error??'COLLAB_ACTION_FAILED',r.statusCode);return r;}
 function humanTask(t:PrivateTask){const {mapping,mappingReferences,resolvedOutputs,combined,transportReceipts,...shown}=t;return {...shown,...combined?{combined:{sha256:combined.hash}}:{}};}
 async function taskDetectionView(db:DB,req:FastifyRequest,t:PrivateTask):Promise<{taskDetectionStatus:'not_started'|'pending'|'succeeded'|'failed';awaitingTaskDetection:boolean;taskDetectionFailureCode?:string}>{
  const result=(status:'not_started'|'pending'|'succeeded'|'failed')=>({taskDetectionStatus:status,awaitingTaskDetection:status==='pending'||status==='failed',...status==='failed'?{taskDetectionFailureCode:'RECOGNITION_INCOMPLETE'}:{}});
  if(t.childJobIds){
   const children=await batchChildren(db,req,t);
      const statuses=await Promise.all(children.map(({task})=>taskDetectionView(db,req,task)));
   return result(statuses.every(view=>view.taskDetectionStatus==='succeeded')?'succeeded':statuses.some(view=>view.taskDetectionStatus==='failed')?'failed':'pending');
  }
  if(['cancelled_by_user','failed','client_disconnected'].includes(t.state))return result('not_started');
  if(['building_sanitized_artifact','waiting_for_task_selection','sanitized_artifact_ready','analyzing_by_ai','validating_ai_result','ai_result_rejected','waiting_for_restore_approval','restoring','restore_failed','round_completed','completed'].includes(t.state))return result('succeeded');
  if(!t.sources.length||!t.authorization?.allowRedactionPath||['waiting_for_session_authorization','waiting_for_user_file_selection'].includes(t.state))return result('not_started');
  if(t.pendingInitialDetection||t.recognitionJobIds?.length!==t.sources.length)return result('pending');
  const ids=t.recognitionJobIds;if(!ids?.length)return result('pending');
  const jobs=await rows(db,sql`SELECT id,document_id,status FROM jobs WHERE id IN (${sql.join(ids.map(value=>sql`${value}`),sql`,`)}) AND kind='detect' AND collab_task_id=${taskUUID(t.jobId)}`);
  if(jobs.length!==ids.length||t.sources.some((source,index)=>!jobs.some(j=>j.id===ids[index]&&j.document_id===source.documentId)))return result('pending');
  if(jobs.some(j=>j.status==='failed'||j.status==='cancelled'))return result('failed');
  return result(jobs.every(j=>j.status==='succeeded')?'succeeded':'pending');
 }
 async function taskDeliveryDocuments(req:FastifyRequest,t:PrivateTask){
  const ids=[...new Set([...(t.recognitionJobIds??[]),...(t.exportJobIds??[])].filter(Boolean))];
  if(!ids.length)return undefined;
  return scoped(req.user.id,req.user.tenant_id,async db=>{
   const jobs=await rows(db,sql`SELECT id,document_id,status FROM jobs WHERE id IN (${sql.join(ids.map(value=>sql`${value}`),sql`,`)})
    AND collab_task_id=${taskUUID(t.jobId)} AND tenant_id=${req.user.tenant_id} AND project_id=${t.projectId} AND user_id=${req.user.id}`);
   return t.sources.map((source,index)=>{
    const detect=jobs.find(j=>j.id===t.recognitionJobIds?.[index]&&j.document_id===source.documentId);
    const exported=jobs.find(j=>j.id===t.exportJobIds?.[index]&&j.document_id===source.documentId);
    const delivery=t.deliveries.find(item=>item.documentId===source.documentId);
    const related=t.deliveries.filter(item=>item.documentId===source.documentId);
    const selected=related.find(item=>item.role==='primary'&&item.format==='docx')??related.find(markdownDelivery)??related.find(visualDelivery);
    return {status:delivery?'succeeded':[detect,exported].some(j=>j?.status==='failed')?'failed':[detect,exported].some(j=>j?.status==='cancelled')?'cancelled_by_user':'pending',
     visualFallback:!!selected&&visualDelivery(selected)&&!related.some(markdownDelivery)};
   });
  });
 }
 async function taskRecognitionNotice(req:FastifyRequest,t:PrivateTask){
  return scoped(req.user.id,req.user.tenant_id,async db=>{
   const tasks=t.childJobIds?(await batchChildren(db,req,t)).map(entry=>entry.task):[t];
   const linked=tasks.flatMap(task=>task.sources.map((source,index)=>({task,source,jobId:task.recognitionJobIds?.[index]})));
   const ids=linked.map(entry=>entry.jobId).filter((value):value is string=>!!value);
   if(!ids.length)return {};
   const found=await rows(db,sql`SELECT j.id,j.document_id,j.status,j.collab_task_id,s.marks,s.review_mode
    FROM jobs j LEFT JOIN review_snapshots s ON s.document_id=j.document_id AND s.revision=j.revision
     AND s.tenant_id=j.tenant_id AND s.project_id=j.project_id
    WHERE j.id IN (${sql.join(ids.map(value=>sql`${value}`),sql`,`)})
     AND j.tenant_id=${req.user.tenant_id} AND j.project_id=${t.projectId}
     AND j.user_id=${req.user.id} AND j.kind='detect'`);
   const frames:Array<Array<{signatureGroup?:{id:string};sources?:Array<{score?:number}>}>>=[];
   let failedDocumentCount=0,humanReviewed=true;
   for(const {task,source,jobId} of linked){
    if(!jobId)continue;
    const frame=found.find(row=>row.id===jobId&&row.document_id===source.documentId&&row.collab_task_id===taskUUID(task.jobId));
    if(!frame)return {};
    if(frame.status==='failed'||frame.status==='cancelled'){failedDocumentCount++;continue;}
    if(frame.status!=='succeeded')continue;
    if(frame.review_mode!=='legacy'||!Array.isArray(frame.marks))return {};
    frames.push(frame.marks);
    if(!task.reviewResolutions?.some(receipt=>receipt.documentId===source.documentId&&receipt.sourceHash===source.hash&&receipt.toRevision===source.revision&&receipt.decisionOrigin==='human_review'))humanReviewed=false;
   }
   if(!frames.length)return {};
   return recognitionNotice(frames,humanReviewed,t.executionMode??'human_review',t.state,t.sources.length,failedDocumentCount);
  });
 }
 async function saveSnapshot(db:DB,row:{id:string;tenant_id:string;project_id:string;owner_id:string},revision:number,payload:string){await rows(db,sql`INSERT INTO ai_collab_task_snapshot(task_id,tenant_id,project_id,owner_id,revision,payload_ciphertext,payload_sha256) VALUES(${row.id},${row.tenant_id},${row.project_id},${row.owner_id},${revision},${payload},${hash(payload)})`);}
 async function cancelOwnedJobs(db:DB,target:string){
  const canceled=await rows(db,sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE collab_task_id=${taskUUID(target)} AND status IN('queued','running') RETURNING id,document_id,revision,kind`);
  for(const j of canceled){await rows(db,sql`UPDATE attempts SET finished_at=now(),outcome='cancelled' WHERE job_id=${j.id} AND finished_at IS NULL`);if(j.kind==='detect')await rows(db,sql`UPDATE documents SET state='outdated',revision=revision+1 WHERE id=${j.document_id} AND revision=${j.revision} AND state='queued'`);}
 }
 async function load(req:FastifyRequest,target:string,c?:Caller){return scoped(req.user.id,req.user.tenant_id,async db=>{const [row]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${taskUUID(job.parse(target))}`);if(!row)fail('NOT_FOUND',404);const [project]=await rows(db,sql`SELECT id FROM projects WHERE id=${row.project_id} FOR SHARE`);if(!project)fail('NOT_FOUND',404);await requirePermission(db,row.project_id,['view_original']);const [isolated]=await rows(db,sql`SELECT q.receipt_id FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${row.id} AND r.receipt_id IS NULL`);if(isolated)fail('TASK_QUARANTINED',409);const t=privateRead(row,req);await verifiedBatchParent(db,req,t);checkCaller(t,c);return t;});}
 // Original owned() follows one approved resume request, checking both caller bindings.
 // Keep this resolution at the MCP boundary so human task history still addresses the request.
 async function toolJob(req:FastifyRequest,target:string,caller:Caller){
  const requested=await load(req,target,caller);
  if(!requested.resumeSourceJobId||!requested.resumedJobId)return requested.jobId;
  if(requested.resumedJobId!==requested.resumeSourceJobId)fail('RESUME_SOURCE_MISMATCH',409);
  const source=await load(req,requested.resumedJobId,caller);
  if(source.projectId!==requested.projectId)fail('RESUME_SOURCE_MISMATCH',409);
  return source.jobId;
 }
 async function change<T>(req:FastifyRequest,target:string,expected:number|undefined,c:Caller|undefined,action:(t:PrivateTask,db:DB)=>Promise<T>|T){return scoped(req.user.id,req.user.tenant_id,async db=>{
  const [locator]=await rows(db,sql`SELECT project_id FROM ai_collab_tasks WHERE id=${taskUUID(job.parse(target))}`);if(!locator)fail('NOT_FOUND',404);
  const [p]=await rows(db,sql`SELECT id FROM projects WHERE id=${locator.project_id} FOR UPDATE`);if(!p)fail('NOT_FOUND',404);await requirePermission(db,p.id,['view_original']);
  const [row]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${taskUUID(target)} FOR UPDATE`);if(!row)fail('NOT_FOUND',404);const [isolated]=await rows(db,sql`SELECT q.receipt_id FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${row.id} AND r.receipt_id IS NULL`);if(isolated)fail('TASK_QUARANTINED',409);const t=privateRead(row,req);if(expected!==undefined&&expected!==t.revision)fail('VERSION_CONFLICT',409);const parent=await verifiedBatchParent(db,req,t);if(parent&&(!parent.authorization||parent.state==='client_disconnected'||parent.state==='cancelled_by_user'&&t.state!=='restoring'))fail('BATCH_PARENT_UNAVAILABLE',409);checkCaller(t,c);const result=await action(t,db);if(result===UNCHANGED)return {result,task:t};t.revision++;note(t,'task_updated');const payload=seal(JSON.stringify(t),aad(req,row.id));await rows(db,sql`UPDATE ai_collab_tasks SET revision=${t.revision},updated_at=now(),payload=${payload} WHERE id=${row.id} AND revision=${row.revision}`);await saveSnapshot(db,row,t.revision,payload);return {result,task:t};
 });}
 async function batchChildren(db:DB,req:FastifyRequest,parent:PrivateTask,lock=false){
  if(!parent.childJobIds)return [];
  if(parent.parentJobId||parent.childJobIds.length!==parent.sources.length||new Set(parent.childJobIds).size!==parent.childJobIds.length)fail('BATCH_CHILD_BINDING_INVALID',409);
  const ordered=[...parent.childJobIds].sort(),byId=new Map<string,{row:any;task:PrivateTask}>();
  for(const childJobId of ordered){
   const [row]=await rows(db,lock?sql`SELECT * FROM ai_collab_tasks WHERE id=${taskUUID(childJobId)} FOR UPDATE`:sql`SELECT * FROM ai_collab_tasks WHERE id=${taskUUID(childJobId)}`);
   if(!row||row.project_id!==parent.projectId||row.owner_id!==req.user.id||row.tenant_id!==req.user.tenant_id)fail('BATCH_CHILD_BINDING_INVALID',409);
   const [isolated]=await rows(db,sql`SELECT q.receipt_id FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${row.id} AND r.receipt_id IS NULL`);if(isolated)fail('TASK_QUARANTINED',409);
   const child=privateRead(row,req);const index=parent.childJobIds.indexOf(childJobId),source=parent.sources[index]!;
   if(child.parentJobId!==parent.jobId||child.sources.length!==1||child.sources[0]!.documentId!==source.documentId||child.sources[0]!.hash!==source.hash||child.executionMode!==parent.executionMode||child.options.task_mode!==parent.options.task_mode)fail('BATCH_CHILD_BINDING_INVALID',409);
   byId.set(childJobId,{row,task:child});
  }
  return parent.childJobIds.map(childJobId=>byId.get(childJobId)!);
 }
 async function saveChild(db:DB,req:FastifyRequest,row:any,child:PrivateTask,event:string){
  child.revision++;note(child,event);const payload=seal(JSON.stringify(child),aad(req,row.id));
  const updated=await rows(db,sql`UPDATE ai_collab_tasks SET revision=${child.revision},updated_at=now(),payload=${payload} WHERE id=${row.id} AND revision=${row.revision} RETURNING id`);
  if(updated.length!==1)fail('VERSION_CONFLICT',409);await saveSnapshot(db,row,child.revision,payload);
 }
 type StorageIssue={jobId:string;projectId:string;revision:number;payloadSha256:string;error:'TASK_STORAGE_INVALID'};
 async function scan(req:FastifyRequest){return scoped(req.user.id,req.user.tenant_id,async db=>{
  const records=await rows(db,sql`SELECT t.*,q.receipt_id FROM ai_collab_tasks t LEFT JOIN ai_collab_task_quarantine q ON q.task_id=t.id AND NOT EXISTS(SELECT 1 FROM ai_collab_task_recovery r WHERE r.receipt_id=q.receipt_id) WHERE project_permission(t.project_id,'view_original') ORDER BY t.updated_at DESC,t.id`);
  const items:PrivateTask[]=[],issues:StorageIssue[]=[],isolated:Array<{jobId:string;projectId:string;receiptId:string;revision:number;payloadSha256:string}>=[];
  for(const r of records){const jobId=`lbj_${r.id.replaceAll('-','')}`;
   if(r.receipt_id){isolated.push({jobId,projectId:r.project_id,receiptId:r.receipt_id,revision:r.revision,payloadSha256:hash(r.payload)});continue;}
   try{items.push(privateRead(r,req));}catch(error){unreadable(error);issues.push({jobId,projectId:r.project_id,revision:r.revision,payloadSha256:hash(r.payload),error:'TASK_STORAGE_INVALID'});}
  }
  return {items,recoveryRequired:issues.length>0,issues,isolated,complete:issues.length===0&&isolated.length===0};
 });}
 async function list(req:FastifyRequest){return (await scan(req)).items.filter(t=>!t.parentJobId);}
 async function isolateTask(req:FastifyRequest,target:string,input:{revision:number;payloadSha256:string;requestId:string;confirm:true}){return scoped(req.user.id,req.user.tenant_id,async db=>{
  const taskId=taskUUID(job.parse(target));const [locator]=await rows(db,sql`SELECT project_id FROM ai_collab_tasks WHERE id=${taskId}`);if(!locator)fail('NOT_FOUND',404);
  const [project]=await rows(db,sql`SELECT id FROM projects WHERE id=${locator.project_id} FOR UPDATE`);if(!project)fail('NOT_FOUND',404);await requirePermission(db,project.id,['view_original']);
  const [row]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${taskId} FOR UPDATE`);if(!row)fail('NOT_FOUND',404);
  const [prior]=await rows(db,sql`SELECT q.* FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${taskId} AND r.receipt_id IS NULL`);
  if(prior){if(prior.request_id===input.requestId&&prior.task_revision===input.revision&&prior.payload_sha256===input.payloadSha256)return {receiptId:prior.receipt_id,jobId:target,status:'isolated',payloadSha256:prior.payload_sha256,revision:prior.task_revision};fail('TASK_ALREADY_QUARANTINED',409);}
  if(row.revision!==input.revision||hash(row.payload)!==input.payloadSha256)fail('VERSION_CONFLICT',409);
  try{privateRead(row,req);fail('TASK_STORAGE_HEALTHY',409);}catch(error){if((error as Error).message==='TASK_STORAGE_HEALTHY')throw error;unreadable(error);}
  const receiptId=randomUUID();const [saved]=await rows(db,sql`INSERT INTO ai_collab_task_quarantine(receipt_id,task_id,tenant_id,project_id,owner_id,actor_id,request_id,task_revision,payload_ciphertext,payload_sha256,task_created_at,task_updated_at,failure_code) VALUES(${receiptId},${row.id},${row.tenant_id},${row.project_id},${row.owner_id},${req.user.id},${input.requestId},${row.revision},${row.payload},${input.payloadSha256},${row.created_at},${row.updated_at},'TASK_STORAGE_INVALID') RETURNING receipt_id`);
  if(!saved)fail('TASK_QUARANTINE_BACKUP_FAILED',409);
  return {receiptId,jobId:target,status:'isolated',payloadSha256:input.payloadSha256,revision:input.revision};
 });}
 async function recoveryCandidate(db:DB,req:FastifyRequest,row:any,quarantine:any){
  if(row.revision!==quarantine.task_revision||hash(row.payload)!==quarantine.payload_sha256||row.payload!==quarantine.payload_ciphertext)return undefined;
  const [snapshot]=await rows(db,sql`SELECT * FROM ai_collab_task_snapshot WHERE task_id=${row.id} AND revision=${row.revision}`);
  if(!snapshot||snapshot.tenant_id!==row.tenant_id||snapshot.project_id!==row.project_id||snapshot.owner_id!==row.owner_id||hash(snapshot.payload_ciphertext)!==snapshot.payload_sha256)return undefined;
  let task:PrivateTask;
  try{task=privateRead({id:row.id,project_id:row.project_id,revision:row.revision,payload:snapshot.payload_ciphertext},req);}catch(error){unreadable(error);return undefined;}
  if(task.projectId!==row.project_id)return undefined;
  for(const [index,source] of task.sources.entries()){
   const [document]=await rows(db,sql`SELECT project_id,revision,state,source_hash,content_hash FROM documents WHERE id=${source.documentId}`);
   if(!document||document.project_id!==row.project_id||document.revision<source.revision||(document.source_hash??document.content_hash)!==source.hash)return undefined;
   const detectionJob=task.recognitionJobIds?.[index];
   let detectionRevision=source.revision;
   const visited=new Set<number>();
   while(true){
    const receipt=task.reviewResolutions?.findLast(r=>r.documentId===source.documentId&&r.sourceHash===source.hash&&r.toRevision===detectionRevision);
    if(!receipt)break;
    if(visited.has(detectionRevision)||receipt.snapshotRevision!==detectionRevision||receipt.fromRevision>=detectionRevision)return undefined;
    visited.add(detectionRevision);
    const snapshots=await rows(db,sql`SELECT revision,review_mode,automatic_task_id,automatic_actor_id,automatic_source_revision,automatic_source_hash,automatic_policy_version
      FROM review_snapshots WHERE document_id=${source.documentId} AND tenant_id=${row.tenant_id} AND project_id=${row.project_id}
      AND revision>${receipt.fromRevision} AND revision<=${receipt.toRevision} ORDER BY revision`);
    if(receipt.decisionOrigin==='human_review'){
     if(receipt.policyVersion!=='human-review'||snapshots.length!==receipt.toRevision-receipt.fromRevision||
        snapshots.some((snapshot,offset)=>snapshot.revision!==receipt.fromRevision+offset+1||snapshot.review_mode!=='human_review'))return undefined;
    }else if(receipt.decisionOrigin==='automatic'){
     const [snapshot]=snapshots;
     if(snapshots.length!==1||snapshot.revision!==receipt.toRevision||snapshot.review_mode!=='automatic'||
        snapshot.automatic_task_id!==row.id||snapshot.automatic_actor_id!==row.owner_id||
        snapshot.automatic_source_revision!==receipt.fromRevision||snapshot.automatic_source_hash!==source.hash||
        snapshot.automatic_policy_version!==receipt.policyVersion)return undefined;
    }else return undefined;
    detectionRevision=receipt.fromRevision;
   }
   if(detectionJob){const [linked]=await rows(db,sql`SELECT id,status,created_at FROM jobs WHERE id=${detectionJob} AND collab_task_id=${row.id} AND document_id=${source.documentId} AND project_id=${row.project_id} AND revision=${detectionRevision} AND kind='detect'`);if(!linked)return undefined;if(linked.status!=='succeeded'&&!task.deliveries.some(d=>d.documentId===source.documentId)){
    if(!['failed','cancelled'].includes(linked.status)||document.revision<source.revision||document.state!=='review')return undefined;
    const [review]=await rows(db,sql`SELECT revision FROM review_snapshots WHERE document_id=${source.documentId} AND revision=${document.revision}`);if(!review)return undefined;
    const [retry]=await rows(db,sql`SELECT j.id FROM jobs j JOIN audit a ON a.object_id=j.id AND a.event='job_retried' AND a.details->>'parentJobId'=${linked.id} AND a.tenant_id=j.tenant_id AND a.project_id=j.project_id AND a.user_id=j.user_id WHERE j.document_id=${source.documentId} AND j.tenant_id=${row.tenant_id} AND j.project_id=${row.project_id} AND j.collab_task_id=${row.id} AND j.user_id=${row.owner_id} AND j.revision=${source.revision} AND j.kind='detect' AND j.status='succeeded' AND j.created_at>=${linked.created_at} ORDER BY j.created_at DESC,j.id DESC LIMIT 1`);
    if(!retry)return undefined;
   }}
   else if(document.revision!==source.revision&&!task.options.standaloneRestoration)return undefined;
   if(task.deliveries.length&&!detectionJob)return undefined;
  }
  const scope=archiveScope(req,task),expectedArchives=new Set<string>();
  for(const delivery of task.deliveries){
   const [record]=await rows(db,sql`SELECT a.id,a.project_id,a.document_id,a.revision,a.hash,a.output_format,a.output_role,d.source_format,j.status,j.collab_task_id FROM artifacts a JOIN jobs j ON j.id=a.job_id JOIN documents d ON d.id=a.document_id WHERE a.id=${delivery.artifactId}`);
   if(!record||record.project_id!==row.project_id||record.document_id!==delivery.documentId||record.revision!==delivery.revision||record.hash!==delivery.hash||(record.output_format??record.source_format??'txt')!==delivery.format||record.output_role!==delivery.role||record.status!=='succeeded'||record.collab_task_id&&record.collab_task_id!==row.id)return undefined;
   try{if(hash(await artifactBytes(delivery))!==delivery.hash)return undefined;}catch(error){unreadable(error);return undefined;}
  }
  if(task.combined){try{if(hash(await readOriginal(task.combined.id))!==task.combined.hash)return undefined;}catch(error){unreadable(error);return undefined;}}
  for(const round of task.rounds){
   if(!!round.objectId!==!!round.sha256)return undefined;
   if(round.objectId){try{const bytes=await readOriginal(round.objectId);if(hash(bytes)!==round.sha256)return undefined;if(round.validated){if(round.format==='docx')await parseOffice(bytes,'docx');else new TextDecoder('utf8',{fatal:true}).decode(bytes);}}catch(error){unreadable(error);return undefined;}}
   if(round.validated){if(!round.objectId||!round.sha256)return undefined;if(!task.options.standaloneRestoration){
    let archive:Awaited<ReturnType<typeof readAiResultArchive>>;try{archive=await readAiResultArchive(db,scope,round.roundId);}catch(error){unreadable(error);return undefined;}
    try{const sourceSha=await sourceForArchive(db,req,task,round.artifactId);if(archive){const m=archive.metadata;if(m.slotId!==round.slotId||m.sourceArtifactId!==round.artifactId||m.sourceSha256!==sourceSha||m.resultObjectId!==round.objectId||m.resultSha256!==round.sha256||m.format!==round.format||m.resultKind!==round.resultKind||m.fileName!==round.suggestedName||m.validation.unknownTokenCount!==(round.unknownTokenCount??0)||m.validation.newCandidateCount!==(round.newCandidateCount??0))return undefined;expectedArchives.add(round.roundId);}}catch(error){unreadable(error);return undefined;}
   }}
   if(round.restoredArtifactId){const [derived]=await rows(db,sql`SELECT hash FROM derived_restorations WHERE id=${round.restoredArtifactId} AND project_id=${row.project_id} AND owner_id=${req.user.id}`);if(!derived)return undefined;try{if(hash(await readOriginal(round.restoredArtifactId))!==derived.hash)return undefined;}catch(error){unreadable(error);return undefined;}}
  }
  const archived=await rows(db,sql`SELECT round_id FROM ai_result_archives WHERE task_id=${row.id}`);if(archived.length!==expectedArchives.size||archived.some(a=>!expectedArchives.has(a.round_id)))return undefined;
  return {task,snapshot};
 }
 async function recoverTask(req:FastifyRequest,receiptId:string,input:{revision:number;snapshotSha256:string;requestId:string;confirm:true}){return scoped(req.user.id,req.user.tenant_id,async db=>{
  const [locator]=await rows(db,sql`SELECT task_id,project_id FROM ai_collab_task_quarantine WHERE receipt_id=${receiptId}`);if(!locator)fail('NOT_FOUND',404);
  const [project]=await rows(db,sql`SELECT id FROM projects WHERE id=${locator.project_id} FOR UPDATE`);if(!project)fail('NOT_FOUND',404);await requirePermission(db,project.id,['view_original']);
  const [row]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${locator.task_id} FOR UPDATE`);if(!row)fail('NOT_FOUND',404);
  const [quarantine]=await rows(db,sql`SELECT * FROM ai_collab_task_quarantine WHERE receipt_id=${receiptId}`);if(!quarantine)fail('NOT_FOUND',404);
  const [prior]=await rows(db,sql`SELECT * FROM ai_collab_task_recovery WHERE receipt_id=${receiptId}`);
  if(prior){if(prior.request_id===input.requestId&&prior.from_revision===input.revision&&prior.snapshot_sha256===input.snapshotSha256)return {receiptId,jobId:`lbj_${row.id.replaceAll('-','')}`,status:'recovered',revision:prior.to_revision};fail('TASK_ALREADY_RECOVERED',409);}
  if(row.revision!==input.revision)fail('VERSION_CONFLICT',409);
  const candidate=await recoveryCandidate(db,req,row,quarantine);if(!candidate)fail('TASK_RECOVERY_UNAVAILABLE',409);
  if(candidate.snapshot.payload_sha256!==input.snapshotSha256)fail('VERSION_CONFLICT',409);
  const task=candidate.task;task.revision=row.revision+1;note(task,'storage_recovered');const payload=seal(JSON.stringify(task),aad(req,row.id));
  await rows(db,sql`UPDATE ai_collab_tasks SET revision=${task.revision},payload=${payload},updated_at=now() WHERE id=${row.id} AND revision=${row.revision}`);
  await rows(db,sql`INSERT INTO ai_collab_task_recovery(receipt_id,task_id,tenant_id,project_id,owner_id,actor_id,request_id,from_revision,to_revision,snapshot_sha256) VALUES(${receiptId},${row.id},${row.tenant_id},${row.project_id},${row.owner_id},${req.user.id},${input.requestId},${row.revision},${task.revision},${input.snapshotSha256})`);
  await saveSnapshot(db,row,task.revision,payload);
  return {receiptId,jobId:task.jobId,status:'recovered',revision:task.revision};
 });}

 async function start(req:FastifyRequest,input:Record<string,any>,caller:Caller,manual=false,existingDb?:DB){
  if(['executionMode','execution_mode','reviewMode','manualReview','reviewResolutions'].some(key=>Object.hasOwn(input,key)))fail('MCP_INVALID_TOOL_ARGUMENTS',400);
  const transportId=req.headers['x-tuomin-mcp-request-id'];
  if(input.request_id===undefined&&typeof transportId==='string')input={...input,request_id:id.parse(transportId)};
  const executionMode=manual||input.standaloneRestoration?'human_review':'automatic';
  const useProfileModeDefault=input.masking_mode===undefined&&input.advanced?.exportMode===undefined,outputFormatsExplicit=input.output_formats!==undefined;
  input={purpose:'contract_review',task_mode:'ai_process_restore',document_type:'auto',masking_mode:'pseudonym',output_formats:['original','md'],unified_pseudonyms:true,batch_result_mode:'individual',...input,use_profile_mode_default:useProfileModeDefault,output_formats_explicit:outputFormatsExplicit};
  if(input.source_path!==undefined&&input.source_paths!==undefined)fail('SOURCE_DECLARATION_CONFLICT',400);
  const docs=cloudDocumentIds(input);if(input.sanitized_output_dir||input.restored_output_dir)fail('CLOUD_DIRECTORY_OVERRIDE_UNSUPPORTED',400);
  if((input.batch_result_mode??'individual')==='combined'&&input.unified_pseudonyms===false)fail('COMBINED_REQUIRES_UNIFIED_PSEUDONYMS',400);
  if(new Set((input.file_settings??[]).map((f:any)=>f.source_path)).size!==(input.file_settings??[]).length)fail('FILE_SETTINGS_DUPLICATE',400);
  for(const f of input.file_settings??[])if(!docs.includes(cloudDocumentIds({source_path:f.source_path})[0]!))fail('FILE_SETTINGS_SOURCE_MISMATCH',400);
  function checkedAdvanced(options:Record<string,any>){const a=options.advanced??{},rules=a.pseudonymRules??[];if(a.entityTypes!==undefined&&!a.entityTypes.length)fail('ENTITY_TYPES_EMPTY',400);if(new Set(rules.map((r:any)=>r.entityType)).size!==rules.length||rules.some((r:any)=>r.prefix!==undefined&&!/^[\p{L}_-]{1,20}$/u.test(r.prefix))||new Set(rules.filter((r:any)=>r.prefix).map((r:any)=>r.prefix)).size!==rules.filter((r:any)=>r.prefix).length)fail('PSEUDONYM_RULES_INVALID',400);if(rules.length&&a.exportMode&&a.exportMode!==(rules.some((r:any)=>r.action==='mask')?'selective_pseudonym':'custom_pseudonym'))fail('CONFLICTING_PSEUDONYM_RULES',400);}
  checkedAdvanced(input);assertExplicitRestoreMode(input);for(const f of input.file_settings??[]){const local=f.advanced??{},a={...input.advanced,...local};if(f.masking_mode!==undefined&&local.exportMode===undefined){delete a.exportMode;if(local.pseudonymRules===undefined)delete a.pseudonymRules;}if(local.pseudonymRules!==undefined&&local.exportMode===undefined)delete a.exportMode;checkedAdvanced({...input,...f,advanced:a});}
  if(input.unified_pseudonyms!==false&&docs.length>1){const validationTask={options:input} as PrivateTask;const signatures=docs.map(documentId=>JSON.stringify(Object.entries(config(validationTask,documentId).pseudonymPrefixes??{}).sort()));if(new Set(signatures).size>1)fail('UNIFIED_PREFIX_CONFLICT',400);}

  const project=input.project_id??(docs.length?await scoped(req.user.id,req.user.tenant_id,async db=>(await rows(db,sql`SELECT project_id FROM documents WHERE id=${docs[0]}`))[0]?.project_id):undefined);if(!project)fail('PROJECT_REQUIRED',400);id.parse(project);
  const create=async(db:DB)=>{
   await rows(db,sql`SELECT pg_advisory_xact_lock(hashtext(${req.user.id}::text),13013)`);
   if(input.request_id){const [old]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE request_id=${id.parse(input.request_id)}`);if(old){const [isolated]=await rows(db,sql`SELECT q.receipt_id FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${old.id} AND r.receipt_id IS NULL`);if(isolated)fail('TASK_QUARANTINED',409);const t=privateRead(old,req);checkCaller(t,caller);if(t.projectId!==project||t.executionMode!==executionMode||canonical(t.options)!==canonical({...input,manualReview:manual}))fail('REQUEST_ID_CONFLICT',409);return externalTask(t);}}
   const sources=[];for(const documentId of docs){const [d]=await rows(db,sql`SELECT id,source_hash,content_hash,revision FROM documents WHERE id=${documentId} AND project_id=${project}`);if(!d)fail('SOURCE_NOT_FOUND',404);sources.push({documentId,hash:d.source_hash??d.content_hash,revision:d.revision});}
   // Resolve the actual selected project/file profile before inserting a task. The
   // same check runs again at authorization and attachment if a preset changes.
   if(!input.standaloneRestoration){
    const preflight={projectId:project,executionMode,options:input,sources} as PrivateTask;
    for(const source of sources)await checkedConfiguration(db,req,preflight,source.documentId);
   }
   if(!existingDb)for(const old of await rows(db,sql`SELECT t.* FROM ai_collab_tasks t LEFT JOIN ai_collab_task_quarantine q ON q.task_id=t.id AND NOT EXISTS(SELECT 1 FROM ai_collab_task_recovery r WHERE r.receipt_id=q.receipt_id) WHERE t.project_id=${project} AND t.created_at>now()-interval '5 minutes' AND q.task_id IS NULL ORDER BY t.created_at DESC`)){let t:PrivateTask;try{t=privateRead(old,req);}catch(error){unreadable(error);continue;}if(!t.parentJobId&&t.caller.sessionId===caller.sessionId&&t.executionMode===executionMode&&['waiting_for_session_authorization','waiting_for_user_file_selection','waiting_for_human_review','building_sanitized_artifact','waiting_for_task_selection','sanitized_artifact_ready'].includes(t.state)&&JSON.stringify(t.sources.map(x=>x.documentId))===JSON.stringify(docs)&&JSON.stringify(t.options)===JSON.stringify({...input,manualReview:manual}))return externalTask(t);}
   const now=new Date().toISOString(),jobId=newOpaqueId('lbj'),children=docs.length>1&&!input.standaloneRestoration?sources.map(()=>newOpaqueId('lbj')):undefined;
   const t:PrivateTask={jobId,revision:1,projectId:project,state:'waiting_for_session_authorization',executionMode,caller,options:{...input,manualReview:manual},sources,deliveries:[],rounds:[],createdAt:now,updatedAt:now,...children?{childJobIds:children}:{}};
   const taskId=taskUUID(jobId),payload=seal(JSON.stringify(t),aad(req,taskId));await rows(db,sql`INSERT INTO ai_collab_tasks(id,tenant_id,owner_id,project_id,revision,payload,request_id) VALUES(${taskId},${req.user.tenant_id},${req.user.id},${project},1,${payload},${input.request_id??null})`);await saveSnapshot(db,{id:taskId,tenant_id:req.user.tenant_id,owner_id:req.user.id,project_id:project},1,payload);
   for(const [index,childJobId] of (children??[]).entries()){
    const source=sources[index]!;
    const child:PrivateTask={jobId:childJobId,parentJobId:jobId,revision:1,projectId:project,state:'waiting_for_session_authorization',executionMode,caller,options:{...input,request_id:undefined,batch_result_mode:'individual',manualReview:manual},sources:[source],deliveries:[],rounds:[],createdAt:now,updatedAt:now};
    const childId=taskUUID(childJobId),childPayload=seal(JSON.stringify(child),aad(req,childId));
    await rows(db,sql`INSERT INTO ai_collab_tasks(id,tenant_id,owner_id,project_id,revision,payload,request_id) VALUES(${childId},${req.user.tenant_id},${req.user.id},${project},1,${childPayload},${null})`);
    await saveSnapshot(db,{id:childId,tenant_id:req.user.tenant_id,owner_id:req.user.id,project_id:project},1,childPayload);
   }
   return {...externalTask(t),...children?{childJobIds:children}:{},reviewUrl:`?collab=${jobId}`};
  };
  const permissions:Array<'view_original'|'restore'|'view_mapping'|'review'|'export'>=input.standaloneRestoration?['view_original','restore','view_mapping']:['view_original','review','export'];
  if(existingDb){await requirePermission(existingDb,project,permissions);return create(existingDb);}
  return projectScope(req,{project},permissions,create);
 }
 async function queueAuthorizedRecognition(req:FastifyRequest,t:PrivateTask,db:DB,target:string,only?:Set<string>){
  if(!applyConfiguration)fail('COLLAB_SETTINGS_ADAPTER_REQUIRED',409);
  if(!only)t.recognitionJobIds=[];
  for(const [index,s] of t.sources.entries()){if(only&&!only.has(s.documentId))continue;const [current]=await rows(db,sql`SELECT source_hash,content_hash FROM documents WHERE id=${s.documentId} AND project_id=${t.projectId}`);if(!current||current.source_hash!==s.hash&&current.content_hash!==s.hash)fail('SOURCE_CHANGED',409);
   const checked=await checkedConfiguration(db,req,t,s.documentId);(t.resolvedOutputs??={})[s.documentId]=checked.outputFormats;const applied=await applyConfiguration(db,req,s.documentId,checked);const ner=(await rows(db,sql`SELECT ner_enabled FROM documents WHERE id=${s.documentId}`))[0]?.ner_enabled===true;const queued=await queueRecognition(db,req,s.documentId,applied.revision,ner,nerReady,taskUUID(target));s.revision=queued.revision;(t.recognitionJobIds??=[])[index]=queued.jobId;
  }
 }
 async function authorize(req:FastifyRequest,target:string,expected:number,input:Authorization){const approved=(await change(req,target,expected,undefined,async(t,db)=>{
  state(t,['waiting_for_session_authorization']);await requirePermission(db,t.projectId,t.options.standaloneRestoration?['restore','view_mapping']:['review','export']);
  if(t.resumeSourceJobId){
   const [sourceRow]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${taskUUID(t.resumeSourceJobId)} FOR UPDATE`);
   if(!sourceRow||sourceRow.owner_id!==req.user.id||sourceRow.tenant_id!==req.user.tenant_id||sourceRow.project_id!==t.projectId)fail('RESUME_NOT_AVAILABLE',409);
   const [sourceQuarantine]=await rows(db,sql`SELECT q.receipt_id FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${sourceRow.id} AND r.receipt_id IS NULL`);if(sourceQuarantine)fail('TASK_QUARANTINED',409);
   const source=privateRead(sourceRow,req),live=sessions.get(t.caller.sessionId);
   if(!live?.initialized||live.user!==req.user.id||live.tenant!==req.user.tenant_id||live.caller.adapterId!==t.caller.adapterId||!canResumeBatchDelivery(source)||source.pendingResume||source.state==='restoring')fail('RESUME_NOT_AVAILABLE',409);
   const children=await batchChildren(db,req,source,true),all=[{row:sourceRow,task:source},...children];
   if(all.some(({task})=>task.state==='restoring'||task.pendingResume||task.caller.sessionId!==source.caller.sessionId||task.caller.adapterId!==source.caller.adapterId||task.state==='client_disconnected'&&!validResumeState(task.resumeState)))fail('RESTORE_BUSY',409);
   if(all.some(({task})=>!!task.mapping)&&!input.allowRestorePath)fail('RESTORE_AUTHORIZATION_REQUIRED',403);
   if(source.combined)await sourceForArchive(db,req,source,`lba_${source.combined.id.replaceAll('-','')}`);
   for(const {task} of all){
    for(const delivery of task.deliveries)await sourceForArchive(db,req,task,deliveredArtifactId(delivery));
    const phase=task.state==='client_disconnected'?task.resumeState:task.state,latest=task.rounds.at(-1);if(['waiting_for_restore_approval','restore_failed'].includes(phase??'')){if(!latest?.validated||!latest.objectId||!latest.sha256)fail('RESUME_NOT_AVAILABLE',409);const bytes=await readOriginal(latest.objectId);if(hash(bytes)!==latest.sha256)fail('RESULT_HASH_MISMATCH',409);}
    if(task.mappingReferences?.length){await requirePermission(db,task.projectId,['view_mapping']);const records=await getProjectMappingRows(db,task.projectId,{historical:true});if(task.mappingReferences.some(ref=>!records.some(value=>value.id===ref.id&&value.token===ref.token&&value.version===(ref.version??1))))fail('DELIVERED_MAPPING_MISSING',409);}
   }
   for(const {row,task} of all){
    task.previousCaller=task.caller;task.caller=t.caller;task.authorization=input;
    if(task.state==='client_disconnected'){task.state=task.resumeState!;delete task.resumeState;}
    if(task.state==='restore_failed')task.state='waiting_for_restore_approval';
    else if(['analyzing_by_ai','ai_result_rejected'].includes(task.state)){task.rounds=task.rounds.filter(r=>r.validated||r.restoredArtifactId);task.state='sanitized_artifact_ready';}
    else if(task.jobId===source.jobId&&task.state==='round_completed'){task.rounds=task.rounds.filter(r=>r.validated||r.restoredArtifactId);task.state='sanitized_artifact_ready';}
    await saveChild(db,req,row,task,'session_resumed');
   }
   t.authorization=input;t.resumedJobId=source.jobId;t.state='completed';note(t,'resume_approved');return externalTask(source);
  }
  if(!input.createExchangeFolder||(!t.options.standaloneRestoration&&!input.allowRedactionPath))fail('REDACTION_AUTHORIZATION_REQUIRED',400);
  if(t.pendingResume){
   if(!validResumeState(t.resumeState))fail('RESUME_STATE_UNAVAILABLE',409);
   const resumeState=t.resumeState!,replacement=t.pendingResume,live=sessions.get(replacement.sessionId);
   if(!live?.initialized||live.user!==req.user.id||live.tenant!==req.user.tenant_id||live.caller.adapterId!==replacement.adapterId)fail('SESSION_AUTHORIZATION_REQUIRED',403);
   if(t.childJobIds){
    for(const {row,task:child} of await batchChildren(db,req,t,true)){
     if(child.caller.sessionId!==t.caller.sessionId||child.caller.adapterId!==t.caller.adapterId||child.pendingResume||child.state==='restoring'||!validResumeState(child.resumeState??child.state))fail('RESUME_STATE_UNAVAILABLE',409);
     for(const delivery of child.deliveries)await sourceForArchive(db,req,child,deliveredArtifactId(delivery));
     for(const receipt of child.rounds)if(receipt.objectId){const bytes=await readOriginal(receipt.objectId);if(hash(bytes)!==receipt.sha256)fail('RESULT_HASH_MISMATCH',409);}
     if(child.mappingReferences?.length){await requirePermission(db,child.projectId,['view_mapping']);const records=await getProjectMappingRows(db,child.projectId,{historical:true});if(child.mappingReferences.some(ref=>!records.some(value=>value.id===ref.id&&value.token===ref.token&&value.version===(ref.version??1))))fail('DELIVERED_MAPPING_MISSING',409);}
     child.previousCaller=child.caller;child.caller=replacement;if(child.state==='client_disconnected'){child.state=child.resumeState!;delete child.resumeState;}await saveChild(db,req,row,child,'session_resumed');
    }
   }
   t.previousCaller=t.caller;t.caller=replacement;delete t.pendingResume;delete t.resumeState;note(t,'session_resumed');if(resumeState!=='waiting_for_session_authorization'){t.authorization=input;t.state=resumeState;return externalTask(t);}
  }
  if(t.options.standaloneRestoration){
   if(!input.allowRestorePath)fail('RESTORE_AUTHORIZATION_REQUIRED',400);if(t.sources.length!==1)fail('STANDALONE_RESTORE_SOURCE_REQUIRED',400);const [d]=await rows(db,sql`SELECT * FROM documents WHERE id=${t.sources[0]!.documentId} AND project_id=${t.projectId}`);if(!d||!(isWordFormat(d.source_format)||['md','txt'].includes(d.source_format)))fail('RESTORE_FORMAT_UNSUPPORTED',400);
   const records=await getProjectMappingRows(db,t.projectId) ;if(!records.length)fail('RESTORE_NO_TOKENS',409);t.mapping=snapshotMapping(records,t.projectId);t.allowedTokens=Object.keys(t.mapping.mappings);
   const bytes=d.source_id?await verifiedDocumentSource(d):Buffer.from(unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`));if(!d.source_id&&hash(bytes)!==d.content_hash)fail('SOURCE_MISMATCH',409);const object=(isLegacyWordFormat(d.source_format)?d.normalized_source_id:d.unlocked_source_id??d.source_id)??randomUUID();if(!d.source_id)await writeOriginal(object,bytes,t.projectId);t.rounds=[{roundId:'lbr_0001',slotId:newOpaqueId('lbs'),format:isWordFormat(d.source_format)?'docx':'md',resultKind:'reviewed_document',artifactId:`lba_${object.replaceAll('-','')}`,objectId:object,sha256:hash(bytes)}];t.authorization=input;t.state='analyzing_by_ai';note(t,'standalone_restore_authorized');return externalTask(t);
  }
  if(t.childJobIds){
   if(!applyConfiguration)fail('COLLAB_SETTINGS_ADAPTER_REQUIRED',409);
   for(const {row,task:child} of await batchChildren(db,req,t,true)){
    state(child,['waiting_for_session_authorization']);checkCaller(child,t.caller);
    child.authorization=input;
    const source=child.sources[0]!,active=await rows(db,sql`SELECT id FROM jobs WHERE document_id=${source.documentId} AND status IN ('queued','running') LIMIT 1`);
    if(active.length){child.pendingInitialDetection=true;child.state='waiting_for_human_review';await saveChild(db,req,row,child,'waiting_for_initial_detection');continue;}
    await queueAuthorizedRecognition(req,child,db,child.jobId);
    child.state='waiting_for_human_review';await saveChild(db,req,row,child,'authorized');
   }
   t.authorization=input;t.pendingInitialDetection=await batchChildren(db,req,t).then(children=>children.some(({task:child})=>child.pendingInitialDetection===true));t.state='waiting_for_human_review';note(t,'batch_authorized');return {...externalTask(t),childJobIds:t.childJobIds};
  }
  if(t.sources.length&&!applyConfiguration)fail('COLLAB_SETTINGS_ADAPTER_REQUIRED',409);
  if(t.sources.length){const active=await rows(db,sql`SELECT id FROM jobs WHERE document_id IN (${sql.join(t.sources.map(s=>sql`${s.documentId}`),sql`,`)}) AND status IN ('queued','running') LIMIT 1`);if(active.length){t.authorization=input;t.pendingInitialDetection=true;t.state='waiting_for_human_review';note(t,'waiting_for_initial_detection');return externalTask(t);}}
  await queueAuthorizedRecognition(req,t,db,target);
  t.authorization=input;t.state=t.sources.length?'waiting_for_human_review':'waiting_for_user_file_selection';note(t,'authorized');return externalTask(t);
 })).task;if(approved.resumeSourceJobId)return load(req,approved.resumeSourceJobId);if(approved.options.standaloneRestoration){const r=approved.rounds[0]!;await submit(req,target,{round_id:r.roundId,slot_id:r.slotId,sha256:r.sha256,suggested_name:`reviewed.${r.format}`});return load(req,target);}
 return approved;}
 async function attach(req:FastifyRequest,target:string,expected:number,documentIds:string[]){return (await change(req,target,expected,undefined,async(t,db)=>{
  state(t,['waiting_for_user_file_selection','waiting_for_human_review']);await requirePermission(db,t.projectId,['review']);if(!t.authorization?.allowRedactionPath)fail('REDACTION_AUTHORIZATION_REQUIRED',403);if(!applyConfiguration)fail('COLLAB_SETTINGS_ADAPTER_REQUIRED',409);
  const selected=new Set(t.sources.map(s=>s.documentId)),fresh:PrivateTask['sources']=[];
  for(const raw of documentIds){const documentId=id.parse(raw);if(selected.has(documentId))continue;if(selected.size>=100)fail('BATCH_SOURCE_LIMIT',400);selected.add(documentId);
   const[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${documentId} AND project_id=${t.projectId}`);if(!d)fail('SOURCE_NOT_FOUND',404);
   await checkedConfiguration(db,req,t,documentId);fresh.push({documentId,hash:d.source_hash??d.content_hash,revision:d.revision});
  }
  if(t.childJobIds||!t.sources.length&&fresh.length>0){
   t.childJobIds??=[];
   for(const source of fresh){
    const childJobId=newOpaqueId('lbj'),childId=taskUUID(childJobId),now=new Date().toISOString();
    const child:PrivateTask={jobId:childJobId,parentJobId:t.jobId,revision:1,projectId:t.projectId,state:'waiting_for_human_review',executionMode:t.executionMode,caller:t.caller,options:{...t.options,request_id:undefined,batch_result_mode:'individual'},authorization:t.authorization,sources:[source],deliveries:[],rounds:[],createdAt:now,updatedAt:now};
    const [initial]=await rows(db,sql`SELECT status FROM jobs WHERE document_id=${source.documentId} AND kind='detect' AND collab_task_id IS NULL ORDER BY created_at DESC LIMIT 1`);
    if(!initial)fail('INITIAL_DETECTION_MISSING',409);if(initial.status==='failed'||initial.status==='cancelled')fail('INITIAL_DETECTION_FAILED',409);
    const active=await rows(db,sql`SELECT id FROM jobs WHERE document_id=${source.documentId} AND status IN ('queued','running') LIMIT 1`);
    const payload=seal(JSON.stringify(child),aad(req,childId));await rows(db,sql`INSERT INTO ai_collab_tasks(id,tenant_id,owner_id,project_id,revision,payload,request_id) VALUES(${childId},${req.user.tenant_id},${req.user.id},${t.projectId},1,${payload},${null})`);
    const childRow={id:childId,tenant_id:req.user.tenant_id,owner_id:req.user.id,project_id:t.projectId,revision:1};await saveSnapshot(db,childRow,1,payload);
    if(initial.status!=='succeeded'||active.length)child.pendingInitialDetection=true;
    else await queueAuthorizedRecognition(req,child,db,childJobId);
    await saveChild(db,req,childRow,child,child.pendingInitialDetection?'waiting_for_initial_detection':'authorized');
    t.childJobIds.push(childJobId);
   }
   t.sources.push(...fresh);t.pendingInitialDetection=await batchChildren(db,req,t).then(children=>children.some(({task:child})=>child.pendingInitialDetection===true));t.state='waiting_for_human_review';note(t,'batch_sources_attached');return externalTask(t);
  }
  t.sources.push(...fresh);
  if(t.pendingInitialDetection&&!t.pendingAttachedSourceIds){t.state='waiting_for_human_review';return externalTask(t);}
  const pending=[...new Set([...(t.pendingAttachedSourceIds??[]),...fresh.map(s=>s.documentId)])];
  for(const documentId of pending){const[initial]=await rows(db,sql`SELECT status FROM jobs WHERE document_id=${documentId} AND kind='detect' AND collab_task_id IS NULL ORDER BY created_at DESC LIMIT 1`);if(!initial)fail('INITIAL_DETECTION_MISSING',409);if(initial.status==='failed'||initial.status==='cancelled')fail('INITIAL_DETECTION_FAILED',409);if(initial.status!=='succeeded'){t.pendingInitialDetection=true;t.pendingAttachedSourceIds=pending;t.state='waiting_for_human_review';note(t,'waiting_for_attached_initial_detection');return externalTask(t);}}
  if(pending.length){const active=await rows(db,sql`SELECT id FROM jobs WHERE document_id IN (${sql.join(pending.map(documentId=>sql`${documentId}`),sql`,`)}) AND status IN ('queued','running') LIMIT 1`);if(active.length){t.pendingInitialDetection=true;t.pendingAttachedSourceIds=pending;t.state='waiting_for_human_review';note(t,'waiting_for_attached_initial_detection');return externalTask(t);}
   await queueAuthorizedRecognition(req,t,db,target,new Set(pending));}
  delete t.pendingAttachedSourceIds;delete t.pendingInitialDetection;
  t.state='waiting_for_human_review';return externalTask(t);
 })).task;}
 async function prepare(req:FastifyRequest,target:string,expected:number){let t=await load(req,target);if(t.revision!==expected)fail('VERSION_CONFLICT',409);state(t,['waiting_for_human_review','building_sanitized_artifact']);if(!t.authorization?.allowSanitizedDelivery)fail('SANITIZED_DELIVERY_AUTHORIZATION_REQUIRED',403);if(!t.sources.length)fail('SOURCE_REQUIRED',400);
  if(t.childJobIds){
   // Resolve all automatic reviews together before the existing alias preflight.
   // A later child cannot leave an earlier child's review half committed.
   if(t.executionMode==='automatic')await change(req,target,expected,undefined,async(parent,db)=>{
    for(const {row,task:child} of await batchChildren(db,req,parent,true)){
     if(child.state!=='waiting_for_human_review'||child.pendingInitialDetection)continue;
     if(child.options.manualReview===true||!child.authorization?.allowRedactionPath||!child.authorization.allowSanitizedDelivery)fail('AUTOMATIC_REVIEW_NOT_AUTHORIZED',403);
     await requirePermission(db,child.projectId,['review','export']);
     const source=child.sources[0];if(!source)fail('SOURCE_REQUIRED',400);
     const prior=child.reviewResolutions?.findLast(r=>r.documentId===source.documentId&&r.toRevision===source.revision&&r.sourceHash===source.hash);
     const linked=child.recognitionJobIds?.[0];if(!linked)fail('RECOGNITION_JOB_NOT_OWNED',409);
     const [d]=await rows(db,sql`SELECT id,revision,state,source_hash,content_hash FROM documents WHERE id=${source.documentId} AND project_id=${child.projectId} FOR UPDATE`);
     const [j]=await rows(db,sql`SELECT id,status,revision FROM jobs WHERE id=${linked} AND document_id=${source.documentId} AND collab_task_id=${taskUUID(child.jobId)} AND kind='detect'`);
     if(!d||!j||j.status!=='succeeded'||d.state!=='review'||d.revision<source.revision||!prior&&j.revision!==source.revision||d.source_hash!==source.hash&&d.content_hash!==source.hash)fail('RECOGNITION_INCOMPLETE',409);
     if(prior&&d.revision===source.revision)continue;
     const receipt=await resolveAutomaticReview(db,req,{taskId:taskUUID(child.jobId),documentId:source.documentId,expectedRevision:source.revision,expectedSourceHash:source.hash});
     source.revision=receipt.toRevision;(child.reviewResolutions??=[]).push(receipt);await saveChild(db,req,row,child,'automatic_review_committed');
    }
    return UNCHANGED;
   });
   const children=await scoped(req.user.id,req.user.tenant_id,db=>batchChildren(db,req,t));
   const preflights:Array<{jobId:string;revision:number;documentId:string;documentRevision:number;epoch:Awaited<ReturnType<typeof preflightUnifiedAliasExport>>}>=[];
   for(const {task:child} of children)if(child.state==='waiting_for_human_review'&&!child.pendingInitialDetection){
    if(!child.authorization?.allowSanitizedDelivery)fail('SANITIZED_DELIVERY_AUTHORIZATION_REQUIRED',403);
    const source=child.sources[0];if(!source)fail('SOURCE_REQUIRED',400);
    const d=(await internal(req,'GET',`/api/documents/${source.documentId}`)).json();if(d.state!=='review')fail('RECOGNITION_INCOMPLETE',409);
    if(child.executionMode==='automatic'&&d.revision!==source.revision)fail('VERSION_CONFLICT',409);
    assertReviewedMarksRestorable(child,d.marks);
    const epoch=await preflightUnifiedAliasExport(req,source.documentId,d.revision);if(epoch&&Object.keys(epoch.changedDocuments).length)fail('UNIFIED_ALIAS_REVIEW_REQUIRED',409);
    preflights.push({jobId:child.jobId,revision:child.revision,documentId:source.documentId,documentRevision:d.revision,epoch});
   }
   if(preflights.length||t.state==='waiting_for_human_review')await change(req,target,expected,undefined,async(parent,db)=>{
    state(parent,['waiting_for_human_review','building_sanitized_artifact']);
    const current=await batchChildren(db,req,parent,true);
    for(const item of preflights){
     const entry=current.find(({task:child})=>child.jobId===item.jobId);
     if(!entry||entry.task.revision!==item.revision)fail('VERSION_CONFLICT',409);
     const child=entry.task,source=child.sources[0];
     state(child,['waiting_for_human_review']);if(child.pendingInitialDetection||!source||source.documentId!==item.documentId||child.executionMode==='automatic'&&source.revision!==item.documentRevision)fail('VERSION_CONFLICT',409);
     if(!child.authorization?.allowSanitizedDelivery)fail('SANITIZED_DELIVERY_AUTHORIZATION_REQUIRED',403);
     const exportJob=await queueExport(db,req,item.documentId,item.documentRevision,item.epoch,taskUUID(child.jobId));
     child.exportJobIds=[exportJob.id];child.state='building_sanitized_artifact';await saveChild(db,req,entry.row,child,'task_updated');
    }
    if(parent.state==='waiting_for_human_review')parent.state='building_sanitized_artifact';
    return null;
   });
   const observed=await batchStatus(req,await load(req,target),t.caller,false);
   return observed.task;
  }
  if(t.executionMode==='automatic'&&t.state==='waiting_for_human_review'){
   const updated=await change(req,target,expected,undefined,async(task,db)=>{
    if(task.executionMode!=='automatic'||task.options.manualReview===true||!task.authorization?.allowRedactionPath||!task.authorization.allowSanitizedDelivery)fail('AUTOMATIC_REVIEW_NOT_AUTHORIZED',403);
    state(task,['waiting_for_human_review']);await requirePermission(db,task.projectId,['review','export']);
    let changed=false;
    for(const [index,source] of task.sources.entries()){
     const prior=task.reviewResolutions?.findLast(r=>r.documentId===source.documentId&&r.toRevision===source.revision&&r.sourceHash===source.hash);
     const linked=task.recognitionJobIds?.[index];if(!linked)fail('RECOGNITION_JOB_NOT_OWNED',409);
     const [d]=await rows(db,sql`SELECT id,revision,state,source_hash,content_hash FROM documents WHERE id=${source.documentId} AND project_id=${task.projectId} FOR UPDATE`);
     const [j]=await rows(db,sql`SELECT id,status,revision FROM jobs WHERE id=${linked} AND document_id=${source.documentId} AND collab_task_id=${taskUUID(target)} AND kind='detect'`);
     if(!d||!j||j.status!=='succeeded'||d.state!=='review'||d.revision<source.revision||!prior&&j.revision!==source.revision||d.source_hash!==source.hash&&d.content_hash!==source.hash)fail('RECOGNITION_INCOMPLETE',409);
     if(prior&&d.revision===source.revision)continue;
     const receipt=await resolveAutomaticReview(db,req,{taskId:taskUUID(target),documentId:source.documentId,expectedRevision:source.revision,expectedSourceHash:source.hash});
     source.revision=receipt.toRevision;(task.reviewResolutions??=[]).push(receipt);changed=true;
    }
    if(!changed)return UNCHANGED;
    note(task,'automatic_review_committed');return null;
   });
   t=updated.task;expected=t.revision;
  }
  const preflight:Array<{documentId:string;revision:number;epoch:Awaited<ReturnType<typeof preflightUnifiedAliasExport>>}>=[];for(const source of t.sources){const d=(await internal(req,'GET',`/api/documents/${source.documentId}`)).json();if(d.state!=='review')fail('RECOGNITION_INCOMPLETE',409);if(t.executionMode==='automatic'&&d.revision!==source.revision)fail('VERSION_CONFLICT',409);assertReviewedMarksRestorable(t,d.marks);const epoch=await preflightUnifiedAliasExport(req,source.documentId,d.revision);if(epoch&&Object.keys(epoch.changedDocuments).length)fail('UNIFIED_ALIAS_REVIEW_REQUIRED',409);preflight.push({documentId:source.documentId,revision:d.revision,epoch});}
  return (await change(req,target,expected,undefined,async(task,db)=>{state(task,['waiting_for_human_review','building_sanitized_artifact']);if(!task.authorization?.allowSanitizedDelivery)fail('SANITIZED_DELIVERY_AUTHORIZATION_REQUIRED',403);if(task.sources.length!==preflight.length||task.sources.some((x,i)=>x.documentId!==preflight[i]!.documentId||task.executionMode==='automatic'&&x.revision!==preflight[i]!.revision))fail('VERSION_CONFLICT',409);
   const jobs:string[]=[];for(const item of preflight){const job=await queueExport(db,req,item.documentId,item.revision,item.epoch,taskUUID(target));jobs.push(job.id);}task.exportJobIds=jobs;task.state='building_sanitized_artifact';return externalTask(task);
  })).task;
 }
 async function release(req:FastifyRequest,target:string,expected:number){const t=await load(req,target);if(t.revision!==expected)fail('VERSION_CONFLICT',409);state(t,['building_sanitized_artifact']);if(!t.authorization?.allowSanitizedDelivery)fail('SANITIZED_DELIVERY_AUTHORIZATION_REQUIRED',403);
  if(t.childJobIds){
   const children=await scoped(req.user.id,req.user.tenant_id,db=>batchChildren(db,req,t));
   for(const {task:child} of children)if(child.state==='building_sanitized_artifact'){
    const jobs=child.exportJobIds??[];
    const statuses=jobs.length?await scoped(req.user.id,req.user.tenant_id,db=>rows(db,sql`SELECT id,status FROM jobs WHERE id IN (${sql.join(jobs.map(value=>sql`${value}`),sql`,`)}) AND collab_task_id=${taskUUID(child.jobId)} AND kind='export'`)):[];
    if(statuses.length===jobs.length&&statuses.every(j=>j.status==='succeeded'))await release(req,child.jobId,child.revision);
    else if(statuses.some(j=>j.status==='failed'||j.status==='cancelled'))await change(req,child.jobId,child.revision,undefined,task=>{state(task,['building_sanitized_artifact']);task.state='failed';task.failureCode='SANITIZED_EXPORT_INCOMPLETE';return null;});
   }
   const observed=await batchStatus(req,await load(req,target),t.caller,false);
   return observed.task;
  }
  const deliveries:Delivery[]=[],aliasReferences=new Map<string,{token:string;version:number}>(),visualApprovedByDoc=new Map<string,Set<string>>();for(const [sourceIndex,s] of t.sources.entries()){
   const linkedJob=t.exportJobIds?.[sourceIndex];if(!linkedJob)fail('EXPORT_NOT_READY',409);
   const linked=await scoped(req.user.id,req.user.tenant_id,async db=>(await rows(db,sql`SELECT collab_task_id FROM jobs WHERE id=${linkedJob} AND document_id=${s.documentId}`))[0]);if(!linked)fail('EXPORT_NOT_READY',409);
   const owner=linked.collab_task_id;if(owner&&owner!==taskUUID(target))fail('EXPORT_JOB_NOT_OWNED',409);
   const ownJob=owner===taskUUID(target),d=(await internal(req,'GET',`/api/documents/${s.documentId}`)).json(),[sourceIdentity]=await scoped(req.user.id,req.user.tenant_id,db=>rows(db,sql`SELECT source_hash,content_hash FROM documents WHERE id=${s.documentId} AND project_id=${t.projectId}`));if(!sourceIdentity||![sourceIdentity.source_hash,sourceIdentity.content_hash].includes(s.hash))fail('SOURCE_CHANGED',409);assertReviewedMarksRestorable(t,d.marks);const outputs=(await internal(req,'GET',`/api/documents/${s.documentId}/outputs?revision=${d.revision}${ownJob?`&jobId=${linkedJob}`:''}`)).json();if(!outputs.length)fail('EXPORT_NOT_READY',409);
   const visualApproved=new Set<string>();for(const m of d.marks??[])if(m.decision==='redact'&&m.replacement?.mode==='alias'){aliasReferences.set(m.replacement.mappingId,{token:m.replacement.token,version:m.replacement.version});if(ownJob)visualApproved.add(m.replacement.mappingId);}visualApprovedByDoc.set(s.documentId,visualApproved);
   const wanted=t.resolvedOutputs?.[s.documentId]??config(t,s.documentId).outputFormats;for(const output of outputs){const visualFallback=output.role==='primary'&&visualFormats.has(output.format??d.sourceFormat)&&wanted.includes('md');if(output.role==='primary'&&!wanted.includes('original')&&!wanted.includes(output.format)&&!visualFallback||output.role==='markdown'&&!wanted.includes('md')||['pdf-docx','word-docx'].includes(output.role)&&!wanted.includes('docx'))continue;
    await internal(req,'POST',`/api/documents/${s.documentId}/download-link`,{revision:d.revision,role:output.role,...ownJob?{jobId:linkedJob}:{}});
    const a=await scoped(req.user.id,req.user.tenant_id,async db=>(await rows(db,ownJob?sql`SELECT a.* FROM artifacts a JOIN jobs j ON j.id=a.job_id WHERE a.document_id=${s.documentId} AND a.revision=${d.revision} AND a.output_role=${output.role} AND j.id=${linkedJob} AND j.status='succeeded' LIMIT 1`:sql`SELECT a.* FROM artifacts a JOIN jobs j ON j.id=a.job_id WHERE a.document_id=${s.documentId} AND a.revision=${d.revision} AND a.output_role=${output.role} AND j.collab_task_id IS NULL AND j.status='succeeded' ORDER BY j.created_at DESC LIMIT 1`))[0]);if(!a)fail('EXPORT_NOT_READY',409);deliveries.push({documentId:s.documentId,artifactId:a.id,format:a.output_format??output.format??d.sourceFormat??'txt',role:a.output_role,revision:d.revision,hash:a.hash});
   }
   if(wanted.includes('md')&&!deliveries.some(x=>x.documentId===s.documentId&&(markdownDelivery(x)||visualDelivery(x))))fail('REQUESTED_MARKDOWN_NOT_EXPORTED',409);
  }
  if(!deliveries.length)fail('SANITIZED_EXPORT_INCOMPLETE',409);
  const deliveredTokens=new Set<string>(),verifiedVisualDocuments=new Set<string>(),knownTokens=[...new Set([...aliasReferences.values()].map(r=>r.token))];for(const a of deliveries){const b=await artifactBytes(a);if(hash(b)!==a.hash)fail('ARTIFACT_VERIFICATION_FAILED',409);const text=a.format==='docx'?(await parseOffice(b,'docx')).text:a.format==='doc'?(await parseOffice((await normalizeLegacyBytes(b,'reviewed.doc','.doc')).buffer,'docx')).text:['md','txt'].includes(a.format)?new TextDecoder('utf8',{fatal:true}).decode(b):'';for(const token of emittedRestorationTokens(text,knownTokens,['doc','docx'].includes(a.format)))deliveredTokens.add(normalizeToken(token));if(visualDelivery(a)&&!deliveries.some(x=>x.documentId===a.documentId&&markdownDelivery(x)))verifiedVisualDocuments.add(a.documentId);}
  const verifiedMappings=aliasReferences.size&&(verifiedVisualDocuments.size>0||t.authorization?.allowRestorePath)?await scoped(req.user.id,req.user.tenant_id,async db=>{if(t.authorization?.allowRestorePath)await requirePermission(db,t.projectId,['restore','view_mapping']);return (await getProjectMappingRows(db,t.projectId,{historical:true})).filter(x=>aliasReferences.get(x.id)?.token===x.token&&aliasReferences.get(x.id)?.version===x.version);}):[];
  for(const documentId of verifiedVisualDocuments)for(const mappingId of visualApprovedByDoc.get(documentId)??[]){const row=verifiedMappings.find(x=>x.id===mappingId);if(row)deliveredTokens.add(normalizeToken(row.token));}
  const matchingMappings=verifiedMappings.filter(x=>deliveredTokens.has(normalizeToken(x.token))),mapping=t.authorization?.allowRestorePath&&matchingMappings.length?snapshotMapping(matchingMappings,t.projectId):undefined;
  let combined:PrivateTask['combined'];if(t.options.batch_result_mode==='combined'){
   const parts=[];for(const [i,s] of t.sources.entries()){const a=deliveries.find(x=>x.documentId===s.documentId&&markdownDelivery(x));if(!a){if(!deliveries.some(x=>x.documentId===s.documentId&&visualDelivery(x)))fail('COMBINED_MARKDOWN_REQUIRED',409);parts.push(`## 材料 ${i+1}\n\n本材料仅有经核验的假名 PDF/图片附件，请读取本次交付的对应附件。`);continue;}const b=await artifactBytes(a);if(hash(b)!==a.hash)fail('ARTIFACT_VERIFICATION_FAILED',409);parts.push(`## 材料 ${i+1}\n\n${new TextDecoder('utf8',{fatal:true}).decode(b)}`);}
   const bytes=Buffer.from(parts.join('\n\n---\n\n'));if(bytes.length>20*1024*1024)fail('COMBINED_TOO_LARGE',409);const object=randomUUID();await writeOriginal(object,bytes,t.projectId);combined={id:object,hash:hash(bytes)};
  }
  return (await change(req,target,expected,undefined,async(task,db)=>{for(const d of deliveries){const [current]=await rows(db,sql`SELECT revision,state FROM documents WHERE id=${d.documentId} AND project_id=${task.projectId}`);if(!current||current.revision!==d.revision||current.state!=='review')fail('VERSION_CONFLICT',409);}task.deliveries=deliveries;task.mapping=mapping;task.allowedTokens=[...new Set([...aliasReferences.values()].map(x=>x.token).filter(x=>deliveredTokens.has(normalizeToken(x))))];task.mappingReferences=[...aliasReferences].filter(([,ref])=>deliveredTokens.has(normalizeToken(ref.token))).map(([id,ref])=>({id,...ref}));task.combined=combined;task.state=task.options.manualReview?'waiting_for_task_selection':'sanitized_artifact_ready';return externalTask(task);})).task;
 }
 async function finishCombinedParent(req:FastifyRequest,parent:PrivateTask,children:PrivateTask[]){
  if(!parent.childJobIds||parent.options.batch_result_mode!=='combined'||parent.combined)fail('BATCH_CHILD_BINDING_INVALID',409);
  if(!children.every(c=>['sanitized_artifact_ready','waiting_for_task_selection','completed','failed','cancelled_by_user'].includes(c.state)))fail('BATCH_EXPORT_INCOMPLETE',409);
  const delivered=children.map((child,index)=>({child,index})).filter(({child})=>['sanitized_artifact_ready','waiting_for_task_selection','completed'].includes(child.state));
  if(!delivered.length)return (await change(req,parent.jobId,parent.revision,parent.caller,task=>{task.state='failed';task.failureCode='BATCH_EXPORT_INCOMPLETE';return null;})).task;
  const parts:string[]=[],deliveries:Delivery[]=[],refs=new Map<string,{token:string;version?:number}>(),tokens=new Set<string>();
  for(const [reportIndex,{child,index}] of delivered.entries()){
   const source=parent.sources[index]!;
   if(child.parentJobId!==parent.jobId||child.sources[0]?.documentId!==source.documentId||child.sources[0]?.hash!==source.hash||!child.deliveries.length)fail('BATCH_CHILD_BINDING_INVALID',409);
   const markdown=child.deliveries.find(markdownDelivery),visual=child.deliveries.find(visualDelivery),selected=markdown??visual;
   if(!selected)fail('COMBINED_EXPORT_INCOMPLETE',409);
   for(const a of child.deliveries){if(a.documentId!==source.documentId||hash(await artifactBytes(a))!==a.hash)fail('ARTIFACT_VERIFICATION_FAILED',409);
    await scoped(req.user.id,req.user.tenant_id,db=>sourceForArchive(db,req,child,deliveredArtifactId(a)));deliveries.push(a);}
   for(const ref of child.mappingReferences??[]){const prior=refs.get(ref.id);if(prior&&(prior.token!==ref.token||prior.version!==ref.version))fail('DELIVERED_MAPPING_MISSING',409);refs.set(ref.id,{token:ref.token,version:ref.version});}
   for(const token of child.allowedTokens??[])tokens.add(token);
   parts.push(markdown?`## 材料 ${reportIndex+1}\n\n${new TextDecoder('utf8',{fatal:true}).decode(await artifactBytes(markdown))}`:`## 材料 ${reportIndex+1}\n\n本材料仅有经核验的假名 PDF/图片附件，请读取本次交付的对应附件。`);
  }
  const bytes=Buffer.from(parts.join('\n\n---\n\n'));if(bytes.length>20*1024*1024)fail('COMBINED_TOO_LARGE',409);
  const object=randomUUID();await writeOriginal(object,bytes,parent.projectId);
  return (await change(req,parent.jobId,parent.revision,parent.caller,async(task,db)=>{
   const current=await batchChildren(db,req,task,true);
   if(current.some(({task:child},index)=>child.revision!==children[index]!.revision||child.state!==children[index]!.state))fail('VERSION_CONFLICT',409);
   for(const [index,{task:child}] of current.entries())if(['sanitized_artifact_ready','waiting_for_task_selection','completed'].includes(child.state)){
    const expected=child.deliveries;if(!expected.length||expected.some(a=>!deliveries.some(b=>b.artifactId===a.artifactId&&b.hash===a.hash&&b.revision===a.revision)))fail('STALE_ARTIFACT',409);
    const source=task.sources[index]!,[document]=await rows(db,sql`SELECT source_hash,content_hash,revision,state FROM documents WHERE id=${source.documentId} AND project_id=${task.projectId}`);
    if(!document||![document.source_hash,document.content_hash].includes(source.hash)||document.state!=='review'||expected.some(a=>a.revision!==document.revision))fail('SOURCE_CHANGED',409);
   }
   const mappingRows=refs.size&&task.authorization?.allowRestorePath?(await getProjectMappingRows(db,task.projectId,{historical:true})).filter(x=>refs.get(x.id)?.token===x.token&&refs.get(x.id)?.version===x.version):[];
   if(task.authorization?.allowRestorePath){await requirePermission(db,task.projectId,['restore','view_mapping']);if(mappingRows.length!==refs.size)fail('DELIVERED_MAPPING_MISSING',409);}
   task.deliveries=deliveries;task.mappingReferences=[...refs].map(([id,ref])=>({id,token:ref.token,version:ref.version}));task.allowedTokens=[...tokens];task.mapping=mappingRows.length?snapshotMapping(mappingRows,task.projectId):undefined;task.combined={id:object,hash:hash(bytes)};
   task.state=task.options.manualReview?'waiting_for_task_selection':'sanitized_artifact_ready';return null;
  })).task;
 }
 async function delivery(req:FastifyRequest,target:string,args:Record<string,any>,caller:Caller,allocate=true){
  try{return await deliveryOnce(req,target,args,caller,allocate);}
  catch(error){
   const transportId=req.headers['x-tuomin-mcp-request-id'];
   if((error as Error).message!=='VERSION_CONFLICT'||typeof transportId!=='string'||!id.safeParse(transportId).success)throw error;
   const current=await load(req,target,caller),requestHash=hash(canonical(args));
   const completed=current.transportReceipts?.completedDelivery,replaced=current.transportReceipts?.slotReplacement;
   const exactCompleted=current.state==='completed'&&completed?.requestId===transportId&&completed.requestHash===requestHash;
   const exactReplacement=['analyzing_by_ai','ai_result_rejected'].includes(current.state)&&replaced?.requestId===transportId&&replaced.requestHash===requestHash&&replaced.currentSlotId===current.rounds.at(-1)?.slotId;
   const boundSlot=!args.replace_slot_id&&['analyzing_by_ai','ai_result_rejected'].includes(current.state)&&!!current.rounds.at(-1);
   if(!exactCompleted&&!exactReplacement&&!boundSlot)throw error;
   return deliveryOnce(req,target,args,caller,allocate,true);
  }
 }
 async function deliveryOnce(req:FastifyRequest,target:string,args:Record<string,any>,caller:Caller,allocate=true,readOnlyReplay=false){
  const t=await load(req,target,caller);
  if(t.childJobIds&&!t.combined)fail('BATCH_CHILD_JOB_REQUIRED',409);
  const transportId=req.headers['x-tuomin-mcp-request-id'];
  const completedReplay=t.options.task_mode==='redact_only'&&t.state==='completed'&&typeof transportId==='string'&&t.transportReceipts?.completedDelivery?.requestId===transportId&&t.transportReceipts.completedDelivery.requestHash===hash(canonical(args));
  state(t,completedReplay?['completed']:['sanitized_artifact_ready','analyzing_by_ai','ai_result_rejected']);
  if(!t.authorization?.allowSanitizedDelivery)fail('SANITIZED_DELIVERY_AUTHORIZATION_REQUIRED',403);
  if(t.combined&&args.artifact_id&&args.artifact_id!==`lba_${t.combined.id.replaceAll('-','')}`)fail('ARTIFACT_MISMATCH',409);
  if(!t.combined&&t.sources.length>1&&!args.artifact_id)fail('ARTIFACT_ID_REQUIRED',400);
  const requested=args.output_format??'md';
  const selected=t.combined?undefined:args.artifact_id
   ?t.deliveries.find(a=>deliveredArtifactId(a)===args.artifact_id)
   :t.deliveries.find(a=>a.role==='primary'&&a.format==='docx')??t.deliveries.find(markdownDelivery)??t.deliveries.find(visualDelivery);
  if(!t.combined&&!selected)fail('ARTIFACT_FORMAT_UNAVAILABLE',409);
  const related=t.combined?t.deliveries:t.deliveries.filter(a=>a.documentId===selected!.documentId);
  const visualAttachments=related.filter(a=>visualDelivery(a)&&a.artifactId!==selected?.artifactId&&!related.some(x=>x.documentId===a.documentId&&markdownDelivery(x)));
  let b:Buffer,artifactId:string,inputFormat:string;
  if(t.combined){await projectScope(req,{project:t.projectId},['export'],db=>sourceForArchive(db,req,t,`lba_${t.combined!.id.replaceAll('-','')}`));b=await readOriginal(t.combined.id);if(hash(b)!==t.combined.hash)fail('ARTIFACT_VERIFICATION_FAILED',409);artifactId=`lba_${t.combined.id.replaceAll('-','')}`;inputFormat='md';}
  else{await internal(req,'POST',`/api/documents/${selected!.documentId}/download-link`,{revision:selected!.revision,role:selected!.role,artifactId:selected!.artifactId});b=await artifactBytes(selected!);if(hash(b)!==selected!.hash)fail('ARTIFACT_VERIFICATION_FAILED',409);artifactId=deliveredArtifactId(selected!);inputFormat=selected!.format;}
  const attachments=[];
  for(const a of visualAttachments){
   await internal(req,'POST',`/api/documents/${a.documentId}/download-link`,{revision:a.revision,role:a.role,artifactId:a.artifactId});
   const bytes=await artifactBytes(a);if(hash(bytes)!==a.hash)fail('ARTIFACT_VERIFICATION_FAILED',409);
   attachments.push({artifactId:deliveredArtifactId(a),format:a.format,role:a.role,sha256:a.hash,bytesBase64:bytes.toString('base64')});
  }
  const visual=visualFormats.has(inputFormat)||attachments.length>0;
  const resultFormat=args.output_format??(visual||inputFormat==='docx'?'docx':'md');
  const resultKind=visual?'derived_report':args.result_kind??'reviewed_document';
  const source={artifactId,format:inputFormat,filename:`sanitized.${inputFormat}`,sha256:hash(b),bytesBase64:b.toString('base64'),...attachments.length?{attachments}:{}};
  const guidance=visual?'Read or render the approved pseudonymized artifact and every attachment. For mixed input, review the Markdown and all visual attachments. Report unreadable input; never infer a pseudonym or inspect originals. Submit a derived_report in this same task.':'';
  if(!allocate)return {...externalTask(t),...source,...visual?{resultKind,defaultResultFormat:resultFormat,instructions:guidance}:{}};
  if(t.options.task_mode==='redact_only'){if(completedReplay)return {...externalTask(t),...source,restorable:!!t.mapping};if(readOnlyReplay)fail('VERSION_CONFLICT',409);state(t,['sanitized_artifact_ready']);const completed=await change(req,target,t.revision,caller,task=>{task.state='completed';if(typeof transportId==='string')(task.transportReceipts??={}).completedDelivery={requestId:id.parse(transportId),requestHash:hash(canonical(args))};return externalTask(task);});return {...externalTask(completed.task),...source,restorable:!!t.mapping};}
  const latest=t.rounds.at(-1),active=t.state==='analyzing_by_ai'||t.state==='ai_result_rejected';
  if(active){if(!latest||latest.artifactId!==artifactId)fail('ARTIFACT_MISMATCH',409);if(!args.replace_slot_id||(typeof transportId==='string'&&t.transportReceipts?.slotReplacement?.requestId===transportId&&t.transportReceipts.slotReplacement.previousSlotId===args.replace_slot_id&&t.transportReceipts.slotReplacement.currentSlotId===latest.slotId&&t.transportReceipts.slotReplacement.requestHash===hash(canonical(args)))){if(latest.format!==resultFormat)fail('OUTPUT_FORMAT_ALREADY_BOUND',409);if(latest.resultKind!==resultKind)fail('RESULT_KIND_ALREADY_BOUND',409);return {...externalTask(t),roundId:latest.roundId,slotId:latest.slotId,...source,resultFormat,resultKind,...visual?{instructions:guidance}:{},slotUploadPath:`/api/ai-collab/tasks/${target}/slots/${latest.slotId}`};}}
  else if(args.replace_slot_id)fail('SLOT_REPLACEMENT_INVALID',409);
  if(readOnlyReplay)fail('VERSION_CONFLICT',409);
  const update=await change(req,target,t.revision,caller,task=>{if(active){const old=task.rounds.at(-1);if(!old||old.slotId!==args.replace_slot_id||old.artifactId!==artifactId||old.validated!==undefined)fail('SLOT_REPLACEMENT_INVALID',409);const slotId=newOpaqueId('lbs');if(typeof transportId==='string')(task.transportReceipts??={}).slotReplacement={requestId:id.parse(transportId),requestHash:hash(canonical(args)),previousSlotId:old.slotId,currentSlotId:slotId};task.rounds[task.rounds.length-1]={...old,slotId,format:resultFormat,resultKind,objectId:undefined,sha256:undefined};task.state='analyzing_by_ai';return {roundId:old.roundId,slotId};}state(task,['sanitized_artifact_ready']);const next=task.rounds.length+1;if(next>9999)fail('ROUND_LIMIT',409);const roundId=`lbr_${String(next).padStart(4,'0')}`,slotId=newOpaqueId('lbs');task.rounds.push({roundId,slotId,format:resultFormat,resultKind,artifactId});task.state='analyzing_by_ai';return {roundId,slotId};});
  return {...externalTask(update.task),...update.result,...source,resultFormat,resultKind,...visual?{instructions:guidance}:{},slotUploadPath:`/api/ai-collab/tasks/${target}/slots/${update.result.slotId}`};
 }
 async function storeResult(req:FastifyRequest,target:string,slotId:string,bytes:Buffer,caller?:Caller){const t=await load(req,target,caller),r=t.rounds.at(-1);if(!r||r.slotId!==slot.parse(slotId))fail('SLOT_NOT_AVAILABLE',409);state(t,['analyzing_by_ai','ai_result_rejected']);if(r.objectId&&t.state!=='ai_result_rejected')fail('SLOT_ALREADY_FROZEN',409);if(!t.options.standaloneRestoration)await projectScope(req,{project:t.projectId},['view_original','review'],async()=>null);const object=randomUUID();await writeOriginal(object,bytes,t.projectId);return (await change(req,target,t.revision,caller,async(task,db)=>{if(!task.options.standaloneRestoration)await requirePermission(db,task.projectId,['review']);const x=task.rounds.at(-1);if(!x||x.slotId!==slotId)fail('SLOT_NOT_AVAILABLE',409);if(x.objectId&&task.state!=='ai_result_rejected')fail('SLOT_ALREADY_FROZEN',409);x.objectId=object;x.sha256=hash(bytes);x.validated=undefined;x.reviewed=undefined;x.unknownTokenCount=undefined;x.newCandidateCount=undefined;task.failureCode=undefined;task.state='analyzing_by_ai';return {sha256:x.sha256};})).result;}
 function archiveScope(req:FastifyRequest,t:PrivateTask):AiResultArchiveScope{return{tenantId:req.user.tenant_id,projectId:t.projectId,ownerId:req.user.id,taskId:taskUUID(t.jobId)};}
 async function sourceForArchive(db:DB,req:FastifyRequest,t:PrivateTask,sourceArtifactId:string){
  const combined=t.combined&&sourceArtifactId===`lba_${t.combined.id.replaceAll('-','')}`;
  const selected=combined?undefined:t.deliveries.find(a=>sourceArtifactId===`lba_${a.artifactId.replaceAll('-','')}`);
  if(!combined&&!selected)fail('STALE_ARTIFACT',409);
  const bound=t.childJobIds?await batchChildren(db,req,t):undefined;
  const children=combined?t.sources.map(s=>t.deliveries.find(a=>a.documentId===s.documentId&&markdownDelivery(a))??t.deliveries.find(a=>a.documentId===s.documentId&&visualDelivery(a))).filter((a):a is Delivery=>!!a):[selected!];
  if(combined&&(!children.length||!bound&&children.length!==t.sources.length))fail('STALE_ARTIFACT',409);
  for(const child of children){
   const [record]=await rows(db,sql`SELECT a.id,a.project_id,a.document_id,a.revision,a.hash,a.output_format,a.output_role,d.source_format,d.revision AS current_revision,d.source_hash,d.content_hash,j.status,j.collab_task_id FROM artifacts a JOIN jobs j ON j.id=a.job_id JOIN documents d ON d.id=a.document_id WHERE a.id=${child.artifactId}`);
   const index=t.sources.findIndex(s=>s.documentId===child.documentId),owner=bound?.[index]?.task,source=t.sources[index];
   if(index<0||bound&&(!owner||!owner.deliveries.some(a=>a.artifactId===child.artifactId&&a.hash===child.hash&&a.revision===child.revision)))fail('STALE_ARTIFACT',409);
   if(!record||record.project_id!==t.projectId||record.document_id!==child.documentId||record.revision!==child.revision||record.current_revision!==child.revision||(record.source_hash??record.content_hash)!==source!.hash||record.hash!==child.hash||(record.output_format??record.source_format??'txt')!==child.format||record.output_role!==child.role||record.status!=='succeeded'||record.collab_task_id&&record.collab_task_id!==taskUUID(owner?.jobId??t.jobId))fail('STALE_ARTIFACT',409);
   if(hash(await artifactBytes(child))!==child.hash)fail('STALE_ARTIFACT',409);
  }
  if(combined){const bytes=await readOriginal(t.combined!.id);if(hash(bytes)!==t.combined!.hash)fail('STALE_ARTIFACT',409);return t.combined!.hash;}
  return selected!.hash;
 }
 async function validatedReceipt(req:FastifyRequest,t:PrivateTask,r:PrivateTask['rounds'][number],requestedName:string){
  const archived=t.options.standaloneRestoration?undefined:await projectScope(req,{project:t.projectId},['view_original','review'],async db=>{
   const value=await readAiResultArchive(db,archiveScope(req,t),r.roundId);
   if(value&&(value.metadata.slotId!==r.slotId||value.metadata.sourceArtifactId!==r.artifactId||value.metadata.sourceSha256!==await sourceForArchive(db,req,t,r.artifactId)||value.metadata.resultObjectId!==r.objectId||value.metadata.resultSha256!==r.sha256||value.metadata.format!==r.format||value.metadata.resultKind!==r.resultKind||value.metadata.fileName!==r.suggestedName||value.metadata.fileName!==requestedName||value.metadata.validation.unknownTokenCount!==(r.unknownTokenCount??0)||value.metadata.validation.newCandidateCount!==(r.newCandidateCount??0)))fail('AI_RESULT_ARCHIVE_CONFLICT',409);
   return value;
  });
  return {...externalTask(t),validation:{valid:true,unknownTokenCount:r.unknownTokenCount??0,newCandidateCount:r.newCandidateCount??0,humanReviewRequired:true},restorationStarted:t.state==='restoring',...archived?{archivedResult:archived.receipt}:{}};
 }
 async function submit(req:FastifyRequest,target:string,args:Record<string,any>,caller?:Caller){
  let t=await load(req,target,caller),r=t.rounds.at(-1);const requestedRound=round.parse(args.round_id),requestedSlot=slot.parse(args.slot_id);
  if(!t.options.standaloneRestoration)await projectScope(req,{project:t.projectId},['view_original','review'],async()=>null);
  if(!r||r.roundId!==requestedRound||r.slotId!==requestedSlot)fail('SLOT_NOT_AVAILABLE',409);
  const requestedHash=sha.parse(args.sha256),name=safeName.parse(args.suggested_name);
  if(!name.toLowerCase().endsWith(`.${r.format}`))fail('RESULT_FORMAT_MISMATCH',400);
  const inline=args.bytes_base64?decode(args.bytes_base64):undefined;
  if(inline&&hash(inline)!==requestedHash)fail('RESULT_HASH_MISMATCH',409);
  if(r.validated===true&&r.objectId&&r.sha256===requestedHash&&['waiting_for_restore_approval','restoring','restore_failed','round_completed','completed'].includes(t.state))return validatedReceipt(req,t,r,name);
  state(t,['analyzing_by_ai','ai_result_rejected','validating_ai_result']);
  // A persisted validating state from an older process has a frozen input but
  // no completed validation. Re-run only that same current round and hash.
  if(inline&&!(r.objectId&&r.sha256===requestedHash)){
   if(t.state==='validating_ai_result')fail('SLOT_ALREADY_FROZEN',409);
   await storeResult(req,target,requestedSlot,inline,caller);
   t=await load(req,target,caller);r=t.rounds.at(-1);
   if(!r||r.roundId!==requestedRound||r.slotId!==requestedSlot)fail('SLOT_NOT_AVAILABLE',409);
  }
  if(!r.objectId||r.sha256!==requestedHash)fail('RESULT_HASH_MISMATCH',409);
  const objectId=r.objectId,resultFormat=r.format,b=await readOriginal(objectId);
  if(hash(b)!==requestedHash)fail('RESULT_HASH_MISMATCH',409);
  let text:string;
  try{if(resultFormat==='docx'){const parsed=await parseOffice(b,'docx');if(!t.options.standaloneRestoration&&parsed.coverage.some(c=>c.status!=='complete'))fail('RESULT_DOCUMENT_COVERAGE_INCOMPLETE',409);text=parsed.text;}else{text=new TextDecoder('utf8',{fatal:true}).decode(b);}}
  catch(e){const code=/^[A-Z0-9_]{1,100}$/.test((e as Error).message)?(e as Error).message:'RESULT_ENCODING_OR_FORMAT_INVALID';await change(req,target,t.revision,caller,async(task,db)=>{if(!task.options.standaloneRestoration)await requirePermission(db,task.projectId,['review']);state(task,['analyzing_by_ai','ai_result_rejected','validating_ai_result']);const rejected=task.rounds.at(-1);if(!rejected||rejected.roundId!==requestedRound||rejected.slotId!==requestedSlot||rejected.objectId!==objectId||rejected.sha256!==requestedHash)fail('SLOT_NOT_AVAILABLE',409);rejected.validated=false;rejected.reviewed=false;task.state='ai_result_rejected';task.failureCode=code;return null;});fail(code,400);}
  const knownTokens=t.allowedTokens??Object.keys(t.mapping?.mappings??{}),known=new Set(knownTokens.map(normalizeToken)),variants=resultFormat==='md'?knownTokens.flatMap(token=>[token,token.replace(/([\\`*_{}\[\]()#+.!>|~<>-])/g,'\\$1'),token.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')]):knownTokens,tokens=[...text.matchAll(/【[^】]{1,256}】/gu)].filter(m=>resultFormat==='docx'?known.has(normalizeToken(m[0])):variants.includes(m[0])),unknown=inspectRestorationTokens(text,variants,resultFormat==='docx').length;
  const tokenSpans=tokens.map(m=>({start:m.index,end:m.index+m[0].length})),candidates=detectComplete(text,[]).marks.filter(m=>!tokenSpans.some(s=>m.start>=s.start&&m.end<=s.end));
  let replayed=false;
  const changed=await change(req,target,undefined,caller,async(task,db)=>{
   if(!task.options.standaloneRestoration)await requirePermission(db,task.projectId,['review']);
   const x=task.rounds.at(-1);if(!x||x.roundId!==requestedRound||x.slotId!==requestedSlot||x.objectId!==objectId||x.sha256!==requestedHash)fail('SLOT_NOT_AVAILABLE',409);
   if(x.validated===true&&['waiting_for_restore_approval','restoring','restore_failed','round_completed','completed'].includes(task.state)){replayed=true;return UNCHANGED;}
   state(task,['analyzing_by_ai','ai_result_rejected','validating_ai_result']);
   x.unknownTokenCount=unknown;x.newCandidateCount=candidates.length;x.suggestedName=name;x.validated=unknown===0&&(task.options.standaloneRestoration||candidates.length===0);x.reviewed=false;
   let archivedResult;
   if(x.validated&&!task.options.standaloneRestoration){
    const sourceSha256=await sourceForArchive(db,req,task,x.artifactId);
    const metadata:AiResultArchiveMetadata={version:1,taskJobId:task.jobId,roundId:x.roundId,slotId:x.slotId,sourceArtifactId:x.artifactId,sourceSha256,resultObjectId:x.objectId!,resultSha256:x.sha256!,format:x.format,resultKind:x.resultKind,fileName:name,actorId:req.user.id,validation:{knownTokenCount:tokens.length,unknownTokenCount:unknown,newCandidateCount:candidates.length},humanReviewed:false};
    archivedResult=await writeAiResultArchive(db,archiveScope(req,task),metadata);
   }
   task.state=x.validated?'waiting_for_restore_approval':'ai_result_rejected';task.failureCode=x.validated?undefined:unknown?'RESULT_UNKNOWN_TOKENS':'RESULT_NEW_SENSITIVE_CANDIDATES';note(task,'result_validated',task.failureCode);
   return {...externalTask(task),validation:{valid:x.validated,unknownTokenCount:unknown,newCandidateCount:candidates.length,humanReviewRequired:true},restorationStarted:false,...archivedResult?{archivedResult}:{}};
  });
  return replayed?validatedReceipt(req,changed.task,changed.task.rounds.at(-1)!,name):changed.result;
 }
 async function restore(req:FastifyRequest,target:string,expected:number,roundId:string,caller?:Caller){
  const requestedRound=round.parse(roundId),taskId=taskUUID(job.parse(target));
  function checkedRound(t:PrivateTask){const r=t.rounds.at(-1);if(!r||r.roundId!==requestedRound)fail('ROUND_NOT_CURRENT',409);if(!r.validated||!r.reviewed||!r.objectId)fail('RESULT_HUMAN_REVIEW_REQUIRED',409);if(!t.authorization?.allowRestorePath)fail('RESTORE_AUTHORIZATION_REQUIRED',403);if(!t.mapping)fail('RESTORE_NO_TOKENS',409);return r;}
  async function restorePermission(projectId:string){await scoped(req.user.id,req.user.tenant_id,db=>requirePermission(db,projectId,['restore']));}
  // Check authorization before trying the lock, then reread under ownership.
  // A busy or completed call is read-only; CAS remains required to transition.
  const before=await load(req,target,caller);checkedRound(before);await restorePermission(before.projectId);
  // scoped() uses the shared eight-connection pool. Holding one pooled
  // transaction while load()/change() request another can exhaust that pool
  // under parallel restores, so this transaction uses a dedicated connection.
  const lockClient=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
  let lockLost=false;lockClient.on('error',()=>{lockLost=true;});await lockClient.connect();
  try{
   await lockClient.query('BEGIN');
   const lock=await lockClient.query('SELECT pg_try_advisory_xact_lock(13049,hashtext($1::text)) AS acquired',[taskId]);
   if(!lock.rows[0]?.acquired){await lockClient.query('ROLLBACK');const busy=await load(req,target,caller);checkedRound(busy);await restorePermission(busy.projectId);return busy;}
   const t=await load(req,target,caller),r=checkedRound(t);await restorePermission(t.projectId);
   if(t.state==='round_completed'&&r.restoredArtifactId){await lockClient.query('COMMIT');return t;}
   if(t.revision!==expected)fail('VERSION_CONFLICT',409);
   // A persisted restoring state with this transaction lock free means the
   // previous process exited; the same reviewed round can be retried safely.
   if(t.state!=='restoring'&&(t.state!=='round_completed'||t.options.task_mode!=='ai_process'))state(t,['waiting_for_restore_approval','restore_failed']);
   const transition=await change(req,target,t.revision,caller,task=>{const latest=task.rounds.at(-1);if(!latest||latest.roundId!==requestedRound)fail('ROUND_NOT_CURRENT',409);task.state='restoring';return null;});
   let completed:PrivateTask;
   try{const b=await readOriginal(r.objectId!);if(hash(b)!==r.sha256)fail('RESULT_HASH_MISMATCH',409);const result=await(r.format==='docx'?restoreDocx(b,t.mapping!):Promise.resolve(restoreMarkdown(b,t.mapping!))),object=randomUUID();await writeOriginal(object,result.output,t.projectId);
    if(lockLost)fail('RESTORE_LOCK_LOST',409);
    try{await lockClient.query('SELECT 1');}catch{lockLost=true;fail('RESTORE_LOCK_LOST',409);}
    completed=(await change(req,target,transition.task.revision,caller,async(task,db)=>{const x=task.rounds.at(-1);if(!x||x.roundId!==requestedRound)fail('ROUND_NOT_CURRENT',409);x.restoredArtifactId=object;x.replacementCount=result.stats.totalReplacements;x.residualTokenCount=result.residualTokens.length;if(x.residualTokenCount)fail('RESTORE_RESIDUAL_TOKENS',409);await rows(db,sql`INSERT INTO derived_restorations(id,tenant_id,project_id,owner_id,hash,format,source_name) VALUES(${object},${req.user.tenant_id},${task.projectId},${req.user.id},${hash(result.output)},${r.format},${seal(`restored.${r.format}`,`${req.user.tenant_id}:${task.projectId}:${object}:restoration-name`)})`);task.state='round_completed';task.failureCode=undefined;return externalTask(task);})).task;
   }catch(e){if(!lockLost)await change(req,target,transition.task.revision,caller,task=>{task.state='restore_failed';task.failureCode=/^[A-Z0-9_]{1,100}$/.test((e as Error).message)?(e as Error).message:'PROCESSING_FAILED';return null;}).catch(()=>{});throw e;}
   await lockClient.query('COMMIT');return completed;
  }catch(e){await lockClient.query('ROLLBACK').catch(()=>{});throw e;}
  finally{await lockClient.end().catch(()=>{});}
 }
 async function advancePendingInitial(req:FastifyRequest,t:PrivateTask,caller:Caller){
  const live=sessions.get(caller.sessionId);if(!live?.initialized||live.user!==req.user.id||live.tenant!==req.user.tenant_id||live.caller.adapterId!==caller.adapterId)return t;
  if(t.state==='waiting_for_human_review'&&t.pendingInitialDetection&&t.authorization?.allowRedactionPath&&!t.pendingResume&&t.caller.sessionId===caller.sessionId&&t.caller.adapterId===caller.adapterId){
   try{return (await change(req,t.jobId,t.revision,caller,async(task,db)=>{
    state(task,['waiting_for_human_review']);if(!task.pendingInitialDetection)return UNCHANGED;await requirePermission(db,task.projectId,['review','export']);
    const pending=task.pendingAttachedSourceIds?new Set(task.pendingAttachedSourceIds):undefined;
    for(const source of task.sources){if(pending&&!pending.has(source.documentId))continue;const[d]=await rows(db,sql`SELECT source_hash,content_hash FROM documents WHERE id=${source.documentId} AND project_id=${task.projectId}`);if(!d||d.source_hash!==source.hash&&d.content_hash!==source.hash)fail('SOURCE_CHANGED',409);
     const[initial]=await rows(db,sql`SELECT status FROM jobs WHERE document_id=${source.documentId} AND kind='detect' AND collab_task_id IS NULL ORDER BY created_at DESC LIMIT 1`);if(!initial)fail('INITIAL_DETECTION_MISSING',409);if(initial.status==='failed'||initial.status==='cancelled'){task.state='failed';task.failureCode='INITIAL_DETECTION_FAILED';delete task.pendingInitialDetection;delete task.pendingAttachedSourceIds;return null;}
    }
    const waiting=task.sources.filter(s=>!pending||pending.has(s.documentId));if(!waiting.length)fail('PENDING_SOURCE_MISSING',409);
    const active=await rows(db,sql`SELECT id FROM jobs WHERE document_id IN (${sql.join(waiting.map(s=>sql`${s.documentId}`),sql`,`)}) AND status IN ('queued','running') LIMIT 1`);if(active.length)return UNCHANGED;
    await queueAuthorizedRecognition(req,task,db,task.jobId,pending);delete task.pendingInitialDetection;delete task.pendingAttachedSourceIds;note(task,'initial_detection_completed');return null;
   })).task;}catch(error){if((error as Error).message==='JOB_ACTIVE')return t;if((error as Error).message==='VERSION_CONFLICT')return load(req,t.jobId,caller);throw error;}
  }
  return t;
 }
 async function continueAuthorizedInitialOnRead(req:FastifyRequest,t:PrivateTask){
  if(t.childJobIds&&!terminal.has(t.state)&&!t.pendingResume&&t.state!=='client_disconnected')return (await batchStatus(req,t,t.caller,true)).task;
  if(!t.pendingInitialDetection||t.pendingResume||t.state!=='waiting_for_human_review')return t;
  try{return await advancePendingInitial(req,t,t.caller);}catch(error){if((error as Error).message==='PERMISSION_DENIED')return t;throw error;}
 }
 async function advanceAutomatic(req:FastifyRequest,t:PrivateTask,caller:Caller){
  if(t.pendingInitialDetection)return advancePendingInitial(req,t,caller);
  if(t.executionMode!=='automatic'||!t.authorization?.allowRedactionPath||!t.authorization.allowSanitizedDelivery||t.pendingResume||t.caller.sessionId!==caller.sessionId||t.caller.adapterId!==caller.adapterId)return t;
  if(t.state==='waiting_for_human_review'&&t.sources.length){
   const jobs=t.recognitionJobIds??[];if(jobs.length!==t.sources.length)return t;
   const statuses=await scoped(req.user.id,req.user.tenant_id,db=>rows(db,sql`SELECT id,status FROM jobs WHERE id IN (${sql.join(jobs.map(value=>sql`${value}`),sql`,`)}) AND collab_task_id=${taskUUID(t.jobId)} AND kind='detect'`));
   if(statuses.length!==jobs.length)return t;
   if(statuses.some(j=>j.status==='failed'||j.status==='cancelled'))return (await change(req,t.jobId,t.revision,caller,task=>{state(task,['waiting_for_human_review']);task.state='failed';task.failureCode='RECOGNITION_INCOMPLETE';return null;})).task;
   if(statuses.every(j=>j.status==='succeeded'))return prepare(req,t.jobId,t.revision);
  }
  if(t.state==='building_sanitized_artifact'&&t.exportJobIds?.length===t.sources.length){
   const statuses=await scoped(req.user.id,req.user.tenant_id,db=>rows(db,sql`SELECT id,status FROM jobs WHERE id IN (${sql.join(t.exportJobIds!.map(value=>sql`${value}`),sql`,`)}) AND collab_task_id=${taskUUID(t.jobId)} AND kind='export'`));
   if(statuses.length!==t.exportJobIds.length)return t;
   if(statuses.every(j=>['succeeded','failed','cancelled'].includes(j.status))){
    const latest=await scoped(req.user.id,req.user.tenant_id,db=>rows(db,sql`SELECT id,revision FROM documents WHERE id IN (${sql.join(t.sources.map(s=>sql`${s.documentId}`),sql`,`)}) AND project_id=${t.projectId}`));
    if(t.sources.some(s=>latest.find(d=>d.id===s.documentId)?.revision>s.revision))return (await change(req,t.jobId,t.revision,caller,async(task,db)=>{
     state(task,['building_sanitized_artifact']);await requirePermission(db,task.projectId,['review','export']);
     for(const source of task.sources){const [d]=await rows(db,sql`SELECT revision FROM documents WHERE id=${source.documentId} AND project_id=${task.projectId} FOR UPDATE`);if(!d||d.revision<source.revision)fail('VERSION_CONFLICT',409);if(d.revision===source.revision)continue;
      const receipt=await resolveAutomaticReview(db,req,{taskId:taskUUID(task.jobId),documentId:source.documentId,expectedRevision:source.revision,expectedSourceHash:source.hash});source.revision=receipt.toRevision;(task.reviewResolutions??=[]).push(receipt);
     }task.exportJobIds=[];task.state='waiting_for_human_review';note(task,'automatic_review_refreshed');return null;
    })).task;
   }
   if(statuses.some(j=>j.status==='failed'||j.status==='cancelled'))return (await change(req,t.jobId,t.revision,caller,task=>{state(task,['building_sanitized_artifact']);task.state='failed';task.failureCode='SANITIZED_EXPORT_INCOMPLETE';return null;})).task;
   if(statuses.every(j=>j.status==='succeeded'))return release(req,t.jobId,t.revision);
  }
  return t;
 }
 async function sanitizedArtifactForTask(req:FastifyRequest,task:PrivateTask){
  const selected=task.deliveries.find(a=>a.role==='primary'&&a.format==='docx')??task.deliveries.find(markdownDelivery)??task.deliveries.find(visualDelivery);
  if(!selected)return undefined;
  const artifactId=deliveredArtifactId(selected);
  await scoped(req.user.id,req.user.tenant_id,db=>sourceForArchive(db,req,task,artifactId));
  const bytes=await artifactBytes(selected);
  return {artifactId,format:selected.format,mimeType:selected.format==='md'?'text/markdown':selected.format==='txt'?'text/plain':selected.format==='pdf'?'application/pdf':selected.format==='png'?'image/png':['jpg','jpeg'].includes(selected.format)?'image/jpeg':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',sha256:selected.hash,sizeBytes:bytes.length,restorable:!!task.mapping,...visualDelivery(selected)&&!task.deliveries.some(markdownDelivery)?{fallbackReason:'markdown_unavailable'}:{}};
 }
 async function batchStatus(req:FastifyRequest,parent:PrivateTask,caller:Caller,progress:boolean){
  for(let attempt=0;attempt<3;attempt++){
   try{return await batchStatusOnce(req,parent,caller,progress);}
   catch(error){
    if((error as Error).message!=='VERSION_CONFLICT'||attempt===2)throw error;
    const current=await load(req,parent.jobId,caller);
    if(current.projectId!==parent.projectId||JSON.stringify(current.childJobIds)!==JSON.stringify(parent.childJobIds)||JSON.stringify(current.authorization)!==JSON.stringify(parent.authorization)||current.sources.length!==parent.sources.length||current.sources.some((source,index)=>source.documentId!==parent.sources[index]!.documentId||source.hash!==parent.sources[index]!.hash))throw error;
    parent=current;
   }
  }
  fail('VERSION_CONFLICT',409);
 }
 async function batchStatusOnce(req:FastifyRequest,parent:PrivateTask,caller:Caller,progress:boolean){
  if(!parent.childJobIds)fail('BATCH_CHILD_BINDING_INVALID',409);
  const bound=await scoped(req.user.id,req.user.tenant_id,db=>batchChildren(db,req,parent));
  const children:PrivateTask[]=[];
  for(const {task} of bound){
   checkCaller(task,caller);
   const current=await load(req,task.jobId,caller);
   children.push(progress?await advanceAutomatic(req,current,caller):current);
  }
  const settled=children.every(child=>['sanitized_artifact_ready','analyzing_by_ai','ai_result_rejected','waiting_for_task_selection','waiting_for_restore_approval','round_completed','completed','failed','cancelled_by_user'].includes(child.state));
  const individualDeliveries=parent.options.batch_result_mode==='individual'?children.flatMap(child=>['sanitized_artifact_ready','analyzing_by_ai','ai_result_rejected','waiting_for_task_selection','waiting_for_restore_approval','round_completed','completed'].includes(child.state)?child.deliveries:[]):[];
  const currentSources=children.map(child=>child.sources[0]!);
  const currentResolutions=children.flatMap(child=>child.reviewResolutions??[]);
  const pendingInitial=children.some(child=>child.pendingInitialDetection===true);
  const recognitionIds=children.every(child=>child.recognitionJobIds?.length===1)?children.map(child=>child.recognitionJobIds![0]!):undefined;
  const exportIds=children.every(child=>child.exportJobIds?.length===1)?children.map(child=>child.exportJobIds![0]!):undefined;
  const needsProjection=JSON.stringify(parent.sources)!==JSON.stringify(currentSources)||JSON.stringify(parent.reviewResolutions??[])!==JSON.stringify(currentResolutions)||(parent.pendingInitialDetection===true)!==pendingInitial||JSON.stringify(parent.recognitionJobIds)!==JSON.stringify(recognitionIds)||JSON.stringify(parent.exportJobIds)!==JSON.stringify(exportIds)||parent.options.batch_result_mode==='individual'&&JSON.stringify(parent.deliveries)!==JSON.stringify(individualDeliveries);
  const canAdvance=['waiting_for_human_review','building_sanitized_artifact'].includes(parent.state);
  if((needsProjection&&!['cancelled_by_user','failed','client_disconnected'].includes(parent.state))||settled&&canAdvance){
   const successful=children.some(child=>!['failed','cancelled_by_user'].includes(child.state));
   const next=settled&&canAdvance?successful?(parent.options.batch_result_mode==='combined'?'building_sanitized_artifact':children.some(child=>child.state!=='completed')?'sanitized_artifact_ready':'completed'):'failed':parent.state;
   if(next!==parent.state||needsProjection)parent=(await change(req,parent.jobId,parent.revision,caller,async(task,db)=>{
    if(!task.childJobIds||JSON.stringify(task.childJobIds)!==JSON.stringify(parent.childJobIds))fail('BATCH_CHILD_BINDING_INVALID',409);
    const current=await batchChildren(db,req,task,true);
    if(current.some(({task:child},index)=>child.revision!==children[index]!.revision||child.state!==children[index]!.state))fail('VERSION_CONFLICT',409);
    if(['cancelled_by_user','failed','client_disconnected'].includes(task.state))fail('INVALID_STATE',409);
    task.state=next;
    task.sources=currentSources;task.reviewResolutions=currentResolutions;task.pendingInitialDetection=pendingInitial;task.recognitionJobIds=recognitionIds;task.exportJobIds=exportIds;
    if(task.options.batch_result_mode==='individual')task.deliveries=individualDeliveries;
    if(next==='failed')task.failureCode='BATCH_EXPORT_INCOMPLETE';
    return null;
   })).task;
  }
  if(parent.options.batch_result_mode==='combined'&&!parent.combined&&children.every(child=>['sanitized_artifact_ready','waiting_for_task_selection','completed','failed','cancelled_by_user'].includes(child.state))&&children.some(child=>['sanitized_artifact_ready','waiting_for_task_selection','completed'].includes(child.state)))parent=await finishCombinedParent(req,parent,children);
  const documents=[];
  for(const [index,child] of children.entries()){
   const artifactReady=['sanitized_artifact_ready','analyzing_by_ai','ai_result_rejected','waiting_for_task_selection','waiting_for_restore_approval','round_completed','completed'].includes(child.state);
   const sanitizedArtifact=artifactReady?await sanitizedArtifactForTask(req,child):undefined;
   documents.push({index:index+1,jobId:child.jobId,status:child.state,failureCode:child.failureCode,sanitizedExports:externalTask(child).sanitizedExports,sanitizedArtifact});
  }
  let sanitizedArtifact:any;
  if(parent.combined&&['sanitized_artifact_ready','analyzing_by_ai','ai_result_rejected','waiting_for_task_selection','waiting_for_restore_approval','round_completed','completed'].includes(parent.state)){
   const artifactId=`lba_${parent.combined.id.replaceAll('-','')}`;
   await scoped(req.user.id,req.user.tenant_id,db=>sourceForArchive(db,req,parent,artifactId));
   const bytes=await readOriginal(parent.combined.id);
   const attachments=[];
   for(const a of parent.deliveries.filter(a=>visualDelivery(a)&&!parent.deliveries.some(x=>x.documentId===a.documentId&&markdownDelivery(x)))){
    await scoped(req.user.id,req.user.tenant_id,db=>sourceForArchive(db,req,parent,deliveredArtifactId(a)));
    const data=await artifactBytes(a);
    attachments.push({artifactId:deliveredArtifactId(a),format:a.format,mimeType:a.format==='pdf'?'application/pdf':a.format==='png'?'image/png':'image/jpeg',sha256:a.hash,sizeBytes:data.length});
   }
   sanitizedArtifact={artifactId,safeDisplayName:'sanitized-report.md',format:'md',mimeType:'text/markdown',sha256:parent.combined.hash,sizeBytes:bytes.length,restorable:!!parent.mapping,...attachments.length?{attachments}:{}};
  }
  return {task:parent,documents,settled,sanitizedArtifact};
 }
 function receivableJob(status:Awaited<ReturnType<typeof batchStatus>>,requestedJobId:string,artifactId?:string){
  try{return resolveReceivableJob({...externalTask(status.task),redactionOptions:{executionMode:status.task.executionMode},documents:status.documents,sanitizedArtifact:status.sanitizedArtifact},requestedJobId,artifactId);}
  catch(error){
   const message=(error as Error).message;
   if(message.startsWith('这是批量任务：'))fail('BATCH_CHILD_JOB_REQUIRED',409);
   if(message.startsWith('这是批量父任务，'))fail('BATCH_ARTIFACT_NOT_RECEIVABLE',409);
   if(message.startsWith('全自动模式仍在后台导出'))fail('AUTOMATIC_DELIVERY_PENDING',409);
   if(message.startsWith('交换件编号已变化'))fail('ARTIFACT_MISMATCH',409);
   throw error;
  }
 }
 async function wait(req:FastifyRequest,target:string,args:Record<string,any>,caller:Caller,restoration=false){let t=await load(req,target,caller);const expectedRound=restoration&&args.round_id?round.parse(args.round_id):undefined;const checkRound=()=>{if(expectedRound&&t.rounds.at(-1)?.roundId!==expectedRound)fail('SLOT_NOT_AVAILABLE',409);};checkRound();const end=Date.now()+Math.min(45,args.wait_seconds??45)*1000,initial=args.after_updated_at??t.updatedAt;
  if(t.childJobIds&&restoration&&!t.combined)fail('BATCH_CHILD_JOB_REQUIRED',409);
  if(t.childJobIds&&!restoration){let current=await batchStatus(req,t,caller,true);while(Date.now()<end&&!current.settled&&current.task.updatedAt===initial){await new Promise(r=>setTimeout(r,500));current=await batchStatus(req,await load(req,target,caller),caller,true);}const timedOut=!current.settled&&Date.now()>=end,notice=await taskRecognitionNotice(req,current.task),projection=reviewDeliveryProjection({state:current.task.state,executionMode:current.task.executionMode??'human_review',timedOut,statistics:(notice as any).statistics,documents:current.documents.map(document=>({status:document.status,visualFallback:!!document.sanitizedArtifact?.fallbackReason})),userMessage:(notice as any).userMessage,instructions:(notice as any).instructions});return {...externalTask(current.task),redactionOptions:{executionMode:current.task.executionMode,batchResultMode:current.task.options.batch_result_mode},documents:current.documents,...current.sanitizedArtifact?{sanitizedArtifact:current.sanitizedArtifact}:{},...notice,...projection,timedOut,...!current.settled?{retryAfterSeconds:2}:{}};}
  if(!restoration)t=await advanceAutomatic(req,t,caller);
  while(Date.now()<end&&!terminal.has(t.state)&&!(restoration?['round_completed','restore_failed','ai_result_rejected']:['sanitized_artifact_ready','analyzing_by_ai','ai_result_rejected','round_completed','waiting_for_restore_approval']).includes(t.state)&&t.updatedAt===initial){await new Promise(r=>setTimeout(r,500));t=await load(req,target,caller);if(!restoration)t=await advanceAutomatic(req,t,caller);checkRound();}const ready=(restoration?['round_completed','restore_failed','ai_result_rejected']:['sanitized_artifact_ready','analyzing_by_ai','ai_result_rejected','round_completed','waiting_for_restore_approval']).includes(t.state)||terminal.has(t.state),timedOut=Date.now()>=end&&!ready&&t.updatedAt===initial;const detection=await scoped(req.user.id,req.user.tenant_id,db=>taskDetectionView(db,req,t)),sanitizedArtifact=!restoration?await sanitizedArtifactForTask(req,t):undefined,notice=restoration?{}:await taskRecognitionNotice(req,t),projection=restoration?{}:reviewDeliveryProjection({state:t.state,executionMode:t.executionMode??'human_review',timedOut,statistics:(notice as any).statistics,documents:await taskDeliveryDocuments(req,t),userMessage:(notice as any).userMessage,instructions:(notice as any).instructions});return {...externalTask(t),...detection,...sanitizedArtifact?{sanitizedArtifact}:{},...notice,...projection,timedOut,...timedOut?{retryAfterSeconds:2}:{}};
 }
 async function callTool(req:FastifyRequest,name:string,a:Record<string,any>,caller:Caller):Promise<any>{
  if(name!=='resume_lawbot_task'&&typeof a.job_id==='string')a={...a,job_id:await toolJob(req,a.job_id,caller)};
  if(name==='get_lawbot_capabilities')return {
   interfaces:['review','file','restore','configuration'],
   reviewModes:['automatic','human_review'],
   inputFormats:['docx','doc','wps','md','markdown','pdf','jpg','jpeg','png'],
   taskModes:['redact_only','ai_process','ai_process_restore'],
   safetyBoundary:'MCP returns only approved sanitized artifacts. It does not return originals, mappings, or restored outputs, and cannot restrict an external AI assistant own shell or filesystem tools.',
   documentTypes:['auto','general','contract','disclosure','judgment','pleading','official_letter','screenshot'],
   maskingModes:['pseudonym','default_mask','full_star','purple_overlay'],
   outputFormats:['original','md'],
   batch:{maxFiles:100,unifiedPseudonyms:true},
   file:{defaults:'project_redaction_policy',outputOverride:'none_browser_managed',archiveValidatedAiResult:true,archiveLocation:'private_cloud_project',validatedResultStorage:'private_cloud_project_archive_downloadable',sourceReference:'document:<uploaded document UUID>'},
   product:'tuominwang',protocolVersion:MCP_PROTOCOL,tools:12,gatewayMethods:[...gatewayMethods],secureReview:true,restoration:true,cloudUploadRequired:true,externalProvider:'not_configured',autoInvokeExternalAI:false,formats:['docx','md'],osConnectors:{dsh:'configuration_only',workbuddy:'configuration_only',qwenwork:'configuration_only'}
  };
  if(name==='list_lawbot_saved_settings'){
   const p=(await internal(req,'GET','/api/presets/profiles')).json(),r=(await internal(req,'GET','/api/presets/rulesets')).json();
   const label=(value:unknown)=>[...String(value)].filter(ch=>ch.charCodeAt(0)>=32).join('').slice(0,120);
   return {profiles:p.items.slice(0,200).map((x:any)=>({id:String(x.settings.id).slice(0,120),name:label(x.settings.name),revision:x.revision,readonly:x.settings.readonly})),
    ruleSets:r.items.slice(0,200).map((x:any)=>({id:String(x.settings.id).slice(0,120),name:label(x.settings.name),revision:x.revision})),
    instructions:'仅提供已保存设置的标识和名称，不提供黑白名单内容、文件路径或密码。使用用户指定的准确名称或标识；找不到时告知用户，不得猜测替代。',
    defaults:{defaultProfileId:p.preferences.settings.defaultProfileId,activeRuleSetId:p.preferences.settings.activeRuleSetId}};
  }
  if(name==='start_lawbot_redaction'||name==='start_lawbot_redaction_for_user_manual_review')return start(req,a,caller,name.endsWith('_for_user_manual_review'));
  if(name==='resume_lawbot_task'){
  const visible=a.job_id?undefined:await scan(req);if(visible?.recoveryRequired)fail('TASK_STORAGE_RECOVERY_REQUIRED',409);const t=a.job_id?await load(req,a.job_id):implicitResumeTask(visible!.items.filter(item=>!item.parentJobId));if(!t)fail('TASK_NOT_FOUND',404);if(t.parentJobId)fail('BATCH_PARENT_JOB_REQUIRED',409);
  if(t.resumeSourceJobId){checkCaller(t,caller);if(t.resumedJobId)return externalTask(await load(req,t.resumedJobId,caller));if(t.state==='waiting_for_session_authorization')return {...externalTask(t),resumeRequested:true};fail('RESUME_NOT_AVAILABLE',409);}
  if(t.childJobIds){
   if(!canResumeBatchDelivery(t)||['cancelled_by_user','failed','restoring'].includes(t.state))fail('RESUME_NOT_AVAILABLE',409);
   const requested=await scoped(req.user.id,req.user.tenant_id,async db=>{
    const [project]=await rows(db,sql`SELECT id FROM projects WHERE id=${t.projectId} FOR UPDATE`);if(!project)fail('NOT_FOUND',404);await requirePermission(db,t.projectId,['view_original']);
    const [sourceRow]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${taskUUID(t.jobId)} FOR UPDATE`);if(!sourceRow||sourceRow.owner_id!==req.user.id||sourceRow.tenant_id!==req.user.tenant_id||sourceRow.project_id!==t.projectId)fail('RESUME_NOT_AVAILABLE',409);
    const [quarantine]=await rows(db,sql`SELECT q.receipt_id FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${sourceRow.id} AND r.receipt_id IS NULL`);if(quarantine)fail('TASK_QUARANTINED',409);
    const source=privateRead(sourceRow,req);if(!canResumeBatchDelivery(source)||['cancelled_by_user','failed','restoring'].includes(source.state))fail('RESUME_NOT_AVAILABLE',409);
    for(const row of await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE project_id=${t.projectId} ORDER BY created_at DESC`)){let pending:PrivateTask;try{pending=privateRead(row,req);}catch(error){unreadable(error);continue;}if(pending.resumeSourceJobId===source.jobId&&pending.caller.sessionId===caller.sessionId&&pending.caller.adapterId===caller.adapterId&&pending.state==='waiting_for_session_authorization')return pending;}
    const now=new Date().toISOString(),request:PrivateTask={jobId:newOpaqueId('lbj'),revision:1,projectId:source.projectId,state:'waiting_for_session_authorization',executionMode:source.executionMode,caller,options:{...source.options},sources:[],deliveries:[],rounds:[],resumeSourceJobId:source.jobId,createdAt:now,updatedAt:now};
    const requestId=taskUUID(request.jobId),payload=seal(JSON.stringify(request),aad(req,requestId));await rows(db,sql`INSERT INTO ai_collab_tasks(id,tenant_id,owner_id,project_id,revision,payload) VALUES(${requestId},${req.user.tenant_id},${req.user.id},${source.projectId},1,${payload})`);await saveSnapshot(db,{id:requestId,tenant_id:req.user.tenant_id,owner_id:req.user.id,project_id:source.projectId},1,payload);return request;
   });
   return {...externalTask(requested),resumeSourceJobId:requested.resumeSourceJobId,resumeRequested:true};
  }
  if(terminal.has(t.state))fail('INVALID_STATE',409);if((t.pendingResume||t.state==='client_disconnected')&&!validResumeState(t.resumeState))fail('RESUME_STATE_UNAVAILABLE',409);
  if(!t.pendingResume&&t.previousCaller&&t.authorization&&t.caller.sessionId===caller.sessionId&&t.caller.adapterId===caller.adapterId&&!['waiting_for_session_authorization','client_disconnected'].includes(t.state))return {...externalTask(t),resumeRequested:true};
  const samePending=(task:PrivateTask)=>task.pendingResume?.sessionId===caller.sessionId&&task.pendingResume.adapterId===caller.adapterId;
  if(samePending(t)&&t.state==='waiting_for_session_authorization')return {...externalTask(t),resumeRequested:true};
  const update=await change(req,t.jobId,undefined,undefined,task=>{
   if(!task.pendingResume&&task.previousCaller&&task.authorization&&task.caller.sessionId===caller.sessionId&&task.caller.adapterId===caller.adapterId&&!['waiting_for_session_authorization','client_disconnected'].includes(task.state))return UNCHANGED;
   if(terminal.has(task.state))fail('INVALID_STATE',409);
   if((task.pendingResume||task.state==='client_disconnected')&&!validResumeState(task.resumeState))fail('RESUME_STATE_UNAVAILABLE',409);
   if(samePending(task)&&task.state==='waiting_for_session_authorization')return UNCHANGED;
   if(!task.pendingResume&&task.state!=='client_disconnected')task.resumeState=task.state;
   task.pendingResume=caller;task.state='waiting_for_session_authorization';note(task,'resume_requested');return null;
  });
  return {...externalTask(update.task),resumeRequested:true};
 }
  if(name==='start_lawbot_restoration'){if(!a.job_id){if(!a.source_path)fail('UPLOAD_RESTORATION_RESULT_REQUIRED',400);return start(req,{project_id:a.project_id,source_path:a.source_path,task_mode:'ai_process_restore',output_formats:['original'],standaloneRestoration:true},caller);}if(a.source_path)fail('RESTORATION_SOURCE_MISMATCH',400);if(!a.round_id)fail('ROUND_REQUIRED',400);const t=await load(req,a.job_id,caller),restored=await restore(req,t.jobId,t.revision,a.round_id,caller);return {...externalTask(restored),restorationStarted:true,nextAction:'check_restore_completion'};}
  if(name==='check_document_delivery')return wait(req,a.job_id,a,caller);
  if(name==='receive_sanitized_document'){
   const task=await load(req,a.job_id,caller);
   if(task.childJobIds){const status=await batchStatus(req,task,caller,true),selected=receivableJob(status,task.jobId,a.artifact_id);return delivery(req,selected,a,caller);}
   const sanitizedArtifact=await sanitizedArtifactForTask(req,task),selected=receivableJob({task,documents:[],settled:true,sanitizedArtifact},task.jobId,a.artifact_id);
   return delivery(req,selected,a,caller);
  }
  if(name==='submit_reviewed_document')return submit(req,a.job_id,a,caller);
  if(name==='open_lawbot_restore'){const t=await load(req,a.job_id,caller),restored=await restore(req,t.jobId,t.revision,a.round_id,caller);return {...externalTask(restored),restorationStarted:true,nextAction:'check_restore_completion',reviewUrl:`?collab=${t.jobId}`};}
  if(name==='continue_current_document_review'){const t=await load(req,a.job_id,caller);const updated=await change(req,t.jobId,t.revision,caller,task=>{state(task,['round_completed','sanitized_artifact_ready']);if(!task.deliveries.length&&!task.combined)fail('ARTIFACT_NOT_AVAILABLE',409);if(task.state==='sanitized_artifact_ready')return UNCHANGED;task.state='sanitized_artifact_ready';return null;});return externalTask(updated.task);}
  if(name==='check_restore_completion')return wait(req,a.job_id,a,caller,true);
  fail('MCP_UNKNOWN_TOOL',400);
 }
 app.post('/api/mcp',{bodyLimit:32*1024*1024},async(req,reply)=>{
  const message=req.body as any;let token=typeof req.headers['mcp-session-id']==='string'?req.headers['mcp-session-id']:undefined,session=token?sessions.get(token):undefined;
  if(message?.method==='initialize'){token=randomBytes(32).toString('hex');const client=String(message.params?.clientInfo?.name??'unknown'),adapter=['dsh','workbuddy','qwenwork','codex','claude','cursor'].find(x=>client.toLowerCase().includes(x))??'unknown';session={caller:{sessionId:token,adapterId:adapter,displayName:adapter==='unknown'?'MCP 客户端':adapter},user:req.user.id,tenant:req.user.tenant_id,initialized:false,protocol:negotiateMcpProtocol(message.params?.protocolVersion)};sessions.set(token,session);reply.header('Mcp-Session-Id',token);}
  if(session&&(session.user!==req.user.id||session.tenant!==req.user.tenant_id))fail('MCP_SESSION_FORBIDDEN',403);
  if(session&&message?.method!=='initialize'&&req.headers['mcp-protocol-version']!==session.protocol)fail('MCP_PROTOCOL_VERSION_REQUIRED',400);
  const result=await mcpDispatch(message,session,(name,a,caller)=>observedTool(req,name,a,caller,()=>callTool(req,name,a,caller)));if(result===null)return reply.code(202).send();return result;
 });
 app.get('/api/mcp',async(_req,reply)=>reply.header('Allow','POST, DELETE').code(405).send({error:'MCP_STREAMING_NOT_SUPPORTED'}));
 app.delete('/api/mcp',async req=>{
  const token=String(req.headers['mcp-session-id']??''),s=sessions.get(token);
  if(!s||s.user!==req.user.id||s.tenant!==req.user.tenant_id)fail('MCP_SESSION_NOT_FOUND',404);
  sessions.delete(token);
  for(const snapshot of await list(req)){
   if(snapshot.parentJobId)continue;
   if(snapshot.caller.sessionId!==token&&snapshot.pendingResume?.sessionId!==token)continue;
   await change(req,snapshot.jobId,undefined,undefined,async(t,db)=>{
    for(const {row,task:child} of await batchChildren(db,req,t,true)){
     if(terminal.has(child.state)||['restoring','round_completed','client_disconnected'].includes(child.state))continue;
     if(child.pendingResume?.sessionId===token){delete child.pendingResume;if(sessions.has(child.caller.sessionId)&&validResumeState(child.resumeState)){child.state=child.resumeState!;delete child.resumeState;}else child.state='client_disconnected';await saveChild(db,req,row,child,'pending_session_disconnected');continue;}
     if(child.caller.sessionId!==token||child.pendingResume)continue;
     if(!child.resumeState||child.resumeState==='client_disconnected')child.resumeState=child.state;
     child.state='client_disconnected';await saveChild(db,req,row,child,'session_disconnected');
    }
    if(terminal.has(t.state))return UNCHANGED;
    if(t.pendingResume?.sessionId===token){
     // Closing the unapproved replacement never transfers authority to it.
     delete t.pendingResume;
     if(sessions.has(t.caller.sessionId)&&validResumeState(t.resumeState)){t.state=t.resumeState!;delete t.resumeState;}
     else t.state='client_disconnected';
     note(t,'pending_session_disconnected');return null;
    }
    if(t.caller.sessionId!==token||t.pendingResume||['restoring','round_completed','client_disconnected'].includes(t.state))return UNCHANGED;
    if(!t.resumeState||t.resumeState==='client_disconnected')t.resumeState=t.state;
    t.state='client_disconnected';note(t,'session_disconnected');return null;
   });
  }
  return {closed:true};
 });
 app.get('/api/ai-collab/tasks',async(req,reply)=>{reply.header('Cache-Control','no-store');const found=await scan(req),updated:PrivateTask[]=[];for(const t of found.items.filter(item=>!item.parentJobId))updated.push(await continueAuthorizedInitialOnRead(req,t));const items=await scoped(req.user.id,req.user.tenant_id,async db=>{const displayed=[];for(const t of updated)displayed.push({...humanTask(t),...await taskDetectionView(db,req,t)});return displayed;});return {...found,items};});
 app.post('/api/ai-collab/tasks/:job/quarantine',async req=>{const a=z.object({revision:rev,payloadSha256:sha,requestId:id,confirm:z.literal(true)}).strict().parse(req.body);return isolateTask(req,job.parse((req.params as any).job),a);});
 app.get('/api/ai-collab/storage-status',async req=>{const found=await scan(req);return {recoveryRequired:found.recoveryRequired,complete:found.complete,issues:found.issues,isolated:found.isolated,healthyCount:found.items.length};});
 app.get('/api/ai-collab/quarantine/:receipt',async req=>{const receipt=id.parse((req.params as any).receipt);return scoped(req.user.id,req.user.tenant_id,async db=>{
  const [q]=await rows(db,sql`SELECT * FROM ai_collab_task_quarantine WHERE receipt_id=${receipt}`);if(!q)fail('NOT_FOUND',404);
  const [p]=await rows(db,sql`SELECT id FROM projects WHERE id=${q.project_id} FOR SHARE`);if(!p)fail('NOT_FOUND',404);await requirePermission(db,p.id,['view_original']);
  const [recovered]=await rows(db,sql`SELECT to_revision,recovered_at FROM ai_collab_task_recovery WHERE receipt_id=${receipt}`);
  const [row]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${q.task_id}`);
  const candidate=!recovered&&row?await recoveryCandidate(db,req,row,q):undefined;
  return {receiptId:q.receipt_id,jobId:`lbj_${q.task_id.replaceAll('-','')}`,projectId:q.project_id,revision:q.task_revision,payloadSha256:q.payload_sha256,status:recovered?'recovered':'isolated',failureCode:q.failure_code,confirmedAt:q.confirmed_at,recoveryAvailable:!!candidate,...candidate?{snapshotSha256:candidate.snapshot.payload_sha256}:{}};
 });});
 app.post('/api/ai-collab/quarantine/:receipt/recover',async req=>{const a=z.object({revision:rev,snapshotSha256:sha,requestId:id,confirm:z.literal(true)}).strict().parse(req.body);return recoverTask(req,id.parse((req.params as any).receipt),a);});
 app.get('/api/ai-collab/tasks/:job',async(req,reply)=>{reply.header('Cache-Control','no-store');const target=job.parse((req.params as any).job);try{const t=await continueAuthorizedInitialOnRead(req,await load(req,target)),detection=await scoped(req.user.id,req.user.tenant_id,db=>taskDetectionView(db,req,t));return {...humanTask(t),...detection};}catch(error){if((error as Error).message!=='TASK_QUARANTINED')throw error;const [q]=await scoped(req.user.id,req.user.tenant_id,db=>rows(db,sql`SELECT q.receipt_id FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${taskUUID(target)} AND r.receipt_id IS NULL`));return reply.code(409).send({error:'TASK_QUARANTINED',receiptId:q?.receipt_id});}});
 async function archiveAccess(req:FastifyRequest,db:DB,target:string){
  const taskId=taskUUID(job.parse(target)),[row]=await rows(db,sql`SELECT * FROM ai_collab_tasks WHERE id=${taskId}`);if(!row)fail('NOT_FOUND',404);
  const [p]=await rows(db,sql`SELECT id FROM projects WHERE id=${row.project_id} FOR SHARE`);if(!p)fail('NOT_FOUND',404);await requirePermission(db,p.id,['view_original','review']);
  const [q]=await rows(db,sql`SELECT q.receipt_id FROM ai_collab_task_quarantine q LEFT JOIN ai_collab_task_recovery r ON r.receipt_id=q.receipt_id WHERE q.task_id=${taskId} AND r.receipt_id IS NULL`);
  let task:PrivateTask|undefined;
  if(!q){try{task=privateRead(row,req);}catch(error){if((error as Error).message!=='TASK_STORAGE_INVALID')throw error;}}
  if(task?.options.standaloneRestoration)fail('RESULT_NOT_FOUND',404);
  return {task,scope:{tenantId:req.user.tenant_id,projectId:row.project_id,ownerId:req.user.id,taskId} as AiResultArchiveScope};
 }
 app.get('/api/ai-collab/tasks/:job/archives',async req=>scoped(req.user.id,req.user.tenant_id,async db=>{const {scope}=await archiveAccess(req,db,(req.params as any).job);return {items:await listAiResultArchives(db,scope)};}));
 app.get('/api/ai-collab/tasks/:job/archives/:round/download',async(req,reply)=>{const result=await scoped(req.user.id,req.user.tenant_id,async db=>{
  const {task,scope}=await archiveAccess(req,db,(req.params as any).job),roundId=round.parse((req.params as any).round),archive=await readAiResultArchive(db,scope,roundId);
  if(!archive)fail('RESULT_NOT_FOUND',404);const m=archive.metadata;
  if(task){const r=task.rounds.find(x=>x.roundId===roundId);if(!r?.validated||r.slotId!==m.slotId||r.artifactId!==m.sourceArtifactId||r.objectId!==m.resultObjectId||r.sha256!==m.resultSha256||r.format!==m.format||r.resultKind!==m.resultKind||r.suggestedName!==m.fileName)fail('AI_RESULT_ARCHIVE_CONFLICT',409);}
  const bytes=await readOriginal(m.resultObjectId);if(hash(bytes)!==m.resultSha256)fail('RESULT_HASH_MISMATCH',409);return {bytes,metadata:m};
 });return reply.type(result.metadata.format==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'text/markdown; charset=utf-8').header('Content-Disposition',`attachment; filename="archive.${result.metadata.format}"; filename*=UTF-8''${encodeURIComponent(result.metadata.fileName)}`).send(result.bytes);});
 app.post('/api/ai-collab/tasks/:job/authorize',async req=>{const a=z.object({revision:rev,authorization}).strict().parse(req.body);return humanTask(await authorize(req,job.parse((req.params as any).job),a.revision,a.authorization));});
 app.post('/api/ai-collab/tasks/:job/attach-sources',async req=>{const a=z.object({revision:rev,documentIds:z.array(id).min(1).max(100)}).strict().parse(req.body);return humanTask(await attach(req,job.parse((req.params as any).job),a.revision,a.documentIds));});
 app.post('/api/ai-collab/tasks/:job/prepare-export',async req=>{const a=z.object({revision:rev}).strict().parse(req.body);return humanTask(await prepare(req,job.parse((req.params as any).job),a.revision));});
 app.post('/api/ai-collab/tasks/:job/release-export',async req=>{const a=z.object({revision:rev}).strict().parse(req.body);return humanTask(await release(req,job.parse((req.params as any).job),a.revision));});
 app.put('/api/ai-collab/tasks/:job/slots/:slot',{bodyLimit:32*1024*1024},async req=>{const a=z.object({bytesBase64:bytesSchema}).strict().parse(req.body);return storeResult(req,job.parse((req.params as any).job),slot.parse((req.params as any).slot),decode(a.bytesBase64));});
 app.post('/api/ai-collab/tasks/:job/review-result',async req=>{const a=z.object({revision:rev,roundId:round,approved:z.literal(true)}).strict().parse(req.body),target=job.parse((req.params as any).job);const approved=(await change(req,target,a.revision,undefined,async(t,db)=>{await requirePermission(db,t.projectId,['review']);state(t,['waiting_for_restore_approval']);const r=t.rounds.at(-1);if(!r||r.roundId!==a.roundId)fail('ROUND_NOT_CURRENT',409);if(!r.validated)fail('RESULT_NOT_VALIDATED',409);r.reviewed=true;if(t.options.task_mode==='ai_process')t.state='round_completed';return externalTask(t);})).task;
  if(approved.authorization?.autoRestoreAfterValidation&&approved.options.task_mode==='ai_process_restore')return humanTask(await restore(req,target,approved.revision,a.roundId));return humanTask(approved);
 });
 app.get('/api/ai-collab/tasks/:job/results/:round',async(req,reply)=>{
  const target=job.parse((req.params as any).job),roundId=round.parse((req.params as any).round);
  let result:{bytes:Buffer;format:'docx'|'md'};
  try{const t=await load(req,target),r=t.rounds.find(x=>x.roundId===roundId);if(!r?.objectId)fail('RESULT_NOT_FOUND',404);await scoped(req.user.id,req.user.tenant_id,db=>requirePermission(db,t.projectId,[t.options.standaloneRestoration?'restore':'review']));const bytes=await readOriginal(r.objectId);if(hash(bytes)!==r.sha256)fail('RESULT_HASH_MISMATCH',409);result={bytes,format:r.format};}
  catch(error){if(!['TASK_QUARANTINED','TASK_STORAGE_INVALID'].includes((error as Error).message))throw error;
   result=await scoped(req.user.id,req.user.tenant_id,async db=>{const {task,scope}=await archiveAccess(req,db,target);if(task)fail('TASK_STORAGE_INVALID',409);const archive=await readAiResultArchive(db,scope,roundId);if(!archive)fail('RESULT_NOT_FOUND',404);const bytes=await readOriginal(archive.metadata.resultObjectId);if(hash(bytes)!==archive.metadata.resultSha256)fail('RESULT_HASH_MISMATCH',409);return {bytes,format:archive.metadata.format};});
  }
  return reply.type(result.format==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'text/markdown; charset=utf-8').header('Content-Disposition',`attachment; filename="reviewed.${result.format}"`).send(result.bytes);
 });
 app.post('/api/ai-collab/tasks/:job/authorize-restoration',async req=>{const a=z.object({revision:rev,allowRestorePath:z.literal(true)}).strict().parse(req.body),target=job.parse((req.params as any).job);const approved=(await change(req,target,a.revision,undefined,async(t,db)=>{state(t,['waiting_for_restore_approval','round_completed']);const latest=t.rounds.at(-1);if(t.state==='round_completed'&&(t.options.task_mode!=='ai_process'||!latest?.validated||!latest.reviewed||latest.restoredArtifactId))fail('INVALID_STATE',409);await requirePermission(db,t.projectId,['restore','view_mapping']);if(!t.mappingReferences?.length)fail('RESTORE_NO_TOKENS',409);const records=(await getProjectMappingRows(db,t.projectId,{historical:true})).filter(m=>t.mappingReferences!.some(r=>r.id===m.id&&r.token===m.token&&(r.version??1)===m.version));if(records.length!==t.mappingReferences.length)fail('DELIVERED_MAPPING_MISSING',409);t.mapping=snapshotMapping(records,t.projectId);if(!t.authorization)fail('AUTHORIZATION_REQUIRED',409);t.authorization.allowRestorePath=true;return externalTask(t);})).task;return humanTask(approved);});
 app.post('/api/ai-collab/tasks/:job/restore',async req=>{const a=z.object({revision:rev,roundId:round}).strict().parse(req.body);return humanTask(await restore(req,job.parse((req.params as any).job),a.revision,a.roundId));});
 app.post('/api/ai-collab/tasks/:job/action',async req=>{
  const a=z.object({revision:rev,method:z.enum(collaborationMethods),roundId:round.optional(),documentIds:z.array(id).min(1).max(100).optional(),authorization:authorization.optional(),intent:z.record(z.string(),z.unknown()).optional(),failureCode:z.string().regex(/^[A-Z0-9_]{1,100}$/).optional(),statistics:z.record(z.string().regex(/^[a-zA-Z_]{1,40}$/),z.number().int().nonnegative()).optional(),event:z.enum(['started','succeeded','failed','waiting','cancelled','retry','fallback','recovered']).optional()}).strict().parse(req.body),target=job.parse((req.params as any).job);
  if(a.method==='attach-source'||a.method==='attach-sources'){if(!a.documentIds)fail('SOURCE_REQUIRED',400);return humanTask(await attach(req,target,a.revision,a.documentIds));}
  if(a.method==='authorize'){if(!a.authorization)fail('AUTHORIZATION_REQUIRED',400);return humanTask(await authorize(req,target,a.revision,a.authorization));}
  if(a.method==='prepare-export')return humanTask(await prepare(req,target,a.revision));
  if(a.method==='release-export'||a.method==='finish-batch-export')return humanTask(await release(req,target,a.revision));
  if(a.method==='restart-preparation'){
   const changed=await change(req,target,a.revision,undefined,async(prior,db)=>{
    if(prior.state!=='failed')fail('INVALID_STATE',409);
    if(prior.parentJobId)fail('BATCH_PARENT_JOB_REQUIRED',409);
    const children=prior.childJobIds?await batchChildren(db,req,prior,true):[];
    const failed=(children.length?children.map(x=>x.task):[prior]).filter(task=>task.state==='failed'),documentIds=[...new Set(failed.flatMap(task=>task.sources.map(source=>source.documentId)))];
    if(!documentIds.length)fail('SOURCE_NOT_FOUND',404);
    const options={...prior.options};delete options.source_path;delete options.source_paths;delete options.document_ids;delete options.request_id;delete options.manualReview;delete options.use_profile_mode_default;delete options.output_formats_explicit;
    if(prior.options.output_formats_explicit!==true)delete options.output_formats;
    if(prior.options.use_profile_mode_default===true)delete options.masking_mode;
    options.file_settings=(prior.options.file_settings??[]).filter((file:any)=>documentIds.includes(String(file.source_path??'').replace(/^document:/u,'')));
    const h=hash(`restart:${prior.jobId}:${prior.revision}`),requestId=`${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
    const replacement=await start(req,{...options,project_id:prior.projectId,document_ids:documentIds,request_id:requestId},prior.caller,prior.executionMode==='human_review',db);
    prior.resumedJobId=replacement.jobId;
    return {...replacement,resumedFromJobId:prior.jobId};
   });
   return changed.result;
  }
  if(a.method==='retry-restore'||a.method==='resume-local-restore'){if(!a.roundId)fail('ROUND_REQUIRED',400);return humanTask(await restore(req,target,a.revision,a.roundId));}
  if(a.method==='change-restore-directory')fail('CLOUD_DIRECTORY_OVERRIDE_UNSUPPORTED',400);
  if(a.method==='list-pending'){await load(req,target);const found=await scan(req);return {items:found.items.filter(t=>!t.parentJobId&&!terminal.has(t.state)).map(humanTask),recoveryRequired:found.recoveryRequired,complete:found.complete,issues:found.issues,isolatedCount:found.isolated.length};}
  if(a.method==='repair-task-storage'){
   const diagnostics=await scoped(req.user.id,req.user.tenant_id,async db=>{const records=await rows(db,sql`SELECT * FROM ai_collab_tasks ORDER BY id`);return records.map(r=>{try{privateRead(r,req);return {id:`lbj_${r.id.replaceAll('-','')}`,valid:true};}catch{return {id:`lbj_${r.id.replaceAll('-','')}`,valid:false,error:'TASK_STORAGE_INVALID'};}});});
   return {checked:diagnostics.length,valid:diagnostics.every(x=>x.valid),diagnostics,repairPerformed:false,backupRequired:diagnostics.some(x=>!x.valid)};
  }
  const changed=(await change(req,target,a.revision,undefined,async(t,db)=>{
   if(a.method==='cancel'){if(t.state==='restoring')fail('RESTORATION_IN_PROGRESS',409);if(['completed','round_completed','cancelled_by_user'].includes(t.state))fail('INVALID_STATE',409);
    const children=await batchChildren(db,req,t,true);
    for(const {row,task:child} of children)if(!terminal.has(child.state)&&child.state!=='round_completed'&&child.state!=='restoring'){
     await cancelOwnedJobs(db,child.jobId);child.state='cancelled_by_user';delete child.pendingInitialDetection;delete child.pendingAttachedSourceIds;await saveChild(db,req,row,child,'cancelled');
    }
    await cancelOwnedJobs(db,target);t.state='cancelled_by_user';delete t.pendingInitialDetection;delete t.pendingAttachedSourceIds;note(t,'cancelled');}
   else if(a.method==='fail'){if(!a.failureCode)fail('FAILURE_CODE_REQUIRED',400);if(t.state==='restoring')fail('RESTORATION_IN_PROGRESS',409);if(['completed','round_completed','cancelled_by_user'].includes(t.state))fail('INVALID_STATE',409);
    await cancelOwnedJobs(db,target);t.state='failed';delete t.pendingInitialDetection;delete t.pendingAttachedSourceIds;t.failureCode=a.failureCode;}
   else if(a.method==='restart-preparation'){state(t,['failed','building_sanitized_artifact','ai_result_rejected']);t.state='waiting_for_human_review';t.failureCode=undefined;t.deliveries=[];delete t.combined;}
   else if(a.method==='retry-authorization'){state(t,['client_disconnected','failed','waiting_for_session_authorization']);t.state='waiting_for_session_authorization';t.authorization=undefined;}
   else if(a.method==='retry-confirmation'){state(t,['waiting_for_restore_approval','restore_failed','round_completed']);const r=t.rounds.at(-1);if(!r||r.roundId!==a.roundId)fail('ROUND_NOT_CURRENT',409);if(!r.validated)fail('RESULT_NOT_VALIDATED',409);if(r.restoredArtifactId)fail('RESTORATION_ALREADY_COMPLETED',409);r.reviewed=false;t.state='waiting_for_restore_approval';}
   else if(a.method==='set-review-intent'){if(!a.intent)fail('REVIEW_INTENT_REQUIRED',400);const checked=z.object({goals:z.array(z.enum(['contract_review','document_comparison','proofreading','summary','clause_revision','relation_extraction','timeline','redaction','restoration','other'])).max(10),perspective:z.enum(['party_a','party_b','neutral']).optional(),outputKinds:z.array(z.enum(['redline','comments','risk_report','negotiation_notes','structured_data','clean_copy','summary','comparison'])).max(8).optional(),outputFormat:z.enum(['docx','md']).optional(),restorationRequested:z.boolean().optional()}).strict().parse(a.intent);t.intent=checked;if(t.state==='waiting_for_task_selection')t.state='sanitized_artifact_ready';}
   else if(a.method==='open-job'||a.method==='open-task'||a.method==='restore-saved-task'){t.openRequested=true;}
   else if(a.method==='consume-open-job'){const openRequested=t.openRequested===true;t.openRequested=false;return {openRequested,jobId:t.jobId,projectId:t.projectId,documentIds:t.sources.map(s=>s.documentId)};}
   else if(a.method==='diagnostic-event'){if(!a.event)fail('EVENT_REQUIRED',400);note(t,'diagnostic_'+a.event,a.failureCode);}
   else if(a.method==='report-statistics'){if(!a.statistics)fail('STATISTICS_REQUIRED',400);if(Object.hasOwn(a.statistics,'humanReviewed'))fail('HUMAN_REVIEW_STATISTIC_NOT_CLIENT_ASSERTABLE',400);t.statistics={...(t.statistics??{}),...a.statistics};}
   else if(a.method==='restore-completed'||a.method==='standalone-restore-completed'){const r=t.rounds.find(r=>r.roundId===a.roundId);if(!r?.restoredArtifactId||t.state!=='round_completed')fail('SERVER_RESTORATION_NOT_COMPLETED',409);return externalTask(t);}
   else if(a.method==='restore-failed'){if(t.state==='restoring')fail('SERVER_RESTORATION_IN_PROGRESS',409);state(t,['restore_failed']);return externalTask(t);}
   else fail('COLLAB_METHOD_UNSUPPORTED',400);
   return externalTask(t);
  }));return {...humanTask(changed.task),...(a.method==='consume-open-job'?{consumedOpen:changed.result}:{})};
 });
 const gatewayTool:Record<string,string>={get_configuration_catalog:'list_lawbot_saved_settings',start_secure_review:'start_lawbot_redaction',resume_secure_review:'resume_lawbot_task',start_local_restore:'start_lawbot_restoration',get_review_status:'check_document_delivery',wait_review_delivery:'check_document_delivery',get_sanitized_artifact:'receive_sanitized_document',allocate_result_slot:'receive_sanitized_document',submit_pseudonymized_result:'submit_reviewed_document',request_local_restore:'open_lawbot_restore',continue_review:'continue_current_document_review',get_completion_status:'check_restore_completion',wait_restore_completion:'check_restore_completion'};
 app.post('/api/ai-collab/gateway', {bodyLimit:32*1024*1024},async req=>{
  const a=z.object({method:z.enum(gatewayMethods),params:z.record(z.string(),z.unknown()).default({})}).strict().parse(req.body),s=sessions.get(String(req.headers['mcp-session-id']??''));if(!s||!s.initialized||s.user!==req.user.id||s.tenant!==req.user.tenant_id)fail('MCP_SESSION_NOT_FOUND',404);
  if(a.method==='gateway_ping'){await scoped(req.user.id,req.user.tenant_id,db=>rows(db,sql`SELECT 1`));return {status:'ok',protocolVersion:MCP_PROTOCOL};}
  const aliases:Record<string,string>={jobId:'job_id',roundId:'round_id',artifactId:'artifact_id',slotId:'slot_id',waitSeconds:'wait_seconds',afterUpdatedAt:'after_updated_at',sourcePath:'source_path',sourcePaths:'source_paths',documentIds:'document_ids',projectId:'project_id',taskMode:'task_mode',documentType:'document_type',ruleSet:'rule_set',maskingMode:'masking_mode',outputFormats:'output_formats',unifiedPseudonyms:'unified_pseudonyms',batchResultMode:'batch_result_mode',fileSettings:'file_settings',sanitizedOutputDir:'sanitized_output_dir',restoredOutputDir:'restored_output_dir',taskSummary:'task_summary',outputFormat:'output_format',resultKind:'result_kind',replaceSlotId:'replace_slot_id',suggestedName:'suggested_name',tokenChanges:'token_changes',bytesBase64:'bytes_base64'};
  if(a.method!=='start_secure_review'&&Object.hasOwn(a.params,'executionMode'))fail('MCP_INVALID_TOOL_ARGUMENTS',400);
  const params=Object.fromEntries(Object.entries(a.params).map(([k,v])=>[aliases[k]??k,v]));
  let selectedTool=gatewayTool[a.method]!;
  if(a.method==='start_secure_review'){
   const mode=params.executionMode??'automatic';if(mode!=='automatic'&&mode!=='human_review')fail('MCP_INVALID_TOOL_ARGUMENTS',400);
   selectedTool=mode==='human_review'?'start_lawbot_redaction_for_user_manual_review':'start_lawbot_redaction';delete params.executionMode;
   if(Array.isArray(params.file_settings))params.file_settings=params.file_settings.map((settings:unknown)=>{
    if(!settings||typeof settings!=='object'||Array.isArray(settings))return settings;
    const names:Record<string,string>={sourcePath:'source_path',documentType:'document_type',ruleSet:'rule_set',maskingMode:'masking_mode',outputFormats:'output_formats'};
    const record=settings as Record<string,unknown>;for(const [from,to] of Object.entries(names))if(Object.hasOwn(record,from)&&Object.hasOwn(record,to))fail('MCP_INVALID_TOOL_ARGUMENTS',400);
    return Object.fromEntries(Object.entries(record).map(([key,value])=>[names[key]??key,value]));
   });
  }
  if(a.method==='get_review_status'||a.method==='get_completion_status')params.wait_seconds=0;
  const {validateTool}=await import('../../packages/core/mcp-tools.ts');validateTool(selectedTool,params);return observedTool(req,selectedTool,params,s.caller,async()=>{if(a.method==='get_sanitized_artifact'||a.method==='allocate_result_slot'){const resolved=await toolJob(req,String(params.job_id),s.caller),actual={...params,job_id:resolved};if(a.method==='get_sanitized_artifact')return delivery(req,resolved,actual,s.caller,false);const {bytesBase64,attachments,...allocated}=await delivery(req,resolved,actual,s.caller);return allocated;}return callTool(req,selectedTool,params,s.caller);},a.method);
 });
 app.get('/api/ai-collab/tasks/:job/diagnostics',async(req,reply)=>{
  const target=job.parse((req.params as any).job),task=await load(req,target);
  const recent=await scoped(req.user.id,req.user.tenant_id,db=>rows(db,sql`
    SELECT payload FROM ai_collab_diagnostic_events
    WHERE task_id=${taskUUID(target)} AND tenant_id=${req.user.tenant_id}
      AND owner_id=${req.user.id} AND project_id=${task.projectId}
      AND created_at>=now()-interval '30 days'
    ORDER BY created_at DESC,id DESC LIMIT 3001`));
  const records=recent.reverse().map(row=>row.payload);
  if(task.state==='failed')records.push({jobId:target,at:task.updatedAt,adapter:task.caller.adapterId,stage:'task_state',outcome:'failed',state:'failed',code:task.failureCode});
  if(!records.some(row=>row?.outcome==='failed'))return reply.code(404).send({error:'DIAGNOSTIC_FAILURE_NOT_FOUND'});
  const zip=await aiDiagnosticZip(task,records,recent.length>3000);
  return reply.header('Cache-Control','no-store').header('Content-Disposition',`attachment; filename="AI-collab-failure-${target}.zip"`).type('application/zip').send(zip);
 });
 app.get('/api/ai-collab/connectors',async req=>{const tasks=await list(req);return {items:['dsh','qwenwork','workbuddy'].map(adapterId=>({id:adapterId,setupAvailable:true,osLaunchSupported:false,cloudUploadRequired:true,lastVerifiedAt:tasks.filter(t=>t.caller.adapterId===adapterId).map(t=>t.updatedAt).sort().at(-1)??null,status:'configuration_only',liveClientReachability:'not_verified'}))};});
 app.post('/api/ai-collab/connectors/:adapter/:method',async req=>{
  const p=z.object({adapter:z.enum(['dsh','qwenwork','workbuddy']),method:z.enum(connectorMethods)}).parse(req.params);
  if(p.method==='choose-folder'||p.method==='open')fail('CLOUD_OS_CONNECTOR_UNSUPPORTED',409);
  if(p.method==='update-automation'){const a=z.object({shareRestorePassword:z.literal(false),sanitizedOutputDir:z.string().optional(),restoredOutputDir:z.string().optional()}).strict().parse(req.body);if(a.sanitizedOutputDir||a.restoredOutputDir)fail('CLOUD_DIRECTORY_OVERRIDE_UNSUPPORTED',409);return {storage:'encrypted_project_objects',shareRestorePassword:false};}
  if(p.method==='copy-setup')return {adapterId:p.adapter,configuration:{mcpServers:{tuominwang:{command:'pnpm',args:['--dir','YOUR_LOCAL_TUOMINWANG_CHECKOUT','exec','tsx','scripts/mcp-stdio.ts'],env:{TUOMIN_MCP_URL:'https://YOUR_HOST/tuomin/',TUOMIN_MCP_USERNAME:'YOUR_USERNAME',TUOMIN_MCP_PASSWORD:'SET_LOCALLY_DO_NOT_SHARE'}}}},installed:false};
  const connected=[...sessions.values()].filter(s=>s.user===req.user.id&&s.tenant===req.user.tenant_id&&s.caller.adapterId===p.adapter&&s.initialized);
  return {adapterId:p.adapter,activeProtocolSessions:connected.length,connectionStatus:connected.length?'initialized_session':'not_connected',liveClientReachability:'not_verified',setupAvailable:true,osLaunchSupported:false};
 });
}
