import {
  disconnectIdentity,
  listConnectedIdentities,
  upsertGitHubUser,
  upsertGoogleUser,
  type D1DatabaseWritableLike,
} from './users'

describe('Cloudflare user persistence', () => {
  it('creates a durable user and GitHub identity for a first sign-in', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const db: D1DatabaseWritableLike = {
      prepare(sql) {
        return {
          bind(...values) {
            calls.push({ sql, values })
            return this
          },
          async first<T>() {
            return null as T | null
          },
          async all<T>() {
            return { results: [] as T[] }
          },
          async run() {
            return { success: true }
          },
        }
      },
    }

    await expect(
      upsertGitHubUser(db, {
        id: 123,
        login: 'octocat',
        name: 'The Octocat',
        email: 'octocat@example.test',
        email_verified: true,
        avatar_url: 'https://example.test/avatar.png',
      }, 1_000),
    ).resolves.toEqual({
      userId: 'github:123',
      primaryProvider: 'github',
      primaryHandle: 'octocat',
      githubUserId: '123',
      githubLogin: 'octocat',
      displayName: 'The Octocat',
      avatarUrl: 'https://example.test/avatar.png',
    })

    expect(calls).toHaveLength(4)
    expect(calls[0].sql).toContain('FROM identities')
    expect(calls[0].values).toEqual(['github', '123'])
    expect(calls[1].sql).toContain('lower(email)')
    expect(calls[1].values).toEqual(['octocat@example.test'])
    expect(calls[2].sql).toContain('INSERT INTO users')
    expect(calls[2].values).toEqual([
      'github:123',
      'The Octocat',
      'https://example.test/avatar.png',
      1_000,
      1_000,
    ])
    expect(calls[3].sql).toContain('INSERT INTO identities')
    expect(calls[3].values).toEqual([
      'github',
      '123',
      'github:123',
      'octocat',
      'octocat@example.test',
      1,
      1_000,
      1_000,
    ])
  })

  it('keeps an existing GitHub identity on its durable user id', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const db: D1DatabaseWritableLike = {
      prepare(sql) {
        return {
          bind(...values) {
            calls.push({ sql, values })
            return this
          },
          async first<T>() {
            return { user_id: 'user-existing' } as T
          },
          async all<T>() {
            return { results: [] as T[] }
          },
          async run() {
            return { success: true }
          },
        }
      },
    }

    await expect(
      upsertGitHubUser(db, {
        id: 123,
        login: 'octocat',
        name: 'Updated Octocat',
        avatar_url: 'https://example.test/new-avatar.png',
      }, 2_000),
    ).resolves.toEqual({
      userId: 'user-existing',
      primaryProvider: 'github',
      primaryHandle: 'octocat',
      githubUserId: '123',
      githubLogin: 'octocat',
      displayName: 'Updated Octocat',
      avatarUrl: 'https://example.test/new-avatar.png',
    })

    expect(calls[1].values[0]).toBe('user-existing')
    expect(calls[2].values.slice(0, 3)).toEqual(['github', '123', 'user-existing'])
  })

  it('creates a Google user and records verified email on the identity', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const db: D1DatabaseWritableLike = {
      prepare(sql) {
        return {
          bind(...values) {
            calls.push({ sql, values })
            return this
          },
          async first<T>() {
            return null as T | null
          },
          async all<T>() {
            return { results: [] as T[] }
          },
          async run() {
            return { success: true }
          },
        }
      },
    }

    await expect(
      upsertGoogleUser(db, {
        sub: 'google-123',
        email: 'octocat@example.test',
        email_verified: true,
        name: 'Octo Cat',
        picture: 'https://example.test/google.png',
      }, 3_000),
    ).resolves.toEqual({
      userId: 'google:google-123',
      primaryProvider: 'google',
      primaryHandle: 'octocat@example.test',
      displayName: 'Octo Cat',
      avatarUrl: 'https://example.test/google.png',
    })

    expect(calls[3].values).toEqual([
      'google',
      'google-123',
      'google:google-123',
      'octocat@example.test',
      'octocat@example.test',
      1,
      3_000,
      3_000,
    ])
  })

  it('links a verified Google email to an existing user instead of creating a duplicate', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const db: D1DatabaseWritableLike = {
      prepare(sql) {
        return {
          bind(...values) {
            calls.push({ sql, values })
            return this
          },
          async first<T>() {
            if (sql.includes('lower(email)')) return { user_id: 'github:123' } as T
            return null as T | null
          },
          async all<T>() {
            return { results: [] as T[] }
          },
          async run() {
            return { success: true }
          },
        }
      },
    }

    await expect(
      upsertGoogleUser(db, {
        sub: 'google-123',
        email: 'octocat@example.test',
        email_verified: true,
        name: 'Octo Cat',
      }, 4_000),
    ).resolves.toMatchObject({
      userId: 'github:123',
      primaryProvider: 'google',
    })

    expect(calls[1].sql).toContain('lower(email)')
    expect(calls[2].values[0]).toBe('github:123')
    expect(calls[3].values.slice(0, 3)).toEqual(['google', 'google-123', 'github:123'])
  })

  it('does not auto-link Google identities when the email is unverified', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const db: D1DatabaseWritableLike = {
      prepare(sql) {
        return {
          bind(...values) {
            calls.push({ sql, values })
            return this
          },
          async first<T>() {
            return null as T | null
          },
          async all<T>() {
            return { results: [] as T[] }
          },
          async run() {
            return { success: true }
          },
        }
      },
    }

    await upsertGoogleUser(db, {
      sub: 'google-123',
      email: 'octocat@example.test',
      email_verified: false,
    }, 5_000)

    expect(calls.some((call) => call.sql.includes('lower(email)'))).toBe(false)
    expect(calls[1].values[0]).toBe('google:google-123')
    expect(calls[2].values[5]).toBe(0)
  })

  it('links a provider explicitly to the signed-in user', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const db: D1DatabaseWritableLike = {
      prepare(sql) {
        return {
          bind(...values) {
            calls.push({ sql, values })
            return this
          },
          async first<T>() {
            return null as T | null
          },
          async all<T>() {
            return { results: [] as T[] }
          },
          async run() {
            return { success: true }
          },
        }
      },
    }

    await expect(
      upsertGoogleUser(db, {
        sub: 'google-123',
        email: 'other@example.test',
        email_verified: true,
      }, 6_000, 'github:123'),
    ).resolves.toMatchObject({ userId: 'github:123' })

    expect(calls.some((call) => call.sql.includes('lower(email)'))).toBe(false)
    expect(calls[1].values[0]).toBe('github:123')
    expect(calls[2].values.slice(0, 3)).toEqual(['google', 'google-123', 'github:123'])
  })

  it('lists connected identities for /api/me', async () => {
    const db: D1DatabaseWritableLike = {
      prepare() {
        return {
          bind() {
            return this
          },
          async first<T>() {
            return null as T | null
          },
          async all<T>() {
            return {
              results: [
                {
                  provider: 'github',
                  provider_user_id: '123',
                  handle: 'octocat',
                  email: null,
                  email_verified: null,
                },
                {
                  provider: 'google',
                  provider_user_id: 'google-123',
                  handle: 'octocat@example.test',
                  email: 'octocat@example.test',
                  email_verified: 1,
                },
              ] as T[],
            }
          },
          async run() {
            return { success: true }
          },
        }
      },
    }

    await expect(listConnectedIdentities(db, 'github:123')).resolves.toEqual([
      {
        provider: 'github',
        providerUserId: '123',
        handle: 'octocat',
        email: null,
        emailVerified: null,
      },
      {
        provider: 'google',
        providerUserId: 'google-123',
        handle: 'octocat@example.test',
        email: 'octocat@example.test',
        emailVerified: true,
      },
    ])
  })

  it('disconnects a linked provider but refuses to remove the last identity', async () => {
    const deleted: unknown[][] = []
    const dbWithTwo: D1DatabaseWritableLike = {
      prepare(sql) {
        let boundValues: unknown[] = []
        return {
          bind(...values) {
            boundValues = values
            return this
          },
          async first<T>() {
            return { count: 2 } as T
          },
          async all<T>() {
            return { results: [] as T[] }
          },
          async run() {
            if (sql.includes('DELETE FROM identities')) deleted.push(boundValues)
            return { success: true }
          },
        }
      },
    }
    const dbWithOne: D1DatabaseWritableLike = {
      prepare() {
        return {
          bind() {
            return this
          },
          async first<T>() {
            return { count: 1 } as T
          },
          async all<T>() {
            return { results: [] as T[] }
          },
          async run() {
            throw new Error('should not delete')
          },
        }
      },
    }

    await expect(disconnectIdentity(dbWithTwo, 'github:123', 'google')).resolves.toBe('disconnected')
    expect(deleted).toEqual([['github:123', 'google']])
    await expect(disconnectIdentity(dbWithOne, 'github:123', 'github')).resolves.toBe('last-identity')
  })
})
