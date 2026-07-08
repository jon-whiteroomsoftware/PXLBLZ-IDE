ALTER TABLE personal_shows ADD COLUMN stage_map_id TEXT;

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '9', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
