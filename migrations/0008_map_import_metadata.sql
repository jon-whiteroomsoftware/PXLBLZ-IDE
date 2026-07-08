ALTER TABLE personal_maps ADD COLUMN import_metadata_json TEXT;

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '8', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
