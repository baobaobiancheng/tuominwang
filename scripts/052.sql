-- The original PDF detector can defer its seal stage while OCR and other
-- detectors continue. A request belongs to one ordinary running detect job.
ALTER TABLE jobs ADD COLUMN pdf_seal_pause_requested boolean NOT NULL DEFAULT false;
ALTER TABLE jobs ADD CONSTRAINT pdf_seal_pause_job_shape CHECK (
  NOT pdf_seal_pause_requested OR (kind='detect' AND collab_task_id IS NULL)
);
ALTER TABLE jobs ADD COLUMN pdf_seal_manual_checked boolean NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN pdf_seal_manual_source_hash text;
ALTER TABLE jobs ADD CONSTRAINT pdf_seal_manual_check_shape CHECK (
  (NOT pdf_seal_manual_checked AND pdf_seal_manual_source_hash IS NULL) OR
  (pdf_seal_manual_checked AND kind='export' AND collab_task_id IS NULL AND pdf_seal_manual_source_hash IS NOT NULL AND pdf_seal_manual_source_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE pdf_seal_supplements (
 request_id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES users(id),document_id uuid NOT NULL,
 detect_job_id uuid NOT NULL REFERENCES jobs(id),revision integer NOT NULL CHECK(revision>=0),source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 completed_pages integer[] NOT NULL,seal_status text NOT NULL CHECK(seal_status IN ('deferred','complete')),seal_warning text,matches jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE,
 CHECK (array_ndims(completed_pages)=1 OR cardinality(completed_pages)=0),CHECK(jsonb_typeof(matches)='array'),CHECK(seal_warning IS NULL OR length(seal_warning) BETWEEN 1 AND 80)
);
CREATE INDEX pdf_seal_supplements_source ON pdf_seal_supplements(document_id,detect_job_id,source_hash);
ALTER TABLE pdf_seal_supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_seal_supplements FORCE ROW LEVEL SECURITY;
CREATE POLICY pdf_seal_supplement_owner ON pdf_seal_supplements USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original')
) WITH CHECK (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'review') AND project_permission(project_id,'view_original')
);
GRANT SELECT,INSERT ON pdf_seal_supplements TO tmw_app;

-- An export-only project member must be able to use a completed supplement
-- without reading the detector owner's private event stream or match payload.
-- Excluded pages come only from the current saved review snapshot, never an
-- argument supplied by the caller.
CREATE FUNCTION pdf_seal_lineage_witness(target_document uuid,target_revision integer,require_complete boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
 SELECT EXISTS(
  SELECT 1 FROM documents d JOIN jobs j ON j.document_id=d.id
  JOIN review_snapshots origin ON origin.document_id=d.id AND origin.revision=j.revision
  JOIN review_snapshots current_review ON current_review.document_id=d.id AND current_review.revision=d.revision
  WHERE d.id=target_document AND d.revision=target_revision AND d.source_format='pdf'
   AND d.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND project_permission(d.project_id,'export')
   AND j.id=(SELECT newest.id FROM jobs newest WHERE newest.document_id=d.id AND newest.kind='detect' ORDER BY newest.created_at DESC,newest.id DESC LIMIT 1)
   AND j.kind='detect' AND j.collab_task_id IS NULL AND j.status='succeeded'
   AND j.tenant_id=d.tenant_id AND j.project_id=d.project_id
   AND origin.tenant_id=d.tenant_id AND origin.project_id=d.project_id
   AND origin.content_hash=d.content_hash AND origin.parse_version=d.parse_version
   AND origin.recognition=d.recognition AND origin.page_data=d.page_data
   AND current_review.page_review IS NOT DISTINCT FROM d.page_review
   AND EXISTS(SELECT 1 FROM processing_events e WHERE e.job_id=j.id AND e.generation=j.generation AND e.source_hash=d.source_hash)
   AND (SELECT count(*) FROM review_snapshots s WHERE s.document_id=d.id
       AND s.revision BETWEEN j.revision AND d.revision
       AND s.tenant_id=d.tenant_id AND s.project_id=d.project_id
       AND s.content_hash=origin.content_hash AND s.parse_version=origin.parse_version
       AND s.recognition=origin.recognition AND s.page_data=origin.page_data
       AND (s.revision=j.revision OR s.review_mode='human_review'))=d.revision-j.revision+1
   AND current_review.review_mode='human_review'
   AND (current_review.page_review IS NULL OR jsonb_typeof(current_review.page_review->'deletedPages')='array')
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(current_review.page_review->'deletedPages','[]'::jsonb)) n WHERE n::integer<0 OR n::integer>=jsonb_array_length(d.page_data))
   AND (NOT require_complete OR NOT EXISTS(
    SELECT 1 FROM generate_series(0,jsonb_array_length(d.page_data)-1) page_index
    WHERE NOT (EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(current_review.page_review->'deletedPages','[]'::jsonb)) n WHERE n::integer=page_index)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(origin.recognition->'visual'->'sealProgress'->'completedPageNumbers') n WHERE n::integer=page_index+1)
      OR EXISTS(SELECT 1 FROM pdf_seal_supplements p WHERE p.document_id=d.id AND p.detect_job_id=j.id
        AND p.tenant_id=d.tenant_id AND p.project_id=d.project_id AND p.owner_id=j.user_id AND p.source_hash=d.source_hash
        AND page_index+1=ANY(p.completed_pages)))
   ))
 )
$$;
REVOKE ALL ON FUNCTION pdf_seal_lineage_witness(uuid,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pdf_seal_lineage_witness(uuid,integer,boolean) TO tmw_app;
