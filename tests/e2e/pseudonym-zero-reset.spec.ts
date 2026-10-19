import {test,expect} from './fixture.ts';
import type {Page,Response} from '@playwright/test';

const pathOf=(response:Response)=>new URL(response.url()).pathname;

async function documentView(page:Page,id:string){
  const response=await page.request.get(`/api/documents/${id}`);
  expect(response.status(),await response.text()).toBe(200);
  return response.json() as Promise<{revision:number;state:string;job?:{status:string};marks:{start:number;end:number;decision:string;replacement?:{mode:string;value?:string}}[]}>;
}

test('zero occurrence pseudonym reset updates the mounted editor without restoring the old value',async({page})=>{
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

  const panel = page.locator('details[aria-label="当前材料假名草稿"]');
  await expect(panel).toBeVisible();
  if(await panel.getAttribute('open')===null)await panel.locator('summary').click();
  const edit = panel.getByRole('textbox',{name:`编辑${phone}假名`,exact:true});
  const action = panel.getByRole('combobox',{name:`${phone}脱敏方式`,exact:true});
  const beforeDraftResponse = await page.request.get(`/api/documents/${id}/pseudonym-draft`);
  expect(beforeDraftResponse.status(),await beforeDraftResponse.text()).toBe(200);
  const beforeDraft = await beforeDraftResponse.json();
  const beforeEntry = beforeDraft.draft.entries.find((item:any)=>item.normalized===phone);
  expect(beforeEntry).toBeTruthy();
  const oldManual = '【联系777】';
  await edit.fill(oldManual); // real UI sets locked=true
  await action.selectOption('full_star');
  const editedResponse = page.waitForResponse(r=>r.request().method()==='POST' && new URL(r.url()).pathname===`/api/documents/${id}/pseudonym-draft/edit`);
  await panel.getByRole('button',{name:'保存此项',exact:true}).click();
  const edited = await editedResponse;
  expect(edited.status(),await edited.text()).toBe(200);
  const editedBody = await edited.json();
  const editedEntry = editedBody.draft.entries.find((item:any)=>item.normalized===phone);
  expect(editedEntry).toMatchObject({currentValue:oldManual,locked:true,action:'full_star'});
  await expect.poll(async()=> (await (await page.request.get(`/api/documents/${id}`)).json()).revision).toBe(editedBody.revision);

  // The edit saved the document; wait for the actual refreshed review UI, then
  // remove the last phone occurrence through the existing group control.
  await expect(group).toHaveCount(1); // reuse the live locator from existing setup
  await group.getByRole('button',{name:'删除此组标记',exact:true}).click();
  await page.getByRole('dialog',{name:'确认删除分组标记'}).getByRole('button',{name:'确认删除标记',exact:true}).click();
  const deletedSave = page.waitForResponse(r=>r.request().method()==='PUT' && new URL(r.url()).pathname===`/api/documents/${id}/review`);
  await page.getByRole('button',{name:'保存复核',exact:true}).click();
  const deletedSaved = await deletedSave;
  expect(deletedSaved.status(),await deletedSaved.text()).toBe(200);
  await expect(page.getByText('复核已保存',{exact:true})).toBeVisible();
  const zeroDoc = await page.request.get(`/api/documents/${id}`);
  expect(zeroDoc.status(),await zeroDoc.text()).toBe(200);
  const zeroRevision = (await zeroDoc.json()).revision;
  const zeroDraftResponse = await page.request.get(`/api/documents/${id}/pseudonym-draft`);
  expect(zeroDraftResponse.status(),await zeroDraftResponse.text()).toBe(200);
  const zeroDraft = await zeroDraftResponse.json();
  const zeroEntry = zeroDraft.draft.entries.find((item:any)=>item.normalized===phone);
  expect(zeroEntry).toMatchObject({occurrences:0,currentValue:oldManual,locked:true,action:'full_star'});

  // The old key remains in the sealed draft but is absent from the current
  // occurrence editor, matching the source UI's current-entity projection.
  const zeroPanel = page.locator('details[aria-label="当前材料假名草稿"]');
  await expect(zeroPanel).toBeVisible();
  if(await zeroPanel.getAttribute('open')===null)await zeroPanel.locator('summary').click();
  await expect(zeroPanel.locator('summary')).toContainText('0 项');
  await expect(zeroPanel.getByRole('textbox',{name:`编辑${phone}假名`,exact:true})).toHaveCount(0);
  const sameNode = await zeroPanel.elementHandle();
  expect(sameNode).not.toBeNull();
  const resetResponse = page.waitForResponse(r=>r.request().method()==='POST' && new URL(r.url()).pathname===`/api/documents/${id}/pseudonym-draft/reset`);
  await zeroPanel.getByRole('button',{name:'重置当前材料假名',exact:true}).click();
  await page.getByRole('alertdialog',{name:'操作确认'}).getByRole('button',{name:'确认执行',exact:true}).click();
  const reset = await resetResponse;
  expect(reset.status(),await reset.text()).toBe(200);
  const resetBody = await reset.json();
  expect(resetBody.revision).toBe(zeroRevision);
  const resetEntry = resetBody.draft.entries.find((item:any)=>item.normalized===phone);
  expect(resetEntry).toMatchObject({occurrences:0,locked:false,action:'pseudonym'});
  expect(resetEntry.currentValue).toBe(resetEntry.autoValue);
  expect(resetEntry.currentValue).not.toBe(oldManual);
  expect(await sameNode!.evaluate(node=>node.isConnected)).toBe(true);
  await expect(zeroPanel.getByRole('textbox',{name:`编辑${phone}假名`,exact:true})).toHaveCount(0);
  const persistedResponse = await page.request.get(`/api/documents/${id}/pseudonym-draft`);
  expect(persistedResponse.status(),await persistedResponse.text()).toBe(200);
  const persisted = await persistedResponse.json();
  expect(persisted.revision).toBe(zeroRevision);
  expect(persisted.draft.entries.find((item:any)=>item.normalized===phone)).toMatchObject({occurrences:0,currentValue:resetEntry.autoValue,locked:false,action:'pseudonym'});

});
