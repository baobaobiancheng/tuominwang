import descriptors from './reference/mcp-tool-schemas.json' with { type: 'json' };
import { randomBytes } from 'node:crypto';
export const MCP_PROTOCOL = '2025-11-25';
export const TOOL_NAMES = descriptors.map(t => t.name);
export const gatewayMethods = ['gateway_ping','get_configuration_catalog','start_secure_review','resume_secure_review','start_local_restore','get_review_status','wait_review_delivery','get_sanitized_artifact','allocate_result_slot','submit_pseudonymized_result','request_local_restore','continue_review','get_completion_status','wait_restore_completion'] as const;
export const collaborationMethods = ['attach-source','attach-sources','authorize','cancel','change-restore-directory','consume-open-job','diagnostic-event','fail','finish-batch-export','list-pending','open-job','open-task','prepare-export','release-export','repair-task-storage','report-statistics','restart-preparation','restore-completed','restore-failed','restore-saved-task','resume-local-restore','retry-authorization','retry-confirmation','retry-restore','set-review-intent','standalone-restore-completed'] as const;
export const connectorMethods = ['choose-folder','copy-setup','get-status','open','retry','update-automation'] as const;
export const taskStates = ['waiting_for_session_authorization','waiting_for_user_file_selection','waiting_for_human_review','building_sanitized_artifact','waiting_for_task_selection','sanitized_artifact_ready','analyzing_by_ai','validating_ai_result','ai_result_rejected','waiting_for_restore_approval','restoring','restore_failed','round_completed','completed','cancelled_by_user','client_disconnected','failed'] as const;
export type TaskState = typeof taskStates[number];
export type Caller = { sessionId: string; adapterId: string; displayName: string };
export type Source = { documentId: string; hash: string; revision: number };
export type Delivery = { documentId: string; artifactId: string; format: string; role: 'primary'|'markdown'|'pdf-docx'; revision: number; hash: string };
export type Round = { roundId: string; slotId: string; format: 'docx'|'md'; resultKind: 'reviewed_document'|'derived_report'; artifactId: string; objectId?: string; sha256?: string; validated?: boolean; reviewed?: boolean; unknownTokenCount?: number; newCandidateCount?: number; restoredArtifactId?: string; replacementCount?: number; residualTokenCount?: number; suggestedName?: string };
export type Authorization = { allowRedactionPath:boolean; allowRestorePath:boolean; allowSanitizedDelivery:boolean; autoEnterReview:boolean; createExchangeFolder:boolean; autoRestoreAfterValidation:boolean; allowSanitizedOutputOverride?:boolean; allowRestoredOutputOverride?:boolean };
export type CollabTask = { jobId:string; revision:number; projectId:string; state:TaskState; caller:Caller; previousCaller?:Caller; authorization?:Authorization; authorizationRequired?:boolean; options:Record<string,any>; sources:Source[]; deliveries:Delivery[]; rounds:Round[]; createdAt:string; updatedAt:string; failureCode?:string; exportJobIds?:string[]; intent?:Record<string,any>; openRequested?:boolean; eventLog?:Array<{at:string;event:string;code?:string}>; statistics?:Record<string,number> };
export function externalTask(t:CollabTask) {
  const r=t.rounds.at(-1);
  // Original names, document IDs, project IDs, content, originals, mapping keys and storage object IDs stay in the human-authorized UI.
  return {schemaVersion:1,jobId:t.jobId,revision:t.revision,status:t.state,callerDisplayName:t.caller.displayName,scope:t.sources.length>1?'batch':'single',taskMode:t.options.task_mode??'ai_process_restore',purpose:t.options.purpose??'contract_review',reviewIntent:t.intent??t.options.task_summary,sourceCount:t.sources.length,sanitizedExports:t.deliveries.map((a,i)=>({artifactId:`lba_${a.artifactId.replaceAll('-','')}`,index:i+1,format:a.format,role:a.role})),createdAt:t.createdAt,updatedAt:t.updatedAt,authorizationRequired:t.state==='waiting_for_session_authorization'||undefined,failureCode:t.failureCode,roundId:r?.roundId,completion:r?.restoredArtifactId?{roundId:r.roundId,replacementCount:r.replacementCount,residualTokenCount:r.residualTokenCount,outputFormat:r.format}:undefined};
}
export function toolDescriptions() { return descriptors.map(t=>({...t,description: t.name.startsWith('start_')?'Start a persisted task requiring approval in the redaction tool. Use uploaded document IDs.':`Authorized redaction workflow: ${t.name}.`})); }
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
export type ProtocolSession = {caller:Caller;initialized:boolean;protocol:string};
export async function mcpDispatch(message:any,session:ProtocolSession|undefined,call:(name:string,args:Record<string,any>,caller:Caller)=>Promise<any>):Promise<any>{
 const id=message?.id,error=(code:number,text:string)=>({jsonrpc:'2.0',id:id??null,error:{code,message:text}});
 if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string'||id!==undefined&&!['string','number'].includes(typeof id))return error(-32600,'Invalid Request');
 if(message.method==='notifications/initialized'){if(session)session.initialized=true;return null;}
 if(id===undefined)return message.method==='initialize'?error(-32600,'Initialize request ID required'):null;
 if(message.method==='initialize'){if(!session)return error(-32600,'Session required');return {jsonrpc:'2.0',id,result:{protocolVersion:MCP_PROTOCOL,capabilities:{tools:{listChanged:false}},serverInfo:{name:'tuominwang',version:'1.0.0'},instructions:'Only approved sanitized artifacts are delivered. Upload documents through the authenticated project UI. No external AI provider is invoked.'}};}
 if(!session?.initialized)return error(-32600,'Initialization required');
 if(message.method==='ping')return {jsonrpc:'2.0',id,result:{}};
 if(message.method==='tools/list')return {jsonrpc:'2.0',id,result:{tools:toolDescriptions()}};
 if(message.method!=='tools/call')return id===undefined?null:error(-32601,'Method not found');
 const name=message.params?.name;if(typeof name!=='string'||!TOOL_NAMES.includes(name))return error(-32602,'Unknown tool');
 let args:Record<string,any>;try{args=validateTool(name,message.params.arguments??{});}catch{return error(-32602,'Invalid tool arguments');}
 try{const value=await call(name,args,session.caller);return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false}};}
 catch(e){const message=(e as Error).message,code=/^[A-Z0-9_]{1,100}$/.test(message)?message:'INTERNAL_ERROR';return {jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify({error:code})}],structuredContent:{error:code},isError:true}};}
}
