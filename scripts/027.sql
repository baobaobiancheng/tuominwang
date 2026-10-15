CREATE TABLE release_preferences(
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 owner_id uuid PRIMARY KEY REFERENCES users(id),
 preferences jsonb NOT NULL DEFAULT '{"setupCompleted":false,"checkAutomatically":false,"downloadAutomatically":false,"installAutomatically":false}',
 introduced_release text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE release_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY own_release_preferences ON release_preferences
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON release_preferences TO tmw_app;
