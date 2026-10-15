-- Sensitive entity values and actor history remain in an authenticated encrypted
-- payload, under the same project RLS and immutable snapshot lifecycle.
ALTER TABLE review_snapshots ADD COLUMN entity_metadata text;
