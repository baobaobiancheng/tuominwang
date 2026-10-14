CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,username text UNIQUE NOT NULL,password_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash text PRIMARY KEY,user_id uuid REFERENCES users(id),expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS projects(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,owner_id uuid REFERENCES users(id),name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,tenant_id));
CREATE TABLE IF NOT EXISTS documents(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,request_id uuid NOT NULL,content text NOT NULL,content_hash text NOT NULL,revision integer NOT NULL DEFAULT 0,marks jsonb NOT NULL DEFAULT '[]',state text NOT NULL DEFAULT 'queued',created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id),UNIQUE(project_id,request_id),UNIQUE(id,tenant_id));
CREATE TABLE IF NOT EXISTS jobs(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,document_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES users(id),kind text NOT NULL CHECK(kind IN ('detect','export')),revision integer NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','cancelled')),generation integer NOT NULL DEFAULT 0,attempt integer NOT NULL DEFAULT 0,lease_until timestamptz,available_at timestamptz NOT NULL DEFAULT now(),error_code text,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id),FOREIGN KEY(document_id,tenant_id) REFERENCES documents(id,tenant_id));
CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs(document_id,kind,revision) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(status,available_at);
CREATE TABLE IF NOT EXISTS attempts(job_id uuid REFERENCES jobs(id),generation integer NOT NULL,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,outcome text,PRIMARY KEY(job_id,generation));
CREATE TABLE IF NOT EXISTS artifacts(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,document_id uuid NOT NULL,job_id uuid NOT NULL REFERENCES jobs(id),revision integer NOT NULL,hash text NOT NULL,FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id),FOREIGN KEY(document_id,tenant_id) REFERENCES documents(id,tenant_id));
CREATE TABLE IF NOT EXISTS audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,user_id uuid NOT NULL,event text NOT NULL,object_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id));
ALTER TABLE documents ADD CONSTRAINT document_scope UNIQUE(id,project_id,tenant_id);
ALTER TABLE jobs ADD CONSTRAINT job_document_scope FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id);
ALTER TABLE artifacts ADD CONSTRAINT artifact_document_scope FOREIGN KEY(document_id,project_id,tenant_id) REFERENCES documents(id,project_id,tenant_id);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_access ON projects;
CREATE POLICY project_access ON projects USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['documents','jobs','artifacts','audit'] LOOP
EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
EXECUTE format('DROP POLICY IF EXISTS scoped_access ON %I',t);
EXECUTE format('CREATE POLICY scoped_access ON %I USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid AND project_id IN (SELECT id FROM projects)) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid AND project_id IN (SELECT id FROM projects))',t);
END LOOP; END $$;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attempt_access ON attempts;
CREATE POLICY attempt_access ON attempts USING(job_id IN(SELECT id FROM jobs)) WITH CHECK(job_id IN(SELECT id FROM jobs));
-- Authentication and scheduler are narrow privileged entrypoints, never arbitrary tenant queries.
CREATE OR REPLACE FUNCTION login_user(name text) RETURNS SETOF users LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT * FROM users WHERE username=name $$;
CREATE OR REPLACE FUNCTION auth_session(token text) RETURNS TABLE(id uuid,tenant_id uuid,username text) LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT u.id,u.tenant_id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=token AND expires_at>now() $$;
CREATE OR REPLACE FUNCTION claim_job() RETURNS SETOF jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE picked jobs;
BEGIN
  UPDATE attempts SET outcome='lease_expired',finished_at=now() WHERE finished_at IS NULL AND job_id IN(SELECT id FROM jobs WHERE status='running' AND lease_until<now());
  UPDATE jobs SET status='failed',error_code='RETRY_EXHAUSTED' WHERE attempt>=3 AND (status='queued' OR(status='running' AND lease_until<now()));
  SELECT * INTO picked FROM jobs WHERE attempt<3 AND ((status='queued' AND available_at<=now()) OR(status='running' AND lease_until<now())) ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF picked.id IS NULL THEN RETURN; END IF;
  UPDATE jobs SET status='running',generation=generation+1,attempt=attempt+1,lease_until=now()+interval '30 seconds' WHERE id=picked.id RETURNING * INTO picked;
  INSERT INTO attempts(job_id,generation) VALUES(picked.id,picked.generation);
  RETURN NEXT picked;
END $$;
REVOKE ALL ON FUNCTION login_user(text),auth_session(text),claim_job() FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO tmw_app;
GRANT SELECT,INSERT,UPDATE ON projects,documents,jobs,artifacts,audit,attempts TO tmw_app;
GRANT SELECT,INSERT,DELETE ON sessions TO tmw_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO tmw_app;
GRANT EXECUTE ON FUNCTION login_user(text),auth_session(text),claim_job() TO tmw_app;
