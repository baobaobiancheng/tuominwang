import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { tick } from '../apps/worker/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { passwordHash, unseal } from '../packages/adapters/storage.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app = await buildApp(), admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const origin = process.env.APP_ORIGIN!;
after(async () => { await app.close(); await pool.end(); await admin.end(); });

test('unified preview rebuilds ready children and projects the active local draft without saving review marks', async () => {
  const uid = randomUUID(), tenant = randomUUID(), username = `preview-${uid}`, password = 'synthetic-preview-only';
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [uid,tenant,username,passwordHash(password)]);
  const login = await app.inject({ method:'POST',url:'/api/login',headers:{origin},payload:{username,password} });
  assert.equal(login.statusCode,200,login.body);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const req = (method:any,url:string,payload?:any) => app.inject({ method,url,headers:{origin,cookie},payload });
  const projectResponse = await req('POST','/api/projects',{name:'预览草稿合成项目'});
  assert.equal(projectResponse.statusCode,200,projectResponse.body);
  const project = projectResponse.json().id as string;
  const add = async (text:string) => {
    const created = await req('POST',`/api/projects/${project}/documents`,{requestId:randomUUID(),text});
    assert.equal(created.statusCode,200,created.body); await tick();
    const viewed = await req('GET',`/api/documents/${created.json().id}`);
    assert.equal(viewed.statusCode,200,viewed.body);
    assert.equal(viewed.json().state,'review');
    return viewed.json();
  };
  const first = await add('电话：13800138000'), second = await add('电话：13900139000');
  const state = async () => { const r=await req('GET',`/api/projects/${project}/unified-aliases`);assert.equal(r.statusCode,200,r.body);return r.json(); };
  let frame = await state();
  const enabled = await req('POST',`/api/projects/${project}/unified-aliases`,{revision:frame.revision,documents:frame.documents,command:{action:'enable'}});
  assert.equal(enabled.statusCode,200,enabled.body);
  frame = await state();
  const row = frame.rows.find((item:any)=>item.baseType==='phone'&&item.normalized.includes('13800138000'));
  assert.ok(row);
  const changedToken = '【电话合成预览】';
  const changed = await req('POST',`/api/projects/${project}/unified-aliases`,{
    revision:frame.revision,documents:frame.documents,command:{action:'token',key:row.key,token:changedToken,scope:'all'},
  });
  assert.equal(changed.statusCode,200,changed.body);
  frame = await state();
  const active = (await req('GET',`/api/documents/${first.id}`)).json();
  const sibling = (await req('GET',`/api/documents/${second.id}`)).json();
  const before = (await admin.query('SELECT id,revision,marks,content_hash,source_hash FROM documents WHERE project_id=$1 ORDER BY id',[project])).rows;
  const localMarks = active.marks.map((mark:any)=>({ ...mark, decision:'redact',
    replacement:mark.replacement?.mode==='alias'?{...mark.replacement,token:'【旧本地值】'}:mark.replacement }));
  const prepared = await req('POST',`/api/projects/${project}/unified-aliases/prepare-preview`,{
    revision:frame.revision,documents:frame.documents,active:{id:active.id,revision:active.revision,contentHash:active.contentHash,
      localReviewDirty:true,marks:localMarks},
  });
  assert.equal(prepared.statusCode,200,prepared.body);
  const body = prepared.json();
  assert.ok(body.previewMarks.some((mark:any)=>mark.replacement?.mode==='custom'&&mark.replacement.value===changedToken),
    JSON.stringify({ marks:body.previewMarks, changedToken }));
  const rendered = await req('POST',`/api/documents/${active.id}/preview`,{revision:active.revision,marks:body.previewMarks,offset:0});
  assert.equal(rendered.statusCode,200,rendered.body);
  assert.ok(rendered.json().text.includes(changedToken));
  assert.ok(!rendered.json().text.includes('【旧本地值】'));
  const after = (await admin.query('SELECT id,revision,marks,content_hash,source_hash FROM documents WHERE project_id=$1 ORDER BY id',[project])).rows;
  assert.deepEqual(after,before);
  const [projectRow] = (await admin.query('SELECT tenant_id,portable_state FROM projects WHERE id=$1',[project])).rows;
  const portable = JSON.parse(unseal(projectRow.portable_state,`${projectRow.tenant_id}:${project}:portable-state`));
  assert.equal(portable.activePseudonymDrafts[active.id].hasVisitedPreview,true);
  assert.equal(portable.activePseudonymDrafts[sibling.id].hasVisitedPreview,true);
});
