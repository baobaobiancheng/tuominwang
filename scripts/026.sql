CREATE TABLE folder_export_sessions(
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES users(id),
 upload_batch_id uuid NOT NULL REFERENCES upload_batches(id) ON DELETE CASCADE,owner_document_id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','completed')),
 payload text NOT NULL,payload_hash text NOT NULL,zip_id uuid,zip_hash text,zip_bytes bigint,
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id),
 FOREIGN KEY(owner_document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE,
 CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 CHECK((state='draft' AND zip_id IS NULL AND zip_hash IS NULL AND zip_bytes IS NULL) OR(state='completed' AND zip_id IS NOT NULL AND zip_hash ~ '^[a-f0-9]{64}$' AND zip_bytes>=0))
);
ALTER TABLE folder_export_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_export_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY folder_export_owner ON folder_export_sessions USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original') AND project_permission(project_id,'export')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original') AND project_permission(project_id,'export'));
GRANT SELECT,INSERT,UPDATE ON folder_export_sessions TO tmw_app;
