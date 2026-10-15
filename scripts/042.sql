-- Server-acknowledged, per-draft editor lease. The current writer is distinct
-- from the encrypted recovery payload so a tab can claim before its first save.
CREATE TABLE workspace_recovery_writers (
 tenant_id uuid NOT NULL,project_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id),
 document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
 writer_id uuid NOT NULL,token_hash text NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 writer_epoch integer NOT NULL DEFAULT 1 CHECK(writer_epoch>0),
 acked_recovery_revision integer NOT NULL DEFAULT 0 CHECK(acked_recovery_revision>=0),
 acked_sequence bigint NOT NULL DEFAULT 0 CHECK(acked_sequence>=0),
 lease_until timestamptz NOT NULL,clean_at timestamptz,
 PRIMARY KEY(document_id,user_id),
 FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id),
 FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id)
);
CREATE INDEX workspace_recovery_writer_prompts ON workspace_recovery_writers(user_id,project_id,lease_until) WHERE clean_at IS NULL;
ALTER TABLE workspace_recovery_writers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_recovery_writers FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_recovery_writer_owner ON workspace_recovery_writers USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND user_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'view_original') AND project_permission(project_id,'review')
) WITH CHECK (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND user_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'view_original') AND project_permission(project_id,'review')
);
GRANT SELECT,INSERT,UPDATE,DELETE ON workspace_recovery_writers TO tmw_app;
