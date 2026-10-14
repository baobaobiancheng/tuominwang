ALTER TABLE projects ADD COLUMN portable_state text;
-- Restored files are private derived originals; they never enter the redacted artifact signing path.
CREATE TABLE derived_restorations (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, project_id uuid NOT NULL, owner_id uuid NOT NULL REFERENCES users(id),
  hash text NOT NULL, format text NOT NULL CHECK(format IN ('docx','md','txt')), source_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id)
);
ALTER TABLE derived_restorations ENABLE ROW LEVEL SECURITY;
ALTER TABLE derived_restorations FORCE ROW LEVEL SECURITY;
CREATE POLICY restoration_access ON derived_restorations USING (
  tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'restore')
) WITH CHECK (
  tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'restore')
);
GRANT SELECT,INSERT ON derived_restorations TO tmw_app;
