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
})
