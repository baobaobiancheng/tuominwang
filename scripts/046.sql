-- A single export job owns one immutable protected mapping archive. The sealed
-- receipt binds the exact reviewed bytes and primary output that created it.
ALTER TABLE jobs ADD COLUMN mapping_name_ciphertext text;
ALTER TABLE jobs ADD COLUMN mapping_name_hash text CHECK(mapping_name_hash IS NULL OR mapping_name_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE jobs ADD CONSTRAINT mapping_name_pair CHECK ((mapping_name_ciphertext IS NULL) = (mapping_name_hash IS NULL));
CREATE TABLE export_mapping_archives (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 project_id uuid NOT NULL,
 document_id uuid NOT NULL,
 job_id uuid NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>=0),
 owner_id uuid NOT NULL REFERENCES users(id),
 payload text NOT NULL CHECK(length(payload)>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id) ON DELETE CASCADE
);
-- delete_material removes the job first. Its deferred file purge enumerates the
-- document's owner directory, including these private mapping objects.
CREATE INDEX export_mapping_archives_project ON export_mapping_archives(project_id,created_at DESC,id DESC);
ALTER TABLE export_mapping_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_mapping_archives FORCE ROW LEVEL SECURITY;
CREATE POLICY export_mapping_archive_read ON export_mapping_archives FOR SELECT USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND project_permission(project_id,'view_original')
 AND project_permission(project_id,'view_mapping')
 AND project_permission(project_id,'export')
);
CREATE POLICY export_mapping_archive_insert ON export_mapping_archives FOR INSERT WITH CHECK (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'export')
 AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=export_mapping_archives.job_id
  AND j.tenant_id=export_mapping_archives.tenant_id AND j.project_id=export_mapping_archives.project_id
  AND j.document_id=export_mapping_archives.document_id AND j.user_id=export_mapping_archives.owner_id
  AND j.kind='export' AND j.revision=export_mapping_archives.revision AND j.status='succeeded')
);
GRANT SELECT,INSERT ON export_mapping_archives TO tmw_app;

-- The source batch saves its project mapping before exporting any file. This
-- sealed snapshot is immutable and transactionally belongs to the draft
-- session; a later publication binds jobs/artifacts without rewriting it.
CREATE TABLE folder_mapping_archives (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 project_id uuid NOT NULL,
 session_id uuid NOT NULL UNIQUE REFERENCES folder_export_sessions(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES users(id),
 payload text NOT NULL CHECK(length(payload)>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id)
);
CREATE INDEX folder_mapping_archives_project ON folder_mapping_archives(project_id,created_at DESC,id DESC);
ALTER TABLE folder_mapping_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_mapping_archives FORCE ROW LEVEL SECURITY;
CREATE POLICY folder_mapping_archive_read ON folder_mapping_archives FOR SELECT USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND project_permission(project_id,'view_original')
 AND project_permission(project_id,'view_mapping')
 AND project_permission(project_id,'export')
);
CREATE POLICY folder_mapping_archive_insert ON folder_mapping_archives FOR INSERT WITH CHECK (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'view_original')
 AND project_permission(project_id,'view_mapping')
 AND project_permission(project_id,'export')
 AND EXISTS(SELECT 1 FROM folder_export_sessions f WHERE f.id=folder_mapping_archives.session_id
  AND f.tenant_id=folder_mapping_archives.tenant_id AND f.project_id=folder_mapping_archives.project_id
  AND f.owner_id=folder_mapping_archives.owner_id AND f.state='draft')
);
GRANT SELECT,INSERT ON folder_mapping_archives TO tmw_app;

CREATE TABLE folder_mapping_archive_documents (
 archive_id uuid NOT NULL REFERENCES folder_mapping_archives(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
 PRIMARY KEY(archive_id,document_id)
);
CREATE INDEX folder_mapping_archive_documents_document ON folder_mapping_archive_documents(document_id);
ALTER TABLE folder_mapping_archive_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_mapping_archive_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY folder_mapping_archive_document_insert ON folder_mapping_archive_documents FOR INSERT WITH CHECK (
 EXISTS(SELECT 1 FROM folder_mapping_archives a WHERE a.id=archive_id AND a.owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
);
CREATE POLICY folder_mapping_archive_document_read ON folder_mapping_archive_documents FOR SELECT USING (
 EXISTS(SELECT 1 FROM folder_mapping_archives a WHERE a.id=archive_id)
);
GRANT SELECT,INSERT ON folder_mapping_archive_documents TO tmw_app;
-- Delete the whole multi-document plaintext mapping when any participant is
-- authorized for material deletion. The operation shares delete_material's
-- transaction; the ordinary single-document receipts remain independent.
CREATE FUNCTION discard_folder_mapping_on_material_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 DELETE FROM folder_mapping_archives a WHERE EXISTS(SELECT 1 FROM folder_mapping_archive_documents d WHERE d.archive_id=a.id AND d.document_id=OLD.id);
 RETURN OLD;
END $$;
CREATE TRIGGER discard_folder_mapping_on_material_delete BEFORE DELETE ON documents FOR EACH ROW EXECUTE FUNCTION discard_folder_mapping_on_material_delete();
REVOKE ALL ON FUNCTION discard_folder_mapping_on_material_delete() FROM PUBLIC;

CREATE TABLE folder_export_jobs (
 session_id uuid NOT NULL REFERENCES folder_export_sessions(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>=0),
 job_id uuid NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
 PRIMARY KEY(session_id,document_id)
);
ALTER TABLE folder_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_export_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY folder_export_job_owner ON folder_export_jobs USING (
 EXISTS(SELECT 1 FROM folder_export_sessions f WHERE f.id=session_id AND f.owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
) WITH CHECK (
 EXISTS(SELECT 1 FROM folder_export_sessions f WHERE f.id=session_id AND f.owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
);
GRANT SELECT,INSERT ON folder_export_jobs TO tmw_app;

CREATE TABLE folder_mapping_publications (
 archive_id uuid PRIMARY KEY REFERENCES folder_mapping_archives(id) ON DELETE CASCADE,
 payload text NOT NULL CHECK(length(payload)>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE folder_mapping_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_mapping_publications FORCE ROW LEVEL SECURITY;
CREATE POLICY folder_mapping_publication_read ON folder_mapping_publications FOR SELECT USING (
 EXISTS(SELECT 1 FROM folder_mapping_archives a WHERE a.id=archive_id)
);
CREATE POLICY folder_mapping_publication_insert ON folder_mapping_publications FOR INSERT WITH CHECK (
 EXISTS(SELECT 1 FROM folder_mapping_archives a WHERE a.id=archive_id AND a.owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
);
GRANT SELECT,INSERT ON folder_mapping_publications TO tmw_app;

-- A project member may read a private project mapping with view_mapping, but
-- must not gain the session owner's folder paths or ZIP. Return only the
-- immutable status/hash witness needed to verify a published receipt.
CREATE FUNCTION folder_mapping_session_witness(target uuid,archive uuid)
RETURNS TABLE(state text,payload_hash text,zip_hash text,owner_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT f.state,f.payload_hash,f.zip_hash,f.owner_id
 FROM folder_export_sessions f JOIN folder_mapping_archives a ON a.session_id=f.id
 WHERE f.id=target AND a.id=archive
  AND a.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
  AND f.tenant_id=a.tenant_id AND f.project_id=a.project_id AND f.owner_id=a.owner_id
  AND project_permission(a.project_id,'view_original')
  AND project_permission(a.project_id,'view_mapping')
  AND project_permission(a.project_id,'export')
$$;
REVOKE ALL ON FUNCTION folder_mapping_session_witness(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION folder_mapping_session_witness(uuid,uuid) TO tmw_app;

-- Every selected source owns the batch session, even when it has no alias
-- marks and therefore no private mapping archive. A removed participant
-- invalidates that session and schedules only its own ZIP for exact release.
CREATE TABLE folder_export_session_documents (
 session_id uuid NOT NULL REFERENCES folder_export_sessions(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
 PRIMARY KEY(session_id,document_id)
);
CREATE INDEX folder_export_session_documents_document ON folder_export_session_documents(document_id);
ALTER TABLE folder_export_session_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_export_session_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY folder_export_session_document_owner ON folder_export_session_documents USING (
 EXISTS(SELECT 1 FROM folder_export_sessions f WHERE f.id=session_id AND f.owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
) WITH CHECK (
 EXISTS(SELECT 1 FROM folder_export_sessions f WHERE f.id=session_id AND f.owner_id=nullif(current_setting('app.user_id',true),'')::uuid)
);
GRANT SELECT,INSERT ON folder_export_session_documents TO tmw_app;

CREATE TABLE folder_export_deletions (
 zip_id uuid PRIMARY KEY,
 owner_document_id uuid NOT NULL,
 queued_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION queue_folder_zip_on_session_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.zip_id IS NOT NULL AND EXISTS(SELECT 1 FROM folder_export_session_documents x WHERE x.session_id=OLD.id) THEN
  INSERT INTO folder_export_deletions(zip_id,owner_document_id) VALUES(OLD.zip_id,OLD.owner_document_id) ON CONFLICT(zip_id) DO NOTHING;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER queue_folder_zip_on_session_delete BEFORE DELETE ON folder_export_sessions FOR EACH ROW EXECUTE FUNCTION queue_folder_zip_on_session_delete();
CREATE FUNCTION discard_folder_session_on_material_delete() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 DELETE FROM folder_export_sessions f WHERE EXISTS(SELECT 1 FROM folder_export_session_documents x WHERE x.session_id=f.id AND x.document_id=OLD.id);
 RETURN OLD;
END $$;
CREATE TRIGGER discard_folder_session_on_material_delete BEFORE DELETE ON documents FOR EACH ROW EXECUTE FUNCTION discard_folder_session_on_material_delete();
CREATE FUNCTION due_folder_export_deletions() RETURNS SETOF folder_export_deletions LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT * FROM folder_export_deletions ORDER BY queued_at LIMIT 20
$$;
CREATE FUNCTION finish_folder_export_deletion(target uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 DELETE FROM folder_export_deletions WHERE zip_id=target
$$;
REVOKE ALL ON FUNCTION queue_folder_zip_on_session_delete(),discard_folder_session_on_material_delete(),due_folder_export_deletions(),finish_folder_export_deletion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION due_folder_export_deletions(),finish_folder_export_deletion(uuid) TO tmw_app;
CREATE OR REPLACE FUNCTION worker_pending() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM jobs WHERE status='queued' AND available_at<=now() OR status='running' AND lease_until<now())
 OR EXISTS(SELECT 1 FROM material_deletions WHERE purge_after<=now())
 OR EXISTS(SELECT 1 FROM folder_export_deletions)
$$;
