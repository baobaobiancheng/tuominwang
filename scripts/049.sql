-- The PDF selected-priority action swaps complete queue tuples. The nullable
-- tie-break retains the original job UUID order for every untouched job.
ALTER TABLE jobs ADD COLUMN pdf_ocr_slot_id uuid;
ALTER TABLE jobs ADD COLUMN pdf_ocr_priority_request_id uuid;
ALTER TABLE jobs ADD COLUMN pdf_ocr_priority_selected_job_id uuid REFERENCES jobs(id);
ALTER TABLE jobs ADD COLUMN pdf_ocr_priority_continuation_job_id uuid REFERENCES jobs(id);
ALTER TABLE jobs ADD COLUMN pdf_ocr_priority_source_hash text CHECK(pdf_ocr_priority_source_hash IS NULL OR pdf_ocr_priority_source_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE jobs ADD COLUMN pdf_ocr_priority_content_hash text CHECK(pdf_ocr_priority_content_hash IS NULL OR pdf_ocr_priority_content_hash ~ '^[a-f0-9]{64}$');
CREATE UNIQUE INDEX jobs_pdf_ocr_priority_request ON jobs(tenant_id,project_id,user_id,pdf_ocr_priority_request_id) WHERE pdf_ocr_priority_request_id IS NOT NULL;

-- A priority preemption is another durable PDF pause. Keep the 048 identity
-- shape checks; permit only its second verified pause reason.
ALTER TABLE jobs DROP CONSTRAINT pdf_ocr_pause_binding_shape;
ALTER TABLE jobs ADD CONSTRAINT pdf_ocr_pause_binding_shape CHECK (
  pdf_ocr_pause_binding IS NULL OR (
    kind='detect' AND status='cancelled' AND error_code IN ('PDF_OCR_PAUSED','PDF_OCR_PRIORITY_PREEMPTED')
    AND jsonb_typeof(pdf_ocr_pause_binding)='object'
    AND (pdf_ocr_pause_binding->>'sourceId') ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    AND (pdf_ocr_pause_binding->>'sourceHash') ~ '^[a-f0-9]{64}$'
    AND (pdf_ocr_pause_binding->>'contentHash') ~ '^[a-f0-9]{64}$'
    AND (pdf_ocr_pause_binding->>'processingHash') ~ '^[a-f0-9]{64}$'
    AND (pdf_ocr_pause_binding->>'rotationPlanHash') ~ '^[a-f0-9]{64}$'
    AND (pdf_ocr_pause_binding->>'parserFingerprint') ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(pdf_ocr_pause_binding->'parseVersion')='number'
    AND (pdf_ocr_pause_binding->>'parseVersion')::integer>=1
  ) IS TRUE
);

CREATE OR REPLACE FUNCTION claim_job() RETURNS SETOF jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE picked jobs;
BEGIN
  IF NOT pg_try_advisory_xact_lock(7843,1) THEN RETURN; END IF;
  UPDATE attempts SET outcome='permission_revoked',finished_at=now() WHERE finished_at IS NULL AND job_id IN(SELECT id FROM jobs WHERE status IN ('queued','running') AND NOT job_authorized(id));
  UPDATE jobs SET status='cancelled',error_code='PERMISSION_REVOKED',lease_until=NULL WHERE status IN ('queued','running') AND NOT job_authorized(id);
  UPDATE attempts SET outcome='lease_expired',finished_at=now() WHERE finished_at IS NULL AND job_id IN(SELECT id FROM jobs WHERE status='running' AND lease_until<now());
  UPDATE jobs SET status='failed',error_code='RETRY_EXHAUSTED',lease_until=NULL WHERE attempt>=3 AND (status='queued' OR(status='running' AND lease_until<now()));
  IF EXISTS(SELECT 1 FROM jobs WHERE status='running' AND lease_until>=now()) THEN RETURN; END IF;
  SELECT * INTO picked FROM jobs WHERE attempt<3 AND ((status='queued' AND available_at<=now()) OR(status='running' AND lease_until<now())) ORDER BY available_at,COALESCE(pdf_ocr_slot_id,id) FOR UPDATE SKIP LOCKED LIMIT 1;
  IF picked.id IS NULL THEN RETURN; END IF;
  UPDATE jobs SET status='running',generation=generation+1,attempt=attempt+1,lease_until=now()+interval '30 seconds',runtime_rule_accepting=true WHERE id=picked.id RETURNING * INTO picked;
  DELETE FROM runtime_rule_deliveries WHERE job_id=picked.id AND generation<>picked.generation;
  INSERT INTO attempts(job_id,generation) VALUES(picked.id,picked.generation);
  RETURN NEXT picked;
END $$;

