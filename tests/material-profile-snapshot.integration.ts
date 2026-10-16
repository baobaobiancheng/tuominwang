import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildApp} from '../apps/api/main.ts';
import {tick} from '../apps/worker/main.ts';
import {pool} from '../packages/adapters/db.ts';
import {defaultProfile} from '../packages/core/presets.ts';
import {hash,passwordHash,readOriginal,seal,unseal} from '../packages/adapters/storage.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(new URL(process.env.MIGRATION_DATABASE_URL!).pathname.startsWith('/tmw_test_'));
assert.ok(process.env.DATA_DIR?.includes('/.data/test-runs/'));
const admin=new pg.Pool({connectionString:process.env.MIGRATION_DATABASE_URL});
const app=await buildApp();
after(async()=>{await app.close();await pool.end();await admin.end();});

test('unrelated material save keeps the previously sealed profile when the same catalogue ID changes', {timeout:120000},async()=>{
  const tenant=randomUUID(),user=randomUUID(),password='synthetic-snapshot-test',username='profile-snapshot-'+user,origin=process.env.APP_ORIGIN!;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)',[user,tenant,username,passwordHash(password)]);
  const login=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
  assert.equal(login.statusCode,200,login.body);
  const cookie=String(login.headers['set-cookie']).split(';')[0];
  const req=(method:'GET'|'POST'|'PUT',url:string,payload?:any,binary=false)=>app.inject({method,url,payload,headers:{origin,cookie,...binary?{'content-type':'application/octet-stream'}:{}}});
  const createdProject=await req('POST','/api/projects',{name:'same profile ID sealed snapshot'});
  assert.equal(createdProject.statusCode,200,createdProject.body);
  const project=createdProject.json().id as string;

  const initial=defaultProfile();
  const createdProfile=await req('POST','/api/presets/profiles',{
    name:'same-id-synthetic-'+randomUUID(),
    profile:{...initial,enabledEntityTypeIds:['phone','name_cn']},
  });
  assert.equal(createdProfile.statusCode,200,createdProfile.body);
  const profileId=createdProfile.json().settings.id as string;
  assert.ok(createdProfile.json().settings.enabledEntityTypeIds.includes('phone'));

  async function uploadAndRecognize(label:string,source:Buffer){
    const batch=randomUUID(),request=randomUUID();
    const accepted=await req('POST',`/api/projects/${project}/upload-batches`,{id:batch,files:[{requestId:request,path:label,size:source.length}]});
    assert.equal(accepted.statusCode,200,accepted.body);
    const uploaded=await req('POST',`/api/projects/${project}/files?batchId=${batch}&requestId=${request}`,source,true);
    assert.equal(uploaded.statusCode,200,uploaded.body);
    const doc=uploaded.json().id as string;
    assert.equal(await tick(),true);
    const view=await req('GET',`/api/documents/${doc}`);
    assert.equal(view.statusCode,200,view.body);
    assert.equal(view.json().job.status,'succeeded',view.body);
    const applied=await req('POST',`/api/documents/${doc}/configuration`,{
      revision:view.json().revision,configuration:{profileId,documentType:'general'},
    });
    assert.equal(applied.statusCode,200,applied.body);
    const recognized=await req('POST',`/api/documents/${doc}/recognize`,{revision:applied.json().revision,ner:false});
    assert.equal(recognized.statusCode,200,recognized.body);
    assert.equal(await tick(),true);
    const withOldProfile=await req('GET',`/api/documents/${doc}`);
    assert.equal(withOldProfile.statusCode,200,withOldProfile.body);
    assert.equal(withOldProfile.json().state,'review');
    assert.ok(withOldProfile.json().marks.some((mark:any)=>mark.kind==='手机号'));
    return doc;
  }
  const sourceA=Buffer.from('合成材料甲：手机号 13800138000');
  const sourceB=Buffer.from('合成材料乙：手机号 13900139000');
  const documentA=await uploadAndRecognize('old-profile-a.txt',sourceA);
  const documentB=await uploadAndRecognize('old-profile-b.txt',sourceB);
  const row=async(id:string)=>(await admin.query('SELECT id,tenant_id,project_id,revision,state,document_policy_revision,document_policy,source_id,source_hash FROM documents WHERE id=$1',[id])).rows[0];
  const policy=(stored:any)=>JSON.parse(unseal(stored.document_policy,`${stored.tenant_id}:${stored.project_id}:${stored.id}:document-policy`));
  const projectRow=async()=>(await admin.query('SELECT id,preset_revision,preset_policy FROM projects WHERE id=$1',[project])).rows[0];

  const oldA=await row(documentA),oldB=await row(documentB);
  assert.ok(policy(oldA).baseProfile,'new material policy must retain its unmodified base');
  assert.deepEqual(policy(oldA).baseProfile,policy(oldB).baseProfile);
  assert.ok(policy(oldA).profile.enabledEntityTypeIds.includes('phone'));
  assert.ok(policy(oldB).profile.enabledEntityTypeIds.includes('phone'));
  const newProfile=await req('PUT',`/api/presets/profiles/${profileId}`,{
    revision:createdProfile.json().revision,
    settings:{...createdProfile.json().settings,enabledEntityTypeIds:['name_cn']},
  });
  assert.equal(newProfile.statusCode,200,newProfile.body);
  assert.equal(newProfile.json().settings.id,profileId);
  assert.ok(!newProfile.json().settings.enabledEntityTypeIds.includes('phone'));
  assert.ok(newProfile.json().settings.enabledEntityTypeIds.includes('name_cn'));
  assert.deepEqual(await row(documentA),oldA);
  assert.deepEqual(await row(documentB),oldB);
  const projectBefore=await projectRow();
  const beforeGet=await req('GET',`/api/documents/${documentA}/configuration`);
  assert.equal(beforeGet.statusCode,200,beforeGet.body);
  assert.ok(beforeGet.json().effective.profile.enabledEntityTypeIds.includes('phone'));
  assert.equal(beforeGet.json().configuration.profileId,profileId);

  // This is an unrelated material change: the profile ID is sent back unchanged
  // and the caller does not request any profile or ruleset refresh.
  const changed=await req('POST',`/api/documents/${documentA}/configuration`,{
    revision:oldA.revision,
    configuration:{...beforeGet.json().configuration,documentType:'judgment'},
  });
  assert.equal(changed.statusCode,200,changed.body);
  const afterSaveA=await row(documentA),afterGet=await req('GET',`/api/documents/${documentA}/configuration`);
  assert.equal(afterGet.statusCode,200,afterGet.body);
  assert.equal(afterSaveA.revision,oldA.revision+1);
  assert.equal(policy(afterSaveA).configuration.documentType,'judgment');
  assert.equal(policy(afterSaveA).configuration.profileId,profileId);
  const recognized=await req('POST',`/api/documents/${documentA}/recognize`,{revision:changed.json().revision,ner:false});
  assert.equal(recognized.statusCode,200,recognized.body);
  assert.equal(await tick(),true);
  const afterView=await req('GET',`/api/documents/${documentA}`);
  assert.equal(afterView.statusCode,200,afterView.body);
  assert.equal(afterView.json().state,'review');
  const afterA=await row(documentA),afterB=await row(documentB);
  assert.deepEqual(afterB,oldB,'the other material and its sealed snapshot must remain unchanged');
  assert.deepEqual(await projectRow(),projectBefore,'the project preset must remain unchanged');
  assert.equal(afterA.source_id,oldA.source_id);
  assert.equal(afterA.source_hash,hash(sourceA));
  assert.deepEqual(await readOriginal(afterA.source_id),sourceA);
  assert.deepEqual(await readOriginal(afterB.source_id),sourceB);
  console.log('SAME_ID_SNAPSHOT_GREEN_PROOF',JSON.stringify({
    profileId,oldEnabled:policy(oldA).profile.enabledEntityTypeIds,
    directoryEnabled:newProfile.json().settings.enabledEntityTypeIds,
    savedEnabled:policy(afterA).profile.enabledEntityTypeIds,
    getEnabled:afterGet.json().effective.profile.enabledEntityTypeIds,
    recognizedPhoneMark:afterView.json().marks.some((mark:any)=>mark.kind==='手机号'),
    otherMaterialUnchanged:true,projectUnchanged:true,originalsUnchanged:true,
  }));
  assert.equal(afterView.json().marks.some((mark:any)=>mark.kind==='手机号'),true,
    'ordinary save must preserve the old phone candidate after a same-ID directory update');
  assert.deepEqual(policy(afterA).baseProfile,policy(oldA).baseProfile);
  assert.deepEqual(policy(afterA).profile.enabledEntityTypeIds,policy(oldA).profile.enabledEntityTypeIds,
    'unrelated material save must retain the already sealed profile snapshot');
  const explicitRefresh=await req('POST',`/api/documents/${documentA}/configuration`,{
    revision:afterView.json().revision,configuration:afterGet.json().configuration,rebindProfile:true,
  });
  assert.equal(explicitRefresh.statusCode,200,explicitRefresh.body);
  const refreshedRow=await row(documentA);
  assert.ok(!policy(refreshedRow).baseProfile.enabledEntityTypeIds.includes('phone'));
  assert.ok(!policy(refreshedRow).profile.enabledEntityTypeIds.includes('phone'));
  const recognizeRefreshed=await req('POST',`/api/documents/${documentA}/recognize`,{revision:explicitRefresh.json().revision,ner:false});
  assert.equal(recognizeRefreshed.statusCode,200,recognizeRefreshed.body);
  assert.equal(await tick(),true);
  const refreshedView=await req('GET',`/api/documents/${documentA}`);
  assert.equal(refreshedView.statusCode,200,refreshedView.body);
  assert.equal(refreshedView.json().state,'review');
  assert.ok(!refreshedView.json().marks.some((mark:any)=>mark.kind==='手机号'));
  assert.deepEqual(await row(documentB),oldB);
  assert.deepEqual(await projectRow(),projectBefore);
  assert.deepEqual(await readOriginal(refreshedRow.source_id),sourceA);

  // A previously saved policy has no base field. Its effective settings remain
  // usable for unrelated edits, while profile-affecting edits require a rebind.
  const withOverride=await req('POST',`/api/documents/${documentA}/configuration`,{
    revision:refreshedView.json().revision,
    configuration:{...afterGet.json().configuration,removeImages:true,exportMode:'full_star'},
  });
  assert.equal(withOverride.statusCode,200,withOverride.body);
  const overrideRow=await row(documentA),overridePolicy=policy(overrideRow);
  assert.equal(overridePolicy.profile.docx.removeImages,true);
  assert.equal(overridePolicy.configuration.exportMode,'full_star');
  const cleared=await req('POST',`/api/documents/${documentA}/configuration`,{
    revision:overrideRow.revision,
    configuration:{...afterGet.json().configuration,exportMode:'selective_pseudonym'},
  });
  assert.equal(cleared.statusCode,200,cleared.body);
  const clearPolicy=policy(await row(documentA));
  assert.equal(clearPolicy.profile.docx.removeImages,false);
  assert.deepEqual(clearPolicy.profile.pseudonymTypeActions,{},'full-star actions must not stick after clearing the override');
  const reOverride=await req('POST',`/api/documents/${documentA}/configuration`,{
    revision:cleared.json().revision,
    configuration:{...afterGet.json().configuration,removeImages:true,exportMode:'full_star'},
  });
  assert.equal(reOverride.statusCode,200,reOverride.body);
  const legacySeed=await row(documentA),legacy=policy(legacySeed);
  delete legacy.baseProfile;
  await admin.query('UPDATE documents SET document_policy=$1 WHERE id=$2',[
    seal(JSON.stringify(legacy),`${legacySeed.tenant_id}:${legacySeed.project_id}:${documentA}:document-policy`),documentA,
  ]);
  const legacyGet=await req('GET',`/api/documents/${documentA}/configuration`);
  assert.equal(legacyGet.statusCode,200,legacyGet.body);
  assert.equal(legacyGet.json().effective.profile.hasAppliedDocumentProfile,true);
  assert.equal(legacyGet.json().effective.profile.baseSnapshotAvailable,false);
  const harmless=await req('POST',`/api/documents/${documentA}/configuration`,{
    revision:legacySeed.revision,configuration:{...legacyGet.json().configuration,documentType:'contract'},
  });
  assert.equal(harmless.statusCode,200,harmless.body);
  const legacyAfter=await row(documentA);
  assert.equal(policy(legacyAfter).baseProfile,undefined);
  assert.equal(policy(legacyAfter).profile.docx.removeImages,true);
  const auditBefore=(await admin.query('SELECT count(*)::int AS n FROM audit WHERE object_id=$1',[documentA])).rows[0].n;
  const jobsBefore=(await admin.query('SELECT count(*)::int AS n FROM jobs WHERE document_id=$1',[documentA])).rows[0].n;
  const removeOverride=await req('POST',`/api/documents/${documentA}/configuration`,{
    revision:legacyAfter.revision,configuration:{...legacyGet.json().configuration,documentType:'contract',exportMode:'selective_pseudonym',removeImages:undefined},
  });
  assert.equal(removeOverride.statusCode,400,removeOverride.body);
  assert.equal(removeOverride.json().error,'PROFILE_BASE_UNAVAILABLE');
  assert.deepEqual(await row(documentA),legacyAfter);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM audit WHERE object_id=$1',[documentA])).rows[0].n,auditBefore);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM jobs WHERE document_id=$1',[documentA])).rows[0].n,jobsBefore);
  const legacyRefresh=await req('POST',`/api/documents/${documentA}/configuration`,{
    revision:legacyAfter.revision,
    configuration:{...legacyGet.json().configuration,documentType:'contract',exportMode:'selective_pseudonym',removeImages:undefined},
    rebindProfile:true,
  });
  assert.equal(legacyRefresh.statusCode,200,legacyRefresh.body);
  const restoredBase=policy(await row(documentA));
  assert.ok(restoredBase.baseProfile);
  assert.equal(restoredBase.profile.docx.removeImages,false);
  assert.equal(restoredBase.profile.docx.defaultMode,'default_star');
  assert.equal(restoredBase.profile.batch.markdownDefaultMode,'selective_pseudonym');
  assert.deepEqual(restoredBase.profile.pseudonymTypeActions,{},'clear full-star actions before selective mode');
  assert.deepEqual(await readOriginal(refreshedRow.source_id),sourceA);
  assert.deepEqual(await row(documentB),oldB);
  assert.deepEqual(await projectRow(),projectBefore);
  // An authenticated historical policy can carry a now-invalid format choice.
  // Reusing its old effective profile must not skip request validation.
  const beforeInvalid=await row(documentA),invalid=policy(beforeInvalid);
  delete invalid.baseProfile;
  invalid.configuration.outputFormats=['pdf']; // invalid for a TXT source
  await admin.query('UPDATE documents SET document_policy=$1 WHERE id=$2',[
    seal(JSON.stringify(invalid),`${beforeInvalid.tenant_id}:${beforeInvalid.project_id}:${documentA}:document-policy`),documentA,
  ]);
  const invalidRow=await row(documentA);
  const invalidEcho=await req('POST',`/api/documents/${documentA}/configuration`,{
    revision:invalidRow.revision,configuration:invalid.configuration,
  });
  assert.equal(invalidEcho.statusCode,400,invalidEcho.body);
  assert.equal(invalidEcho.json().error,'UNSUPPORTED_OUTPUT_FORMAT');
  assert.deepEqual(await row(documentA),invalidRow);

  // A valid older sealed snapshot may have pseudonymRules without exportMode.
  // Echoing it to edit documentType must preserve the omitted mode and the
  // authenticated effective profile instead of silently deriving a new mode.
  const historical=policy(invalidRow);
  delete historical.baseProfile;
  delete historical.configuration.outputFormats;
  delete historical.configuration.exportMode;
  historical.configuration.pseudonymRules={name_cn:'pseudonym'};
  historical.profile.markdown.defaultMode='default_star';
  historical.profile.batch.markdownDefaultMode='default_star';
  historical.profile.pseudonymTypeActions={};
  await admin.query('UPDATE documents SET document_policy=$1 WHERE id=$2',[
    seal(JSON.stringify(historical),`${invalidRow.tenant_id}:${invalidRow.project_id}:${documentA}:document-policy`),documentA,
  ]);
  const historicalRow=await row(documentA);
  const historicalSave=await req('POST',`/api/documents/${documentA}/configuration`,{
    revision:historicalRow.revision,
    configuration:{...historical.configuration,documentType:'official_letter'},
  });
  assert.equal(historicalSave.statusCode,200,historicalSave.body);
  const preserved=policy(await row(documentA));
  assert.equal(preserved.configuration.exportMode,undefined);
  assert.deepEqual(preserved.configuration.pseudonymRules,{name_cn:'pseudonym'});
  assert.equal(preserved.profile.markdown.defaultMode,'default_star');
  assert.equal(preserved.profile.batch.markdownDefaultMode,'default_star');
  assert.deepEqual(preserved.profile.pseudonymTypeActions,{});
  assert.equal(preserved.baseProfile,undefined);
  assert.deepEqual(await readOriginal(refreshedRow.source_id),sourceA);
});
