CREATE TABLE processing_reports (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES users(id),
 payload text NOT NULL,payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id)
);
CREATE TABLE markdown_export_events (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES users(id),
 document_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>=0),diagnostic_id text NOT NULL CHECK(diagnostic_id ~ '^[A-Za-z0-9-]{8,16}$'),
 event text NOT NULL CHECK(event IN ('export-outcome','manual-draft','source-apply')),payload text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id,owner_id,event,diagnostic_id),
 FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id),FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE
);
CREATE TABLE runtime_whitelists (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES users(id),document_id uuid,
 scope text NOT NULL CHECK(scope IN('file','project')),rule_key text NOT NULL,payload text NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((scope='project' AND document_id IS NULL) OR(scope='file' AND document_id IS NOT NULL)),
 FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id),FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX runtime_whitelist_key ON runtime_whitelists(project_id,owner_id,scope,COALESCE(document_id,'00000000-0000-0000-0000-000000000000'::uuid),rule_key);
ALTER TABLE processing_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE markdown_export_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE markdown_export_events FORCE ROW LEVEL SECURITY;
ALTER TABLE runtime_whitelists ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_whitelists FORCE ROW LEVEL SECURITY;
CREATE POLICY processing_report_owner ON processing_reports USING(
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original') AND project_permission(project_id,'export')
) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original') AND project_permission(project_id,'export'));
CREATE POLICY markdown_event_owner ON markdown_export_events USING(
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original')
) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original'));
CREATE POLICY runtime_whitelist_owner ON runtime_whitelists USING(
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original')
) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'manage_dictionary'));
GRANT SELECT,INSERT,UPDATE,DELETE ON processing_reports,markdown_export_events,runtime_whitelists TO tmw_app;
