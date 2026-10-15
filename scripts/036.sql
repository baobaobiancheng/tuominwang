-- Non-approval entity history. These rows never satisfy the export gate's
-- review_snapshots requirement. Every text domain is immutable and encrypted.
CREATE TABLE review_entity_history(
 document_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>=0),content_hash text NOT NULL,
 tenant_id uuid NOT NULL,project_id uuid NOT NULL,entity_metadata text NOT NULL,metadata_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,revision,content_hash),
 FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE
);
ALTER TABLE review_entity_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_entity_history FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_history_scope ON review_entity_history USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND project_permission(project_id,'access')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND project_permission(project_id,'review'));
GRANT SELECT,INSERT ON review_entity_history TO tmw_app;
