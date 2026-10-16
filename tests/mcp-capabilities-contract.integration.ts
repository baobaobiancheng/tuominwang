import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {resolve,sep} from 'node:path';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {registerMcpRoutes} from '../apps/api/mcp.ts';
import {applyDocumentConfiguration} from '../apps/api/document-policy.ts';
import {pool} from '../packages/adapters/db.ts';
import {passwordHash,hash,seal} from '../packages/adapters/storage.ts';
import {defaultProfile} from '../packages/core/presets.ts';
import {MCP_PROTOCOL} from '../packages/core/mcp-tools.ts';

// Copy to tests/; run via tests/run-isolated.ts integration only.
function isolated(){
 const app=new URL(process.env.DATABASE_URL??''),migration=new URL(process.env.MIGRATION_DATABASE_URL??'');
 assert.match(decodeURIComponent(app.pathname),/^\/tmw_test_[a-z0-9_]+$/);
 assert.equal(app.pathname,migration.pathname);assert.equal(app.hostname,migration.hostname);assert.equal(app.port,migration.port);
 assert.ok(resolve(process.env.DATA_DIR??'').startsWith(resolve('.data/test-runs')+sep));
}
isolated();

test('MCP capabilities retain public keys with truthful web file semantics and cloud extensions',{timeout:30_000},async()=>{
 const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
 let app:Awaited<ReturnType<typeof buildApp>>|undefined;
 try{
  assert.match((await admin.query('SELECT current_database() AS name')).rows[0].name,/^tmw_test_/);
  app=await buildApp();if(!app.hasRoute({method:'POST',url:'/api/mcp'}))registerMcpRoutes(app,applyDocumentConfiguration);
  const origin=process.env.APP_ORIGIN!,tenant=randomUUID(),user=randomUUID(),username=`capabilities-${user}`,password='synthetic-capabilities-password';
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
  const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
  assert.equal(login.statusCode,200,login.body);const cookie=String(login.headers['set-cookie']).split(';')[0];
  const call=(payload:any,headers:any={})=>app!.inject({method:'POST',url:'/api/mcp',headers:{origin,cookie,...headers},payload});
  const init=await call({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'contract-test',version:'1'}}});
  assert.equal(init.statusCode,200,init.body);
  const headers={'mcp-session-id':String(init.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
  assert.equal((await call({jsonrpc:'2.0',method:'notifications/initialized'},headers)).statusCode,202);
  const response=await call({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_lawbot_capabilities',arguments:{}}},headers);
  assert.equal(response.statusCode,200,response.body);const result=response.json().result;
  assert.equal(result.isError,false,JSON.stringify(result));const c=result.structuredContent;
  assert.deepEqual(c.interfaces,['review','file','restore','configuration']);
  assert.deepEqual(c.reviewModes,['automatic','human_review']);
  assert.equal(c.reviewModes.includes('automatic'),true,'ordinary MCP start supports the approved automatic mode');
  assert.deepEqual(c.inputFormats,['docx','doc','wps','md','markdown','pdf','jpg','jpeg','png']);
  assert.deepEqual(c.taskModes,['redact_only','ai_process','ai_process_restore']);
  assert.deepEqual(c.documentTypes,['auto','general','contract','disclosure','judgment','pleading','official_letter','screenshot']);
  assert.deepEqual(c.maskingModes,['pseudonym','default_mask','full_star','purple_overlay']);
  assert.deepEqual(c.outputFormats,['original','md']);
  assert.deepEqual(c.batch,{maxFiles:100,unifiedPseudonyms:true});
  assert.deepEqual(c.file,{defaults:'project_redaction_policy',outputOverride:'none_browser_managed',archiveValidatedAiResult:true,archiveLocation:'private_cloud_project',validatedResultStorage:'private_cloud_project_archive_downloadable',sourceReference:'document:<uploaded document UUID>'});
  assert.match(c.safetyBoundary,/does not return originals, mappings, or restored outputs/);
  assert.match(c.safetyBoundary,/cannot restrict an external AI assistant own shell or filesystem tools/);
  assert.equal(c.cloudUploadRequired,true);assert.equal(c.externalProvider,'not_configured');
  assert.deepEqual(c.osConnectors,{dsh:'configuration_only',workbuddy:'configuration_only',qwenwork:'configuration_only'});
  assert.equal(JSON.stringify(c).includes(process.env.DATA_KEY??'ABSENT_SECRET'),false);
  // Actual settings API accepts a stored name with an embedded control code.
  // The MCP catalog must apply the public gateway's output projection while
  // leaving the full name in the human-owned Web catalog.
  const name='A\n'+('甲'.repeat(130));
  const profile=await app.inject({method:'POST',url:'/api/presets/profiles',headers:{origin,cookie},payload:{name}});
  assert.equal(profile.statusCode,200,profile.body);const profileId=profile.json().settings.id;
  const rule=await app.inject({method:'POST',url:'/api/presets/rulesets',headers:{origin,cookie},payload:{name:'R\t'+('乙'.repeat(130))}});
  assert.equal(rule.statusCode,200,rule.body);const ruleId=rule.json().settings.id;
  // Create one valid template through each real API, then seed enough valid,
  // correctly AAD-sealed owner rows to exercise the public 200-item projection
  // without making hundreds of rate-limited HTTP requests.
  const template=defaultProfile(),ruleTemplate=rule.json().settings,stamp='2026-10-15T00:00:00.000Z';
  const seed=async(kind:'profile'|'ruleset')=>{
   const ids:string[]=[],names:string[]=[],hashes:string[]=[],payloads:string[]=[];
   for(let n=0;n<201;n++){
    const key=randomUUID(),label=kind==='profile'&&n===0?'A'.repeat(119)+'😀':`seed-${kind}-${String(n).padStart(3,'0')}`;
    const settings=kind==='profile'?{...template,id:key,name:label,source:'user',readonly:false,createdAt:stamp,updatedAt:stamp}:{...ruleTemplate,id:key,name:label,createdAt:stamp,updatedAt:stamp};
    ids.push(key);names.push(label);
    hashes.push(createHmac('sha256',Buffer.from(process.env.DATA_KEY!,'hex')).update(`${tenant}:${user}:${kind}:${label.toLocaleLowerCase('zh-CN')}`).digest('hex'));
    payloads.push(seal(JSON.stringify(settings),`${tenant}:${user}:preset:${key}`));
   }
   await admin.query(`INSERT INTO redaction_presets(id,tenant_id,owner_id,kind,revision,name_hash,payload,created_at,updated_at)
    SELECT entry.id,$1,$2,$3,1,entry.name_hash,entry.payload,$4::timestamptz,$4::timestamptz
    FROM unnest($5::uuid[],$6::text[],$7::text[]) AS entry(id,name_hash,payload)`,[tenant,user,kind,stamp,ids,hashes,payloads]);
   if(kind==='profile')await admin.query("UPDATE redaction_presets SET updated_at=now()+interval '1 minute' WHERE id=$1",[ids[0]]);
   return ids[0];
  };
  const astralProfileId=await seed('profile');await seed('ruleset');
  const catalogueResponse=await call({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'list_lawbot_saved_settings',arguments:{}}},headers);
  assert.equal(catalogueResponse.statusCode,200,catalogueResponse.body);
  const catalogue=catalogueResponse.json().result.structuredContent;
  const listedProfile=catalogue.profiles.find((x:any)=>x.id===profileId),listedRule=catalogue.ruleSets.find((x:any)=>x.id===ruleId);
  assert.ok(listedProfile);assert.ok(listedRule);
  assert.equal(listedProfile.name,('A'+('甲'.repeat(130))).slice(0,120));
  assert.equal(listedRule.name,('R'+('乙'.repeat(130))).slice(0,120));
  assert.equal(catalogue.profiles.length,200);assert.equal(catalogue.ruleSets.length,200);
  assert.match(catalogue.instructions,/不得猜测替代/);
  const webProfile=await app.inject({method:'GET',url:'/api/presets/profiles',headers:{origin,cookie}});
  assert.equal(webProfile.statusCode,200,webProfile.body);
  const webRules=await app.inject({method:'GET',url:'/api/presets/rulesets',headers:{origin,cookie}});
  assert.equal(webRules.statusCode,200,webRules.body);
  const rawProfiles=webProfile.json().items,rawRules=webRules.json().items;
  assert.equal(rawProfiles.length,203);assert.equal(rawRules.length,202);
  assert.deepEqual(catalogue.profiles.map((x:any)=>x.id),rawProfiles.slice(0,200).map((x:any)=>x.settings.id));
  assert.deepEqual(catalogue.ruleSets.map((x:any)=>x.id),rawRules.slice(0,200).map((x:any)=>x.settings.id));
  assert.equal(catalogue.profiles.some((x:any)=>x.id===rawProfiles[200].settings.id),false);
  assert.equal(catalogue.ruleSets.some((x:any)=>x.id===rawRules[200].settings.id),false);
  const astral=catalogue.profiles.find((x:any)=>x.id===astralProfileId);
  assert.ok(astral);assert.equal(astral.name.length,120);
  assert.equal(astral.name.charCodeAt(119),0xd83d,'source UTF-16 slice(0,120) can split a valid non-BMP name');
  assert.equal(astral.name.isWellFormed(),false);
  assert.equal(rawProfiles.find((x:any)=>x.settings.id===astralProfileId).settings.name,'A'.repeat(119)+'😀');
  assert.equal(rawProfiles.find((x:any)=>x.settings.id===profileId).settings.name,name,'MCP sanitization must not rewrite stored Web setting');
  assert.equal(rawRules.find((x:any)=>x.settings.id===ruleId).settings.name,'R\t'+('乙'.repeat(130)));
  assert.equal(hash(JSON.stringify(rawProfiles.slice(0,200).map((x:any)=>x.settings.id))),hash(JSON.stringify(catalogue.profiles.map((x:any)=>x.id))));
 }finally{await app?.close();await pool.end();await admin.end();}
});
