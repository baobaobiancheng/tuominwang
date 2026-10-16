import{test,expect}from'./fixture.ts';
import{randomUUID}from'node:crypto';
import{readFile,mkdir,writeFile}from'node:fs/promises';

test('unified aliases actual enable, scoped token, merge, split, reset, flush, review, export and occurrence restore',async({page})=>{
 test.setTimeout(180000);page.setDefaultTimeout(10000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'登录工作台'}).click();
 const name='统一假名全链路-'+randomUUID().slice(0,8);await page.locator('.create-project summary').click();await page.getByLabel('项目名称',{exact:true}).fill(name);await page.getByRole('button',{name:'新建项目',exact:true}).click();await expect(page.getByRole('navigation',{name:'项目列表'}).getByRole('button',{name,exact:true})).toBeVisible();
 const seeded=await page.evaluate(async(name)=>{const projects=await(await fetch('/api/projects')).json(),project=projects.find((p:any)=>p.name===name).id,docs: {id:string;text:string}[]=[];for(const phone of['13800138000','13800138000','13900139000']){const text=`联系电话：${phone}`,response=await fetch(`/api/projects/${project}/documents`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,requestId:crypto.randomUUID()})});if(!response.ok)throw new Error(await response.text());docs.push({id:(await response.json()).id,text});}return{project,docs};},name);
 await expect.poll(async()=>page.evaluate(async docs=>{const values=await Promise.all(docs.map(async d=>(await(await fetch(`/api/documents/${d.id}`)).json()).state));return values.every(v=>v==='review');},seeded.docs),{timeout:90000}).toBe(true);
 await page.reload();await page.getByRole('navigation',{name:'项目列表'}).getByRole('button',{name,exact:true}).click();
 const panel=page.locator('details').filter({has:page.locator(':scope > summary').filter({hasText:'全项目假名核对'})}).first();
 await panel.locator(':scope > summary').click();await panel.getByRole('button',{name:'查看全部材料',exact:true}).click();await expect(panel.locator('article.entity-group')).toHaveCount(2);
 const change=async(click:()=>Promise<void>)=>{const receipt=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/projects/${seeded.project}/unified-aliases`,{timeout:30000});await click();const response=await receipt;expect(response.status(),await response.text()).toBe(200);};await change(()=>panel.getByRole('button',{name:'启用全项目统一假名',exact:true}).click());await expect(panel.getByRole('button',{name:'停止自动统一',exact:true})).toBeVisible({timeout:15000});
 const phoneA=()=>panel.locator('article.entity-group').filter({hasText:'13800138000'}).first();
 await phoneA().getByLabel('假名',{exact:true}).fill('CLIENT A');await change(()=>phoneA().getByRole('button',{name:'保存假名',exact:true}).click());await expect(phoneA().getByLabel('假名',{exact:true})).toHaveValue('CLIENT A');
 // A file override must create a separately editable source entry, then undo.
 await panel.getByRole('combobox',{name:'修改范围',exact:true}).selectOption(seeded.docs[0].id);await phoneA().getByLabel('假名',{exact:true}).fill('CLIENT FILE');await change(()=>phoneA().getByRole('button',{name:'保存假名',exact:true}).click());const split=panel.locator('article.entity-group').filter({has:page.getByRole('button',{name:'撤销文件拆分',exact:true})});await expect(split).toHaveCount(1);await change(()=>split.getByRole('button',{name:'撤销文件拆分',exact:true}).click());await expect(panel.getByRole('button',{name:'撤销文件拆分',exact:true})).toHaveCount(0);await panel.getByRole('combobox',{name:'修改范围',exact:true}).selectOption('all');
 for(const row of await panel.locator('article.entity-group').all())await row.getByRole('checkbox').check();await change(()=>panel.getByRole('button',{name:'合并所选实体',exact:true}).click());await expect(panel.locator('article.entity-group')).toHaveCount(1);await expect(panel.getByRole('button',{name:'撤销实体合并',exact:true})).toBeVisible();
 await change(()=>panel.getByRole('button',{name:/^拆出 /}).first().click());await expect(panel.locator('article.entity-group')).toHaveCount(2);for(const row of await panel.locator('article.entity-group').all())await row.getByRole('checkbox').check();await change(()=>panel.getByRole('button',{name:'合并所选实体',exact:true}).click());await change(()=>panel.getByRole('button',{name:'撤销实体合并',exact:true}).click());await expect(panel.locator('article.entity-group')).toHaveCount(2);
 await change(()=>phoneA().getByRole('button',{name:'恢复默认假名',exact:true}).click());await change(()=>panel.getByRole('button',{name:'重新同步当前假名',exact:true}).click());
 // Enter through the real material row, review all pending matches, and download.
 const material=page.getByRole('region',{name:'材料列表'}).locator('.material-row').first();await material.click();
 const groups=page.getByRole('region',{name:'实体分组'});await expect(groups.locator('.entity-group-card')).not.toHaveCount(0);for(const checkbox of await groups.locator('.entity-group-card input[type=checkbox]').all())await checkbox.check();await groups.getByRole('button',{name:'所选组脱敏',exact:true}).click();
 const statusBefore=await page.locator('.statusbar').textContent(),previous=Number(statusBefore?.match(/复核版本\s+(\d+)/u)?.[1]);expect(Number.isInteger(previous),statusBefore??'').toBe(true);
 const saveReceipt=page.waitForResponse(r=>r.request().method()==='PUT'&&/\/api\/documents\/[a-f0-9-]{36}\/review$/u.test(new URL(r.url()).pathname),{timeout:30000});
 await page.getByRole('button',{name:'保存复核',exact:true}).click();const saved=await saveReceipt;expect(saved.status(),await saved.text()).toBe(200);
 await expect(page.locator('.statusbar')).toContainText(`复核版本 ${previous+1}`,{timeout:30000});await expect(page.locator('.statusbar')).toContainText('人工复核已保存');
 const savedDocId=new URL(saved.url()).pathname.match(/\/api\/documents\/([a-f0-9-]{36})\/review$/u)?.[1];expect(savedDocId).toBeTruthy();const savedView=await page.request.get(`/api/documents/${savedDocId}`);expect(savedView.status(),await savedView.text()).toBe(200);expect((await savedView.json()).revision).toBe(previous+1);
 await page.getByRole('button',{name:'导出已选标记的处理副本',exact:true}).click();
 const downloadButton=page.getByRole('button',{name:'核验并下载 TXT',exact:true});
 // Wait for the actual export job before starting the verified-download budget.
 await expect(downloadButton).toBeEnabled({timeout:90000});
 const linkEvent=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/documents/${seeded.docs[2]!.id}/download-link`,{timeout:90000});
 const downloadEvent=page.waitForEvent('download',{timeout:90000});
 await downloadButton.click();const [link,download]=await Promise.all([linkEvent,downloadEvent]);
 expect(link.status(),await link.text()).toBe(200);const issued=await link.json();expect(issued.url).toMatch(/\/api\/download\//);
 const path=await download.path();expect(path).toBeTruthy();const output=await readFile(path!,'utf8');expect(output).not.toMatch(/13[89]0013[89]000/);
 await page.getByRole('button',{name:'还原假名',exact:true}).click();await page.getByLabel('待还原文本',{exact:true}).fill(output);await page.getByRole('button',{name:'确认还原',exact:true}).click();await page.getByRole('alertdialog',{name:'操作确认'}).getByRole('button',{name:'确认执行',exact:true}).click();await expect(page.getByLabel('还原结果',{exact:true})).toHaveValue(seeded.docs[2].text);
 expect(errors).toEqual([]);await mkdir('.data/research/lawbot-2026-10-15/iteration035',{recursive:true});await writeFile('.data/research/lawbot-2026-10-15/iteration035/unified-aliases-edge.png',await page.screenshot({fullPage:true}));
});
