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
