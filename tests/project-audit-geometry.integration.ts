import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import { openPdf } from '../packages/core/pdf-reader.ts';
import type { InjectOptions } from 'fastify';
import { buildApp } from '../apps/api/main.ts';
import { registerEntityGeometryRoutes } from '../apps/api/entity-geometry.ts';
import { tick } from '../apps/worker/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { hash, passwordHash, readOriginal, seal } from '../packages/adapters/storage.ts';
import { geometryEnvelope, geometryMarkIdentity, transformEntityGeometry, type EntityGeometryDescriptor } from '../packages/contracts/entity-geometry.ts';
import { pdfFixture } from './pdf-fixtures.ts';

const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const app = await buildApp();
if (!app.hasRoute({ method: 'POST', url: '/api/documents/:id/pages/:page/entity-geometries' })) registerEntityGeometryRoutes(app);
after(async () => { await app.close(); await pool.end(); await admin.end(); });

test('replacing one PDF entity prunes only its authenticated geometry and requires a new export confirmation', { timeout: 180000 }, async () => {
  const tenant = randomUUID(), user = randomUUID(), username = 'audit-geometry-' + user;
  const password = 'synthetic-password', origin = process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [user, tenant, username, passwordHash(password)]);
  const login = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { username, password } });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const req = (method: string, url: string, payload?: InjectOptions['payload'], binary = false) => app.inject({ method: method as InjectOptions['method'], url, payload, headers: { origin, cookie, ...(binary ? { 'content-type': 'application/octet-stream' } : {}) } });
  const project = (await req('POST', '/api/projects', { name: '跨文件双几何审计' })).json().id as string;
  const pdf = pdfFixture({ pages: 2 });
  const batch = randomUUID(), request = randomUUID();
  assert.equal((await req('POST', `/api/projects/${project}/upload-batches`, { id: batch, files: [{ requestId: request, path: 'two-entities.pdf', size: pdf.length }] })).statusCode, 200);
  const uploaded = await req('POST', `/api/projects/${project}/files?batchId=${batch}&requestId=${request}`, pdf, true);
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  await tick();
  const documentId = uploaded.json().id as string, docUrl = `/api/documents/${documentId}`;
  const original = (await admin.query('SELECT * FROM documents WHERE id=$1', [documentId])).rows[0];
  const initial = (await req('GET', docUrl)).json();
  assert.equal(initial.state, 'review', JSON.stringify(initial.job));
  const descriptors: EntityGeometryDescriptor[] = [];
  for (const page of [0, 1]) {
    const response = await req('POST', `${docUrl}/pages/${page}/entity-geometries`, { revision: 0 });
    assert.equal(response.statusCode, 200, response.body);
    const found = (response.json().entities as EntityGeometryDescriptor[]).find(e => e.text.replace(/\s/gu, '') === '13800138000');
    assert.ok(found, response.body);
    descriptors.push(found);
  }
  assert.notEqual(descriptors[0].reviewEntityId, descriptors[1].reviewEntityId);
  const editedBoxes = descriptors.map(descriptor => {
    const base = geometryEnvelope(descriptor.bboxes), page = original.page_data[descriptor.page];
    const x = Math.max(0, base.x - 6), y = Math.max(0, base.y - 6);
    return transformEntityGeometry(descriptor.bboxes, { x, y, width: Math.min(page.width, base.x + base.width + 6) - x, height: Math.min(page.height, base.y + base.height + 6) - y });
  });
  const regions = descriptors.map((descriptor, index) => {
    const mark = initial.marks[descriptor.markIndex], boxes = editedBoxes[index];
    return { id: randomUUID(), page: descriptor.page, ...geometryEnvelope(boxes), shape: 'rect', reason: '敏感区域', entityType: descriptor.entityType, text: descriptor.text,
      meta: { entityGeometryBinding: { reviewEntityId: descriptor.reviewEntityId, markIndex: descriptor.markIndex, start: mark.start, end: mark.end, identity: geometryMarkIdentity(mark) }, entityGeometryOverride: { version: 1, token: descriptor.token, bboxes: boxes } } };
  });
  const reviewedMarks = initial.marks.map((mark: any, index: number) => ({ ...mark, decision: descriptors.some(d => d.markIndex === index) ? 'redact' : 'ignore' }));
  const reviewed = await req('PUT', `${docUrl}/review`, { revision: 0, marks: reviewedMarks, pageReview: { mode: 'raster', regions, deletedPages: [] } });
  assert.equal(reviewed.statusCode, 200, reviewed.body);
  const before = (await req('GET', docUrl)).json();
  assert.equal(before.revision, 1);
  assert.deepEqual(new Set(before.pageReview.regions.map((r: any) => r.meta.entityGeometryBinding.reviewEntityId)), new Set(descriptors.map(d => d.reviewEntityId)));
  const retainedRegionId = before.pageReview.regions.find((r: any) => r.meta.entityGeometryBinding.reviewEntityId === descriptors[1].reviewEntityId).id;

  // A separate ready project document supplies the known value with another
  // type; both PDF phone entities are consequently visible as "other".
  const seedId = randomUUID(), seed = '13800138000';
  await admin.query("INSERT INTO documents(id,tenant_id,project_id,request_id,content,content_hash,state,marks) VALUES($1,$2,$3,$4,$5,$6,'review',$7)", [seedId, tenant, project, randomUUID(), seal(seed, `${tenant}:${project}:${seedId}`), hash(seed), JSON.stringify([{ start: 0, end: seed.length, kind: '机构', decision: 'redact' }])]);
  const documents = [{ id: documentId, revision: 1 }, { id: seedId, revision: 0 }];
  const base = `/api/projects/${project}/known-entities`;
  const preview = await req('POST', base + '/preview', { documents });
  assert.equal(preview.statusCode, 200, preview.body);
  const hits = preview.json().documents.find((d: any) => d.id === documentId).occurrences.filter((o: any) => o.value === seed && o.kind === '机构' && o.category === 'other');
  const first = hits.find((o: any) => o.page === 0);
  assert.ok(first, JSON.stringify(hits));
  assert.ok(hits.some((o: any) => o.page === 1), JSON.stringify(hits));
  const replacement = await req('POST', base + '/action', { documents, action: 'replace-other-one', target: { documentId, value: first.value, kind: first.kind, start: first.start, end: first.end, hitId: first.hitId } });
  assert.equal(replacement.statusCode, 200, replacement.body);
  assert.equal(replacement.json().added.decision, 'pending');
  assert.equal(replacement.json().removed.kind, initial.marks[descriptors[0].markIndex].kind);
  const reopened = (await req('GET', docUrl)).json();
  assert.equal(reopened.revision, 2);
  assert.equal(reopened.marks.some((m: any) => m.kind === '机构' && m.decision === 'pending' && m.start === first.start && m.end === first.end), true);
  assert.equal(reopened.pageReview.regions.length, 1);
  assert.equal(reopened.pageReview.regions[0].id, retainedRegionId);
  assert.equal(reopened.pageReview.regions[0].meta.entityGeometryBinding.reviewEntityId, descriptors[1].reviewEntityId);
  assert.deepEqual(reopened.pageReview.regions[0].meta.entityGeometryOverride.bboxes, editedBoxes[1]);
  assert.equal(reopened.marks.some((m: any) => m.reviewEntityId === descriptors[1].reviewEntityId && m.decision === 'redact'), true);
  assert.equal(reopened.pageReview.regions.some((r: any) => r.meta.entityGeometryBinding.reviewEntityId === descriptors[0].reviewEntityId), false);
  const saved = (await admin.query('SELECT * FROM documents WHERE id=$1', [documentId])).rows[0];
  assert.equal(saved.source_hash, original.source_hash);
  assert.equal(saved.content_hash, original.content_hash);
  assert.deepEqual(await readOriginal(saved.source_id), pdf);
  const feedback = (await req('GET', `/api/feedback?documentId=${documentId}`)).json().items;
  assert.equal(feedback.filter((f: any) => f.type === 'false_positive' && f.feedback_producer === 'single-delete').length, 1);
  assert.equal(feedback.filter((f: any) => f.type === 'false_negative' && f.feedback_producer === 'audit-add').length, 1);
  const premature = await req('POST', `${docUrl}/export`, { revision: 2 });
  assert.equal(premature.statusCode, 400, premature.body);
  assert.match(premature.body, /INVALID_MARKS/u);
  const confirmedMarks = reopened.marks.map((mark: any) => mark.kind === '机构' && mark.start === first.start && mark.end === first.end ? { ...mark, decision: 'redact' } : mark);
  const confirmation = await req('PUT', `${docUrl}/review`, { revision: 2, marks: confirmedMarks, pageReview: reopened.pageReview });
  assert.equal(confirmation.statusCode, 200, confirmation.body);
  const confirmed = (await req('GET', docUrl)).json();
  assert.equal(confirmed.revision, 3);
  assert.equal(confirmed.pageReview.regions[0].meta.entityGeometryBinding.reviewEntityId, descriptors[1].reviewEntityId);
  const exportRequest = await req('POST', `${docUrl}/export`, { revision: 3 });
  assert.equal(exportRequest.statusCode, 200, exportRequest.body);
  await tick();
  const exported = (await req('GET', docUrl)).json();
  assert.equal(exported.job.status, 'succeeded', JSON.stringify(exported.job));
  const link = await req('POST', `${docUrl}/download-link`, { revision: 3 });
  assert.equal(link.statusCode, 200, link.body);
  const bytes = await app.inject({ url: link.json().url });
  assert.equal(bytes.statusCode, 200, bytes.body.slice(0, 150));
  assert.match(bytes.headers['content-type'] ?? '', /pdf/u);
  // Verify the preserved second-page adjustment affects the downloaded pixels,
  // including a corner outside the original glyph box that was white before.
  const outputPdf = await openPdf(bytes.rawPayload);
  try {
    assert.equal(outputPdf.count, 2);
    const page = await outputPdf.page(1), pixels = await sharp(page.png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const bound = geometryEnvelope(editedBoxes[1]), meta = original.page_data[1];
    const x = Math.floor((bound.x + 1) * pixels.info.width / meta.width), y = Math.floor((bound.y + 1) * pixels.info.height / meta.height);
    const automatic = geometryEnvelope(descriptors[1].bboxes);
    assert.ok(x < Math.floor((automatic.x - 2) * pixels.info.width / meta.width), 'sample must be outside the default glyph padding');
    assert.ok(y < Math.floor((automatic.y - 2) * pixels.info.height / meta.height), 'sample must be outside the default glyph padding');
    const offset = (y * pixels.info.width + x) * 3;
    assert.deepEqual([...pixels.data.subarray(offset, offset + 3)], [0, 0, 0]);
    const before = await sharp(await readOriginal(meta.previewId)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const bx = Math.floor((bound.x + 1) * before.info.width / meta.width), by = Math.floor((bound.y + 1) * before.info.height / meta.height), bo = (by * before.info.width + bx) * 3;
    assert.deepEqual([...before.data.subarray(bo, bo + 3)], [255, 255, 255]);
  } finally { outputPdf.close(); }

  assert.deepEqual(await readOriginal(saved.source_id), pdf);
});
