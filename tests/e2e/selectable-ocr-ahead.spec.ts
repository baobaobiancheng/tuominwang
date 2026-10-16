import {test,expect} from './fixture.ts';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {pdfFixture} from '../pdf-fixtures.ts';

test('PDF viewer previews a later page before OCR and keeps its selectable layer read only',async({page},info)=>{
 test.setTimeout(240000);await page.setViewportSize({width:1440,height:1000});
 const fileName='可选字逐页样本.pdf',source=pdfFixture({pages:20,text:'Phone 13800138000 synthetic page'}),errors:string[]=[];let rateLimited=0;
 page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()===429)rateLimited++;});
 const landing=await page.goto('/');expect(landing?.status()).toBe(200);await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'登录工作台',exact:true}).click();
 await page.locator('.create-project summary').click();await page.getByLabel('项目名称',{exact:true}).fill('PDF选字-'+randomUUID().slice(0,8));
 const createdPromise=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/projects');await page.getByRole('button',{name:'新建项目',exact:true}).click();const created=await createdPromise;expect(created.status()).toBe(200);const project=(await created.json()).id;
 const slot=new pg.Client({connectionString:process.env.DATABASE_URL});await slot.connect();await slot.query('SELECT pg_advisory_lock(7843,2)');let owned=true;
 try{
 await page.getByRole('button',{name:'导入材料',exact:true}).click();await page.getByLabel('选择文件',{exact:true}).setInputFiles({name:fileName,mimeType:'application/pdf',buffer:source});await page.getByRole('button',{name:'上传文件',exact:true}).click();await expect(page.getByText('已保存',{exact:true})).toBeVisible();await page.getByRole('button',{name:'返回材料列表',exact:true}).click();
 const listed=await page.request.get(`/api/projects/${project}/documents?limit=100&offset=0`);expect(listed.status()).toBe(200);const id=(await listed.json()).find((d:any)=>d.name===fileName)?.id;expect(id).toBeTruthy();
 await page.getByRole('region',{name:'材料列表',exact:true}).getByRole('button',{name:new RegExp(fileName)}).click();const draft=page.getByRole('region',{name:'运行中 PDF 页面人工草稿',exact:true});await expect(draft).toBeVisible();
 const progress=page.getByRole('region',{name:'处理进度',exact:true});await expect(progress).toBeVisible();
 const select=draft.getByRole('combobox',{name:'页面',exact:true});await expect(select.locator('option')).toHaveCount(20,{timeout:30000});await select.selectOption('19');
 const ahead=draft.getByRole('region',{name:'识别前 PDF 原页预览'});await expect(ahead).toBeVisible();await expect.poll(()=>ahead.locator('canvas').evaluate((c:HTMLCanvasElement)=>c.width>0&&c.height>0&&getComputedStyle(c).display!=='none'),{timeout:30000}).toBe(true);
 const target=(await page.request.get(`/api/jobs/${(await (await page.request.get(`/api/documents/${id}`)).json()).job.id}/pdf-ocr/draft`));expect(target.status()).toBe(200);expect((await target.json()).pages).toHaveLength(0);
 await expect(ahead.getByText('此页识别结果尚未就绪')).toBeVisible();
 const beforeOcr=info.outputPath('pdf-ahead-page20-before-ocr.png');await page.screenshot({path:beforeOcr,fullPage:true});await info.attach('pdf-ahead-page20-before-ocr',{path:beforeOcr,contentType:'image/png'});
 await delay(65000);expect(rateLimited).toBe(0);expect((await (await page.request.get(`/api/jobs/${(await (await page.request.get(`/api/documents/${id}`)).json()).job.id}/pdf-ocr/draft`)).json()).pages).toHaveLength(0);
 await slot.query('SELECT pg_advisory_unlock(7843,2)');owned=false;
 await expect.poll(async()=>{await draft.getByRole('button',{name:'刷新已完成页面'}).click();return (await select.locator('option[value="0"]').textContent())?.includes('已识别')??false;},{timeout:120000,intervals:[1000,2000]}).toBe(true);
 await expect(progress).toContainText('已保存',{timeout:15000});
 await select.selectOption('0');const live=draft.getByRole('region',{name:'运行中 PDF 原页预览'});await expect(live).toBeVisible();
 const canvas=live.getByLabel('区域框选画布');await canvas.scrollIntoViewIfNeeded();const r=await canvas.boundingBox(),viewport=page.viewportSize();expect(r).toBeTruthy();expect(viewport).toBeTruthy();const visible={left:Math.max(0,r!.x),top:Math.max(0,r!.y),right:Math.min(viewport!.width,r!.x+r!.width),bottom:Math.min(viewport!.height,r!.y+r!.height)};expect(visible.right-visible.left).toBeGreaterThan(40);expect(visible.bottom-visible.top).toBeGreaterThan(40);const start={x:visible.left+(visible.right-visible.left)*.3,y:visible.top+(visible.bottom-visible.top)*.3},end={x:visible.left+(visible.right-visible.left)*.5,y:visible.top+(visible.bottom-visible.top)*.5};expect(await canvas.evaluate((svg,point)=>svg===document.elementFromPoint(point.x,point.y),start)).toBe(true);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:3});await page.mouse.up();await expect(live.getByRole('button',{name:'添加清除区域'})).toBeEnabled();
 let reviewWrites=0;page.on('request',request=>{if(request.method()==='PUT'&&/\/review$/u.test(new URL(request.url()).pathname))reviewWrites++;});
 await live.getByLabel('选取页面文字').check();await expect(live.getByRole('button',{name:'添加清除区域'})).toBeDisabled();const layer=live.getByLabel('临时 OCR 可选文字层');await expect(layer.locator('[data-ocr-text="true"]').first()).toBeVisible({timeout:30000});
 const selected=await layer.locator('[data-ocr-text="true"]').first().evaluate(span=>{const range=document.createRange();range.selectNodeContents(span);const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);return selection?.toString()??'';});expect(selected.trim().length).toBeGreaterThan(0);expect(reviewWrites).toBe(0);expect(errors).toEqual([]);
 const readonlySelection=info.outputPath('pdf-ahead-readonly-selection.png');await page.screenshot({path:readonlySelection,fullPage:true});await info.attach('pdf-ahead-readonly-selection',{path:readonlySelection,contentType:'image/png'});
 }finally{if(owned)await slot.query('SELECT pg_advisory_unlock(7843,2)');await slot.end();}
});
