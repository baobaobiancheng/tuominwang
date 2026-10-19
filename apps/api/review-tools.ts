import {applySignatureDecision} from '../../packages/core/review-group-ui.ts';
import {openPageReview} from "../../packages/adapters/page-review-storage.ts";
import {sameEntity} from "../../packages/core/entity-identity.ts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id, reviewSchema, REVIEW_BODY_BYTES, MAX_MARKS, markSchema, type Mark } from "../../packages/contracts/index.ts";
import { scoped, rows, sql } from "../../packages/adapters/db.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
import { mappingsForMarks,resolvePolicyMappings } from "./mappings.ts";
import { saveReview } from "./reviews.ts";
import { isDeepStrictEqual } from "node:util";
import { projectScope } from "./access.ts";
import {isWordFormat} from '../../packages/core/document-format.ts';
import {defaultProfile,profileForFormat} from '../../packages/core/presets.ts';
import {sourceModeFlags,sourceNormalizeMode,type SourceMode} from '../../packages/core/reference/batch-mode-source.js';
import {documentPolicySchema} from '../../packages/contracts/document-policy.ts';
import {resolveDocumentPolicy} from '../../packages/adapters/document-policy.ts';
import {readUnifiedAliasState} from '../../packages/adapters/unified-aliases.ts';
import {seal,unseal,hash} from '../../packages/adapters/storage.ts';
import {hydrateEntityCorrections} from '../../packages/adapters/entity-corrections.ts';
import {semanticEntityValue} from '../../packages/core/entity-corrections.ts';
import {canonicalRuleEntityType} from '../../packages/core/presets.ts';
import {sourceSelectiveEntityType} from '../../packages/core/reference/workspace-renderer-source.js';
import {applyReplacementPolicies} from '../../packages/core/replacement-policies.ts';
import {profileReplacementPolicies,finalizeProfileReplacements} from '../../packages/core/profile-recognition.ts';
import {requirePermission} from './access.ts';
import {getProjectPresetPolicy} from './presets.ts';
import { reviewMarks } from "../../packages/core/redaction.ts";
import {validateEntityGeometryPolicy}from'../../packages/adapters/entity-geometry.ts';
import{readReviewProvenance,readReviewProvenanceArchive}from'../../packages/adapters/review-provenance.ts';import{addReviewEntityHints,type ReviewEntityHint}from'../../packages/core/review-entity-slots.ts';

function fail(message: string, statusCode = 409): never { throw Object.assign(new Error(message), { statusCode }); }
export function registerReviewTools(app: FastifyInstance) {
  const modeBatchSchema=z.object({documents:z.array(z.object({id,revision:z.number().int().nonnegative()}).strict()).min(1),scope:z.enum(['docx','markdown','visual']),mode:z.enum(['default_star','full_star','default_pseudonym','custom_pseudonym','selective_pseudonym']),confirmOverride:z.boolean().default(false)}).strict();
  for(const action of ['preview','apply'] as const)app.post(`/api/projects/:id/review-mode-batch/${action}`,async req=>{
    const project=id.parse((req.params as any).id),input=modeBatchSchema.parse(req.body),ids=input.documents.map(item=>item.id);
    if(new Set(ids).size!==ids.length)fail('INVALID_INPUT',400);
    return projectScope(req,{project},['view_original','review'],async db=>{
      const [p]=await rows(db,sql`SELECT * FROM projects WHERE id=${project} FOR UPDATE`);
      if(!p)fail('NOT_FOUND',404);
      const imported=p.portable_state?JSON.parse(unseal(p.portable_state,`${req.user.tenant_id}:${project}:portable-state`)):null;
      const docs=await rows(db,sql`SELECT * FROM documents WHERE project_id=${project} AND id IN (${sql.join(ids.map(value=>sql`${value}`),sql`,`)}) ORDER BY id FOR UPDATE`);
      if(docs.length!==ids.length)fail('NOT_FOUND',404);
      const versions=new Map(input.documents.map(item=>[item.id,item.revision]));
      if(docs.some(d=>d.revision!==versions.get(d.id)))fail('VERSION_CONFLICT');
      const aliasState=await readUnifiedAliasState(db,req.user.tenant_id,project),projectPolicy=getProjectPresetPolicy(p);
      const result:{id:string;revision:number;previousMode:SourceMode;mode:SourceMode;status:'apply'|'unchanged'|'scope-skipped'|'selective-skipped'}[]=[];
      const selected:{doc:any;prior:ReturnType<typeof resolveDocumentPolicy>;mode:SourceMode}[]=[];
      for(const d of docs){
        const format=String(d.source_format),kind=isWordFormat(format)?'docx':format==='pdf'||['png','jpg','jpeg'].includes(format)?'visual':['md','markdown'].includes(format)?'markdown':'other',prior=resolveDocumentPolicy(d,projectPolicy);
        const before=(prior.documentPolicy?.configuration.exportMode??profileForFormat(prior.presetPolicy.profile?.settings??defaultProfile(),format,prior.batchMode).defaultMode) as SourceMode;
        const normalized=sourceNormalizeMode(input.mode,{visual:kind==='visual'});
        let status:typeof result[number]['status']='apply';
        if(kind!==input.scope)status='scope-skipped';
        else if(sourceModeFlags(input.mode).selective){
          // at2 creates a keyed entry for an admitted entity even when its action is partial_star/mask.
          const currentText=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);
          if(hash(currentText)!==d.content_hash)fail('SOURCE_MISMATCH');
          const currentKey=(d.marks as Mark[]).some(mark=>mark.decision!=='ignore'&&sourceSelectiveEntityType(mark.rawEntityType??canonicalRuleEntityType(mark.kind))!=='other'&&currentText.slice(mark.start,mark.end).trim().length>0);
          const registered=(aliasState.frame?.state.customConsumers??[]).some(entry=>entry.documentIds.includes(d.id));
          const oldId=Object.entries(imported?.documentIdMap??{}).find(([,current])=>current===d.id)?.[0];
          const old=oldId&&imported?.importedSnapshot?.documents?.find((entry:any)=>entry.id===oldId);
          const sourceBound=oldId&&imported?.referenceSourceHashes?.[oldId]===d.source_hash;
          const restored=sourceBound&&(await rows(db,sql`SELECT id FROM audit WHERE project_id=${project} AND object_id=${d.id} AND event='portable_draft_restored' LIMIT 1`)).length>0;
          const importedKey=restored&&old?.review?.pseudonymStyle==='selective'&&Array.isArray(old.review.pseudonymEntries)&&old.review.pseudonymEntries.some((entry:any)=>typeof entry?.key==='string'&&entry.key.length>0);
          let retainedKey=false;
          if(before==='selective_pseudonym'&&!currentKey&&!registered&&!importedKey){
            // Ei2 retains previously generated keys after their occurrence count becomes zero.
            // Limit history to this document's latest successful detect job and matching sealed source/recognition policy.
            const [detect]=await rows(db,sql`SELECT revision FROM jobs WHERE document_id=${d.id} AND kind='detect' AND status='succeeded' ORDER BY revision DESC,created_at DESC,id DESC LIMIT 1`);
            if(detect){
              const snapshots=await rows(db,sql`SELECT marks,recognition FROM review_snapshots WHERE document_id=${d.id} AND content_hash=${d.content_hash} AND parse_version=${d.parse_version} AND revision>=${detect.revision} ORDER BY revision DESC`);
              const stable=['rules','dictionaryRevision','presetRevision','documentPolicyRevision','documentType','ner'] as const;
              retainedKey=snapshots.some(snapshot=>stable.every(key=>snapshot.recognition?.[key]===d.recognition?.[key])&&(snapshot.marks as Mark[]).some(mark=>mark.decision!=='ignore'&&sourceSelectiveEntityType(mark.rawEntityType??canonicalRuleEntityType(mark.kind))!=='other'&&currentText.slice(mark.start,mark.end).trim().length>0));
            }
          }
          if(before!=='selective_pseudonym'||!currentKey&&!registered&&!importedKey&&!retainedKey)status='selective-skipped';
        }
        if(status==='apply'&&before===normalized)status='unchanged';
        result.push({id:d.id,revision:d.revision,previousMode:before,mode:normalized,status});
        if(status==='apply'||status==='unchanged')selected.push({doc:d,prior,mode:normalized});
      }
      if(action==='preview')return {documents:result};
      if(result.some(item=>item.status==='apply')&&!input.confirmOverride)fail('MODE_OVERRIDE_CONFIRMATION_REQUIRED');
      for(const item of selected){
        const d=item.doc;
        if(d.state!=='review')fail(d.state==='outdated'?'POLICY_CHANGED':'DETECTION_INCOMPLETE');
        const old=item.prior.documentPolicy,profile=structuredClone(old?.profile??item.prior.presetPolicy.profile?.settings??defaultProfile()),config={...(old?.configuration??{}),exportMode:item.mode};
        const key=isWordFormat(d.source_format)?'docx':d.source_format==='pdf'?'pdf':['png','jpg','jpeg'].includes(d.source_format)?'image':'markdown';
        if(key==='pdf'||key==='image'){
          profile[key].defaultMode=item.mode as Exclude<SourceMode,'full_star'>;
          profile.batch[`${key}DefaultMode`]=item.mode as Exclude<SourceMode,'full_star'>;
        }else{
          profile[key].defaultMode=item.mode;
          profile.batch[`${key}DefaultMode`]=item.mode;
        }
        const nextRevision=d.document_policy_revision+1;
        const policy=documentPolicySchema.parse({revision:nextRevision,profile,...old?.baseProfile?{baseProfile:old.baseProfile}:{},ruleset:item.prior.presetPolicy.ruleset?.settings??null,configuration:config,batch:item.prior.batchMode});
        const sealed=seal(JSON.stringify(policy),`${d.tenant_id}:${d.project_id}:${d.id}:document-policy`);
        const text=unseal(d.content,`${d.tenant_id}:${d.project_id}:${d.id}`);
        if(hash(text)!==d.content_hash)fail('SOURCE_MISMATCH');
        const semanticDoc=hydrateEntityCorrections(d),policies=profileReplacementPolicies(profile,d.source_format,item.prior.batchMode,item.mode);
        const semanticValue=(mark:Mark,index:number)=>semanticEntityValue(semanticDoc,mark,text,index);
        let replacements=applyReplacementPolicies(text,d.marks,policies,[],{semanticValue});
        if(replacements.aliasRequests.length){
          await requirePermission(db,project,['view_mapping']);
          const mappings=await resolvePolicyMappings(db,{...d,document_policy:sealed,document_policy_revision:nextRevision},req.user.id,replacements.aliasRequests);
          replacements=applyReplacementPolicies(text,d.marks,policies,mappings,{semanticValue});
          if(replacements.aliasRequests.length)fail('MAPPING_MISMATCH',400);
        }
        const nextMarks=finalizeProfileReplacements(replacements.marks,d.anchors,profile,d.source_format,item.prior.batchMode,item.mode);
        await rows(db,sql`UPDATE documents SET document_policy=${sealed},document_policy_revision=${nextRevision} WHERE id=${d.id}`);
        const saved=await saveReview(db,req.user.id,{...d,document_policy:sealed,document_policy_revision:nextRevision},nextMarks,15000);
        result.find(row=>row.id===d.id)!.revision=saved.revision;
      }
      return {documents:result};
    });
  });
  const batchSchema = z.object({ documents: z.array(z.object({ id, revision: z.number().int().nonnegative() })).min(1).max(20), kind: markSchema.shape.kind.optional(), rawEntityType:markSchema.shape.rawEntityType, whitelist: z.boolean().default(false), decision: z.enum(["redact", "ignore"]).default("redact") });
  for (const mode of ["preview", "apply", "undo"] as const) app.post(`/api/projects/:id/review-batch/${mode}`, async req => {
    const project = id.parse((req.params as any).id), input = batchSchema.parse(req.body), ids = input.documents.map(d => d.id);
    if(input.rawEntityType!==undefined&&input.kind!=="自定义")fail("INVALID_ENTITY_TYPE",400);
    if (new Set(ids).size !== ids.length) fail("INVALID_INPUT", 400);
    return projectScope(req, { project }, ["review"], async db => {
      const [p] = await rows(db, sql`SELECT id FROM projects WHERE id=${project} FOR UPDATE`);
      if (!p) fail("NOT_FOUND", 404);
      const metadata = await rows(db, sql`SELECT id,revision,state,length(content)+length(marks::text) AS stored_size FROM documents WHERE project_id=${project} AND id IN (${sql.join(ids.map(v => sql`${v}`), sql`,`)}) ORDER BY id FOR UPDATE`);
      if (metadata.length !== ids.length) fail("NOT_FOUND", 404);
      if (metadata.some(d => input.documents.find(v => v.id === d.id)!.revision !== d.revision)) fail("VERSION_CONFLICT");
      if (metadata.some(d => d.state !== "review")) fail("DETECTION_INCOMPLETE");
      if (metadata.reduce((n, d) => n + d.stored_size, 0) > 80 * 1024 * 1024) fail("BULK_REVIEW_LIMIT", 400);
      const docs = await rows(db, sql`SELECT * FROM documents WHERE project_id=${project} AND id IN (${sql.join(ids.map(v => sql`${v}`), sql`,`)}) ORDER BY id`);
      const deadline = Date.now() + 60000, result: { id: string; revision: number; affected: number }[] = [];
      for (const d of docs) {
        const provenance=await readReviewProvenance(db,d),current=addReviewEntityHints(provenance,d.marks);
        const selected=new Set(current.flatMap((m,index)=>m.decision === "pending" && (!input.kind || sameEntity(m,{kind:input.kind,rawEntityType:input.rawEntityType})) && (!input.whitelist || m.sources?.some(s => s.code === "project-whitelist"))?[index]:[]));
        let next: ReviewEntityHint[]=applySignatureDecision(current,selected,input.decision),affected=next.filter((m,index)=>m.decision!==current[index].decision).length;
        if (mode === "undo") {
          const [previous] = await rows(db, sql`SELECT * FROM review_snapshots WHERE document_id=${d.id} AND revision=${d.revision - 1}`);
          if (!previous || previous.content_hash !== d.content_hash || previous.parse_version !== d.parse_version || !isDeepStrictEqual(previous.recognition, d.recognition) || !isDeepStrictEqual(openPageReview({...d,revision:previous.revision,content_hash:previous.content_hash},previous.page_review),openPageReview(d)) || !isDeepStrictEqual(previous.page_data, d.page_data)) fail("SNAPSHOT_MISMATCH");
          const historical=await readReviewProvenanceArchive(db,d,previous),activeIds=new Set(provenance.entries.filter(e=>e.active).map(e=>e.id)),priorByIndex=new Map(historical.frame.entries.filter(e=>e.active).map(e=>[e.markIndex,e.id]));
          next = previous.marks.map((mark:Mark,index:number)=>{const id=priorByIndex.get(index);return{...mark,...id&&activeIds.has(id)?{reviewEntityId:id}:{}};}); affected = next.length;
        }
        if (mode === "preview") { result.push({ id: d.id, revision: d.revision, affected }); continue; }
        if (Date.now() >= deadline) fail("PROCESSING_TIMEOUT", 400);
        // A conflict or invalid mark anywhere rolls the whole transaction back; no partial batch is published.
        const saved = await saveReview(db, req.user.id, d, next, Math.min(15000, deadline - Date.now()), mode === "undo");
        result.push({ ...saved, affected });
      }
      return { documents: result };
    });
  });
  app.post("/api/documents/:id/preview", { bodyLimit: REVIEW_BODY_BYTES }, async req => {
    const doc = id.parse((req.params as any).id), input = reviewSchema.extend({ offset: z.number().int().nonnegative().default(0) }).parse(req.body);
    return projectScope(req, { document: doc }, ["view_original"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT");
      if (d.state !== "review") fail(d.state === "outdated" ? "POLICY_CHANGED" : "DETECTION_INCOMPLETE");
      const mappings = await mappingsForMarks(db, d, input.marks, req.user.id);
      try { const policy=await validateEntityGeometryPolicy(db,d,input.marks,input.pageReview??openPageReview(d));const [project]=await rows(db,sql`SELECT id,tenant_id,preset_policy,preset_revision FROM projects WHERE id=${d.project_id}`);if(!project)fail('NOT_FOUND',404);return { revision: d.revision, ...await runProcessing<object>({ kind: "preview", doc: {...d,...resolveDocumentPolicy(d,getProjectPresetPolicy(project)),page_review:policy}, marks: input.marks, mappings, offset: input.offset }) }; }
      catch (e) { fail((e as Error).message, 400); }
    });
  });
  app.post("/api/documents/:id/known-entities", { bodyLimit: REVIEW_BODY_BYTES }, async req => {
    const doc = id.parse((req.params as any).id), input = reviewSchema.parse(req.body);
    return projectScope(req, { document: doc }, ["view_original", "review"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT");
      if (d.state !== "review") fail(d.state === "outdated" ? "POLICY_CHANGED" : "DETECTION_INCOMPLETE");
      const marks = reviewMarks(d.marks, input.marks), mappings = await mappingsForMarks(db, d, marks, req.user.id);
      try { return { revision: d.revision, ...await runProcessing<object>({ kind: "known-entities", doc: d, marks, mappings }) }; }
      catch (e) { fail((e as Error).message, 400); }
    });
  });
  // POST keeps sensitive search terms out of URL/history/access logs.
  app.post("/api/documents/:id/search", { bodyLimit: REVIEW_BODY_BYTES }, async req => {
    const doc = id.parse((req.params as any).id), input = z.object({ revision: z.number().int().nonnegative(), query: z.string().min(1).max(200).refine(v => v.isWellFormed()), from: z.number().int().nonnegative().default(0), scope: z.enum(["all", "inside", "outside"]).default("all"), spans: z.array(markSchema.pick({ start: true, end: true, decision: true })).max(MAX_MARKS).optional() }).parse(req.body);
    return projectScope(req, { document: doc }, ["view_original"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== input.revision) fail("VERSION_CONFLICT");
      try { return { revision: d.revision, ...await runProcessing<object>({ kind: "search", doc: d, query: input.query, offset: input.from, searchScope: input.scope, searchSpans: input.spans ?? d.marks }) }; }
      catch (e) { fail((e as Error).message, 400); }
    });
  });
}
