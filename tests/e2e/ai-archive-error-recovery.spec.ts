// Candidate for tests/e2e/ai-archive-error-recovery.spec.ts; run only with the isolated Edge runner.
import {test,expect} from './fixture.ts';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {hash} from '../../packages/adapters/storage.ts';
import {MCP_PROTOCOL} from '../../packages/core/mcp-tools.ts';

test('archive loading separates a late prior-task failure and recovers by a real GET retry',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/');
 await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);
 await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);
 await page.getByRole('button',{name:'登录工作台'}).click();
 await page.locator('.create-project summary').click();
 await page.getByLabel('项目名称',{exact:true}).fill(`归档网络恢复-${randomUUID().slice(0,8)}`);
 const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/projects'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'新建项目',exact:true}).click();
 const projectResponse=await created;expect(projectResponse.status()).toBe(200);
 const project=(await projectResponse.json()).id as string;
 const origin=new URL(page.url()).origin;
 const post=(path:string,data:unknown,headers:Record<string,string>={})=>page.request.post(path,{data,headers:{origin,...headers}});
 const init=await post('/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'archive-edge',version:'1'}}});
 expect(init.status()).toBe(200);
 const session={'mcp-session-id':init.headers()['mcp-session-id'],'mcp-protocol-version':MCP_PROTOCOL};
 expect((await post('/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},session)).status()).toBe(202);
 async function start(id:number){const response=await post('/api/mcp',{jsonrpc:'2.0',id,method:'tools/call',params:{name:'start_lawbot_redaction',arguments:{project_id:project,task_mode:'redact_only',request_id:randomUUID()}}},session);expect(response.status()).toBe(200);const result=(await response.json()).result;expect(result.isError).toBe(false);return result.structuredContent.jobId as string;}
 const a=await start(2),b=await start(3);
 // Source-less tasks must be genuinely authorized before the archive panel is visible.
 for(const job of [a,b]){
  const taskResponse=await page.request.get(`/api/ai-collab/tasks/${job}`);expect(taskResponse.status()).toBe(200);
  const task=await taskResponse.json();expect(task.state).toBe('waiting_for_session_authorization');
  const authorized=await post(`/api/ai-collab/tasks/${job}/authorize`,{revision:task.revision,authorization:{allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false}});
  expect(authorized.status(),await authorized.text()).toBe(200);
  expect((await authorized.json()).state).toBe('waiting_for_user_file_selection');
 }
 let releaseA!:()=>void;const heldA=new Promise<void>(resolve=>{releaseA=resolve;});let aIntercepted!:()=>void;const sawA=new Promise<void>(resolve=>{aIntercepted=resolve;});
 let failB=false,failedB=0;
 await page.route('**/api/ai-collab/tasks/*/archives',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path===`/api/ai-collab/tasks/${a}/archives`){aIntercepted();await heldA;await route.abort('failed');return;}
  if(path===`/api/ai-collab/tasks/${b}/archives`&&failB){failB=false;failedB++;await route.abort('failed');return;}
  await route.continue();
 });
 await page.goto(`/?collab=${a}`);
 const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'AI 协作',exact:true})});
 const archive=panel.getByRole('group',{name:'已校验返回稿归档'});
 await sawA;
 await expect(archive.getByText('正在读取归档…')).toBeVisible();
 await expect(archive.getByText('暂无归档返回稿。')).toHaveCount(0);
 await panel.getByRole('combobox',{name:'协作任务'}).selectOption(b);
 await expect(archive.getByText('暂无归档返回稿。')).toBeVisible();
 const lateA=page.waitForEvent('requestfailed',request=>new URL(request.url()).pathname===`/api/ai-collab/tasks/${a}/archives`);
 releaseA();
 await lateA;
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(archive.getByRole('alert')).toHaveCount(0);
 await expect(panel.getByRole('alert')).toHaveCount(0);
 // Trigger one genuine browser GET failure on B, then recover through the UI retry.
 failB=true;
 const failedAgainA=page.waitForEvent('requestfailed',request=>new URL(request.url()).pathname===`/api/ai-collab/tasks/${a}/archives`);
 await panel.getByRole('combobox',{name:'协作任务'}).selectOption(a);
 await failedAgainA;
 await expect(archive.getByRole('alert')).toContainText('归档暂时无法读取');
 await panel.getByRole('combobox',{name:'协作任务'}).selectOption(b);
 await expect.poll(()=>failedB).toBe(1);
 await expect(archive.getByRole('alert')).toContainText('归档暂时无法读取');
 await expect(archive.getByText('暂无归档返回稿。')).toHaveCount(0);
 const retried=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/ai-collab/tasks/${b}/archives`&&r.request().method()==='GET'&&r.status()===200);
 await archive.getByRole('button',{name:'重试读取归档'}).click();
 expect((await retried).status()).toBe(200);
 await expect(archive.getByRole('alert')).toHaveCount(0);
 await expect(archive.getByText('暂无归档返回稿。')).toBeVisible();
 const evidence=resolve('.data/research/lawbot-2026-10-15/iteration051/remaining-contract-audit/frontend/e2e');
 await mkdir(evidence,{recursive:true});await archive.screenshot({path:resolve(evidence,`archive-recovered-${randomUUID()}.png`)});
});

test('a real validated AI return appears in the archive UI and downloads unchanged bytes',async({page})=>{
 test.setTimeout(180000);
 await page.goto('/');
 await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);
 await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);
 await page.getByRole('button',{name:'登录工作台'}).click();
 await page.locator('.create-project summary').click();
 await page.getByLabel('项目名称',{exact:true}).fill(`真实归档展示-${randomUUID().slice(0,8)}`);
 const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/projects'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'新建项目',exact:true}).click();
 const projectResponse=await created;expect(projectResponse.status()).toBe(200);
 const project=(await projectResponse.json()).id as string;
 const origin=new URL(page.url()).origin;
 const post=(path:string,data:unknown,headers:Record<string,string>={})=>page.request.post(path,{data,headers:{origin,...headers}});
 const put=(path:string,data:unknown)=>page.request.put(path,{data,headers:{origin}});
 async function ok(response:Awaited<ReturnType<typeof post>>){expect(response.status(),await response.text()).toBe(200);return response.json();}
 const doc=await ok(await post(`/api/projects/${project}/documents`,{text:'邮箱：archive-edge@example.com',requestId:randomUUID()}));
 await expect.poll(async()=>{const response=await page.request.get(`/api/documents/${doc.id}`);return response.ok()?(await response.json()).state:'pending';},{timeout:60000}).toBe('review');
 const init=await post('/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'archive-ui-edge',version:'1'}}});
 expect(init.status()).toBe(200);
 const session={'mcp-session-id':init.headers()['mcp-session-id'],'mcp-protocol-version':MCP_PROTOCOL};
 expect((await post('/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},session)).status()).toBe(202);
 let rpc=1;
 async function tool(name:string,args:Record<string,unknown>){const response=await post('/api/mcp',{jsonrpc:'2.0',id:++rpc,method:'tools/call',params:{name,arguments:args}},session);const value=await ok(response);expect(value.result.isError).toBe(false);return value.result.structuredContent;}
 const started=await tool('start_lawbot_redaction',{project_id:project,document_ids:[doc.id],masking_mode:'pseudonym',task_mode:'ai_process',output_formats:['original','md'],request_id:randomUUID()});
 const job=started.jobId as string;
 let task=await ok(await page.request.get(`/api/ai-collab/tasks/${job}`));
 await ok(await post(`/api/ai-collab/tasks/${job}/authorize`,{revision:task.revision,authorization:{allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false}}));
 await expect.poll(async()=>{const response=await page.request.get(`/api/documents/${doc.id}`);const value=response.ok()?await response.json():null;return value?.state==='review'&&value.job?.status==='succeeded'?'ready':value?.job?.status??'pending';},{timeout:60000}).toBe('ready');
 const document=await ok(await page.request.get(`/api/documents/${doc.id}`));
 await ok(await put(`/api/documents/${doc.id}/review`,{revision:document.revision,marks:document.marks.map((m:any)=>({...m,decision:'redact'}))}));
 task=await ok(await page.request.get(`/api/ai-collab/tasks/${job}`));
 const prepared=await ok(await post(`/api/ai-collab/tasks/${job}/prepare-export`,{revision:task.revision}));
 const exportJob=prepared.exportJobIds[0] as string;
 await expect.poll(async()=>{const response=await page.request.get(`/api/jobs/${exportJob}/events?after=0&limit=1`);return response.ok()?(await response.json()).status:`HTTP ${response.status()}`;},{timeout:60000}).toBe('succeeded');
 await ok(await post(`/api/ai-collab/tasks/${job}/release-export`,{revision:prepared.revision}));
 const delivery=await tool('receive_sanitized_document',{job_id:job,output_format:'md'});
 const source=Buffer.from(delivery.bytesBase64,'base64');expect(hash(source)).toBe(delivery.sha256);
 const returned=Buffer.from(source.toString()+'\n已校对。');
 await ok(await put(`/api/ai-collab/tasks/${job}/slots/${delivery.slotId}`,{bytesBase64:returned.toString('base64')}));
 const submitted=await tool('submit_reviewed_document',{job_id:job,round_id:delivery.roundId,slot_id:delivery.slotId,sha256:hash(returned),suggested_name:'归档稿.md'});
 expect(submitted.validation.valid).toBe(true);expect(submitted.archivedResult.sha256).toBe(hash(returned));
 await page.goto(`/?collab=${job}`);
 const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'AI 协作',exact:true})});
 const archive=panel.getByRole('group',{name:'已校验返回稿归档'});
 const link=archive.getByRole('link',{name:'下载 归档稿.md'});
 await expect(link).toBeVisible();
 await expect(archive).toContainText(hash(returned));
 await expect(archive).toContainText(hash(source));
 await expect(archive).toContainText('归档时尚未人工复核');
 const href=await link.getAttribute('href');expect(href).toBeTruthy();
 const downloaded=await page.request.get(href!);expect(downloaded.status()).toBe(200);expect(hash(await downloaded.body())).toBe(hash(returned));
 const evidence=resolve('.data/research/lawbot-2026-10-15/iteration051/remaining-contract-audit/frontend/e2e');
 await mkdir(evidence,{recursive:true});await archive.screenshot({path:resolve(evidence,`archive-real-receipt-${randomUUID()}.png`)});
});
