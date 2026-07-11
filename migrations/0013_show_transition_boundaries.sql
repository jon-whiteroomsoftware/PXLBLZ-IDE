ALTER TABLE personal_shows ADD COLUMN transitions_json TEXT;

INSERT INTO app_metadata(key, value, updated_at)
VALUES ('schema_version', '13', unixepoch())
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
