-- #853: preserve the source identity and export provenance for Shows restored
-- or shared through an authored .pxlshow bundle.
ALTER TABLE personal_shows ADD COLUMN import_metadata_json TEXT;

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '27', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
