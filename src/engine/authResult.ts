// OAuth callback failures redirect back to the app with `?auth=<code>`
// (functions/api/auth/callback.ts). Successful sign-ins redirect with no
// param, so any present code means the flow ended without a session.

export interface AuthResultNotice {
  code: string
  title: string
  detail: string
}

const NOTICES: Record<string, Omit<AuthResultNotice, 'code'>> = {
  'not-allowed': {
    title: 'Studio access not enabled',
    detail: "Sign-in worked, but this account isn't on the invite list yet.",
  },
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
  const code = new URLSearchParams(search).get('auth')
  if (!code) return null
  return { code, ...(NOTICES[code] ?? GENERIC) }
}

export function stripAuthResultParam(href: string): string {
  const url = new URL(href)
  if (!url.searchParams.has('auth')) return href
  url.searchParams.delete('auth')
  return url.toString()
}
