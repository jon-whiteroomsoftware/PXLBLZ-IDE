import { useEffect, useRef, useState } from 'react'
import { ChevronDown, CircleUser, Link2, LogIn, LogOut, ShieldCheck, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { docExternalHref } from '@/docs/catalog'
import { getAuthSession, type AuthProvider, type AuthSession } from '@/engine/authSession'
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

  const refreshSession = () => {
    getAuthSession()
      .then((next) => {
        setSession(next)
        setPersonalWorkspaceAuthenticated(next.authenticated)
      })
      .catch(() => {
        setSession(null)
        setPersonalWorkspaceUnavailable()
      })
  }

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

  const disconnectProvider = async (provider: AuthProvider) => {
    const response = await fetch(`/api/auth/disconnect?provider=${provider}`, { method: 'POST' })
    if (response.ok) refreshSession()
  }

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
    const connectedProviders = new Set(session.user.identities.map((identity) => identity.provider))
    const canDisconnect = session.user.identities.length > 1
    const missingProviders: AuthProvider[] = (['github', 'google'] as const)
      .filter((provider) => !connectedProviders.has(provider))

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
            className="absolute right-0 top-8 z-50 w-full min-w-full rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
          >
            <div className="border-b border-zinc-800 px-3 py-1.5">
              <p className="font-mono text-[10px] uppercase text-zinc-500">Connected logins</p>
              <div className="mt-1 space-y-0.5">
                {session.user.identities.map((identity) => (
                  <div key={`${identity.provider}:${identity.providerUserId}`} className="flex items-center justify-between gap-2 font-mono text-xs text-zinc-300">
                    <span className="truncate">{providerLabel(identity.provider)}</span>
                    <span className="truncate text-zinc-500">{identity.handle ?? identity.email ?? identity.providerUserId}</span>
                  </div>
                ))}
              </div>
            </div>
            {missingProviders.map((provider) => (
              <a
                key={provider}
                href={`/api/auth/login?provider=${provider}&mode=link`}
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus:bg-zinc-800/70 focus:text-zinc-100 focus:outline-none"
              >
                <Link2 size={13} strokeWidth={2.4} className="shrink-0 text-zinc-500" aria-hidden />
                Connect {providerLabel(provider)}
              </a>
            ))}
            {session.user.identities.map((identity) => (
              <button
                key={`disconnect:${identity.provider}:${identity.providerUserId}`}
                type="button"
                role="menuitem"
                disabled={!canDisconnect}
                onClick={() => void disconnectProvider(identity.provider)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus:bg-zinc-800/70 focus:text-zinc-100 focus:outline-none disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
              >
                <Unlink size={13} strokeWidth={2.4} className="shrink-0 text-zinc-500" aria-hidden />
                Disconnect {providerLabel(identity.provider)}
              </button>
            ))}
            <a
              href={docExternalHref('privacy')}
              role="menuitem"
              className="mt-1 flex w-full items-center gap-2 border-t border-zinc-800 px-3 py-1.5 text-left font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus:bg-zinc-800/70 focus:text-zinc-100 focus:outline-none"
            >
              <ShieldCheck size={13} strokeWidth={2.4} className="shrink-0 text-zinc-500" aria-hidden />
              Privacy &amp; account data
            </a>
            <a
              href="/api/auth/logout"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus:bg-zinc-800/70 focus:text-zinc-100 focus:outline-none"
            >
              <LogOut size={13} strokeWidth={2.4} className="shrink-0 text-zinc-500" aria-hidden />
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

function providerLabel(provider: AuthProvider): string {
  return provider === 'google' ? 'Google' : 'GitHub'
}
