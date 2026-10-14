ALTER TABLE documents ADD COLUMN source_id uuid;
ALTER TABLE documents ADD COLUMN source_name text;
ALTER TABLE documents ADD COLUMN source_format text NOT NULL DEFAULT 'txt';
ALTER TABLE documents ADD COLUMN source_hash text;
ALTER TABLE documents ADD COLUMN source_bytes bigint;
ALTER TABLE documents ADD COLUMN parse_version integer NOT NULL DEFAULT 1;
ALTER TABLE documents ADD COLUMN anchors jsonb NOT NULL DEFAULT '[]';
ALTER TABLE documents ADD COLUMN coverage jsonb NOT NULL DEFAULT '[]';

CREATE TABLE upload_batches (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, project_id uuid NOT NULL,
  manifest text NOT NULL, manifest_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id)
);
CREATE TABLE review_snapshots (
  document_id uuid NOT NULL, revision integer NOT NULL,
  tenant_id uuid NOT NULL, project_id uuid NOT NULL,
  content_hash text NOT NULL, parse_version integer NOT NULL,
  marks jsonb NOT NULL, rule_version text NOT NULL DEFAULT 'rules-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(document_id,revision),
  FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id)
);
INSERT INTO review_snapshots(document_id,revision,tenant_id,project_id,content_hash,parse_version,marks)
SELECT id,revision,tenant_id,project_id,content_hash,parse_version,marks FROM documents WHERE state='review';
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['upload_batches','review_snapshots'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY scoped_access ON %I USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid AND project_id IN (SELECT id FROM projects)) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid AND project_id IN (SELECT id FROM projects))',t);
END LOOP; END $$;
GRANT SELECT,INSERT ON upload_batches,review_snapshots TO tmw_app;
CREATE INDEX documents_project_order ON documents(project_id,created_at DESC,id DESC);
CREATE INDEX projects_order ON projects(created_at DESC,id DESC);
