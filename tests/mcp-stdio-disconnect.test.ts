import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test,expect} from 'vitest';

type Scenario='delete-denied'|'both-denied'|'delete-network'|'delete-timeout'|'success'|'before-initialize';

async function exercise(scenario:Scenario){
 const calls:Array<{method:string;path:string;status:number|'network'}>=[];
 const data=await mkdtemp(join(tmpdir(),'tmw-mcp-disconnect-'));
 const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const message=raw?JSON.parse(raw):{};
  const path=req.url??'';
  if(path==='/api/login'){
   calls.push({method:'POST',path,status:200});
   res.writeHead(200,{'content-type':'application/json','set-cookie':'session=synthetic; HttpOnly'}).end('{}');return;
  }
  if(message.method==='initialize'){
   calls.push({method:'POST',path,status:200});
   res.writeHead(200,{'content-type':'application/json','mcp-session-id':'synthetic-session'}).end(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-11-25'}}));return;
  }
  if(message.method==='notifications/initialized'){
   calls.push({method:'POST',path,status:202});res.writeHead(202).end();return;
  }
  if(req.method==='DELETE'&&scenario==='delete-network'){
   calls.push({method:'DELETE',path,status:'network'});req.socket.destroy();return;
  }
  if(req.method==='DELETE'&&scenario==='delete-timeout'){
   calls.push({method:'DELETE',path,status:'network'});return;
  }
  const status=req.method==='DELETE'&&scenario==='delete-denied'?500:scenario==='both-denied'&&['/api/mcp','/api/logout'].includes(path)?429:200;
  calls.push({method:req.method??'',path,status});
  res.writeHead(status,{'content-type':'application/json'}).end(status===200?'{}':'{"error":"SYNTHETIC_DENIAL"}');
 });
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw Error('LOOPBACK_ADDRESS_UNAVAILABLE');
  const child=spawn(process.execPath,['--import','tsx','scripts/mcp-stdio.ts'],{cwd:process.cwd(),env:{...process.env,TUOMIN_MCP_URL:`http://127.0.0.1:${address.port}/`,TUOMIN_MCP_USERNAME:'synthetic',TUOMIN_MCP_PASSWORD:'synthetic-private-password',TUOMIN_MCP_USER_DATA:data},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  const input=scenario==='before-initialize'?'':[JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',clientInfo:{name:'synthetic',version:'1'}}}),JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})].join('\n')+'\n';
  child.stdin.end(input);
  const exit=await new Promise<number|null>((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});
  const journalDir=join(data,'diagnostics','ai-collab','_events');
  const names=await readdir(journalDir).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return [];throw error});
  const events=(await Promise.all(names.map(name=>readFile(join(journalDir,name),'utf8')))).join('\n').split('\n').filter(Boolean).map(line=>JSON.parse(line));
  return {calls,exit,stdout,stderr,events};
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(data,{recursive:true,force:true});}
}

test.each([
 {scenario:'delete-denied',statuses:[500,200],stderr:['MCP_DISCONNECT_FAILED endpoint=mcp status=500']},
 {scenario:'both-denied',statuses:[429,429],stderr:['MCP_DISCONNECT_FAILED endpoint=mcp status=429','MCP_DISCONNECT_FAILED endpoint=logout status=429']},
 {scenario:'delete-network',statuses:['network',200],stderr:['MCP_DISCONNECT_FAILED endpoint=mcp status=network']},
 {scenario:'delete-timeout',statuses:['network',200],stderr:['MCP_DISCONNECT_FAILED endpoint=mcp status=network']},
 {scenario:'success',statuses:[200,200],stderr:[]},
] as const)('stdio EOF independently closes MCP and login: $scenario',async({scenario,statuses,stderr})=>{
 const result=await exercise(scenario);
 expect(result.exit).toBe(0);
 expect(result.calls.slice(-2).map(call=>[call.method,call.path,call.status])).toEqual([['DELETE','/api/mcp',statuses[0]],['POST','/api/logout',statuses[1]]]);
 expect(result.stderr.trim().split('\n').filter(Boolean)).toEqual(stderr);
 expect(result.stdout.trim().split('\n').filter(Boolean)).toHaveLength(1);
 expect(result.events.filter(event=>event.stage==='connector'&&event.outcome==='failed')).toHaveLength(stderr.length);
 expect(JSON.stringify(result.events)).not.toMatch(/synthetic-private-password|SYNTHETIC_DENIAL|session=synthetic/);
},25_000);

test('stdio EOF before initialize still invalidates its authenticated login',async()=>{
 const result=await exercise('before-initialize');
 expect(result.exit).toBe(0);
 expect(result.calls.map(call=>[call.method,call.path])).toEqual([['POST','/api/login'],['POST','/api/logout']]);
 expect(result.stderr).toBe('');expect(result.stdout).toBe('');
});
