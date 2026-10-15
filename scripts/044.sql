-- Preserve unreadable collaboration rows without rewriting their payloads.
CREATE TABLE ai_collab_task_quarantine (
 receipt_id uuid PRIMARY KEY,
 task_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 project_id uuid NOT NULL,
 owner_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL,
 task_revision integer NOT NULL CHECK(task_revision>0),
 payload_ciphertext text NOT NULL,
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 task_created_at timestamptz NOT NULL,
 task_updated_at timestamptz NOT NULL,
 failure_code text NOT NULL CHECK(failure_code='TASK_STORAGE_INVALID'),
 confirmed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,owner_id,request_id),
 UNIQUE(task_id,task_revision),
 FOREIGN KEY(task_id,tenant_id,project_id) REFERENCES ai_collab_tasks(id,tenant_id,project_id) ON DELETE RESTRICT
);
CREATE INDEX ai_collab_task_quarantine_project_owner ON ai_collab_task_quarantine(project_id,owner_id,confirmed_at DESC);
ALTER TABLE ai_collab_task_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_collab_task_quarantine FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_collab_quarantine_owner_read ON ai_collab_task_quarantine FOR SELECT USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'view_original')
);
CREATE POLICY ai_collab_quarantine_owner_insert ON ai_collab_task_quarantine FOR INSERT WITH CHECK (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND actor_id=owner_id
 AND project_permission(project_id,'view_original')
 AND EXISTS(SELECT 1 FROM ai_collab_tasks t WHERE t.id=ai_collab_task_quarantine.task_id AND t.tenant_id=ai_collab_task_quarantine.tenant_id AND t.project_id=ai_collab_task_quarantine.project_id AND t.owner_id=ai_collab_task_quarantine.owner_id)
);
-- No app UPDATE or DELETE grant: neither a retry nor ordinary task code can erase evidence.
GRANT SELECT,INSERT ON ai_collab_task_quarantine TO tmw_app;

-- A validated task version is written in the same transaction as each task
-- insert/update. Legacy rows have no invented history.
CREATE TABLE ai_collab_task_snapshot (
 task_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 project_id uuid NOT NULL,
 owner_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 payload_ciphertext text NOT NULL,
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(task_id,revision),
 FOREIGN KEY(task_id,tenant_id,project_id) REFERENCES ai_collab_tasks(id,tenant_id,project_id) ON DELETE RESTRICT
);
ALTER TABLE ai_collab_task_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_collab_task_snapshot FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_collab_snapshot_owner_read ON ai_collab_task_snapshot FOR SELECT USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'view_original')
);
CREATE POLICY ai_collab_snapshot_owner_insert ON ai_collab_task_snapshot FOR INSERT WITH CHECK (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'view_original')
 AND EXISTS(SELECT 1 FROM ai_collab_tasks t WHERE t.id=ai_collab_task_snapshot.task_id AND t.tenant_id=ai_collab_task_snapshot.tenant_id AND t.project_id=ai_collab_task_snapshot.project_id AND t.owner_id=ai_collab_task_snapshot.owner_id)
);
GRANT SELECT,INSERT ON ai_collab_task_snapshot TO tmw_app;

CREATE TABLE ai_collab_task_recovery (
 receipt_id uuid PRIMARY KEY REFERENCES ai_collab_task_quarantine(receipt_id) ON DELETE RESTRICT,
 task_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 project_id uuid NOT NULL,
 owner_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL,
 from_revision integer NOT NULL,
 to_revision integer NOT NULL CHECK(to_revision>from_revision),
 snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 recovered_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,owner_id,request_id),
 FOREIGN KEY(task_id,tenant_id,project_id) REFERENCES ai_collab_tasks(id,tenant_id,project_id) ON DELETE RESTRICT
);
ALTER TABLE ai_collab_task_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_collab_task_recovery FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_collab_recovery_owner_read ON ai_collab_task_recovery FOR SELECT USING (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND project_permission(project_id,'view_original')
);
CREATE POLICY ai_collab_recovery_owner_insert ON ai_collab_task_recovery FOR INSERT WITH CHECK (
 tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
 AND owner_id=nullif(current_setting('app.user_id',true),'')::uuid
 AND actor_id=owner_id
 AND project_permission(project_id,'view_original')
 AND EXISTS(SELECT 1 FROM ai_collab_task_quarantine q WHERE q.receipt_id=ai_collab_task_recovery.receipt_id AND q.task_id=ai_collab_task_recovery.task_id AND q.tenant_id=ai_collab_task_recovery.tenant_id AND q.project_id=ai_collab_task_recovery.project_id AND q.owner_id=ai_collab_task_recovery.owner_id)
);
GRANT SELECT,INSERT ON ai_collab_task_recovery TO tmw_app;
