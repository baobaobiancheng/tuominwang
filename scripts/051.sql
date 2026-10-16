-- Rewrap an authenticated page under a new rotation revision. The API verifies
-- old/new AEAD and the owned preview/map bytes before calling this narrow write.
CREATE FUNCTION pdf_ocr_page_indices_valid(pages integer[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT pages IS NOT NULL AND cardinality(pages)<=300
 AND NOT EXISTS(SELECT 1 FROM unnest(pages) AS page WHERE page IS NULL OR page<0 OR page>=300)
 AND cardinality(pages)=(SELECT count(DISTINCT page) FROM unnest(pages) AS page)
$$;
ALTER TABLE jobs ADD COLUMN pdf_ocr_rotation_deleted_pages integer[] NOT NULL DEFAULT '{}';
ALTER TABLE jobs ADD CONSTRAINT pdf_ocr_rotation_deleted_pages_shape CHECK (pdf_ocr_page_indices_valid(pdf_ocr_rotation_deleted_pages) IS TRUE);

CREATE FUNCTION rebase_owned_pdf_ocr_checkpoint(p_old_job uuid,p_new_job uuid,p jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_job record;new_job record;d record;c record;
BEGIN
 SELECT * INTO old_job FROM public.jobs WHERE id=p_old_job FOR SHARE;
 SELECT * INTO new_job FROM public.jobs WHERE id=p_new_job FOR SHARE;
 IF old_job.id IS NULL OR new_job.id IS NULL OR old_job.kind<>'detect' OR new_job.kind<>'detect'
 OR old_job.status<>'cancelled' OR new_job.status<>'queued' OR old_job.collab_task_id IS NOT NULL OR new_job.collab_task_id IS NOT NULL
 OR old_job.tenant_id<>new_job.tenant_id OR old_job.project_id<>new_job.project_id OR old_job.document_id<>new_job.document_id OR old_job.user_id<>new_job.user_id
 OR new_job.revision<>old_job.revision+1 OR new_job.pdf_ocr_root_job_id IS NOT NULL OR new_job.pdf_ocr_parent_job_id IS NOT NULL
 OR old_job.user_id IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid
 OR old_job.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 OR NOT public.project_permission(old_job.project_id,'review') OR NOT public.project_permission(old_job.project_id,'view_original')
 OR NOT public.job_authorized(new_job.id) THEN RETURN 'stale'; END IF;
 SELECT * INTO d FROM public.documents WHERE id=new_job.document_id AND tenant_id=new_job.tenant_id AND project_id=new_job.project_id FOR SHARE;
 IF d.id IS NULL OR d.revision<>new_job.revision OR d.state<>'queued' OR d.source_format<>'pdf'
 OR d.source_hash IS DISTINCT FROM p->>'sourceHash' OR d.content_hash IS DISTINCT FROM p->>'contentHash' OR d.parse_version IS DISTINCT FROM (p->>'parseVersion')::integer THEN RETURN 'stale'; END IF;
 SELECT * INTO c FROM public.pdf_ocr_checkpoints WHERE document_id=d.id AND revision=old_job.revision AND page_index=(p->>'pageIndex')::integer FOR SHARE;
 IF c.document_id IS NULL OR c.tenant_id<>d.tenant_id OR c.project_id<>d.project_id OR c.owner_id<>new_job.user_id
 OR c.source_hash<>d.source_hash OR c.content_hash<>d.content_hash OR c.parse_version<>d.parse_version
 OR c.processing_hash IS DISTINCT FROM p->>'processingHash' OR c.rotation_plan_hash IS DISTINCT FROM p->>'oldRotationPlanHash'
 OR c.parser_fingerprint IS DISTINCT FROM p->>'parserFingerprint' OR c.preview_id IS DISTINCT FROM (p->>'oldPreviewId')::uuid OR c.preview_hash IS DISTINCT FROM p->>'oldPreviewHash'
 OR c.map_id IS DISTINCT FROM (p->>'oldMapId')::uuid OR c.map_hash IS DISTINCT FROM p->>'oldMapHash' OR c.total_pages IS DISTINCT FROM (p->>'totalPages')::integer THEN RETURN 'stale'; END IF;
 IF ((p->>'rotationPlanHash') ~ '^[a-f0-9]{64}$') IS NOT TRUE OR ((p->>'previewHash') ~ '^[a-f0-9]{64}$') IS NOT TRUE
 OR ((p->>'mapHash') ~ '^[a-f0-9]{64}$') IS NOT TRUE OR ((p->>'payloadHash') ~ '^[a-f0-9]{64}$') IS NOT TRUE
 OR (p->>'previewId') IS NULL OR (p->>'mapId') IS NULL OR (p->>'payload') IS NULL THEN RETURN 'stale'; END IF;
 INSERT INTO public.pdf_ocr_checkpoints(document_id,revision,page_index,tenant_id,project_id,owner_id,source_hash,content_hash,processing_hash,rotation_plan_hash,parser_fingerprint,parse_version,total_pages,job_id,generation,preview_id,preview_hash,map_id,map_hash,payload,payload_hash)
 VALUES(d.id,new_job.revision,c.page_index,d.tenant_id,d.project_id,new_job.user_id,d.source_hash,d.content_hash,c.processing_hash,p->>'rotationPlanHash',c.parser_fingerprint,d.parse_version,c.total_pages,new_job.id,1,(p->>'previewId')::uuid,p->>'previewHash',(p->>'mapId')::uuid,p->>'mapHash',p->>'payload',p->>'payloadHash');
 RETURN 'inserted';
END $$;
REVOKE ALL ON FUNCTION rebase_owned_pdf_ocr_checkpoint(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rebase_owned_pdf_ocr_checkpoint(uuid,uuid,jsonb) TO tmw_app;
