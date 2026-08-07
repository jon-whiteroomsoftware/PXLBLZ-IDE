ALTER TABLE controller_profiles ADD COLUMN last_known_installed_map_json TEXT;

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '24', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
