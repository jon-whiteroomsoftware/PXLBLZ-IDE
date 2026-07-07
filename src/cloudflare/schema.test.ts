import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve('migrations/0001_personal_storage.sql')
const identityMigrationPath = path.resolve('migrations/0002_identity_model.sql')
const controllerProfilesMigrationPath = path.resolve('migrations/0003_controller_profiles.sql')

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
})
