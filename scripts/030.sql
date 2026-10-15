ALTER TABLE documents ADD COLUMN normalized_source_id uuid,ADD COLUMN normalized_source_hash text,ADD COLUMN normalization_source_hash text,ADD COLUMN normalization_metadata text;
ALTER TABLE documents ADD CONSTRAINT legacy_normalization_integrity CHECK(
 (normalized_source_id IS NULL AND normalized_source_hash IS NULL AND normalization_source_hash IS NULL AND normalization_metadata IS NULL)
 OR(source_format IN('doc','wps') AND normalized_source_id IS NOT NULL AND normalized_source_hash IS NOT NULL AND normalization_source_hash IS NOT NULL AND normalized_source_hash~'^[a-f0-9]{64}$' AND normalization_source_hash=source_hash AND normalization_metadata IS NOT NULL));
ALTER TABLE artifacts ADD COLUMN legacy_verification text;
ALTER TABLE derived_restorations ADD COLUMN legacy_sources text;

ALTER TABLE artifacts DROP CONSTRAINT artifacts_output_role_check;
ALTER TABLE artifacts ADD CONSTRAINT artifacts_output_role_check CHECK(output_role IN('primary','markdown','pdf-docx','word-docx'));
ALTER TABLE derived_restorations DROP CONSTRAINT derived_restorations_format_check;
ALTER TABLE derived_restorations ADD CONSTRAINT derived_restorations_format_check CHECK(format IN('doc','docx','md','txt'));
