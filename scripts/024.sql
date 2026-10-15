CREATE TABLE docx_safe_mode_preferences(
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 owner_id uuid PRIMARY KEY REFERENCES users(id),
 detail text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE docx_safe_mode_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE docx_safe_mode_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY own_docx_safe_mode ON docx_safe_mode_preferences
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON docx_safe_mode_preferences TO tmw_app;
