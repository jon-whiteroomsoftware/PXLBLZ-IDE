-- #1042: version-2 Show records own all durable Show content.
-- Refuse while any row lacks a version-2 record: its content lives only in the
-- columns below. The CHECK fails the migration; nothing is dropped.
CREATE TABLE IF NOT EXISTS migration_0029_guard (
  unconverted_rows INTEGER NOT NULL CHECK (unconverted_rows = 0)
);
DELETE FROM migration_0029_guard;
INSERT INTO migration_0029_guard (unconverted_rows)
SELECT COUNT(*) FROM personal_shows WHERE record_json IS NULL;
DROP TABLE migration_0029_guard;

ALTER TABLE personal_shows DROP COLUMN scenes_json;
ALTER TABLE personal_shows DROP COLUMN zones_json;
ALTER TABLE personal_shows DROP COLUMN cells_json;
ALTER TABLE personal_shows DROP COLUMN routing_layouts_json;
ALTER TABLE personal_shows DROP COLUMN routing_switches_json;
ALTER TABLE personal_shows DROP COLUMN transitions_json;
ALTER TABLE personal_shows DROP COLUMN output_contract_json;
ALTER TABLE personal_shows DROP COLUMN composition_json;
ALTER TABLE personal_shows DROP COLUMN output_effects_json;
ALTER TABLE personal_shows DROP COLUMN import_metadata_json;
ALTER TABLE personal_shows DROP COLUMN target_controller_profile_id;
ALTER TABLE personal_shows DROP COLUMN stage_map_id;

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '29', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
