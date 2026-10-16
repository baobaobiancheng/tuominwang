-- MCP task diagnostics have their own bounded storage so task revisions and
-- business audit history remain untouched.
CREATE TABLE ai_collab_diagnostic_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL,
 project_id uuid NOT NULL,
 owner_id uuid NOT NULL,
 task_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=4096),
 FOREIGN KEY(task_id,tenant_id,project_id) REFERENCES ai_collab_tasks(id,tenant_id,project_id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,tenant_id) REFERENCES users(id,tenant_id)
);
CREATE INDEX ai_collab_diagnostic_expiry ON ai_collab_diagnostic_events(created_at,id);
CREATE INDEX ai_collab_diagnostic_task_time ON ai_collab_diagnostic_events(task_id,created_at,id);
CREATE INDEX ai_collab_diagnostic_owner_time ON ai_collab_diagnostic_events(tenant_id,owner_id,created_at,id);
ALTER TABLE ai_collab_diagnostic_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_collab_diagnostic_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_collab_diagnostic_owner ON ai_collab_diagnostic_events
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
   AND project_permission(project_id,'view_original'))
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
   AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
   AND project_permission(project_id,'view_original'));
GRANT SELECT,INSERT ON ai_collab_diagnostic_events TO tmw_app;
GRANT USAGE,SELECT ON SEQUENCE ai_collab_diagnostic_events_id_seq TO tmw_app;

-- Runs only after an insert. It cannot delete ordinary audit events or task
-- snapshots. The attachment ZIP is built in memory and is never stored here.
CREATE FUNCTION trim_ai_collab_diagnostic_events() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 DELETE FROM ai_collab_diagnostic_events WHERE created_at < now()-interval '30 days';
 DELETE FROM ai_collab_diagnostic_events WHERE id IN (
   SELECT id FROM ai_collab_diagnostic_events WHERE task_id=NEW.task_id
   ORDER BY created_at DESC,id DESC OFFSET 3000
 );
 DELETE FROM ai_collab_diagnostic_events WHERE id IN (
   SELECT id FROM (
     SELECT id,sum(octet_length(payload::text)) OVER (
       ORDER BY created_at DESC,id DESC
     ) AS accumulated_bytes
     FROM ai_collab_diagnostic_events
     WHERE tenant_id=NEW.tenant_id AND owner_id=NEW.owner_id
   ) owner_events WHERE accumulated_bytes>100*1024*1024
 );
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trim_ai_collab_diagnostic_events() FROM PUBLIC;
CREATE TRIGGER ai_collab_diagnostic_retention AFTER INSERT ON ai_collab_diagnostic_events
 FOR EACH ROW EXECUTE FUNCTION trim_ai_collab_diagnostic_events();
