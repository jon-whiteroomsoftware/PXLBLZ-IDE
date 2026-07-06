import {
  sessionUserFromGitHub,
  sessionUserFromGoogle,
  type GitHubUser,
  type GoogleUser,
  type OAuthProvider,
  type SessionUser,
} from './auth'

export interface D1RunResultLike {
  success: boolean
}

export interface D1WritableStatementLike {
  bind(...values: unknown[]): D1WritableStatementLike
  run(): Promise<D1RunResultLike>
  first<T>(): Promise<T | null>
  all<T>(): Promise<{ results: T[] }>
}

export interface D1DatabaseWritableLike {
  prepare(sql: string): D1WritableStatementLike
}

export async function upsertGitHubUser(
  db: D1DatabaseWritableLike,
  githubUser: GitHubUser,
  now: number = Math.floor(Date.now() / 1000),
  linkUserId?: string,
): Promise<SessionUser> {
  return resolveOAuthIdentity(
    db,
    {
      provider: 'github',
      providerUserId: String(githubUser.id),
      handle: githubUser.login,
      email: githubUser.email ?? null,
      emailVerified: githubUser.email_verified ?? null,
      displayName: githubUser.name ?? null,
      avatarUrl: githubUser.avatar_url ?? null,
      sessionUser: sessionUserFromGitHub(githubUser),
    },
    { linkUserId, now },
  )
}

export async function upsertGoogleUser(
  db: D1DatabaseWritableLike,
  googleUser: GoogleUser,
  now: number = Math.floor(Date.now() / 1000),
  linkUserId?: string,
): Promise<SessionUser> {
  return resolveOAuthIdentity(
    db,
    {
      provider: 'google',
      providerUserId: googleUser.sub,
      handle: googleUser.email ?? null,
      email: googleUser.email ?? null,
      emailVerified: googleUser.email_verified === true,
      displayName: googleUser.name ?? null,
      avatarUrl: googleUser.picture ?? null,
      sessionUser: sessionUserFromGoogle(googleUser),
    },
    { linkUserId, now },
  )
}

export interface ConnectedIdentity {
  provider: OAuthProvider
  providerUserId: string
  handle: string | null
  email: string | null
  emailVerified: boolean | null
}

interface OAuthIdentityInput {
  provider: OAuthProvider
  providerUserId: string
  handle: string | null
  email: string | null
  emailVerified: boolean | null
  displayName: string | null
  avatarUrl: string | null
  sessionUser: SessionUser
}

interface IdentityRow {
  user_id: string
}

interface ConnectedIdentityRow {
  provider: OAuthProvider
  provider_user_id: string
  handle: string | null
  email: string | null
  email_verified: number | null
}

export async function listConnectedIdentities(
  db: D1DatabaseWritableLike,
  userId: string,
): Promise<ConnectedIdentity[]> {
  const rows = await db
    .prepare(`
      SELECT provider, provider_user_id, handle, email, email_verified
      FROM identities
      WHERE user_id = ?
      ORDER BY provider ASC
    `)
    .bind(userId)
    .all<ConnectedIdentityRow>()

  return rows.results.map((row) => ({
    provider: row.provider,
    providerUserId: row.provider_user_id,
    handle: row.handle,
    email: row.email,
    emailVerified: row.email_verified == null ? null : row.email_verified === 1,
  }))
}

export async function disconnectIdentity(
  db: D1DatabaseWritableLike,
  userId: string,
  provider: OAuthProvider,
): Promise<'disconnected' | 'last-identity'> {
  const countRow = await db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM identities
      WHERE user_id = ?
    `)
    .bind(userId)
    .first<{ count: number }>()

  if ((countRow?.count ?? 0) <= 1) return 'last-identity'

  await db
    .prepare(`
      DELETE FROM identities
      WHERE user_id = ? AND provider = ?
    `)
    .bind(userId, provider)
    .run()

  return 'disconnected'
}

async function resolveOAuthIdentity(
  db: D1DatabaseWritableLike,
  identity: OAuthIdentityInput,
  options: { linkUserId?: string; now: number },
): Promise<SessionUser> {
  const existingIdentity = await db
    .prepare(`
      SELECT user_id
      FROM identities
      WHERE provider = ? AND provider_user_id = ?
      LIMIT 1
    `)
    .bind(identity.provider, identity.providerUserId)
    .first<IdentityRow>()

  if (options.linkUserId && existingIdentity && existingIdentity.user_id !== options.linkUserId) {
    throw new Error('OAuth identity is already linked to another user')
  }

  const emailIdentity = !existingIdentity && !options.linkUserId && identity.emailVerified === true && identity.email
    ? await db
      .prepare(`
        SELECT user_id
        FROM identities
        WHERE lower(email) = lower(?) AND email_verified = 1
        LIMIT 1
      `)
      .bind(identity.email)
      .first<IdentityRow>()
    : null

  const user = {
    ...identity.sessionUser,
    userId: options.linkUserId ?? existingIdentity?.user_id ?? emailIdentity?.user_id ?? `${identity.provider}:${identity.providerUserId}`,
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
      identity.displayName,
      identity.avatarUrl,
      options.now,
      options.now,
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
      identity.provider,
      identity.providerUserId,
      user.userId,
      identity.handle,
      identity.email,
      identity.emailVerified == null ? null : identity.emailVerified ? 1 : 0,
      options.now,
      options.now,
    )
    .run()

  return user
}
