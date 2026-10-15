ALTER TABLE documents ADD COLUMN entity_corrections text;
COMMENT ON COLUMN documents.entity_corrections IS 'AEAD semantic OCR correction frame; immutable source/canonical hash and captured revision bound. Contains no plaintext correction material.';
