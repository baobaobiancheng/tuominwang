-- Capacity counts retained original material bytes, not compressed output or model packages.
CREATE TABLE organization_limits (
  tenant_id uuid PRIMARY KEY REFERENCES organizations(id), byte_limit bigint NOT NULL DEFAULT 10737418240 CHECK(byte_limit>=0),
  document_limit integer NOT NULL DEFAULT 10000 CHECK(document_limit>=0), used_bytes bigint NOT NULL DEFAULT 0 CHECK(used_bytes>=0),
  used_documents integer NOT NULL DEFAULT 0 CHECK(used_documents>=0), revision integer NOT NULL DEFAULT 0
);
INSERT INTO organization_limits(tenant_id) SELECT id FROM organizations;
ALTER TABLE documents ADD COLUMN quota_bytes bigint NOT NULL DEFAULT 0;
UPDATE documents SET quota_bytes=coalesce(source_bytes,ceil(length(content)*0.75)::bigint);
UPDATE organization_limits l SET used_bytes=s.bytes,used_documents=s.docs FROM (SELECT tenant_id,sum(quota_bytes) bytes,count(*) docs FROM documents GROUP BY tenant_id) s WHERE l.tenant_id=s.tenant_id;
CREATE FUNCTION material_capacity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO organization_limits(tenant_id) VALUES(NEW.tenant_id) ON CONFLICT DO NOTHING;
  IF NEW.quota_bytes<=0 THEN NEW.quota_bytes=coalesce(NEW.source_bytes,ceil(length(NEW.content)*0.75)::bigint); END IF;
  UPDATE organization_limits SET used_bytes=used_bytes+NEW.quota_bytes,used_documents=used_documents+1
    WHERE tenant_id=NEW.tenant_id AND used_bytes+NEW.quota_bytes<=byte_limit AND used_documents+1<=document_limit;
  IF NOT FOUND THEN RAISE EXCEPTION 'CAPACITY_EXCEEDED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_capacity BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION material_capacity();
REVOKE ALL ON FUNCTION material_capacity() FROM PUBLIC;
ALTER TABLE organization_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY limits_scope ON organization_limits USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND organization_role() IN ('owner','admin')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND organization_role() IN ('owner','admin'));
GRANT SELECT,INSERT ON organization_limits TO tmw_app;
GRANT UPDATE(byte_limit,document_limit,revision) ON organization_limits TO tmw_app;
-- Legacy links were not recorded; conservatively retain existing artifacts for one day.
ALTER TABLE artifacts ADD COLUMN issued_until timestamptz NOT NULL DEFAULT now();
UPDATE artifacts SET issued_until=now()+interval '1 day';
CREATE TABLE material_deletions(document_id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,object_ids uuid[] NOT NULL,purge_after timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON material_deletions FROM PUBLIC;
CREATE FUNCTION delete_material(target uuid,expected integer,batches jsonb) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d documents; ids uuid[]; deadline timestamptz; b jsonb;
BEGIN
  SELECT * INTO d FROM documents WHERE id=target AND tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid;
  IF d.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM id FROM projects WHERE id=d.project_id FOR UPDATE;
  IF NOT project_permission(d.project_id,'delete_material') THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  SELECT * INTO d FROM documents WHERE id=target FOR UPDATE;
  IF d.revision<>expected THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  SELECT greatest(now(),coalesce(max(issued_until),now())) INTO deadline FROM artifacts WHERE document_id=target;
  SELECT array_agg(DISTINCT object_id) INTO ids FROM (
    SELECT d.source_id AS object_id WHERE d.source_id IS NOT NULL UNION ALL
    SELECT id FROM artifacts WHERE document_id=target UNION ALL
    SELECT (p->>'previewId')::uuid FROM review_snapshots s CROSS JOIN LATERAL jsonb_array_elements(s.page_data) p WHERE document_id=target UNION ALL
    SELECT (p->>'mapId')::uuid FROM review_snapshots s CROSS JOIN LATERAL jsonb_array_elements(s.page_data) p WHERE document_id=target UNION ALL
    SELECT (p->>'previewId')::uuid FROM jsonb_array_elements(d.page_data) p UNION ALL
    SELECT (p->>'mapId')::uuid FROM jsonb_array_elements(d.page_data) p
  ) objects WHERE object_id IS NOT NULL;
  INSERT INTO material_deletions(document_id,tenant_id,project_id,object_ids,purge_after) VALUES(target,d.tenant_id,d.project_id,coalesce(ids,'{}'),deadline);
  FOR b IN SELECT value FROM jsonb_array_elements(batches) LOOP
    IF b->>'manifest' IS NULL THEN DELETE FROM upload_batches WHERE id=(b->>'id')::uuid AND project_id=d.project_id;
    ELSE UPDATE upload_batches SET manifest=b->>'manifest',manifest_hash=b->>'hash' WHERE id=(b->>'id')::uuid AND project_id=d.project_id; END IF;
  END LOOP;
  DELETE FROM attempts WHERE job_id IN(SELECT id FROM jobs WHERE document_id=target);
  DELETE FROM artifacts WHERE document_id=target;
  DELETE FROM jobs WHERE document_id=target;
  DELETE FROM review_snapshots WHERE document_id=target;
  DELETE FROM documents WHERE id=target;
  UPDATE organization_limits SET used_bytes=used_bytes-d.quota_bytes,used_documents=used_documents-1 WHERE tenant_id=d.tenant_id;
  INSERT INTO audit(tenant_id,project_id,user_id,event,object_id,details) VALUES(d.tenant_id,d.project_id,nullif(current_setting('app.user_id',true),'')::uuid,'material_deleted',target,jsonb_build_object('purgeAfter',deadline));
  RETURN deadline;
END $$;
CREATE FUNCTION due_material_deletions() RETURNS SETOF material_deletions LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT * FROM material_deletions WHERE purge_after<=now() ORDER BY purge_after LIMIT 20 $$;
CREATE FUNCTION finish_material_deletion(target uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DELETE FROM material_deletions WHERE document_id=target AND purge_after<=now() $$;
REVOKE ALL ON FUNCTION delete_material(uuid,integer,jsonb),due_material_deletions(),finish_material_deletion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_material(uuid,integer,jsonb),due_material_deletions(),finish_material_deletion(uuid) TO tmw_app;
CREATE FUNCTION worker_pending() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM jobs WHERE status='queued' AND available_at<=now() OR status='running' AND lease_until<now())
    OR EXISTS(SELECT 1 FROM material_deletions WHERE purge_after<=now())
$$;
REVOKE ALL ON FUNCTION worker_pending() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION worker_pending() TO tmw_app;
