ALTER TABLE personal_shows ADD COLUMN composition_json TEXT;

INSERT INTO app_metadata(key, value, updated_at)
VALUES ('schema_version', '16', unixepoch())
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
