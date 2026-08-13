-- #775: zones are Show vocabulary. An Installation Show's Zone Layout owns its
-- pixel ranges; the profile-side copy never reached any loadable Show's
-- compiled artifact (every installation-contract recipe shadows it with
-- Show-owned layout data). Retire the column and its data outright.
ALTER TABLE controller_profiles DROP COLUMN zones_json;

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '26', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
