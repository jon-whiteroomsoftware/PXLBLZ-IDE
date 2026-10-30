import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import {
  MAX_PERSONAL_CONTENT_BYTES,
  MAX_PERSONAL_ENTITY_ROWS,
  MAX_WRITE_REQUEST_BYTES,
  PersonalStorageGuardError,
  assertAllowedPersonalStorageKey,
  personalStorageGuardResponse,
  readProtectedJson,
} from './resourceProtection'

function usageDb(usage: { entity_count: number; content_bytes: number }) {
  return {
    prepare() {
      return {
        bind() {
          return this
        },
        first: async () => usage,
      }
    },
  }
}

describe('personal-storage resource protection (#407)', () => {
  it("counts a v2 Show's record bytes", async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      CREATE TABLE personal_patterns (user_id TEXT, id TEXT, name TEXT, src TEXT, controls_json TEXT, params_json TEXT, settings_json TEXT);
      CREATE TABLE personal_maps (user_id TEXT, id TEXT, name TEXT, generator TEXT, params_json TEXT, points_json TEXT, source TEXT, grid_dims_json TEXT, import_metadata_json TEXT);
      CREATE TABLE personal_mixins (user_id TEXT, id TEXT, name TEXT, kind TEXT, src TEXT);
      CREATE TABLE personal_libraries (user_id TEXT, id TEXT, name TEXT, src TEXT);
      CREATE TABLE personal_shows (user_id TEXT, id TEXT, name TEXT, record_json TEXT);
      CREATE TABLE controller_profiles (user_id TEXT, id TEXT, name TEXT, device_id TEXT, last_known_device_name TEXT, last_seen_ip TEXT, map_fingerprints_json TEXT, board_json TEXT, inputs_json TEXT, global_transforms_json TEXT, electrical_profile_json TEXT, pattern_bindings_json TEXT);
      CREATE TABLE personal_settings (user_id TEXT, key TEXT, value_json TEXT);
      CREATE TABLE controller_metadata (user_id TEXT, key TEXT, value_json TEXT);
    `)
    const converted = convertShowRecordV1ToV2({ ...convertibleV1Show(), id: 'show-1', name: 'New Show' })
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const recordJson = JSON.stringify(converted.record)
    sqlite.prepare('INSERT INTO personal_shows (user_id, id, name, record_json) VALUES (?, ?, ?, ?)')
      .run('github:123', 'show-1', 'New Show', recordJson)
    let usage: { entity_count: number; content_bytes: number } | null = null
    const db = {
      prepare(sql: string) {
        let values: SQLInputValue[] = []
        return {
          bind(...next: unknown[]) {
            values = next as SQLInputValue[]
            return this
          },
          async first() {
            usage = sqlite.prepare(sql).get(...values) as typeof usage
            return usage
          },
        }
      },
    }

    await readProtectedJson(new Request('https://pxlblz.example/api/shows', { method: 'POST', body: '{}' }), db, 'github:123')

    expect(usage).toEqual({ entity_count: 1, content_bytes: 6 + 8 + recordJson.length })
  })

  it('rejects an oversized write before parsing JSON or querying D1', async () => {
    let prepared = false
    const db = {
      prepare() {
        prepared = true
        throw new Error('D1 should not be queried')
      },
    }
    const request = new Request('https://pxlblz.example/api/patterns', {
      method: 'POST',
      body: 'x'.repeat(MAX_WRITE_REQUEST_BYTES + 1),
    })

    await expect(readProtectedJson(request, db, 'github:123')).rejects.toMatchObject({
      code: 'payload_too_large',
      status: 413,
    })
    expect(prepared).toBe(false)
  })

  it('turns malformed JSON into a stable client error', async () => {
    const request = new Request('https://pxlblz.example/api/patterns', {
      method: 'POST',
      body: '{broken',
    })

    await expect(readProtectedJson(
      request,
      usageDb({ entity_count: 0, content_bytes: 0 }),
      'github:123',
    )).rejects.toMatchObject({
      code: 'malformed_json',
      status: 400,
    })
  })

  it('blocks creation after the account reaches the million-row tripwire', async () => {
    const request = new Request('https://pxlblz.example/api/patterns', {
      method: 'POST',
      body: '{}',
    })

    await expect(readProtectedJson(
      request,
      usageDb({ entity_count: MAX_PERSONAL_ENTITY_ROWS, content_bytes: 0 }),
      'github:123',
      { createsEntity: true },
    )).rejects.toMatchObject({
      code: 'entity_limit_reached',
      status: 409,
    })
  })

  it('blocks a partial update when stored content plus the patch exceeds the account byte ceiling', async () => {
    const request = new Request('https://pxlblz.example/api/patterns/p1', {
      method: 'PATCH',
      body: '{}',
    })

    await expect(readProtectedJson(
      request,
      usageDb({ entity_count: 1, content_bytes: MAX_PERSONAL_CONTENT_BYTES - 1 }),
      'github:123',
    )).rejects.toMatchObject({
      code: 'storage_limit_reached',
      status: 409,
    })
  })

  it('allows only application-owned settings keys', () => {
    expect(() => assertAllowedPersonalStorageKey('settings', 'lastActive')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('settings', 'demoOverrides')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('settings', 'patternOrganization')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('settings', 'showOrganization')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('settings', 'mapOrganization')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('settings', 'controllerOrganization')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('settings', 'mixinOrganization')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('settings', 'libraryOrganization')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('settings', 'workspaceStarterState')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('settings', 'attacker-row')).toThrowError(
      expect.objectContaining({ code: 'unknown_storage_key', status: 404 }),
    )
  })

  it('allows only application-owned Controller metadata keys', () => {
    expect(() => assertAllowedPersonalStorageKey('controller-metadata', 'controller-bindings')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('controller-metadata', 'controller-program-labels')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('controller-metadata', 'controller-push-records')).not.toThrow()
    expect(() => assertAllowedPersonalStorageKey('controller-metadata', 'attacker-row')).toThrowError(
      expect.objectContaining({ code: 'unknown_storage_key', status: 404 }),
    )
  })

  it('serializes guard failures as stable JSON API responses', async () => {
    const response = personalStorageGuardResponse(
      new PersonalStorageGuardError('storage_limit_reached', 409, 'Account storage safety limit reached'),
    )

    expect(response?.status).toBe(409)
    await expect(response?.json()).resolves.toEqual({
      code: 'storage_limit_reached',
      error: 'Account storage safety limit reached',
    })
    expect(personalStorageGuardResponse(new Error('boom'))).toBeUndefined()
  })
})
