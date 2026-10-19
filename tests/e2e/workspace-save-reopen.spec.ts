import {test,expect} from './fixture.ts';
import {randomUUID,createHash} from 'node:crypto';

test('saved native and TMM receipts survive page reopen without persisting the archive password',async({page},info)=>{
 test.setTimeout(150000);
 await page.goto('/');
 await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);
 await page.getByRole('button',{name:'登录工作台',exact:true}).click();
 await page.locator('.create-project summary').click();const name='合成备份接续-'+randomUUID().slice(0,8);
 await page.getByLabel('项目名称',{exact:true}).fill(name);const created=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/projects');
 await page.getByRole('button',{name:'新建项目',exact:true}).click();const response=await created;expect(response.status()).toBe(200);const project=(await response.json()).id;
 // A tiny synthetic original is enough: this test exercises saved receipts,
 // not OCR/NER or an external provider.
 await page.getByRole('button',{name:'导入材料',exact:true}).click();await page.getByLabel('选择文件',{exact:true}).setInputFiles({name:'合成材料.txt',mimeType:'text/plain',buffer:Buffer.from('合成工作区备份接续。')});
 await page.getByRole('button',{name:'上传文件',exact:true}).click();await expect(page.getByText('已保存',{exact:true})).toBeVisible();await page.getByRole('button',{name:'返回材料列表',exact:true}).click();
 await expect.poll(async()=>{const list=await (await page.request.get(`/api/projects/${project}/documents`)).json();return list.length===1&&list[0].state==='review';},{timeout:45000}).toBe(true);
 const password='synthetic-archive-password';
 for(const format of ['native','secure-v2']){
  const panel=page.locator('details').filter({has:page.locator(':scope > summary').filter({hasText:'工程备份与导入'})}).first();await panel.locator(':scope > summary').click();
  if(format==='native'){
   await panel.getByLabel('工程备份密码',{exact:true}).fill(password);await panel.getByRole('button',{name:'下载工程备份',exact:true}).click();
  }else{
   await page.getByRole('combobox',{name:'导出或转换格式',exact:true}).selectOption(format);await panel.getByLabel('新文件密码',{exact:true}).fill(password);await panel.getByRole('button',{name:'下载当前项目 TMM',exact:true}).click();
  }
  const linkName=format==='native'?'下载已保存的工程备份':'下载已保存的审查传输副本';const link=panel.getByRole('link',{name:linkName,exact:true});await expect(link).toBeVisible({timeout:45000});
  const href=await link.getAttribute('href');expect(href).toBeTruthy();const first=await page.request.get(href!);expect(first.status()).toBe(200);const digest=createHash('sha256').update(await first.body()).digest('hex');
  const storage=await page.evaluate(()=>JSON.stringify(sessionStorage));expect(storage).not.toContain(password);
  await page.reload();await page.getByRole('navigation',{name:'项目列表'}).getByRole('button',{name,exact:true}).click();await expect(page.getByRole('navigation',{name:'项目列表'}).getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','page',{timeout:30000});await expect(page.locator('fieldset.workspace-controls')).toHaveAttribute('aria-busy','false',{timeout:30000});
  const reopened=page.locator('details').filter({has:page.locator(':scope > summary').filter({hasText:'工程备份与导入'})}).first();await reopened.locator(':scope > summary').click();
  if(format!=='native')await page.getByRole('combobox',{name:'导出或转换格式',exact:true}).selectOption(format);
  const restored=reopened.getByRole('link',{name:linkName,exact:true});await expect(restored).toBeVisible({timeout:10000});expect(await restored.getAttribute('href')).toBe(href);
  const again=await page.request.get(href!);expect(again.status()).toBe(200);expect(createHash('sha256').update(await again.body()).digest('hex')).toBe(digest);
  await page.screenshot({path:info.outputPath(`restored-${format}.png`),fullPage:true});
  // The next format starts from a fresh closed component as well.
  await page.reload();await page.getByRole('navigation',{name:'项目列表'}).getByRole('button',{name,exact:true}).click();await expect(page.getByRole('navigation',{name:'项目列表'}).getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','page',{timeout:30000});await expect(page.locator('fieldset.workspace-controls')).toHaveAttribute('aria-busy','false',{timeout:30000});
 }
});
