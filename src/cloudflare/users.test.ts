import { upsertGitHubUser, type D1DatabaseWritableLike } from './users'

describe('Cloudflare user persistence', () => {
  it('upserts a GitHub-backed user and returns the session user shape', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const db: D1DatabaseWritableLike = {
      prepare(sql) {
        return {
          bind(...values) {
            calls.push({ sql, values })
            return this
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
        avatar_url: 'https://example.test/avatar.png',
      }, 1_000),
    ).resolves.toEqual({
      userId: 'github:123',
      githubUserId: '123',
      githubLogin: 'octocat',
      displayName: 'The Octocat',
      avatarUrl: 'https://example.test/avatar.png',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('INSERT INTO users')
    expect(calls[0].values).toEqual([
      'github:123',
      '123',
      'octocat',
      'The Octocat',
      'https://example.test/avatar.png',
      1_000,
      1_000,
    ])
  })
})
