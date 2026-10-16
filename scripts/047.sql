-- A detection snapshot is not a human review. Existing snapshots keep an
-- explicit legacy origin, and only a new revision may carry machine decisions.
ALTER TABLE review_snapshots
  ADD COLUMN review_mode text NOT NULL DEFAULT 'legacy',
  ADD COLUMN automatic_task_id uuid,
  ADD COLUMN automatic_actor_id uuid,
  ADD COLUMN automatic_source_revision integer,
  ADD COLUMN automatic_source_hash text,
  ADD COLUMN automatic_policy_version text,
  ADD COLUMN automatic_suppressed jsonb;

ALTER TABLE review_snapshots ADD CONSTRAINT review_snapshot_origin_shape CHECK (
  (review_mode IN ('legacy','human_review') AND automatic_task_id IS NULL
    AND automatic_actor_id IS NULL AND automatic_source_revision IS NULL
    AND automatic_source_hash IS NULL AND automatic_policy_version IS NULL
    AND automatic_suppressed IS NULL)
  OR
  (review_mode = 'automatic' AND automatic_task_id IS NOT NULL
    AND automatic_actor_id IS NOT NULL
    AND automatic_source_revision IS NOT NULL AND automatic_source_revision >= 0
    AND automatic_source_revision < revision
    AND automatic_source_hash IS NOT NULL
    AND automatic_source_hash ~ '^[a-f0-9]{64}$'
    AND automatic_policy_version IS NOT NULL
    AND length(automatic_policy_version) BETWEEN 1 AND 80
    AND automatic_suppressed IS NOT NULL
    AND jsonb_typeof(automatic_suppressed) = 'array')
);

ALTER TABLE review_snapshots ADD CONSTRAINT automatic_review_task_scope
  FOREIGN KEY (automatic_task_id, tenant_id, project_id)
  REFERENCES ai_collab_tasks (id, tenant_id, project_id);
CREATE INDEX automatic_review_task_lookup
  ON review_snapshots(automatic_task_id, document_id, revision)
  WHERE review_mode = 'automatic';

-- Owner-only task RLS cannot be queried by another authorized project member.
-- This Boolean witness reveals no task payload and accepts only the two
-- existing operations which need a machine snapshot origin.
CREATE FUNCTION automatic_review_origin_witness(target_document uuid,target_revision integer,capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
 SELECT EXISTS(
  SELECT 1 FROM review_snapshots s
  JOIN ai_collab_tasks t ON t.id=s.automatic_task_id
  JOIN jobs detected ON detected.document_id=s.document_id
    AND detected.revision=s.automatic_source_revision
    AND detected.collab_task_id=t.id AND detected.kind='detect' AND detected.status='succeeded'
  WHERE s.document_id=target_document AND s.revision=target_revision
    AND s.review_mode='automatic' AND s.tenant_id=t.tenant_id
    AND s.project_id=t.project_id AND s.automatic_actor_id=t.owner_id
    AND s.tenant_id=detected.tenant_id AND s.project_id=detected.project_id
    AND s.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND capability IN ('restore','export')
    AND project_permission(s.project_id,capability))
$$;
REVOKE ALL ON FUNCTION automatic_review_origin_witness(uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION automatic_review_origin_witness(uuid,integer,text) TO tmw_app;

-- A successful export job may be task-owned (MCP) or an ordinary project
-- export of an existing machine snapshot. In both cases the snapshot task and
-- actor, original detection and current permission must remain bound.
CREATE FUNCTION automatic_job_owner_witness(target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
 SELECT EXISTS(
  SELECT 1 FROM jobs j JOIN review_snapshots s
    ON s.document_id=j.document_id AND s.revision=j.revision
  JOIN ai_collab_tasks t ON t.id=s.automatic_task_id
  WHERE j.id=target AND j.kind='export' AND j.status='succeeded'
    AND s.review_mode='automatic' AND s.tenant_id=j.tenant_id
    AND s.project_id=j.project_id AND t.tenant_id=j.tenant_id
    AND t.project_id=j.project_id AND t.owner_id=s.automatic_actor_id
    AND (j.collab_task_id IS NULL OR (j.collab_task_id=t.id AND j.user_id=t.owner_id))
    AND j.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND automatic_review_origin_witness(j.document_id,j.revision,'export'))
$$;
REVOKE ALL ON FUNCTION automatic_job_owner_witness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION automatic_job_owner_witness(uuid) TO tmw_app;
