ALTER TABLE documents ADD COLUMN document_policy text;
ALTER TABLE documents ADD COLUMN document_policy_revision integer NOT NULL DEFAULT 0 CHECK(document_policy_revision>=0);
ALTER TABLE documents ADD COLUMN is_batch boolean NOT NULL DEFAULT false;
