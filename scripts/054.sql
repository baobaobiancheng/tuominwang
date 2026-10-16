-- Remove only the historical PDF 300-page ceiling. Retain nonnegative
-- positions, checkpoint page_index < total_pages and unique rotation pages.
ALTER TABLE pdf_ocr_checkpoints DROP CONSTRAINT pdf_ocr_checkpoints_page_index_check;
ALTER TABLE pdf_ocr_checkpoints ADD CONSTRAINT pdf_ocr_checkpoints_page_index_check CHECK(page_index>=0);
ALTER TABLE pdf_ocr_checkpoints DROP CONSTRAINT pdf_ocr_checkpoints_check;
ALTER TABLE pdf_ocr_checkpoints ADD CONSTRAINT pdf_ocr_checkpoints_check CHECK(total_pages>page_index);
ALTER TABLE pdf_ocr_review_drafts DROP CONSTRAINT pdf_ocr_review_drafts_page_index_check;
ALTER TABLE pdf_ocr_review_drafts ADD CONSTRAINT pdf_ocr_review_drafts_page_index_check CHECK(page_index>=0);
CREATE OR REPLACE FUNCTION pdf_ocr_page_indices_valid(pages integer[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT pages IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM unnest(pages) AS page WHERE page IS NULL OR page<0)
 AND cardinality(pages)=(SELECT count(DISTINCT page) FROM unnest(pages) AS page)
$$;
