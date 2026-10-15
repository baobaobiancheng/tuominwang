-- A process can disappear before its JavaScript finally. Terminal transitions
-- own the same job lock as enqueue/drain and discard every obsolete generation.
CREATE FUNCTION cleanup_terminal_runtime_rule_deliveries() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.status NOT IN ('queued','running') THEN
  NEW.runtime_rule_accepting=false;
  DELETE FROM public.runtime_rule_deliveries WHERE job_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION cleanup_terminal_runtime_rule_deliveries() FROM PUBLIC;
CREATE TRIGGER cleanup_terminal_runtime_rule_deliveries
BEFORE UPDATE OF status ON jobs FOR EACH ROW
EXECUTE FUNCTION cleanup_terminal_runtime_rule_deliveries();

-- Recover terminal rows left by a previously applied 037 after process death.
UPDATE jobs SET runtime_rule_accepting=false WHERE status NOT IN ('queued','running');
DELETE FROM runtime_rule_deliveries r USING jobs j
WHERE r.job_id=j.id AND j.status NOT IN ('queued','running');
