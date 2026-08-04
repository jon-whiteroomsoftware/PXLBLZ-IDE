import {
  executeBetaAccessCommand,
  parseBetaAccessArgs,
  type BetaAccessCommandStore,
} from './beta-access-lib'
import type { BetaAccessEntry } from '../src/cloudflare/betaAccess'

describe('beta-access CLI', () => {
  it('parses explicit local and remote commands without accepting ambiguous input', () => {
    expect(parseBetaAccessArgs(['list'])).toEqual({ command: 'list', remote: false })
    expect(parseBetaAccessArgs(['list', '--remote'])).toEqual({ command: 'list', remote: true })
    expect(parseBetaAccessArgs([
      'add', ' Friend@Example.COM ', '--label', 'Jane', '--remote', '--yes',
    ])).toEqual({
      command: 'add',
      email: 'friend@example.com',
      label: 'Jane',
      remote: true,
      yes: true,
    })
    expect(parseBetaAccessArgs(['disable', 'friend@example.com'])).toEqual({
      command: 'disable',
      email: 'friend@example.com',
      remote: false,
      yes: false,
    })
    expect(() => parseBetaAccessArgs(['add', 'friend@example.com', '--unknown'])).toThrow(/unknown option/i)
    expect(() => parseBetaAccessArgs(['remove'])).toThrow(/requires an email/i)
    expect(() => parseBetaAccessArgs(['list', 'friend@example.com'])).toThrow(/does not accept/i)
  })

  it('confirms production changes and makes repeated row operations explicit no-ops', async () => {
    const entries = new Map<string, BetaAccessEntry>([[
      'owner@example.com',
      { email: 'owner@example.com', label: 'Owner', enabled: true, userId: 'github:owner' },
    ]])
    const store: BetaAccessCommandStore = {
      list: async () => [...entries.values()],
      getByEmail: async (email) => entries.get(email) ?? null,
      add: async (email, label) => entries.set(email, {
        email, label, enabled: true, userId: entries.get(email)?.userId ?? null,
      }),
      disable: async (email) => {
        const entry = entries.get(email)
        if (entry) entries.set(email, { ...entry, enabled: false })
      },
      remove: async (email) => { entries.delete(email) },
    }
    const messages: string[] = []
    const declined = await executeBetaAccessCommand(
      parseBetaAccessArgs(['add', 'friend@example.com', '--remote']),
      store,
      { log: (message) => messages.push(message), confirm: async () => false },
    )
    expect(declined).toBe('cancelled')
    expect(entries.has('friend@example.com')).toBe(false)

    await expect(executeBetaAccessCommand(
      parseBetaAccessArgs(['add', 'friend@example.com', '--label', 'Friend', '--remote', '--yes']),
      store,
      { log: (message) => messages.push(message), confirm: async () => true },
    )).resolves.toBe('changed')
    await expect(executeBetaAccessCommand(
      parseBetaAccessArgs(['add', 'friend@example.com', '--label', 'Friend', '--remote', '--yes']),
      store,
      { log: (message) => messages.push(message), confirm: async () => true },
    )).resolves.toBe('unchanged')

    expect(entries.get('owner@example.com')).toMatchObject({ enabled: true, userId: 'github:owner' })
    expect(messages.join('\n')).toMatch(/production/i)
    expect(messages.join('\n')).toMatch(/no change/i)
  })
})
