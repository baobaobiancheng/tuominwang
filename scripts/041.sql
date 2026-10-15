-- Durable OCR page checkpoints; the encrypted payload includes the final page, text and glyphs.
-- The original, preview and map remain document-owned objects and are never reclaimed by this table.
CREATE TABLE pdf_ocr_checkpoints (
 document_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>=0),page_index integer NOT NULL CHECK(page_index>=0 AND page_index<300),
 tenant_id uuid NOT NULL,project_id uuid NOT NULL,owner_id uuid NOT NULL REFERENCES users(id),
 source_hash text NOT NULL CHECK(source_hash~'^[a-f0-9]{64}$'),content_hash text NOT NULL CHECK(content_hash~'^[a-f0-9]{64}$'),
 processing_hash text NOT NULL CHECK(processing_hash~'^[a-f0-9]{64}$'),rotation_plan_hash text NOT NULL CHECK(rotation_plan_hash~'^[a-f0-9]{64}$'),parser_fingerprint text NOT NULL CHECK(parser_fingerprint~'^[a-f0-9]{64}$'),parse_version integer NOT NULL CHECK(parse_version>=1),
 total_pages integer NOT NULL CHECK(total_pages>page_index AND total_pages<=300),job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 generation integer NOT NULL CHECK(generation>0),preview_id uuid NOT NULL,preview_hash text NOT NULL CHECK(preview_hash~'^[a-f0-9]{64}$'),
 map_id uuid NOT NULL,map_hash text NOT NULL CHECK(map_hash~'^[a-f0-9]{64}$'),payload text NOT NULL,payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(document_id,revision,page_index),
 FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE
);
CREATE INDEX pdf_ocr_checkpoints_project_document ON pdf_ocr_checkpoints(project_id,document_id,revision);
ALTER TABLE pdf_ocr_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_ocr_checkpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY pdf_ocr_checkpoint_read ON pdf_ocr_checkpoints FOR SELECT USING(
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND project_permission(project_id,'view_original')
);
GRANT SELECT ON pdf_ocr_checkpoints TO tmw_app;
-- A PDF detect job can be authorized by upload alone. The worker may write/read
-- checkpoints only for its own currently leased job; direct table writes remain denied.
CREATE FUNCTION save_owned_pdf_ocr_checkpoint(p jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j record;
BEGIN
 SELECT jobs.*,d.source_hash AS current_source_hash,d.content_hash AS current_content_hash,d.parse_version AS current_parse_version
 INTO j FROM public.jobs JOIN public.documents d ON d.id=jobs.document_id AND d.project_id=jobs.project_id AND d.tenant_id=jobs.tenant_id
 WHERE jobs.id=(p->>'jobId')::uuid AND jobs.generation=(p->>'generation')::integer
 AND jobs.kind='detect' AND jobs.status='running' AND jobs.lease_until>clock_timestamp()
 AND jobs.user_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND jobs.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND jobs.revision=(p->>'revision')::integer AND d.revision=jobs.revision
 AND d.source_format='pdf' AND d.source_hash=p->>'sourceHash' AND d.content_hash=p->>'contentHash'
 AND d.parse_version=(p->>'parseVersion')::integer AND public.job_authorized(jobs.id)
 FOR SHARE OF jobs,d;
 IF NOT FOUND THEN RETURN 'stale'; END IF;
 INSERT INTO public.pdf_ocr_checkpoints(document_id,revision,page_index,tenant_id,project_id,owner_id,source_hash,content_hash,processing_hash,rotation_plan_hash,parser_fingerprint,parse_version,total_pages,job_id,generation,preview_id,preview_hash,map_id,map_hash,payload,payload_hash)
 VALUES(j.document_id,j.revision,(p->>'pageIndex')::integer,j.tenant_id,j.project_id,j.user_id,j.current_source_hash,j.current_content_hash,p->>'processingHash',p->>'rotationPlanHash',p->>'parserFingerprint',j.current_parse_version,(p->>'totalPages')::integer,j.id,j.generation,(p->>'previewId')::uuid,p->>'previewHash',(p->>'mapId')::uuid,p->>'mapHash',p->>'payload',p->>'payloadHash')
 ON CONFLICT(document_id,revision,page_index) DO UPDATE SET owner_id=excluded.owner_id,source_hash=excluded.source_hash,content_hash=excluded.content_hash,processing_hash=excluded.processing_hash,rotation_plan_hash=excluded.rotation_plan_hash,parser_fingerprint=excluded.parser_fingerprint,parse_version=excluded.parse_version,total_pages=excluded.total_pages,job_id=excluded.job_id,generation=excluded.generation,preview_id=excluded.preview_id,preview_hash=excluded.preview_hash,map_id=excluded.map_id,map_hash=excluded.map_hash,payload=excluded.payload,payload_hash=excluded.payload_hash,created_at=now();
 RETURN 'inserted';
END $$;
REVOKE ALL ON FUNCTION save_owned_pdf_ocr_checkpoint(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_owned_pdf_ocr_checkpoint(jsonb) TO tmw_app;
CREATE FUNCTION read_owned_pdf_ocr_checkpoints(p_job uuid,p_generation integer,p_processing_hash text,p_rotation_hash text,p_parser_fingerprint text)
RETURNS SETOF pdf_ocr_checkpoints LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j record;
BEGIN
 SELECT jobs.*,d.source_hash AS current_source_hash,d.content_hash AS current_content_hash,d.parse_version AS current_parse_version
 INTO j FROM public.jobs JOIN public.documents d ON d.id=jobs.document_id AND d.project_id=jobs.project_id AND d.tenant_id=jobs.tenant_id
 WHERE jobs.id=p_job AND jobs.generation=p_generation AND jobs.kind='detect' AND jobs.status='running' AND jobs.lease_until>clock_timestamp()
 AND jobs.user_id=nullif(current_setting('app.user_id',true),'')::uuid AND jobs.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND jobs.revision=d.revision AND d.source_format='pdf' AND public.job_authorized(jobs.id) FOR SHARE OF jobs,d;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY SELECT c.* FROM public.pdf_ocr_checkpoints c WHERE c.document_id=j.document_id AND c.revision=j.revision
 AND c.tenant_id=j.tenant_id AND c.project_id=j.project_id AND c.source_hash=j.current_source_hash AND c.content_hash=j.current_content_hash
 AND c.processing_hash=p_processing_hash AND c.rotation_plan_hash=p_rotation_hash AND c.parser_fingerprint=p_parser_fingerprint
 AND c.parse_version=j.current_parse_version ORDER BY c.page_index;
END $$;
REVOKE ALL ON FUNCTION read_owned_pdf_ocr_checkpoints(uuid,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION read_owned_pdf_ocr_checkpoints(uuid,integer,text,text,text) TO tmw_app;
