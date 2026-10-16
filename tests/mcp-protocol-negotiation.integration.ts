import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve,sep} from 'node:path';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {registerMcpRoutes} from '../apps/api/mcp.ts';
import {applyDocumentConfiguration} from '../apps/api/document-policy.ts';
import {passwordHash} from '../packages/adapters/storage.ts';

function isolated(){
 const app=new URL(process.env.DATABASE_URL??''),migration=new URL(process.env.MIGRATION_DATABASE_URL??'');
 assert.match(decodeURIComponent(app.pathname),/^\/tmw_test_[a-z0-9_]+$/);
 assert.equal(app.pathname,migration.pathname);assert.equal(app.hostname,migration.hostname);assert.equal(app.port,migration.port);
 assert.ok(resolve(process.env.DATA_DIR??'').startsWith(resolve('.data/test-runs')+sep));
}
isolated();
test('actual Fastify inject negotiates both implemented versions and binds HTTP headers to user session',{timeout:60_000},async()=>{
 const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
 let app:Awaited<ReturnType<typeof buildApp>>|undefined;
 try{
  assert.match((await admin.query('SELECT current_database() AS name')).rows[0].name,/^tmw_test_/);
  app=await buildApp();if(!app.hasRoute({method:'POST',url:'/api/mcp'}))registerMcpRoutes(app,applyDocumentConfiguration);
  const origin=process.env.APP_ORIGIN!,password='synthetic-mcp-protocol-password';
  const accounts=await Promise.all([0,1].map(async i=>{
   const tenant=randomUUID(),user=randomUUID(),username=`protocol-${i}-${user}`;
   await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
   const login=await app!.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
   assert.equal(login.statusCode,200,login.body);
   return {tenant,user,cookie:String(login.headers['set-cookie']).split(';')[0]};
  }));
  const sameTenantUser=randomUUID(),sameTenantName=`protocol-same-tenant-${sameTenantUser}`;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[sameTenantUser,accounts[0]!.tenant,sameTenantName,passwordHash(password)]);
  const sameTenantLogin=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username:sameTenantName,password}});
  assert.equal(sameTenantLogin.statusCode,200,sameTenantLogin.body);
  const sameTenantCookie=String(sameTenantLogin.headers['set-cookie']).split(';')[0];
  const call=(cookie:string,payload:any,headers:Record<string,string>={})=>app!.inject({method:'POST',url:'/api/mcp',headers:{origin,cookie,...headers},payload});
  for(const [index,offered] of ['2025-06-18','2025-11-25','2099-01-01',undefined].entries()){
   const selected=offered==='2025-06-18'?'2025-06-18':'2025-11-25';
   const params:any={clientInfo:{name:'protocol-isolated-test',version:'1'}};
   if(offered!==undefined)params.protocolVersion=offered;
   const init=await call(accounts[0]!.cookie,{jsonrpc:'2.0',id:index+1,method:'initialize',params});
   assert.equal(init.statusCode,200,init.body);
   assert.equal(init.json().result.protocolVersion,selected);
   assert.deepEqual(init.json().result.capabilities,{tools:{listChanged:false},resources:{listChanged:false}});
   const session=String(init.headers['mcp-session-id']);assert.match(session,/^[a-f0-9]{64}$/);
   const headers={'mcp-session-id':session,'mcp-protocol-version':selected};
   const wrong={'mcp-session-id':session,'mcp-protocol-version':selected==='2025-06-18'?'2025-11-25':'2025-06-18'};
   const n=await call(accounts[0]!.cookie,{jsonrpc:'2.0',method:'notifications/initialized'},headers);assert.equal(n.statusCode,202,n.body);
   const tools=await call(accounts[0]!.cookie,{jsonrpc:'2.0',id:10,method:'tools/list'},headers);assert.equal(tools.statusCode,200,tools.body);assert.equal(tools.json().result.tools.length,12);
   const resources=await call(accounts[0]!.cookie,{jsonrpc:'2.0',id:11,method:'resources/list'},headers);assert.equal(resources.statusCode,200,resources.body);assert.deepEqual(resources.json().result.resources,[]);
   const caps=await call(accounts[0]!.cookie,{jsonrpc:'2.0',id:12,method:'tools/call',params:{name:'get_lawbot_capabilities',arguments:{}}},headers);
   assert.equal(caps.statusCode,200,caps.body);assert.equal(caps.json().result.isError,false,caps.body);
   const bad=await call(accounts[0]!.cookie,{jsonrpc:'2.0',id:13,method:'tools/list'},wrong);assert.equal(bad.statusCode,400,bad.body);
   const missingHeader=await call(accounts[0]!.cookie,{jsonrpc:'2.0',id:14,method:'tools/list'},{'mcp-session-id':session});assert.equal(missingHeader.statusCode,400,missingHeader.body);
   const cross=await call(accounts[1]!.cookie,{jsonrpc:'2.0',id:15,method:'tools/list'},headers);assert.equal(cross.statusCode,403,cross.body);
   const crossUser=await call(sameTenantCookie,{jsonrpc:'2.0',id:16,method:'tools/list'},headers);assert.equal(crossUser.statusCode,403,crossUser.body);
   console.log(JSON.stringify({offered:offered??null,selected,sessionHeader:session.length,initialized:n.statusCode,tools:tools.json().result.tools.length,resources:resources.json().result.resources.length,capabilities:caps.statusCode,wrongHeader:bad.statusCode,missingHeader:missingHeader.statusCode,crossTenant:cross.statusCode,crossUser:crossUser.statusCode}));
  }
 }finally{await app?.close();await admin.end();}
});
