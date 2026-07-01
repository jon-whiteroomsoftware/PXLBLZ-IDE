import { sessionUserFromGitHub, type GitHubUser, type SessionUser } from './auth'

export interface D1RunResultLike {
  success: boolean
}

export interface D1WritableStatementLike {
  bind(...values: unknown[]): D1WritableStatementLike
  run(): Promise<D1RunResultLike>
}

export interface D1DatabaseWritableLike {
  prepare(sql: string): D1WritableStatementLike
}

export async function upsertGitHubUser(
  db: D1DatabaseWritableLike,
  githubUser: GitHubUser,
  now: number = Math.floor(Date.now() / 1000),
): Promise<SessionUser> {
  const user = sessionUserFromGitHub(githubUser)
  await db
    .prepare(`
      INSERT INTO users (
        id,
        github_user_id,
        github_login,
        display_name,
        avatar_url,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        github_user_id = excluded.github_user_id,
        github_login = excluded.github_login,
        display_name = excluded.display_name,
        avatar_url = excluded.avatar_url,
        updated_at = excluded.updated_at
    `)
    .bind(
      user.userId,
      user.githubUserId,
      user.githubLogin,
      user.displayName,
      user.avatarUrl,
      now,
      now,
    )
    .run()
  return user
}
