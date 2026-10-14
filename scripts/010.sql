CREATE TABLE redaction_presets (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES organizations(id), owner_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK(kind IN ('profile','ruleset')), revision integer NOT NULL CHECK(revision>0),
  name_hash text NOT NULL, payload text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,owner_id,kind,name_hash)
);
CREATE TABLE redaction_preferences (
  tenant_id uuid NOT NULL REFERENCES organizations(id), owner_id uuid NOT NULL REFERENCES users(id),
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0), payload text NOT NULL,
  PRIMARY KEY(tenant_id,owner_id)
);
ALTER TABLE redaction_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE redaction_presets FORCE ROW LEVEL SECURITY;
CREATE POLICY own_presets ON redaction_presets USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
ALTER TABLE redaction_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE redaction_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY own_preferences ON redaction_preferences USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON redaction_presets,redaction_preferences TO tmw_app;
ALTER TABLE projects ADD COLUMN preset_policy text;
ALTER TABLE projects ADD COLUMN preset_revision integer NOT NULL DEFAULT 0 CHECK(preset_revision>=0);
