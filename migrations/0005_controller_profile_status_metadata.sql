INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '5', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

ALTER TABLE controller_profiles ADD COLUMN last_known_pixel_count INTEGER;
ALTER TABLE controller_profiles ADD COLUMN last_known_map_dim INTEGER;
