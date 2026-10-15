// V3 candidate for tests/e2e/task-storage-quarantine.spec.ts. Run only through
// the isolated Edge runner after the v27 immutable-archive fallback is merged.
import {test,expect} from './fixture.ts';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
import {hash} from '../../packages/adapters/storage.ts';
import {MCP_PROTOCOL,taskUUID} from '../../packages/core/mcp-tools.ts';

test('a damaged AI task is explicitly isolated and restored from its exact revision without changing results',async({page})=>{
 test.setTimeout(240000);
 const migration=new URL(process.env.MIGRATION_DATABASE_URL!);
 expect(migration.pathname).toMatch(/^\/tmw_test_/);
 const db=new pg.Client({connectionString:migration.href});
 await db.connect();
 try{
  await page.goto('/');
  await page.getByLabel('账号',{exact:true}).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码',{exact:true}).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button',{name:'登录工作台'}).click();
  await page.locator('.create-project summary').click();
  await page.getByLabel('项目名称',{exact:true}).fill(`隔离恢复-${randomUUID().slice(0,8)}`);
  const creating=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/projects'&&r.request().method()==='POST');
  await page.getByRole('button',{name:'新建项目',exact:true}).click();
  const created=await creating;expect(created.status(),await created.text()).toBe(200);
  const project=(await created.json()).id as string;
  const origin=new URL(page.url()).origin;
  const post=(path:string,data:unknown,headers:Record<string,string>={})=>page.request.post(path,{data,headers:{origin,...headers}});
  const put=(path:string,data:unknown)=>page.request.put(path,{data,headers:{origin}});
  async function ok(response:Awaited<ReturnType<typeof post>>){expect(response.status(),await response.text()).toBe(200);return response.json();}

  // Fixture setup uses real upload, worker, MCP, review and archive paths. Only
  // the one encrypted task column is damaged by the isolated test DB fixture.
  const doc=await ok(await post(`/api/projects/${project}/documents`,{text:'邮箱：archive-edge@example.com',requestId:randomUUID()}));
  const documentId=doc.id as string;
  await expect.poll(async()=>{const r=await page.request.get(`/api/documents/${documentId}`);return r.ok()?(await r.json()).state:'pending';},{timeout:60000}).toBe('review');
  const init=await post('/api/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,clientInfo:{name:'quarantine-edge',version:'1'}}});
  expect(init.status()).toBe(200);
  const session={'mcp-session-id':init.headers()['mcp-session-id'],'mcp-protocol-version':MCP_PROTOCOL};
  expect((await post('/api/mcp',{jsonrpc:'2.0',method:'notifications/initialized'},session)).status()).toBe(202);
  let rpc=1;
  async function tool(name:string,args:Record<string,unknown>){const value=await ok(await post('/api/mcp',{jsonrpc:'2.0',id:++rpc,method:'tools/call',params:{name,arguments:args}},session));expect(value.result.isError).toBe(false);return value.result.structuredContent;}
  const started=await tool('start_lawbot_redaction',{project_id:project,document_ids:[documentId],masking_mode:'pseudonym',task_mode:'ai_process',output_formats:['original','md'],request_id:randomUUID()});
  const damagedJob=started.jobId as string,damagedId=taskUUID(damagedJob);
  let task=await ok(await page.request.get(`/api/ai-collab/tasks/${damagedJob}`));
  await ok(await post(`/api/ai-collab/tasks/${damagedJob}/authorize`,{revision:task.revision,authorization:{allowRedactionPath:true,allowRestorePath:false,allowSanitizedDelivery:true,autoEnterReview:false,createExchangeFolder:true,autoRestoreAfterValidation:false}}));
  await expect.poll(async()=>{const r=await page.request.get(`/api/documents/${documentId}`);const value=r.ok()?await r.json():null;return value?.state==='review'&&value.job?.status==='succeeded'?'ready':value?.job?.status??'pending';},{timeout:60000}).toBe('ready');
  const review=await ok(await page.request.get(`/api/documents/${documentId}`));
  await ok(await put(`/api/documents/${documentId}/review`,{revision:review.revision,marks:review.marks.map((m:any)=>({...m,decision:'redact'}))}));
  task=await ok(await page.request.get(`/api/ai-collab/tasks/${damagedJob}`));
  const prepared=await ok(await post(`/api/ai-collab/tasks/${damagedJob}/prepare-export`,{revision:task.revision}));
  await expect.poll(async()=>{const r=await page.request.get(`/api/jobs/${prepared.exportJobIds[0]}/events?after=0&limit=1`);return r.ok()?(await r.json()).status:`HTTP ${r.status()}`;},{timeout:60000}).toBe('succeeded');
  await ok(await post(`/api/ai-collab/tasks/${damagedJob}/release-export`,{revision:prepared.revision}));
  const delivery=await tool('receive_sanitized_document',{job_id:damagedJob,output_format:'md'});
  const source=Buffer.from(delivery.bytesBase64,'base64');expect(hash(source)).toBe(delivery.sha256);
  const returned=Buffer.from(source.toString()+'\n已校对。');
  await ok(await put(`/api/ai-collab/tasks/${damagedJob}/slots/${delivery.slotId}`,{bytesBase64:returned.toString('base64')}));
  const submitted=await tool('submit_reviewed_document',{job_id:damagedJob,round_id:delivery.roundId,slot_id:delivery.slotId,sha256:hash(returned),suggested_name:'隔离前归档稿.md'});
  expect(submitted.validation.valid).toBe(true);expect(submitted.archivedResult.sha256).toBe(hash(returned));
  const healthy=await tool('start_lawbot_redaction',{project_id:project,task_mode:'redact_only',masking_mode:'pseudonym',request_id:randomUUID()});
  const healthyJob=healthy.jobId as string;expect(healthyJob).not.toBe(damagedJob);
  const before=await ok(await page.request.get(`/api/ai-collab/tasks/${damagedJob}`));
  expect(before.rounds.at(-1).validated).toBe(true);
  const rowBefore=(await db.query('SELECT revision,payload FROM ai_collab_tasks WHERE id=$1',[damagedId])).rows[0];
  expect(rowBefore.revision).toBe(before.revision);
  const snapshot=(await db.query('SELECT payload_ciphertext,payload_sha256 FROM ai_collab_task_snapshot WHERE task_id=$1 AND revision=$2',[damagedId,before.revision])).rows[0];
  expect(snapshot.payload_ciphertext).toBe(rowBefore.payload);expect(snapshot.payload_sha256).toBe(hash(rowBefore.payload));
  const sourceRow=(await db.query('SELECT content_hash,source_id,source_hash,revision,marks FROM documents WHERE id=$1',[documentId])).rows[0];
  const archiveRow=(await db.query('SELECT * FROM ai_result_archives WHERE task_id=$1',[damagedId])).rows[0];expect(archiveRow).toBeTruthy();
  const signed=await ok(await post(`/api/documents/${documentId}/download-link`,{revision:before.deliveries[0].revision,role:before.deliveries[0].role,artifactId:before.deliveries[0].artifactId}));
  const artifactRow=(await db.query('SELECT * FROM artifacts WHERE id=$1',[before.deliveries[0].artifactId])).rows[0];
  const paths={signed:signed.url as string,archive:`/api/ai-collab/tasks/${damagedJob}/archives/${delivery.roundId}/download`,result:`/api/ai-collab/tasks/${damagedJob}/results/${delivery.roundId}`};
  async function linkHashes(){const values:Record<string,string>={};for(const [name,path] of Object.entries(paths)){const r=await page.request.get(path);expect(r.status(),name).toBe(200);values[name]=hash(await r.body());}return values;}
  async function archiveList(){const r=await page.request.get(`/api/ai-collab/tasks/${damagedJob}/archives`);expect(r.status(),await r.text()).toBe(200);return (await r.json()).items;}
  const originalLinks=await linkHashes();expect(originalLinks.archive).toBe(hash(returned));expect(originalLinks.result).toBe(hash(returned));
  const originalArchiveList=await archiveList();expect(originalArchiveList).toHaveLength(1);

  const corrupt=`corrupt:edge-original-ciphertext:${randomUUID()}:é`;
  await db.query('UPDATE ai_collab_tasks SET payload=$2 WHERE id=$1',[damagedId,corrupt]);
  const listed=await ok(await page.request.get('/api/ai-collab/tasks'));
  const issue=listed.issues.find((i:any)=>i.jobId===damagedJob);
  expect(issue).toMatchObject({revision:before.revision,payloadSha256:hash(corrupt)});
  expect(listed.items.some((i:any)=>i.jobId===healthyJob)).toBe(true);
  expect(listed.items.some((i:any)=>i.jobId===damagedJob)).toBe(false);
  expect(await linkHashes()).toEqual(originalLinks);
  expect(await archiveList()).toEqual(originalArchiveList);

  await page.goto(`/?collab=${healthyJob}`);
  const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'AI 协作',exact:true})});
  const issues=panel.getByRole('group',{name:'任务存储需要处理'});
  const badIssue=issues.locator(':scope > div').filter({hasText:damagedJob});
  await expect(badIssue).toContainText(hash(corrupt));
  await expect(panel.getByRole('combobox',{name:'协作任务'}).locator(`option[value="${healthyJob}"]`)).toHaveCount(1);
  await expect(panel.getByRole('combobox',{name:'协作任务'}).locator(`option[value="${damagedJob}"]`)).toHaveCount(0);
  const evidence=resolve('.data/research/lawbot-2026-10-15/iteration051/remaining-contract-audit/frontend/e2e');
  await mkdir(evidence,{recursive:true});
  await panel.screenshot({path:resolve(evidence,`task-storage-issue-${randomUUID()}.png`)});
  await badIssue.getByRole('button',{name:'查看隔离确认'}).click();
  await expect(badIssue.getByRole('button',{name:'确认隔离此记录'})).toBeVisible();
  expect((await db.query('SELECT count(*)::int AS n FROM ai_collab_task_quarantine WHERE task_id=$1',[damagedId])).rows[0].n).toBe(0);
  expect((await db.query('SELECT payload,revision FROM ai_collab_tasks WHERE id=$1',[damagedId])).rows[0]).toEqual({payload:corrupt,revision:before.revision});
  const isolating=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/ai-collab/tasks/${damagedJob}/quarantine`&&r.request().method()==='POST');
  await badIssue.getByRole('button',{name:'确认隔离此记录'}).click();
  const isolatedResponse=await isolating;expect(isolatedResponse.status(),await isolatedResponse.text()).toBe(200);
  expect(isolatedResponse.request().postDataJSON()).toMatchObject({revision:before.revision,payloadSha256:hash(corrupt),confirm:true});
  const receiptId=(await isolatedResponse.json()).receiptId as string;
  const quarantine=(await db.query('SELECT * FROM ai_collab_task_quarantine WHERE receipt_id=$1',[receiptId])).rows[0];
  expect(quarantine.payload_ciphertext).toBe(corrupt);expect(quarantine.payload_sha256).toBe(hash(corrupt));expect(quarantine.task_revision).toBe(before.revision);
  expect((await db.query('SELECT payload,revision FROM ai_collab_tasks WHERE id=$1',[damagedId])).rows[0]).toEqual({payload:corrupt,revision:before.revision});
  const isolated=panel.getByRole('group',{name:'已隔离的任务记录'});
  const isolatedItem=isolated.getByRole('listitem').filter({hasText:receiptId});
  await expect(isolatedItem).toContainText(damagedJob);
  await expect(panel.getByRole('combobox',{name:'协作任务'}).locator(`option[value="${healthyJob}"]`)).toHaveCount(1);
  expect(await linkHashes()).toEqual(originalLinks);
  expect(await archiveList()).toEqual(originalArchiveList);
  await panel.screenshot({path:resolve(evidence,`task-storage-isolated-${randomUUID()}.png`)});

  const checking=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/ai-collab/quarantine/${receiptId}`&&r.request().method()==='GET');
  await isolatedItem.getByRole('button',{name:'检查恢复条件'}).click();
  const check=await checking;expect(check.status(),await check.text()).toBe(200);
  const candidate=await check.json();expect(candidate.recoveryAvailable).toBe(true);
  expect(candidate.snapshotSha256).toBe(snapshot.payload_sha256);
  await isolatedItem.getByRole('button',{name:'查看恢复确认'}).click();
  await expect(isolatedItem.getByRole('button',{name:'确认从有效快照恢复'})).toBeVisible();
  expect((await db.query('SELECT count(*)::int AS n FROM ai_collab_task_recovery WHERE receipt_id=$1',[receiptId])).rows[0].n).toBe(0);
  const recovering=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/ai-collab/quarantine/${receiptId}/recover`&&r.request().method()==='POST');
  await isolatedItem.getByRole('button',{name:'确认从有效快照恢复'}).click();
  const recoveredResponse=await recovering;expect(recoveredResponse.status(),await recoveredResponse.text()).toBe(200);
  expect(recoveredResponse.request().postDataJSON()).toMatchObject({revision:before.revision,snapshotSha256:snapshot.payload_sha256,confirm:true});
  expect((await recoveredResponse.json()).revision).toBe(before.revision+1);
  await expect(isolated).toHaveCount(0);
  await expect(panel.getByRole('combobox',{name:'协作任务'}).locator(`option[value="${damagedJob}"]`)).toHaveCount(1);
  await expect(panel.getByRole('combobox',{name:'协作任务'}).locator(`option[value="${healthyJob}"]`)).toHaveCount(1);
  const after=await ok(await page.request.get(`/api/ai-collab/tasks/${damagedJob}`));
  expect(after.revision).toBe(before.revision+1);
  for(const field of ['state','authorization','deliveries','rounds','sources','options'] as const)expect(after[field],field).toEqual(before[field]);
  expect(await linkHashes()).toEqual(originalLinks);
  expect(await archiveList()).toEqual(originalArchiveList);
  expect((await db.query('SELECT payload_ciphertext,payload_sha256 FROM ai_collab_task_quarantine WHERE receipt_id=$1',[receiptId])).rows[0]).toEqual({payload_ciphertext:corrupt,payload_sha256:hash(corrupt)});
  expect((await db.query('SELECT from_revision,to_revision,snapshot_sha256 FROM ai_collab_task_recovery WHERE receipt_id=$1',[receiptId])).rows[0]).toEqual({from_revision:before.revision,to_revision:before.revision+1,snapshot_sha256:snapshot.payload_sha256});
  expect((await db.query('SELECT content_hash,source_id,source_hash,revision,marks FROM documents WHERE id=$1',[documentId])).rows[0]).toEqual(sourceRow);
  expect((await db.query('SELECT * FROM artifacts WHERE id=$1',[before.deliveries[0].artifactId])).rows[0]).toEqual(artifactRow);
  expect((await db.query('SELECT * FROM ai_result_archives WHERE id=$1',[archiveRow.id])).rows[0]).toEqual(archiveRow);
  await panel.getByRole('combobox',{name:'协作任务'}).selectOption(damagedJob);
  const archive=panel.getByRole('group',{name:'已校验返回稿归档'});
  await expect(archive.getByRole('link',{name:'下载 隔离前归档稿.md'})).toBeVisible();
  await expect(archive).toContainText(hash(returned));
  await panel.screenshot({path:resolve(evidence,`task-storage-recovered-${randomUUID()}.png`)});

  // The v27 fallback may read an already validated independent archive; it
  // cannot invent a result for a different, archive-free damaged task.
  const healthyId=taskUUID(healthyJob),healthyCipher=`corrupt:no-archive:${randomUUID()}`;
  expect((await db.query('SELECT count(*)::int AS n FROM ai_result_archives WHERE task_id=$1',[healthyId])).rows[0].n).toBe(0);
  await db.query('UPDATE ai_collab_tasks SET payload=$2 WHERE id=$1',[healthyId,healthyCipher]);
  const noArchive=await page.request.get(`/api/ai-collab/tasks/${healthyJob}/archives/${delivery.roundId}/download`);
  expect(noArchive.status(),await noArchive.text()).toBe(404);
  const noResult=await page.request.get(`/api/ai-collab/tasks/${healthyJob}/results/${delivery.roundId}`);
  expect(noResult.status(),await noResult.text()).toBe(404);
  expect(await linkHashes()).toEqual(originalLinks);
 }finally{await db.end();}
});
