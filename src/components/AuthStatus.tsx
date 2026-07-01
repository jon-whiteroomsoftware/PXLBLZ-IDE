import { useEffect, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAuthSession, type AuthSession } from '@/engine/authSession'
import { resolvePersonalContentProviderMode } from '@/engine/personalContentProvider'

export function AuthStatus() {
  const cloudMode = resolvePersonalContentProviderMode(import.meta.env.VITE_PERSONAL_CONTENT_PROVIDER, {
    prod: import.meta.env.PROD,
    baseUrl: import.meta.env.BASE_URL,
  }) === 'remote-api'
  const [session, setSession] = useState<AuthSession | null>(null)

  useEffect(() => {
    if (!cloudMode) return
    let cancelled = false
    getAuthSession()
      .then((next) => {
        if (!cancelled) setSession(next)
      })
      .catch(() => {
        if (!cancelled) setSession({ authenticated: false })
      })
    return () => {
      cancelled = true
    }
  }, [cloudMode])

  if (!cloudMode) return null
  if (!session) return null

  if (session?.authenticated) {
    return (
      <span className="flex h-7 items-center gap-2 rounded-md border border-seam bg-zinc-950/50 pl-1.5 pr-1 text-xs text-zinc-300">
        <img
          src={session.user.avatarUrl}
          alt=""
          className="size-4 rounded-full border border-zinc-700"
          referrerPolicy="no-referrer"
        />
        <span className="max-w-28 truncate">{session.user.githubLogin}</span>
        <Button asChild variant="ghost" size="icon-xs" aria-label="Sign out">
          <a href="/api/auth/logout">
            <LogOut />
          </a>
        </Button>
      </span>
    )
  }

  return (
    <Button asChild variant="outline" size="sm">
      <a href="/api/auth/login">
        <LogIn data-icon="inline-start" />
        Sign in
      </a>
    </Button>
  )
}
