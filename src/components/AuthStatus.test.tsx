import { render, screen, waitFor } from '@testing-library/react'
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
  it('opens a clear logout menu from the signed-in account pill', async () => {
    render(<AuthStatus />)

    const account = await screen.findByRole('button', { name: /account menu for voidstar/i })
    expect(account).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menuitem', { name: /log out/i })).not.toBeInTheDocument()

    await userEvent.click(account)

    expect(account).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Connected logins')).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /connect google/i })).toHaveAttribute(
      'href',
      '/api/auth/login?provider=google&mode=link',
    )
    expect(screen.getByRole('menuitem', { name: /disconnect github/i })).toBeDisabled()
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
