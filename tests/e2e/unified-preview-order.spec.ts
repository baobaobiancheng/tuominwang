import {test,expect} from './fixture.ts';
import {randomUUID} from 'node:crypto';

test('entering unified material preview rebuilds ready sibling drafts before rendering without saving review marks',async({page},info)=>{
  test.setTimeout(180_000);
  const name='统一预览顺序-'+randomUUID().slice(0,8),phone='13800138000';
  await page.goto('/');
  await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button',{name:'登录工作台',exact:true}).click();
  await page.locator('.create-project summary').click();
  await page.getByLabel('项目名称',{exact:true}).fill(name);
  const creating=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/projects');
  await page.getByRole('button',{name:'新建项目',exact:true}).click();
  const created=await creating;expect(created.status(),await created.text()).toBe(200);
  const project=(await created.json() as {id:string}).id;
  await expect(page.getByRole('navigation',{name:'项目列表'}).getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','page');
  const ids=await page.evaluate(async({project,phone})=>{
    const result:string[]=[];
    for(let index=0;index<2;index++){
      const response=await fetch(`/api/projects/${project}/documents`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:`合成材料 ${index+1}，电话 ${phone}`,requestId:crypto.randomUUID()})});
      if(!response.ok)throw new Error(await response.text());result.push((await response.json()).id);
    }
    return result;
  },{project,phone});
  await expect.poll(async()=>Promise.all(ids.map(async id=>{
    const response=await page.request.get(`/api/documents/${id}`);return response.ok()&&(await response.json()).state==='review';
  })),{timeout:90_000}).toEqual([true,true]);
  await page.reload();
  await page.getByRole('navigation',{name:'项目列表'}).getByRole('button',{name,exact:true}).click();
  const panel=page.locator('details').filter({has:page.locator(':scope > summary').filter({hasText:'全项目假名核对'})}).first();
  await panel.locator(':scope > summary').click();
  const enabled=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/projects/${project}/unified-aliases`);
  await panel.getByRole('button',{name:'启用全项目统一假名',exact:true}).click();
  expect((await enabled).status()).toBe(200);
  const material=page.getByRole('region',{name:'材料列表'}).locator('.material-row').first();
  await material.click();
  const groups=page.getByRole('region',{name:'实体分组'});
  await expect(groups.locator('.entity-group-card').filter({hasText:phone})).toHaveCount(1,{timeout:30_000});
  await groups.locator('.entity-group-card').filter({hasText:phone}).getByRole('checkbox').check();
  await groups.getByRole('button',{name:'所选组脱敏',exact:true}).click();
  const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&/\/api\/documents\/[a-f0-9-]{36}\/review$/u.test(new URL(r.url()).pathname));
  await page.getByRole('button',{name:'保存复核',exact:true}).click();
  const saveResponse=await saved;expect(saveResponse.status(),await saveResponse.text()).toBe(200);
  const active=new URL(saveResponse.url()).pathname.match(/\/api\/documents\/([a-f0-9-]{36})\/review$/u)?.[1];
  expect(active).toBeTruthy();
  const before=await page.request.get(`/api/documents/${active}`);expect(before.status(),await before.text()).toBe(200);
  const reviewBefore=await before.json();
  const prepared=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/projects/${project}/unified-aliases/prepare-preview`);
  const rendered=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/documents/${active}/preview`);
  await page.getByRole('button',{name:'刷新处理预览',exact:true}).click();
  const prepareResponse=await prepared;expect(prepareResponse.status(),await prepareResponse.text()).toBe(200);
  expect((await prepareResponse.json()).documents).toHaveLength(2);
  const renderResponse=await rendered;expect(renderResponse.status(),await renderResponse.text()).toBe(200);
  const output=(await renderResponse.json() as {text:string}).text;
  await expect(page.getByRole('textbox',{name:'处理预览',exact:true})).toHaveValue(output);
  expect(output).not.toContain(phone);
  const after=await page.request.get(`/api/documents/${active}`);expect(after.status(),await after.text()).toBe(200);
  const reviewAfter=await after.json();
  expect(reviewAfter.revision).toBe(reviewBefore.revision);
  expect(reviewAfter.marks).toEqual(reviewBefore.marks);
  await page.getByRole('textbox',{name:'处理预览',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('unified-two-material-preview.png'),fullPage:true});
});
