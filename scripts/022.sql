CREATE TABLE processing_events (
 job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,generation integer NOT NULL CHECK(generation>0),sequence integer NOT NULL CHECK(sequence>0),
 tenant_id uuid NOT NULL,project_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES users(id),document_id uuid NOT NULL,
 revision integer NOT NULL,source_hash text,content_hash text NOT NULL,payload text NOT NULL,payload_hash text NOT NULL,heartbeat_at timestamptz NOT NULL,
 PRIMARY KEY(job_id,generation,sequence),FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE
);
CREATE TABLE processing_resources (
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES users(id),document_id uuid NOT NULL,
 revision integer NOT NULL,source_hash text,content_hash text NOT NULL,session_hash text NOT NULL,kind text NOT NULL CHECK(kind IN('source','output')),payload text NOT NULL,
 object_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),released boolean NOT NULL DEFAULT false,cleanup_used boolean NOT NULL DEFAULT false,
 FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE
);
ALTER TABLE processing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_events FORCE ROW LEVEL SECURITY;
ALTER TABLE processing_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_resources FORCE ROW LEVEL SECURITY;
CREATE POLICY processing_event_owner ON processing_events USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original'));
CREATE POLICY processing_resource_owner ON processing_resources USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND project_permission(project_id,'view_original'));
GRANT SELECT,INSERT ON processing_events TO tmw_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON processing_resources TO tmw_app;
