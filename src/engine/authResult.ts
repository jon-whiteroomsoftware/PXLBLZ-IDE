// OAuth callbacks redirect back with a short result code and provider so the
// app can record privacy-safe outcomes before removing both query parameters.

export interface AuthResultNotice {
  code: string
  title: string
  detail: string
}

export interface AuthResultEvent {
  outcome: 'success' | 'failure'
  code: string
  provider: 'github' | 'google' | null
}

const NOTICES: Record<string, Omit<AuthResultNotice, 'code'>> = {
  'invalid-link': {
    title: 'Login not connected',
    detail: "That login couldn't be connected to your account. Sign in and try again.",
  },
  'not-configured': {
    title: 'Sign-in unavailable',
    detail: 'Sign-in is temporarily unavailable. Try again later.',
  },
  'no-database': {
    title: 'Sign-in unavailable',
    detail: 'Sign-in is temporarily unavailable. Try again later.',
  },
}

const GENERIC: Omit<AuthResultNotice, 'code'> = {
  title: 'Sign-in did not complete',
  detail: 'Something interrupted the sign-in flow. Try again.',
}

export function readAuthResultNotice(search: string): AuthResultNotice | null {
  const result = readAuthResultEvent(search)
  if (!result || result.outcome === 'success') return null
  return { code: result.code, ...(NOTICES[result.code] ?? GENERIC) }
}

export function readAuthResultEvent(search: string): AuthResultEvent | null {
  const params = new URLSearchParams(search)
  const code = params.get('auth')
  if (!code) return null
  const provider = params.get('auth_provider')
  return {
    outcome: code === 'success' ? 'success' : 'failure',
    code,
    provider: provider === 'github' || provider === 'google' ? provider : null,
  }
}

export function stripAuthResultParam(href: string): string {
  const url = new URL(href)
  if (!url.searchParams.has('auth')) return href
  url.searchParams.delete('auth')
  url.searchParams.delete('auth_provider')
  return url.toString()
}
