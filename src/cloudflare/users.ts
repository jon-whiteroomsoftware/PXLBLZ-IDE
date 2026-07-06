import { sessionUserFromGitHub, type GitHubUser, type SessionUser } from './auth'

export interface D1RunResultLike {
  success: boolean
}

export interface D1WritableStatementLike {
  bind(...values: unknown[]): D1WritableStatementLike
  run(): Promise<D1RunResultLike>
  first<T>(): Promise<T | null>
}

export interface D1DatabaseWritableLike {
  prepare(sql: string): D1WritableStatementLike
}

export async function upsertGitHubUser(
  db: D1DatabaseWritableLike,
  githubUser: GitHubUser,
  now: number = Math.floor(Date.now() / 1000),
): Promise<SessionUser> {
  const providerUserId = String(githubUser.id)
  const existingIdentity = await db
    .prepare(`
      SELECT user_id
      FROM identities
      WHERE provider = ? AND provider_user_id = ?
      LIMIT 1
    `)
    .bind('github', providerUserId)
    .first<{ user_id: string }>()
  const user = {
    ...sessionUserFromGitHub(githubUser),
    userId: existingIdentity?.user_id ?? `github:${providerUserId}`,
  }

  await db
    .prepare(`
      INSERT INTO users (
        id,
        display_name,
        avatar_url,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        updated_at = excluded.updated_at
    `)
    .bind(
      user.userId,
      user.displayName,
      user.avatarUrl,
      now,
      now,
    )
    .run()

  await db
    .prepare(`
      INSERT INTO identities (
        provider,
        provider_user_id,
        user_id,
        handle,
        email,
        email_verified,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        user_id = excluded.user_id,
        handle = excluded.handle,
        email = excluded.email,
        email_verified = excluded.email_verified,
        updated_at = excluded.updated_at
    `)
    .bind(
      'github',
      providerUserId,
      user.userId,
      user.githubLogin,
      githubUser.email ?? null,
      null,
      now,
      now,
    )
    .run()

  return user
}
