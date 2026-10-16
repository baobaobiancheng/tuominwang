-- A zero-page PDF pause still needs a durable source/parser identity. Checkpoints
-- alone cannot bind it because the first page may not have completed.
ALTER TABLE jobs ADD COLUMN pdf_ocr_pause_binding jsonb;
ALTER TABLE jobs ADD CONSTRAINT pdf_ocr_pause_binding_shape CHECK (
  pdf_ocr_pause_binding IS NULL OR (
    kind='detect' AND status='cancelled' AND error_code='PDF_OCR_PAUSED'
    AND jsonb_typeof(pdf_ocr_pause_binding)='object'
    AND (pdf_ocr_pause_binding->>'sourceId') ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    AND (pdf_ocr_pause_binding->>'sourceHash') ~ '^[a-f0-9]{64}$'
    AND (pdf_ocr_pause_binding->>'contentHash') ~ '^[a-f0-9]{64}$'
    AND (pdf_ocr_pause_binding->>'processingHash') ~ '^[a-f0-9]{64}$'
    AND (pdf_ocr_pause_binding->>'rotationPlanHash') ~ '^[a-f0-9]{64}$'
    AND (pdf_ocr_pause_binding->>'parserFingerprint') ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(pdf_ocr_pause_binding->'parseVersion')='number'
    AND (pdf_ocr_pause_binding->>'parseVersion')::integer>=1
  ) IS TRUE
);
