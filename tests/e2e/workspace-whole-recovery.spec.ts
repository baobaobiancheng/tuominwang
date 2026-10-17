// Research draft. Intended final location: tests/e2e/workspace-whole-recovery.spec.ts.
// No mocked recovery response: browser textarea, writer, project open and final save use real HTTP.
import {test,expect} from './fixture.ts';
import {randomUUID,createHash} from 'node:crypto';
import type {Response} from '@playwright/test';

const pathname=(response:Response)=>new URL(response.url()).pathname;
const writerSave=(documentId:string)=>(response:Response)=>response.request().method()==='PUT'&&pathname(response)===`/api/documents/${documentId}/recovery`;

test('two material browser interruption restores the active document, review choices and unsubmitted Markdown edit',async({page,context,browser},info)=>{
 test.setTimeout(180000);
 page.on('dialog',dialog=>void dialog.accept());
 await page.goto('/');
 await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);
 await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);
 await page.getByRole('button',{name:'登录工作台'}).click();
 const projectName=`双材料恢复-${randomUUID().slice(0,8)}`;
 await page.locator('.create-project summary').click();
 await page.getByLabel('项目名称',{exact:true}).fill(projectName);
 const created=page.waitForResponse(r=>r.request().method()==='POST'&&pathname(r)==='/api/projects');
 await page.getByRole('button',{name:'新建项目',exact:true}).click();
 const projectResponse=await created;expect(projectResponse.status()).toBe(200);
 const projectId=(await projectResponse.json()).id as string;
 const documents:{name:string;id:string}[]=[];
 for(const [name,phone] of [['甲.md','13800138000'],['乙.md','13900139000']] as const){
  await page.getByRole('button',{name:'导入材料',exact:true}).click();
  await page.getByLabel('选择文件',{exact:true}).setInputFiles({name,mimeType:'text/markdown',buffer:Buffer.from(`# ${name}\n合成电话 ${phone}\n`)});
  const uploaded=page.waitForResponse(r=>r.request().method()==='POST'&&pathname(r)===`/api/projects/${projectId}/files`);
  await page.getByRole('button',{name:'上传文件',exact:true}).click();
  const result=await uploaded;expect(result.status(),await result.text()).toBe(200);
  documents.push({name,id:(await result.json()).id as string});
  await page.getByRole('button',{name:'返回材料列表',exact:true}).click();
 }
 const [first,second]=documents;
 for(const document of documents){
  await expect.poll(async()=>{
   const response=await page.request.get(`/api/documents/${document.id}`);
   expect(response.status()).toBe(200);
   return (await response.json()).state;
  },{timeout:45000,intervals:[1000,2000,3000]}).toBe('review');
 }

 await page.getByRole('region',{name:'材料列表'}).getByRole('button',{name:new RegExp(`^${first.name.replace('.', '\\.')}`)}).click();
 await page.getByRole('button',{name:'Markdown 待人工处理稿',exact:true}).click();
 const textarea=page.getByRole('textbox',{name:'Markdown 待人工处理稿内容'});
 await expect(textarea).toBeVisible();
 const firstContent='# 甲\n尚未提交的独有人工编辑 13800138000';
 const invalidFileName='甲/尚未提交.md';
 await textarea.fill(firstContent);
 await page.getByLabel('文件名',{exact:true}).fill(invalidFileName);
 await expect(textarea).toHaveValue(firstContent);
 await expect(page.getByLabel('文件名',{exact:true})).toHaveValue(invalidFileName);
 // Leave immediately. A real navigation must flush the same sealed RecoveryDraft
 // before unmount; waiting 1.5 seconds here would hide the quick-switch gap.
 const firstSaved=page.waitForResponse(writerSave(first.id),{timeout:15000});
 await page.getByRole('button',{name:'返回材料列表',exact:true}).click();
 const firstReceipt=await firstSaved;expect(firstReceipt.status(),await firstReceipt.text()).toBe(200);
 const firstBody=await firstReceipt.json();expect(firstBody.revision).toBeGreaterThan(0);

 const openedSecond=page.waitForResponse(r=>r.request().method()==='POST'&&pathname(r)===`/api/projects/${projectId}/workspace/recent`);
 await page.getByRole('region',{name:'材料列表'}).getByRole('button',{name:new RegExp(`^${second.name.replace('.', '\\.')}`)}).click();
 expect((await openedSecond).status()).toBe(200);
 await page.getByRole('button',{name:'逐条复核',exact:true}).click();
 const secondDecision=page.getByLabel('标记 1 处理决定');
 await expect(secondDecision).toBeVisible();
 const secondSaved=page.waitForResponse(writerSave(second.id),{timeout:15000});
 await secondDecision.selectOption('redact');
 const secondReceipt=await secondSaved;expect(secondReceipt.status(),await secondReceipt.text()).toBe(200);
 expect((await secondReceipt.json()).revision).toBeGreaterThan(0);
 const storageState=await context.storageState();
 const origin=new URL(page.url()).origin;
 await context.close(); // an interrupted browser context, not a server-side recovery injection

 const fresh=await browser.newContext({storageState,baseURL:origin,viewport:{width:1440,height:1000}});
 let releaseReceipt:(()=>void)|undefined;
 try{
  const reopened=await fresh.newPage();
  reopened.on('dialog',dialog=>void dialog.accept());
  await reopened.goto('/');
  await reopened.locator('summary').filter({hasText:'最近打开与待恢复草稿'}).click();
  const projectRow=reopened.locator('.actions').filter({hasText:projectName}).filter({has:reopened.getByRole('button',{name:'打开工作区恢复记录'})});
  await expect(projectRow).toContainText('2 份待恢复复核草稿');
  let receiptFetched!:()=>void;
  const receiptGate=new Promise<void>(resolve=>{releaseReceipt=resolve;});
  const fetched=new Promise<void>(resolve=>{receiptFetched=resolve;});
  await reopened.route('**/api/documents/*/recovery',async route=>{
   if(route.request().method()!=='GET'||new URL(route.request().url()).pathname!==`/api/documents/${second.id}/recovery`)return route.continue();
   const real=await route.fetch(); // keep the server's exact response; delay only delivery to the page
   receiptFetched();await receiptGate;await route.fulfill({response:real});
  });
  const wholeOpen=reopened.waitForResponse(r=>r.request().method()==='POST'&&pathname(r)===`/api/projects/${projectId}/workspace/recovery/open`);
  await projectRow.getByRole('button',{name:'打开工作区恢复记录'}).click();
  const opened=await wholeOpen;expect(opened.status(),await opened.text()).toBe(200);
  const whole=await opened.json();
  expect(whole.entries).toHaveLength(2);
  expect(whole.activeDocumentId).toBe(second.id);
  expect(whole.entries.map((entry:{documentId:string})=>entry.documentId).sort()).toEqual([first.id,second.id].sort());
  await expect(reopened.getByRole('heading',{name:second.name,exact:true})).toBeVisible();
  await fetched;
  await reopened.getByRole('button',{name:'逐条复核',exact:true}).click();
  await expect(reopened.getByLabel('标记 1 处理决定')).toHaveValue('redact');
  await reopened.getByRole('button',{name:'Markdown 待人工处理稿',exact:true}).click();
  const secondContent='# 乙\n恢复之后、claim 之前新输入 13900139000';
  await reopened.getByRole('textbox',{name:'Markdown 待人工处理稿内容'}).fill(secondContent);
  const claimed=reopened.waitForResponse(r=>r.request().method()==='POST'&&pathname(r)===`/api/documents/${second.id}/recovery/writer`);
  releaseReceipt?.();
  expect((await claimed).status()).toBe(200);
  const changedAfterClaim=reopened.waitForResponse(writerSave(second.id),{timeout:15000});
  await reopened.getByRole('button',{name:'返回材料列表',exact:true}).click();
  await reopened.getByRole('alertdialog',{name:'操作确认'}).getByRole('button',{name:'确认执行'}).click();
  const changedReceipt=await changedAfterClaim;expect(changedReceipt.status(),await changedReceipt.text()).toBe(200);
  const thirdStorage=await fresh.storageState();
  await reopened.screenshot({path:info.outputPath('whole-recovery-active-second.png'),fullPage:true});
  await fresh.close();
  const third=await browser.newContext({storageState:thirdStorage,baseURL:origin,viewport:{width:1440,height:1000}});
  try{
  const resumed=await third.newPage();resumed.on('dialog',dialog=>void dialog.accept());
  await resumed.goto('/');
  await resumed.locator('summary').filter({hasText:'最近打开与待恢复草稿'}).click();
  const secondOpen=resumed.waitForResponse(r=>r.request().method()==='POST'&&pathname(r)===`/api/projects/${projectId}/workspace/recovery/open`);
  await resumed.getByRole('button',{name:'打开工作区恢复记录'}).click();
  expect((await secondOpen).status()).toBe(200);
  await expect(resumed.getByRole('heading',{name:second.name,exact:true})).toBeVisible();
  await resumed.getByRole('button',{name:'逐条复核',exact:true}).click();
  await expect(resumed.getByLabel('标记 1 处理决定')).toHaveValue('redact');
  await expect(resumed.getByRole('textbox',{name:'Markdown 待人工处理稿内容'})).toHaveValue(secondContent);
  await resumed.getByRole('button',{name:'返回材料列表',exact:true}).click();
  await resumed.getByRole('alertdialog',{name:'操作确认'}).getByRole('button',{name:'确认执行'}).click();
  await resumed.getByRole('region',{name:'材料列表'}).getByRole('button',{name:new RegExp(`^${first.name.replace('.', '\\.')}`)}).click();
  await expect(resumed.getByRole('heading',{name:first.name,exact:true})).toBeVisible();
  const restoredContent=resumed.getByRole('textbox',{name:'Markdown 待人工处理稿内容'});
  await expect(restoredContent).toHaveValue(firstContent);
  await expect(resumed.getByLabel('文件名',{exact:true})).toHaveValue(invalidFileName);
  await expect(resumed.getByText('已恢复未提交的 Markdown 编辑；仍需人工核查并明确保存。')).toBeVisible();
  await resumed.screenshot({path:info.outputPath('whole-recovery-first-manual.png'),fullPage:true});

  // Recovery accepts an unsaved filename, but final manual publication still
  // applies its original filename validation and explicit human acknowledgement.
  await resumed.getByLabel('我已知晓此稿仍需人工处理，保存不会批准材料复核。').check();
  const invalidSave=resumed.waitForResponse(r=>r.request().method()==='POST'&&pathname(r)===`/api/documents/${first.id}/markdown-manual-drafts`);
  await resumed.getByRole('button',{name:'保存待人工处理稿'}).click();
  const invalid=await invalidSave;expect(invalid.ok()).toBe(false);
  expect(await invalid.text()).toContain('MARKDOWN_DRAFT_FILENAME');
  await resumed.getByLabel('文件名',{exact:true}).fill('甲尚未提交.md');
  const validSave=resumed.waitForResponse(r=>r.request().method()==='POST'&&pathname(r)===`/api/documents/${first.id}/markdown-manual-drafts`);
  await resumed.getByRole('button',{name:'保存待人工处理稿'}).click();
  const valid=await validSave;expect(valid.status(),await valid.text()).toBe(200);
  await expect(resumed.getByText('待人工处理稿已保存，请下载后继续核查。')).toBeVisible();
  const preservedLink=resumed.getByRole('link',{name:'下载待人工处理稿'});
  const href=await preservedLink.getAttribute('href');expect(href).toBeTruthy();
  const before=await resumed.request.get(href!);expect(before.status()).toBe(200);
  const originalHash=createHash('sha256').update(await before.body()).digest('hex');

  await resumed.getByRole('button',{name:'返回材料列表',exact:true}).click();
  await resumed.getByRole('alertdialog',{name:'操作确认'}).getByRole('button',{name:'确认执行'}).click();
  await resumed.locator('summary').filter({hasText:'最近打开与待恢复草稿'}).click();
  const discardRow=resumed.locator('.actions').filter({hasText:projectName}).filter({has:resumed.getByRole('button',{name:'丢弃恢复记录'})});
  await discardRow.getByRole('button',{name:'丢弃恢复记录'}).click();
  const discarded=resumed.waitForResponse(r=>r.request().method()==='DELETE'&&pathname(r)===`/api/projects/${projectId}/workspace/recovery`);
  await discardRow.getByRole('button',{name:'确定丢弃'}).click();
  expect((await discarded).status()).toBe(200);
  expect((await resumed.request.get(`/api/documents/${first.id}`)).status()).toBe(200);
  expect((await resumed.request.get(`/api/documents/${second.id}`)).status()).toBe(200);
  const after=await resumed.request.get(href!);expect(after.status()).toBe(200);
  expect(createHash('sha256').update(await after.body()).digest('hex')).toBe(originalHash);
  }finally{await third.close();}
 }finally{releaseReceipt?.();await fresh.close();}
});

test('delayed real recovery GET cannot silently take over an ordinary old receipt during navigation',async({page})=>{
 test.setTimeout(90000);
 page.on('dialog',dialog=>void dialog.accept());
 await page.goto('/');
 await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);
 await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);
 await page.getByRole('button',{name:'登录工作台'}).click();
 const projectName=`旧回执冲突-${randomUUID().slice(0,8)}`;
 await page.locator('.create-project summary').click();
 await page.getByLabel('项目名称',{exact:true}).fill(projectName);
 const created=page.waitForResponse(r=>r.request().method()==='POST'&&pathname(r)==='/api/projects');
 await page.getByRole('button',{name:'新建项目',exact:true}).click();
 const project=(await(await created).json()).id as string;
 await page.getByRole('button',{name:'导入材料',exact:true}).click();
 await page.getByLabel('待处理文本',{exact:true}).fill('合成姓名张三，电话 13800138000。');
 const uploaded=page.waitForResponse(r=>r.request().method()==='POST'&&pathname(r)===`/api/projects/${project}/documents`);
 await page.getByRole('button',{name:'提交并识别',exact:true}).click();
 const document=(await(await uploaded).json()).id as string;
 await expect.poll(async()=>{
  const response=await page.request.get(`/api/documents/${document}`);
  expect(response.status()).toBe(200);
  return (await response.json()).state;
 },{timeout:45000}).toBe('review');
 await page.getByRole('button',{name:'逐条复核',exact:true}).click();
 const decision=page.getByLabel('标记 1 处理决定');
 await expect(decision).toBeVisible();
 const initialSave=page.waitForResponse(writerSave(document));
 await decision.selectOption('redact');
 expect((await initialSave).status()).toBe(200);
 const closed=page.waitForResponse(r=>r.request().method()==='POST'&&pathname(r)===`/api/documents/${document}/recovery/writer/close`);
 await page.getByRole('button',{name:'结束自动保存会话'}).click();
 expect((await closed).status()).toBe(200);
 await page.getByRole('button',{name:'返回材料列表',exact:true}).click();
 await page.getByRole('alertdialog',{name:'操作确认'}).getByRole('button',{name:'确认执行'}).click();

 let releaseReceipt:(()=>void)|undefined,receiptFetched!:()=>void;
 const gate=new Promise<void>(resolve=>{releaseReceipt=resolve;});
 const fetched=new Promise<void>(resolve=>{receiptFetched=resolve;});
 let takeoverPosts=0;
 page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname===`/api/documents/${document}/recovery/writer`)takeoverPosts++;});
 await page.route('**/api/documents/*/recovery',async route=>{
  if(route.request().method()!=='GET'||new URL(route.request().url()).pathname!==`/api/documents/${document}/recovery`)return route.continue();
  const real=await route.fetch(); // genuine old receipt, delayed only at the browser boundary
  receiptFetched();await gate;await route.fulfill({response:real});
 });
 try{
  await page.getByRole('region',{name:'材料列表'}).getByRole('button').first().click();
  await fetched;
  await page.getByRole('button',{name:'逐条复核',exact:true}).click();
  await expect(page.getByLabel('标记 1 处理决定')).toHaveValue('pending');
  await page.getByLabel('标记 1 处理决定').selectOption('ignore');
  await page.getByRole('button',{name:'返回材料列表',exact:true}).click();
  await page.getByRole('alertdialog',{name:'操作确认'}).getByRole('button',{name:'确认执行'}).click();
  releaseReceipt?.();
  await expect(page.getByRole('alert').filter({hasText:'这份草稿已由另一个窗口接管'})).toBeVisible();
  await expect(page.getByRole('button',{name:'返回材料列表',exact:true})).toBeVisible();
  expect(takeoverPosts).toBe(0);
 }finally{releaseReceipt?.();if(!page.isClosed())await page.unroute('**/api/documents/*/recovery');}
});
