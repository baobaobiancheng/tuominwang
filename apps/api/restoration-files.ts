import {getProjectMappingRows} from '../../packages/adapters/alias-groups.ts';
import{runProcessing}from'../../packages/adapters/processing.ts';
import{storeRestorationLegacySources}from'../../packages/adapters/legacy-restoration.ts';
import {safeBatchName} from "../../packages/core/restoration-batch.ts";
import {entityLabel} from "../../packages/core/entity-identity.ts";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { id, FILE_MAX_BYTES } from "../../packages/contracts/index.ts";
import { readRestorationMapping, parseRestorationMapping, restoreDocx, restoreMarkdown } from "../../packages/core/restoration-files.ts";
import { hash, readOriginal, seal, unseal, writeOriginal } from "../../packages/adapters/storage.ts";
import { rows, sql } from "../../packages/adapters/db.ts";
import { projectScope, denied as fail } from "./access.ts";
async function checked<T>(action: () => Promise<T> | T): Promise<T> { try { return await action(); } catch (e) { const error = e as Error & { statusCode?: number }; if (!error.statusCode && /^(?:LEGACY_OFFICE_|DOCUMENT_|PORTABLE_|NATIVE_PORTABLE_|RESTORE_|FILE_SIZE_LIMIT|ZIP_LIMIT|XML_LIMIT|UNSAFE_XML|INVALID_OFFICE|UNSUPPORTED_FORMAT)/.test(error.message)) Object.assign(error, { statusCode: 400 }); throw error; } }
const bytesBase64 = z.string().min(1).max(Math.ceil(FILE_MAX_BYTES * 4 / 3) + 100000);
export function decode(value: string) { const bytes = Buffer.from(value, "base64"); if (bytes.length > FILE_MAX_BYTES + 65552 + 28 * Math.ceil(FILE_MAX_BYTES / 4194304) || bytes.toString("base64") !== value) fail("RESTORE_FILE_INVALID", 400); return bytes; }
export const mappingInput = z.object({ mappingBytesBase64: bytesBase64.optional(), mappingPassword: z.string().min(4).max(1024).optional(), choices: z.record(z.string().refine(v=>v.isWellFormed()&&!v.includes("\0")), z.string().refine(v=>v.isWellFormed()&&!v.includes("\0"))).optional(), strategy: z.enum(["token-canonical", "occurrence"]).default("token-canonical") });
export async function projectPlan(db: any, tenant: string, project: string, input: z.infer<typeof mappingInput>) {
  if (input.mappingBytesBase64) return (await checked(() => readRestorationMapping(decode(input.mappingBytesBase64!), { password: input.mappingPassword }, { choices: input.choices, strategy: input.strategy }))).plan;
  const records=(await getProjectMappingRows(db,project)).map(m=>({...m,original:JSON.parse(unseal(m.payload,`${tenant}:${project}:${m.id}:mapping:${m.version}`))}));
  const data={_meta:{version:'tuominwang-1'},details:records.map(m=>({pseudonym:m.token,normalized:m.original.value,entityType:m.original.kind==='邮箱'?'email':m.original.kind==='网址'?'website_url':entityLabel(m.original),forms:(m.original.forms??[]).map((original:string)=>({original}))}))};
  // An arbitrary uploaded file does not identify which grouped occurrence it
  // contains. Require its exported occurrence plan or an explicit user choice.
  const plan=await checked(()=>parseRestorationMapping(data,{choices:input.choices,strategy:'token-canonical'}));
  if(input.strategy==='occurrence'&&plan.ambiguities.length)fail('RESTORE_OCCURRENCE_PLAN_REQUIRED',409);
  return{...plan,strategy:input.strategy};
}
export function registerRestorationFileRoutes(app: FastifyInstance) {
  app.post("/api/projects/:id/restoration/inspect", { bodyLimit: FILE_MAX_BYTES * 2 }, async req => {
    const project = id.parse((req.params as any).id), input = mappingInput.strict().parse(req.body);
    return projectScope(req, { project }, ["restore"], async db => { const plan = await projectPlan(db, req.user.tenant_id, project, input); return { mappingCount: Object.keys(plan.mappings).length, ambiguities: plan.ambiguities, sourceVersion: plan.sourceVersion }; });
  });
  app.post("/api/projects/:id/restoration/files", { bodyLimit: FILE_MAX_BYTES * 3 }, async req => {
    const project = id.parse((req.params as any).id), input = mappingInput.extend({ fileName: z.string().min(1).refine(v=>v.isWellFormed()).refine(s => !/[\x00-\x1f/\\]/.test(s)), bytesBase64,filePassword:z.string().min(1).max(4096).refine(v=>v.isWellFormed()&&!v.includes('\0')).optional(),outputFormat:z.enum(['original','docx']).optional() }).strict().parse(req.body);
    const format = /\.doc$/iu.test(input.fileName)?"doc":/\.wps$/iu.test(input.fileName)?"wps":input.fileName.toLowerCase().endsWith(".docx") ? "docx" : /\.(?:md|markdown)$/i.test(input.fileName) ? "md" : input.fileName.toLowerCase().endsWith(".txt") ? "txt" : null; if (!format) fail("RESTORE_FORMAT_UNSUPPORTED", 400);await checked(()=>safeBatchName(input.fileName,new Set()));
    return projectScope(req, { project }, ["restore"], async db => {
      const plan = await projectPlan(db, req.user.tenant_id, project, input), bytes = decode(input.bytesBase64), result:any = ['doc','wps'].includes(format)?(await runProcessing<any>({kind:'restoration-batch-file',file:{id:randomUUID(),name:input.fileName,bytes,format,password:input.filePassword,outputFormat:input.outputFormat},plan})).results[0]:await checked(() => format === "docx" ? restoreDocx(bytes, plan) : restoreMarkdown(bytes, plan)),target = randomUUID(),outputFormat=result.format??format;if(result.success===false)fail(result.error??'RESTORE_FAILED',400);
      result.output=Buffer.from(result.output);await writeOriginal(target, result.output, project);const legacySources=await storeRestorationLegacySources(req.user.tenant_id,project,target,result.legacySources);
      await rows(db, sql`INSERT INTO derived_restorations(id,tenant_id,project_id,owner_id,hash,format,source_name,legacy_sources) VALUES(${target},${req.user.tenant_id},${project},${req.user.id},${hash(result.output)},${outputFormat},${seal(input.fileName.replace(/\.(doc|wps)$/iu,"."+outputFormat), `${req.user.tenant_id}:${project}:${target}:restoration-name`)},${legacySources})`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'file_restored',${target})`);
      return { id: target, format:outputFormat, stats: result.stats, downloadPath: `/api/projects/${project}/restoration/files/${target}` };
    });
  });
  app.get("/api/projects/:id/restoration/files/:artifact", async (req, reply) => {
    const { id: project, artifact } = z.object({ id, artifact: id }).parse(req.params);
    return projectScope(req, { project }, ["restore"], async db => {
      const [stored] = await rows(db, sql`SELECT * FROM derived_restorations WHERE id=${artifact} AND project_id=${project} AND owner_id=${req.user.id}`); if (!stored) fail("NOT_FOUND", 404);
      const bytes = await readOriginal(stored.id); if (hash(bytes) !== stored.hash) fail("RESTORE_ARTIFACT_MISMATCH", 409);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'restored_file_downloaded',${artifact})`);
      return reply.type(stored.format === "doc" ? "application/msword" : stored.format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/plain; charset=utf-8").header("Content-Disposition", `attachment; filename="restored.${stored.format}"`).header("Cache-Control", "no-store").send(bytes);
    });
  });
}
