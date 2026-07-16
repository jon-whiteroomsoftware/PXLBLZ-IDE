export type AuthProvider = 'github' | 'google'

export interface ConnectedIdentity {
  provider: AuthProvider
  providerUserId: string
  handle: string | null
  email: string | null
  emailVerified: boolean | null
}

export interface AuthenticatedUser {
  id: string
  primaryProvider: AuthProvider
  primaryHandle: string | null
  githubUserId?: string | null
  githubLogin?: string | null
  displayName: string | null
  avatarUrl: string | null
  identities: ConnectedIdentity[]
}

export type AuthSession =
  | { authenticated: false }
  | { authenticated: true; user: AuthenticatedUser }

export const authSessionTimeoutMs = 8_000

export async function getAuthSession(
  fetcher: typeof fetch = fetch,
  timeoutMs = authSessionTimeoutMs,
): Promise<AuthSession> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<Response>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error('Auth session request timed out'))
    }, timeoutMs)
  })

  let response: Response
  try {
    response = await Promise.race([
      fetcher('/api/me', { signal: controller.signal }),
      timeout,
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
  if (response.status === 401) return { authenticated: false }
  if (!response.ok) throw new Error(`Auth session request failed: ${response.status}`)
  return await response.json() as AuthSession
}
