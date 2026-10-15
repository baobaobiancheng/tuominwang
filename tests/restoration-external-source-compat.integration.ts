import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { passwordHash } from '../packages/adapters/storage.ts';
import { officeFixture } from './office-fixtures.ts';
import { readZip } from '../packages/core/office-zip.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app = await buildApp(), admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
after(async () => { await app.close(); await pool.end(); await admin.end(); });

test('external single-file restore keeps source no-op bytes, exact Markdown key precedence and explicit preservation of unmatched external labels', async () => {
  const tenant = randomUUID(), user = randomUUID();
  const username = `restore-compat-${user}`, password = 'synthetic-restore-password';
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [user, tenant, username, passwordHash(password)]);
  const origin = process.env.APP_ORIGIN!;
  const login = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { username, password } });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const req = (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, headers: { origin, cookie }, payload });
  const created = await req('POST', '/api/projects', { name: '外部文件回填源兼容' });
  assert.equal(created.statusCode, 200, created.body);
  const project = created.json().id as string, base = `/api/projects/${project}/restoration`;
  const mappingBytesBase64 = Buffer.from(JSON.stringify({ mappings: { '【姓名001】': '合成甲' } })).toString('base64');
  const restore = async (name: string, bytes: Buffer, mapping = mappingBytesBase64) =>
    req('POST', `${base}/files`, { fileName: name, bytesBase64: bytes.toString('base64'), mappingBytesBase64: mapping });

  const plain = Buffer.from('公开正文');
  const markdown = await restore('ordinary.md', plain);
  assert.equal(markdown.statusCode, 200, markdown.body);
  assert.equal(markdown.json().stats.totalReplacements, 0);
  const markdownCopy = await req('GET', markdown.json().downloadPath);
  assert.equal(markdownCopy.statusCode, 200, markdownCopy.body);
  assert.deepEqual(markdownCopy.rawPayload, plain);
  const bomCrlf = Buffer.from('\uFEFF公开正文\r\n');
  const bomNoop = await restore('ordinary-bom.md', bomCrlf);
  assert.equal(bomNoop.statusCode, 200, bomNoop.body);
  assert.equal(bomNoop.json().stats.totalReplacements, 0);
  const bomNoopCopy = await req('GET', bomNoop.json().downloadPath);
  assert.deepEqual(bomNoopCopy.rawPayload, bomCrlf);
  const bomMatched = await restore('matched-bom.md', Buffer.from('\uFEFF【姓名001】\r\n'));
  assert.equal(bomMatched.statusCode, 200, bomMatched.body);
  assert.equal(bomMatched.json().stats.totalReplacements, 1);
  const bomMatchedCopy = await req('GET', bomMatched.json().downloadPath);
  assert.deepEqual(bomMatchedCopy.rawPayload, Buffer.from('\uFEFF合成甲\r\n'));

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const docxBytes = await officeFixture('docx', { 'word/document.xml': `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>公开正文</w:t></w:r></w:p></w:body></w:document>` });
  const docx = await restore('ordinary.docx', docxBytes);
  assert.equal(docx.statusCode, 200, docx.body);
  assert.equal(docx.json().stats.totalReplacements, 0);
  const docxCopy = await req('GET', docx.json().downloadPath);
  assert.equal(docxCopy.statusCode, 200, docxCopy.body);
  assert.deepEqual(docxCopy.rawPayload, docxBytes);

  for (const mappings of [{ 'A&B': '甲', 'A&amp;B': '乙' }, { 'A&amp;B': '乙', 'A&B': '甲' }]) {
    const mapping = Buffer.from(JSON.stringify({ mappings })).toString('base64');
    const exact = await restore('exact.md', Buffer.from('A&B A&amp;B'), mapping);
    assert.equal(exact.statusCode, 200, exact.body);
    assert.equal(exact.json().stats.totalReplacements, 2);
    const downloaded = await req('GET', exact.json().downloadPath);
    assert.equal(downloaded.statusCode, 200, downloaded.body);
    assert.equal(downloaded.rawPayload.toString(), '甲 乙');
  }

  const before = (await admin.query('SELECT count(*)::int AS n FROM derived_restorations WHERE project_id=$1', [project])).rows[0].n;
  const unknown = await restore('unknown.md', Buffer.from('【姓名999】'));
  assert.equal(unknown.statusCode, 200, unknown.body);
  assert.equal(unknown.json().stats.totalReplacements, 0);
  assert.deepEqual(unknown.json().stats.unknownTokens, ['【姓名999】']);
  assert.deepEqual((await req('GET', unknown.json().downloadPath)).rawPayload, Buffer.from('【姓名999】'));
  const afterCount = (await admin.query('SELECT count(*)::int AS n FROM derived_restorations WHERE project_id=$1', [project])).rows[0].n;
  assert.equal(afterCount, before + 1);
  for (const name of ['partial.md', 'partial.txt']) {
    const partial=await restore(name,Buffer.from('\uFEFF【姓名001】 【姓名999】\r\n'));
    assert.equal(partial.statusCode,200,partial.body);
    assert.equal(partial.json().stats.totalReplacements,1);
    assert.deepEqual(partial.json().stats.unknownTokens,['【姓名999】']);
    assert.deepEqual((await req('GET',partial.json().downloadPath)).rawPayload,Buffer.from('\uFEFF合成甲 【姓名999】\r\n'));
  }
  const partialWord=await officeFixture('docx',{'word/document.xml':`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>【姓名001】 【姓名999】</w:t></w:r></w:p></w:body></w:document>`});
  const partial=await restore('partial.docx',partialWord);
  assert.equal(partial.statusCode,200,partial.body);
  assert.equal(partial.json().stats.totalReplacements,1);
  assert.deepEqual(partial.json().stats.unknownTokens,['【姓名999】']);
  const archive=await readZip((await req('GET',partial.json().downloadPath)).rawPayload);
  assert.ok(archive.get('word/document.xml')!.toString().includes('合成甲 【姓名999】'));

});
