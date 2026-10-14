-- Serialize claims across worker processes; do not start another live heavy job.
CREATE OR REPLACE FUNCTION claim_job() RETURNS SETOF jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE picked jobs;
BEGIN
  IF NOT pg_try_advisory_xact_lock(7843,1) THEN RETURN; END IF;
  UPDATE attempts SET outcome='lease_expired',finished_at=now() WHERE finished_at IS NULL AND job_id IN(SELECT id FROM jobs WHERE status='running' AND lease_until<now());
  UPDATE jobs SET status='failed',error_code='RETRY_EXHAUSTED',lease_until=NULL WHERE attempt>=3 AND (status='queued' OR(status='running' AND lease_until<now()));
  IF EXISTS(SELECT 1 FROM jobs WHERE status='running' AND lease_until>=now()) THEN RETURN; END IF;
  SELECT * INTO picked FROM jobs WHERE attempt<3 AND ((status='queued' AND available_at<=now()) OR(status='running' AND lease_until<now())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF picked.id IS NULL THEN RETURN; END IF;
  UPDATE jobs SET status='running',generation=generation+1,attempt=attempt+1,lease_until=now()+interval '30 seconds' WHERE id=picked.id RETURNING * INTO picked;
  INSERT INTO attempts(job_id,generation) VALUES(picked.id,picked.generation);
  RETURN NEXT picked;
END $$;
