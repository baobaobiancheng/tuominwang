ALTER TABLE projects ADD COLUMN dictionary text;
ALTER TABLE projects ADD COLUMN dictionary_revision integer NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN ner_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN recognition jsonb NOT NULL DEFAULT '{}';
ALTER TABLE review_snapshots ADD COLUMN recognition jsonb NOT NULL DEFAULT '{}';
