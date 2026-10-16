import {entityLabel} from '../../packages/core/entity-identity.ts';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {id,type Mark} from '../../packages/contracts/index.ts';
import {rows,sql} from '../../packages/adapters/db.ts';
import {unseal,hash} from '../../packages/adapters/storage.ts';
import {projectScope,denied} from './access.ts';
import {mappingsForMarks} from './mappings.ts';
import {mappingExportData,exportMappingWorkbook} from '../../packages/core/mapping-export.ts';
import {writeProtectedPortable} from '../../packages/core/workspace-portable.ts';
import {writeZip} from '../../packages/core/office-zip.ts';
import {pseudonymTableNames} from '../../packages/adapters/profile-export.ts';
import {readProjectPresets} from '../../packages/adapters/project-presets.ts';
import {defaultProfile} from '../../packages/core/presets.ts';
import {resolveDocumentPolicy} from '../../packages/adapters/document-policy.ts';
import {validateMappingMarks} from '../../packages/core/mappings.ts';
export function registerMappingExports(app:FastifyInstance){
 app.post('/api/projects/:id/mapping-export',async(req,reply)=>{
  const temporaryName=z.string().trim().min(1).max(80).refine(v=>v.isWellFormed()&&v!=='.'&&v!=='..'&&!/[<>:"/\\|?*\x00-\x1f\x7f]/u.test(v));
  const project=id.parse((req.params as any).id),input=z.object({documents:z.array(z.object({id,revision:z.number().int().nonnegative()})).min(1).max(10000),mode:z.enum(['singleDocument','unifiedBatch','independentBatch']),format:z.enum(['lpm','xlsx']),password:z.string().min(4).max(1024).optional(),tableName:temporaryName.optional(),documentTableNames:z.record(id,temporaryName).optional()}).strict().parse(req.body);
  const documentIds=new Set(input.documents.map(d=>d.id));
  if(documentIds.size!==input.documents.length||input.mode==='singleDocument'&&input.documents.length!==1||input.format==='xlsx'&&input.password||input.documentTableNames&& (input.mode!=='independentBatch'||Object.keys(input.documentTableNames).some(key=>!documentIds.has(key))))denied('INVALID_EXPORT_REQUEST',400);
  return projectScope(req,{project},['view_original','view_mapping','export'],async db=>{
   const [projectRow]=await rows(db,sql`SELECT * FROM projects WHERE id=${project} FOR SHARE`);
   const documents=[];
   for(const wanted of input.documents){const [d]=await rows(db,sql`SELECT id,tenant_id,project_id,revision,source_name,source_format,document_policy,document_policy_revision,is_batch FROM documents WHERE id=${wanted.id} AND project_id=${project} FOR SHARE`);if(!d)denied('NOT_FOUND',404);if(d.revision!==wanted.revision)denied('VERSION_CONFLICT',409);documents.push(d);}
   const policy=readProjectPresets(projectRow),resolved=resolveDocumentPolicy(documents[0],policy),profile=resolved.presetPolicy?.profile?.settings??defaultProfile();
   const names=pseudonymTableNames(profile,documents.map(d=>d.source_name?unseal(d.source_name,`${d.tenant_id}:${project}:${d.id}:name`):`材料-${d.id}.txt`),input.mode,`.${input.format}`,input.mode==='independentBatch'?documents.map(d=>input.documentTableNames?.[d.id]??input.tableName):[input.tableName]);
   const groups=input.mode==='unifiedBatch'?[documents]:documents.map(d=>[d]),outputs=new Map<string,Buffer>();
   for(let i=0;i<groups.length;i++){
    const all=new Map(),occurrences=[];
    for(const metadata of groups[i]){const [d]=await rows(db,sql`SELECT id,tenant_id,project_id,content,content_hash,marks FROM documents WHERE id=${metadata.id} AND project_id=${project}`);const marks=(d.marks as Mark[]).filter(m=>m.decision==='redact'&&m.replacement?.mode==='alias'),mappings=await mappingsForMarks(db,d,marks,req.user.id),text=unseal(d.content,`${d.tenant_id}:${project}:${d.id}`);
     if(hash(text)!==d.content_hash)denied('SOURCE_MISMATCH',409);
     validateMappingMarks(text,marks,mappings);
     for(const m of mappings)all.set(m.id,m);
     for(const m of marks){const replacement=m.replacement!;if(replacement.mode!=='alias')continue;occurrences.push({token:replacement.token,original:text.slice(m.start,m.end),entityType:entityLabel(m),documentId:d.id,start:m.start,end:m.end});}
    }
    const mappings=[...all.values()],base=mappingExportData(mappings,occurrences),data={...base,_meta:{...base._meta,tableName:names[i].slice(0,-(`.${input.format}`).length),scope:input.mode==='unifiedBatch'?'project':'single'}};
    const bytes=input.format==='xlsx'?await exportMappingWorkbook(mappings):input.password?await writeProtectedPortable(Buffer.from(JSON.stringify(data)), 'pseudonym-mapping',project,{password:input.password}):Buffer.from(JSON.stringify(data,null,2));
    outputs.set(names[i],bytes);
   }
   await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'mapping_exported',${project})`);
   const zip=outputs.size>1,name=zip?'假名表.zip':[...outputs.keys()][0];reply.header('Cache-Control','no-store').header('Content-Type',zip?'application/zip':input.format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/octet-stream').header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
   return zip?await writeZip(outputs):[...outputs.values()][0];
  }).catch(e=>{if(/^(?:MAPPING_NOT_FOUND|AMBIGUOUS_MAPPING|MAPPING_MISMATCH|INVALID_EXPORT_NAME|PORTABLE_|RESTORE_)/u.test((e as Error).message))denied((e as Error).message,400);throw e;});
 });
}
