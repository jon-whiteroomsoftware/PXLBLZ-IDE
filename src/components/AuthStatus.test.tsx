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
        githubUserId: '123',
        githubLogin: 'voidstar',
        displayName: 'Void Star',
        avatarUrl: 'https://example.com/avatar.png',
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
    const logout = screen.getByRole('menuitem', { name: /log out/i })
    expect(logout).toHaveAttribute('href', '/api/auth/logout')

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: /log out/i })).not.toBeInTheDocument())
  })
})
