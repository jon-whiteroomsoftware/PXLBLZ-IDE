ALTER TABLE controller_profiles ADD COLUMN map_fingerprints_json TEXT;

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '10', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
