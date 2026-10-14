ALTER TABLE artifacts ADD COLUMN output_role text NOT NULL DEFAULT 'primary' CHECK(output_role IN ('primary','markdown','pdf-docx'));
ALTER TABLE artifacts ADD COLUMN output_name text;
CREATE UNIQUE INDEX artifact_job_role ON artifacts(job_id,output_role);
