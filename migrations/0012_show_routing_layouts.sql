ALTER TABLE personal_shows ADD COLUMN routing_layouts_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE personal_shows ADD COLUMN routing_switches_json TEXT NOT NULL DEFAULT '[]';

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '12', unixepoch())
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
