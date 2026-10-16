-- The route chosen in an immutable upload manifest must remain distinguishable
-- from later per-document review configuration on idempotent file retries.
ALTER TABLE documents ADD COLUMN import_document_type text;
ALTER TABLE documents ADD CONSTRAINT documents_import_document_type_check
  CHECK (import_document_type IS NULL OR import_document_type IN
    ('general','contract','disclosure','judgment','pleading','official_letter','screenshot'));
