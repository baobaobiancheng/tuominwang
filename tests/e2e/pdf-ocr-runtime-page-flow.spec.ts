import {test,expect} from './fixture.ts';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import type {Page} from '@playwright/test';
import {pdfFixture} from '../pdf-fixtures.ts';
import {openPdf} from '../../packages/core/pdf-reader.ts';
import sharp from 'sharp';

// Status reads observe the real job; all pause, draft, resume, review and export writes use the visible UI.
async function observedGet(page:Page,path:string){
 let response=await page.request.get(path);
 if(response.status()===429){
  const header=response.headers()['retry-after'];
  expect(header).toMatch(/^(?:0|[1-9]\d?)$/u);
  await delay((Number(header)+1)*1000);
  response=await page.request.get(path);
 }
 expect(response.status(),await response.text()).toBe(200);
 return response.json();
}

test('Edge PDF completed pages can be paused, human drafted, resumed, reviewed and downloaded',async({page},info)=>{
 test.setTimeout(600000);
 page.setDefaultTimeout(15000);
 await page.setViewportSize({width:1440,height:1000});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const fileName='公开逐页草稿样本.pdf',projectName='PDF逐页草稿-'+randomUUID().slice(0,8),phone='13800138000';
 const source=pdfFixture({pages:20,text:`Phone ${phone} - public synthetic page`});
 await page.goto('/');
 await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);
 await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);
 await page.getByRole('button',{name:'登录工作台',exact:true}).click();
 await page.locator('.create-project summary').click();
 await page.getByLabel('项目名称',{exact:true}).fill(projectName);
 const projectResponse=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/projects');
 await page.getByRole('button',{name:'新建项目',exact:true}).click();
 const created=await projectResponse;expect(created.status(),await created.text()).toBe(200);
 const project=(await created.json()).id as string;
 await page.getByRole('button',{name:'导入材料',exact:true}).click();
 await page.getByLabel('选择文件',{exact:true}).setInputFiles({name:fileName,mimeType:'application/pdf',buffer:source});
 await page.getByRole('button',{name:'上传文件',exact:true}).click();
 await expect(page.getByText('已保存',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'返回材料列表',exact:true}).click();
 const listed=await observedGet(page,`/api/projects/${project}/documents?limit=100&offset=0`);
 const id=listed.find((item:any)=>item.name===fileName)?.id as string;
 expect(id).toMatch(/^[a-f0-9-]{36}$/u);
 await page.getByRole('region',{name:'材料列表',exact:true}).getByRole('button',{name:new RegExp(fileName)}).click();
 const initial=await observedGet(page,`/api/documents/${id}`);
 expect(initial.format).toBe('pdf');expect(initial.state).toBe('queued');expect(initial.job.kind).toBe('detect');
 const rootJob=initial.job.id as string;
 await expect.poll(async()=>{
  const progress=await observedGet(page,`/api/jobs/${rootJob}/pdf-ocr/progress`);
  return progress.status==='running'&&progress.totalPages===20&&progress.completedPageNumbers.length>=4&&progress.completedPageNumbers.length<20;
 },{timeout:180000,intervals:[1000,2000,2000]}).toBe(true);
 // The next observed progress must prove an actual partial page checkpoint before the UI pause.
 const progress=await observedGet(page,`/api/jobs/${rootJob}/pdf-ocr/progress`);
 expect(progress.completedPageNumbers.length).toBeGreaterThanOrEqual(4);
 expect(progress.completedPageNumbers.length).toBeLessThan(20);
 expect(progress.completedPageNumbers).toContain(1);expect(progress.completedPageNumbers).toContain(2);expect(progress.completedPageNumbers).toContain(3);expect(progress.completedPageNumbers).toContain(4);
 await expect(page.getByRole('button',{name:'暂停图片识别',exact:true})).toBeVisible();
 const pauseResponse=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/jobs/${rootJob}/pdf-ocr/pause`);
 await page.getByRole('button',{name:'暂停图片识别',exact:true}).click();
 await page.getByRole('alertdialog',{name:'操作确认'}).getByRole('button',{name:'确认执行'}).click();
 const paused=await pauseResponse;expect(paused.status(),await paused.text()).toBe(200);
 await expect(page.getByRole('button',{name:'继续图片识别',exact:true})).toBeVisible({timeout:30_000});
 let draft=page.getByRole('region',{name:'运行中 PDF 页面人工草稿',exact:true});
 await draft.getByRole('button',{name:'刷新已完成页面',exact:true}).click();
 const beforeDraft=await observedGet(page,`/api/jobs/${rootJob}/pdf-ocr/draft`);
 const first=beforeDraft.pages.find((item:any)=>item.pageIndex===0),second=beforeDraft.pages.find((item:any)=>item.pageIndex===1);
 expect(first&&second).toBeTruthy();
 expect(first.machineCandidates.some((item:any)=>item.kind==='手机号'&&first.text.slice(item.start,item.end)===phone)).toBe(true);
 await expect(draft.getByLabel('第 1 页已识别文字')).toHaveValue(new RegExp(phone));
 const previewResponse=await page.request.get(`/api/jobs/${rootJob}/pdf-ocr/draft/pages/0`);expect(previewResponse.status()).toBe(200);expect(previewResponse.headers()['content-type']).toContain('image/png');expect(previewResponse.headers()['cache-control']).toContain('no-store');expect((await previewResponse.body()).length).toBeGreaterThan(1000);
 const firstImage=draft.getByRole('img',{name:'原件第 1 页'});await expect(firstImage).toBeVisible();
 await expect.poll(()=>firstImage.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0),{timeout:30000}).toBe(true);
 const canvas=draft.getByLabel('区域框选画布');
 const dragRegion=async(x1:number,y1:number,x2:number,y2:number)=>{await canvas.scrollIntoViewIfNeeded();let bounds=await canvas.boundingBox();expect(bounds).toBeTruthy();await canvas.hover({position:{x:bounds!.width*x1,y:bounds!.height*y1}});bounds=await canvas.boundingBox();expect(bounds).toBeTruthy();const start={x:bounds!.x+bounds!.width*x1,y:bounds!.y+bounds!.height*y1},end={x:bounds!.x+bounds!.width*x2,y:bounds!.y+bounds!.height*y2};const hit=await page.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y);return{tag:el?.tagName,aria:el?.getAttribute('aria-label'),viewport:[innerWidth,innerHeight]};},start);expect(hit.aria,JSON.stringify({bounds,start,end,hit})).toBe('区域框选画布');await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:5});await page.mouse.up();await expect(draft.getByRole('button',{name:'添加清除区域'})).toBeEnabled();};
 await dragRegion(.70,.70,.80,.80);
 const firstRegionSaved=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===`/api/jobs/${rootJob}/pdf-ocr/draft`&&r.status()===200,{timeout:30000});
 await draft.getByRole('button',{name:'添加清除区域'}).click();
 await expect(draft.getByText('区域 1 · 敏感区域 · 矩形')).toBeVisible();
 await firstRegionSaved;
 await expect(draft.getByRole('status')).toContainText('本页人工增删已保存',{timeout:30000});
 const processed=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/jobs/${rootJob}/pdf-ocr/draft/pages/0/preview`);
 await draft.getByRole('button',{name:'预览本页处理结果',exact:true}).click();
 const processedResponse=await processed;expect(processedResponse.status(),await processedResponse.text()).toBe(200);
 expect(processedResponse.headers()['content-type']).toContain('image/png');
 const processedBytes=await processedResponse.body();expect(processedBytes.length).toBeGreaterThan(1000);
 const processedImage=draft.getByRole('img',{name:'第 1 页处理预览'});
 await expect(processedImage).toBeVisible();
 await expect.poll(()=>processedImage.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
 await processedImage.screenshot({path:info.outputPath('pdf-ocr-partial-processed-preview.png')});
 await draft.getByRole('button',{name:'返回审查',exact:true}).click();
 await expect(firstImage).toBeVisible();
 await expect(draft.locator('fieldset.region-editor')).not.toHaveAttribute('disabled','');
 await draft.getByLabel('区域形状').selectOption('circle');
 await dragRegion(.40,.40,.50,.50);
 await draft.getByRole('button',{name:'添加清除区域'}).click();
 await expect(draft.getByText('区域 2 · 敏感区域 · 圆形')).toBeVisible();
 await draft.getByText('区域 2 · 敏感区域 · 圆形').getByRole('button',{name:'删除区域'}).click();
 await expect(draft.getByText('区域 2 · 敏感区域 · 圆形')).toHaveCount(0);
 await expect(draft.getByRole('heading',{name:/本页(?:机器初步|完整识别)候选/u})).toBeVisible();
 await expect.poll(async()=>{
  const live=await observedGet(page,`/api/jobs/${rootJob}/pdf-ocr/draft`);
  return live.pages.find((item:any)=>item.pageIndex===0)?.draft?.regions?.length;
 },{timeout:30000}).toBe(1);
 await draft.getByRole('button',{name:'预览本页处理结果',exact:true}).click();
 await expect(processedImage).toBeVisible();
 await expect(draft.getByRole('button',{name:'刷新已完成页面'})).toBeEnabled();
 let releaseStaleGet!:()=>void,staleGetFetched=false,staleGetFulfilled=false,staleDraftRevision=-1;
 const staleGate=new Promise<void>(resolve=>{releaseStaleGet=resolve;});
 await page.route(`**/api/jobs/${rootJob}/pdf-ocr/draft`,async route=>{
  if(route.request().method()!=='GET'){await route.continue();return;}
  const oldResponse=await route.fetch(),oldData=await oldResponse.json();
  staleDraftRevision=oldData.pages.find((item:any)=>item.pageIndex===0).draftRevision;
  staleGetFetched=true;
  await staleGate;
  await route.fulfill({response:oldResponse});
  staleGetFulfilled=true;
 });
 await draft.getByRole('button',{name:'刷新已完成页面'}).click();
 await expect.poll(()=>staleGetFetched).toBe(true);
 const firstSave=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===`/api/jobs/${rootJob}/pdf-ocr/draft`);
 await draft.getByRole('button',{name:'清除',exact:true}).first().click();
 await expect(processedImage).toHaveCount(0);
 await expect(firstImage).toBeVisible();
 const firstSaved=await firstSave;expect(firstSaved.status(),await firstSaved.text()).toBe(200);
 const firstDraftRevision=(await firstSaved.json()).draftRevision as number;expect(firstDraftRevision).toBeGreaterThan(staleDraftRevision);
 releaseStaleGet();
 await expect.poll(()=>staleGetFulfilled).toBe(true);
 await page.unroute(`**/api/jobs/${rootJob}/pdf-ocr/draft`);
 await expect(draft.getByText(`${phone} · 手机号 · redact`)).toBeVisible();
 await expect(draft.getByText('区域 1 · 敏感区域 · 矩形')).toBeVisible();
 const nextSave=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===`/api/jobs/${rootJob}/pdf-ocr/draft`);
 await draft.getByRole('button',{name:'清除',exact:true}).first().click();
 const secondRequest=(await nextSave).request();expect(secondRequest.postDataJSON().draftRevision).toBe(firstDraftRevision);
 expect((await nextSave).status()).toBe(200);
 await page.screenshot({path:info.outputPath('pdf-ocr-live-page-region.png'),fullPage:true});
 await draft.getByRole('combobox',{name:'页面',exact:true}).selectOption('1');
 await expect(draft.getByLabel('第 2 页已识别文字')).toHaveValue(new RegExp(phone));
 const secondSave=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===`/api/jobs/${rootJob}/pdf-ocr/draft`);
 await draft.getByRole('button',{name:'删除',exact:true}).first().click();
 expect((await secondSave).status()).toBe(200);
 await draft.getByRole('combobox',{name:'页面',exact:true}).selectOption('2');
 await expect(draft.getByRole('img',{name:'原件第 3 页'})).toBeVisible();
 const thirdSave=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===`/api/jobs/${rootJob}/pdf-ocr/draft`);
 await draft.getByRole('button',{name:'删除当前页'}).click();
 await expect(draft.getByText('此页不包含在副本中')).toBeVisible();
 expect((await thirdSave).status()).toBe(200);
 const savedDraft=await observedGet(page,`/api/jobs/${rootJob}/pdf-ocr/draft`);
 expect(savedDraft.pages.find((item:any)=>item.pageIndex===0).draft.marks).toEqual(expect.arrayContaining([expect.objectContaining({kind:'手机号',decision:'redact'})]));
 expect(savedDraft.pages.find((item:any)=>item.pageIndex===1).draft.removed).toEqual(expect.arrayContaining([expect.objectContaining({kind:'手机号'})]));
 expect(savedDraft.pages.find((item:any)=>item.pageIndex===0).draft.regions).toEqual([expect.objectContaining({reason:'敏感区域',shape:'rect'})]);
 expect(savedDraft.pages.find((item:any)=>item.pageIndex===2).draft.pageDeleted).toBe(true);
 await page.screenshot({path:info.outputPath('pdf-ocr-paused-human-draft.png'),fullPage:true});
 const prioritizeResponse=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/jobs/${rootJob}/pdf-ocr/prioritize`,{timeout:60000});
 await page.getByRole('button',{name:'继续图片识别',exact:true}).click();
 const prioritized=await prioritizeResponse;expect(prioritized.status(),await prioritized.text()).toBe(200);
 const resumedJob=(await prioritized.json()).jobId as string;expect(resumedJob).not.toBe(rootJob);
 await expect.poll(async()=>(await observedGet(page,`/api/documents/${id}`)).job?.id,{timeout:60000,intervals:[1000,2000]}).toBe(resumedJob);
 await expect(draft.getByRole('combobox',{name:'页面',exact:true}).locator('option[value="3"]')).toHaveCount(1,{timeout:30000});
 await draft.getByRole('combobox',{name:'页面',exact:true}).selectOption('3');
 await expect(draft.getByRole('img',{name:'原件第 4 页'})).toBeVisible();
 await draft.getByRole('region',{name:'PDF页面旋转'}).getByRole('button',{name:'顺时针旋转本页90°'}).click();
 await expect(draft.getByRole('region',{name:'PDF页面旋转'}).getByText('本页附加角度：90°')).toBeVisible();
 await page.screenshot({path:info.outputPath('pdf-ocr-live-rotation-pending.png'),fullPage:true});
 const rotationRequest=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname===`/api/documents/${id}/page-rotations`);
 const rotationResponse=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`/api/documents/${id}/page-rotations`,{timeout:60000});
 await draft.getByRole('region',{name:'PDF页面旋转'}).getByRole('button',{name:'应用旋转并重新识别'}).click();
 const rotationBody=(await rotationRequest).postDataJSON();expect(rotationBody).toMatchObject({revision:initial.revision,mode:'recognize',pages:[3],rotations:{'3':90}});
 const rotated=await rotationResponse;expect(rotated.status(),await rotated.text()).toBe(200);
 const rotationResult=await rotated.json();expect(rotationResult.revision).toBe(initial.revision+1);expect(rotationResult.jobId).not.toBe(resumedJob);expect(rotationResult.status).toBe('queued');expect(rotationResult.draftPages).toBeGreaterThanOrEqual(3);
 await expect.poll(async()=>(await observedGet(page,`/api/documents/${id}`)).job?.id,{timeout:60000,intervals:[1000,2000]}).toBe(rotationResult.jobId);
 await expect.poll(async()=>{
  const view=await observedGet(page,`/api/documents/${id}`);
  return{state:view.state,status:view.job?.status,kind:view.job?.kind};
 },{timeout:300000,intervals:[2000,3000,5000]}).toEqual({state:'review',status:'succeeded',kind:'detect'});
 const recognized=await observedGet(page,`/api/documents/${id}`);
 const pageZero=recognized.anchors.find((a:any)=>a.kind==='page'&&a.page===0),pageOne=recognized.anchors.find((a:any)=>a.kind==='page'&&a.page===1);
 expect(pageZero&&pageOne).toBeTruthy();
 const firstPhone=recognized.marks.find((m:any)=>m.start>=pageZero.start&&m.end<=pageZero.end&&m.kind==='手机号'&&m.decision==='redact');
 const removedPhone=recognized.marks.find((m:any)=>m.start>=pageOne.start&&m.end<=pageOne.end&&m.kind==='手机号'&&m.decision==='ignore'&&m.sources?.some((s:any)=>s.code==='pdf-ocr-draft-remove'));
 expect(firstPhone).toBeTruthy();expect(removedPhone).toBeTruthy();
 expect(recognized.pageReview.regions).toEqual(expect.arrayContaining([expect.objectContaining({page:0,reason:'敏感区域',shape:'rect'})]));
 expect(recognized.pageReview.deletedPages).toContain(2);expect(recognized.pageRotationState.rotations['3']).toBe(90);
 await expect(page.getByRole('button',{name:'逐条复核',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'逐条复核',exact:true}).click();
 // Preserve the live draft's removed provenance, then let the real human review
 // restore the same phone as a clear decision before the residue gate.
 const remaining=recognized.marks;
 for(const [index,mark] of remaining.entries()){
  await page.getByLabel(`标记 ${index+1} 处理决定`,{exact:true}).selectOption(mark.kind==='手机号'?'redact':'ignore');
  if(mark.kind==='手机号')await page.getByLabel(`标记 ${index+1} 脱敏方式`,{exact:true}).selectOption('clear');
 }
 await page.getByRole('checkbox',{name:'转换为不可选字的图片型 PDF 副本',exact:true}).check();
 const saveResponse=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===`/api/documents/${id}/review`,{timeout:60000});
 await page.getByRole('button',{name:'保存复核',exact:true}).click();
 const saved=await saveResponse;expect(saved.status(),await saved.text()).toBe(200);
 await expect(page.getByText('复核已保存',{exact:true})).toBeVisible();
 const reviewed=await observedGet(page,`/api/documents/${id}`);
 expect(reviewed.revision).toBeGreaterThan(recognized.revision);
 expect(reviewed.marks.some((m:any)=>m.start===removedPhone.start&&m.end===removedPhone.end&&m.kind===removedPhone.kind&&m.decision==='redact'&&m.replacement?.mode==='clear')).toBe(true);
 expect(reviewed.marks.some((m:any)=>m.start===firstPhone.start&&m.end===firstPhone.end&&m.kind==='手机号'&&m.decision==='redact'&&m.replacement?.mode==='clear')).toBe(true);
 await page.screenshot({path:info.outputPath('pdf-ocr-final-human-review.png'),fullPage:true});
 const exportResponse=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`/api/documents/${id}/export`,{timeout:60000});
 await page.getByRole('button',{name:'导出已选标记的处理副本',exact:true}).click();
 expect((await exportResponse).status()).toBe(200);
 const downloadButton=page.getByRole('button',{name:'核验并下载 PDF',exact:true});
 await expect(downloadButton).toBeEnabled({timeout:90000});
 const downloadEvent=page.waitForEvent('download',{timeout:90000});
 await downloadButton.click();
 const download=await downloadEvent,output=await readFile((await download.path())!);
 expect(output.subarray(0,5).toString()).toBe('%PDF-');expect(output.length).toBeGreaterThan(source.length);
 const pdf=await openPdf(output);try{expect(pdf.count).toBe(19);const exportedFirst=await pdf.page(0,2);expect(exportedFirst.text).toBe('');const region=reviewed.pageReview.regions.find((item:any)=>item.page===0&&item.reason==='敏感区域');expect(region).toBeTruthy();const pixels=await sharp(exportedFirst.png).removeAlpha().raw().toBuffer({resolveWithObject:true});const width=reviewed.pages[0].width,height=reviewed.pages[0].height,x=Math.floor((region.x+region.width/2)*pixels.info.width/width),y=Math.floor((region.y+region.height/2)*pixels.info.height/height),offset=(y*pixels.info.width+x)*3;expect([...pixels.data.subarray(offset,offset+3)]).toEqual([0,0,0]);}finally{pdf.close();}
 await download.saveAs(info.outputPath('pdf-ocr-reviewed-output.pdf'));
 await page.screenshot({path:info.outputPath('pdf-ocr-downloaded.png'),fullPage:true});
 expect(errors).toEqual([]);
});

test('Edge PDF unsaved page decision survives natural OCR completion and merges into review',async({page},info)=>{
 test.setTimeout(600000);
 page.setDefaultTimeout(15000);
 const phone='13800138000',fileName='自然完成草稿竞态.pdf',projectName='自然完成复核-'+randomUUID().slice(0,8);
 await page.goto('/');
 await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);
 await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);
 await page.getByRole('button',{name:'登录工作台',exact:true}).click();
 await page.locator('.create-project summary').click();
 await page.getByLabel('项目名称',{exact:true}).fill(projectName);
 const projectResponse=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/projects');
 await page.getByRole('button',{name:'新建项目',exact:true}).click();
 const created=await projectResponse;expect(created.status(),await created.text()).toBe(200);
 const project=(await created.json()).id as string;
 await page.getByRole('button',{name:'导入材料',exact:true}).click();
 await page.getByLabel('选择文件',{exact:true}).setInputFiles({name:fileName,mimeType:'application/pdf',buffer:pdfFixture({pages:20,text:`Phone ${phone} - public synthetic page`})});
 await page.getByRole('button',{name:'上传文件',exact:true}).click();
 await expect(page.getByText('已保存',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'返回材料列表',exact:true}).click();
 const listed=await observedGet(page,`/api/projects/${project}/documents?limit=100&offset=0`);
 const id=listed.find((item:any)=>item.name===fileName)?.id as string;expect(id).toMatch(/^[a-f0-9-]{36}$/u);
 await page.getByRole('region',{name:'材料列表',exact:true}).getByRole('button',{name:new RegExp(fileName)}).click();
 const initial=await observedGet(page,`/api/documents/${id}`),jobId=initial.job.id as string;
 expect(initial.state).toBe('queued');expect(initial.job.kind).toBe('detect');
 await expect.poll(async()=>{
  const progress=await observedGet(page,`/api/jobs/${jobId}/pdf-ocr/progress`);
  return progress.status==='running'&&progress.completedPageNumbers.includes(1)&&progress.completedPageNumbers.length<20;
 },{timeout:180000,intervals:[1000,2000]}).toBe(true);
 const draft=page.getByRole('region',{name:'运行中 PDF 页面人工草稿',exact:true});
 await expect(draft.getByLabel('第 1 页已识别文字')).toHaveValue(new RegExp(phone));
 await expect(draft.getByRole('button',{name:'忽略',exact:true}).first()).toBeVisible();
 // Seed a separate removed row before the held request, so both Undo controls exist.
 const pageText=draft.getByLabel('第 1 页已识别文字');await pageText.evaluate((element:HTMLTextAreaElement)=>{element.focus();element.setSelectionRange(0,5);element.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});expect(await pageText.evaluate((element:HTMLTextAreaElement)=>[element.selectionStart,element.selectionEnd])).toEqual([0,5]);await expect(draft.getByText('已选范围：0–5')).toBeVisible();
 const seeded=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===`/api/jobs/${jobId}/pdf-ocr/draft`);
 await draft.getByRole('button',{name:'删除此候选',exact:true}).click();
 const seededResponse=await seeded;expect(seededResponse.status(),await seededResponse.text()).toBe(200);
 await expect(draft.getByRole('button',{name:'撤销',exact:true})).toHaveCount(1);
 let release!:()=>void,intercepted=false;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route(`**/api/jobs/${jobId}/pdf-ocr/draft`,async route=>{
  if(route.request().method()!=='PUT'){await route.continue();return;}
  intercepted=true;
  await gate;
  await route.continue();
 });
 await draft.getByRole('button',{name:'忽略',exact:true}).first().click();
 await expect.poll(()=>intercepted,{timeout:30000}).toBe(true);
 // The real draft PUT is held while the worker completes. Both undo controls must
 // stay unavailable until the response is reconciled with the current revision.
 await expect(draft.getByRole('button',{name:'撤销',exact:true})).toHaveCount(2);
 for(const undo of await draft.getByRole('button',{name:'撤销',exact:true}).all())await expect(undo).toBeDisabled();
 // Hold only the outgoing request. The real worker and the real endpoint finish independently.
 await expect.poll(async()=>{
  const view=await observedGet(page,`/api/documents/${id}`);
  return view.state==='review'&&view.job?.id===jobId&&view.job?.status==='succeeded';
 },{timeout:300000,intervals:[2000,3000,5000]}).toBe(true);
 await expect(draft).toBeVisible();
 await page.screenshot({path:info.outputPath('pdf-ocr-natural-complete-pending.png'),fullPage:true});
 const late=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===`/api/jobs/${jobId}/pdf-ocr/draft`);
 const merged=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===`/api/jobs/${jobId}/pdf-ocr/draft/complete`);
 release();
 const lateResponse=await late;expect(lateResponse.status(),await lateResponse.text()).toBe(409);expect((await lateResponse.json()).error).toBe('PDF_OCR_DRAFT_COMPLETED');
 const mergeResponse=await merged;expect(mergeResponse.status(),await mergeResponse.text()).toBe(200);expect((await mergeResponse.json()).reviewRequired).toBe(true);
 const final=await observedGet(page,`/api/documents/${id}`);
 expect(final.revision).toBe(initial.revision+1);expect(final.reviewOrigin).toBe('human_review');
 expect(final.marks.some((mark:any)=>mark.kind==='手机号'&&mark.decision==='ignore'&&final.text.slice(mark.start,mark.end)===phone)).toBe(true);
 await expect(draft).toHaveCount(0);
 await expect(page.getByRole('button',{name:'逐条复核',exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('pdf-ocr-natural-complete-merged.png'),fullPage:true});
});
