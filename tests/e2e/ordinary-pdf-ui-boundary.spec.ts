import {test,expect} from './fixture.ts';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {pdfFixture} from '../pdf-fixtures.ts';
import {MCP_PROTOCOL} from '../../packages/core/mcp-tools.ts';

// Real queued jobs and real MCP authorization. Worker claim is held by the
// same isolated-database advisory lock used by the existing automatic Edge case.
test('ordinary PDF controls and checkpoints stay off TXT and MCP PDF while generic progress remains',async({page})=>{
 test.setTimeout(240000);page.setDefaultTimeout(15000);
 const dbUrl=new URL(process.env.MIGRATION_DATABASE_URL!);if(!dbUrl.pathname.startsWith('/tmw_test_'))throw Error('ISOLATED_DATABASE_REQUIRED');
 const gate=new pg.Client({connectionString:dbUrl.href});await gate.connect();
 let held=false;const hold=async()=>{if(!held){await gate.query('SELECT pg_advisory_lock(7843,2)');held=true;}};
 const release=async()=>{if(held){await gate.query('SELECT pg_advisory_unlock(7843,2)');held=false;}};
 const paths:string[]=[],errors:string[]=[];
 page.on('request',r=>{const p=new URL(r.url()).pathname;if(p.startsWith('/api/'))paths.push(p);});
 page.on('response',r=>{if(r.status()===429)errors.push(`429 ${new URL(r.url()).pathname}`);});
 page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:5178';
 const post=(path:string,data:unknown,headers:Record<string,string>={})=>page.request.post(path,{data,headers:{origin,...headers}});
 const ok=async(response:{status:()=>number;text:()=>Promise<string>;json:()=>Promise<any>})=>{expect(response.status(),await response.text()).toBe(200);return response.json();};
 try{
  await hold();
  await page.goto('/');await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'登录工作台'}).click();
  const projectName='PDF控件边界-'+randomUUID().slice(0,8);
  await page.locator('.create-project summary').click();await page.getByLabel('项目名称',{exact:true}).fill(projectName);
  const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/projects'&&r.request().method()==='POST');await page.getByRole('button',{name:'新建项目',exact:true}).click();const project=(await ok(await created)).id as string;
  const txt=await ok(await post(`/api/projects/${project}/documents`,{text:'公开合成文本 电话13800138000',requestId:randomUUID()}));
  // API fixture insertion does not mutate the already-mounted empty list.
  // Re-enter through the actual browser/project path before testing controls.
  await page.reload();
  const initialList=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/projects/${project}/documents`&&r.request().method()==='GET');
  await page.getByRole('navigation',{name:'项目列表'}).getByRole('button',{name:projectName,exact:true}).click();
  const initialDocs=await ok(await initialList);expect(initialDocs.some((d:any)=>d.id===txt.id)).toBe(true);
  const txtAt=paths.length;
  await page.getByRole('region',{name:'材料列表'}).getByRole('button',{name:/文本 1/}).click();
  const txtView=await ok(await page.request.get(`/api/documents/${txt.id}`));expect(txtView.job.ordinaryPdfDetection).toBe(false);
  await release();
  await expect.poll(async()=>(await ok(await page.request.get(`/api/documents/${txt.id}`))).state,{timeout:120000,intervals:[2000]}).toBe('review');
  await expect(page.getByRole('region',{name:'处理进度'})).toContainText('处理已完成');
  expect(paths.slice(txtAt).filter(p=>/\/pdf-ocr\/(?:progress|draft)/u.test(p)||p.includes('/pdf-seals/progress'))).toEqual([]);
  await hold();
  const source=pdfFixture({pages:1,text:'Public synthetic PDF 13800138000'}),batch=randomUUID(),requestId=randomUUID();
  await ok(await post(`/api/projects/${project}/upload-batches`,{id:batch,files:[{requestId,path:'ordinary-boundary.pdf',size:source.length}]}));
  const upload=await page.request.post(`/api/projects/${project}/files?batchId=${batch}&requestId=${requestId}`,{data:source,headers:{origin,'content-type':'application/octet-stream'}});const pdf=await ok(upload);
  await page.getByRole('button',{name:'返回材料列表'}).click();
  const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/projects/${project}/documents`&&r.request().method()==='GET');
  await page.getByRole('region',{name:'材料列表'}).getByRole('button',{name:'刷新材料'}).click();
  const refreshedDocs=await ok(await refreshed);expect(refreshedDocs.some((d:any)=>d.id===pdf.id)).toBe(true);
  await page.getByRole('region',{name:'材料列表'}).getByRole('button',{name:/ordinary-boundary\.pdf/u}).click();
  const ordinary=await ok(await page.request.get(`/api/documents/${pdf.id}`));expect(ordinary.state).toBe('queued');expect(ordinary.job.ordinaryPdfDetection).toBe(true);
  await expect(page.getByRole('button',{name:'暂停图片识别',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'运行中 PDF 页面人工草稿'})).toBeVisible();
  await expect.poll(()=>paths.some(p=>p===`/api/jobs/${ordinary.job.id}/pdf-ocr/progress`)).toBe(true);
  await release();
  await expect.poll(async()=>(await ok(await page.request.get(`/api/documents/${pdf.id}`))).state,{timeout:120000,intervals:[2000]}).toBe('review');
  await hold();
  const init=await post('/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'boundary-edge-client',version:'1'}}});expect(init.status()).toBe(200);
  const headers={'mcp-session-id':init.headers()['mcp-session-id'],'mcp-protocol-version':MCP_PROTOCOL};
  expect((await post('/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},headers)).status()).toBe(202);
  const started=await ok(await post('/api/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'start_lawbot_redaction_for_user_manual_review',arguments:{project_id:project,document_ids:[pdf.id],task_mode:'redact_only',masking_mode:'default_mask',output_formats:['original'],request_id:randomUUID()}}},headers));
  expect(started.result.isError).toBe(false);const task=started.result.structuredContent.jobId as string;
  await page.goto(`/?collab=${task}`);
  const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'AI 协作',exact:true})});
  const consent=panel.getByRole('group',{name:'授权给 MCP 客户端'});await expect(consent).toBeVisible();
  await consent.getByRole('checkbox',{name:'允许读取本项目选定材料并脱敏'}).check();
  await consent.getByRole('checkbox',{name:'允许将经系统审定或人工复核的脱敏稿交给当前客户端'}).check();
  await consent.getByRole('checkbox',{name:'创建受保护的协作文件'}).check();
  await consent.getByRole('checkbox',{name:'授权后打开材料页'}).uncheck();
  const authorize=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/ai-collab/tasks/${task}/authorize`&&r.request().method()==='POST');
  await consent.getByRole('button',{name:'确认授权并识别材料'}).click();expect((await authorize).status()).toBe(200);
  const mcpAt=paths.length;
  await panel.getByRole('button',{name:'复核材料 1'}).click();
  const mcp=await ok(await page.request.get(`/api/documents/${pdf.id}`));expect(mcp.state).toBe('queued');expect(mcp.job.ordinaryPdfDetection).toBe(false);expect(mcp.job.canObserveEvents).toBe(true);
  await expect(page.getByRole('button',{name:'暂停图片识别',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'继续图片识别',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'暂停印章',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'运行中 PDF 页面人工草稿'})).toHaveCount(0);
  expect(paths.slice(mcpAt).filter(p=>/\/pdf-ocr\/(?:progress|draft)/u.test(p)||p.includes('/pdf-seals/progress'))).toEqual([]);
  await release();
  await expect.poll(async()=>(await ok(await page.request.get(`/api/documents/${pdf.id}`))).state,{timeout:120000,intervals:[2000]}).toBe('review');
  await expect(page.getByRole('region',{name:'处理进度'})).toContainText('处理已完成');
  expect(paths.slice(mcpAt).filter(p=>/\/pdf-ocr\/(?:progress|draft)/u.test(p)||p.includes('/pdf-seals/progress'))).toEqual([]);
  expect(errors).toEqual([]);
 }finally{await release();await gate.end();}
});
