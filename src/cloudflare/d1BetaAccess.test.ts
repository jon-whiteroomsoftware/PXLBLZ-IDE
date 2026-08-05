import { createD1BetaAccessStore, type D1BetaAccessDatabaseLike } from './d1BetaAccess'

describe('D1 beta access store', () => {
  it('authorizes an unbound Gmail row through a Googlemail identity', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    let rowUserId: string | null = null
    const db: D1BetaAccessDatabaseLike = {
      prepare: (sql) => {
        const call = { sql, values: [] as unknown[] }
        calls.push(call)
        const statement = {
          bind: (...values: unknown[]) => {
            call.values = values
            return statement
          },
          first: async <T>() => (
            sql.includes('WHERE email = ?')
              ? { email: 'friend@gmail.com', label: 'Friend', enabled: 1, user_id: rowUserId }
              : null
          ) as T | null,
          all: async <T>() => ({ results: [{ email: 'friend@googlemail.com' }] as T[] }),
          run: async () => ({ success: true }),
        }
        return statement
      },
    }

    await expect(createD1BetaAccessStore(db).findActiveForUser('google:friend')).resolves.toEqual({
      email: 'friend@gmail.com',
      label: 'Friend',
      enabled: true,
      userId: null,
    })
    expect(calls.map((call) => call.values)).toEqual([
      ['google:friend'],
      ['google:friend'],
      ['friend@gmail.com'],
    ])

    rowUserId = 'github:other'
    await expect(createD1BetaAccessStore(db).findActiveForUser('google:friend')).resolves.toBeNull()
  })

  it('normalizes email bindings and maps active user access through the public store contract', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const firstResults: unknown[] = [
      { value: 'd1' },
      { count: 1 },
      { email: 'friend@example.com', label: 'Friend', enabled: 1, user_id: null },
      { email: 'owner@example.com', label: 'Owner', enabled: 1, user_id: 'github:owner' },
    ]
    const db: D1BetaAccessDatabaseLike = {
      prepare: (sql) => {
        const call = { sql, values: [] as unknown[] }
        calls.push(call)
        const statement = {
          bind: (...values: unknown[]) => {
            call.values = values
            return statement
          },
          first: async <T>() => firstResults.shift() as T | null,
          all: async <T>() => ({ results: [] as T[] }),
          run: async () => ({ success: true }),
        }
        return statement
      },
    }
    const store = createD1BetaAccessStore(db)

    await expect(store.isAuthoritative()).resolves.toBe(true)
    await expect(store.count()).resolves.toBe(1)
    await expect(store.getByEmail(' Friend@Example.COM ')).resolves.toEqual({
      email: 'friend@example.com',
      label: 'Friend',
      enabled: true,
      userId: null,
    })
    await expect(store.findActiveForUser('github:owner')).resolves.toMatchObject({
      email: 'owner@example.com',
      enabled: true,
      userId: 'github:owner',
    })
    expect(calls[2].values).toEqual(['friend@example.com'])
    expect(calls[3].values).toEqual(['github:owner'])
  })

  it('lists deterministically and mutates one normalized row at a time', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const db: D1BetaAccessDatabaseLike = {
      prepare: (sql) => {
        const call = { sql, values: [] as unknown[] }
        calls.push(call)
        const statement = {
          bind: (...values: unknown[]) => {
            call.values = values
            return statement
          },
          first: async <T>() => null as T | null,
          all: async <T>() => ({ results: [{
            email: 'a@example.com', label: null, enabled: 0, user_id: null,
          }] as T[] }),
          run: async () => ({ success: true }),
        }
        return statement
      },
    }
    const store = createD1BetaAccessStore(db)

    await expect(store.list()).resolves.toEqual([{
      email: 'a@example.com', label: null, enabled: false, userId: null,
    }])
    await store.add(' Friend@Example.COM ', 'Friend')
    await store.disable(' FRIEND@example.com ')
    await store.remove('Friend@example.com')

    expect(calls[1].values).toEqual(['friend@example.com', 'Friend'])
    expect(calls[2].sql).toContain("'beta_access_mode'")
    expect(calls[3].values).toEqual(['friend@example.com'])
    expect(calls[4].values).toEqual(['friend@example.com'])
  })
})
