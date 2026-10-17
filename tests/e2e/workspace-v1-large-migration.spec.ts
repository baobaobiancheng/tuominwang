import { test, expect } from './fixture.ts';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import yazl from 'yazl';
import { readZip } from '../../packages/core/office-zip.ts';
import { writePortableWorkspace } from '../../packages/core/workspace-portable.ts';
import { readLegacyWorkspaceFromFile } from '../../packages/core/workspace-legacy-stream.ts';
import { readPortableWorkspaceV2FromFile, readPortableWorkspaceV3FromFile } from '../../packages/core/workspace-portable-stream.ts';
import { openPdf } from '../../packages/core/pdf-reader.ts';
import { pdfFixture } from '../pdf-fixtures.ts';
import { copyFile, readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function streamSha(stream: AsyncIterable<Uint8Array>) { const digest=createHash('sha256');for await(const part of stream)digest.update(part);return digest.digest('hex'); }
async function verifyReferenceFile(path:string,format:'legacy-zip'|'secure-v2'|'secure-v3',originals:Buffer[],password='converted-synthetic-password'){
  const opened=format==='legacy-zip'?await readLegacyWorkspaceFromFile(path):format==='secure-v2'
    ?await readPortableWorkspaceV2FromFile(path,password)
    :await readPortableWorkspaceV3FromFile(path,password);
  try{
    const snapshot=opened.snapshot;
    expect(snapshot.documents).toHaveLength(2);
    const seen=new Set<number>();
    for(const document of snapshot.documents){
      const match=/^public-([01])\.pdf$/.exec(document.fileName);
      expect(match).not.toBeNull();
      const n=Number(match![1]);expect(seen.has(n)).toBe(false);seen.add(n);
      const ref=opened.sources.get(document.sourceEntry);expect(ref).toBeTruthy();
      const stream='archive'in opened?await opened.archive.openEntry(document.sourceEntry):await opened.sources.get(document.sourceEntry)!.openReadStream();
      expect(await streamSha(stream)).toBe(sha(originals[n]));
    }
    expect([...seen].sort()).toEqual([0,1]);
    return snapshot;
  }finally{if('archive'in opened)await opened.archive.close();else await opened.close();}
}
function largePdf(text: string) {
  const base = pdfFixture({ text }), source = base.toString('latin1');
  const id = Number(source.match(/\/Size (\d+)/)?.[1]), previous = Number(source.match(/startxref\s*(\d+)/)?.[1]);
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(previous)) throw Error('invalid public PDF fixture');
  const padding = randomBytes(26 * 1024 * 1024), head = Buffer.from(`\n${id} 0 obj\n<< /Length ${padding.length} >>\nstream\n`), end = Buffer.from('\nendstream\nendobj\n');
  const offset = base.length + head.length + padding.length + end.length;
  const tail = Buffer.from(`xref\n${id} 1\n${String(base.length + 1).padStart(10, '0')} 00000 n \ntrailer\n<< /Size ${id + 1} /Root 1 0 R /Prev ${previous} >>\nstartxref\n${offset}\n%%EOF\n`);
  return Buffer.concat([base, head, padding, end, tail]);
}
function zip(parts: Map<string, Buffer>) {
  return new Promise<Buffer>((resolve, reject) => {
    const writer = new yazl.ZipFile(), chunks: Buffer[] = [];
    writer.outputStream.on('error', reject);
    writer.outputStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    writer.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    for (const [name, bytes] of parts) writer.addBuffer(bytes, name, { compress: !/\/source\./.test(name), mode: 0o100600 });
    writer.end({ forceZip64Format: true, comment: '' });
  });
}

test('oversized original V1 save as V2 uses browser native file streaming then opens both verified PDFs', async ({ page }) => {
  test.setTimeout(900000);
  const originals = [largePdf('PUBLIC FIRST 13800138000'), largePdf('PUBLIC SECOND 13900139000')];
  for (const bytes of originals) { const pdf = await openPdf(bytes); expect(pdf.count).toBe(1); pdf.close(); }
  const documents = originals.map((_, n) => ({ id: `large-${n}`, fileName: `public-${n}.pdf`, fileKind: 'pdf', sourceEntry: `documents/large-${n}/source.pdf`,
    detection: { entities: [], bboxes: [], ocrCachePages: [], documentText: `PUBLIC ${n}` },
    review: { schemaVersion: 1, kind: 'pdf', isPreviewMode: false, hasVisitedPreview: false, enablePseudonymization: false,
      pseudonymEntries: [], maskStyle: 'black', entities: [], pageRotations: {}, manualOnlyRotationPages: [], viewport: { pageNumber: 1, scale: 1 } },
    exportState: { kind: 'pdf', mode: 'default_star', exportMarkdown: false, pseudonymTableName: 'synthetic', redact: true,
      redactPseudo: false, maskStyle: 'black', exportDocx: false } }));
  const snapshot: any = { schemaVersion: 1, projectId: 'public-large-v1', projectName: 'public V1 migration',
    createdAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z', activeDocumentId: documents[0].id,
    contentRevision: 1, workspaceCorrections: [{id:'public-phone-rule',kind:'forceDetect',matchMode:'exact',pattern:'13800138000',normalizedPattern:'13800138000',entityType:'phone',risk:'normal',enabled:true,sourceDecisionIds:[],createdAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-17T00:00:00Z'}],
    inheritedPseudonymProfile:{schemaVersion:1,entries:[{key:'phone:13800138000',canonicalKey:'phone:13800138000',token:'【电话001】'}],reservedTokens:['【电话001】']},
    reviewDecisionEvents: [], profileSnapshot: null, documents };
  const parts = await readZip(await writePortableWorkspace(snapshot, new Map(documents.map((d, n) => [d.sourceEntry, Buffer.from(`seed-${n}`)])), { format: 'legacy-zip' }));
  const manifest = JSON.parse(parts.get('manifest.json')!.toString());
  for (const [n, d] of documents.entries()) { parts.set(d.sourceEntry, originals[n]); manifest.checksums[d.sourceEntry] = sha(originals[n]); }
  for (let n = 0; n < 2001; n++) { const name = `audit/legacy-${String(n).padStart(5, '0')}.txt`, bytes = Buffer.from(String(n)); parts.set(name, bytes); manifest.checksums[name] = sha(bytes); }
  parts.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  const source = await zip(parts); expect(source.length).toBeGreaterThan(50 * 1024 * 1024);
  const smallParts = new Map(parts), smallManifest = structuredClone(manifest);
  for (const [n, d] of documents.entries()) { const bytes = pdfFixture({ text: `PUBLIC ${n}` }); smallParts.set(d.sourceEntry, bytes); smallManifest.checksums[d.sourceEntry] = sha(bytes); }
  smallParts.set('manifest.json', Buffer.from(JSON.stringify(smallManifest)));
  const smallSource = await zip(smallParts); expect(smallSource.length).toBeLessThan(50 * 1024 * 1024);

  // Keep only small response receipts in Playwright. The original streaming
  // response is returned untouched to the product; its clone is hashed here.
  await page.addInitScript(() => {
    type Receipt = { path: string; status: number; bytes?: number; sha256?: string; id?: string; error?: string };
    const receipts: Receipt[] = [];
    (window as any).__tmmNetworkReceipts = receipts;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => originalFetch(input, init).then(response => {
      const path = new URL(response.url).pathname;
      if (!['/api/portable/migrate-v1-file', '/api/portable/migrate-file', '/api/portable/import-file'].includes(path)) return response;
      const clone = response.clone();
      void (async () => {
        const bytes = await clone.arrayBuffer();
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const sha256 = Array.from(digest).map(n => n.toString(16).padStart(2, '0')).join('');
        const id = path === '/api/portable/import-file' && response.status === 200
          ? JSON.parse(new TextDecoder().decode(bytes)).id as string : undefined;
        receipts.push({ path, status: response.status, bytes: bytes.byteLength, sha256, id });
      })().catch(error => receipts.push({ path, status: response.status, error: String(error) }));
      return response;
    });
  });
  async function networkReceipt(path: string, status: number, index = 0) {
    await expect.poll(() => page.evaluate(({ path, status }) =>
      ((window as any).__tmmNetworkReceipts as { path: string; status: number }[]).filter(r => r.path === path && r.status === status).length,
      { path, status }), { timeout: 180000 }).toBeGreaterThan(index);
    const receipt = await page.evaluate(({ path, status, index }) =>
      ((window as any).__tmmNetworkReceipts as { path: string; status: number; bytes: number; sha256: string; id?: string; error?: string }[])
        .filter(r => r.path === path && r.status === status)[index], { path, status, index });
    expect(receipt.error).toBeUndefined();
    expect(receipt.sha256).toMatch(/^[0-9a-f]{64}$/);
    return receipt;
  }
  async function browserFileToNode(opfsName: string, outputName: string) {
    const download = page.waitForEvent('download', { timeout: 180000 });
    await page.evaluate(async ({ opfsName, outputName }) => {
      const file = await (await navigator.storage.getDirectory()).getFileHandle(opfsName).then(handle => handle.getFile());
      const url = URL.createObjectURL(file), anchor = document.createElement('a');
      anchor.href = url; anchor.download = outputName; document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, { opfsName, outputName });
    const saved = await download, path = test.info().outputPath(outputName);
    await copyFile((await saved.path())!, path);
    return path;
  }

  const nativeSavePath = process.env.TMM_NATIVE_SAVE_AS_PATH;
  // The default automated branch uses a real browser OPFS handle. The headed
  // branch leaves the OS picker intact for a human to choose nativeSavePath.
  if (!nativeSavePath) await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async (options: { suggestedName: string }) => {
      const sameName = (window as any).__sameNameTmmPickerOnce === true;
      delete (window as any).__sameNameTmmPickerOnce;
      if ((window as any).__pauseTmmPickerOnce === true) {
        delete (window as any).__pauseTmmPickerOnce;
        await new Promise<void>(resolve => { (window as any).__releaseTmmPicker = resolve; });
        delete (window as any).__releaseTmmPicker;
      }
      const handle = await (await navigator.storage.getDirectory()).getFileHandle(sameName ? 'public-large-v1.tmm' : options.suggestedName, { create: true });
      if (sameName) { const writable = await handle.createWritable(); await writable.write(new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4])); await writable.close(); }
      return handle;
    } });
  });
  await page.goto('/');
  await page.getByLabel('账号', { exact: true }).fill(process.env.E2E_USERNAME!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: '登录工作台' }).click();
  await page.locator('.create-project summary').click();
  const originalProjectName = '旧工程接续-' + randomUUID().slice(0, 8);
  await page.getByLabel('项目名称', { exact: true }).fill(originalProjectName);
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/projects' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  const createdProject = await created; expect(createdProject.status()).toBe(200);
  await expect(page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: originalProjectName, exact: true })).toHaveAttribute('aria-current', 'page', { timeout: 30000 });
  await expect(page.locator('.materials')).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  await expect(page.locator('fieldset.workspace-controls')).toBeEnabled({ timeout: 30000 });
  const portable = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^工程备份与导入$/ }) });
  await portable.locator('summary').click();
  await portable.getByLabel('导入工程文件', { exact: true }).setInputFiles({ name: 'public-small-v1.tmm', mimeType: 'application/octet-stream', buffer: smallSource });
  await portable.getByLabel('新项目名称', { exact: true }).fill('V1 容量引导');
  const capacity = page.waitForResponse(response => new URL(response.url()).pathname === '/api/portable/import-file' && response.request().method() === 'POST');
  await portable.getByRole('button', { name: '导入工程并新建项目' }).click();
  const capacityResponse = await capacity; expect(capacityResponse.status()).toBe(400);
  expect((await capacityResponse.json()).error).toBe('WORKSPACE_ENTRY_LIMIT');
  await expect(portable.getByText('旧版 TMM V1 工程超出普通打开范围。另存为 TMM V2 后会导入为新项目，原文件会保留。')).toBeVisible();
  const sourcePath = test.info().outputPath('public-large-v1.tmm');
  await writeFile(sourcePath, source);
  await portable.getByLabel('读取或转换 TMM', { exact: true }).setInputFiles(sourcePath);
  await portable.getByLabel('新文件密码', { exact: true }).fill('synthetic-transfer-password');
  if (!nativeSavePath) {
    let migrationPosts = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/portable/migrate-v1-file' && request.method() === 'POST') migrationPosts++; });
    await page.evaluate(() => { (window as any).__sameNameTmmPickerOnce = true; });
    await portable.getByRole('button', { name: '另存为 TMM V2 并打开', exact: true }).click();
    await expect(portable.getByText('请选择不同的文件名另存，原工程文件会保留。')).toBeVisible();
    expect(migrationPosts).toBe(0);
    const sourceStillIntact = await page.evaluate(async () => {
      const handle = await (await navigator.storage.getDirectory()).getFileHandle('public-large-v1.tmm');
      const bytes = await (await handle.getFile()).arrayBuffer();
      return Array.from(new Uint8Array(bytes));
    });
    expect(sourceStillIntact).toEqual([80, 75, 3, 4, 1, 2, 3, 4]);
  }
  const migrate = page.waitForResponse(response => new URL(response.url()).pathname === '/api/portable/migrate-v1-file' && response.request().method() === 'POST', { timeout: 180000 });
  const imported = page.waitForResponse(response => new URL(response.url()).pathname === '/api/portable/import-file' && response.request().method() === 'POST', { timeout: 180000 });
  await portable.getByRole('button', { name: '另存为 TMM V2 并打开', exact: true }).click();
  const migratedResponse = await migrate; expect(migratedResponse.status()).toBe(200);
  const result = await imported; expect(result.status()).toBe(200);
  const importReceipt = await networkReceipt('/api/portable/import-file', 200);
  const project = importReceipt.id as string; expect(project).toBeTruthy();
  const migrationReceipt = await networkReceipt('/api/portable/migrate-v1-file', 200);
  const migratedHash = migrationReceipt.sha256;
  expect(Number(migratedResponse.headers()['content-length'])).toBe(migrationReceipt.bytes);
  if (nativeSavePath) {
    const saved = await readFile(nativeSavePath);
    expect(saved.length).toBeGreaterThan(50 * 1024 * 1024);
    expect(saved.length).toBe(migrationReceipt.bytes);
    expect(saved.subarray(0, 8).toString('ascii')).toBe('LBTSC001');
    expect(sha(saved)).toBe(migratedHash);
    console.info('TMM_NATIVE_SAVE_AS_VERIFIED', nativeSavePath, saved.length, migratedHash);
  } else {
    const saved = await page.evaluate(async () => {
      const file = await (await navigator.storage.getDirectory()).getFileHandle('public-large-v1_V2.tmm').then(handle => handle.getFile());
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
      return { size: file.size, magic: Array.from(header).map(n => String.fromCharCode(n)).join(''),
        sha256: Array.from(digest).map(n => n.toString(16).padStart(2, '0')).join('') };
    });
    expect(saved.size).toBeGreaterThan(50 * 1024 * 1024);
    expect(saved.size).toBe(migrationReceipt.bytes);
    expect(saved.magic).toBe('LBTSC001'); expect(saved.sha256).toBe(migratedHash);
    console.info('TMM_BROWSER_OPFS_VERIFIED', saved.size, saved.sha256);
  }
  const listing = await page.request.get(`/api/projects/${project}/documents`); expect(listing.status()).toBe(200);
  expect((await listing.json()).length).toBe(2);
  await expect(page.getByRole('button', { name: /public-0\.pdf/ })).toBeVisible();
  if (nativeSavePath) {
    const nativeReadback = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^工程备份与导入$/ }) });
    await nativeReadback.locator('summary').click();
    const nativeInput = nativeReadback.getByLabel('读取或转换 TMM', { exact: true });
    await nativeInput.setInputFiles(nativeSavePath);
    const browserReadback = await nativeInput.evaluate(async input => {
      const bytes = await (input as HTMLInputElement).files![0].arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      return { bytes: bytes.byteLength, sha256: Array.from(digest).map(n => n.toString(16).padStart(2, '0')).join('') };
    });
    const nodeSaved = await readFile(nativeSavePath);
    expect(browserReadback.bytes).toBe(nodeSaved.length);
    expect(browserReadback.sha256).toBe(sha(nodeSaved));
    expect(browserReadback.sha256).toBe(migratedHash);
    console.info('TMM_NATIVE_BROWSER_READBACK_VERIFIED', browserReadback.bytes, browserReadback.sha256);
  }
  if (!nativeSavePath) {
    // Reuse the same verified >50 MiB V2 File for the three existing TMM actions.
    await page.reload();
    await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: originalProjectName, exact: true }).click();
    await expect(page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: originalProjectName, exact: true })).toHaveAttribute('aria-current', 'page', { timeout: 30000 });
    await expect(page.locator('.materials')).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
    await expect(page.locator('fieldset.workspace-controls')).toBeEnabled({ timeout: 30000 });
    const compatibility = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^工程备份与导入$/ }) });
    await compatibility.locator('summary').click();
    const selected = await browserFileToNode('public-large-v1_V2.tmm', 'public-large-v2.tmm');
    expect((await stat(selected)).size).toBe(migrationReceipt.bytes);
    expect(await streamSha(createReadStream(selected))).toBe(migratedHash);
    const migratedWorkspace = await verifyReferenceFile(selected, 'secure-v2', originals, 'synthetic-transfer-password');
    expect(migratedWorkspace.workspaceCorrections.some((c: any) => c.pattern === '13800138000')).toBe(true);
    await compatibility.getByLabel('读取或转换 TMM', { exact: true }).setInputFiles(selected);
    await compatibility.getByLabel('现有文件密码', { exact: true }).fill('synthetic-transfer-password');
    const preview = page.waitForResponse(r => new URL(r.url()).pathname === '/api/portable/review-profile-file' && r.request().method() === 'POST', { timeout: 180000 });
    await compatibility.getByRole('button', { name: '读取可沿用的审查记录', exact: true }).click();
    const previewResponse = await preview; expect(previewResponse.status(), await previewResponse.text()).toBe(200);
    const profile = await previewResponse.json(); expect(profile.corrections.map((c: any) => c.pattern)).toContain('13800138000');
    expect(profile.pseudonyms.entries.map((e: any) => e.token)).toContain('【电话001】');
    await expect(compatibility.getByText(/1 条规则 · 1 条假名/)).toBeVisible();
    const applied = page.waitForResponse(r => new URL(r.url()).pathname.match(/\/api\/projects\/[^/]+\/portable\/review-profile-file$/) !== null && r.request().method() === 'POST', { timeout: 180000 });
    await compatibility.getByRole('button', { name: '沿用规则与假名', exact: true }).click();
    const appliedResponse = await applied; expect(appliedResponse.status(), await appliedResponse.text()).toBe(200);
    expect((await appliedResponse.json()).requiresRecognitionAndReview).toBe(true);
    await expect(compatibility.getByText('已沿用，请重新识别并复核材料。')).toBeVisible();
    const presets = await page.request.get(`/api/projects/${(await createdProject.json()).id}/presets`);
    expect(presets.status(), await presets.text()).toBe(200);
    const inherited = await presets.json();
    expect(JSON.stringify(inherited)).toContain('13800138000');
    await compatibility.getByLabel('新文件密码', { exact: true }).fill('converted-synthetic-password');
    let staleFilePosts = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/portable/migrate-file' && request.method() === 'POST') staleFilePosts++; });
    await page.evaluate(() => { (window as any).__pauseTmmPickerOnce = true; });
    await compatibility.getByRole('button', { name: '转换并下载', exact: true }).click();
    await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseTmmPicker === 'function')).toBe(true);
    await compatibility.getByLabel('读取或转换 TMM', { exact: true }).setInputFiles({ name: 'changed-source.tmm', mimeType: 'application/octet-stream', buffer: Buffer.from('changed') });
    await page.evaluate(() => (window as any).__releaseTmmPicker());
    await expect(compatibility.getByRole('status').filter({ hasText: '正在处理工程文件…' })).toHaveCount(0);
    expect(staleFilePosts).toBe(0);
    await compatibility.getByLabel('读取或转换 TMM', { exact: true }).setInputFiles(selected);
    for (const [conversionIndex, outputFormat] of (['legacy-zip', 'secure-v2', 'secure-v3'] as const).entries()) {
      await compatibility.getByLabel('导出或转换格式').selectOption(outputFormat);
      const converted = page.waitForResponse(r => new URL(r.url()).pathname === '/api/portable/migrate-file' && r.request().method() === 'POST', { timeout: 180000 });
      await compatibility.getByRole('button', { name: '转换并下载', exact: true }).click();
      const conversion = await converted; expect(conversion.status()).toBe(200);
      const conversionReceipt = await networkReceipt('/api/portable/migrate-file', 200, conversionIndex);
      expect(Number(conversion.headers()['content-length'])).toBe(conversionReceipt.bytes);
      await expect(compatibility.getByText('已转换并核对全部原件及完整审查记录，请核对浏览器保存的文件。')).toBeVisible({ timeout: 180000 });
      const convertedPath = await browserFileToNode('转换后审查.tmm', `converted-${conversionIndex}.tmm`);
      expect((await stat(convertedPath)).size).toBe(conversionReceipt.bytes);
      expect(await streamSha(createReadStream(convertedPath))).toBe(conversionReceipt.sha256);
      const opened = await verifyReferenceFile(convertedPath, outputFormat, originals);
      expect(opened.workspaceCorrections.some((c: any) => c.pattern === '13800138000')).toBe(true);
      const browserSaved = await page.evaluate(async () => {
        const handle = await (await navigator.storage.getDirectory()).getFileHandle('转换后审查.tmm');
        const bytes = await (await handle.getFile()).arrayBuffer(), digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        return { size: bytes.byteLength, sha256: Array.from(digest).map(n => n.toString(16).padStart(2, '0')).join('') };
      });
      expect(browserSaved.size).toBe(conversionReceipt.bytes); expect(browserSaved.sha256).toBe(conversionReceipt.sha256);
    }
    const unchangedSource = await compatibility.getByLabel('读取或转换 TMM', { exact: true }).evaluate(async input => {
      const selected = (input as HTMLInputElement).files![0], bytes = await selected.arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      return Array.from(digest).map(n => n.toString(16).padStart(2, '0')).join('');
    });
    expect(unchangedSource).toBe(migratedHash);
    await page.reload();
    const importedNav = page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: /public-large-v1_V2/ });
    await importedNav.click();
    await expect(importedNav).toHaveAttribute('aria-current', 'page', { timeout: 30000 });
    await expect(page.locator('.materials')).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
    await expect(page.locator('fieldset.workspace-controls')).toBeEnabled({ timeout: 30000 });
    const importedCompatibility = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^工程备份与导入$/ }) });
    await importedCompatibility.locator('summary').click();
    await importedCompatibility.getByLabel('新文件密码', { exact: true }).fill('converted-synthetic-password');
    for (const outputFormat of ['legacy-zip', 'secure-v2', 'secure-v3'] as const) {
      await importedCompatibility.getByLabel('导出或转换格式').selectOption(outputFormat);
      const save = page.waitForResponse(r => /\/api\/projects\/[^/]+\/portable\/save$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 180000 });
      await importedCompatibility.getByRole('button', { name: '下载当前项目 TMM', exact: true }).click();
      const receiptStart = await save; expect(receiptStart.status(), await receiptStart.text()).toBe(200);
      await expect(importedCompatibility.getByRole('link', { name: '下载已保存的审查传输副本' })).toBeVisible({ timeout: 180000 });
      const downloadResponse = page.context().waitForEvent('response', { predicate: r => /\/portable\/saves\/[^/]+\/download$/.test(new URL(r.url()).pathname), timeout: 180000 });
      const download = page.waitForEvent('download', { timeout: 180000 });
      await importedCompatibility.getByRole('link', { name: '下载已保存的审查传输副本' }).click();
      const delivered = await downloadResponse; expect(delivered.status()).toBe(200);
      const browserDownload = await download, savedPath=(await browserDownload.path())!;
      const savedWorkspace = await verifyReferenceFile(savedPath,outputFormat,originals);
      expect(savedWorkspace.documents).toHaveLength(2);
      expect((await stat(savedPath)).size).toBeGreaterThan(50 * 1024 * 1024);
    }
  }
});
