import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AuthStatus } from './AuthStatus'

vi.mock('@/engine/authSession', () => ({
  getAuthSession: () =>
    Promise.resolve({
      authenticated: true,
      user: {
        id: 'user-1',
        primaryProvider: 'github',
        primaryHandle: 'voidstar',
        githubUserId: '123',
        githubLogin: 'voidstar',
        displayName: 'Void Star',
        avatarUrl: 'https://example.com/avatar.png',
        identities: [
          {
            provider: 'github',
            providerUserId: '123',
            handle: 'voidstar',
            email: null,
            emailVerified: null,
          },
        ],
      },
    }),
}))

describe('AuthStatus', () => {
  it('opens a minimal account menu without provider plumbing (#701)', async () => {
    render(<AuthStatus />)

    const account = await screen.findByRole('button', { name: /account menu for voidstar/i })
    expect(account).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menuitem', { name: /log out/i })).not.toBeInTheDocument()

    await userEvent.click(account)

    expect(account).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('Signed in')).toBeInTheDocument()
    expect(within(menu).getByText('voidstar')).toBeInTheDocument()

    // The multi-provider identity machinery stays hidden: no login roster,
    // no per-provider connect/disconnect items (#701).
    expect(screen.queryByText(/connected logins/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /connect /i })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /disconnect /i })).not.toBeInTheDocument()

    expect(screen.getByRole('menuitem', { name: /privacy & account data/i })).toHaveAttribute(
      'href',
      '/docs/privacy',
    )
    const logout = screen.getByRole('menuitem', { name: /log out/i })
    expect(logout).toHaveAttribute('href', '/api/auth/logout')

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: /log out/i })).not.toBeInTheDocument())
  })
})
