-- #1274: managed-artifact reconciliation is always on.
ALTER TABLE controller_profiles DROP COLUMN keep_patterns_up_to_date;

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '30', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
