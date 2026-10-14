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
  const marks = trustedSnapshot ? incoming : reviewMarks(d.marks, incoming);
  if (!trustedSnapshot && marks.some(m => m.replacement?.mode === "alias" && !(d.marks as Mark[]).some(old => old.start === m.start && old.end === m.end && sameEntity(old,m) && isDeepStrictEqual(old.replacement, m.replacement)))) await requirePermission(db, d.project_id, ["view_mapping"]);
  const mappings = await mappingsForMarks(db, d, marks, user);
  const pagePolicy = pageReview ?? openPageReview(d),storedPagePolicy=sealPageReview(d,pagePolicy,d.revision+1);
  try { await runProcessing({ kind: "review", doc: { ...d, page_review: pagePolicy }, marks, mappings }, { timeoutMs }); }
  catch (e) { throw Object.assign(e as Error, { statusCode: 400 }); }
  await rows(db, sql`UPDATE documents SET marks=${JSON.stringify(marks)}::jsonb,page_review=${JSON.stringify(storedPagePolicy)}::jsonb,revision=revision+1,state='review' WHERE id=${d.id}`);
  await rows(db, sql`INSERT INTO review_snapshots(document_id,revision,tenant_id,project_id,content_hash,parse_version,marks,rule_version,recognition,page_review,page_data)
    VALUES(${d.id},${d.revision + 1},${d.tenant_id},${d.project_id},${d.content_hash},${d.parse_version},${JSON.stringify(marks)}::jsonb,${d.recognition?.rules ?? "rules-v1"},${JSON.stringify(d.recognition ?? {})}::jsonb,${JSON.stringify(storedPagePolicy)}::jsonb,${JSON.stringify(d.page_data ?? [])}::jsonb)`);
  await rows(db,sql`DELETE FROM workspace_recoveries WHERE document_id=${d.id} AND user_id=${user}`);
  await rows(db, sql`UPDATE attempts SET finished_at=now(),outcome='review_changed' WHERE finished_at IS NULL AND job_id IN (SELECT id FROM jobs WHERE document_id=${d.id} AND status IN ('queued','running'))`);
  await rows(db, sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE document_id=${d.id} AND status IN ('queued','running')`);
  await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${d.tenant_id},${d.project_id},${user},'review_saved',${d.id})`);
  return { id: d.id, revision: d.revision + 1 };
}
