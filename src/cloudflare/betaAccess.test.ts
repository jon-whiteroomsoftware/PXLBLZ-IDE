import {
  authorizeBetaSession,
  claimBetaAccess,
  decideBetaOAuthAccess,
  normalizeBetaAccessEmail,
  resolveBetaOAuthAdmission,
  type BetaAccessEntry,
  type BetaAccessStore,
} from './betaAccess'

describe('beta access', () => {
  it('normalizes plausible email identities and rejects malformed input', () => {
    expect(normalizeBetaAccessEmail('  Friend@Example.COM ')).toBe('friend@example.com')
    expect(() => normalizeBetaAccessEmail('not-an-email')).toThrow(/valid email/i)
    expect(() => normalizeBetaAccessEmail('two@example.com,other@example.com')).toThrow(/valid email/i)
  })

  it('uses the legacy gate only while empty, then makes disable revoke an existing session', async () => {
    const entries = new Map<string, BetaAccessEntry>()
    let authoritative = false
    const store: BetaAccessStore = {
      isAuthoritative: async () => authoritative,
      count: async () => entries.size,
      getByEmail: async (email) => entries.get(email) ?? null,
      findActiveForUser: async (userId) => (
        [...entries.values()].find((entry) => entry.enabled && entry.userId === userId) ?? null
      ),
      bindUser: async (email, userId) => {
        const entry = entries.get(email)
        if (entry) entries.set(email, { ...entry, userId })
      },
    }

    await expect(decideBetaOAuthAccess(store, {
      verifiedEmail: 'owner@example.com',
      existingUserId: null,
    })).resolves.toBe('legacy')

    entries.set('owner@example.com', {
      email: 'owner@example.com',
      label: 'Owner',
      enabled: true,
      userId: 'github:owner',
    })
    authoritative = true
    await expect(authorizeBetaSession(store, 'github:owner')).resolves.toBe(true)

    entries.set('owner@example.com', { ...entries.get('owner@example.com')!, enabled: false })
    await expect(authorizeBetaSession(store, 'github:owner')).resolves.toBe(false)
    await expect(decideBetaOAuthAccess(store, {
      verifiedEmail: 'owner@example.com',
      existingUserId: 'github:owner',
    })).resolves.toBe('denied')

    entries.clear()
    await expect(authorizeBetaSession(store, 'github:owner')).resolves.toBe(false)
    await expect(decideBetaOAuthAccess(store, {
      verifiedEmail: 'owner@example.com',
      existingUserId: 'github:owner',
    })).resolves.toBe('denied')
  })

  it('claims one active email for one stable user without stealing an existing claim', async () => {
    const entries = new Map<string, BetaAccessEntry>([[
      'friend@example.com',
      { email: 'friend@example.com', label: 'Friend', enabled: true, userId: null },
    ]])
    const store: BetaAccessStore = {
      isAuthoritative: async () => true,
      count: async () => entries.size,
      getByEmail: async (email) => entries.get(email) ?? null,
      findActiveForUser: async (userId) => (
        [...entries.values()].find((entry) => entry.enabled && entry.userId === userId) ?? null
      ),
      bindUser: async (email, userId) => {
        const entry = entries.get(email)
        if (entry) entries.set(email, { ...entry, userId })
      },
    }

    await expect(claimBetaAccess(store, 'Friend@Example.com', 'github:friend')).resolves.toBeUndefined()
    expect(entries.get('friend@example.com')?.userId).toBe('github:friend')
    await expect(claimBetaAccess(store, 'friend@example.com', 'google:someone-else'))
      .rejects.toThrow(/another user/i)
    expect(entries.get('friend@example.com')?.userId).toBe('github:friend')
  })

  it('reuses a claimed stable user for a new provider and rejects conflicting identities', async () => {
    const entry: BetaAccessEntry = {
      email: 'owner@example.com',
      label: 'Owner',
      enabled: true,
      userId: 'github:owner',
    }
    const store: BetaAccessStore = {
      isAuthoritative: async () => true,
      count: async () => 1,
      getByEmail: async () => entry,
      findActiveForUser: async (userId) => userId === entry.userId ? entry : null,
      bindUser: async () => undefined,
    }

    await expect(resolveBetaOAuthAdmission(store, {
      verifiedEmail: 'owner@example.com',
      existingUserId: null,
    })).resolves.toEqual({ decision: 'allowed', userId: 'github:owner' })
    await expect(resolveBetaOAuthAdmission(store, {
      verifiedEmail: 'owner@example.com',
      existingUserId: 'github:someone-else',
    })).resolves.toEqual({ decision: 'denied', userId: null })
  })
})
