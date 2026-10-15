import {reviewEntityBirth,reviewEntityBirths}from'../../packages/core/review-entity-birth.ts';
import {readReviewProvenance,sealNextReviewProvenance} from '../../packages/adapters/review-provenance.ts';
import {matchReviewEntitySlots} from '../../packages/core/review-entity-slots.ts';
import {rebindEntityCorrections} from '../../packages/adapters/entity-corrections.ts';
import {validateEntityGeometryPolicy,entityGeometryChanges}from'../../packages/adapters/entity-geometry.ts';
import {appendGeometryProvenance}from'../../packages/core/review-geometry-provenance.ts';
import {openPageReview,sealPageReview} from "../../packages/adapters/page-review-storage.ts";
import {sameEntity} from "../../packages/core/entity-identity.ts";
import { rows, sql, type DB } from "../../packages/adapters/db.ts";
import { runProcessing } from "../../packages/adapters/processing.ts";
import { reviewMarks } from "../../packages/core/redaction.ts";
import { mappingsForMarks } from "./mappings.ts";
import type { Mark, PageReview } from "../../packages/contracts/index.ts";
import { requirePermission } from "./access.ts";
import { isDeepStrictEqual } from "node:util";

// Caller holds the document row lock. Both single-document and project review use the same validation/snapshot path.
export async function saveReview(db: DB, user: string, d: any, incoming: Mark[], timeoutMs?: number, trustedSnapshot = false, pageReview?: PageReview) {
  if (d.state !== "review") throw Object.assign(new Error(d.state === "outdated" ? "POLICY_CHANGED" : "DETECTION_INCOMPLETE"), { statusCode: 409 });
  const provenance=await readReviewProvenance(db,d),matched=matchReviewEntitySlots(provenance,d.marks,incoming),births=reviewEntityBirths(provenance,d.marks),priorIndices=new Map(matched.links.map(link=>[link.afterIndex,link.beforeIndex]));
  const supplied=trustedSnapshot ? matched.marks : reviewMarks(d.marks, matched.marks);
  const marks=supplied.map((mark,index)=>{const beforeIndex=priorIndices.get(index),birth=beforeIndex!==undefined?births.get(beforeIndex)!:trustedSnapshot?reviewEntityBirth(mark,matched.priorByAfter.get(index)):true,{hiddenTypeWasUserAdded:_origin,userAdded:_birth,...value}=mark;return{...value,userAdded:birth,...mark.hiddenByType?{hiddenTypeWasUserAdded:birth}:{}};});
  if (!trustedSnapshot && marks.some(m => m.replacement?.mode === "alias" && !(d.marks as Mark[]).some(old => old.start === m.start && old.end === m.end && sameEntity(old,m) && isDeepStrictEqual(old.replacement, m.replacement)))) await requirePermission(db, d.project_id, ["view_mapping"]);
  const rebound=rebindEntityCorrections(d,{...d,revision:d.revision+1,marks},{links:matched.links,mapGeometry:entry=>({page:entry.page,boxes:entry.boxes})});
  const reviewDoc={...d,revision:d.revision+1,marks,entity_corrections:rebound.stored};
  const mappings = await mappingsForMarks(db, reviewDoc, marks, user);
  const oldPagePolicy=openPageReview(d),pagePolicy=await validateEntityGeometryPolicy(db,d,marks,pageReview??oldPagePolicy,matched.links,d.revision+1,user),storedPagePolicy=sealPageReview(d,pagePolicy,d.revision+1);
  try { await runProcessing({ kind: "review", doc: { ...reviewDoc, page_review: pagePolicy }, marks, mappings }, { timeoutMs }); }
  catch (e) { throw Object.assign(e as Error, { statusCode: 400 }); }
  const geometryChanges=await entityGeometryChanges(db,d,oldPagePolicy,pagePolicy,marks,matched.links,user),entityMetadata=await sealNextReviewProvenance(db,d,marks,user,matched.links,frame=>appendGeometryProvenance(frame,geometryChanges));
  await rows(db, sql`UPDATE documents SET marks=${JSON.stringify(marks)}::jsonb,page_review=${JSON.stringify(storedPagePolicy)}::jsonb,entity_corrections=${rebound.stored},revision=revision+1,state='review' WHERE id=${d.id}`);
  await rows(db, sql`INSERT INTO review_snapshots(document_id,revision,tenant_id,project_id,content_hash,parse_version,marks,rule_version,recognition,page_review,page_data,entity_metadata)
    VALUES(${d.id},${d.revision + 1},${d.tenant_id},${d.project_id},${d.content_hash},${d.parse_version},${JSON.stringify(marks)}::jsonb,${d.recognition?.rules ?? "rules-v1"},${JSON.stringify(d.recognition ?? {})}::jsonb,${JSON.stringify(storedPagePolicy)}::jsonb,${JSON.stringify(d.page_data ?? [])}::jsonb,${entityMetadata})`);
  await rows(db,sql`DELETE FROM workspace_recoveries WHERE document_id=${d.id} AND user_id=${user}`);
  await rows(db, sql`UPDATE attempts SET finished_at=now(),outcome='review_changed' WHERE finished_at IS NULL AND job_id IN (SELECT id FROM jobs WHERE document_id=${d.id} AND status IN ('queued','running'))`);
  await rows(db, sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE document_id=${d.id} AND status IN ('queued','running')`);
  await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${user},'review_saved',${d.id})`);
  return { id: d.id, revision: d.revision + 1 };
}
