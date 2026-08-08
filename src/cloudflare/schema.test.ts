import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve('migrations/0001_personal_storage.sql')
const identityMigrationPath = path.resolve('migrations/0002_identity_model.sql')
const controllerProfilesMigrationPath = path.resolve('migrations/0003_controller_profiles.sql')
const controllerProfileDeviceMetadataMigrationPath = path.resolve(
  'migrations/0004_controller_profile_device_metadata.sql',
)
const controllerProfileStatusMetadataMigrationPath = path.resolve(
  'migrations/0005_controller_profile_status_metadata.sql',
)
const personalMixinsMigrationPath = path.resolve('migrations/0006_personal_mixins.sql')
const personalShowsMigrationPath = path.resolve('migrations/0007_personal_shows.sql')
const mapImportMetadataMigrationPath = path.resolve('migrations/0008_map_import_metadata.sql')
const showStageMapMigrationPath = path.resolve('migrations/0009_show_stage_map.sql')
const controllerMapFingerprintsMigrationPath = path.resolve(
  'migrations/0010_controller_map_fingerprints.sql',
)
const personalLibrariesMigrationPath = path.resolve('migrations/0011_personal_libraries.sql')
const showRoutingLayoutsMigrationPath = path.resolve('migrations/0012_show_routing_layouts.sql')
const showTransitionBoundariesMigrationPath = path.resolve('migrations/0013_show_transition_boundaries.sql')
const showCompositionMigrationPath = path.resolve('migrations/0016_show_composition.sql')
const showOutputEffectsMigrationPath = path.resolve('migrations/0017_show_output_effects.sql')
const betaAccessMigrationPath = path.resolve('migrations/0020_beta_access.sql')
const betaAccessMultipleEmailsMigrationPath = path.resolve('migrations/0021_beta_access_multiple_emails.sql')
const canonicalGmailBetaAccessMigrationPath = path.resolve('migrations/0022_canonical_gmail_beta_access.sql')
const controllerElectricalProfileMigrationPath = path.resolve('migrations/0023_controller_electrical_profile.sql')
const installedMapObservationMigrationPath = path.resolve(
  'migrations/0024_controller_installed_map_observation.sql',
)
const removeControllerOutputProfileMigrationPath = path.resolve(
  'migrations/0025_remove_controller_output_profile.sql',
)

describe('D1 personal storage migration', () => {
  it('creates the storage buckets needed for the Cloudflare personal-storage foundation', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS app_metadata')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS users')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS personal_patterns')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS personal_maps')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS personal_settings')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS controller_metadata')
  })

  it('keys personal content by user before resource id', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('PRIMARY KEY (user_id, id)')
    expect(sql).toContain('PRIMARY KEY (user_id, key)')
    expect(sql).toContain('FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
  })

  it('adds identities as the OAuth-provider lookup layer and backfills GitHub users', () => {
    const sql = fs.readFileSync(identityMigrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS identities')
    expect(sql).toContain('PRIMARY KEY (provider, provider_user_id)')
    expect(sql).toContain('FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    expect(sql).toContain("SELECT\n  'github'")
    expect(sql).toContain('github_user_id')
    expect(sql).toContain("VALUES ('schema_version', '2', unixepoch())")
  })

  it('adds durable user-scoped controller profiles', () => {
    const sql = fs.readFileSync(controllerProfilesMigrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS controller_profiles')
    expect(sql).toContain('PRIMARY KEY (user_id, id)')
    expect(sql).toContain('FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    expect(sql).toContain('board_json TEXT NOT NULL')
    expect(sql).toContain('inputs_json TEXT NOT NULL')
    expect(sql).toContain('global_transforms_json TEXT NOT NULL')
    expect(sql).toContain('pattern_bindings_json TEXT NOT NULL')
    expect(sql).toContain('zones_json TEXT NOT NULL')
    expect(sql).toContain("VALUES ('schema_version', '3', unixepoch())")
  })

  it('adds last-known mutable device metadata to controller profiles', () => {
    const sql = fs.readFileSync(controllerProfileDeviceMetadataMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE controller_profiles ADD COLUMN last_known_device_name TEXT')
    expect(sql).toContain('ALTER TABLE controller_profiles ADD COLUMN last_seen_ip TEXT')
    expect(sql).toContain("VALUES ('schema_version', '4', unixepoch())")
  })

  it('adds last-known controller status metadata to controller profiles', () => {
    const sql = fs.readFileSync(controllerProfileStatusMetadataMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE controller_profiles ADD COLUMN last_known_pixel_count INTEGER')
    expect(sql).toContain('ALTER TABLE controller_profiles ADD COLUMN last_known_map_dim INTEGER')
    expect(sql).toContain("VALUES ('schema_version', '5', unixepoch())")
  })

  it('adds durable user-scoped mixins', () => {
    const sql = fs.readFileSync(personalMixinsMigrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS personal_mixins')
    expect(sql).toContain("kind TEXT NOT NULL CHECK (kind IN ('inject', 'intercept', 'bind'))")
    expect(sql).toContain('PRIMARY KEY (user_id, id)')
    expect(sql).toContain('FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    expect(sql).toContain("VALUES ('schema_version', '6', unixepoch())")
  })

  it('adds durable user-scoped shows', () => {
    const sql = fs.readFileSync(personalShowsMigrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS personal_shows')
    expect(sql).toContain('scenes_json TEXT NOT NULL')
    expect(sql).toContain('zones_json TEXT NOT NULL')
    expect(sql).toContain('cells_json TEXT NOT NULL')
    expect(sql).toContain('target_controller_profile_id TEXT')
    expect(sql).toContain('PRIMARY KEY (user_id, id)')
    expect(sql).toContain('FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    expect(sql).toContain("VALUES ('schema_version', '7', unixepoch())")
  })

  it('adds display-only imported-map provenance metadata', () => {
    const sql = fs.readFileSync(mapImportMetadataMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE personal_maps ADD COLUMN import_metadata_json TEXT')
    expect(sql).toContain("VALUES ('schema_version', '8', unixepoch())")
  })

  it('adds per-show stage map selection', () => {
    const sql = fs.readFileSync(showStageMapMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE personal_shows ADD COLUMN stage_map_id TEXT')
    expect(sql).toContain("VALUES ('schema_version', '9', unixepoch())")
  })

  it('adds controller map fingerprint provenance', () => {
    const sql = fs.readFileSync(controllerMapFingerprintsMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE controller_profiles ADD COLUMN map_fingerprints_json TEXT')
    expect(sql).toContain("VALUES ('schema_version', '10', unixepoch())")
  })

  it('adds durable user-scoped libraries', () => {
    const sql = fs.readFileSync(personalLibrariesMigrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS personal_libraries')
    expect(sql).toContain('UNIQUE (user_id, name)')
    expect(sql).toContain('PRIMARY KEY (user_id, id)')
    expect(sql).toContain('FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    expect(sql).toContain("VALUES ('schema_version', '11', unixepoch())")
  })

  it('adds named Show routing layouts and switch markers', () => {
    const sql = fs.readFileSync(showRoutingLayoutsMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE personal_shows ADD COLUMN routing_layouts_json TEXT')
    expect(sql).toContain('ALTER TABLE personal_shows ADD COLUMN routing_switches_json TEXT')
    expect(sql).toContain("VALUES ('schema_version', '12', unixepoch())")
  })

  it('adds first-class Show transition boundaries', () => {
    const sql = fs.readFileSync(showTransitionBoundariesMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE personal_shows ADD COLUMN transitions_json TEXT')
    expect(sql).toContain("VALUES ('schema_version', '13', unixepoch())")
  })

  it('adds the versioned Scene composition sidecar without creating relational sub-entities', () => {
    const sql = fs.readFileSync(showCompositionMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE personal_shows ADD COLUMN composition_json TEXT')
    expect(sql).toContain("VALUES ('schema_version', '16', unixepoch())")
    expect(sql).not.toContain('CREATE TABLE')
  })

  it('adds ordered Show output Effects as one serialized sidecar (#537)', () => {
    const sql = fs.readFileSync(showOutputEffectsMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE personal_shows ADD COLUMN output_effects_json TEXT')
    expect(sql).toContain("VALUES ('schema_version', '17', unixepoch())")
    expect(sql).not.toContain('CREATE TABLE')
  })

  it('adds an empty email-keyed beta access gate without implicitly granting existing users (#698)', () => {
    const sql = fs.readFileSync(betaAccessMigrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS beta_access')
    expect(sql).toContain('email TEXT PRIMARY KEY COLLATE NOCASE')
    expect(sql).toContain('enabled INTEGER NOT NULL')
    expect(sql).toContain('user_id TEXT UNIQUE')
    expect(sql).not.toContain('INSERT INTO beta_access')
    expect(sql).toContain("'beta_access_mode', 'legacy'")
    expect(sql).toContain("VALUES ('schema_version', '20', unixepoch())")
  })

  it('allows one stable user to retain multiple verified beta emails (#698 review P2)', () => {
    const sql = fs.readFileSync(betaAccessMultipleEmailsMigrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE beta_access_next')
    expect(sql).toContain('user_id TEXT,')
    expect(sql).not.toContain('user_id TEXT UNIQUE')
    expect(sql).toContain('CREATE INDEX beta_access_user_id_idx')
    expect(sql).toContain("VALUES ('schema_version', '21', unixepoch())")
  })

  it('canonicalizes stored Googlemail beta access without silently merging conflicts (#701 review)', () => {
    const sql = fs.readFileSync(canonicalGmailBetaAccessMigrationPath, 'utf8')

    expect(sql).toContain("substr(lower(email), -length('@googlemail.com')) = '@googlemail.com'")
    expect(sql).toContain("|| '@gmail.com'")
    expect(sql).not.toContain('INSERT INTO beta_access')
    expect(sql).not.toContain('ON CONFLICT(email)')
    expect(sql).toContain("VALUES ('schema_version', '22', unixepoch())")
  })

  it('adds the optional installation electrical model to controller profiles (#733)', () => {
    const sql = fs.readFileSync(controllerElectricalProfileMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE controller_profiles ADD COLUMN electrical_profile_json TEXT')
    expect(sql).toContain("VALUES ('schema_version', '23', unixepoch())")
  })

  it('adds the last successful installed-map observation to controller profiles (#740)', () => {
    const sql = fs.readFileSync(installedMapObservationMigrationPath, 'utf8')

    expect(sql).toContain(
      'ALTER TABLE controller_profiles ADD COLUMN last_known_installed_map_json TEXT',
    )
    expect(sql).toContain("VALUES ('schema_version', '24', unixepoch())")
  })

  it('removes the unused Controller output declaration (#743)', () => {
    const sql = fs.readFileSync(removeControllerOutputProfileMigrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE controller_profiles DROP COLUMN output_profile')
    expect(sql).toContain('ALTER TABLE controller_profiles DROP COLUMN output_profile_note')
    expect(sql).toContain("VALUES ('schema_version', '25', unixepoch())")
  })
})
