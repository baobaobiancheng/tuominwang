ALTER TABLE jobs ADD COLUMN runtime_rule_accepting boolean NOT NULL DEFAULT true;
CREATE TABLE runtime_rule_deliveries(
 delivery_seq bigint GENERATED ALWAYS AS IDENTITY,id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES users(id),document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
 job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,generation integer NOT NULL,revision integer NOT NULL,
 source_hash text,content_hash text NOT NULL,payload text NOT NULL,payload_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX runtime_rule_deliveries_job ON runtime_rule_deliveries(job_id,generation,delivery_seq);
ALTER TABLE runtime_rule_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_rule_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY runtime_rule_deliveries_owner ON runtime_rule_deliveries FOR ALL USING(
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'review') AND project_permission(project_id,'view_original')
) WITH CHECK(
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'review') AND project_permission(project_id,'view_original')
);
GRANT SELECT,INSERT,DELETE ON runtime_rule_deliveries TO tmw_app;
GRANT USAGE,SELECT ON SEQUENCE runtime_rule_deliveries_delivery_seq_seq TO tmw_app;

-- A new claim is a fresh source engine, never a reopened old rule window.
CREATE OR REPLACE FUNCTION claim_job() RETURNS SETOF jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE picked jobs;
BEGIN
  IF NOT pg_try_advisory_xact_lock(7843,1) THEN RETURN; END IF;
  UPDATE attempts SET outcome='permission_revoked',finished_at=now() WHERE finished_at IS NULL AND job_id IN(SELECT id FROM jobs WHERE status IN ('queued','running') AND NOT job_authorized(id));
  UPDATE jobs SET status='cancelled',error_code='PERMISSION_REVOKED',lease_until=NULL WHERE status IN ('queued','running') AND NOT job_authorized(id);
  UPDATE attempts SET outcome='lease_expired',finished_at=now() WHERE finished_at IS NULL AND job_id IN(SELECT id FROM jobs WHERE status='running' AND lease_until<now());
  UPDATE jobs SET status='failed',error_code='RETRY_EXHAUSTED',lease_until=NULL WHERE attempt>=3 AND (status='queued' OR(status='running' AND lease_until<now()));
  IF EXISTS(SELECT 1 FROM jobs WHERE status='running' AND lease_until>=now()) THEN RETURN; END IF;
  SELECT * INTO picked FROM jobs WHERE attempt<3 AND ((status='queued' AND available_at<=now()) OR(status='running' AND lease_until<now())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF picked.id IS NULL THEN RETURN; END IF;
  UPDATE jobs SET status='running',generation=generation+1,attempt=attempt+1,lease_until=now()+interval '30 seconds',runtime_rule_accepting=true WHERE id=picked.id RETURNING * INTO picked;
  DELETE FROM runtime_rule_deliveries WHERE job_id=picked.id AND generation<>picked.generation;
  INSERT INTO attempts(job_id,generation) VALUES(picked.id,picked.generation);
  RETURN NEXT picked;
END $$;

-- Cleanup remains possible after project permission revocation. No payload is
-- returned and callers cannot select another authenticated owner's task.
CREATE FUNCTION discard_owned_runtime_rule_deliveries(p_job uuid,p_generation integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target record; removed integer;
BEGIN
 SELECT id,generation INTO target FROM public.jobs WHERE id=p_job
 AND user_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 IF target.generation=p_generation THEN UPDATE public.jobs SET runtime_rule_accepting=false WHERE id=p_job; END IF;
 DELETE FROM public.runtime_rule_deliveries WHERE job_id=p_job AND generation=p_generation;
 GET DIAGNOSTICS removed=ROW_COUNT; RETURN removed;
END $$;
REVOKE ALL ON FUNCTION discard_owned_runtime_rule_deliveries(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION discard_owned_runtime_rule_deliveries(uuid,integer) TO tmw_app;
