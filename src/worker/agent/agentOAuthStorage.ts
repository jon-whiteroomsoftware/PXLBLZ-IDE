/** The exact string/JSON KV subset consumed by workers-oauth-provider 0.10.3.
 * The caller holds a Durable Object storage transaction for the entire auth
 * mutation, including awaited crypto. This adapter alone provides no locking.
 */
export interface OAuthStorage {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
  list<T>(options: { prefix: string; startAfter?: string; limit: number }): Promise<Map<string, T>>
}
interface Entry { value: string; expiration?: number }
const PREFIX = 'oauth:'
export function oauthStorageKV(storage: OAuthStorage) {
  const keyFor = (key: string) => {
    if (typeof key !== 'string' || !key || key.length > 512) throw new Error('Unsupported OAuth storage key')
    return PREFIX + key
  }
  return {
    async get(key: string, options?: { type: 'json' }) {
      if (options && (options.type !== 'json' || Object.keys(options).some((key) => key !== 'type'))) throw new Error('Unsupported OAuth KV get')
      const entry = await storage.get<Entry>(keyFor(key))
      if (!entry || (entry.expiration !== undefined && entry.expiration <= Date.now() / 1000)) return null
      return options?.type === 'json' ? JSON.parse(entry.value) : entry.value
    },
    async put(key: string, value: string, options?: { expiration?: number; expirationTtl?: number }) {
      if (typeof value !== 'string' || value.length > 64 * 1024 || (options && Object.keys(options).some((key) => !['expiration', 'expirationTtl'].includes(key)))) throw new Error('Unsupported OAuth KV put')
      if (options?.expiration !== undefined && options.expirationTtl !== undefined) throw new Error('Ambiguous OAuth TTL')
      const expiration = options?.expiration ?? (options?.expirationTtl === undefined ? undefined : Math.floor(Date.now() / 1000) + options.expirationTtl)
      if (expiration !== undefined && (!Number.isFinite(expiration) || expiration <= Date.now() / 1000)) throw new Error('Invalid OAuth TTL')
      await storage.put(keyFor(key), { value, ...(expiration === undefined ? {} : { expiration }) })
    },
    async delete(key: string) { await storage.delete(keyFor(key)) },
    async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
      if (Object.keys(options).some((key) => !['prefix', 'cursor', 'limit'].includes(key))) throw new Error('Unsupported OAuth KV list')
      const prefix = PREFIX + (options.prefix ?? '')
      const limit = options.limit ?? 1000
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || (options.cursor && !options.cursor.startsWith(prefix))) throw new Error('Invalid OAuth KV cursor or limit')
      const keys: { name: string; expiration?: number }[] = []
      let cursor = options.cursor
      let complete = false
      // Cursor is the last scanned key, so revocation can delete earlier pages.
      while (keys.length < limit && !complete) {
        const rows = await storage.list<Entry>({ prefix, ...(cursor ? { startAfter: cursor } : {}), limit: limit - keys.length })
        complete = rows.size < limit - keys.length
        for (const [key, entry] of rows) {
          cursor = key
          if (entry.expiration === undefined || entry.expiration > Date.now() / 1000) keys.push({ name: key.slice(PREFIX.length), ...(entry.expiration === undefined ? {} : { expiration: entry.expiration }) })
          else await storage.delete(key)
        }
      }
      return { keys, list_complete: complete, cursor: complete ? '' : cursor ?? '', cacheStatus: null }
    },
  }
}
