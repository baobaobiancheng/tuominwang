import {writeZip} from './office-zip.ts';
import {diagnosticDetails} from '../../scripts/vendor/aiDiagnostics.js';

// The value allowlists and the three-file package below are adapted from the
// extracted original lawbot-mcp/aiDiagnostics.js. Server records cannot claim
// to observe a connector's local stdio transport or a call never received.
const ADAPTERS=['dsh','qwenwork','workbuddy','unknown'] as const;
const STAGES=['tool','transport','gateway','task_state','export','recognition','restoration','connector','request'] as const;
const OUTCOMES=['started','succeeded','failed','waiting','cancelled','retry','fallback','recovered'] as const;
const STATES=['waiting_for_session_authorization','waiting_for_user_file_selection','waiting_for_human_review','building_sanitized_artifact','waiting_for_task_selection','sanitized_artifact_ready','analyzing_by_ai','validating_ai_result','ai_result_rejected','waiting_for_restore_approval','restoring','restore_failed','round_completed','completed','cancelled_by_user','client_disconnected','failed'] as const;
const METHODS=['gateway_ping','get_configuration_catalog','start_secure_review','resume_secure_review','start_local_restore','get_review_status','wait_review_delivery','get_sanitized_artifact','allocate_result_slot','submit_pseudonymized_result','request_local_restore','continue_review','get_completion_status','wait_restore_completion'] as const;
const TOOLS=['start_lawbot_redaction','start_lawbot_redaction_for_user_manual_review','start_lawbot_restoration','check_document_delivery','receive_sanitized_document','submit_reviewed_document','submit_workspace_result','check_restore_completion','resume_lawbot_task','get_lawbot_capabilities','list_lawbot_saved_settings','open_lawbot_restore','continue_current_document_review'] as const;
const GOALS=['contract_review','document_comparison','proofreading','summary','clause_revision','relation_extraction','timeline','redaction','restoration','other'] as const;
const OUTPUTS=['redline','comments','risk_report','negotiation_notes','structured_data','clean_copy','summary','comparison'] as const;
const FORMATS=['docx','doc','wps','md','markdown','pdf','png','jpg','jpeg','original','unknown'] as const;
// Exact original aiDiagnostics.js safeErrorCode allowlist. Arbitrary client
// messages, paths and stacks are never persisted or packaged.
const ERROR_CODES=new Set(`AMBIGUOUS_RESTORE_TASK ARTIFACT_NOT_AVAILABLE BATCH_EXPORT_INCOMPLETE BATCH_REPORT_NOT_READY COMBINED_EXPORT_INCOMPLETE COMBINED_REQUIRES_UNIFIED COMBINED_TOO_LARGE CONFLICTING_PSEUDONYM_RULES DIRECTORY_TOO_DEEP DIRECTORY_TOO_LARGE EMPTY_FILE FILE_SETTINGS_OUT_OF_SCOPE FILE_TOO_LARGE HASH_MISMATCH INVALID_ARGUMENTS INVALID_ARTIFACT INVALID_MAPPING INVALID_OUTPUT_DIRECTORY INVALID_REVIEW_INTENT INVALID_STATE INVALID_TOKEN_CHANGES IRREVERSIBLE_MASK JOB_NOT_AVAILABLE MANUAL_REVIEW_REQUIRED NO_PSEUDONYM_TOKENS NO_RESTORABLE_MAPPING OUTPUT_DIRECTORY_OVERRIDE_NOT_AUTHORIZED OUTPUT_FORMAT_ALREADY_BOUND PARTIALLY_IRREVERSIBLE_MASK PATH_PERMISSION_REQUIRED RESTORE_BUSY RESTORE_INPUT_NOT_SAVED RESTORE_NOT_APPROVED RESULT_KIND_ALREADY_BOUND RESULT_MISSING RESULT_NOT_VALID RESUME_NOT_AVAILABLE SANITIZED_ARCHIVE_FAILED SANITIZED_EXPORT_INCOMPLETE SINGLE_RESTORE_ONLY SLOT_NOT_AVAILABLE SLOT_REPLACEMENT_NOT_ALLOWED SOURCE_NOT_FOUND STALE_ARTIFACT SYMLINK_NOT_ALLOWED TOO_MANY_FILES UNCONTROLLED_EXPORT_PATH UNIFIED_RULE_CONFLICT UNSAFE_NAME UNSUPPORTED_FORMAT UNVERIFIED_EXPORT VISUAL_REPORT_REQUIRED INTERNAL_ERROR INVALID_ARGUMENTS INVALID_STATE INVALID_CALLER UNAUTHORIZED METHOD_NOT_ALLOWED INVALID_JSON JOB_NOT_AVAILABLE ARTIFACT_NOT_AVAILABLE SOURCE_NOT_FOUND SYMLINK_NOT_ALLOWED UNSUPPORTED_FORMAT FILE_TOO_LARGE EMPTY_FILE INVALID_MAPPING HASH_MISMATCH UNCONTROLLED_EXPORT_PATH UNVERIFIED_EXPORT SANITIZED_EXPORT_INCOMPLETE RECOGNITION_INCOMPLETE NO_PSEUDONYM_TOKENS UNSAFE_NAME RESTORE_FAILED RESULT_REJECTED CLIENT_NOT_RUNNING GATEWAY_TIMEOUT GATEWAY_UNAVAILABLE INVALID_RESPONSE CONNECTOR_MISMATCH TOOL_FAILED INVALID_TOOL_ARGUMENTS IRREVERSIBLE_MASK MANUAL_REVIEW_REQUIRED COMBINED_REQUIRES_UNIFIED COMBINED_EXPORT_INCOMPLETE COMBINED_TOO_LARGE VISUAL_REPORT_REQUIRED MCP_CONNECTOR_NOT_CONFIGURED DEVELOPMENT_ONLY SESSION_AUTHORIZATION_REQUIRED RESTORE_NOT_ALLOWED RESULT_NOT_AVAILABLE ROUND_NOT_AVAILABLE SLOT_NOT_AVAILABLE SLOT_NOT_MATCHED MAPPING_NOT_FOUND RESTORE_NOT_AUTHORIZED TASK_CANCELLED TASK_CANCELED ABORT_ERR EACCES EPERM ENOENT ENOSPC EIO ETIMEDOUT ECONNREFUSED ECONNRESET EPIPE OCR_UNAVAILABLE OCR_INIT_FAILED APPLY_RESULT_UNCONFIRMED MARKDOWN_UNAVAILABLE`.split(' '));
const choice=<T extends string>(value:unknown,values:readonly T[]):T|undefined=>typeof value==='string'&&values.includes(value as T)?value as T:undefined;
const choices=<T extends string>(value:unknown,values:readonly T[]):T[]=>Array.isArray(value)?[...new Set(value.map(v=>choice(v,values)).filter((v):v is T=>!!v))].slice(0,12):[];
const count=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(Math.round(value),1_000_000_000):undefined;
const opaqueJob=(value:unknown)=>typeof value==='string'&&/^lbj_[a-f0-9]{32}$/u.test(value)?value:undefined;
export const safeAiDiagnosticCode=(value:unknown)=>typeof value==='string'&&ERROR_CODES.has(value)?value:'INTERNAL_ERROR';
export type AiDiagnosticEvent={schemaVersion:1;at:string;side:'lawbot';stage:string;outcome:string;adapter:string;jobId:string;method?:string;tool?:string;state?:string;durationMs?:number;code?:string;details?:Record<string,unknown>};
export function cleanAiDiagnosticEvent(input:{at?:unknown;adapter?:unknown;jobId?:unknown;method?:unknown;tool?:unknown;state?:unknown;stage?:unknown;outcome?:unknown;durationMs?:unknown;code?:unknown;details?:unknown}):AiDiagnosticEvent|undefined{
 const jobId=opaqueJob(input.jobId);if(!jobId)return undefined;
 const at=typeof input.at==='string'&&Number.isFinite(Date.parse(input.at))?new Date(input.at).toISOString():new Date().toISOString();
 const event:AiDiagnosticEvent={schemaVersion:1,at,side:'lawbot',stage:choice(input.stage,STAGES)??'tool',outcome:choice(input.outcome,OUTCOMES)??'failed',adapter:choice(input.adapter,ADAPTERS)??'unknown',jobId};
 const method=choice(input.method,METHODS),tool=choice(input.tool,TOOLS),state=choice(input.state,STATES),durationMs=count(input.durationMs);
 if(method)event.method=method;if(tool)event.tool=tool;if(state)event.state=state;if(durationMs!==undefined)event.durationMs=durationMs;
 if(input.code!==undefined)event.code=safeAiDiagnosticCode(input.code);
 if(input.details&&typeof input.details==='object'&&!Array.isArray(input.details))event.details=diagnosticDetails(input.details as Record<string,unknown>);
 return event;
}
// Original gatewayClient records a polling result as waiting when its wait
// contract says retry. The cloud task DTO currently exposes status/timedOut.
export function aiDiagnosticToolOutcome(value:unknown):'waiting'|'succeeded'{
 const result=value&&typeof value==='object'?value as Record<string,any>:{};
 const state=typeof result.status==='string'?result.status:typeof result.state==='string'?result.state:'';
 return result.wait?.retry===true||result.timedOut===true||state.startsWith('waiting_')||['building_sanitized_artifact','validating_ai_result','restoring'].includes(state)?'waiting':'succeeded';
}
export function aiDiagnosticTaskDetails(task:any){
 const intent=task?.intent??{},options=task?.options??{};
 return {fileCount:count(task?.sources?.length)??0,taskMode:choice(options.task_mode,['redact_only','ai_process','ai_process_restore']),executionMode:choice(task?.executionMode,['automatic','human_review']),goals:choices(intent.goals,GOALS),outputKinds:choices(intent.outputKinds,OUTPUTS),requestedResultFormat:choice(intent.outputFormat,['docx','md']),outputFormats:choices(options.output_formats,FORMATS)};
}
export async function aiDiagnosticZip(task:any,records:unknown[],historyTruncated:boolean){
 const jobId=opaqueJob(task?.jobId);if(!jobId)throw new Error('INVALID_DIAGNOSTIC_TASK');
 const events=records.map(row=>cleanAiDiagnosticEvent(row as any)).filter((event):event is AiDiagnosticEvent=>!!event).slice(-3000);
 const actual=choice(task?.state,STATES)??'failed',last=events.at(-1),failure=[...events].reverse().find(e=>e.outcome==='failed');
 if(!failure&&actual!=='failed')throw new Error('DIAGNOSTIC_FAILURE_NOT_FOUND');
 const details=aiDiagnosticTaskDetails(task),adapter=choice(task?.caller?.adapterId,ADAPTERS)??'unknown';
 const summary=['AI 协作失败诊断',`任务：${jobId}`,`客户端：${adapter}`,`输入：${details.fileCount} 份；格式：未知`,`成果要求：${details.outputKinds.join('、')||'未提供'}；格式：${details.requestedResultFormat||'未提供'}`,`请求模式：${details.taskMode||'未提供'}；实际状态：${actual}`,`最近失败：${failure?.at||'未知'}；阶段：${failure?.stage||'task_state'}；错误码：${failure?.code||safeAiDiagnosticCode(task?.failureCode)}`,`最近记录：${last?.at||'未知'}；状态：${last?.state||last?.outcome||actual}`,`事件数量：${events.length}；历史可能截断：${historyTruncated?'是':'现有任务历史有限'}`,'服务端仅记录收到的工具调用；连接器本地传输与未到达服务端的失败不在本包内。','AI 声明不等于用户原话或执行证据。','本包不包含文档、原文、聊天全文、真实文件名、完整路径、假名映射或密钥。unknown 表示未提供或无法核实。'].join('\r\n');
 const environment={schemaVersion:1,historyLimited:true,historyTruncated,diagnosticVersion:'1.0.0',gatewayProtocolVersion:1,client:{clientVersion:'unknown',modelName:'unknown',modelSource:'unknown'},source:'server-observed-mcp-tool-calls'};
 const entries=new Map<string,Buffer>([['问题摘要.txt',Buffer.from(summary)],['协作过程.jsonl',Buffer.from(events.map(e=>JSON.stringify(e)).join('\n')+'\n')],['环境信息.json',Buffer.from(JSON.stringify(environment,null,2))]]);
 return writeZip(entries);
}
