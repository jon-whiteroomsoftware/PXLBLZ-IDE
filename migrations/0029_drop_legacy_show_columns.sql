-- #1042: version-2 Show records own all durable Show content.
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
