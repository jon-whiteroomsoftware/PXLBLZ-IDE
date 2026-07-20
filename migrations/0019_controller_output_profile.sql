-- #567: user-declared LED output topology on Controller profiles. The device
-- protocol cannot report output hardware, so this is a declaration only; NULL
-- means native-serial is assumed.
ALTER TABLE controller_profiles ADD COLUMN output_profile TEXT;
ALTER TABLE controller_profiles ADD COLUMN output_profile_note TEXT;
