CREATE TABLE workspace_save_receipts(
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES organizations(id),owner_id uuid NOT NULL REFERENCES users(id),project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 run_instance text NOT NULL,request_hash text NOT NULL,session_hash text NOT NULL,input_hash text NOT NULL,snapshot_hash text NOT NULL,
 format text NOT NULL CHECK(format IN ('native','legacy-zip','secure-v2','secure-v3')),state text NOT NULL CHECK(state IN ('running','completed','failed')),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
 completed_at timestamptz,payload text,output_hash text,error_code text,
 UNIQUE(tenant_id,owner_id,request_hash),CHECK((state='completed')=(payload IS NOT NULL AND output_hash IS NOT NULL))
);
ALTER TABLE workspace_save_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_save_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY own_workspace_saves ON workspace_save_receipts USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON workspace_save_receipts TO tmw_app;
