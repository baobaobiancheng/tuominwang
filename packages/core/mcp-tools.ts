import descriptors from './reference/mcp-tool-schemas.json' with { type: 'json' };
import { randomBytes } from 'node:crypto';
export const MCP_PROTOCOL = '2025-11-25';
export const MCP_ORIGINAL_PROTOCOL = '2025-06-18';
export function negotiateMcpProtocol(requested:unknown){return requested===MCP_ORIGINAL_PROTOCOL?MCP_ORIGINAL_PROTOCOL:MCP_PROTOCOL;}
const batchDeliveryHints:Record<string,string>={
 BATCH_CHILD_JOB_REQUIRED:'这是批量任务：请从 check_document_delivery 返回的 documents 中逐份使用子文档的 jobId 和 sanitizedArtifact.artifactId；单份任务才可省略 artifact_id。',
 BATCH_ARTIFACT_NOT_RECEIVABLE:'这是批量父任务，父任务没有可领取的交换件。请从 check_document_delivery 返回的 documents 中逐份使用子文档的 jobId 和 sanitizedArtifact.artifactId；不要反复重试父任务编号。',
 AUTOMATIC_DELIVERY_PENDING:'全自动模式仍在后台导出，请继续调用 check_document_delivery；humanReviewed: false 不代表需要用户点击完成复核。',
 ARTIFACT_MISMATCH:'交换件编号已变化（任务可能重新交付过）：请重新调用 check_document_delivery 获取最新 artifact_id 后再领取，不要沿用旧编号重试。'
};
export const TOOL_NAMES = descriptors.map(t => t.name);
export const gatewayMethods = ['gateway_ping','get_configuration_catalog','start_secure_review','resume_secure_review','start_local_restore','get_review_status','wait_review_delivery','get_sanitized_artifact','allocate_result_slot','submit_pseudonymized_result','request_local_restore','continue_review','get_completion_status','wait_restore_completion'] as const;
export const collaborationMethods = ['attach-source','attach-sources','authorize','cancel','change-restore-directory','consume-open-job','diagnostic-event','fail','finish-batch-export','list-pending','open-job','open-task','prepare-export','release-export','repair-task-storage','report-statistics','restart-preparation','restore-completed','restore-failed','restore-saved-task','resume-local-restore','retry-authorization','retry-confirmation','retry-restore','set-review-intent','standalone-restore-completed'] as const;
export const connectorMethods = ['choose-folder','copy-setup','get-status','open','retry','update-automation'] as const;
export const taskStates = ['waiting_for_session_authorization','waiting_for_user_file_selection','waiting_for_human_review','building_sanitized_artifact','waiting_for_task_selection','sanitized_artifact_ready','analyzing_by_ai','validating_ai_result','ai_result_rejected','waiting_for_restore_approval','restoring','restore_failed','round_completed','completed','cancelled_by_user','client_disconnected','failed'] as const;
export type TaskState = typeof taskStates[number];
export type Caller = { sessionId: string; adapterId: string; displayName: string };
export type Source = { documentId: string; hash: string; revision: number };
export type Delivery = { documentId: string; artifactId: string; format: string; role: 'primary'|'markdown'|'pdf-docx'|'word-docx'; revision: number; hash: string };
export type Round = { roundId: string; slotId: string; format: 'docx'|'md'; resultKind: 'reviewed_document'|'derived_report'; artifactId: string; objectId?: string; sha256?: string; validated?: boolean; reviewed?: boolean; unknownTokenCount?: number; newCandidateCount?: number; restoredArtifactId?: string; replacementCount?: number; residualTokenCount?: number; suggestedName?: string };
export type Authorization = { allowRedactionPath:boolean; allowRestorePath:boolean; allowSanitizedDelivery:boolean; autoEnterReview:boolean; createExchangeFolder:boolean; autoRestoreAfterValidation:boolean; allowSanitizedOutputOverride?:boolean; allowRestoredOutputOverride?:boolean };
export type CollabTask = { jobId:string; parentJobId?:string; childJobIds?:string[]; revision:number; projectId:string; state:TaskState; executionMode?:'automatic'|'human_review'; pendingInitialDetection?:boolean; reviewResolutions?:Array<{documentId:string;fromRevision:number;toRevision:number;snapshotRevision:number;sourceHash:string;policyVersion:string;decisionOrigin:'automatic'|'human_review'}>; caller:Caller; previousCaller?:Caller; authorization?:Authorization; authorizationRequired?:boolean; options:Record<string,any>; sources:Source[]; deliveries:Delivery[]; rounds:Round[]; createdAt:string; updatedAt:string; failureCode?:string; exportJobIds?:string[]; intent?:Record<string,any>; openRequested?:boolean; eventLog?:Array<{at:string;event:string;code?:string}>; statistics?:Record<string,number> };
export function externalTask(t:CollabTask) {
  const r=t.rounds.at(-1);
  // Original names, document IDs, project IDs, content, originals, mapping keys and storage object IDs stay in the human-authorized UI.
  return {schemaVersion:1,jobId:t.jobId,revision:t.revision,status:t.state,executionMode:t.executionMode??'human_review',awaitingInitialDetection:t.pendingInitialDetection===true,callerDisplayName:t.caller.displayName,scope:t.sources.length>1?'batch':'single',...t.childJobIds?{childJobIds:t.childJobIds}:{},taskMode:t.options.task_mode??'ai_process_restore',purpose:t.options.purpose??'contract_review',reviewIntent:t.intent??t.options.task_summary,sourceCount:t.sources.length,sanitizedExports:t.deliveries.map((a,i)=>({artifactId:`lba_${a.artifactId.replaceAll('-','')}`,index:i+1,format:a.format,role:a.role})),createdAt:t.createdAt,updatedAt:t.updatedAt,authorizationRequired:t.state==='waiting_for_session_authorization'||undefined,failureCode:t.failureCode,roundId:r?.roundId,completion:r?.restoredArtifactId?{roundId:r.roundId,replacementCount:r.replacementCount,residualTokenCount:r.residualTokenCount,outputFormat:r.format}:undefined};
}
export function toolDescriptions() { return descriptors.map(t=>({...t,description: t.name==='start_lawbot_redaction'?'Start a persisted automatic redaction task using uploaded document IDs. Session authorization is required; the approved machine policy decides redactions and prepares sanitized delivery after recognition. Any AI result approval or restoration remains a separate human action.':t.name==='start_lawbot_redaction_for_user_manual_review'?'Start a persisted human review redaction task using uploaded document IDs. Session authorization and per-document human redaction review are required before sanitized delivery.':t.name.startsWith('start_')?'Start a persisted task requiring approval in the redaction tool. Use uploaded document IDs.':`Authorized redaction workflow: ${t.name}.`})); }
function invalid():never {throw Object.assign(new Error('MCP_INVALID_TOOL_ARGUMENTS'),{statusCode:400});}
export function validateJSONSchema(schema:any,value:any):void {
 if(schema.type==='object') {if(!value||typeof value!=='object'||Array.isArray(value))invalid();for(const k of schema.required??[])if(!(k in value))invalid();for(const k of Object.keys(value)){if(!Object.hasOwn(schema.properties??{},k)){if(schema.additionalProperties===false)invalid();continue;}validateJSONSchema(schema.properties[k],value[k]);}}
 else if(schema.type==='array'){if(!Array.isArray(value)||value.length<(schema.minItems??0)||value.length>(schema.maxItems??Infinity))invalid();if(schema.uniqueItems&&new Set(value.map(x=>JSON.stringify(x))).size!==value.length)invalid();for(const x of value)validateJSONSchema(schema.items,x);}
 else if(schema.type==='string'){if(typeof value!=='string'||!value.isWellFormed()||value.length<(schema.minLength??0)||value.length>(schema.maxLength??Infinity))invalid();if(schema.pattern&&!new RegExp(schema.pattern,'u').test(value))invalid();if(schema.format==='uuid'&&!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value))invalid();}
 else if(schema.type==='boolean'){if(typeof value!=='boolean')invalid();}
 else if(schema.type==='integer'||schema.type==='number'){if(typeof value!=='number'||!Number.isFinite(value)||schema.type==='integer'&&!Number.isInteger(value)||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity))invalid();}
 if(schema.enum&&!schema.enum.includes(value))invalid();
}
export function validateTool(name:string,args:unknown){const t=descriptors.find(t=>t.name===name);if(!t)throw new Error('MCP_UNKNOWN_TOOL');validateJSONSchema(t.inputSchema,args);return args as Record<string,any>;}
export function cloudDocumentIds(input:Record<string,any>):string[]{
 const paths=input.source_paths??(input.source_path?[input.source_path]:[]),mapped=paths.map((p:string)=>{const m=/^document:([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(p);if(!m)throw Object.assign(new Error('UPLOAD_DOCUMENT_REQUIRED'),{statusCode:400});return m[1]!;});
 const ids=[...new Set([...(input.document_ids??[]),...mapped])];if(ids.length>100)invalid();return ids;
}
export function newOpaqueId(prefix:'lbj'|'lba'|'lbs'){return `${prefix}_${randomBytes(16).toString('hex')}`;}
export function taskUUID(job:string){if(!/^lbj_[a-f0-9]{32}$/.test(job))invalid();const h=job.slice(4);return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
// Source renderer qc() counts one score/confidence per logical entity. Our
// signatureGroup may contain several physical marks. A group is low confidence
// if any member is low; an invalid/missing member keeps its score unknown.
export function recognitionNotice(frames:ReadonlyArray<ReadonlyArray<{signatureGroup?:{id:string};sources?:ReadonlyArray<{score?:number}>}>>,humanReviewed:boolean,executionMode:'automatic'|'human_review',status:string,totalDocumentCount=frames.length,failedDocumentCount=0){
 const groups=new Map<string,{scores:number[];unknown:boolean}>();
 for(const [documentIndex,marks] of frames.entries())for(const [index,mark] of marks.entries()){
  const key=`${documentIndex}:${mark.signatureGroup?.id??`mark:${index}`}`,entry=groups.get(key)??{scores:[],unknown:false};
  if(!mark.sources?.length)entry.unknown=true;
  for(const source of mark.sources??[]){
   const score=source.score;
   if(typeof score==='number'&&Number.isFinite(score)&&score>=0&&score<=1)entry.scores.push(score);
   else entry.unknown=true;
  }
  groups.set(key,entry);
 }
 let lowConfidenceCount=0,unknownConfidenceCount=0;
 for(const entity of groups.values()){
  if(entity.unknown||!entity.scores.length)unknownConfidenceCount++;
  else if(entity.scores.some(score=>score<0.8))lowConfidenceCount++;
 }
 const documentCount=frames.length,statistics={documentCount,totalDocumentCount,failedDocumentCount,entityCount:groups.size,lowConfidenceCount,unknownConfidenceCount,humanReviewed};
 const scope=documentCount===totalDocumentCount?`已完成 ${documentCount} 份文档的软件内识别`:`已完成 ${documentCount}/${totalDocumentCount} 份文档的软件内识别，${failedDocumentCount} 份失败，${totalDocumentCount-documentCount-failedDocumentCount} 份仍在处理`;
 const review=humanReviewed?'您已完成人工复核。':executionMode==='human_review'?'尚未完成人工复核，需在脱敏汪内完成后才能交付。':'尚未进行人工复核，建议检查识别结果；自动流程无需等待人工确认。';
 const ready=['sanitized_artifact_ready','analyzing_by_ai','round_completed','waiting_for_restore_approval','completed'].includes(status);
 const terminalFailure=['failed','cancelled_by_user','restore_failed','ai_result_rejected'].includes(status);
 const state=ready?'已完成可交付材料的准备；请按当前任务状态领取或复核。':terminalFailure?'当前任务已结束或中止；请查看任务状态与可领取材料。':status==='restoring'?'脱敏汪正在执行还原流程。':executionMode==='automatic'?'脱敏汪正在处理尚未完成的材料。':'人工模式在复核交付前继续等待。';
 return {statistics,humanReviewRecommended:true,userMessage:`脱敏汪${scope}，共识别 ${groups.size} 处敏感实体，其中 ${lowConfidenceCount} 处低置信实体。${unknownConfidenceCount?`另有 ${unknownConfidenceCount} 处实体无法判断置信度。`:''}${review}${state}`,instructions:'请先向用户完整转述 userMessage，再继续后续工具调用。低置信度是检查建议，不单独阻断自动流程。'};
}
// The original waitForReviewDelivery wraps every state, including failures before statistics exist.
// Caller supplies only document states and fallback evidence it actually verified.
export function reviewDeliveryProjection(input:{state:string;executionMode:'automatic'|'human_review';timedOut:boolean;statistics?:{documentCount:number;failedDocumentCount:number}|undefined;documents?:ReadonlyArray<{status:string;visualFallback?:boolean}>;userMessage?:string;instructions?:string}){
 const failed=['failed','cancelled_by_user'].includes(input.state);
 const documentFailures=input.documents?.filter(d=>d.status==='failed').length;
 const failedDocumentCount=documentFailures??input.statistics?.failedDocumentCount??(input.state==='failed'?1:0);
 const visualFallbackCount=input.documents?.filter(d=>d.visualFallback===true).length??0;
 const message=input.userMessage&&visualFallbackCount?`${input.userMessage}其中 ${visualFallbackCount} 份 Markdown 未能交付，已改用校验通过的假名 PDF/图片继续审查。`:input.userMessage;
 const waiting=['waiting_for_session_authorization','waiting_for_user_file_selection','waiting_for_human_review','building_sanitized_artifact','waiting_for_task_selection'].includes(input.state);
 const nextAction=failed?'report_failed_documents':input.executionMode==='human_review'&&input.state==='waiting_for_human_review'?'wait_for_user_review_in_lawbot':'continue_automatically';
 const wait=failed?{timedOut:false,retry:false}:waiting?{timedOut:input.timedOut,retry:true}:undefined;
 const failure=failed?{userMessage:'本次处理未完成，失败文档未交付给 AI。请在脱敏汪中查看失败项并重试。',instructions:'请用中文告知用户失败，不要继续轮询此任务或声称全部文档已完成。'}:{};
 return {executionMode:input.executionMode,nextAction,...wait?{wait}:{},failedDocumentCount,visualFallbackCount,humanReviewRecommended:true,...message&&!failed?{userMessage:message}:{},...input.instructions&&!failed?{instructions:input.instructions}:{},...failure};
}
export type ProtocolSession = {caller:Caller;initialized:boolean;protocol:string};
export async function mcpDispatch(message:any,session:ProtocolSession|undefined,call:(name:string,args:Record<string,any>,caller:Caller)=>Promise<any>):Promise<any>{
 const id=message?.id,error=(code:number,text:string)=>({jsonrpc:'2.0',id:id??null,error:{code,message:text}});
 if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string'||id!==undefined&&!['string','number'].includes(typeof id))return error(-32600,'Invalid Request');
 if(message.method==='notifications/initialized'){if(session)session.initialized=true;return null;}
 if(id===undefined)return message.method==='initialize'?error(-32600,'Initialize request ID required'):null;
 if(message.method==='initialize'){if(!session)return error(-32600,'Session required');return {jsonrpc:'2.0',id,result:{protocolVersion:session.protocol,capabilities:{tools:{listChanged:false},resources:{listChanged:false}},serverInfo:{name:'tuominwang',version:'1.0.0'},instructions:'Only approved sanitized artifacts are delivered. Upload documents through the authenticated project UI. No external AI provider is invoked.'}};}
 if(!session?.initialized)return error(-32600,'Initialization required');
 if(message.method==='ping')return {jsonrpc:'2.0',id,result:{}};
 if(message.method==='tools/list')return {jsonrpc:'2.0',id,result:{tools:toolDescriptions()}};
 if(message.method==='resources/list')return {jsonrpc:'2.0',id,result:{resources:[]}};
 if(message.method!=='tools/call')return id===undefined?null:error(-32601,'Method not found');
 const name=message.params?.name;if(typeof name!=='string'||!TOOL_NAMES.includes(name))return error(-32602,'Unknown tool');
 let args:Record<string,any>;try{args=validateTool(name,message.params.arguments??{});}catch{return error(-32602,'Invalid tool arguments');}
 try{const value=await call(name,args,session.caller);return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false}};}
 catch(e){const message=(e as Error).message,code=/^[A-Z0-9_]{1,100}$/.test(message)?message:'INTERNAL_ERROR',result={error:code,...batchDeliveryHints[code]?{instructions:batchDeliveryHints[code]}:{}};return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:true}};}
}
