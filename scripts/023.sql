ALTER TABLE entity_mappings DROP CONSTRAINT entity_mappings_ordinal_check;
ALTER TABLE entity_mappings ADD CONSTRAINT entity_mappings_ordinal_check CHECK(ordinal BETWEEN 1 AND 100000);
