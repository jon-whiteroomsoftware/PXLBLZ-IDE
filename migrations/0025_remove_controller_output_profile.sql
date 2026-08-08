-- #743: the Controller output declaration never affected product behavior or
-- reached the performance harness, which records its own measurement context.
ALTER TABLE controller_profiles DROP COLUMN output_profile;
ALTER TABLE controller_profiles DROP COLUMN output_profile_note;

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '25', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
