-- Accounts belong to one organization; organization membership grants no access to projects by itself.
ALTER TABLE users ADD CONSTRAINT users_organization_identity UNIQUE(id,tenant_id);
CREATE TABLE organizations (
  id uuid PRIMARY KEY, name text NOT NULL DEFAULT '我的组织', owner_id uuid NOT NULL REFERENCES users(id),
  revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organization_members (
  tenant_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL,
  role text NOT NULL CHECK(role IN ('owner','admin','member')), enabled boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,user_id), FOREIGN KEY(user_id,tenant_id) REFERENCES users(id,tenant_id)
);
INSERT INTO organizations(id,owner_id) SELECT DISTINCT ON (tenant_id) tenant_id,id FROM users ORDER BY tenant_id,id;
INSERT INTO organization_members(tenant_id,user_id,role) SELECT u.tenant_id,u.id,CASE WHEN o.owner_id=u.id THEN 'owner' ELSE 'member' END FROM users u JOIN organizations o ON o.id=u.tenant_id;
CREATE FUNCTION provision_organization() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO organizations(id,owner_id) VALUES(NEW.tenant_id,NEW.id) ON CONFLICT(id) DO NOTHING;
  INSERT INTO organization_members(tenant_id,user_id,role) SELECT NEW.tenant_id,NEW.id,CASE WHEN owner_id=NEW.id THEN 'owner' ELSE 'member' END FROM organizations WHERE id=NEW.tenant_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION provision_organization() FROM PUBLIC;
CREATE TRIGGER user_organization AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION provision_organization();

CREATE TABLE project_members (
  tenant_id uuid NOT NULL, project_id uuid NOT NULL, user_id uuid NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,user_id),
  FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id),
  FOREIGN KEY(user_id,tenant_id) REFERENCES users(id,tenant_id),
  CHECK(permissions <@ ARRAY['view_original','review','export','view_mapping','restore','manage_models','manage_members','upload','manage_dictionary','delete_material']::text[])
);
CREATE FUNCTION organization_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT role FROM organization_members WHERE tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND user_id=nullif(current_setting('app.user_id',true),'')::uuid AND enabled
$$;
CREATE FUNCTION project_permission(target uuid, permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM projects p JOIN organization_members o ON o.tenant_id=p.tenant_id
    AND o.user_id=nullif(current_setting('app.user_id',true),'')::uuid AND o.enabled
    LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=o.user_id
    WHERE p.id=target AND p.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
    AND (p.owner_id=o.user_id OR permission=ANY(m.permissions) OR permission='access' AND cardinality(m.permissions)>0))
$$;
REVOKE ALL ON FUNCTION organization_role(),project_permission(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organization_role(),project_permission(uuid,text) TO tmw_app;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_read ON organizations FOR SELECT USING(id=nullif(current_setting('app.tenant_id',true),'')::uuid AND organization_role() IS NOT NULL);
CREATE POLICY organization_write ON organizations FOR UPDATE USING(id=nullif(current_setting('app.tenant_id',true),'')::uuid AND organization_role() IN ('owner','admin')) WITH CHECK(id=nullif(current_setting('app.tenant_id',true),'')::uuid AND organization_role() IN ('owner','admin'));
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_member_read ON organization_members FOR SELECT USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND organization_role() IS NOT NULL);
CREATE POLICY organization_member_write ON organization_members FOR UPDATE USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND organization_role() IN ('owner','admin')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND organization_role() IN ('owner','admin'));
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members FORCE ROW LEVEL SECURITY;
CREATE POLICY member_read ON project_members FOR SELECT USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND project_permission(project_id,'access'));
CREATE POLICY member_write ON project_members FOR ALL USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND project_permission(project_id,'manage_members')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND project_permission(project_id,'manage_members'));
DROP POLICY project_access ON projects;
CREATE POLICY project_read ON projects FOR SELECT USING(project_permission(id,'access'));
CREATE POLICY project_create ON projects FOR INSERT WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid AND organization_role() IS NOT NULL);
-- RLS enforces tenant/project membership. Each API operation independently checks its capability
-- while locking this row, including SELECT FOR UPDATE needed by upload/review transactions.
CREATE POLICY project_write ON projects FOR UPDATE USING(project_permission(id,'access')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND project_permission(id,'access'));
-- Mapping plaintext is exposed only by independently authorized API routes; server-side review validation
-- may decrypt an existing reference without returning it to the caller.
DROP POLICY mapping_owner_access ON entity_mappings;
CREATE POLICY mapping_scope ON entity_mappings USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND project_permission(project_id,'access')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND project_permission(project_id,'view_mapping'));
GRANT SELECT,UPDATE ON organizations,organization_members TO tmw_app;
GRANT SELECT,INSERT,UPDATE ON project_members TO tmw_app;
ALTER TABLE audit ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
CREATE TABLE organization_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES organizations(id),user_id uuid NOT NULL,event text NOT NULL,object_id uuid NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE organization_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_audit_scope ON organization_audit USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND organization_role() IN ('owner','admin')) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND organization_role() IN ('owner','admin'));
GRANT SELECT,INSERT ON organization_audit TO tmw_app;
GRANT USAGE,SELECT ON SEQUENCE organization_audit_id_seq TO tmw_app;

-- Narrow provision/list entrypoints do not grant the runtime unrestricted reads of the password table.
CREATE FUNCTION organization_accounts() RETURNS TABLE(id uuid,username text,role text,enabled boolean,revision integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT u.id,u.username,m.role,m.enabled,m.revision FROM users u JOIN organization_members m ON m.user_id=u.id AND m.tenant_id=u.tenant_id
  WHERE u.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND organization_role() IS NOT NULL ORDER BY u.username
$$;
CREATE FUNCTION create_organization_account(target uuid,name text,encoded_password text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM id FROM organizations WHERE id=nullif(current_setting('app.tenant_id',true),'')::uuid FOR UPDATE;
  IF organization_role() NOT IN ('owner','admin') OR organization_role() IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  IF (SELECT COUNT(*) FROM organization_members WHERE tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)>=1000 THEN RAISE EXCEPTION 'MEMBER_LIMIT'; END IF;
  IF length(name)<1 OR length(name)>80 OR encoded_password !~ '^[a-f0-9]{32}:[a-f0-9]{128}$' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  INSERT INTO users VALUES(target,nullif(current_setting('app.tenant_id',true),'')::uuid,name,encoded_password);
  RETURN target;
END $$;
REVOKE ALL ON FUNCTION organization_accounts(),create_organization_account(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organization_accounts(),create_organization_account(uuid,text,text) TO tmw_app;
CREATE FUNCTION update_organization_member(target uuid,expected integer,new_role text,new_enabled boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_member organization_members; project_row record;
BEGIN
  PERFORM id FROM organizations WHERE id=nullif(current_setting('app.tenant_id',true),'')::uuid FOR UPDATE;
  IF organization_role() NOT IN ('owner','admin') OR organization_role() IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  SELECT * INTO current_member FROM organization_members WHERE tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND user_id=target FOR UPDATE;
  IF current_member.user_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF current_member.role='owner' OR new_role NOT IN ('admin','member') THEN RAISE EXCEPTION 'OWNER_IMMUTABLE'; END IF;
  IF current_member.revision<>expected THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  FOR project_row IN SELECT p.id FROM projects p WHERE p.tenant_id=current_member.tenant_id AND (p.owner_id=target OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=target)) ORDER BY p.id FOR UPDATE LOOP NULL; END LOOP;
  UPDATE organization_members SET role=new_role,enabled=new_enabled,revision=revision+1 WHERE tenant_id=current_member.tenant_id AND user_id=target;
  IF NOT new_enabled THEN
    DELETE FROM sessions WHERE user_id=target;
    UPDATE attempts SET outcome='permission_revoked',finished_at=now() WHERE finished_at IS NULL AND job_id IN (SELECT id FROM jobs WHERE tenant_id=current_member.tenant_id AND user_id=target AND status IN ('queued','running'));
    UPDATE jobs SET status='cancelled',error_code='PERMISSION_REVOKED',lease_until=NULL WHERE tenant_id=current_member.tenant_id AND user_id=target AND status IN ('queued','running');
  END IF;
  INSERT INTO organization_audit(tenant_id,user_id,event,object_id,details) VALUES(current_member.tenant_id,nullif(current_setting('app.user_id',true),'')::uuid,'organization_member_updated',target,jsonb_build_object('role',new_role,'enabled',new_enabled,'revision',expected+1));
  RETURN expected+1;
END $$;
REVOKE ALL ON FUNCTION update_organization_member(uuid,integer,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_organization_member(uuid,integer,text,boolean) TO tmw_app;
CREATE OR REPLACE FUNCTION login_user(name text) RETURNS SETOF users LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT u.* FROM users u JOIN organization_members m ON m.user_id=u.id AND m.tenant_id=u.tenant_id WHERE u.username=name AND m.enabled
$$;
CREATE OR REPLACE FUNCTION auth_session(token text) RETURNS TABLE(id uuid,tenant_id uuid,username text) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT u.id,u.tenant_id,u.username FROM sessions s JOIN users u ON u.id=s.user_id JOIN organization_members m ON m.user_id=u.id AND m.tenant_id=u.tenant_id WHERE token_hash=token AND expires_at>now() AND m.enabled
$$;
ALTER TABLE jobs ADD COLUMN required_permissions text[] NOT NULL DEFAULT ARRAY['upload']::text[];
ALTER TABLE upload_batches ADD COLUMN created_by uuid REFERENCES users(id);
UPDATE jobs SET required_permissions=ARRAY['export']::text[] WHERE kind='export';
CREATE FUNCTION job_authorized(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM jobs j JOIN projects p ON p.id=j.project_id AND p.tenant_id=j.tenant_id
    JOIN organization_members o ON o.tenant_id=j.tenant_id AND o.user_id=j.user_id AND o.enabled
    LEFT JOIN project_members m ON m.project_id=j.project_id AND m.user_id=j.user_id
    WHERE j.id=target AND (p.owner_id=j.user_id OR cardinality(j.required_permissions)>0 AND j.required_permissions<@coalesce(m.permissions,'{}'::text[])))
$$;
REVOKE ALL ON FUNCTION job_authorized(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION job_authorized(uuid) TO tmw_app;
CREATE OR REPLACE FUNCTION claim_job() RETURNS SETOF jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE picked jobs;
BEGIN
  IF NOT pg_try_advisory_xact_lock(7843,1) THEN RETURN; END IF;
  UPDATE attempts SET outcome='permission_revoked',finished_at=now() WHERE finished_at IS NULL AND job_id IN(SELECT id FROM jobs WHERE status IN ('queued','running') AND NOT job_authorized(id));
  UPDATE jobs SET status='cancelled',error_code='PERMISSION_REVOKED',lease_until=NULL WHERE status IN ('queued','running') AND NOT job_authorized(id);
  UPDATE attempts SET outcome='lease_expired',finished_at=now() WHERE finished_at IS NULL AND job_id IN(SELECT id FROM jobs WHERE status='running' AND lease_until<now());
  UPDATE jobs SET status='failed',error_code='RETRY_EXHAUSTED',lease_until=NULL WHERE attempt>=3 AND (status='queued' OR(status='running' AND lease_until<now()));
  IF EXISTS(SELECT 1 FROM jobs WHERE status='running' AND lease_until>=now()) THEN RETURN; END IF;
  SELECT * INTO picked FROM jobs WHERE attempt<3 AND ((status='queued' AND available_at<=now()) OR(status='running' AND lease_until<now())) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF picked.id IS NULL THEN RETURN; END IF;
  UPDATE jobs SET status='running',generation=generation+1,attempt=attempt+1,lease_until=now()+interval '30 seconds' WHERE id=picked.id RETURNING * INTO picked;
  INSERT INTO attempts(job_id,generation) VALUES(picked.id,picked.generation);
  RETURN NEXT picked;
END $$;
