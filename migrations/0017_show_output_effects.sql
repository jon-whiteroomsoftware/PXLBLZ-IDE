ALTER TABLE personal_shows ADD COLUMN output_effects_json TEXT;

INSERT INTO app_metadata(key, value, updated_at)
VALUES ('schema_version', '17', unixepoch())
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
