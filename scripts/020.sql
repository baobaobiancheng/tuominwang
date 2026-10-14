CREATE TABLE renderer_crash_events(id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES organizations(id),owner_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),event text NOT NULL CHECK(event='RENDERER_JS_ERROR_DETAILS_OMITTED'));
CREATE INDEX renderer_crash_owner_time ON renderer_crash_events(tenant_id,owner_id,created_at,id);
ALTER TABLE renderer_crash_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE renderer_crash_events FORCE ROW LEVEL SECURITY;
CREATE POLICY own_renderer_crash ON renderer_crash_events USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
GRANT SELECT,INSERT ON renderer_crash_events TO tmw_app;
