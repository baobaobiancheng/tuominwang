import {test, expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {LegacyOfficeConverter, type LegacyRpcRequest, type LegacyRpcResult, type LegacyTransport} from '../packages/adapters/legacy-office.ts';
import {legacySha256, legacyContentSummary, isLegacyCompound} from '../packages/core/legacy-office.ts';

// Explicit opt-in: the image is a separate conversion service, not a hidden unit-test prerequisite.
const image=process.env.LEGACY_OFFICE_TEST_IMAGE;
const directory='.data/research/lawbot-2026-10-15/iteration032/legacy-office';
async function rpc(request:LegacyRpcRequest, program?:string) {
  return await new Promise<LegacyRpcResult>((resolve,reject)=>{
    const args=['run','--rm','-i','--network','none','--read-only','--tmpfs','/tmp:mode=1777','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','/usr/bin/python3',image!,...(program?['-c',program]:['/opt/legacy/convert.py'])];
    const child=spawn('docker',args,{shell:false,stdio:['pipe','pipe','pipe']}),out:Buffer[]=[],err:Buffer[]=[];
    child.stdout.on('data',(b:Buffer)=>out.push(b));child.stderr.on('data',(b:Buffer)=>err.push(b));child.on('error',reject);
    child.on('close',code=>{try{const result=JSON.parse(Buffer.concat(out).toString());if(code!==0||result.success!==true)reject(new Error(result.error||'RPC_FAILED'));else resolve(result);}catch(error){reject(new Error('RPC_INVALID: '+String(error)+' '+Buffer.concat(err).toString().slice(-2000)));}});
    child.stdin.end(JSON.stringify(request));
  });
}
const transport:LegacyTransport=request=>{expect(request.password).toBeUndefined();return rpc(request);};
function request(bytes:Buffer,mode:'import'|'export',password?:string):LegacyRpcRequest{return{jobId:randomUUID(),mode,extension:'.doc',sha256:legacySha256(bytes),bytesBase64:bytes.toString('base64'),...password!==undefined?{password}:{}};}

test.skipIf(!image)('isolated actual UNO DOC import/export/readback, known password, wrong password, source integrity and lossy reject',async()=>{
  await mkdir(directory,{recursive:true});const converter=new LegacyOfficeConverter(transport),original=await readFile('tests/fixtures/legacy-office/simple.doc'),sourceHash=legacySha256(original),input=await readFile('tests/fixtures/legacy-office/simple.docx');
  const imported=await converter.importLegacyToDocx(original,'synthetic.doc','.doc',{expectedSourceHash:sourceHash});
  expect(imported.conversionPerformed).toBe(true);expect(imported.engineVersion).not.toBe('unknown');expect(await legacyContentSummary(imported.buffer)).toEqual(await legacyContentSummary(input));
  const exported=await converter.exportDocxToLegacy(imported.buffer,'.doc');expect(isLegacyCompound(exported.buffer)).toBe(true);expect(exported.verification.before).toEqual(exported.verification.after);const again=await converter.importLegacyToDocx(exported.buffer,'readback.doc','.doc');expect(await legacyContentSummary(again.buffer)).toEqual(await legacyContentSummary(imported.buffer));
  const encrypted=await rpc(request(input,'export'),"import sys,json;from convert import convert_bytes;sys.stdout.write(json.dumps(convert_bytes(json.load(sys.stdin),store_password='Synthetic2026')))"),encryptedBytes=Buffer.from(encrypted.bytesBase64,'base64');expect(isLegacyCompound(encryptedBytes)).toBe(true);await writeFile(directory+'/synthetic-encrypted.doc',encryptedBytes);
  await expect(converter.importLegacyToDocx(encryptedBytes,'protected.doc','.doc')).rejects.toThrow('DOCUMENT_ENCRYPTED');
  await expect(converter.importLegacyToDocx(encryptedBytes,'protected.doc','.doc',{password:'wrong'})).rejects.toThrow('DOCUMENT_PASSWORD_INVALID');
  const unlocked=await converter.importLegacyToDocx(encryptedBytes,'protected.doc','.doc',{password:'Synthetic2026'});expect(await legacyContentSummary(unlocked.buffer)).toEqual(await legacyContentSummary(input));
  const changed=request(original,'import');changed.sha256='0'.repeat(64);await expect(rpc(changed)).rejects.toThrow('SOURCE_MISMATCH');
  const complex=await readFile('tests/fixtures/legacy-office/textbox-imported.docx');await expect(converter.exportDocxToLegacy(complex,'.doc')).rejects.toThrow('LEGACY_OFFICE_CONTENT_MISMATCH');
  expect(legacySha256(original)).toBe(sourceHash);
  const evidence={schema:'tuominwang.legacy-office.actual-uno.v1',image,import:{engine:imported.engine,version:imported.engineVersion,originalHash:sourceHash,normalizedHash:imported.normalizedHash,durationMs:imported.durationMs,summary:await legacyContentSummary(imported.buffer)},export:{sourceHash:exported.sourceHash,outputHash:exported.outputHash,roundtripHash:exported.roundtripHash,durationMs:exported.durationMs,verification:exported.verification},encrypted:{sourceHash:encrypted.sha256,engineVersion:encrypted.engineVersion,wrongPassword:'DOCUMENT_PASSWORD_INVALID',correctPasswordSummary:await legacyContentSummary(unlocked.buffer)},rejects:['SOURCE_MISMATCH','LEGACY_OFFICE_CONTENT_MISMATCH'],originalUnchanged:true};
  await writeFile(directory+(image!.endsWith('-candidate')?'/actual-uno-amd64-result.json':'/actual-uno-result.json'),JSON.stringify(evidence,null,2)+'\n');
},240000);

test.skipIf(!image)('actual UNO cancellation kills its own process and deletes its isolated temporary profile',async()=>{
  const bytes=await readFile('tests/fixtures/legacy-office/simple.doc'),program="import sys,json,threading,pathlib;from convert import convert_bytes,ConversionFailure;event=threading.Event();threading.Timer(.25,event.set).start();before=set(pathlib.Path('/tmp').glob('tmw-legacy-*'));error=None\ntry:convert_bytes(json.load(sys.stdin),event)\nexcept ConversionFailure as e:error=e.code\nleft=set(pathlib.Path('/tmp').glob('tmw-legacy-*'))-before;assert error=='PROCESSING_CANCELLED',(error,str(left));assert not left,str(left);print(json.dumps({'success':True,'error':error,'temporaryDirectoriesRemaining':len(left)}))";
  const result=await rpc(request(bytes,'import'),program) as unknown as {success:true;error:string;temporaryDirectoriesRemaining:number};expect(result.error).toBe('PROCESSING_CANCELLED');expect(result.temporaryDirectoriesRemaining).toBe(0);
},30000);
