-- Only new review versions acquire page decisions; original bytes and existing snapshots remain unchanged.
ALTER TABLE documents ADD COLUMN page_review jsonb;
ALTER TABLE review_snapshots ADD COLUMN page_review jsonb;
ALTER TABLE review_snapshots ADD COLUMN page_data jsonb NOT NULL DEFAULT '[]';
ALTER TABLE artifacts ADD COLUMN output_format text;
