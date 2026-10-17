import {test,expect} from './fixture.ts';
import type {Page,Response} from '@playwright/test';

const pathOf=(response:Response)=>new URL(response.url()).pathname;

async function documentView(page:Page,id:string){
  const response=await page.request.get(`/api/documents/${id}`);
  expect(response.status(),await response.text()).toBe(200);
  return response.json() as Promise<{revision:number;state:string;job?:{status:string};marks:{start:number;end:number;decision:string;replacement?:{mode:string;value?:string}}[]}>;
}

test('server group mode result updates the live review, preview and saved marks',async({page},info)=>{
  test.setTimeout(180_000);
  const phone='13800138000',projectName='合成分组方式-'+Date.now();
  await page.goto('/');
  await expect(page.getByLabel('账号',{exact:true})).toBeVisible({timeout:15_000});
  await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button',{name:'登录工作台',exact:true}).click();
  await page.locator('.create-project summary').click();
  await page.getByLabel('项目名称',{exact:true}).fill(projectName);
  const created=page.waitForResponse(r=>r.request().method()==='POST'&&pathOf(r)==='/api/projects');
  await page.getByRole('button',{name:'新建项目',exact:true}).click();
  const projectResponse=await created;
  expect(projectResponse.status(),await projectResponse.text()).toBe(200);
  const project=await projectResponse.json() as {id:string};
  await expect(page.getByRole('navigation',{name:'项目列表'}).getByRole('button',{name:projectName,exact:true})).toHaveAttribute('aria-current','page');
  await page.getByRole('button',{name:'导入材料',exact:true}).click();
  await page.getByLabel('待处理文本',{exact:true}).fill(`合成电话 ${phone}`);
  await page.getByRole('button',{name:'提交并识别',exact:true}).click();
  const groups=page.getByRole('region',{name:'实体分组',exact:true});
  const group=groups.locator('.entity-group-card').filter({hasText:phone});
  await expect(group).toHaveCount(1,{timeout:45_000});
  const listing=await page.request.get(`/api/projects/${project.id}/documents`);
  expect(listing.status(),await listing.text()).toBe(200);
  const documents=await listing.json() as {id:string}[];
  expect(documents).toHaveLength(1);
  const id=documents[0].id;
  const first=await documentView(page,id);
  await page.locator('details').filter({has:page.locator('summary').filter({hasText:'本材料识别与脱敏设置'})}).locator('summary').click();
  const settings=page.locator('details').filter({has:page.locator('summary').filter({hasText:'本材料识别与脱敏设置'})});
  await settings.getByRole('combobox',{name:'处理方式',exact:true}).selectOption('selective_pseudonym');
  await settings.getByRole('combobox',{name:'电话',exact:true}).selectOption('partial_star');
  await expect(settings.getByRole('button',{name:'保存设置并重新识别',exact:true})).toBeEnabled();
  const configured=page.waitForResponse(r=>r.request().method()==='POST'&&pathOf(r)===`/api/documents/${id}/configuration`);
  const recognized=page.waitForResponse(r=>r.request().method()==='POST'&&pathOf(r)===`/api/documents/${id}/recognize`);
  await settings.getByRole('button',{name:'保存设置并重新识别',exact:true}).click();
  await page.getByRole('alertdialog',{name:'操作确认'}).getByRole('button',{name:'确认执行',exact:true}).click();
  expect((await configured).status()).toBe(200);
  expect((await recognized).status()).toBe(200);
  await expect.poll(async()=>{const view=await documentView(page,id);return view.revision>first.revision&&view.state==='review'&&view.job?.status==='succeeded';},{timeout:45_000}).toBe(true);
  await expect(group.getByRole('group',{name:/的脱敏方式/})).toBeVisible({timeout:30_000});
  await group.getByRole('checkbox').check();
  await groups.getByRole('button',{name:'所选组脱敏',exact:true}).click();
  await expect(group.getByText('脱敏 1',{exact:true})).toBeVisible();
  const savedRedaction=page.waitForResponse(r=>r.request().method()==='PUT'&&pathOf(r)===`/api/documents/${id}/review`);
  await page.getByRole('button',{name:'保存复核',exact:true}).click();
  expect((await savedRedaction).status()).toBe(200);
  await expect(page.getByText('复核已保存',{exact:true})).toBeVisible();
  const baseline=await documentView(page,id);
  expect(baseline.marks.some(mark=>mark.decision==='redact'&&mark.end-mark.start===phone.length)).toBe(true);

  async function apply(action:'半 * 号'|'全 * 号'){
    const response=page.waitForResponse(r=>r.request().method()==='POST'&&pathOf(r)===`/api/documents/${id}/replacement-policies`);
    await group.getByRole('button',{name:action,exact:true}).click();
    const applied=await response;
    expect(applied.status(),await applied.text()).toBe(200);
    const body=await applied.json() as {revision:number;marks:typeof baseline.marks};
    expect(body.revision).toBe(baseline.revision);
    await expect(page.getByRole('button',{name:'保存复核',exact:true})).toBeEnabled();
    const previewResponse=page.waitForResponse(r=>r.request().method()==='POST'&&pathOf(r)===`/api/documents/${id}/preview`);
    await page.getByRole('button',{name:'刷新处理预览',exact:true}).click();
    const preview=await previewResponse;
    expect(preview.status(),await preview.text()).toBe(200);
    const text=(await preview.json() as {text:string}).text;
    await expect(page.getByRole('textbox',{name:'处理预览',exact:true})).toHaveValue(text);
    expect(text).not.toContain(phone);
    return {body,text};
  }
  const half=await apply('半 * 号');
  const halfMark=half.body.marks.find(mark=>mark.decision==='redact'&&mark.end-mark.start===phone.length);
  expect(halfMark?.replacement?.mode).toBe('custom');
  expect(half.text).not.toContain('*'.repeat(phone.length));
  await page.getByRole('button',{name:'原文审查',exact:true}).click();
  const full=await apply('全 * 号');
  const fullMark=full.body.marks.find(mark=>mark.decision==='redact'&&mark.end-mark.start===phone.length);
  expect(fullMark?.replacement?.mode).toBe('full');
  expect(full.text).toContain('*'.repeat(phone.length));
  const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&pathOf(r)===`/api/documents/${id}/review`);
  await page.getByRole('button',{name:'保存复核',exact:true}).click();
  const savedResponse=await saved;
  expect(savedResponse.status(),await savedResponse.text()).toBe(200);
  const after=await documentView(page,id);
  expect(after.marks.find(mark=>mark.decision==='redact'&&mark.end-mark.start===phone.length)?.replacement?.mode).toBe('full');
  await page.screenshot({path:info.outputPath('entity-group-full-star-saved.png'),fullPage:true});
});
