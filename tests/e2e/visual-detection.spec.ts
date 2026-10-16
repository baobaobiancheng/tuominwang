import { test, expect } from "./fixture.ts";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
async function saveAndReadBack(page:import('@playwright/test').Page,documentId:string,previousRevision:number){
  const saved=page.waitForResponse(response=>response.request().method()==='PUT'
    && new URL(response.url()).pathname===`/api/documents/${documentId}/review`,{timeout:60000});
  await page.getByRole('button',{name:'保存复核',exact:true}).click();
  const response=await saved;expect(response.status(),await response.text()).toBe(200);
  const submitted=response.request().postDataJSON();
  expect(submitted.pageReview.regions.length).toBeGreaterThan(0);
  expect(submitted.marks.every((mark:any)=>mark.decision!=='pending')).toBe(true);
  const readback=await page.request.get(`/api/documents/${documentId}`);
  expect(readback.status(),await readback.text()).toBe(200);
  const document=await readback.json();
  expect(document.id).toBe(documentId);
  expect(document.revision).toBeGreaterThan(previousRevision);
  expect(document.reviewOrigin).toBe('human_review');
  expect(document.pageReview.regions.length).toBeGreaterThan(0);
  expect(document.marks.every((mark:any)=>mark.decision!=='pending')).toBe(true);
  await expect(page.getByRole('button',{name:'导出已选标记的处理副本',exact:true})).toBeEnabled({timeout:30000});
}
const examples = [
  { title: "automatic stamp proposals require confirmation and export cleared pixels", name: "合成印章.png", reason: "印章", action: "查找本页印章", fixture: "visual-seal-synthetic.png", pixel: [250, 500] },
  { title: "black stamp proposals require confirmation and export cleared pixels", name: "合成黑白章.png", reason: "印章", action: "查找本页印章", fixture: "visual-monochrome-synthetic.png", pixel: [250, 500] },
  { title: "handwriting proposals require confirmation and export cleared pixels", name: "合成签名.png", reason: "签名", action: "查找本页签名", fixture: "visual-signature-synthetic.png", pixel: [170, 540] },
];
for (const example of examples) test(example.title, async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const image = await readFile("tests/fixtures/"+example.fixture);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button',{name:'登录工作台'}).click();
  await page.locator('.create-project summary').click();
  await page.getByLabel('项目名称', { exact: true }).fill('印章候选-'+randomUUID().slice(0,8));
  await page.getByRole('button',{name:'新建项目',exact:true}).click();
  await page.getByRole('button',{name:'导入材料',exact:true}).click();
  await page.getByLabel('选择文件',{exact:true}).setInputFiles({name:example.name,mimeType:'image/png',buffer:image});
  await page.getByRole('button',{name:'上传文件',exact:true}).click();
  await expect(page.getByText('已保存',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'返回材料列表',exact:true}).click();
  const opened=page.waitForResponse(response=>response.request().method()==='GET'
    && /^\/api\/documents\/[a-f0-9-]{36}$/u.test(new URL(response.url()).pathname)
    && response.status()===200);
  await page.getByRole('button',{name:new RegExp(example.name)}).click();
  const original=await(await opened).json();
  await expect(page.getByRole('button',{name:example.action})).toBeEnabled({timeout:30000});
  const scanned=page.waitForResponse(response=>response.request().method()==='POST'
    && /^\/api\/documents\/[^/]+\/pages\/0\/visual-candidates$/u.test(new URL(response.url()).pathname),{timeout:60_000});
  await page.getByRole('button',{name:example.action}).click();
  const scan=await scanned;expect(scan.status(),await scan.text()).toBe(200);
  await expect(page.getByRole('button',{name:'确认清除'})).toHaveCount(1,{timeout:30_000});
  await expect(page.getByText(`${example.reason} · 矩形区域 1`,{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'定位区域'}).click();
  await page.screenshot({path:testInfo.outputPath('visual-candidates-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'确认清除'}).click();
  await expect(page.getByText(`${example.reason} · 矩形区域 1`,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'逐条复核',exact:true}).click();
  for(const decision of await page.getByLabel(/^标记 \d+ 处理决定$/).all()) await decision.selectOption('ignore');
  await page.getByRole('checkbox',{name:'生成清除选区像素的 PNG 副本'}).check();
  await saveAndReadBack(page,original.id,original.revision);
  await page.getByRole('button',{name:'导出已选标记的处理副本',exact:true}).click();
  const button=page.getByRole('button',{name:'核验并下载 PNG',exact:true});
  await expect(button).toBeEnabled({timeout:30000});
  const pending=page.waitForEvent('download');await button.click();const download=await pending;
  const pixel=await page.evaluate(async({base64,point})=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);return [...ctx.getImageData(point[0],point[1],1,1).data].slice(0,3);},{base64:(await readFile((await download.path())!)).toString('base64'),point:example.pixel});expect(pixel).toEqual([0,0,0]);
});
