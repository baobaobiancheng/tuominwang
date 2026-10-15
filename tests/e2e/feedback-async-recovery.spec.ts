// Actual Edge regression: failed and out-of-order feedback requests must recover.
// Real isolated API/session/project reads. Only one feedback GET is held or altered.
import { test, expect } from './fixture.ts';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';

async function loginAndProject(page: Page) {
 await page.goto('/');
 await expect(page.getByRole('button',{name:'登录工作台',exact:true})).toBeVisible();
 await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME!);
 await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_PASSWORD!);
 await page.getByRole('button', { name: '登录工作台', exact: true }).click();
 const name=`反馈乱序-${randomUUID().slice(0,8)}`;
 const form=page.locator('.create-project');
 if(await form.getAttribute('open')===null)await form.locator('summary').click();
 await page.getByLabel('项目名称', { exact: true }).fill(name);
 const saved=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/projects');
 await page.getByRole('button', { name: '新建项目', exact: true }).click();
 const result=await saved;expect(result.status()).toBe(200);
 const id=(await result.json()).id as string;
 await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name, exact: true }).click();
 return id;
}

test('same mounted feedback panel ignores an older failed GET after a newer refresh succeeds',async({page})=>{
 test.setTimeout(90000);
 const projectId=await loginAndProject(page);
 const toggle=page.getByRole('button',{name:'反馈与个人规则',exact:true});
 const panel=page.locator('.project-tools .panel').filter({has:page.getByRole('heading',{name:'审核反馈与个人规则'})});
 // Seed one real project feedback so the second successful read has a visible
 // completion marker; the default zero counter could pass before refresh ends.
 await toggle.click();
 await panel.getByLabel('实体内容').fill('张三');
 await panel.getByRole('button',{name:'保存反馈',exact:true}).click();
 await expect(panel.getByText('反馈 1',{exact:false})).toBeVisible();
 await toggle.click();await expect(panel).toHaveCount(0);
 let releaseOld!:()=>void,signalOld!:()=>void,signalAbort!:()=>void,requests=0;
 const oldStarted=new Promise<void>(r=>{signalOld=r});
 const oldHeld=new Promise<void>(r=>{releaseOld=r});
 const oldAborted=new Promise<void>(r=>{signalAbort=r});
 const matcher='**/api/feedback?projectId=*';
 await page.route(matcher,async route=>{
  if(new URL(route.request().url()).searchParams.get('projectId')!==projectId)return route.continue();
  if(++requests!==1)return route.continue();
  signalOld();await oldHeld;await route.abort('connectionfailed');signalAbort();
 });
 await toggle.click();
 await oldStarted;
 const newerResponse=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/feedback'&&new URL(r.url()).searchParams.get('projectId')===projectId&&r.status()===200);
 await panel.getByRole('button',{name:'刷新',exact:true}).click();
 await newerResponse;
 await expect(panel.getByText('反馈 1',{exact:false})).toBeVisible();
 const oldRequestFailed=page.waitForEvent('requestfailed',request=>new URL(request.url()).pathname==='/api/feedback'&&new URL(request.url()).searchParams.get('projectId')===projectId);
 await expect(panel.getByRole('button',{name:'刷新',exact:true})).toBeEnabled();releaseOld();await oldAborted;await oldRequestFailed;
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 // The v1 candidate fails here: its effect catch still owns the project epoch.
 await expect(panel.getByRole('alert')).toHaveCount(0);
 expect(requests).toBe(2);
 await page.unroute(matcher);await page.screenshot({path:'.data/research/lawbot-2026-10-15/iteration051/feedback-recovered-'+randomUUID()+'.png',fullPage:true});
});

test('current malformed response remains visible until a real successful refresh',async({page})=>{
 test.setTimeout(90000);
 const projectId=await loginAndProject(page),matcher='**/api/feedback?projectId=*';
 let malformed=true;
 await page.route(matcher,route=>{
  if(malformed&&new URL(route.request().url()).searchParams.get('projectId')===projectId){malformed=false;return route.fulfill({status:503,contentType:'text/html',body:'<html>temporary failure</html>'});}
  return route.continue();
 });
 await page.getByRole('button',{name:'反馈与个人规则',exact:true}).click();
 const panel=page.locator('.project-tools .panel').filter({has:page.getByRole('heading',{name:'审核反馈与个人规则'})});
 await expect(panel.getByRole('alert')).toHaveText('服务响应无效，请刷新后重试。');
 await page.unroute(matcher);
 const recovered=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/feedback'&&new URL(r.url()).searchParams.get('projectId')===projectId&&r.status()===200);
 await panel.getByRole('button',{name:'刷新',exact:true}).click();
 await recovered;
 await expect(panel.getByRole('alert')).toHaveCount(0);
 await expect(panel.getByText('反馈 0',{exact:false})).toBeVisible();
});
