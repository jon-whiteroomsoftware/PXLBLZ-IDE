import { expect, it, vi } from 'vitest'
import { oauthStorageKV, type OAuthStorage } from './agentOAuthStorage'
function storage(): OAuthStorage {
  const rows = new Map<string, unknown>()
  return {
    async get<T>(key: string) { return rows.get(key) as T | undefined },
    async put(key, value) { rows.set(key, value) },
    async delete(key) { return rows.delete(key) },
    async list<T>({ prefix, startAfter, limit }: { prefix: string; startAfter?: string; limit: number }) {
      return new Map([...rows].filter(([key]) => key.startsWith(prefix) && (!startAfter || key > startAfter)).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)) as Map<string, T>
    },
  }
}
it('enforces relative/absolute expiry at the boundary for string, JSON and listing consumers', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(100_000)
  try {
    const kv = oauthStorageKV(storage())
    await kv.put('grant:a', '{"valid":true}', { expirationTtl: 60 })
    await kv.put('grant:b', 'value', { expiration: 160 })
    expect(await kv.get('grant:a', { type: 'json' })).toEqual({ valid: true })
    expect(await kv.get('grant:b')).toBe('value')
    now.mockReturnValue(159_999)
    expect((await kv.list({ prefix: 'grant:' })).keys).toHaveLength(2)
    now.mockReturnValue(160_000)
    expect(await kv.get('grant:a')).toBeNull()
    expect(await kv.get('grant:b')).toBeNull()
    expect((await kv.list({ prefix: 'grant:' })).keys).toEqual([])
  } finally { now.mockRestore() }
})
it('preserves pagination while revocation deletes earlier pages and excludes unrelated grants', async () => {
  const kv = oauthStorageKV(storage())
  for (const key of ['token:a:1', 'token:a:2', 'token:a:3', 'token:b:1']) await kv.put(key, '{}')
  let cursor = ''
  const removed: string[] = []
  do {
    const page = await kv.list({ prefix: 'token:a:', cursor, limit: 1 })
    for (const key of page.keys) { removed.push(key.name); await kv.delete(key.name) }
    cursor = page.cursor
  } while (cursor)
  expect(removed).toEqual(['token:a:1', 'token:a:2', 'token:a:3'])
  expect(await kv.get('token:b:1')).toBe('{}')
})
it('fails unsupported KV operations instead of silently emulating them', async () => {
  const kv = oauthStorageKV(storage())
  await expect(kv.get('key', { type: 'text' } as never)).rejects.toThrow('Unsupported')
  await expect(kv.put('key', 'value', { metadata: {} } as never)).rejects.toThrow('Unsupported')
  await expect(kv.put('key', 'value', { expiration: 1, expirationTtl: 60 })).rejects.toThrow('Ambiguous')
  await expect(kv.list({ prefix: 'grant:', cursor: 'oauth:token:other' })).rejects.toThrow('Invalid')
})
