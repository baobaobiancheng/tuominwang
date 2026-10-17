import { extname } from 'node:path';
import { rows, sql, type DB } from '../../packages/adapters/db.ts';
import { hash, unseal } from '../../packages/adapters/storage.ts';
import { readUploadBatchManifest, validateFolderBatchPaths } from '../../packages/core/upload-batch-manifest.ts';
import type { OriginalFolderBatch } from '../../packages/core/native-portable.ts';

type Document = { id:string; request_id:string; source_name:string|null; source_hash:string; source_bytes:number|string|null; import_document_type:string|null };

function originalFolderBatch(value:unknown):value is OriginalFolderBatch {
  if(!value||typeof value!=='object')return false;
  const item=value as Record<string,unknown>;
  return item.schemaVersion===1&&typeof item.sourceRootName==='string'&&
    typeof item.scannedAt==='string'&&Array.isArray(item.skippedItems);
}

/** Preserve the original folderBatch only when a sealed scan names this entire workspace unambiguously. */
export async function workspaceFolderBatch(db:DB,tenant:string,project:string,importedPortable:unknown):Promise<OriginalFolderBatch|undefined>{
  const documents=await rows(db,sql`SELECT id,request_id,source_name,source_hash,source_bytes,import_document_type FROM documents WHERE project_id=${project}`) as Document[];
  const requests=new Map(documents.map(d=>[d.request_id,d]));
  const matches:OriginalFolderBatch[]=[];
  let cursor='00000000-0000-0000-0000-000000000000';
  for(;;){
    const batches=await rows(db,sql`SELECT id,manifest,manifest_hash FROM upload_batches WHERE project_id=${project} AND id>${cursor}::uuid ORDER BY id LIMIT 100`);
    for(const batch of batches){
      const json=unseal(batch.manifest,`${tenant}:${project}:${batch.id}:manifest`);
      if(hash(json)!==batch.manifest_hash)throw Error('SOURCE_MISMATCH');
      const {manifest,legacy}=readUploadBatchManifest(json);
      if(legacy||!manifest.scannedAt||manifest.files.length!==documents.length)continue;
      validateFolderBatchPaths(manifest);
      if(!manifest.files.every(file=>{
        const document=requests.get(file.requestId);
        return !!document&&!!file.sha256&&document.source_hash===file.sha256&&
          Number(document.source_bytes)===file.size&&(document.import_document_type??'auto')===(file.documentType??'auto')&&
          !!document.source_name&&unseal(document.source_name,`${tenant}:${project}:${document.id}:name`)===file.path;
      }))continue;
      const relative=(path:string)=>path.slice(manifest.sourceRootName.length+1);
      const skippedItems=[
        ...manifest.skippedEntries.map(item=>({relativePath:relative(item.sourceRelativePath),extension:extname(item.sourceRelativePath).toLowerCase(),reasonCode:item.reasonCode,reasonText:item.reason})),
        ...manifest.emptyDirectories.map(path=>({relativePath:relative(path),extension:extname(path).toLowerCase(),reasonCode:'empty_directory',reasonText:'空文件夹未处理，也未在导出结果中创建'})),
      ];
      skippedItems.sort((a,b)=>a.relativePath.localeCompare(b.relativePath,'zh-CN'));
      matches.push({schemaVersion:1,sourceRootName:manifest.sourceRootName,scannedAt:manifest.scannedAt,skippedItems});
      if(matches.length>1)return undefined;
    }
    if(batches.length<100)break;
    cursor=batches.at(-1)!.id;
  }
  if(matches.length===1)return matches[0];
  const imported=(importedPortable as {importedSnapshot?:{folderBatch?:unknown}}|null)?.importedSnapshot?.folderBatch;
  return originalFolderBatch(imported)?imported:undefined;
}
