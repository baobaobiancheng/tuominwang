import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,lstat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {isAbsolute,join} from 'node:path';
import {AiDiagnostics,safeErrorCode,clientMetadata} from './vendor/aiDiagnostics.js';
import {createInterface} from 'node:readline';
import {MCP_PROTOCOL} from '../packages/core/mcp-tools.ts';
const diagnosticRoot=process.env.TUOMIN_MCP_USER_DATA??join(homedir(),'.tuominwang');
let diagnostics:AiDiagnostics|null=null;
try{
 if(!isAbsolute(diagnosticRoot))throw new Error('UNSAFE_DIAGNOSTIC_DIRECTORY');
 await mkdir(diagnosticRoot,{recursive:true,mode:0o700});
 const rootStat=await lstat(diagnosticRoot);
 if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new Error('UNSAFE_DIAGNOSTIC_DIRECTORY');
 const diagnosticsParent=join(diagnosticRoot,'diagnostics');
 await mkdir(diagnosticsParent,{recursive:true,mode:0o700});
 const parentStat=await lstat(diagnosticsParent);
 if(!parentStat.isDirectory()||parentStat.isSymbolicLink())throw new Error('UNSAFE_DIAGNOSTIC_DIRECTORY');
 diagnostics=new AiDiagnostics(diagnosticRoot,{side:'connector',appVersion:'1.0.0'});
}catch{process.stderr.write('MCP_DIAGNOSTICS_DISABLED\n');}
const diagnosticSession=randomBytes(16).toString('hex');
let adapter:'dsh'|'qwenwork'|'workbuddy'|'unknown'='unknown';
let client:Record<string,unknown>=clientMetadata({connectorVersion:'1.0.0'});
const report=(input:Record<string,unknown>)=>diagnostics?.record({adapter,sessionId:diagnosticSession,client,...input})??Promise.resolve();
let service:URL;
try{
 service=new URL(process.env.TUOMIN_MCP_URL??'http://127.0.0.1:5178/');
 if(!['https:','http:'].includes(service.protocol)||service.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(service.hostname))throw new Error('HTTPS_OR_LOOPBACK_SERVICE_REQUIRED');
}catch(error){await report({stage:'connector',outcome:'failed',error:{code:safeErrorCode(error)}});await diagnostics?.flush();process.stderr.write('MCP_START_FAILED\n');process.exit(1);}
const api=(path:string)=>new URL(path,service.href.endsWith('/')?service:new URL(service.href+'/'));
let cookie='',session='',initialized=false,protocol=MCP_PROTOCOL;
// Original GatewayClient.call/invoke: one retry only for transport failure,
// preserving the same request identity. HTTP business errors are not retried.
async function request(path:string,payload:any){
 const toolRequest=path==='api/mcp'&&payload.method==='tools/call';
 const requestId=toolRequest?randomUUID():undefined;
 const traceId=requestId??randomUUID();
 const tool=toolRequest?payload.params?.name:undefined;
 const argumentJob=toolRequest?payload.params?.arguments?.job_id:undefined;
 const inputJobId=typeof argumentJob==='string'&&/^lbj_[a-f0-9]{32}$/.test(argumentJob)?argumentJob:undefined;
 const diagnostic={traceId,requestId,tool,jobId:inputJobId,stage:'tool'};
 const began=Date.now();
 if(toolRequest)await report({...diagnostic,outcome:'started'});
 const wait=Number(payload.params?.arguments?.wait_seconds??45);
 const timeoutMs=['check_document_delivery','check_restore_completion'].includes(tool)?Math.max(15_000,Math.min(45,Math.max(0,wait))*1000+5000):15_000;
 const init={method:'POST',redirect:'error' as const,headers:{'content-type':'application/json',origin:process.env.TUOMIN_MCP_ORIGIN??service.origin,...cookie?{cookie}:{},...session?{'mcp-session-id':session,'mcp-protocol-version':protocol}:{},...requestId?{'x-tuomin-mcp-request-id':requestId}:{}},body:JSON.stringify(payload)};
 for(let attempt=0;;attempt++){
  let response:Response,value:any;
  try{
   response=await fetch(api(path),{...init,signal:AbortSignal.timeout(timeoutMs)});
   // A lost or malformed response is a transport failure. Keep this attempt's
   // HTTP denial authoritative instead of treating a non-JSON error as retryable.
   if(response.ok)value=response.status===202?null:await response.json();
  }catch(error){
   if(toolRequest&&attempt===0){await report({...diagnostic,stage:'transport',outcome:'retry',durationMs:Date.now()-began,error:{code:safeErrorCode(error)}});continue;}
   await report({...diagnostic,stage:'transport',outcome:'failed',durationMs:Date.now()-began,error:{code:safeErrorCode(error)}});
   throw error;
  }
  if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0]!;
  if(response.headers.has('mcp-session-id'))session=response.headers.get('mcp-session-id')!;
  if(!response.ok){
   await report({...diagnostic,stage:toolRequest?'tool':'connector',outcome:'failed',durationMs:Date.now()-began,error:{code:'INTERNAL_ERROR'}});
   throw new Error(`SERVICE_HTTP_${response.status}`);
  }
  if(payload.method==='initialize'){
   const selected=value?.result?.protocolVersion;
   if(selected!==MCP_PROTOCOL&&selected!=='2025-06-18')throw new Error('UNSUPPORTED_NEGOTIATED_PROTOCOL');
   protocol=selected;
   const name=payload.params?.clientInfo?.name;
   adapter=name==='dsh'||name==='qwenwork'||name==='workbuddy'?name:'unknown';
   client=clientMetadata({clientVersion:payload.params?.clientInfo?.version,clientVersionSource:'client_handshake',connectorVersion:'1.0.0',protocolVersion:value?.result?.protocolVersion});
  }
  if(toolRequest){
   const result=value?.result?.structuredContent??{};
   const jobId=inputJobId??(typeof result.jobId==='string'&&/^lbj_[a-f0-9]{32}$/.test(result.jobId)?result.jobId:undefined);
   const status=typeof result.status==='string'?result.status:undefined;
   const outcome=value?.error||value?.result?.isError?'failed':result.wait?.retry===true||result.timedOut===true||status?.startsWith('waiting_')||['building_sanitized_artifact','validating_ai_result','restoring'].includes(status??'')?'waiting':'succeeded';
   await report({...diagnostic,jobId,outcome,state:status,durationMs:Date.now()-began,...outcome==='failed'?{error:{code:safeErrorCode({code:value?.error?.message??result.error})}}:{}});
  }
  return value;
 }
}

async function login(){const username=process.env.TUOMIN_MCP_USERNAME,password=process.env.TUOMIN_MCP_PASSWORD;if(!username||!password)throw new Error('LOCAL_CREDENTIALS_REQUIRED');await request('api/login',{username,password});delete process.env.TUOMIN_MCP_PASSWORD;}
try{await login();}catch(error){await report({stage:'connector',outcome:'failed',error:{code:safeErrorCode(error)}});await diagnostics?.flush();process.stderr.write('MCP_START_FAILED\n');process.exit(1);}
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
// Process requests sequentially to preserve MCP initialization ordering and task CAS. stdout is protocol only.
for await(const line of lines){let message:any;try{message=JSON.parse(line);if(message.method==='notifications/initialized'){initialized=true;await request('api/mcp',message);continue;}if(message.method!=='initialize'&&!initialized)throw new Error('INITIALIZATION_REQUIRED');const response=await request('api/mcp',message);if(response)process.stdout.write(JSON.stringify(response)+'\n');}catch(e){if(!message)await report({stage:'request',outcome:'failed',traceId:randomUUID(),error:{code:safeErrorCode(e)}});process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message?.id??null,error:{code:message?-32603:-32700,message:message?(e as Error).message:'Parse error'}})+'\n');}}

async function disconnect(endpoint:'mcp'|'logout',path:string,init:RequestInit){
 let status:number|'network'='network';
 try{const response=await fetch(api(path),{...init,signal:AbortSignal.timeout(15_000)});if(response.ok)return;status=response.status;}catch{}
 process.stderr.write(`MCP_DISCONNECT_FAILED endpoint=${endpoint} status=${status}\n`);
 try{await report({stage:'connector',outcome:'failed',error:{code:'INTERNAL_ERROR'}});}catch{}
}
const closeHeaders={origin:process.env.TUOMIN_MCP_ORIGIN??service.origin,cookie,...session?{'mcp-session-id':session,'mcp-protocol-version':protocol}:{}};
if(session)await disconnect('mcp','api/mcp',{method:'DELETE',redirect:'error',headers:closeHeaders});
if(cookie)await disconnect('logout','api/logout',{method:'POST',redirect:'error',headers:{...closeHeaders,'content-type':'application/json'},body:'{}'});

await diagnostics?.flush();
