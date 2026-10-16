import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {writeFile,mkdtemp,readdir,readFile,rm,mkdir,chmod,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readZip} from '../packages/core/office-zip.ts';
const directory=process.cwd();
const results=[];
for(const scenario of ['lost-response','http-denied','twice-disconnected','invalid-response','jsonrpc-error']){
 const requests=[];const userData=await mkdtemp(join(tmpdir(),'tmw-056-connector-diag-'));const secret='synthetic-secret-private-path';
 const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):{};
  if(req.url==='/api/login'){res.setHeader('set-cookie','session=synthetic; HttpOnly');res.end('{}');return;}
  if(req.method==='DELETE'||req.url==='/api/logout'){res.end('{}');return;}
  if(body.method==='initialize'){res.setHeader('mcp-session-id','synthetic-session');res.end(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-11-25'}}));return;}
  if(body.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
  requests.push({raw,identity:req.headers['x-tuomin-mcp-request-id'],cookie:req.headers.cookie,session:req.headers['mcp-session-id']});
  if(scenario==='http-denied'){res.writeHead(403);res.end('denied');return;}
  if(scenario==='jsonrpc-error'){res.end(JSON.stringify({jsonrpc:'2.0',id:3,error:{code:-32001,message:'SERVICE_UNAVAILABLE'}}));return;}
  if(scenario==='twice-disconnected'||scenario==='lost-response'&&requests.length===1){req.socket.destroy();return;}
  if(scenario==='invalid-response'&&requests.length===1){res.end('invalid JSON');return;}
  res.end(JSON.stringify({jsonrpc:'2.0',id:3,result:{structuredContent:{ok:true}}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const child=spawn(process.execPath,['--import','tsx','scripts/mcp-stdio.ts'],{cwd:directory,env:{...process.env,TUOMIN_MCP_URL:`http://127.0.0.1:${server.address().port}/`,TUOMIN_MCP_USERNAME:'synthetic',TUOMIN_MCP_PASSWORD:secret,TUOMIN_MCP_USER_DATA:userData},stdio:['pipe','pipe','pipe']});
 let output='',stderr='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>stderr+=data);
 child.stdin.end([{jsonrpc:'2.0',id:1,method:'initialize'},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_lawbot_capabilities',arguments:{source_path:secret}}}].map(JSON.stringify).join('\n')+'\n');
 const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 await new Promise(resolve=>server.close(resolve));
 assert.equal(exit,0,stderr);const responses=output.trim().split('\n').map(line=>JSON.parse(line));assert.equal(responses.length,2,output);
 assert.equal(requests.length,['http-denied','jsonrpc-error'].includes(scenario)?1:2);
 assert.match(requests[0].identity,/^[a-f0-9-]{36}$/);
 if(requests.length===2)assert.deepEqual(requests[0],requests[1],'retry must preserve payload and request identity');
 if(scenario==='http-denied')assert.equal(responses[1].error.message,'SERVICE_HTTP_403');
 else if(scenario==='jsonrpc-error')assert.equal(responses[1].error.message,'SERVICE_UNAVAILABLE');
 else if(scenario==='twice-disconnected')assert.ok(responses[1].error);
 else assert.equal(responses[1].result.structuredContent.ok,true);
 const diag=join(userData,'diagnostics','ai-collab'),names=await readdir(diag),journals=await readdir(join(diag,'_events'));
 assert.ok(journals.some(name=>name.endsWith('.jsonl')));
 const journal=(await Promise.all(journals.map(name=>readFile(join(diag,'_events',name),'utf8')))).join('\n');
 assert.doesNotMatch(journal,/synthetic-secret-private-path|synthetic-session|source_path/);
 const events=journal.split('\n').filter(Boolean).map(JSON.parse);assert.ok(events.some(event=>event.outcome==='started'&&event.stage==='tool'));
 assert.ok(events.every(event=>/^[a-f0-9]{32}$/.test(event.session)));
 if(scenario==='lost-response'||scenario==='invalid-response')assert.ok(events.some(event=>event.stage==='transport'&&event.outcome==='retry'));
 const zipNames=names.filter(name=>name.endsWith('.zip'));
 if(['http-denied','twice-disconnected','jsonrpc-error'].includes(scenario)){
  assert.equal(zipNames.length,1);const files=await readZip(await readFile(join(diag,zipNames[0])));
  assert.deepEqual([...files.keys()].sort(),['问题摘要.txt','协作过程.jsonl','环境信息.json'].sort());
  const content=[...files.values()].map(value=>value.toString()).join('\n');
  assert.doesNotMatch(content,/synthetic-secret-private-path|synthetic-session|source_path/);
 }
 await rm(userData,{recursive:true,force:true});
 results.push({scenario,passed:true,requests:requests.length,events:events.length,zipCount:zipNames.length});
}
{
 const scenario='before-task-credentials-missing',userData=await mkdtemp(join(tmpdir(),'tmw-056-connector-diag-'));
 const env={...process.env,TUOMIN_MCP_USER_DATA:userData,TUOMIN_MCP_USERNAME:'synthetic'};
 delete env.TUOMIN_MCP_PASSWORD;
 const child=spawn(process.execPath,['--import','tsx','scripts/mcp-stdio.ts'],{cwd:directory,env,stdio:['pipe','pipe','pipe']});
 let output='',stderr='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>stderr+=data);child.stdin.end();
 const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 assert.equal(exit,1,stderr);assert.equal(output,'');assert.match(stderr,/MCP_START_FAILED/);
 const diag=join(userData,'diagnostics','ai-collab'),zipNames=(await readdir(diag)).filter(name=>name.endsWith('.zip'));
 assert.equal(zipNames.length,1);
 const files=await readZip(await readFile(join(diag,zipNames[0])));
 assert.deepEqual([...files.keys()].sort(),['问题摘要.txt','协作过程.jsonl','环境信息.json'].sort());
 const content=[...files.values()].map(value=>value.toString()).join('\n');
 assert.match(content,/"stage":"connector","outcome":"failed"/);
 assert.match(content,/"code":"INTERNAL_ERROR"/);
 assert.doesNotMatch(content,/synthetic-secret-private-path|source_path/);
 await rm(userData,{recursive:true,force:true});
 results.push({scenario,passed:true,exit,zipCount:zipNames.length});
}
for(const scenario of ['diagnostics-root-is-file','diagnostics-root-readonly','diagnostics-root-symlink']){
 const temp=await mkdtemp(join(tmpdir(),'tmw-056-connector-diag-unusable-'));
 const userData=join(temp,'user-data');
 if(scenario==='diagnostics-root-is-file')await writeFile(userData,'not a directory');
 if(scenario==='diagnostics-root-readonly'){await mkdir(userData);await chmod(userData,0o500);}
 if(scenario==='diagnostics-root-symlink'){await mkdir(join(temp,'actual'));await symlink(join(temp,'actual'),userData);}
 let calls=0;
 const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):{};
  if(req.url==='/api/login'){res.setHeader('set-cookie','session=synthetic; HttpOnly');res.end('{}');return;}
  if(req.method==='DELETE'||req.url==='/api/logout'){res.end('{}');return;}
  if(body.method==='initialize'){res.setHeader('mcp-session-id','synthetic-session');res.end(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-11-25'}}));return;}
  if(body.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
  calls++;res.end(JSON.stringify({jsonrpc:'2.0',id:3,result:{structuredContent:{ok:true}}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const child=spawn(process.execPath,['--import','tsx','scripts/mcp-stdio.ts'],{cwd:directory,env:{...process.env,TUOMIN_MCP_URL:`http://127.0.0.1:${server.address().port}/`,TUOMIN_MCP_USERNAME:'synthetic',TUOMIN_MCP_PASSWORD:'synthetic-secret-private-path',TUOMIN_MCP_USER_DATA:userData},stdio:['pipe','pipe','pipe']});
 let output='',stderr='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>stderr+=data);
 child.stdin.end([{jsonrpc:'2.0',id:1,method:'initialize'},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_lawbot_capabilities',arguments:{source_path:'synthetic-secret-private-path'}}}].map(JSON.stringify).join('\n')+'\n');
 const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 await new Promise(resolve=>server.close(resolve));
 const responses=output.trim().split('\n').map(JSON.parse);
 assert.equal(exit,0,stderr);assert.equal(calls,1);assert.equal(responses[1].result.structuredContent.ok,true);
 assert.match(stderr,/MCP_DIAGNOSTICS_DISABLED/);assert.doesNotMatch(stderr,/synthetic-secret-private-path|user-data/);
 if(scenario==='diagnostics-root-readonly')await chmod(userData,0o700);
 await rm(temp,{recursive:true,force:true});
 results.push({scenario,passed:true,exit,calls,diagnosticsDisabled:true});
}
await writeFile(new URL('connector-diagnostics-test-receipt.json',import.meta.url),JSON.stringify({scope:'actual candidate stdio HTTP client only, synthetic server; not production API idempotence proof',node:process.version,results},null,2)+'\n');
console.log(JSON.stringify(results));
