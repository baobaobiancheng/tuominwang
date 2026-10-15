import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { buildApp } from "../apps/api/main.ts";
import { tick } from "../apps/worker/main.ts";
import { pool } from "../packages/adapters/db.ts";
import { passwordHash, readOriginal, writeOriginal, readArtifact, writeArtifact, hash, seal, unseal } from "../packages/adapters/storage.ts";
import {officeImageFixture} from './office-fixtures.ts';
import {parseOffice} from '../packages/core/office.ts';

const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL }), app = await buildApp();
after(async () => { await app.close(); await pool.end(); await admin.end(); });
test('actual OCR correction inherits the current profile and creates only pending immutable aliases',async()=>{
  const tenant=randomUUID(),user=randomUUID(),username='ocr-policy-'+randomUUID(),password='synthetic-ocr-policy';await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
  const origin=process.env.APP_ORIGIN!,login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}}),cookie=String(login.headers['set-cookie']).split(';')[0],req=(method:any,url:string,payload?:any)=>app.inject({method,url,headers:{origin,cookie},payload});
  for(const format of ['docx','png']){
    const project=(await req('POST','/api/projects',{name:'OCR自动方案-'+format})).json().id,preset=(await req('POST','/api/presets/profiles',{name:'OCR继承-'+format})).json();
    const settings={...preset.settings,enabledEntityTypeIds:preset.settings.enabledEntityTypeIds.filter((kind:string)=>kind!=='email'),docx:{...preset.settings.docx,defaultMode:'full_star'},image:{...preset.settings.image,defaultMode:'default_pseudonym'}};
    assert.equal((await req('PUT',`/api/presets/profiles/${preset.settings.id}`,{revision:1,settings})).statusCode,200);
    assert.equal((await req('PUT',`/api/projects/${project}/presets`,{revision:0,profileId:preset.settings.id,profileRevision:2,rulesetId:null})).statusCode,200);
    const doc=randomUUID(),source=randomUUID(),preview=randomUUID(),mapId=randomUUID(),ocr='1380013800O',image=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="white"/><text x="10" y="40" font-size="24">${ocr}</text></svg>`)).png().toBuffer(),bytes=format==='docx'?await officeImageFixture(image):image;
    const part='word/media/customer-13800138000.jpg',parsed=format==='docx'?await parseOffice(bytes,'docx',{[part]:ocr}):{text:ocr,anchors:[{kind:'page',page:0,start:0,end:ocr.length}] as import('../packages/contracts/index.ts').Anchor[],coverage:[{id:'page:0',status:'complete'}]},offset=format==='docx'?parsed.anchors.find(a=>a.object==='image-text')!.start:0,text=parsed.text,aad=`${tenant}:${project}:${doc}`;
    await writeOriginal(source,bytes,doc);await writeOriginal(preview,image,doc);const map=JSON.stringify(Array.from(ocr,(_,i)=>[i,i+1,10+i*17,15,17,28]));await writeArtifact(mapId,map,doc);
    const page={index:0,width:240,height:80,rotation:0,confidence:95,previewId:preview,previewHash:hash(image),mapId,mapHash:hash(map),...(format==='docx'?{part}:{})},anchors=parsed.anchors,coverage=parsed.coverage,emailStart=text.indexOf('demo@example.com'),marks=format==='docx'?[{start:emailStart,end:emailStart+16,kind:'邮箱',decision:'redact',replacement:{mode:'custom',text:'已隐藏邮箱'},replacementOrigin:'manual',sources:[{layer:'manual',code:'human-mark'}]}]:[];
    await admin.query(`INSERT INTO documents(id,tenant_id,project_id,request_id,content,content_hash,source_id,source_name,source_format,source_hash,source_bytes,state,marks,anchors,coverage,page_data,page_review) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'review',$12,$13,$14,$15,$16)`,[doc,tenant,project,randomUUID(),seal(text,aad),hash(text),source,seal(`ocr.${format}`,aad+':name'),format,hash(bytes),bytes.length,JSON.stringify(marks),JSON.stringify(anchors),JSON.stringify(coverage),JSON.stringify([page]),JSON.stringify({mode:'raster',regions:[],deletedPages:[]})]);
    const visualDiagnostic={complete:false,pages:[{page:0,detectors:['seal'],warnings:['COLOR_SEGMENTATION_FAILED']}]};await admin.query('UPDATE documents SET recognition=$2 WHERE id=$1',[doc,JSON.stringify({visual:visualDiagnostic})]);
    const changed=await req('PUT',`/api/documents/${doc}/pages/0/ocr-text`,{revision:0,start:10,end:11,expectedText:'O',text:'0'});assert.equal(changed.statusCode,200,changed.body);
    const stored=(await admin.query('SELECT * FROM documents WHERE id=$1',[doc])).rows[0],phone=stored.marks.find((m:any)=>m.kind==='手机号'&&m.start===offset&&m.end===offset+11);assert.ok(phone);assert.equal(phone.decision,'pending');assert.equal(phone.replacement?.mode,format==='docx'?'full':'alias');assert.equal(stored.recognition.presetRevision,1);assert.equal(stored.recognition.visual.complete,true);assert.ok(stored.recognition.visual.pages.some((p:any)=>p.page===0&&p.detectors.includes('seal')&&p.warnings.length===0));
    if(format==='png'){const mapping=(await admin.query('SELECT * FROM entity_mappings WHERE id=$1',[phone.replacement.mappingId])).rows[0];assert.equal(JSON.parse(unseal(mapping.payload,`${tenant}:${project}:${mapping.id}:mapping:1`)).value,'13800138000');}
    if(format==='docx'){const retained=stored.marks.find((m:any)=>m.kind==='邮箱'&&m.start===emailStart);assert.equal(retained.decision,'pending');assert.deepEqual(retained.replacement,{mode:'custom',text:'已隐藏邮箱'});assert.equal(retained.replacementOrigin,'manual');}
    assert.equal((await admin.query('SELECT COUNT(*)::int n FROM review_snapshots WHERE document_id=$1 AND revision=1',[doc])).rows[0].n,0);
    const blocked=await req('POST',`/api/documents/${doc}/export`,{revision:1});assert.ok([400,409].includes(blocked.statusCode));assert.equal(blocked.json().error,'INVALID_MARKS');assert.ok((await readOriginal(source)).equals(bytes));
  }
});
test("OCR correction persists immutable maps, invalidates review/export, retains original, and survives recognition", async () => {
  assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith("/tmw_test_"));
  const user = randomUUID(), tenant = randomUUID(), username = "ocr-" + randomUUID(), password = "synthetic-ocr-test-password";
  await admin.query("INSERT INTO users VALUES($1,$2,$3,$4)", [user, tenant, username, passwordHash(password)]);
  const origin = process.env.APP_ORIGIN!, login = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { username, password } });
  assert.equal(login.statusCode, 200); const cookie = String(login.headers["set-cookie"]).split(";")[0];
  const request = (method: any, url: string, payload?: any) => app.inject({ method, url, headers: { origin, cookie }, payload });
  const project = (await request("POST", "/api/projects", { name: "OCR合成测试" })).json().id;
  const doc = randomUUID(), source = randomUUID(), preview = randomUUID(), mapId = randomUUID(), text = "1380013800O";
  const bytes = await sharp({ create: { width: 140, height: 60, channels: 3, background: "red" } }).png().toBuffer();
  await writeOriginal(source, bytes, doc); await writeOriginal(preview, bytes, doc);
  const glyphs = Array.from(text, (_, i) => [i, i + 1, 10 + i * 10, 10, 8, 20]), map = JSON.stringify(glyphs);
  await writeArtifact(mapId, map, doc);
  const page = { index: 0, width: 140, height: 60, rotation: 0, confidence: 85, previewId: preview, previewHash: hash(bytes), mapId, mapHash: hash(map) };
  const marks = [{ start: 0, end: 3, kind: "自定义", decision: "ignore" }], aad = `${tenant}:${project}:${doc}`;
  await admin.query(`INSERT INTO documents(id,tenant_id,project_id,request_id,content,content_hash,source_id,source_name,source_format,source_hash,source_bytes,state,marks,anchors,coverage,page_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'png',$9,$10,'review',$11,$12,$13,$14)`, [doc, tenant, project, randomUUID(), seal(text, aad), hash(text), source, seal("synthetic.png", aad + ":name"), hash(bytes), bytes.length, JSON.stringify(marks), JSON.stringify([{ kind: "page", page: 0, start: 0, end: text.length }]), JSON.stringify([{ id: "page:0", status: "complete" }]), JSON.stringify([page])]);
  const url = `/api/documents/${doc}`, ocr = url + "/pages/0/ocr-text", pageReview = { mode: "raster", regions: [], deletedPages: [] };
  assert.equal((await request("GET", ocr + "?revision=0")).json().text, text);
  assert.equal((await request("PUT", url + "/review", { revision: 0, marks, pageReview })).statusCode, 200);
  const exportBefore = await request("POST", url + "/export", { revision: 1 }); assert.equal(exportBefore.statusCode, 200, exportBefore.body);
  const change = { revision: 1, start: 10, end: 11, expectedText: "O", text: "0" };
  const saved = await request("PUT", ocr, change); assert.equal(saved.statusCode, 200, saved.body); assert.equal(saved.json().revision, 2);
  assert.equal((await request("PUT", ocr, change)).json().error, "VERSION_CONFLICT");
  assert.equal((await request("PUT", ocr, { ...change, revision: 2 })).json().error, "OCR_TEXT_CONFLICT");
  const stored = (await admin.query("SELECT * FROM documents WHERE id=$1", [doc])).rows[0];
  assert.equal(unseal(stored.content, aad), "13800138000"); assert.equal(stored.content_hash, hash("13800138000"));
  assert.equal(stored.page_data[0].ocrRevision, 1); assert.notEqual(stored.page_data[0].mapId, mapId); assert.equal(await readArtifact(mapId), map);
  assert.ok((await readOriginal(source)).equals(bytes)); assert.equal(stored.source_hash, hash(bytes));
  assert.equal((await admin.query("SELECT status FROM jobs WHERE document_id=$1 ORDER BY created_at DESC", [doc])).rows[0].status, "cancelled");
  assert.equal((await admin.query("SELECT count(*)::int AS n FROM review_snapshots WHERE document_id=$1 AND revision=2", [doc])).rows[0].n, 0);
  assert.ok(stored.marks.some((m: any) => m.kind === "手机号" && m.start === 0 && m.end === 11 && m.decision === "pending"));
  assert.ok(stored.marks.every((m: any) => m.decision === "pending"));
  assert.equal((await request("GET", ocr + "?revision=1")).statusCode, 409);
  assert.equal((await request("GET", ocr + "?revision=2")).json().text, "13800138000");
  const blocked = await request("POST", url + "/export", { revision: 2 });
  assert.equal(blocked.statusCode, 400, blocked.body); assert.equal(blocked.json().error, "INVALID_MARKS"); // gate checks pending decisions before snapshot binding
  const noop = await request("PUT", ocr, { ...change, revision: 2, expectedText: "0" }); assert.equal(noop.json().revision, 2); assert.equal(noop.json().changed, false);
  const review = await request("PUT", url + "/review", { revision: 2, marks: stored.marks.map((m: any) => ({ ...m, decision: m.kind === "手机号" ? "redact" : "ignore" })), pageReview });
  assert.equal(review.statusCode, 200, review.body);
  const exported = await request("POST", url + "/export", { revision: 3 }); assert.equal(exported.statusCode, 200, exported.body); await tick();
  const ready = (await request("GET", url)).json(); assert.equal(ready.job.status, "succeeded", JSON.stringify(ready.job));
  const link = await request("POST", url + "/download-link", { revision: 3 }); assert.equal(link.statusCode, 200, link.body);
  const download = await app.inject({ url: link.json().url }); assert.equal(download.statusCode, 200);
  const pixels = await sharp(download.rawPayload).removeAlpha().raw().toBuffer();
  assert.deepEqual([...pixels.subarray((20 * 140 + 114) * 3, (20 * 140 + 114) * 3 + 3)], [0, 0, 0]); // corrected final character retains original pixels
  const rerun = await request("POST", url + "/recognize", { revision: 3 }); assert.equal(rerun.statusCode, 200, rerun.body); await tick();
  const reread = (await request("GET", ocr + "?revision=4")).json(); assert.equal(reread.text, "13800138000"); assert.equal(reread.correctionRevision, 1);
  assert.equal((await app.inject({ url: link.json().url })).statusCode, 200); // prior immutable artifact contract
  const eraseAll = await request("PUT", ocr, { revision: 4, start: 0, end: 11, expectedText: "13800138000", text: "" });
  assert.equal(eraseAll.statusCode, 400, eraseAll.body); assert.equal(eraseAll.json().error, "OCR_POSITION_REQUIRED");
  assert.equal((await request("GET", ocr + "?revision=4")).json().text, "13800138000");
  const deletion = await request("PUT", ocr, { revision: 4, start: 10, end: 11, expectedText: "0", text: "" });
  assert.equal(deletion.statusCode, 200, deletion.body); assert.equal(deletion.json().revision, 5);
  assert.equal((await request("GET", ocr + "?revision=5")).json().text, "1380013800");
  const deleteReview = await request("PUT", url + "/review", { revision: 5, marks: [{ start: 0, end: 10, kind: "自定义", decision: "redact" }], pageReview });
  assert.equal(deleteReview.statusCode, 200, deleteReview.body);
  assert.equal((await request("POST", url + "/export", { revision: 6 })).statusCode, 200); await tick();
  const deletedLink = await request("POST", url + "/download-link", { revision: 6 }); assert.equal(deletedLink.statusCode, 200, deletedLink.body);
  const deletedDownload = await app.inject({ url: deletedLink.json().url }); assert.equal(deletedDownload.statusCode, 200);
  const deletedPixels = await sharp(deletedDownload.rawPayload).removeAlpha().raw().toBuffer();
  assert.deepEqual([...deletedPixels.subarray((20 * 140 + 114) * 3, (20 * 140 + 114) * 3 + 3)], [0, 0, 0]); // removed OCR character's original pixels are still cleared
  assert.ok((await readOriginal(source)).equals(bytes));
  // Foreign tenant cannot read or mutate the page even with a known document UUID.
  const foreignUser = randomUUID(), foreignTenant = randomUUID(), foreignName = "ocr-other-" + randomUUID();
  await admin.query("INSERT INTO users VALUES($1,$2,$3,$4)", [foreignUser, foreignTenant, foreignName, passwordHash(password)]);
  const other = await app.inject({ method: "POST", url: "/api/login", headers: { origin }, payload: { username: foreignName, password } });
  const foreignCookie = String(other.headers["set-cookie"]).split(";")[0];
  for (const method of ["GET", "PUT"] as const) assert.equal((await app.inject({ method, url: method === "GET" ? ocr + "?revision=4" : ocr, headers: { origin, cookie: foreignCookie }, ...(method === "PUT" ? { payload: { ...change, revision: 4 } } : {}) })).statusCode, 404);
});
