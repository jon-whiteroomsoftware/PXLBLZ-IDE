import { upsertGitHubUser, type D1DatabaseWritableLike } from './users'

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
        avatar_url: 'https://example.test/avatar.png',
      }, 1_000),
    ).resolves.toEqual({
      userId: 'github:123',
      githubUserId: '123',
      githubLogin: 'octocat',
      displayName: 'The Octocat',
      avatarUrl: 'https://example.test/avatar.png',
    })

    expect(calls).toHaveLength(3)
    expect(calls[0].sql).toContain('FROM identities')
    expect(calls[0].values).toEqual(['github', '123'])
    expect(calls[1].sql).toContain('INSERT INTO users')
    expect(calls[1].values).toEqual([
      'github:123',
      'The Octocat',
      'https://example.test/avatar.png',
      1_000,
      1_000,
    ])
    expect(calls[2].sql).toContain('INSERT INTO identities')
    expect(calls[2].values).toEqual([
      'github',
      '123',
      'github:123',
      'octocat',
      'octocat@example.test',
      null,
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
      githubUserId: '123',
      githubLogin: 'octocat',
      displayName: 'Updated Octocat',
      avatarUrl: 'https://example.test/new-avatar.png',
    })

    expect(calls[1].values[0]).toBe('user-existing')
    expect(calls[2].values.slice(0, 3)).toEqual(['github', '123', 'user-existing'])
  })
})
