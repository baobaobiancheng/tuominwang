import {createWriteStream} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import type {FastifyRequest} from 'fastify';
import {TMM_CONTAINER_MAX_BYTES} from '../../packages/adapters/workspace-original-stream.ts';
import {FILE_MAX_BYTES} from '../../packages/contracts/index.ts';

const fail=(code:string,statusCode=400):never=>{throw Object.assign(Error(code),{statusCode});};
// The original V1 migrator permits 32 GiB expanded plus bounded ZIP headers.
// The secure reader separately enforces its original container budget.
const V1_RAW_ZIP_MAX=34359738368+100000*(3*65535+2*1024+256)+65535;
export const TMM_UPLOAD_MAX=Math.max(V1_RAW_ZIP_MAX,TMM_CONTAINER_MAX_BYTES);

export async function stageTmmFile(req:FastifyRequest,allowed:string[],cancel?:AbortSignal){
  const directory=await mkdtemp(join(tmpdir(),'tmw-file-action-'));
  const filePath=join(directory,'input.tmm'),outputPath=join(directory,'output.tmm');
  const abort=new AbortController(),onAbort=()=>abort.abort();
  req.raw.once('aborted',onAbort);
  cancel?.addEventListener('abort',onAbort,{once:true});
  if(cancel?.aborted)abort.abort();
  let fileName='',fileSeen=false;
  const fields=new Map<string,string>();
  const dispose=async()=>{req.raw.off('aborted',onAbort);cancel?.removeEventListener('abort',onAbort);await rm(directory,{recursive:true,force:true});};
  try{
    for await(const part of req.parts({limits:{fileSize:TMM_UPLOAD_MAX,
      files:2,fields:allowed.length+1,parts:allowed.length+2,fieldSize:FILE_MAX_BYTES*2}})){
      if(part.type==='file'){
        if(fileSeen||part.fieldname!=='file')fail('PORTABLE_FILE_INVALID');
        fileSeen=true;fileName=part.filename;
        await pipeline(part.file,createWriteStream(filePath,{flags:'wx',mode:0o600}),{signal:abort.signal});
        if(part.file.truncated)fail('PORTABLE_FILE_TOO_LARGE',413);
      }else{
        if(!allowed.includes(part.fieldname)||fields.has(part.fieldname)||typeof part.value!=='string'||part.valueTruncated)
          throw Object.assign(Error('PORTABLE_INPUT_INVALID'),{statusCode:400});
        fields.set(part.fieldname,part.value);
      }
    }
    if(abort.signal.aborted||!fileSeen)fail('PORTABLE_FILE_INVALID');
    return{directory,filePath,outputPath,fileName,fields,signal:abort.signal,dispose};
  }catch(error){await dispose();throw error;}
}
