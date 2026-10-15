import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { hash, passwordHash } from '../packages/adapters/storage.ts';
import { normalizeLegacyBytes } from '../packages/adapters/document-normalization.ts';
import { configuredLegacyConverter } from '../packages/adapters/legacy-office.ts';
import { isLegacyCompound } from '../packages/core/legacy-office.ts';
import { readZip, writeZip } from '../packages/core/office-zip.ts';
import { parseOffice } from '../packages/core/office.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app = await buildApp();
const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
after(async () => { await app.close(); await pool.end(); await admin.end(); });

test('batch restore defaults actual CFB DOC to original DOC and preserves source',
  { skip: !process.env.LEGACY_OFFICE_URL, timeout: 180000 }, async () => {
    const tenant = randomUUID(), user = randomUUID();
    const username = `batch-doc-${user}`, password = 'synthetic-batch-doc-password';
    await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',
      [user, tenant, username, passwordHash(password)]);
    const origin = process.env.APP_ORIGIN!;
    const login = await app.inject({ method: 'POST', url: '/api/login',
      headers: { origin }, payload: { username, password } });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const request = (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
      app.inject({ method, url, headers: { origin, cookie }, payload });
    const created = await request('POST', '/api/projects', { name: '真实 DOC 默认批量还原' });
    assert.equal(created.statusCode, 200, created.body);
    const project = created.json().id as string;

    // Start from an actual public CFB fixture, place a token in its DOCX
    // representation, then export through the configured real DOC converter.
    const original = await readFile('tests/fixtures/legacy-office/simple.doc');
    assert.ok(isLegacyCompound(original));
    const normalized = await normalizeLegacyBytes(original, 'source.doc', '.doc');
    const parts = await readZip(normalized.buffer);
    const xml = parts.get('word/document.xml')!.toString();
    assert.ok(xml.includes('13800138000'));
    parts.set('word/document.xml', Buffer.from(xml.replace('13800138000', 'CLIENT A 【姓名999】')));
    const generated = await configuredLegacyConverter().exportDocxToLegacy(await writeZip(parts), '.doc');
    const source = Buffer.from(generated.buffer), sourceHash = hash(source);
    assert.ok(isLegacyCompound(source));
    const before = await normalizeLegacyBytes(source, 'before.doc', '.doc');
    assert.ok((await parseOffice(before.buffer, 'docx')).text.includes('CLIENT A'));

    const base = `/api/projects/${project}/restoration`;
    const response = await request('POST', `${base}/batch/file`, {
      fileName: 'actual-restore.doc',
      bytesBase64: source.toString('base64'),
      mappingBytesBase64: Buffer.from(JSON.stringify({ mappings: { 'CLIENT A': '合成甲' } })).toString('base64'),
      // Intentionally omit outputFormat: the public default is original.
    });
    assert.equal(response.statusCode, 200, response.body);
    const result = response.json();
    assert.equal(result.success, true, response.body);
    assert.equal(result.format, 'doc');
    assert.ok(result.stats.totalReplacements >= 1);
    assert.deepEqual(result.stats.unknownTokens, ['【姓名999】']);

    const downloaded = await request('GET', result.downloadPath);
    assert.equal(downloaded.statusCode, 200, downloaded.body.slice(0, 200));
    assert.match(String(downloaded.headers['content-type']), /application\/msword/);
    assert.equal(hash(downloaded.rawPayload), result.hash);
    assert.ok(isLegacyCompound(downloaded.rawPayload));
    const reread = await normalizeLegacyBytes(downloaded.rawPayload, 'restored.doc', '.doc');
    const text = (await parseOffice(reread.buffer, 'docx')).text;
    assert.ok(text.includes('合成甲'));
    assert.ok(text.includes('【姓名999】'));
    assert.ok(!text.includes('CLIENT A'));

    const zipResponse = await request('POST', `${base}/batch/download`,
      { artifacts: [{ id: result.id, hash: result.hash }] });
    assert.equal(zipResponse.statusCode, 200, zipResponse.body.slice(0, 200));
    assert.match(String(zipResponse.headers['content-type']), /application\/zip/);
    const entries = await readZip(zipResponse.rawPayload);
    assert.equal(entries.size, 1);
    const [name, zipped] = [...entries][0];
    assert.match(name, /\.doc$/u);
    assert.ok(isLegacyCompound(zipped));
    assert.equal(hash(zipped), result.hash);
    const zippedText = (await parseOffice((await normalizeLegacyBytes(zipped, name, '.doc')).buffer, 'docx')).text;
    assert.ok(zippedText.includes('合成甲'));
    assert.ok(zippedText.includes('【姓名999】'));
    assert.ok(!zippedText.includes('CLIENT A'));

    assert.equal(hash(source), sourceHash);
    assert.ok((await parseOffice((await normalizeLegacyBytes(source, 'source.doc', '.doc')).buffer, 'docx')).text.includes('CLIENT A'));
  });
