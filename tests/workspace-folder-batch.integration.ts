import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../apps/api/main.ts';
import { pool } from '../packages/adapters/db.ts';
import { hash, passwordHash } from '../packages/adapters/storage.ts';
import { readNativeOrReferencePortable } from '../packages/core/native-portable.ts';
import { readPortableWorkspace, writePortableWorkspace } from '../packages/core/workspace-portable.ts';

assert.ok(new URL(process.env.DATABASE_URL!).pathname.startsWith('/tmw_test_'));
const app = await buildApp();
const admin = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });
const origin = process.env.APP_ORIGIN!;
const password = 'synthetic-folder-workspace';
after(async () => { await app.close(); await pool.end(); await admin.end(); });

async function client() {
  const user = randomUUID(), tenant = randomUUID(), username = `folder-workspace-${user}`;
  await admin.query('INSERT INTO users VALUES($1,$2,$3,$4)', [user,tenant,username,passwordHash(password)]);
  const login = await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{username,password}});
  assert.equal(login.statusCode,200,login.body);
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const req = (method:'GET'|'POST',url:string,payload?:unknown) => app.inject({method,url,headers:{origin,cookie,...Buffer.isBuffer(payload)?{'content-type':'application/octet-stream'}:{}},payload:payload as any});
  return {req};
}
async function save(req: Awaited<ReturnType<typeof client>>['req'], project:string, format:'native'|'secure-v2'|'secure-v3') {
  const requestId = randomUUID();
  const started=await req('POST',`/api/projects/${project}/portable/save`,{requestId,password,format});
  assert.equal(started.statusCode,200,started.body);
  for(let i=0;i<250;i++) {
    const status=await req('POST',`/api/projects/${project}/portable/save-result`,{requestId});
    assert.equal(status.statusCode,200,status.body);
    if(status.json().state==='failed') assert.fail(JSON.stringify(status.json()));
    if(status.json().state==='completed') {
      const downloaded=await req('GET',status.json().downloadPath);
      assert.equal(downloaded.statusCode,200,downloaded.body.slice(0,100));
      return downloaded.rawPayload;
    }
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw Error('WORKSPACE_SAVE_TIMEOUT');
}

test('the exact scanned directory batch survives V2/V3 save, open and re-export; unrelated or undated batches cannot supply provenance',async()=>{
  const {req}=await client();
  const projectResponse=await req('POST','/api/projects',{name:'合成目录工作区'});
  assert.equal(projectResponse.statusCode,200,projectResponse.body);
  const project=projectResponse.json().id as string;
  const scanTime='2026-10-17T07:01:02.003Z',batchId=randomUUID(),requestId=randomUUID();
  const source=Buffer.from('目录中的合成电话 13800138000');
  const manifest={id:batchId,scannedAt:scanTime,sourceRootName:'目录甲',files:[{requestId,path:'目录甲/子目录/合同.txt',size:source.length,sha256:hash(source)}],skippedEntries:[{sourceRelativePath:'目录甲/不支持.exe',extension:'.exe',reasonCode:'unsupported_format',reason:'格式暂不支持'}],emptyDirectories:['目录甲/空目录']};
  const registered=await req('POST',`/api/projects/${project}/upload-batches`,manifest);
  assert.equal(registered.statusCode,200,registered.body);
  const registeredView=await req('GET',`/api/projects/${project}/upload-batches/${batchId}`);
  assert.equal(registeredView.statusCode,200,registeredView.body);
  assert.equal(registeredView.json().scannedAt,scanTime);
  const uploaded=await req('POST',`/api/projects/${project}/files?batchId=${batchId}&requestId=${requestId}`,source);
  assert.equal(uploaded.statusCode,200,uploaded.body);
  const unrelated={id:randomUUID(),scannedAt:'2026-10-17T08:01:02.003Z',sourceRootName:'目录乙',files:[{requestId:randomUUID(),path:'目录乙/别的.txt',size:1,sha256:hash(Buffer.from('x'))}],skippedEntries:[],emptyDirectories:[]};
  assert.equal((await req('POST',`/api/projects/${project}/upload-batches`,unrelated)).statusCode,200);
  const expected={schemaVersion:1,sourceRootName:'目录甲',scannedAt:scanTime,skippedItems:[
    {relativePath:'不支持.exe',extension:'.exe',reasonCode:'unsupported_format',reasonText:'格式暂不支持'},
    {relativePath:'空目录',extension:'',reasonCode:'empty_directory',reasonText:'空文件夹未处理，也未在导出结果中创建'},
  ]};
  const v2=await readPortableWorkspace(await save(req,project,'secure-v2'),{password});
  assert.deepEqual(v2.snapshot.folderBatch,expected);
  const direct=await req('POST',`/api/projects/${project}/portable/export`,{password,format:'secure-v2'});
  assert.equal(direct.statusCode,200,direct.body.slice(0,100));
  assert.deepEqual((await readPortableWorkspace(direct.rawPayload,{password})).snapshot.folderBatch,expected);
  const v3=await readPortableWorkspace(await save(req,project,'secure-v3'),{password});
  assert.deepEqual(v3.snapshot.folderBatch,expected);
  const nativeBytes=await save(req,project,'native');
  const native=await readNativeOrReferencePortable(nativeBytes,{password});
  assert.equal(native.kind,'native');
  assert.deepEqual(native.snapshot.folderBatch,expected);
  const nativeImported=await req('POST','/api/portable/import',{name:'重开原生目录项目',password,bytesBase64:nativeBytes.toString('base64')});
  assert.equal(nativeImported.statusCode,200,nativeImported.body);
  const nativeReexport=await readNativeOrReferencePortable(await save(req,nativeImported.json().id,'native'),{password});
  assert.equal(nativeReexport.kind,'native');
  assert.deepEqual(nativeReexport.snapshot.folderBatch,expected);
  const imported=await req('POST','/api/portable/import',{name:'重开目录项目',password,bytesBase64:(await save(req,project,'secure-v2')).toString('base64')});
  assert.equal(imported.statusCode,200,imported.body);
  const reopened=await readPortableWorkspace(await save(req,imported.json().id,'secure-v2'),{password});
  assert.deepEqual(reopened.snapshot.folderBatch,expected);
  const {tuominwangNative:_ownExtension,...originalSnapshot}=v2.snapshot;
  const originalEmpty={schemaVersion:1,sourceRootName:'',scannedAt:'',skippedItems:[{}]};
  const originalArchive=await writePortableWorkspace({...originalSnapshot,folderBatch:originalEmpty},v2.sources,{format:'secure-v2',password});
  const originalImported=await req('POST','/api/portable/import',{name:'原版允许空字符串目录字段',password,bytesBase64:originalArchive.toString('base64')});
  assert.equal(originalImported.statusCode,200,originalImported.body);
  const originalReexport=await readPortableWorkspace(await save(req,originalImported.json().id,'secure-v2'),{password});
  assert.deepEqual(originalReexport.snapshot.folderBatch,originalEmpty);
  const other=(await req('POST','/api/projects',{name:'旧批次时间未知'})).json().id as string;
  const oldRequest=randomUUID(),oldSource=Buffer.from('旧目录材料');
  assert.equal((await req('POST',`/api/projects/${other}/upload-batches`,{id:randomUUID(),sourceRootName:'旧目录',files:[{requestId:oldRequest,path:'旧目录/材料.txt',size:oldSource.length,sha256:hash(oldSource)}]})).statusCode,200);
  const oldBatches=(await req('GET',`/api/projects/${other}/upload-batches`)).json();
  assert.equal((await req('POST',`/api/projects/${other}/files?batchId=${oldBatches[0].id}&requestId=${oldRequest}`,oldSource)).statusCode,200);
  const old=await readPortableWorkspace(await save(req,other,'secure-v2'),{password});
  assert.equal(old.snapshot.folderBatch,undefined);
});
