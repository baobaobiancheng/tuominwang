CREATE TABLE ai_collab_tasks (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES organizations(id), owner_id uuid NOT NULL REFERENCES users(id), project_id uuid NOT NULL REFERENCES projects(id),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), payload text NOT NULL, request_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,owner_id,request_id)
);
ALTER TABLE ai_collab_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_collab_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY own_ai_collab_tasks ON ai_collab_tasks USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original'));
GRANT SELECT,INSERT,UPDATE,DELETE ON ai_collab_tasks TO tmw_app;
