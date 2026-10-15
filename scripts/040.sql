-- A commit witness belongs to the same SQL transaction as the imported material.
CREATE TABLE workspace_import_commits (
 import_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, project_id uuid NOT NULL,
 owner_ids jsonb NOT NULL CHECK(jsonb_typeof(owner_ids)='array'), committed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON workspace_import_commits FROM PUBLIC,tmw_app;
CREATE FUNCTION record_workspace_import_commit(target uuid,project uuid,owners jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
DECLARE actor uuid := nullif(current_setting('app.user_id',true),'')::uuid;
 tenant uuid := nullif(current_setting('app.tenant_id',true),'')::uuid; n integer;
BEGIN
 IF actor IS NULL OR tenant IS NULL OR public.organization_role() IS NULL OR jsonb_typeof(owners)<>'array' OR jsonb_array_length(owners)>10000
 OR NOT EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project AND p.tenant_id=tenant AND p.owner_id=actor)
 THEN RAISE EXCEPTION 'WORKSPACE_IMPORT_COMMIT_INVALID'; END IF;
 SELECT count(DISTINCT d.id) INTO n FROM public.documents d
 WHERE d.project_id=project AND d.tenant_id=tenant AND d.id IN(SELECT value::uuid FROM jsonb_array_elements_text(owners));
 IF n<>jsonb_array_length(owners) THEN RAISE EXCEPTION 'WORKSPACE_IMPORT_COMMIT_INVALID'; END IF;
 INSERT INTO public.workspace_import_commits(import_id,tenant_id,project_id,owner_ids) VALUES(target,tenant,project,owners);
END $$;
CREATE FUNCTION workspace_import_commit_state(target uuid,tenant uuid,project uuid,owners jsonb,claimed jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
DECLARE witness public.workspace_import_commits;
BEGIN
 SELECT * INTO witness FROM public.workspace_import_commits WHERE import_id=target;
 IF FOUND THEN
  IF witness.tenant_id=tenant AND witness.project_id=project AND witness.owner_ids=owners THEN RETURN 'committed'; END IF;
  RETURN 'unknown';
 END IF;
 IF EXISTS(SELECT 1 FROM public.projects WHERE id=project)
 OR EXISTS(SELECT 1 FROM public.documents WHERE id IN(SELECT value::uuid FROM jsonb_array_elements_text(claimed)))
 THEN RETURN 'unknown'; END IF;
 RETURN 'absent';
END $$;
CREATE FUNCTION forget_workspace_import_commit(target uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DELETE FROM public.workspace_import_commits WHERE import_id=target $$;
CREATE FUNCTION retained_workspace_import_commits() RETURNS TABLE(import_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT import_id FROM public.workspace_import_commits WHERE committed_at<now()-interval '1 minute' ORDER BY committed_at LIMIT 20
$$;
REVOKE ALL ON FUNCTION record_workspace_import_commit(uuid,uuid,jsonb),workspace_import_commit_state(uuid,uuid,uuid,jsonb,jsonb),forget_workspace_import_commit(uuid),retained_workspace_import_commits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_workspace_import_commit(uuid,uuid,jsonb),workspace_import_commit_state(uuid,uuid,uuid,jsonb,jsonb),forget_workspace_import_commit(uuid),retained_workspace_import_commits() TO tmw_app;
