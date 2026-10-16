import{test,expect}from'./fixture.ts';
import{randomUUID}from'node:crypto';
import{setTimeout as delay}from'node:timers/promises';
import{mkdir,writeFile}from'node:fs/promises';
import{officeFixture}from'../office-fixtures.ts';
import{readZip,writeZip}from'../../packages/core/office-zip.ts';

test('Edge type hide persists across real review save and reload, restores pending with manual birth intact, and never writes false-positive feedback',async({page},testInfo)=>{
 test.setTimeout(180000);page.setDefaultTimeout(15000);await page.setViewportSize({width:1440,height:1000});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const browserSessionResponses:{status:number;retryAfter:string|null}[]=[],reloadProofs:{session:{status:number;retryAfter:string|null}[];projects:{status:number;retryAfter:string|null}[];accountPreserved:boolean}[]=[],exhaustion:{successful:number;retryAfter:string|null}[]=[];
 let browserRateRecovered=false;
 page.on('response',response=>{if(response.request().method()==='GET'&&new URL(response.url()).pathname==='/api/session')browserSessionResponses.push({status:response.status(),retryAfter:response.headers()['retry-after']??null});});
 await page.goto('/');await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'登录工作台'}).click();const projectName='隐藏恢复-'+randomUUID().slice(0,8);await page.locator('.create-project summary').click();await page.getByLabel('项目名称',{exact:true}).fill(projectName);await page.getByRole('button',{name:'新建项目',exact:true}).click();
 const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',text='联系电话13800138000，另一个13800138000。CLIENT A',parts=await readZip(await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`}));for(const key of [...parts.keys()])if(!['[Content_Types].xml','_rels/.rels','word/document.xml'].includes(key))parts.delete(key);const source=await writeZip(parts),fileName='公开隐藏恢复.docx';await page.getByRole('button',{name:'导入材料',exact:true}).click();await page.getByLabel('选择文件',{exact:true}).setInputFiles({name:fileName,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:source});await page.getByRole('button',{name:'上传文件',exact:true}).click();await expect(page.getByText('已保存',{exact:true})).toBeVisible();await page.getByRole('button',{name:'返回材料列表',exact:true}).click();const opened=page.waitForResponse(r=>r.request().method()==='GET'&&/\/api\/documents\/[a-f0-9-]{36}(?:\?|$)/u.test(r.url()));await page.getByRole('button',{name:new RegExp(fileName.replaceAll('.','\\.'))}).click();const id=(await(await opened).json()).id;
 const retryAfterMs=(response:{headers:()=>Record<string,string>})=>{const header=response.headers()['retry-after'];expect(typeof header==='string'&&/^(?:0|[1-9]\d?)$/u.test(header)).toBe(true);const seconds=Number(header);expect(Number.isInteger(seconds)&&seconds>=0&&seconds<=60).toBe(true);return(seconds+1)*1000;};
 const getAfterRateWindow=async(url:string)=>{for(let attempt=0;attempt<3;attempt++){const response=await page.request.get(url);if(response.status()===429){expect(attempt).toBeLessThan(2);await delay(retryAfterMs(response));continue;}expect(response.status()).toBe(200);return response.json();}throw Error('RATE_LIMIT_RETRY_EXHAUSTED');};
 const read=()=>getAfterRateWindow('/api/documents/'+id),feedback=async()=>(await getAfterRateWindow('/api/feedback?documentId='+id)).items;
 const save=async()=>{const shown=await page.locator('.statusbar').textContent(),previous=shown?.match(/复核版本\s+(\d+)/u);expect(previous,shown??'').toBeTruthy();const receipt=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname==='/api/documents/'+id+'/review',{timeout:15000});await page.getByRole('button',{name:'保存复核',exact:true}).click();const response=await receipt;expect(response.status(),await response.text()).toBe(200);await expect(page.locator('.statusbar')).toContainText(`复核版本 ${Number(previous![1])+1}`,{timeout:30000});await expect(page.locator('.statusbar')).not.toContainText('未保存');};
 const reload=async()=>{
  const isSession=(r:any)=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/session';
  const isProjects=(r:any)=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/projects';
  let sessionPromise=page.waitForResponse(isSession,{timeout:0}),projectPromise=page.waitForResponse(isProjects,{timeout:0});
  await page.reload();
  let auth=await Promise.race([sessionPromise,delay(15000).then(()=>{throw Error('SESSION_REQUEST_MISSING');})]);
  const sessionChain=[{status:auth.status(),retryAfter:auth.headers()['retry-after']??null}];
  for(let attempt=0;auth.status()===429;attempt++){
   expect(attempt).toBeLessThan(2);
   await expect(page.getByRole('heading',{name:'登录脱敏汪'})).toHaveCount(0);
   sessionPromise=page.waitForResponse(isSession,{timeout:retryAfterMs(auth)+15000});
   auth=await sessionPromise;
   sessionChain.push({status:auth.status(),retryAfter:auth.headers()['retry-after']??null});
  }
  expect(auth.status()).toBe(200);
  expect((await auth.json()).username).toBe(process.env.E2E_USERNAME);
  if(sessionChain.some(entry=>entry.status===429))browserRateRecovered=true;
  let list=await Promise.race([projectPromise,delay(15000).then(()=>{throw Error('PROJECT_REQUEST_MISSING');})]);
  const projectChain=[{status:list.status(),retryAfter:list.headers()['retry-after']??null}];
  for(let attempt=0;list.status()===429;attempt++){
   expect(attempt).toBeLessThan(2);
   await expect(page.getByRole('heading',{name:'登录脱敏汪'})).toHaveCount(0);
   projectPromise=page.waitForResponse(isProjects,{timeout:retryAfterMs(list)+15000});
   list=await projectPromise;
   projectChain.push({status:list.status(),retryAfter:list.headers()['retry-after']??null});
  }
  expect(list.status()).toBe(200);
  reloadProofs.push({session:sessionChain,projects:projectChain,accountPreserved:true});
  await page.getByRole('navigation',{name:'项目列表'}).getByRole('button',{name:projectName,exact:true}).click();
  const materialRow=page.getByRole('region',{name:'材料列表',exact:true}).getByRole('button',{name:new RegExp(fileName.replaceAll('.','\\.'))});
  const isDocument=(r:any)=>r.request().method()==='GET'&&new URL(r.url()).pathname===`/api/documents/${id}`;
  let documentResponse:import('@playwright/test').Response|undefined;
  for(let attempt=0;attempt<3;attempt++){
   const sessionPromise=page.waitForResponse(isSession,{timeout:15000});
   await materialRow.click();
   const gate=await sessionPromise;
   if(gate.status()===429){
    expect(attempt).toBeLessThan(2);
    await expect(page.getByRole('alert')).toContainText('请求过于频繁');
    await delay(retryAfterMs(gate));
    continue;
   }
   expect(gate.status()).toBe(200);
   const response=await page.waitForResponse(isDocument,{timeout:15000});
   if(response.status()===429){
    expect(attempt).toBeLessThan(2);
    await expect(page.getByRole('alert')).toContainText('请求过于频繁');
    await delay(retryAfterMs(response));
    continue;
   }
   documentResponse=response;
   break;
  }
  expect(documentResponse).toBeTruthy();
  expect(documentResponse!.status(),await documentResponse!.text()).toBe(200);
  expect((await documentResponse!.json()).id).toBe(id);
  await expect(page.getByRole('region',{name:'实体分组',exact:true})).toBeVisible();
 };
 await expect.poll(async()=>(await read()).state,{timeout:30000}).toBe('review');const manual=page.locator('details[aria-label="人工选择同文位置"]'),rawType='source-hidden-manual';await manual.locator('summary').click();await manual.getByLabel('同文查找内容',{exact:true}).fill('CLIENT A');await manual.getByLabel('同文原始实体类型',{exact:true}).fill(rawType);const manualResult=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/documents/'+id+'/manual-occurrences',{timeout:30000});await manual.getByRole('button',{name:'查找全部同文位置',exact:true}).click();const manualResponse=await manualResult;expect(manualResponse.status(),await manualResponse.text()).toBe(200);await expect(manual.getByRole('status').first()).toContainText('找到 1 处',{timeout:15000});await manual.getByRole('button',{name:'将所选位置加入标记',exact:true}).click();await save();const original=await read(),phoneStart=original.text.indexOf('13800138000'),auto=original.marks.find((m:any)=>m.start===phoneStart&&m.end===phoneStart+11);expect(auto).toBeTruthy();const baseline=await feedback();expect(baseline.filter((r:any)=>r.type==='false_negative')).toHaveLength(1);const feedbackIds=baseline.map((r:any)=>r.id).sort();
 const dir='.data/research/lawbot-2026-10-15/iteration036';await mkdir(dir,{recursive:true});
 for(const {label,manualBirth,select}of[{label:auto.kind,manualBirth:false,select:(m:any)=>m.kind===auto.kind&&m.rawEntityType===undefined},{label:rawType,manualBirth:true,select:(m:any)=>m.rawEntityType===rawType}]){
  const groups=page.getByRole('region',{name:'实体分组',exact:true}),heading=groups.locator('.entity-type-heading').filter({hasText:label});await expect(heading).toHaveCount(1,{timeout:30000});await heading.getByRole('button',{name:'隐藏此类型',exact:true}).click();await expect(heading).toHaveCount(0);await save();const hidden=await read(),targets=hidden.marks.filter(select);expect(targets.length).toBeGreaterThan(0);expect(targets.every((m:any)=>m.hiddenByType===true&&m.decision==='ignore'&&m.userAdded===manualBirth&&m.hiddenTypeWasUserAdded===manualBirth&&!!m.sources?.some((source:any)=>source.layer==='manual')===manualBirth)).toBe(true);expect((await feedback()).map((r:any)=>r.id).sort()).toEqual(feedbackIds);
  await reload();await expect(page.getByRole('region',{name:'实体分组',exact:true}).locator('.entity-type-heading').filter({hasText:label})).toHaveCount(0);const persisted=(await read()).marks.filter(select);expect(persisted.every((m:any)=>m.hiddenByType===true&&m.decision==='ignore')).toBe(true);await writeFile(`${dir}/edge-hidden-${manualBirth?'manual':'automatic'}-${Date.now()}.png`,await page.getByRole('region',{name:'实体分组',exact:true}).screenshot());
  await page.getByRole('button',{name:'恢复隐藏类型（需重新确认）',exact:true}).click();await expect(page.getByRole('region',{name:'实体分组',exact:true}).locator('.entity-type-heading').filter({hasText:label})).toHaveCount(1,{timeout:30000});await save();const restored=await read(),active=restored.marks.filter(select);expect(active.every((m:any)=>m.hiddenByType!==true&&m.decision==='pending'&&m.userAdded===manualBirth&&m.hiddenTypeWasUserAdded===undefined&&!!m.sources?.some((source:any)=>source.layer==='manual')===manualBirth)).toBe(true);expect(restored.text).toBe(original.text);expect((await feedback()).map((r:any)=>r.id).sort()).toEqual(feedbackIds);
 }
 if(!browserRateRecovered){
  for(let window=0;window<3&&!browserRateRecovered;window++){
   let successful=0,limited=false;
   for(let request=0;request<121;request++){
    const response=await page.request.get('/api/session');
    if(response.status()===429){const wait=retryAfterMs(response);exhaustion.push({successful,retryAfter:response.headers()['retry-after']??null});limited=true;if(wait<2000){await delay(wait);break;}await reload();break;}
    expect(response.status()).toBe(200);expect((await response.json()).username).toBe(process.env.E2E_USERNAME);successful++;
   }
   expect(limited).toBe(true);
  }
 }
 expect(browserRateRecovered).toBe(true);
 const final=await read();expect(final.text).toBe(original.text);
 for(const {manualBirth,select}of[{manualBirth:false,select:(m:any)=>m.kind===auto.kind&&m.rawEntityType===undefined},{manualBirth:true,select:(m:any)=>m.rawEntityType===rawType}]){const marks=final.marks.filter(select);expect(marks.length).toBeGreaterThan(0);expect(marks.every((m:any)=>m.hiddenByType!==true&&m.decision==='pending'&&m.userAdded===manualBirth)).toBe(true);}
 expect((await feedback()).map((r:any)=>r.id).sort()).toEqual(feedbackIds);
 await testInfo.attach('browser-session-rate-window',{body:Buffer.from(JSON.stringify({browserSessionResponses,reloadProofs,exhaustion,browserRateRecovered},null,2)),contentType:'application/json'});
 expect(errors).toEqual([]);await writeFile(`${dir}/edge-type-hide-restored-${Date.now()}.png`,await page.getByRole('region',{name:'实体分组',exact:true}).screenshot());
});
