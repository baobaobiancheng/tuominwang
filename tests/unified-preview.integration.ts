import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { tick } from '../apps/worker/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { passwordHash, unseal } from '../packages/adapters/storage.ts';
import { readPortableWorkspace } from '../packages/core/workspace-portable.ts';

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
  const configure = async (text:string) => {
    const created = await add(text);
    const changed = await req('POST',`/api/documents/${created.id}/configuration`,{
      revision:created.revision,configuration:{exportMode:'custom_pseudonym'},
    });
    assert.equal(changed.statusCode,200,changed.body);
    const recognized = await req('POST',`/api/documents/${created.id}/recognize`,{
      revision:changed.json().revision,ner:false,
    });
    assert.equal(recognized.statusCode,200,recognized.body);
    await tick();
    const viewed = await req('GET',`/api/documents/${created.id}`);
    assert.equal(viewed.statusCode,200,viewed.body);
    assert.equal(viewed.json().state,'review');
    return viewed.json();
  };
  const first = await configure('电话：13800138000；再次联系13800138000'), second = await configure('电话：13900139000');
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
  const localMarks = active.marks.map((mark:any)=>({ ...mark, decision:'redact', replacementOrigin:'value',
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
  const exported = await req('POST',`/api/projects/${project}/portable/export`,{format:'secure-v2',password:'synthetic-preview-export'});
  assert.equal(exported.statusCode,200,exported.body.slice(0,200));
  const opened = await readPortableWorkspace(exported.rawPayload,{password:'synthetic-preview-export'});
  for (const document of opened.snapshot.documents) {
    const draft = portable.activePseudonymDrafts[document.id];
    assert.equal(document.review.hasVisitedPreview,true);
    assert.equal(document.review.pseudonymStyle,draft.style);
    assert.deepEqual(document.review.pseudonymTypeActions,draft.typeActions);
  }
  const storedBeforeNoop = projectRow.portable_state;
  const noop = await req('POST',`/api/projects/${project}/unified-aliases/prepare-preview`,{
    revision:body.revision,documents:body.documents,active:{id:active.id,revision:active.revision,
      contentHash:active.contentHash,localReviewDirty:true,marks:localMarks},
  });
  assert.equal(noop.statusCode,200,noop.body);
  assert.equal(noop.json().revision,body.revision);
  assert.equal((await admin.query('SELECT portable_state FROM projects WHERE id=$1',[project])).rows[0].portable_state,storedBeforeNoop);
  const missingReady = await req('POST',`/api/projects/${project}/unified-aliases/prepare-preview`,{
    revision:body.revision,documents:body.documents.filter((item:any)=>item.id!==sibling.id),
    active:{id:active.id,revision:active.revision,contentHash:active.contentHash,localReviewDirty:true,marks:localMarks},
  });
  assert.equal(missingReady.statusCode,409,missingReady.body);
  const explicit = await req('POST',`/api/projects/${project}/unified-aliases/prepare-preview`,{
    revision:body.revision,documents:body.documents,active:{id:active.id,revision:active.revision,
      contentHash:active.contentHash,localReviewDirty:true,marks:active.marks},
  });
  assert.equal(explicit.statusCode,200,explicit.body);
  assert.deepEqual(explicit.json().previewMarks.map((mark:any)=>({start:mark.start,end:mark.end,kind:mark.kind,
    decision:mark.decision,replacement:mark.replacement,replacementOrigin:mark.replacementOrigin})),
    active.marks.map((mark:any)=>({start:mark.start,end:mark.end,kind:mark.kind,
      decision:mark.decision,replacement:mark.replacement,replacementOrigin:mark.replacementOrigin})));
  assert.equal(localMarks.length,2,'fixture must contain two occurrences of one original key');
  const mixedMarks = localMarks.map((mark:any,index:number)=>index===1?{
    ...mark,replacementOrigin:'manual',replacement:{mode:'custom',value:'【手工保留】'},
  }:mark);
  const mixed = await req('POST',`/api/projects/${project}/unified-aliases/prepare-preview`,{
    revision:body.revision,documents:body.documents,active:{id:active.id,revision:active.revision,
      contentHash:active.contentHash,localReviewDirty:true,marks:mixedMarks},
  });
  assert.equal(mixed.statusCode,200,mixed.body);
  assert.equal(mixed.json().previewMarks[0].replacement.value,changedToken);
  assert.deepEqual(mixed.json().previewMarks[1].replacement,{mode:'custom',value:'【手工保留】'});
  assert.equal(mixed.json().previewMarks[1].replacementOrigin,'manual');
  const mixedPreview = await req('POST',`/api/documents/${active.id}/preview`,{
    revision:active.revision,marks:mixed.json().previewMarks,offset:0,
  });
  assert.equal(mixedPreview.statusCode,200,mixedPreview.body);
  assert.equal(mixedPreview.json().text,`电话：${changedToken}；再次联系【手工保留】`);
  const ignored = await req('POST',`/api/projects/${project}/unified-aliases/prepare-preview`,{
    revision:body.revision,documents:body.documents,active:{id:active.id,revision:active.revision,
      contentHash:active.contentHash,localReviewDirty:true,
      marks:localMarks.map((mark:any)=>({...mark,decision:'ignore'}))},
  });
  assert.equal(ignored.statusCode,200,ignored.body);
  assert.ok(ignored.json().previewMarks.every((mark:any)=>mark.decision==='ignore'));
  const ignoredPreview = await req('POST',`/api/documents/${active.id}/preview`,{
    revision:active.revision,marks:ignored.json().previewMarks,offset:0,
  });
  assert.equal(ignoredPreview.statusCode,200,ignoredPreview.body);
  assert.equal(ignoredPreview.json().text,'电话：13800138000；再次联系13800138000');
  assert.deepEqual((await admin.query('SELECT id,revision,marks,content_hash,source_hash FROM documents WHERE project_id=$1 ORDER BY id',[project])).rows,before);

  const saved = await req('PUT',`/api/documents/${active.id}/review`,{
    revision:active.revision,marks:mixed.json().previewMarks,
  });
  assert.equal(saved.statusCode,200,saved.body);
  const queued = await req('POST',`/api/documents/${active.id}/export`,{revision:saved.json().revision});
  assert.equal(queued.statusCode,200,queued.body);
  await tick();
  const issued = await req('GET',`/api/documents/${active.id}`);
  assert.equal(issued.statusCode,200,issued.body);
  assert.equal(issued.json().job.status,'succeeded',issued.body);
  const link = await req('POST',`/api/documents/${active.id}/download-link`,{revision:issued.json().revision});
  assert.equal(link.statusCode,200,link.body);
  const bytes = await app.inject({url:link.json().url});
  assert.equal(bytes.statusCode,200,bytes.body);
  assert.equal(bytes.rawPayload.toString('utf8'),`电话：${changedToken}；再次联系【手工保留】`);
});
