import { useEffect, useRef, useState } from 'react'
import { ChevronDown, CircleUser, LogIn, LogOut, ShieldCheck } from 'lucide-react'
import { controlIcon } from '@/components/iconScale'
import { Button } from '@/components/ui/button'
import { docExternalHref } from '@/docs/catalog'
import { getAuthSession, type AuthSession } from '@/engine/authSession'
import { studioWelcomeAcknowledgedKey } from '@/engine/studioAccess'
import { useRouterStore } from '@/store/routerStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { trackEvent } from '@/analytics'

export function AuthStatus() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const navigate = useRouterStore((s) => s.navigate)
  const setPersonalWorkspaceAuthenticated = useWorkspaceStore((s) => s.setPersonalWorkspaceAuthenticated)
  const setPersonalWorkspaceUnavailable = useWorkspaceStore((s) => s.setPersonalWorkspaceUnavailable)
  const personalWorkspaceProbeAttempt = useWorkspaceStore((s) => s.personalWorkspaceProbeAttempt)

  useEffect(() => {
    let cancelled = false
    getAuthSession()
      .then((next) => {
        if (!cancelled) {
          setSession(next)
          setPersonalWorkspaceAuthenticated(next.authenticated)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null)
          setPersonalWorkspaceUnavailable()
        }
      })
    return () => {
      cancelled = true
    }
  }, [personalWorkspaceProbeAttempt, setPersonalWorkspaceAuthenticated, setPersonalWorkspaceUnavailable])

  useEffect(() => {
    if (!accountOpen) return
    const onDown = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [accountOpen])

  if (!session) return null

  if (session?.authenticated) {
    const label = accountLabel(session)

    return (
      <div ref={accountRef} className="relative flex min-w-0 max-w-52 items-center max-[980px]:max-w-36 max-[760px]:max-w-28">
        <button
          type="button"
          aria-label={`Account menu for ${label}`}
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((open) => !open)}
          className={`flex h-7 min-w-0 w-full cursor-pointer items-center gap-1.5 rounded-[min(var(--radius-md),12px)] border pl-1.5 pr-1.5 font-mono text-[11px] transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/40 ${
            accountOpen
              ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
              : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
          }`}
        >
          {session.user.avatarUrl ? (
            <img
              src={session.user.avatarUrl}
              alt=""
              className="size-4 rounded-full border border-zinc-700"
              referrerPolicy="no-referrer"
            />
          ) : (
            <CircleUser size={16} className="shrink-0 text-zinc-500" aria-hidden />
          )}
          <span className="min-w-0 max-w-32 truncate">{label}</span>
          <ChevronDown
            size={13}
            aria-hidden
            className={`shrink-0 text-zinc-500 transition-transform ${accountOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {accountOpen && (
          <div
            role="menu"
            className="absolute right-0 top-8 z-50 w-max min-w-full max-w-64 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
          >
            <div className="border-b border-zinc-800 px-3 py-1.5">
              <p className="font-mono text-[10px] uppercase text-zinc-500">Signed in</p>
              <p className="mt-0.5 truncate font-mono text-xs text-zinc-300">{label}</p>
            </div>
            <a
              href={docExternalHref('privacy')}
              role="menuitem"
              className="mt-1 flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus:bg-zinc-800/70 focus:text-zinc-100 focus:outline-none"
            >
              <ShieldCheck {...controlIcon} className="shrink-0 text-zinc-500" aria-hidden />
              Privacy &amp; account data
            </a>
            <a
              href="/api/auth/logout"
              role="menuitem"
              className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus:bg-zinc-800/70 focus:text-zinc-100 focus:outline-none"
            >
              <LogOut {...controlIcon} className="shrink-0 text-zinc-500" aria-hidden />
              Log out
            </a>
          </div>
        )}
      </div>
    )
  }

  const handleSignIn = () => {
    const acknowledged = (() => {
      try {
        return window.localStorage.getItem(studioWelcomeAcknowledgedKey) === '1'
      } catch {
        return false
      }
    })()
    if (acknowledged) {
      trackEvent('sign_in', { surface: 'auth_button', provider: 'default' })
      window.location.assign('/api/auth/login')
      return
    }
    trackEvent('sign_in', { surface: 'auth_button_welcome', provider: 'choose_later' })
    navigate({ kind: 'studio-welcome' })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-zinc-700 bg-zinc-900 font-mono text-[11px] text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:border-zinc-500 focus-visible:ring-zinc-500/35"
      onClick={handleSignIn}
    >
      <LogIn data-icon="inline-start" />
      Sign in
    </Button>
  )
}

function accountLabel(session: Extract<AuthSession, { authenticated: true }>): string {
  return session.user.primaryHandle ?? session.user.githubLogin ?? session.user.displayName ?? 'Account'
}
