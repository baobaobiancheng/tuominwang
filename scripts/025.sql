CREATE TABLE mapping_library(id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES organizations(id),owner_id uuid NOT NULL REFERENCES users(id),project_id uuid REFERENCES projects(id) ON DELETE CASCADE,created_at timestamptz NOT NULL,stored_seq bigint GENERATED ALWAYS AS IDENTITY,payload text NOT NULL,protected_lpm text NOT NULL,lpm_hash text NOT NULL CHECK(lpm_hash~'^[a-f0-9]{64}$'));
CREATE INDEX mapping_library_owner_time ON mapping_library(tenant_id,owner_id,created_at DESC,stored_seq);
ALTER TABLE mapping_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE mapping_library FORCE ROW LEVEL SECURITY;
CREATE POLICY own_mapping_library ON mapping_library USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
GRANT SELECT,INSERT,DELETE ON mapping_library TO tmw_app;
GRANT USAGE,SELECT ON SEQUENCE mapping_library_stored_seq_seq TO tmw_app;
