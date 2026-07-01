import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve('migrations/0001_personal_storage.sql')

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
})
