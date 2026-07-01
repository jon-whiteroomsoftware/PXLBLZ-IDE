export interface AuthenticatedUser {
  id: string
  githubUserId: string
  githubLogin: string
  displayName: string
  avatarUrl: string
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
