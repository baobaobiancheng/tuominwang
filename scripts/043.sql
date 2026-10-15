-- An AI return becomes an immutable project archive only after server validation.
-- Its private result bytes remain in the document-owner object store. The
-- authenticated receipt binds provenance, hash, actor and validation outcome.
CREATE TABLE ai_result_archives (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 project_id uuid NOT NULL,
 owner_id uuid NOT NULL REFERENCES users(id),
 task_id uuid NOT NULL,
 round_id text NOT NULL CHECK(round_id ~ '^lbr_[0-9]{4}$'),
 payload text NOT NULL CHECK(length(payload)>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(task_id,round_id),
 FOREIGN KEY(task_id,tenant_id,project_id) REFERENCES ai_collab_tasks(id,tenant_id,project_id) ON DELETE RESTRICT
);
CREATE INDEX ai_result_archives_project_owner ON ai_result_archives(project_id,owner_id,created_at DESC);
ALTER TABLE ai_result_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_result_archives FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_result_archives_owner_read ON ai_result_archives FOR SELECT USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'view_original') AND project_permission(project_id,'review')
);
CREATE POLICY ai_result_archives_owner_insert ON ai_result_archives FOR INSERT WITH CHECK (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'view_original') AND project_permission(project_id,'review')
 AND EXISTS(SELECT 1 FROM ai_collab_tasks task WHERE task.id=ai_result_archives.task_id AND task.tenant_id=ai_result_archives.tenant_id AND task.project_id=ai_result_archives.project_id AND task.owner_id=ai_result_archives.owner_id)
);
-- No UPDATE or DELETE grant: app callers cannot rewrite a validated receipt.
GRANT SELECT,INSERT ON ai_result_archives TO tmw_app;
