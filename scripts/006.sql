CREATE TABLE entity_mappings (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, project_id uuid NOT NULL,
  request_id uuid NOT NULL, ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 1000),
  token text NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version=1),
  payload text NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id),
  UNIQUE(project_id,request_id), UNIQUE(project_id,ordinal), UNIQUE(project_id,token)
);
ALTER TABLE entity_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_mappings FORCE ROW LEVEL SECURITY;
-- Until explicit membership grants are added, mapping access remains owner-only, not implied by document access.
CREATE POLICY mapping_owner_access ON entity_mappings USING(
  tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND project_id IN (
    SELECT id FROM projects WHERE owner_id=nullif(current_setting('app.user_id',true),'')::uuid
  )
) WITH CHECK(
  tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND project_id IN (
    SELECT id FROM projects WHERE owner_id=nullif(current_setting('app.user_id',true),'')::uuid
  )
);
-- Mapping records are immutable; changing an entity requires a new explicitly selected mapping.
GRANT SELECT,INSERT ON entity_mappings TO tmw_app;
