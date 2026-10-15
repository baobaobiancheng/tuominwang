-- Export-only job owners can record encrypted progress without acquiring
-- permission to read original-text/OCR events. Keep SELECT RLS unchanged.
CREATE FUNCTION append_owned_processing_event(
 p_job uuid,p_generation integer,p_sequence integer,p_revision integer,
 p_source_hash text,p_content_hash text,p_payload text,p_payload_hash text,p_heartbeat timestamptz
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE j record; prior_hash text; written integer;
BEGIN
 SELECT jobs.*,d.content_hash AS current_hash,d.source_hash AS current_source_hash
 INTO j FROM public.jobs JOIN public.documents d ON d.id=jobs.document_id
 WHERE jobs.id=p_job AND jobs.generation=p_generation AND jobs.status='running'
 AND jobs.lease_until>now() AND jobs.revision=p_revision AND d.revision=p_revision
 AND jobs.user_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND jobs.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND d.content_hash=p_content_hash AND d.source_hash IS NOT DISTINCT FROM p_source_hash
 AND public.job_authorized(jobs.id) FOR SHARE OF jobs,d;
 IF NOT FOUND THEN RETURN 'stale'; END IF;
 IF p_sequence<1 OR p_payload_hash !~ '^[a-f0-9]{64}$' OR p_payload IS NULL OR p_heartbeat IS NULL THEN RAISE EXCEPTION 'PROCESSING_EVENT_INVALID'; END IF;
 INSERT INTO public.processing_events(job_id,generation,sequence,tenant_id,project_id,owner_id,document_id,revision,source_hash,content_hash,payload,payload_hash,heartbeat_at)
 VALUES(j.id,p_generation,p_sequence,j.tenant_id,j.project_id,j.user_id,j.document_id,p_revision,p_source_hash,p_content_hash,p_payload,p_payload_hash,p_heartbeat)
 ON CONFLICT(job_id,generation,sequence) DO NOTHING;
 GET DIAGNOSTICS written=ROW_COUNT;
 IF written=1 THEN RETURN 'inserted'; END IF;
 SELECT payload_hash INTO prior_hash FROM public.processing_events WHERE job_id=p_job AND generation=p_generation AND sequence=p_sequence;
 IF prior_hash=p_payload_hash THEN RETURN 'replayed'; END IF;
 RETURN 'conflict';
END $$;
REVOKE ALL ON FUNCTION append_owned_processing_event(uuid,integer,integer,integer,text,text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_owned_processing_event(uuid,integer,integer,integer,text,text,text,text,timestamptz) TO tmw_app;
