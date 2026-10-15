-- A job is owned either by the document API (NULL) or one durable collaboration task.
ALTER TABLE ai_collab_tasks ADD CONSTRAINT ai_collab_task_scope UNIQUE(id,tenant_id,project_id);
ALTER TABLE jobs ADD COLUMN collab_task_id uuid;
ALTER TABLE jobs ADD CONSTRAINT job_collab_task_scope FOREIGN KEY(collab_task_id,tenant_id,project_id)
 REFERENCES ai_collab_tasks(id,tenant_id,project_id);
CREATE UNIQUE INDEX one_active_direct_job ON jobs(document_id,kind,revision)
 WHERE collab_task_id IS NULL AND status IN ('queued','running');
CREATE UNIQUE INDEX one_active_collab_job ON jobs(collab_task_id,document_id,kind,revision)
 WHERE collab_task_id IS NOT NULL AND status IN ('queued','running');
DROP INDEX one_active_job;
CREATE INDEX jobs_collab_task_lookup ON jobs(collab_task_id,status) WHERE collab_task_id IS NOT NULL;
