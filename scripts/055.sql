-- A streamed save object uses its already-committed receipt UUID as both
-- immutable object ID and owner. Thus a process exit before payload commit
-- still leaves a durable cleanup identity, without a second object registry.
CREATE TABLE workspace_save_deletions (
 receipt_id uuid PRIMARY KEY,
 queued_at timestamptz NOT NULL DEFAULT now(),
 available_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION queue_workspace_save_on_delete() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO workspace_save_deletions(receipt_id) VALUES(OLD.id) ON CONFLICT DO NOTHING;
 RETURN OLD;
END $$;
CREATE TRIGGER workspace_save_object_cleanup AFTER DELETE ON workspace_save_receipts
 FOR EACH ROW EXECUTE FUNCTION queue_workspace_save_on_delete();
CREATE FUNCTION due_workspace_save_deletions() RETURNS SETOF workspace_save_deletions
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Do not wait behind a save writer holding the receipt row lock.
 DELETE FROM workspace_save_receipts WHERE id IN (
  SELECT id FROM workspace_save_receipts WHERE expires_at<=clock_timestamp()
  ORDER BY expires_at,id LIMIT 20 FOR UPDATE SKIP LOCKED
 );
 RETURN QUERY SELECT * FROM workspace_save_deletions WHERE available_at<=clock_timestamp() ORDER BY queued_at,receipt_id LIMIT 20;
END $$;
CREATE FUNCTION finish_workspace_save_deletion(target uuid) RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 DELETE FROM workspace_save_deletions WHERE receipt_id=target
$$;
CREATE FUNCTION retry_workspace_save_deletion(target uuid) RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE workspace_save_deletions SET available_at=clock_timestamp()+interval '1 minute' WHERE receipt_id=target
$$;
REVOKE ALL ON workspace_save_deletions FROM PUBLIC,tmw_app;
REVOKE ALL ON FUNCTION queue_workspace_save_on_delete(),due_workspace_save_deletions(),finish_workspace_save_deletion(uuid),retry_workspace_save_deletion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION due_workspace_save_deletions(),finish_workspace_save_deletion(uuid),retry_workspace_save_deletion(uuid) TO tmw_app;
