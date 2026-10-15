-- Additive token lifecycle. Legacy v1 mappings and issued references remain immutable.
CREATE TABLE alias_groups(
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,project_id uuid NOT NULL,token text NOT NULL,
 adopted_legacy_mapping_id uuid REFERENCES entity_mappings(id),active_version_id uuid,ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 100000),
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id),
 FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id) ON DELETE CASCADE,
 UNIQUE(project_id,token),UNIQUE(project_id,ordinal),UNIQUE(id,project_id,tenant_id)
);
CREATE TABLE alias_group_versions(
 id uuid PRIMARY KEY,group_id uuid NOT NULL,tenant_id uuid NOT NULL,project_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>=2),payload text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id),
 FOREIGN KEY(group_id,project_id,tenant_id) REFERENCES alias_groups(id,project_id,tenant_id) ON DELETE CASCADE,
 UNIQUE(group_id,version),UNIQUE(id,group_id)
);
ALTER TABLE alias_groups ADD CONSTRAINT alias_group_active_version FOREIGN KEY(active_version_id,id) REFERENCES alias_group_versions(id,group_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE unified_alias_state(
 project_id uuid PRIMARY KEY,tenant_id uuid NOT NULL,revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),payload text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(project_id,tenant_id) REFERENCES projects(id,tenant_id) ON DELETE CASCADE
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['alias_groups','alias_group_versions','unified_alias_state'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY project_alias_scope ON %I USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid AND project_permission(project_id,%L)) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid AND project_permission(project_id,''review'') AND project_permission(project_id,''view_mapping''))',t,'access');
 END LOOP; END $$;
GRANT SELECT,INSERT,UPDATE ON alias_groups,unified_alias_state TO tmw_app;
-- No UPDATE or DELETE on versions: every explicit reference resolves its own original version.
GRANT SELECT,INSERT ON alias_group_versions TO tmw_app;
