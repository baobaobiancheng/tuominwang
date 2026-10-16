import {openPageReview,sealPageReview} from "../../packages/adapters/page-review-storage.ts";
import {getRuntimeWhitelists} from "../../packages/adapters/runtime-rule-update.ts";
import { resolveDocumentPolicy } from "../../packages/adapters/document-policy.ts";
import { readProjectPresets } from "../../packages/adapters/project-presets.ts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { id } from "../../packages/contracts/index.ts";
import { ocrCorrectionSchema, type OcrTextView } from "../../packages/contracts/ocr.ts";
import { rows, sql } from "../../packages/adapters/db.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
import { projectScope,requirePermission } from "./access.ts";
import {profileReplacementPolicies,finalizeProfileReplacements} from '../../packages/core/profile-recognition.ts';
import {applyReplacementPolicies} from '../../packages/core/replacement-policies.ts';
import {resolvePolicyMappings} from './mappings.ts';
import {unseal} from '../../packages/adapters/storage.ts';
import {recordReboundReviewProvenance} from '../../packages/adapters/review-provenance-history.ts';
import {rebindEntityCorrections,hydrateEntityCorrections} from '../../packages/adapters/entity-corrections.ts';
import {semanticEntityValue} from '../../packages/core/entity-corrections.ts';
const params = z.object({ id, page: z.coerce.number().int().nonnegative() });
function fail(message: string, statusCode = 409): never { throw Object.assign(new Error(message), { statusCode }); }
export function registerOcrRoutes(app: FastifyInstance) {
  app.get("/api/documents/:id/pages/:page/ocr-text", async req => {
    const { id: doc, page } = params.parse(req.params), { revision } = z.object({ revision: z.coerce.number().int().nonnegative() }).parse(req.query);
    return projectScope(req, { document: doc }, ["view_original"], async db => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${doc}`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== revision) fail("VERSION_CONFLICT");
      return runProcessing<OcrTextView>({ kind: "ocr-text", doc: d, page });
    });
  });
  app.put("/api/documents/:id/pages/:page/ocr-text", { bodyLimit: 2 * 1024 * 1024 }, async req => {
    const { id: doc, page } = params.parse(req.params), correction = ocrCorrectionSchema.parse(req.body);
    return projectScope(req, { document: doc }, ["view_original", "review"], async db => {
      const [scope]=await rows(db,sql`SELECT project_id FROM documents WHERE id=${doc}`);
      if(!scope)fail('NOT_FOUND',404);
      await rows(db,sql`SELECT id FROM projects WHERE id=${scope.project_id} FOR UPDATE`);
      const [d] = await rows(db, sql`SELECT d.*,p.dictionary,p.dictionary_revision,p.preset_policy,p.preset_revision FROM documents d JOIN projects p ON p.id=d.project_id WHERE d.id=${doc} FOR UPDATE OF d`);
      if (!d) fail("NOT_FOUND", 404);
      if (d.revision !== correction.revision) fail("VERSION_CONFLICT");
      if (d.state !== "review") fail(d.state === "outdated" ? "POLICY_CHANGED" : "DETECTION_INCOMPLETE");
      Object.assign(d,resolveDocumentPolicy(d,readProjectPresets({id:d.project_id,tenant_id:d.tenant_id,preset_revision:d.preset_revision,preset_policy:d.preset_policy})));
      d.runtimeWhitelists=await getRuntimeWhitelists(db,d.tenant_id,d.project_id,req.user.id,d.id);
      let result: any;
      try { result = await runProcessing({ kind: "ocr-correct", doc: d, page, correction }); }
      catch (e) { fail((e as Error).message, (e as Error).message === "OCR_TEXT_CONFLICT" ? 409 : 400); }
      if (!result.changed) return { revision: d.revision, changed: false };
      const links=result.retainedBindings as{beforeIndex:number;afterIndex:number}[];
      const rebound=rebindEntityCorrections(d,{...d,revision:d.revision+1,content_hash:result.hash,marks:result.marks},{links,mapGeometry:entry=>({page:entry.page,boxes:entry.boxes})});
      const next={...d,revision:d.revision+1,content:result.content,content_hash:result.hash,marks:result.marks,anchors:result.anchors,page_data:result.pages,entity_corrections:rebound.stored};
      if(d.presetPolicy?.profile){
        const text=unseal(result.content,`${d.tenant_id}:${d.project_id}:${d.id}`),profile=d.presetPolicy.profile.settings,policies=profileReplacementPolicies(profile,d.source_format,d.batchMode,d.documentPolicy?.configuration.exportMode);
        const semanticDoc=hydrateEntityCorrections(next),semanticValue=(mark:import('../../packages/contracts/index.ts').Mark,index:number)=>semanticEntityValue(semanticDoc,mark,text,index);let plan=applyReplacementPolicies(text,result.marks,policies,[],{semanticValue});
        if(plan.aliasRequests.length){await requirePermission(db,d.project_id,['view_mapping']);const mappings=await resolvePolicyMappings(db,next,req.user.id,plan.aliasRequests);plan=applyReplacementPolicies(text,result.marks,policies,mappings,{semanticValue});if(plan.aliasRequests.length)fail('MAPPING_MISMATCH',400);}
        result.marks=finalizeProfileReplacements(plan.marks,result.anchors,profile,d.source_format,d.batchMode,d.documentPolicy?.configuration.exportMode);
      }
      // OCR edits change text, not page pixels. Retain the old visual diagnostic
      // only when no new detector scan was requested; an actual rescan replaces it.
      if(result.visualCandidates===undefined&&d.recognition?.visual) result.recognition={...result.recognition,visual:d.recognition.visual};
      const storedPageReview=sealPageReview({...d,content_hash:result.hash},openPageReview(d),d.revision+1);
      await recordReboundReviewProvenance(db,d,{...next,marks:result.marks},{links,actorId:req.user.id,operation:'ocr-text-correction'});
      await rows(db, sql`UPDATE documents SET content=${result.content},content_hash=${result.hash},anchors=${JSON.stringify(result.anchors)}::jsonb,page_data=${JSON.stringify(result.pages)}::jsonb,marks=${JSON.stringify(result.marks)}::jsonb,recognition=${JSON.stringify(result.recognition)}::jsonb,visual_candidates=${JSON.stringify(result.visualCandidates??d.visual_candidates??[])}::jsonb,page_review=${JSON.stringify(storedPageReview)}::jsonb,entity_corrections=${rebound.stored},revision=revision+1 WHERE id=${doc}`);
      // A new content revision has no saved review snapshot. Already issued links keep their immutable artifact.
      await rows(db, sql`UPDATE attempts SET finished_at=now(),outcome='ocr_text_changed' WHERE finished_at IS NULL AND job_id IN (SELECT id FROM jobs WHERE document_id=${doc} AND status IN ('queued','running'))`);
      await rows(db, sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE document_id=${doc} AND status IN ('queued','running')`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${req.user.id},'ocr_text_corrected',${doc})`);
      return { revision: d.revision + 1, changed: true, correctionRevision: result.correctionRevision };
    });
  });
}
