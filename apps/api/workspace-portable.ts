import {beginWorkspaceImport,commitWorkspaceImport,cleanupWorkspaceImport,type WorkspaceImportJournal} from '../../packages/adapters/workspace-import.ts';
import{archiveEntityCorrections,sealEntityCorrections}from '../../packages/adapters/entity-corrections.ts';
import{archiveEntityGeometry}from '../../packages/adapters/entity-geometry.ts';
import{restorePortableEntityGeometry}from '../../packages/adapters/portable-entity-geometry.ts';
import{recordReboundReviewProvenance}from'../../packages/adapters/review-provenance-history.ts';
import{readPageRotationState,sealPageRotationState,validateRotationPages}from '../../packages/adapters/page-rotation-state.ts';
import{pageRotationStateSchema}from '../../packages/contracts/page-rotation.ts';
import{readUnifiedAliasState,importUnifiedAliasState}from '../../packages/adapters/unified-aliases.ts';
import {getProjectMappings,importAliasGroupVersions,projectMappingNamespace} from '../../packages/adapters/alias-groups.ts';
import {readReviewProvenance,readReviewProvenanceArchive} from '../../packages/adapters/review-provenance.ts';
import {validatePortableMappingHistory} from '../../packages/core/portable-mappings.ts';
import{readNormalizationMetadata,attestNormalization,verifyNormalizationAttestation,normalizationRecord}from'../../packages/adapters/document-normalization.ts';
import{rememberWorkspaceRecent}from'../../packages/adapters/workspace-recents.ts';
import {registerWorkspaceSaveRoutes,workspaceSaveFingerprint} from './workspace-saves.ts';
import {projectLibraryBackup,restoreProjectLibrary} from '../../packages/adapters/mapping-library.ts';
import {MAX_MAPPING_ENTRIES} from "../../packages/contracts/mapping-limits.ts";
import {entityIdentity} from "../../packages/core/entity-identity.ts";
import {restoreReferencePortableDraft} from "../../packages/adapters/reference-portable-draft.ts";
import {openPageReview,sealPageReview} from "../../packages/adapters/page-review-storage.ts";
import {checkedRuleset,importedEntries} from "../../packages/core/presets.ts";
import {invalidatePresetProject} from "./presets.ts";
import {validAliasToken} from "../../packages/contracts/alias-token.ts";
import {writeCompatibleWorkspace,migrateCompatibleWorkspace,workspaceReviewProfile,reviewProfileMappings,referenceWorkspacePolicy,nativeToReferenceStream} from "../../packages/core/workspace-compat.ts";
import {readPortableWorkspace} from "../../packages/core/workspace-portable.ts";
import { verifiedDocumentSource } from "../../packages/adapters/document-source.ts";
import { attestPortableSource,verifyPortableSource } from "../../packages/adapters/portable-source.ts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { resolveDocumentPolicy } from "../../packages/adapters/document-policy.ts";
import { documentPolicySchema } from "../../packages/contracts/document-policy.ts";
import { readProjectPresets } from "../../packages/adapters/project-presets.ts";
import { restorePortableDraft } from "../../packages/adapters/portable-draft.ts";
import { applyReplacementPolicies } from "../../packages/core/replacement-policies.ts";
import { profileReplacementPolicies, finalizeProfileReplacements } from "../../packages/core/profile-recognition.ts";
import { resolvePolicyMappings } from "./mappings.ts";
import {getRuntimeWhitelists} from "../../packages/adapters/runtime-rule-update.ts";
import { validatePageReview } from "../../packages/core/page-redaction.ts";
import { randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { id, dictionarySchema, FILE_MAX_BYTES, markSchema, sourceFormatSchema, type Mark } from "../../packages/contracts/index.ts";
import {reviewEntityWasUserAdded} from '../../packages/core/review-type-hide.ts';
import {reviewEntityBirth} from '../../packages/core/review-entity-birth.ts';
import { projectPresetSchema } from "../../packages/contracts/presets.ts";
import { readNativeOrReferencePortable, writeNativePortable, type NativePortable } from "../../packages/core/native-portable.ts";
import { workspaceFolderBatch } from './workspace-folder-batch.ts';
import { fileFormat } from "../../packages/core/files.ts";
import { hash, readArtifact, readOriginal, removeOwnedArtifact, seal, unseal, writeArtifact, writeOriginal } from "../../packages/adapters/storage.ts";
import { writeOriginalStream, TMM_V3_SOURCE_MAX_BYTES } from "../../packages/adapters/workspace-original-stream.ts";
import { TMM_CONTAINER_MAX_BYTES } from "../../packages/adapters/workspace-original-stream.ts";
import type { TmmFileRef } from "../../packages/core/workspace-portable-stream.ts";
import { openNativeOrReferenceWorkspaceFile } from "../../packages/core/workspace-file-open.ts";
import { createTmmTransferSlot } from "../../packages/core/workspace-secure-stream.ts";
import { migrateLegacyWorkspaceV1ToV2File } from "../../packages/core/workspace-migrate-v1.ts";
import {convertReferenceWorkspaceFile,openReferenceWorkspaceFile,referenceProfileFromFile} from "../../packages/core/workspace-reference-file-actions.ts";
import {stageTmmFile} from "./workspace-file-upload.ts";
import { rows, scoped, sql,type DB } from "../../packages/adapters/db.ts";
import { projectScope, requirePermission, denied as fail } from "./access.ts";
async function checked<T>(action: () => Promise<T> | T): Promise<T> { try { return await action(); } catch (e) { const error = e as Error & { statusCode?: number }; if (!error.statusCode && /^(?:MAPPING_LIBRARY_|PORTABLE_|TMM_V1_|TMM_V2_CHECKSUM_MISMATCH|NATIVE_PORTABLE_|RESTORE_|FILE_SIZE_LIMIT|ZIP_LIMIT|XML_LIMIT|UNSAFE_XML|INVALID_OFFICE|UNSUPPORTED_FORMAT|INVALID_PAGE_REVIEW|WORKSPACE_ENTRY_LIMIT$|WORKSPACE_ENTRY_TOO_LARGE$|WORKSPACE_TOTAL_SIZE_LIMIT$)/.test(error.message)) Object.assign(error, { statusCode: 400 }); throw error; } }
// A restored native draft has two disjoint origins. Reapply today's profile only
// to fresh recognizer candidates; imported review slots retain their reviewed
// replacement and mapping identity, but every decision still starts pending.
async function applyFreshPortableReplacements(db:DB,d:any,restored:any,policy:any,user:string) {
  const profile=policy.presetPolicy?.profile?.settings;
  if(!profile)return;
  const imported=new Set<number>((restored.restoredMarkIndices as number[]).filter(index=>index>=0));
  const freshIndices:number[]=[];
  const fresh:Mark[]=[];
  for(const [index,mark] of (restored.marks as Mark[]).entries())if(!imported.has(index)){freshIndices.push(index);fresh.push(mark);}
  if(!fresh.length)return;
  const text=unseal(restored.content,`${d.tenant_id}:${d.project_id}:${d.id}`);
  if(hash(text)!==restored.hash)fail('PORTABLE_DRAFT_SOURCE_MISMATCH',409);
  const policies=profileReplacementPolicies(profile,d.source_format,policy.batchMode,policy.documentPolicy?.configuration.exportMode);
  let plan=applyReplacementPolicies(text,fresh,policies);
  if(plan.aliasRequests.length){
    await requirePermission(db,d.project_id,['view_mapping']);
    const semanticDoc={...d,content:restored.content,content_hash:restored.hash,marks:restored.marks,anchors:restored.anchors,page_data:restored.pages,entity_corrections:null,entityCorrections:null};
    const mappings=await resolvePolicyMappings(db,semanticDoc,user,plan.aliasRequests);
    plan=applyReplacementPolicies(text,fresh,policies,mappings);
    if(plan.aliasRequests.length)fail('MAPPING_MISMATCH',400);
  }
  const finalized=finalizeProfileReplacements(plan.marks,restored.anchors,profile,d.source_format,policy.batchMode,policy.documentPolicy?.configuration.exportMode);
  for(const [offset,index] of freshIndices.entries())restored.marks[index]=finalized[offset];
}
const password = z.string().min(4).max(1024).refine(v => !!v.trim());
const file = z.string().min(1).max(Math.ceil(FILE_MAX_BYTES * 4 / 3) + 100000);
async function retainPortableSlots(db:DB,d:any,actorId:string,operation:string){const marks=d.marks.map((m:any)=>({...m,decision:m.hiddenByType===true?'ignore':'pending'}));await recordReboundReviewProvenance(db,d,{...d,marks,revision:d.revision+1},{links:marks.map((_:any,index:number)=>({beforeIndex:index,afterIndex:index})),actorId,operation});}
function decode(value: string) { const b = Buffer.from(value, "base64"); if (b.length > FILE_MAX_BYTES + 65552 + 28 * Math.ceil(FILE_MAX_BYTES / 4194304) || b.toString("base64") !== value) fail("PORTABLE_FILE_INVALID", 400); return b; }
type WorkspaceAsset = Buffer | TmmFileRef;
const assetHash = (asset: WorkspaceAsset) => Buffer.isBuffer(asset) ? hash(asset) : asset.sha256;
const assetBytes = (asset: WorkspaceAsset) => Buffer.isBuffer(asset) ? asset.length : asset.bytes;
async function smallAsset(asset: WorkspaceAsset, expectedHash: string, limit = FILE_MAX_BYTES) {
  if (Buffer.isBuffer(asset)) { if (asset.length > limit || hash(asset) !== expectedHash) fail("PORTABLE_SOURCE_MISMATCH", 400); return asset; }
  if (asset.bytes > limit || asset.sha256 !== expectedHash) fail("PORTABLE_SOURCE_MISMATCH", 400);
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of await asset.openReadStream()) { const chunk = Buffer.from(part); size += chunk.length; if (size > asset.bytes || size > limit) fail("PORTABLE_SOURCE_MISMATCH", 400); chunks.push(chunk); }
  const result = Buffer.concat(chunks, size);
  if (size !== asset.bytes || hash(result) !== expectedHash) fail("PORTABLE_SOURCE_MISMATCH", 400);
  return result;
}
async function writeWorkspaceAsset(id: string, asset: WorkspaceAsset, owner: string, v3Source = false) {
  if (Buffer.isBuffer(asset)) return writeOriginal(id, asset, owner);
  return writeOriginalStream(id, await asset.openReadStream(), owner,
    { expectedBytes: asset.bytes, expectedHash: asset.sha256,
      ...(v3Source ? { purpose: "tmm-v3-source" as const, maxBytes: TMM_V3_SOURCE_MAX_BYTES } : {}) });
}
const nativeDocument = z.object({ id, name: z.string().min(1).max(1000), format: sourceFormatSchema, content: z.string().max(FILE_MAX_BYTES).refine(v => v.isWellFormed() && Buffer.byteLength(v) <= FILE_MAX_BYTES), contentHash: z.string().regex(/^[a-f0-9]{64}$/), sourceEntry: z.string(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), marks: z.array(markSchema).max(32768), revision: z.number().int().nonnegative(), state: z.string(), anchors: z.array(z.unknown()), coverage: z.array(z.unknown()), pages: z.array(z.any()), pageReview: z.unknown().nullable(), recognition: z.unknown(), nerEnabled: z.boolean(), documentPolicy: documentPolicySchema.nullable().optional(), isBatch: z.boolean().optional(), pageRotationState:pageRotationStateSchema.optional(), normalizedSource:z.object({entry:z.string(),originalHash:z.string().regex(/^[a-f0-9]{64}$/),normalizedHash:z.string().regex(/^[a-f0-9]{64}$/),metadata:z.unknown(),witness:z.unknown()}).nullable().optional(),unlockedSource: z.object({entry:z.string(),originalHash:z.string().regex(/^[a-f0-9]{64}$/),derivedHash:z.string().regex(/^[a-f0-9]{64}$/),witness:z.unknown()}).nullable().optional() }).passthrough();
export function registerWorkspacePortableRoutes(app: FastifyInstance) {
  registerWorkspaceSaveRoutes(app);
  app.post("/api/projects/:id/portable/export", async (req, reply) => {
    const project = id.parse((req.params as any).id), input = z.object({ password,format:z.enum(["native","legacy-zip","secure-v2","secure-v3"]).default("native"),expectedSnapshot:z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().parse(req.body);
    return projectScope(req, { project }, ["export", "view_original", "view_mapping"], async db => {
      if(input.expectedSnapshot&&await workspaceSaveFingerprint(db,project)!==input.expectedSnapshot)fail("VERSION_CONFLICT",409);
      const [p] = await rows(db, sql`SELECT * FROM projects WHERE id=${project}`), sources = new Map<string, Buffer>(), documents: any[] = [], snapshots: any[] = [],provenanceHistory:any[]=[];
      let cursor = "00000000-0000-0000-0000-000000000000";
      for (;;) {
        const docs = await rows(db, sql`SELECT * FROM documents WHERE project_id=${project} AND id>${cursor}::uuid ORDER BY id LIMIT 100 FOR SHARE`);
        for (const d of docs) {
          const aad = `${req.user.tenant_id}:${project}:${d.id}`, content = unseal(d.content, aad); if (hash(content) !== d.content_hash) fail("SOURCE_MISMATCH", 409);
          const name = d.source_name ? unseal(d.source_name, aad + ":name") : `${d.id}.${d.source_format}`, source = d.source_id ? await readOriginal(d.source_id) : Buffer.from(content);
          if (d.source_id && hash(source) !== d.source_hash) fail("SOURCE_MISMATCH", 409); const sourceEntry = `sources/${d.id}/original.${d.source_format}`; sources.set(sourceEntry, source);
          let unlockedSource=null;if(d.unlocked_source_id){const derived=await verifiedDocumentSource(d);if(!['docx','xlsx','pdf'].includes(d.source_format))fail('PORTABLE_UNLOCK_FORMAT_INVALID',400);const entry=`sources/${d.id}/unlocked.${d.source_format}`;sources.set(entry,derived);unlockedSource={entry,originalHash:d.source_hash,derivedHash:hash(derived),witness:attestPortableSource(d.source_hash,hash(derived),d.source_format)};}
          let normalizedSource=null;if(d.normalized_source_id){const bytes=await verifiedDocumentSource(d),metadata=readNormalizationMetadata(d),entry=`sources/${d.id}/normalized.docx`;sources.set(entry,bytes);normalizedSource={entry,originalHash:d.source_hash,normalizedHash:hash(bytes),metadata,witness:attestNormalization(metadata)};}
          const pages = [];
          for (const page of d.page_data ?? []) {
            const preview = await readOriginal(page.previewId), map = await readArtifact(page.mapId); if (hash(preview) !== page.previewHash || hash(map) !== page.mapHash) fail("SOURCE_MISMATCH", 409);
            const previewEntry = `sources/${d.id}/pages/${page.index}.png`, mapEntry = `sources/${d.id}/pages/${page.index}.json`; sources.set(previewEntry, preview); sources.set(mapEntry, Buffer.from(map)); const { previewId: _preview, mapId: _map, ...metadata } = page; pages.push({ ...metadata, previewEntry, mapEntry });
          }
          documents.push({ id: d.id, name, format: d.source_format, content, contentHash: d.content_hash, sourceEntry, sourceHash: hash(source), marks: d.marks, revision: d.revision, state: d.state, anchors: d.anchors, coverage: d.coverage, pages, pageReview: openPageReview(d), recognition: d.recognition, nerEnabled: d.ner_enabled, documentPolicy: d.document_policy ? documentPolicySchema.parse(JSON.parse(unseal(d.document_policy, aad + ":document-policy"))) : null, isBatch: !!d.is_batch, reviewProvenance:await readReviewProvenance(db,d), entityCorrectionsArchive:archiveEntityCorrections(d),entityGeometryArchive:archiveEntityGeometry(d,openPageReview(d)), ...d.source_format==='pdf'?{pageRotationState:readPageRotationState(d)}:{}, unlockedSource,normalizedSource });
          const old = await rows(db, sql`SELECT revision,content_hash,parse_version,marks,rule_version,recognition,page_review,page_data,created_at,entity_metadata FROM review_snapshots WHERE document_id=${d.id} ORDER BY revision`);for(const s of old){const {entity_metadata:_private,...fields}=s;snapshots.push({...fields,reviewProvenanceArchive:await readReviewProvenanceArchive(db,d,s),page_review:openPageReview({...d,revision:s.revision,content_hash:s.content_hash},s.page_review),documentId:d.id});}
        }
        if (docs.length < 100) break; cursor = docs.at(-1)!.id;
      }
      for(const d of await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} ORDER BY id`))for(const h of await rows(db,sql`SELECT * FROM review_entity_history WHERE document_id=${d.id} ORDER BY revision,content_hash`))provenanceHistory.push({documentId:d.id,revision:h.revision,contentHash:h.content_hash,archive:await readReviewProvenanceArchive(db,d,h)});
      const mappings=await getProjectMappings(db,project,{historical:true});
      const importedPortable = p.portable_state ? JSON.parse(unseal(p.portable_state, `${req.user.tenant_id}:${project}:portable-state`)) : null;
      for (const item of importedPortable?.restoredDraftAssets ?? []) for (const page of item.pages ?? []) {
        const preview = await readOriginal(page.previewId), map = await readArtifact(page.mapId); if (hash(preview) !== page.previewHash || hash(map) !== page.mapHash) fail("SOURCE_MISMATCH", 409);
        const previewEntry = `retained/${item.documentId}/pages/${page.index}.png`, mapEntry = `retained/${item.documentId}/pages/${page.index}.json`; sources.set(previewEntry, preview); sources.set(mapEntry, Buffer.from(map)); delete page.previewId; delete page.mapId; Object.assign(page, { previewEntry, mapEntry });
      }
      for(const [index,item]of(importedPortable?.retainedNormalizedSources??[]).entries()){const bytes=await readOriginal(item.sourceId);if(hash(bytes)!==item.hash)fail('SOURCE_MISMATCH',409);const entry=`retained/${item.documentId}/normalized-${index}.docx`;sources.set(entry,bytes);delete item.sourceId;item.entry=entry;}
      const snapshot: NativePortable = { format: "tuominwang-workspace", schemaVersion: 1, project: { name: p.name, dictionary: p.dictionary ? JSON.parse(unseal(p.dictionary, `${req.user.tenant_id}:${project}:dictionary`)) : [], dictionaryRevision: p.dictionary_revision, presetPolicy: p.preset_policy ? JSON.parse(unseal(p.preset_policy, `${req.user.tenant_id}:${project}:presets`)) : null, presetRevision: p.preset_revision, mappingLibrary:await projectLibraryBackup(db,req.user,project), unifiedAliasState:(await readUnifiedAliasState(db,req.user.tenant_id,project)).frame, ...(importedPortable ? { importedPortable } : {}) }, mappings, documents, snapshots,provenanceHistory };
      snapshot.folderBatch=await workspaceFolderBatch(db,req.user.tenant_id,project,importedPortable);
      const bytes = await checked(() => input.format==="native"?writeNativePortable(snapshot, sources, { password: input.password }):writeCompatibleWorkspace(snapshot,sources,project,input.format,input.password)); await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'workspace_backup_exported',${project})`);await rememberWorkspaceRecent(db,req.user,project,{snapshot,sources,saved:true});
      return reply.type("application/octet-stream").header("Content-Disposition", `attachment; filename="tuominwang-workspace.${input.format==="native"?"tmw":"tmm"}"`).header("Cache-Control", "no-store").send(bytes);
    });
  });
  async function applyReviewProfile(req:FastifyRequest,project:string,revision:number,projectName:string,inherited:Awaited<ReturnType<typeof reviewProfileMappings>>){
    return projectScope(req,{project},['view_original','view_mapping','manage_dictionary','review'],async db=>{const[p]=await rows(db,sql`SELECT * FROM projects WHERE id=${project} FOR UPDATE`);if(p.preset_revision!==revision)fail('VERSION_CONFLICT',409);const previous=readProjectPresets(p),now=new Date().toISOString(),ruleId=randomUUID(),settings=checkedRuleset({id:ruleId,schemaVersion:1,name:'Imported review '+projectName.slice(0,150),description:'',source:'migrated',readonly:false,applicability:{mode:'all',materialRouteKeys:[]},createdAt:now,updatedAt:now,entries:importedEntries(inherited.profile.corrections.map((c:any,i:number)=>({row:i+1,pattern:c.pattern,entityType:c.entityType,kind:c.kind,enabled:true})),'migration')}),next=projectPresetSchema.parse({...previous,revision:p.preset_revision+1,ruleset:{revision:1,settings}}),existing=await getProjectMappings(db,project);const occupied=new Set((await projectMappingNamespace(db,project)).map(m=>m.ordinal));
    for(const mapping of inherited.mappings){const prior=existing.find(m=>m.token===mapping.token);if(prior){const payload=prior;if(payload.value!==mapping.value)fail('PORTABLE_PROFILE_TOKEN_VALUE_CONFLICT',400);if(JSON.stringify((payload.identities??[{kind:payload.kind,rawEntityType:payload.rawEntityType}]).map(entityIdentity).sort())!==JSON.stringify(mapping.identities.map(entityIdentity).sort()))fail('PORTABLE_PROFILE_EXISTING_IDENTITY_CONFLICT',400);continue;}let ordinal=1;while(ordinal<=MAX_MAPPING_ENTRIES&&occupied.has(ordinal))ordinal++;if(ordinal>MAX_MAPPING_ENTRIES)fail('MAPPING_LIMIT',400);occupied.add(ordinal);const target=randomUUID();await rows(db,sql`INSERT INTO entity_mappings(id,tenant_id,project_id,request_id,ordinal,token,payload,created_by)VALUES(${target},${p.tenant_id},${project},${randomUUID()},${ordinal},${mapping.token},${seal(JSON.stringify(mapping),`${p.tenant_id}:${project}:${target}:mapping:1`)},${req.user.id})`);}
    await rows(db,sql`UPDATE projects SET preset_policy=${seal(JSON.stringify(next),`${p.tenant_id}:${project}:presets`)},preset_revision=${next.revision} WHERE id=${project}`);const portableState=p.portable_state?JSON.parse(unseal(p.portable_state,`${p.tenant_id}:${project}:portable-state`)):{};portableState.reviewInheritance=inherited.profile;await rows(db,sql`UPDATE projects SET portable_state=${seal(JSON.stringify(portableState),`${p.tenant_id}:${project}:portable-state`)} WHERE id=${project}`);await invalidatePresetProject(db,project);await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id)VALUES(${p.tenant_id},${project},${req.user.id},'workspace_review_profile_applied',${project})`);return{revision:next.revision,correctionCount:settings.entries.length,mappingCount:inherited.mappings.length,requiresRecognitionAndReview:true};});
  }
  app.post('/api/projects/:id/portable/review-profile',{bodyLimit:FILE_MAX_BYTES*2},async req=>{const project=id.parse((req.params as any).id),input=z.object({revision:z.number().int().nonnegative(),bytesBase64:file,password:password.optional(),choices:z.record(z.string(),z.string()).default({})}).strict().parse(req.body),workspace=await checked(()=>readPortableWorkspace(decode(input.bytesBase64),{password:input.password})),inherited=await checked(()=>reviewProfileMappings(workspace,input.choices));return applyReviewProfile(req,project,input.revision,workspace.snapshot.projectName,inherited);});
  app.post('/api/portable/migrate',{bodyLimit:FILE_MAX_BYTES*2},async(req,reply)=>{const input=z.object({bytesBase64:file,password:password.optional(),newPassword:password,format:z.enum(['legacy-zip','secure-v2','secure-v3'])}).strict().parse(req.body),bytes=await checked(()=>migrateCompatibleWorkspace(decode(input.bytesBase64),input.password,input.format,input.newPassword));return reply.type('application/octet-stream').header('Content-Disposition','attachment; filename="migrated-review.tmm"').header('Cache-Control','no-store').send(bytes);});
  app.post('/api/portable/migrate-file',async(req,reply)=>{
    const abort=new AbortController();
    let staged:Awaited<ReturnType<typeof stageTmmFile>>|undefined;
    let handed=false;
    const onClose=()=>{abort.abort();if(handed&&staged)void staged.dispose();};
    reply.raw.once('close',onClose);
    try{
      staged=await stageTmmFile(req,['password','newPassword','format'],abort.signal);
      const upload=staged;
      const input=z.object({password:password.optional(),newPassword:password,
        format:z.enum(['legacy-zip','secure-v2','secure-v3'])}).strict().parse(Object.fromEntries(upload.fields));
      await checked(()=>convertReferenceWorkspaceFile({sourcePath:upload.filePath,
        outputPath:upload.outputPath,...input,signal:upload.signal}));
      if(staged.signal.aborted||reply.raw.destroyed)fail('PORTABLE_ABORTED',400);
      const size=(await stat(staged.outputPath)).size;
      if(staged.signal.aborted||reply.raw.destroyed)fail('PORTABLE_ABORTED',400);
      handed=true;
      return reply.type('application/octet-stream').header('Cache-Control','no-store')
        .header('Content-Disposition','attachment; filename="migrated-review.tmm"')
        .header('Content-Length',String(size)).send(createReadStream(staged.outputPath));
    }finally{if(!handed){reply.raw.off('close',onClose);await staged?.dispose();}}
  });
  // Original dedicated V1 -> V2 migration accepts archives beyond the normal
  // open budget. The browser sends the selected file as a stream; this route
  // retains the original migration parser and V2 writer, then streams the
  // verified result to the browser without a whole-file Buffer.
  app.post('/api/portable/migrate-v1-file', async (req, reply) => {
    // R_ admits 32 GiB expanded and 100,000 entries. ZIP's bounded local and
    // central header fields can exceed the secure-container framing allowance.
    const rawV1ZipMax = 34359738368 + 100000 * (3 * 65535 + 2 * 1024 + 256) + 65535;
    const directory = await mkdtemp(join(tmpdir(), 'tmw-v1-migrate-'));
    const sourcePath = join(directory, 'source.tmm'), targetPath = join(directory, 'source_V2.tmm');
    const abort = new AbortController(), onAbort = () => abort.abort();
    req.raw.once('aborted', onAbort);
    let handedToResponse = false;
    let responseClosed = false;
    const onResponseClose = () => {
      responseClosed = true;
      abort.abort();
      req.raw.off('aborted', onAbort);
      if (handedToResponse) void rm(directory, { recursive: true, force: true });
    };
    reply.raw.once('close', onResponseClose);
    try {
      const fields = new Map<string, string>(); let fileSeen = false;
      for await (const part of req.parts({ limits: { fileSize: rawV1ZipMax,
        files: 2, fields: 2, parts: 3, fieldSize: 2048 } })) {
        if (part.type === 'file') {
          if (fileSeen || part.fieldname !== 'file') fail('PORTABLE_FILE_INVALID', 400);
          fileSeen = true;
          await pipeline(part.file, createWriteStream(sourcePath, { flags: 'wx', mode: 0o600 }),
            { signal: abort.signal });
          if (part.file.truncated) fail('PORTABLE_FILE_TOO_LARGE', 413);
        } else {
          if (part.fieldname !== 'newPassword' || fields.has(part.fieldname) || typeof part.value !== 'string')
            fail('PORTABLE_INPUT_INVALID', 400);
          fields.set(part.fieldname, part.value);
        }
      }
      if (abort.signal.aborted || responseClosed || !fileSeen) fail('PORTABLE_FILE_INVALID', 400);
      const newPassword = password.parse(fields.get('newPassword'));
      const dek = randomBytes(32);
      try {
        const slot = await createTmmTransferSlot(newPassword, dek);
        await checked(() => migrateLegacyWorkspaceV1ToV2File({ sourcePath, targetPath,
          dek, keySlots: [slot], signal: abort.signal }));
      } finally { dek.fill(0); }
      if (abort.signal.aborted || responseClosed || reply.raw.destroyed) fail('PORTABLE_ABORTED', 400);
      const size = (await stat(targetPath)).size;
      if (abort.signal.aborted || responseClosed || reply.raw.destroyed) fail('PORTABLE_ABORTED', 400);
      handedToResponse = true;
      return reply.type('application/octet-stream').header('Cache-Control', 'no-store')
        .header('Content-Disposition', 'attachment; filename="source_V2.tmm"')
        .header('Content-Length', String(size)).send(createReadStream(targetPath));
    } finally {
      if (!handedToResponse) { req.raw.off('aborted', onAbort); reply.raw.off('close', onResponseClose); await rm(directory, { recursive: true, force: true }); }
    }
  });
  app.post('/api/portable/review-profile',{bodyLimit:FILE_MAX_BYTES*2},async req=>{const input=z.object({bytesBase64:file,password:password.optional(),fileName:z.string().min(1).refine(v=>v.isWellFormed()).default('审查.tmm')}).strict().parse(req.body);return checked(async()=>workspaceReviewProfile(await readPortableWorkspace(decode(input.bytesBase64),{password:input.password}),input.fileName));});
  app.post('/api/portable/review-profile-file',async req=>{
    const staged=await stageTmmFile(req,['password','fileName']);
    try{
      const input=z.object({password:password.optional(),fileName:z.string().min(1)
        .refine(v=>v.isWellFormed()).optional()}).strict().parse(Object.fromEntries(staged.fields));
      return await checked(()=>referenceProfileFromFile(staged.filePath,input.password,input.fileName??staged.fileName));
    }finally{await staged.dispose();}
  });
  app.post('/api/projects/:id/portable/review-profile-file',async req=>{
    const project=id.parse((req.params as any).id);
    await projectScope(req,{project},['view_original','view_mapping','manage_dictionary','review'],async()=>{});
    const staged=await stageTmmFile(req,['password','revision','choices']);
    try{
      const input=z.object({password:password.optional(),revision:z.string().regex(/^(0|[1-9][0-9]*)$/)
        .transform(value=>Number(value)).pipe(z.number().int().nonnegative()),
        choices:z.string().default('{}').transform(value=>{try{return JSON.parse(value);}catch{fail('PORTABLE_INPUT_INVALID',400);}})
          .pipe(z.record(z.string(),z.string()))}).strict().parse(Object.fromEntries(staged.fields));
      const opened=await checked(()=>openReferenceWorkspaceFile(staged.filePath,input.password));
      try{
        const inherited=await checked(()=>reviewProfileMappings({format:opened.format,
          snapshot:opened.snapshot,sources:new Map()} as any,input.choices));
        return await applyReviewProfile(req,project,input.revision,opened.snapshot.projectName,inherited);
      }finally{await opened.close();}
    }finally{await staged.dispose();}
  });
  app.get("/api/documents/:id/portable-draft", async req => {
    const doc = id.parse((req.params as any).id);
    return projectScope(req, { document: doc }, ["view_original", "view_mapping", "review"], async (db, project) => { const [p] = await rows(db, sql`SELECT portable_state FROM projects WHERE id=${project}`); if (!p.portable_state) return { available: false }; const stored = JSON.parse(unseal(p.portable_state, `${req.user.tenant_id}:${project}:portable-state`)), oldId = Object.entries(stored.documentIdMap ?? {}).find(([, target]) => target === doc)?.[0]; return { available: !!oldId, pending: stored.pendingDraftRegions?.[doc] ?? null }; });
  });
  app.post("/api/documents/:id/portable-draft/restore", async req => {
    const doc = id.parse((req.params as any).id), input = z.object({ revision: z.number().int().nonnegative() }).strict().parse(req.body);
    let createdArtifactIds:string[]=[],callbackCompleted=false;
    try { return await projectScope(req, { document: doc }, ["view_original", "view_mapping", "review"], async (db, project) => {
      const [p] = await rows(db, sql`SELECT * FROM projects WHERE id=${project} FOR UPDATE`), [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc} FOR UPDATE`); if (!p.portable_state) fail("PORTABLE_DRAFT_NOT_FOUND", 404); if (d.state !== "review" || d.revision !== input.revision) fail("VERSION_CONFLICT", 409);
      const stored = JSON.parse(unseal(p.portable_state, `${req.user.tenant_id}:${project}:portable-state`)); const oldId = Object.entries(stored.documentIdMap).find(([, target]) => target === doc)?.[0], old = stored.importedSnapshot.documents.find((item: any) => item.id === oldId); if (!old) fail("PORTABLE_DRAFT_NOT_FOUND", 404);
      const assets = stored.restoredDraftAssets.find((item: any) => item.documentId === doc)?.pages ?? [], mappings = await getProjectMappings(db,project,{historical:true}), dictionary = p.dictionary ? JSON.parse(unseal(p.dictionary, `${req.user.tenant_id}:${project}:dictionary`)) : [];
      try{await verifiedDocumentSource(d);}catch(e){fail((e as Error).message,409);}
      const legacyMarkdown=stored.format==="tuominwang-workspace"&&old.format==="md"&&old.recognition?.markdown?.version!=="markdown-source-2",referenceOld=legacyMarkdown?{detection:{documentText:old.content},review:{entities:old.marks.map((m:any,index:number)=>({type:m.rawEntityType??m.kind,text:old.content.slice(m.start,m.end),startOffset:m.start,endOffset:m.end,sourceStart:m.start,sourceEnd:m.end,nativeReplacement:m.replacement,deleted:m.decision==='ignore',userAdded:m.hiddenByType?reviewEntityWasUserAdded(m):reviewEntityBirth(m,old.reviewProvenance?.entries.find((e:any)=>e.active&&e.markIndex===index)),...m.hiddenByType===true?{hiddenByType:true,meta:{hiddenByType:true,hiddenTypeWasUserAdded:m.hiddenTypeWasUserAdded===true}}:{},customReplacement:m.replacement?.mode==="custom"?m.replacement.value:undefined,anchor:{contextBefore:old.content.slice(Math.max(0,m.start-30),m.start),contextAfter:old.content.slice(m.end,m.end+30)}})),activeBBoxes:[],deletedBBoxes:[]},exportState:{}}:{...old,effectiveProfileSnapshot:stored.importedSnapshot.profileSnapshot};const nativePolicy=stored.format === "tuominwang-workspace"&&!legacyMarkdown?resolveDocumentPolicy(d,readProjectPresets(p)):null;const currentRuntimeRules=nativePolicy?await getRuntimeWhitelists(db,req.user.tenant_id,project,req.user.id,doc):[];const restored = await checked(() => nativePolicy?restorePortableDraft(d, old, assets, mappings, dictionary, nativePolicy.presetPolicy,nativePolicy.documentPolicy,currentRuntimeRules,p.dictionary_revision):restoreReferencePortableDraft(d,referenceOld,legacyMarkdown?old.sourceHash:stored.referenceSourceHashes?.[oldId as string],mappings)); createdArtifactIds=('createdArtifactIds'in restored?restored.createdArtifactIds:[]) as string[]; if(nativePolicy)await applyFreshPortableReplacements(db,d,restored,nativePolicy,req.user.id); stored.pendingDraftRegions ??= {}; stored.pendingDraftRegions[doc] = { regions: restored.regionCandidates, deletedPages: restored.deletedPageCandidates, unresolved:("unresolved" in restored?restored.unresolved:[]) }; await rows(db, sql`UPDATE projects SET portable_state=${seal(JSON.stringify(stored), `${req.user.tenant_id}:${project}:portable-state`)} WHERE id=${project}`);
      const archivedCorrection=archiveEntityCorrections(d);let correctionFrame:any=('entityCorrections'in restored)?restored.entityCorrections:null;if(stored.format==='tuominwang-workspace'&&!legacyMarkdown&&archivedCorrection){if(archivedCorrection.frame.contentHash!==restored.hash||archivedCorrection.frame.sourceHash!==d.source_hash)fail('ENTITY_CORRECTION_STALE',409);correctionFrame={...archivedCorrection.frame,capturedRevision:d.revision+1,entries:archivedCorrection.frame.entries.map(entry=>{const afterIndex=entry.markIndex===undefined?undefined:restored.restoredMarkIndices[entry.markIndex];if(entry.active===false)return entry;if(afterIndex===undefined||afterIndex<0)return{...entry,active:false};const mark=restored.marks[afterIndex];if(mark.start!==entry.start||mark.end!==entry.end||entityIdentity(mark)!==entityIdentity(entry))fail('ENTITY_CORRECTION_STALE',409);return{...entry,markIndex:afterIndex};})};}const nextDoc={...d,content:restored.content,content_hash:restored.hash,marks:restored.marks,revision:d.revision+1},storedCorrection=correctionFrame?sealEntityCorrections(nextDoc,correctionFrame):d.entity_corrections??null;await recordReboundReviewProvenance(db,d,nextDoc,{links:[],actorId:req.user.id,operation:'portable-draft-restore'});
      const geometryDoc={...nextDoc,anchors:restored.anchors,page_data:restored.pages},geometry=await restorePortableEntityGeometry(db,geometryDoc,old,restored,req.user.id);
      restored.regionCandidates=geometry.regions;restored.unresolved=geometry.unresolved;
      stored.pendingDraftRegions[doc]={regions:geometry.regions,deletedPages:restored.deletedPageCandidates,unresolved:geometry.unresolved};
      await rows(db,sql`UPDATE projects SET portable_state=${seal(JSON.stringify(stored),`${req.user.tenant_id}:${project}:portable-state`)} WHERE id=${project}`);
      await rows(db, sql`UPDATE documents SET content=${restored.content},content_hash=${restored.hash},entity_corrections=${storedCorrection},coverage=${JSON.stringify([...d.coverage.filter((c:any)=>c.id!=="portable-review-unresolved"&&(c.id!=="entity-corrections"||!correctionFrame)),...(restored.unresolved.length?[{id:"portable-review-unresolved",status:"blocked",reason:"PORTABLE_REVIEW_UNRESOLVED"}]:[])])}::jsonb,anchors=${JSON.stringify(restored.anchors)}::jsonb,page_data=${JSON.stringify(restored.pages)}::jsonb,marks=${JSON.stringify(restored.marks)}::jsonb,page_review=${JSON.stringify(sealPageReview({...d,content_hash:restored.hash},restored.pageReview,d.revision+1))}::jsonb,visual_candidates=${JSON.stringify('visualCandidates'in restored?restored.visualCandidates:d.visual_candidates??[])}::jsonb,recognition=${JSON.stringify('recognition'in restored?restored.recognition:d.recognition)}::jsonb,revision=revision+1 WHERE id=${doc}`);
      await rows(db, sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE document_id=${doc} AND status IN ('queued','running')`); await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'portable_draft_restored',${doc})`);
      callbackCompleted=true;return { revision: d.revision + 1, pending: stored.pendingDraftRegions[doc], rebuiltMapPages: restored.rebuiltMapPages };
    }); } catch(error) { if(!callbackCompleted)await Promise.allSettled(createdArtifactIds.map(id=>removeOwnedArtifact(id,doc))); if((error as Error).message==='PROCESSING_BUSY')Object.assign(error as Error,{statusCode:409}); throw error; }
  });
  app.post("/api/documents/:id/portable-draft/confirm-region", async req => {
    const doc = id.parse((req.params as any).id), input = z.object({ revision: z.number().int().nonnegative(), regionId: id }).strict().parse(req.body);
    return projectScope(req, { document: doc }, ["view_original", "review"], async (db, project) => { const [p] = await rows(db, sql`SELECT portable_state FROM projects WHERE id=${project} FOR UPDATE`), [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc} FOR UPDATE`); if (d.state !== "review" || d.revision !== input.revision) fail("VERSION_CONFLICT", 409); const stored = JSON.parse(unseal(p.portable_state, `${req.user.tenant_id}:${project}:portable-state`)), pending = stored.pendingDraftRegions?.[doc], region = pending?.regions?.find((r: any) => r.id === input.regionId); if (!region) fail("PORTABLE_DRAFT_REGION_NOT_FOUND", 404); const currentReview = openPageReview(d) ?? { mode: "unselected", regions: [], deletedPages: [] }, review = validatePageReview({ ...currentReview, regions: [...currentReview.regions, { ...region, id: randomUUID() }] }, d.page_data); pending.regions = pending.regions.filter((r: any) => r.id !== input.regionId); await retainPortableSlots(db,d,req.user.id,'portable-region-confirm'); await rows(db, sql`UPDATE projects SET portable_state=${seal(JSON.stringify(stored), `${req.user.tenant_id}:${project}:portable-state`)} WHERE id=${project}`); await rows(db, sql`UPDATE documents SET page_review=${JSON.stringify(sealPageReview(d,review,d.revision+1))}::jsonb,marks=(SELECT coalesce(jsonb_agg(m||jsonb_build_object('decision',CASE WHEN m->>'hiddenByType'='true' THEN 'ignore' ELSE 'pending' END)),'[]'::jsonb) FROM jsonb_array_elements(marks) m),revision=revision+1 WHERE id=${doc}`); return { revision: d.revision + 1 }; });
  });
  app.post("/api/documents/:id/portable-draft/page-candidate", async req => {
    const doc = id.parse((req.params as any).id), input = z.object({ revision: z.number().int().nonnegative(), action: z.enum(["confirm", "discard"]), regionId: id.optional(), deletedPage: z.number().int().nonnegative().optional() }).strict().refine(v => (v.regionId != null) !== (v.deletedPage != null)).parse(req.body);
    return projectScope(req, { document: doc }, ["view_original", "review"], async (db, project) => {
      const [p] = await rows(db, sql`SELECT portable_state FROM projects WHERE id=${project} FOR UPDATE`), [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc} FOR UPDATE`); if (d.state !== "review" || d.revision !== input.revision) fail("VERSION_CONFLICT", 409); if (!p.portable_state) fail("PORTABLE_DRAFT_NOT_FOUND", 404);
      const stored = JSON.parse(unseal(p.portable_state, `${req.user.tenant_id}:${project}:portable-state`)), pending = stored.pendingDraftRegions?.[doc], region = input.regionId == null ? null : pending?.regions?.find((r: any) => r.id === input.regionId), deleted = input.deletedPage != null && pending?.deletedPages?.includes(input.deletedPage); if (!region && !deleted) fail("PORTABLE_DRAFT_REGION_NOT_FOUND", 404);
      let review = openPageReview(d) ?? { mode: "unselected", regions: [], deletedPages: [] };
      if (input.action === "confirm") review = validatePageReview({ ...review, regions: [...review.regions, ...(region ? [{ ...region, id: randomUUID() }] : [])], deletedPages: [...review.deletedPages, ...(deleted ? [input.deletedPage] : [])] }, d.page_data);
      pending.regions = pending.regions.filter((r: any) => r.id !== input.regionId); pending.deletedPages = pending.deletedPages.filter((page: number) => page !== input.deletedPage);
      await retainPortableSlots(db,d,req.user.id,'portable-page-candidate-'+input.action);
      await rows(db, sql`UPDATE projects SET portable_state=${seal(JSON.stringify(stored), `${req.user.tenant_id}:${project}:portable-state`)} WHERE id=${project}`);
      await rows(db, sql`UPDATE documents SET page_review=${JSON.stringify(sealPageReview(d,review,d.revision+1))}::jsonb,marks=(SELECT coalesce(jsonb_agg(m||jsonb_build_object('decision',CASE WHEN m->>'hiddenByType'='true' THEN 'ignore' ELSE 'pending' END)),'[]'::jsonb) FROM jsonb_array_elements(marks) m),revision=revision+1 WHERE id=${doc}`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${project},${req.user.id},${input.action === "confirm" ? "portable_page_candidate_confirmed" : "portable_page_candidate_discarded"},${doc})`); return { revision: d.revision + 1 };
    });
  });
  app.post("/api/documents/:id/portable-draft/resolve-unresolved",async req=>{const doc=id.parse((req.params as any).id),input=z.object({revision:z.number().int().nonnegative(),index:z.number().int().nonnegative(),action:z.enum(["resolved-in-editor","discard"])}).strict().parse(req.body);return projectScope(req,{document:doc},["view_original","review"],async(db,project)=>{const[p]=await rows(db,sql`SELECT portable_state FROM projects WHERE id=${project} FOR UPDATE`),[d]=await rows(db,sql`SELECT * FROM documents WHERE id=${doc} FOR UPDATE`);if(d.revision!==input.revision||d.state!=="review")fail("VERSION_CONFLICT",409);if(!p.portable_state)fail("PORTABLE_DRAFT_NOT_FOUND",404);const state=JSON.parse(unseal(p.portable_state,`${req.user.tenant_id}:${project}:portable-state`)),pending=state.pendingDraftRegions?.[doc],item=pending?.unresolved?.[input.index];if(!item)fail("PORTABLE_DRAFT_REGION_NOT_FOUND",404);pending.acknowledged??=[];pending.acknowledged.push({...item,action:input.action,user:req.user.id,at:new Date().toISOString()});pending.unresolved.splice(input.index,1);await retainPortableSlots(db,d,req.user.id,'portable-unresolved-'+input.action);await rows(db,sql`UPDATE projects SET portable_state=${seal(JSON.stringify(state),`${req.user.tenant_id}:${project}:portable-state`)} WHERE id=${project}`);const coverage=d.coverage.filter((c:any)=>c.id!=="portable-review-unresolved"||pending.unresolved.length);await rows(db,sql`UPDATE documents SET coverage=${JSON.stringify(coverage)}::jsonb,revision=revision+1,marks=(SELECT coalesce(jsonb_agg(m||jsonb_build_object('decision',CASE WHEN m->>'hiddenByType'='true' THEN 'ignore' ELSE 'pending' END)),'[]'::jsonb) FROM jsonb_array_elements(marks) m) WHERE id=${doc}`);await rows(db,sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id)VALUES(${d.tenant_id},${project},${req.user.id},'portable_unresolved_reviewed',${doc})`);return{revision:d.revision+1,pending};});});
  app.get("/api/projects/:id/portable/imported-state", async req => {
    const project = id.parse((req.params as any).id);
    return projectScope(req, { project }, ["view_original", "view_mapping"], async db => { const [p] = await rows(db, sql`SELECT portable_state FROM projects WHERE id=${project}`); return { imported: p.portable_state ? JSON.parse(unseal(p.portable_state, `${req.user.tenant_id}:${project}:portable-state`)) : null }; });
  });
  app.post("/api/portable/import", { bodyLimit: FILE_MAX_BYTES * 2 }, async req => {
    const input = z.object({ name: z.string().trim().min(1).max(200), password: password.optional(), bytesBase64: file,choices:z.record(z.string(),z.string()).default({}) }).strict().parse(req.body), opened = await checked(() => readNativeOrReferencePortable(decode(input.bytesBase64), { password: input.password }));
    return importOpenedWorkspace(req,input,opened);
  });
  app.post("/api/portable/import-file", async req => {
    const directory = await mkdtemp(join(tmpdir(), "tmw-import-"));
    const filePath = join(directory, "workspace.tmw");
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    req.raw.once("aborted", onAbort);
    let opened: any;
    try {
      let fileSeen = false;
      const fields = new Map<string, string>();
      for await (const part of req.parts({ limits: { fileSize: TMM_CONTAINER_MAX_BYTES,
        files: 2, fields: 4, parts: 5, fieldSize: 700000 } })) {
        if (part.type === "file") {
          if (fileSeen || part.fieldname !== "file") fail("PORTABLE_FILE_INVALID", 400);
          fileSeen = true;
          await pipeline(part.file, createWriteStream(filePath, { flags: "wx", mode: 0o600 }),
            { signal: abort.signal });
          if (part.file.truncated) fail("PORTABLE_FILE_TOO_LARGE", 413);
        } else {
          if (!["name", "password", "choices"].includes(part.fieldname) || fields.has(part.fieldname)
            || typeof part.value !== "string") fail("PORTABLE_INPUT_INVALID", 400);
          fields.set(part.fieldname, part.value);
        }
      }
      if (abort.signal.aborted || !fileSeen) fail("PORTABLE_FILE_INVALID", 400);
      let choices: unknown;
      try { choices = fields.has("choices") ? JSON.parse(fields.get("choices")!) : undefined; }
      catch { fail("PORTABLE_INPUT_INVALID", 400); }
      const input = z.object({ name: z.string().trim().min(1).max(200),
        password: password.optional(), choices: z.record(z.string(), z.string()).default({}) }).strict().parse({
        name: fields.get("name"), password: fields.get("password") || undefined,
        choices,
      });
      opened = await checked(() => openNativeOrReferenceWorkspaceFile(filePath,
        { password: input.password }));
      return await importOpenedWorkspace(req, input, opened);
    } finally {
      req.raw.off("aborted", onAbort);
      try {
        await opened?.close?.();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });
}

async function importOpenedWorkspace(req: any, input: {name:string;choices:Record<string,string>}, opened: any) {
    let unifiedAliasState:any=null;let mappingLibraryBackup:unknown=undefined;let dictionary: any[] = [], presetPolicy: any = null, portableState: any, documents: any[], mappings: any[] = [], retainedAssets: any[] = [],retainedNormalized:any[] = [], sources: Map<string, WorkspaceAsset>;
    if (opened.kind === "native") {
      const snapshot = opened.snapshot; unifiedAliasState=snapshot.project.unifiedAliasState??null;mappingLibraryBackup=snapshot.project.mappingLibrary; dictionary = dictionarySchema.parse({ revision: 0, entries: snapshot.project.dictionary }).entries; presetPolicy = snapshot.project.presetPolicy == null ? null : projectPresetSchema.parse(snapshot.project.presetPolicy); documents = snapshot.documents.map((d: any) => nativeDocument.parse(d)); mappings = z.array(z.object({ id, token: z.string().refine(validAliasToken), value: z.string().min(1).refine(v=>v.isWellFormed()), kind: markSchema.shape.kind,rawEntityType:markSchema.shape.rawEntityType, identities:z.array(z.object({kind:markSchema.shape.kind,rawEntityType:markSchema.shape.rawEntityType}).strict().refine(v=>v.rawEntityType===undefined||v.kind==="自定义")).optional(),inherited:z.boolean().optional(),forms:z.array(z.string().min(1).refine(v=>v.isWellFormed())).optional(), ordinal: z.number().int().min(1).max(MAX_MAPPING_ENTRIES), version: z.number().int().positive(),groupId:id.optional(),active:z.boolean().optional(),adoptedLegacyMappingId:id.optional() }).passthrough().refine(m=>m.rawEntityType===undefined||m.kind==="自定义")).parse(snapshot.mappings); sources = opened.sources; retainedAssets = snapshot.project.importedPortable?.restoredDraftAssets ?? [];retainedNormalized=snapshot.project.importedPortable?.retainedNormalizedSources??[]; portableState = { format: snapshot.format, schemaVersion: snapshot.schemaVersion, importedSnapshot: snapshot, importedAt: new Date().toISOString(), acceptance: "re-recognition-and-review-required" };
    } else {
      const snapshot = opened.workspace.snapshot;unifiedAliasState=snapshot.projectModeSnapshot?{version:1,enabled:true,state:snapshot.projectModeSnapshot,inheritance:snapshot.inheritedPseudonymProfile}:null; sources = opened.workspace.sources; documents = snapshot.documents.map((d: any) => ({ id: d.id, name: d.fileName, format: fileFormat(d.fileName), content: "", contentHash: hash(""), sourceEntry: d.sourceEntry, sourceHash: assetHash(sources.get(d.sourceEntry)!), marks: [], revision: 0, state: "queued", anchors: [], coverage: [], pages: [], pageReview: null, recognition: {}, nerEnabled: false,documentPolicy:d.nativeDocumentPolicy??null,entityCorrectionsArchive:d.entityCorrectionsArchive,referenceCanonicalHash:hash(d.detection.documentText??''),...d.fileKind==='pdf'?{pageRotationState:pageRotationStateSchema.parse({version:1,rotations:Object.fromEntries(Object.entries(d.review.pageRotations??{}).map(([page,angle])=>[Number(page)-1,angle])),manualOnlyPages:(d.review.manualOnlyRotationPages??[]).map((page:number)=>page-1)})}:{} })); const inherited=await checked(()=>reviewProfileMappings(opened.workspace,input.choices));mappings=inherited.mappings.map((m,i)=>({...m,id:randomUUID(),ordinal:i+1,version:1}));presetPolicy=await checked(()=>referenceWorkspacePolicy(opened.workspace,inherited));portableState = { format: opened.workspace.format, importedSnapshot: snapshot,reviewInheritance:inherited.profile,referenceSourceHashes:Object.fromEntries(documents.map(d=>[d.id,d.sourceHash])), importedAt: new Date().toISOString(), acceptance: "re-recognition-and-review-required" };
    }
    if (documents.length > 10000 || new Set(documents.map(d => d.id)).size !== documents.length) fail("PORTABLE_DUPLICATE_DOCUMENT", 400);await checked(()=>validatePortableMappingHistory(mappings));
    let journal:WorkspaceImportJournal|undefined;
    try{return await scoped(req.user.id, req.user.tenant_id, async db => {
      const project = randomUUID(), docIds = Object.fromEntries(documents.map(d => [d.id, randomUUID()])), mappingIds = Object.fromEntries(mappings.map(m => [m.id, randomUUID()])); portableState.documentIdMap = docIds; portableState.restoredDraftAssets = [];portableState.unlockRequired=[];portableState.normalizationRequired=[];portableState.retainedNormalizedSources=[];
      await rows(db, sql`INSERT INTO projects(id,tenant_id,owner_id,name,dictionary,dictionary_revision,preset_policy,preset_revision,portable_state) VALUES(${project},${req.user.tenant_id},${req.user.id},${input.name},${seal(JSON.stringify(dictionary), `${req.user.tenant_id}:${project}:dictionary`)},0,${presetPolicy ? seal(JSON.stringify({ ...presetPolicy, revision: 0 }), `${req.user.tenant_id}:${project}:presets`) : null},0,${seal(JSON.stringify(portableState), `${req.user.tenant_id}:${project}:portable-state`)})`);
      journal={version:1,id:randomUUID(),tenant:req.user.tenant_id,user:req.user.id,project,planned:Object.values(docIds),owners:[]};
      await beginWorkspaceImport(db,journal);
      await checked(()=>restoreProjectLibrary(db,req.user,project,mappingLibraryBackup));
      for (const m of mappings.filter(m=>m.version===1)) await rows(db, sql`INSERT INTO entity_mappings(id,tenant_id,project_id,request_id,ordinal,token,payload,created_by) VALUES(${mappingIds[m.id]},${req.user.tenant_id},${project},${randomUUID()},${m.ordinal},${m.token},${seal(JSON.stringify({ value: m.value, kind: m.kind,...m.rawEntityType!==undefined?{rawEntityType:m.rawEntityType}:{},...m.scope!==undefined?{scope:docIds[m.scope]??(()=>{throw new Error("PORTABLE_MAPPING_SCOPE_INVALID")})()}: {},...m.inherited?{inherited:true}:{},...m.identities?{identities:m.identities}:{},...m.forms?{forms:m.forms}:{} }), `${req.user.tenant_id}:${project}:${mappingIds[m.id]}:mapping:1`)},${req.user.id})`);
      const versions=mappings.filter(m=>m.version>=2).map(m=>({...m,...m.scope!==undefined?{scope:docIds[m.scope]??(()=>{throw new Error('PORTABLE_MAPPING_SCOPE_INVALID')})()}: {},...m.adoptedLegacyMappingId?{adoptedLegacyMappingId:mappingIds[m.adoptedLegacyMappingId]??(()=>{throw new Error('PORTABLE_MAPPING_HISTORY_INVALID')})()}: {}}));const importedVersions=await importAliasGroupVersions(db,{tenantId:req.user.tenant_id,projectId:project,userId:req.user.id},versions);for(const[old,next]of importedVersions)mappingIds[old]=next;portableState.mappingIdMap=mappingIds;if(unifiedAliasState)await importUnifiedAliasState(db,req.user.tenant_id,project,unifiedAliasState,docIds);
      const verifiedPageMaps = new Map<string, Buffer>();
      for (const d of documents) {
        const doc = docIds[d.id], source = sources.get(d.sourceEntry); if (!source || assetHash(source) !== d.sourceHash || hash(d.content) !== d.contentHash) fail("PORTABLE_SOURCE_MISMATCH", 400);
        let unlockedSourceId:string|null=null,unlockedHash:string|null=null;if(d.unlockedSource){const unlocked=d.unlockedSource,derived=sources.get(unlocked.entry);if(!derived||assetHash(derived)!==unlocked.derivedHash||unlocked.originalHash!==d.sourceHash)fail('PORTABLE_UNLOCK_SOURCE_MISMATCH',400);if(verifyPortableSource(unlocked.witness,d.sourceHash,unlocked.derivedHash,d.format)){unlockedSourceId=randomUUID();unlockedHash=unlocked.derivedHash;await writeWorkspaceAsset(unlockedSourceId,derived,doc);}else portableState.unlockRequired.push({documentId:doc,reason:'PORTABLE_UNLOCK_SERVER_WITNESS_REQUIRED'});}
        let normalized:any=null,normalizedBytes=0;if(d.normalizedSource){const n=d.normalizedSource,bytes=sources.get(n.entry);if(!['doc','wps'].includes(d.format)||!bytes||assetHash(bytes)!==n.normalizedHash||n.originalHash!==d.sourceHash)fail('PORTABLE_NORMALIZATION_SOURCE_MISMATCH',400);const normalizedId=randomUUID();await writeWorkspaceAsset(normalizedId,bytes,doc);normalizedBytes=assetBytes(bytes);if(verifyNormalizationAttestation(n.witness,d.format,d.sourceHash,n.normalizedHash)){const metadata={...n.witness.body,durationMs:n.metadata?.durationMs??0};normalized=normalizationRecord({tenant_id:req.user.tenant_id,project_id:project,id:doc,source_hash:d.sourceHash},normalizedId,metadata);normalizedBytes=assetBytes(bytes);}else{portableState.normalizationRequired.push({documentId:doc,reason:'PORTABLE_NORMALIZATION_SERVER_WITNESS_REQUIRED'});portableState.retainedNormalizedSources.push({documentId:doc,sourceId:normalizedId,hash:assetHash(bytes),witness:n.witness,metadata:n.metadata});}}
        const sourceId = randomUUID(), aad = `${req.user.tenant_id}:${project}:${doc}`, pages: any[] = [], documentPolicy = d.documentPolicy ? documentPolicySchema.parse({ ...d.documentPolicy, revision: 1 }) : null;
        for (const page of d.pages) {
          const preview = sources.get(page.previewEntry), map = sources.get(page.mapEntry); if (!preview || !map || assetHash(preview) !== page.previewHash || assetHash(map) !== page.mapHash) fail("PORTABLE_SOURCE_MISMATCH", 400);
          const previewId = randomUUID(), mapId = randomUUID(), { previewEntry: _preview, mapEntry: _map, ...metadata } = page; await writeWorkspaceAsset(previewId, preview, doc); const mapBytes = await smallAsset(map,page.mapHash); await writeArtifact(mapId, mapBytes.toString("utf8"), doc); verifiedPageMaps.set(page.mapEntry,mapBytes); pages.push({ ...metadata, previewId, mapId });
        }
        portableState.restoredDraftAssets.push({ documentId: doc, importedDocumentId: d.id, pages });
        await rows(db, sql`INSERT INTO documents(id,tenant_id,project_id,request_id,content,content_hash,source_id,source_name,source_format,source_hash,source_bytes,quota_bytes,normalized_source_id,normalized_source_hash,normalization_source_hash,normalization_metadata,unlocked_source_id,unlocked_source_hash,unlock_source_hash,state,anchors,coverage,page_data,ner_enabled,document_policy,document_policy_revision,is_batch) VALUES(${doc},${req.user.tenant_id},${project},${randomUUID()},${seal("", aad)},${hash("")},${sourceId},${seal(d.name, aad + ":name")},${d.format},${assetHash(source)},${assetBytes(source)},${assetBytes(source)+normalizedBytes+(unlockedSourceId?assetBytes(sources.get(d.unlockedSource.entry)!):0)},${normalized?.normalized_source_id??null},${normalized?.normalized_source_hash??null},${normalized?.normalization_source_hash??null},${normalized?.normalization_metadata??null},${unlockedSourceId},${unlockedHash},${unlockedSourceId?d.sourceHash:null},'queued',${JSON.stringify([])}::jsonb,${JSON.stringify([])}::jsonb,${JSON.stringify([])}::jsonb,${d.nerEnabled},${documentPolicy ? seal(JSON.stringify(documentPolicy), aad + ":document-policy") : null},${documentPolicy ? 1 : 0},${!!d.isBatch})`); await writeWorkspaceAsset(sourceId, source, doc, opened.v3Source === true);
        if(d.entityCorrectionsArchive?.current){const imported=d.entityCorrectionsArchive.frame,expectedHash=opened.kind==='native'?d.contentHash:d.referenceCanonicalHash;if(imported.sourceHash!==d.sourceHash||imported.contentHash!==expectedHash)fail('ENTITY_CORRECTION_INVALID',400);const frame={...imported,capturedRevision:0,entries:imported.entries.map((e:any)=>({...e,id:randomUUID(),inherited:true,priorMark:opened.kind==='reference'?undefined:e.priorMark?{...e.priorMark,...e.priorMark.replacement?.mode==='alias'?{replacement:{...e.priorMark.replacement,mappingId:mappingIds[e.priorMark.replacement.mappingId]??(()=>{throw Error('PORTABLE_MAPPING_HISTORY_INVALID')})()}}:{}}:undefined}))};await rows(db,sql`UPDATE documents SET entity_corrections=${sealEntityCorrections({tenant_id:req.user.tenant_id,project_id:project,id:doc,source_hash:d.sourceHash,content_hash:expectedHash,revision:0},frame)} WHERE id=${doc}`);}
        if(d.pageRotationState){if(d.format!=='pdf')fail('PAGE_ROTATION_FORMAT_UNSUPPORTED',400);const rotation=pageRotationStateSchema.parse(d.pageRotationState);if(d.pages.length)validateRotationPages(rotation,d.pages);await rows(db,sql`UPDATE documents SET page_rotation_state=${sealPageRotationState({tenant_id:req.user.tenant_id,project_id:project,id:doc,source_hash:assetHash(source)},rotation)} WHERE id=${doc}`);}
        await rows(db, sql`INSERT INTO jobs(id,tenant_id,project_id,document_id,user_id,kind) VALUES(${randomUUID()},${req.user.tenant_id},${project},${doc},${req.user.id},'detect')`);
      }
      for(const item of retainedNormalized){const doc=docIds[item.documentId],bytes=sources.get(item.entry);if(!doc||!bytes||assetHash(bytes)!==item.hash)fail('PORTABLE_NORMALIZATION_SOURCE_MISMATCH',400);const sourceId=randomUUID();await writeWorkspaceAsset(sourceId,bytes,doc);const{entry:_entry,...rest}=item;portableState.retainedNormalizedSources.push({...rest,documentId:doc,sourceId});await rows(db,sql`UPDATE documents SET quota_bytes=quota_bytes+${assetBytes(bytes)} WHERE id=${doc}`);}
      for (const item of retainedAssets) {
        const doc = docIds[item.documentId]; if (!doc) fail("PORTABLE_RETAINED_SOURCE_INVALID", 400); const pages = [];
        for (const page of item.pages ?? []) { const preview = sources.get(page.previewEntry), map = sources.get(page.mapEntry); if (!preview || !map || assetHash(preview) !== page.previewHash || assetHash(map) !== page.mapHash) fail("PORTABLE_SOURCE_MISMATCH", 400); const previewId = randomUUID(), mapId = randomUUID(), { previewEntry: _preview, mapEntry: _map, ...metadata } = page; await writeWorkspaceAsset(previewId, preview, doc); await writeArtifact(mapId, (await smallAsset(map,page.mapHash)).toString("utf8"), doc); pages.push({ ...metadata, previewId, mapId }); }
        portableState.restoredDraftAssets.push({ ...item, documentId: doc, pages });
      }
      await rows(db, sql`UPDATE projects SET portable_state=${seal(JSON.stringify(portableState), `${req.user.tenant_id}:${project}:portable-state`)} WHERE id=${project}`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${req.user.tenant_id},${project},${req.user.id},'workspace_imported',${project})`);
      const reusable = opened.kind==='native' && [...opened.sources.values()].some((asset:WorkspaceAsset)=>!Buffer.isBuffer(asset))
        ? (()=>{const projectionSources = new Map<string, WorkspaceAsset>(opened.sources); for (const [entry,map] of verifiedPageMaps) projectionSources.set(entry,map); const projected=nativeToReferenceStream(opened.snapshot,projectionSources,project);const profile=workspaceReviewProfile({snapshot:projected.snapshot,sources:new Map(),format:'secure-v3'} as any);return{reusableContentKnown:true,reusableCorrectionCount:profile.corrections.length,reusablePseudonymCount:profile.pseudonyms.entries.length};})()
        : opened.kind==='reference' ? (()=>{const profile=workspaceReviewProfile(opened.workspace);return{reusableContentKnown:true,reusableCorrectionCount:profile.corrections.length,reusablePseudonymCount:profile.pseudonyms.entries.length};})() : undefined;
      await rememberWorkspaceRecent(db,req.user,project,reusable?{reusable}:{snapshot:opened.snapshot,sources:opened.sources});
      await commitWorkspaceImport(db,journal);
      return { id: project, documentCount: documents.length, recognitionRequired: true, unlockRequired:portableState.unlockRequired,normalizationRequired:portableState.normalizationRequired };
    });}finally{if(journal)await cleanupWorkspaceImport(journal.id);}
}
