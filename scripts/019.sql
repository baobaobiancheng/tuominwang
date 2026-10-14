CREATE TABLE workspace_recents (
 tenant_id uuid NOT NULL,project_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id),document_id uuid,
 opened_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(project_id,user_id),
 FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id)
);
CREATE TABLE workspace_recoveries (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id),
 document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,revision integer NOT NULL DEFAULT 1,
 document_revision integer NOT NULL,source_hash text,content_hash text NOT NULL,payload text NOT NULL,
 saved_at timestamptz NOT NULL DEFAULT now(),UNIQUE(document_id,user_id),
 FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id)
);
CREATE TABLE network_policies (
 tenant_id uuid NOT NULL,project_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id),
 offline boolean NOT NULL DEFAULT true,requests bigint NOT NULL DEFAULT 0,blocked bigint NOT NULL DEFAULT 0,
 bytes_in bigint NOT NULL DEFAULT 0,bytes_out bigint NOT NULL DEFAULT 0,revision integer NOT NULL DEFAULT 1,
 PRIMARY KEY(project_id,user_id),FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id)
);
ALTER TABLE workspace_recents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_recents FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_recoveries FORCE ROW LEVEL SECURITY;
ALTER TABLE network_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_recent_owner ON workspace_recents USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original')
) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original'));
CREATE POLICY workspace_recovery_owner ON workspace_recoveries USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original') AND project_permission(project_id,'review')
) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original') AND project_permission(project_id,'review'));
CREATE POLICY network_policy_owner ON network_policies USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'access')
) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND user_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'access'));
GRANT SELECT,INSERT,UPDATE,DELETE ON workspace_recents,workspace_recoveries,network_policies TO tmw_app;
