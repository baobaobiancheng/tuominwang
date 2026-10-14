ALTER TABLE documents ADD COLUMN unlocked_source_id uuid;
ALTER TABLE documents ADD COLUMN unlocked_source_hash text;
ALTER TABLE documents ADD COLUMN unlock_source_hash text;
ALTER TABLE documents ADD CONSTRAINT unlocked_source_binding CHECK (
  (unlocked_source_id IS NULL AND unlocked_source_hash IS NULL AND unlock_source_hash IS NULL)
  OR (unlocked_source_id IS NOT NULL AND unlocked_source_id <> source_id
      AND unlocked_source_hash ~ '^[a-f0-9]{64}$'
      AND unlock_source_hash = source_hash)
);
-- Preserve the existing storage accounting when retaining an additional source
-- derivative. Existing limits and document counts are unchanged.
CREATE FUNCTION derived_source_capacity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.quota_bytes < OLD.quota_bytes THEN RAISE EXCEPTION 'SOURCE_MISMATCH'; END IF;
  UPDATE organization_limits SET used_bytes=used_bytes+(NEW.quota_bytes-OLD.quota_bytes)
    WHERE tenant_id=NEW.tenant_id AND used_bytes+(NEW.quota_bytes-OLD.quota_bytes)<=byte_limit;
  IF NOT FOUND THEN RAISE EXCEPTION 'CAPACITY_EXCEEDED'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION derived_source_capacity() FROM PUBLIC;
CREATE TRIGGER derived_capacity BEFORE UPDATE OF quota_bytes ON documents FOR EACH ROW
  WHEN (NEW.quota_bytes IS DISTINCT FROM OLD.quota_bytes) EXECUTE FUNCTION derived_source_capacity();
