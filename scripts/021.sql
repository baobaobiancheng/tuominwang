CREATE TABLE markdown_manual_draft_heads(
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES users(id),document_id uuid NOT NULL,revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 UNIQUE(document_id,owner_id),FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id),FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE
);
CREATE TABLE markdown_manual_drafts(
 id uuid PRIMARY KEY,head_id uuid NOT NULL REFERENCES markdown_manual_draft_heads(id) ON DELETE CASCADE,tenant_id uuid NOT NULL,project_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES users(id),document_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),document_revision integer NOT NULL CHECK(document_revision>=0),source_hash text,content_hash text NOT NULL,
 base_kind text NOT NULL CHECK(base_kind IN('original-markdown','markdown-output','converted-text')),base_artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,base_hash text NOT NULL,edited_hash text NOT NULL,output_hash text NOT NULL,payload text NOT NULL,
 request_id uuid NOT NULL,request_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(head_id,revision),UNIQUE(document_id,owner_id,request_id),
 FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id),FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE,
 CHECK(content_hash ~ '^[a-f0-9]{64}$' AND base_hash ~ '^[a-f0-9]{64}$' AND edited_hash ~ '^[a-f0-9]{64}$' AND output_hash ~ '^[a-f0-9]{64}$' AND request_hash ~ '^[a-f0-9]{64}$')
);
ALTER TABLE markdown_manual_draft_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE markdown_manual_draft_heads FORCE ROW LEVEL SECURITY;
ALTER TABLE markdown_manual_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE markdown_manual_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY own_manual_md_head ON markdown_manual_draft_heads USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original') AND project_permission(project_id,'export')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original') AND project_permission(project_id,'export'));
CREATE POLICY own_manual_md_version ON markdown_manual_drafts USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original') AND project_permission(project_id,'export')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original') AND project_permission(project_id,'export'));
GRANT SELECT,INSERT,UPDATE ON markdown_manual_draft_heads TO tmw_app;
GRANT SELECT,INSERT ON markdown_manual_drafts TO tmw_app;
