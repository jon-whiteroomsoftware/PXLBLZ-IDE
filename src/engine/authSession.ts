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

export async function getAuthSession(fetcher: typeof fetch = fetch): Promise<AuthSession> {
  const response = await fetcher('/api/me')
  if (response.status === 401) return { authenticated: false }
  if (!response.ok) throw new Error(`Auth session request failed: ${response.status}`)
  return await response.json() as AuthSession
}
