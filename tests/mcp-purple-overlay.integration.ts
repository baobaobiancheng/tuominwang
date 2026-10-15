import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import sharp from 'sharp';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {hash,passwordHash,readArtifact,readOriginal} from '../packages/adapters/storage.ts';
import {RasterPdf,MASK_COLORS} from '../packages/core/page-redaction.ts';
import {openPdf} from '../packages/core/pdf-reader.ts';
import {MCP_PROTOCOL} from '../packages/core/mcp-tools.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
const app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});
const consent={allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false};

for(const format of ['png','pdf'] as const)test(`MCP purple_overlay ${format} stores default star and paints real purple pixels`,{timeout:120000},async()=>{
 const uid=randomUUID(),tenant=randomUUID(),username=`purple-${format}-${uid}`,password='synthetic-purple-password';
 await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[uid,tenant,username,passwordHash(password)]);
 const origin=process.env.APP_ORIGIN!,login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
 assert.equal(login.statusCode,200,login.body);
 const cookie=String(login.headers['set-cookie']).split(';')[0];
 const req=(method:any,url:string,payload?:any,binary=false,extra:Record<string,string>={})=>app.inject({method,url,payload,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{},...extra}});
 const project=(await req('POST','/api/projects',{name:`紫色遮盖 ${format}`,applyDefaultPresets:true})).json().id as string;
 const png=await readFile('tests/fixtures/image-utilities-synthetic.png');
 const pdf=new RasterPdf();pdf.add({index:0,width:600,height:200},await sharp(png).removeAlpha().raw().toBuffer(),600,200);
 const source=format==='png'?png:pdf.finish(),batch=randomUUID(),requestId=randomUUID();
 const batchResponse=await req('POST',`/api/projects/${project}/upload-batches`,{id:batch,files:[{requestId,path:`purple.${format}`,size:source.length}]});
 assert.equal(batchResponse.statusCode,200,batchResponse.body);
 const upload=await req('POST',`/api/projects/${project}/files?batchId=${batch}&requestId=${requestId}`,source,true);
 assert.equal(upload.statusCode,200,upload.body);const doc=upload.json().id as string,url=`/api/documents/${doc}`;
 for(let i=0;i<10;i++){const state=(await req('GET',url)).json().state;if(state==='review')break;await tick();}
 assert.equal((await req('GET',url)).json().state,'review');
 const initialized=await req('POST','/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'purple-probe',version:'1'}}});
 assert.equal(initialized.statusCode,200,initialized.body);const session={'mcp-session-id':String(initialized.headers['mcp-session-id']),'mcp-protocol-version':MCP_PROTOCOL};
 assert.equal((await req('POST','/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},false,session)).statusCode,202);
 const started=await req('POST','/api/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'start_lawbot_redaction',arguments:{project_id:project,document_ids:[doc],task_mode:'redact_only',masking_mode:'purple_overlay',output_formats:['original'],request_id:randomUUID()}}},false,session);
 assert.equal(started.statusCode,200,started.body);assert.equal(started.json().result.isError,false,started.body);const job=started.json().result.structuredContent.jobId as string;
 const task=(await req('GET',`/api/ai-collab/tasks/${job}`)).json();
 const authorized=await req('POST',`/api/ai-collab/tasks/${job}/authorize`,{revision:task.revision,authorization:consent});
 assert.equal(authorized.statusCode,200,authorized.body);
 for(let i=0;i<10;i++){const state=(await req('GET',url)).json().state;if(state==='review')break;await tick();}
 const configured=(await req('GET',`${url}/configuration`)).json().configuration;
 assert.equal(configured.exportMode,'default_star');assert.equal(configured.maskStyle,'purple');
 let view=(await req('GET',url)).json();assert.equal(view.state,'review');
 const target=view.marks.find((m:any)=>m.kind==='手机号');assert.ok(target,JSON.stringify(view.marks));
 assert.notEqual(target.replacement?.mode,'alias');
 const marks=view.marks.map((m:any)=>({...m,decision:m.start===target.start&&m.end===target.end?'redact':'ignore'}));
 const saved=await req('PUT',`${url}/review`,{revision:view.revision,marks,pageReview:{mode:'raster',maskStyle:'purple',regions:[],deletedPages:[]}});
 assert.equal(saved.statusCode,200,saved.body);view=(await req('GET',url)).json();
 const exportResponse=await req('POST',`${url}/export`,{revision:view.revision});assert.equal(exportResponse.statusCode,200,exportResponse.body);
 for(let i=0;i<10;i++){await tick();view=(await req('GET',url)).json();if(view.job?.status==='succeeded')break;if(view.job?.status==='failed')throw Error(JSON.stringify(view.job));}
 assert.equal(view.job?.status,'succeeded',JSON.stringify(view.job));
 const linked=await req('POST',`${url}/download-link`,{revision:view.revision});assert.equal(linked.statusCode,200,linked.body);
 const downloaded=await app.inject({url:linked.json().url});assert.equal(downloaded.statusCode,200);
 let image=downloaded.rawPayload;if(format==='pdf'){const reader=await openPdf(image);try{assert.equal(reader.count,1);image=(await reader.page(0)).png;}finally{reader.close();}}
 const stored=(await admin.query('SELECT source_id,page_data,anchors FROM documents WHERE id=$1',[doc])).rows[0];
 assert.deepEqual(await readOriginal(stored.source_id),source);
 const pixels=await sharp(image).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const purple=MASK_COLORS.purple,white=MASK_COLORS.white;
 let purpleCount=0;for(let i=0;i<pixels.data.length;i+=3)if(pixels.data[i]===purple[0]&&pixels.data[i+1]===purple[1]&&pixels.data[i+2]===purple[2])purpleCount++;
 assert.ok(purpleCount>100,`expected substantial purple fill, got ${purpleCount} pixels`);
 const sourcePixels=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
 let sourcePurple=0;for(let i=0;i<sourcePixels.data.length;i+=3)if(sourcePixels.data[i]===purple[0]&&sourcePixels.data[i+1]===purple[1]&&sourcePixels.data[i+2]===purple[2])sourcePurple++;
 assert.equal(sourcePurple,0,'source fixture has no exact purple fill');
 const page=stored.page_data[0],anchor=stored.anchors.find((a:any)=>a.kind==='page'&&a.page===0);assert.ok(anchor);
 const glyphs=JSON.parse(await readArtifact(page.mapId)).filter((g:number[])=>g[0]<target.end-anchor.start&&g[1]>target.start-anchor.start);
 assert.ok(glyphs.length>0);const sx=pixels.info.width/page.width,sy=pixels.info.height/page.height;
 let selectedPurple=0;for(const g of glyphs)for(let y=Math.floor(g[3]*sy);y<Math.ceil((g[3]+g[5])*sy);y++)for(let x=Math.floor(g[2]*sx);x<Math.ceil((g[2]+g[4])*sx);x++){const at=(y*pixels.info.width+x)*3;if(pixels.data[at]===purple[0]&&pixels.data[at+1]===purple[1]&&pixels.data[at+2]===purple[2])selectedPurple++;}
 assert.ok(selectedPurple>100,`purple must occupy selected phone glyphs, got ${selectedPurple}`);
 const sample=(x:number,y:number)=>{const at=(y*pixels.info.width+x)*3;return [...pixels.data.subarray(at,at+3)];};
 assert.notDeepEqual(sample(5,5),purple,'outside selected mark stays unpainted');
 assert.notDeepEqual(purple,white);
 console.log(JSON.stringify({format,sourceSha256:hash(source),downloadSha256:hash(downloaded.rawPayload),purpleCount,selectedPurple,sourcePurple,configured}));
});
