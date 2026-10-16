import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const cwd=resolve(import.meta.dirname,'..');
for(const offered of ['2025-06-18','2025-11-25','2099-01-01']){
 const selected=offered==='2025-06-18'?offered:'2025-11-25';
 const seen=[];const data=await mkdtemp(join(tmpdir(),'tmw-protocol-'));
 const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):{};
  if(req.url==='/api/login'){res.setHeader('set-cookie','session=synthetic; HttpOnly');res.end('{}');return;}
  if(req.url==='/api/logout'){res.end('{}');return;}
  if(req.method==='DELETE'){seen.push({method:'DELETE',header:req.headers['mcp-protocol-version']});res.end('{}');return;}
  if(body.method==='initialize'){assert.equal(body.params.protocolVersion,offered);res.setHeader('mcp-session-id','synthetic-session');res.end(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:selected}}));return;}
  seen.push({method:body.method,header:req.headers['mcp-protocol-version'],session:req.headers['mcp-session-id']});
  if(body.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
  res.end(JSON.stringify({jsonrpc:'2.0',id:2,result:{tools:[]}}));
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const child=spawn(process.execPath,['--import','tsx','scripts/mcp-stdio.ts'],{cwd,env:{...process.env,TUOMIN_MCP_URL:`http://127.0.0.1:${server.address().port}/`,TUOMIN_MCP_USERNAME:'synthetic',TUOMIN_MCP_PASSWORD:'synthetic-password',TUOMIN_MCP_USER_DATA:data},stdio:['pipe','pipe','pipe']});
 let output='',stderr='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
 child.stdin.end([{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:offered,clientInfo:{name:'synthetic',version:'1'}}},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:2,method:'tools/list'}].map(JSON.stringify).join('\n')+'\n');
 const exit=await new Promise((done,reject)=>{child.on('error',reject);child.on('close',done);});
 await new Promise(done=>server.close(done));
 assert.equal(exit,0,stderr);assert.deepEqual(output.trim().split('\n').map(JSON.parse).map(x=>x.result?.protocolVersion??x.result?.tools?.length),[selected,0]);
 assert.deepEqual(seen.map(x=>x.header),[selected,selected,selected]);
 assert.deepEqual(seen.slice(0,2).map(x=>x.session),['synthetic-session','synthetic-session']);
 await rm(data,{recursive:true,force:true});
 console.log(JSON.stringify({offered,selected,exit,requests:seen}));
}
