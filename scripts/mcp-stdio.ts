import {createInterface} from 'node:readline';
import {MCP_PROTOCOL} from '../packages/core/mcp-tools.ts';
const service=new URL(process.env.TUOMIN_MCP_URL??'http://127.0.0.1:5178/');
if(!['https:','http:'].includes(service.protocol)||service.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(service.hostname))throw new Error('HTTPS_OR_LOOPBACK_SERVICE_REQUIRED');
const api=(path:string)=>new URL(path,service.href.endsWith('/')?service:new URL(service.href+'/'));
let cookie='',session='',initialized=false;
async function request(path:string,payload:any){const response=await fetch(api(path),{method:'POST',redirect:'error',headers:{'content-type':'application/json',origin:process.env.TUOMIN_MCP_ORIGIN??service.origin,...cookie?{cookie}:{},...session?{'mcp-session-id':session,'mcp-protocol-version':MCP_PROTOCOL}:{}},body:JSON.stringify(payload)});if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie')!.split(';')[0]!;if(response.headers.has('mcp-session-id'))session=response.headers.get('mcp-session-id')!;if(!response.ok)throw new Error(`SERVICE_HTTP_${response.status}`);return response.status===202?null:response.json();}
async function login(){const username=process.env.TUOMIN_MCP_USERNAME,password=process.env.TUOMIN_MCP_PASSWORD;if(!username||!password)throw new Error('LOCAL_CREDENTIALS_REQUIRED');await request('api/login',{username,password});delete process.env.TUOMIN_MCP_PASSWORD;}
await login();
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
// Process requests sequentially to preserve MCP initialization ordering and task CAS. stdout is protocol only.
for await(const line of lines){let message:any;try{message=JSON.parse(line);if(message.method==='notifications/initialized'){initialized=true;await request('api/mcp',message);continue;}if(message.method!=='initialize'&&!initialized)throw new Error('INITIALIZATION_REQUIRED');const response=await request('api/mcp',message);if(response)process.stdout.write(JSON.stringify(response)+'\n');}catch(e){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message?.id??null,error:{code:message?-32603:-32700,message:message?(e as Error).message:'Parse error'}})+'\n');}}

if(session){try{await fetch(api('api/mcp'),{method:'DELETE',redirect:'error',headers:{origin:process.env.TUOMIN_MCP_ORIGIN??service.origin,cookie,'mcp-session-id':session,'mcp-protocol-version':MCP_PROTOCOL}});await request('api/logout',{});}catch{process.stderr.write('MCP_DISCONNECT_FAILED\n');}}
