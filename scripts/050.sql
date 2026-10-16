-- A resumed OCR job keeps the first detect job as its draft lineage. NULL means
-- this job is the root; ordinary jobs are unchanged.
ALTER TABLE jobs ADD COLUMN pdf_ocr_root_job_id uuid REFERENCES jobs(id);
ALTER TABLE jobs ADD COLUMN pdf_ocr_parent_job_id uuid REFERENCES jobs(id);
ALTER TABLE jobs ADD CONSTRAINT pdf_ocr_job_lineage_shape CHECK (
 (pdf_ocr_root_job_id IS NULL AND pdf_ocr_parent_job_id IS NULL)
 OR (pdf_ocr_root_job_id IS NOT NULL AND pdf_ocr_parent_job_id IS NOT NULL AND kind='detect' AND pdf_ocr_parent_job_id<>id AND pdf_ocr_root_job_id<>id)
);

-- Page-local human changes are a private draft, never an approved review
-- snapshot. The encrypted payload is bound to the exact OCR page and source.
CREATE TABLE pdf_ocr_review_drafts (
 document_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>=0),page_index integer NOT NULL CHECK(page_index>=0 AND page_index<300),
 tenant_id uuid NOT NULL,project_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES users(id),root_job_id uuid NOT NULL REFERENCES jobs(id),
 source_hash text NOT NULL CHECK(source_hash~'^[a-f0-9]{64}$'),content_hash text NOT NULL CHECK(content_hash~'^[a-f0-9]{64}$'),
 processing_hash text NOT NULL CHECK(processing_hash~'^[a-f0-9]{64}$'),rotation_plan_hash text NOT NULL CHECK(rotation_plan_hash~'^[a-f0-9]{64}$'),
 parser_fingerprint text NOT NULL CHECK(parser_fingerprint~'^[a-f0-9]{64}$'),parse_version integer NOT NULL CHECK(parse_version>=1),
 text_hash text NOT NULL CHECK(text_hash~'^[a-f0-9]{64}$'),preview_hash text NOT NULL CHECK(preview_hash~'^[a-f0-9]{64}$'),map_hash text NOT NULL CHECK(map_hash~'^[a-f0-9]{64}$'),
 draft_revision integer NOT NULL DEFAULT 1 CHECK(draft_revision>=1),payload text NOT NULL,payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,revision,page_index),
 FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE
);
CREATE INDEX pdf_ocr_review_drafts_owner ON pdf_ocr_review_drafts(owner_id,document_id,revision);
ALTER TABLE pdf_ocr_review_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_ocr_review_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY pdf_ocr_review_drafts_owner ON pdf_ocr_review_drafts FOR ALL USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'review') AND project_permission(project_id,'view_original')
) WITH CHECK (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'review') AND project_permission(project_id,'view_original')
);
GRANT SELECT,INSERT,UPDATE,DELETE ON pdf_ocr_review_drafts TO tmw_app;
