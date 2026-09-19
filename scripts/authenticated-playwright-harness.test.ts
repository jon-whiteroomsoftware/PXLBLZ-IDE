import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { APIRequestContext, Page } from '@playwright/test'
import {
  AGENT_ACCOUNT_ALLOCATION_LOG,
  AGENT_ACCOUNT_REUSE_AFTER_MS,
  AGENT_CHANNEL_PATH,
  accountSlotForSequence,
  allocateAccountFromCursor,
  allocatePersistedAccountSequence,
  channelOrigin,
  cursorFileName,
  formatAccountAllocation,
  leaveRequestBody,
  leaveRequestHeaders,
  logAccountAllocation,
  observeAgentChannel,
  pageLeaveFetchArgs,
  parseAccountAllocations,
  releaseAgentRegistrations,
  shouldAttemptAgentLeave,
  type PendingAgentRegistration,
} from './authenticated-playwright-harness'
import {
  authenticatedPlaywrightAccountIndex,
  authenticatedPlaywrightAccountsPerWorker,
} from './authenticated-playwright-user'

const CLOCK_START = 1_750_000_000_000

function cursorPath(directory: string, parallelIndex: number): string {
  return join(directory, cursorFileName(parallelIndex))
}

function readCursor(directory: string, parallelIndex: number): { nextSequence: number; lastUsedAtMs: Record<string, number> } {
  return JSON.parse(readFileSync(cursorPath(directory, parallelIndex), 'utf8')) as {
    nextSequence: number
    lastUsedAtMs: Record<string, number>
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('authenticated Playwright TTL-bounded account reuse', () => {
  it('advances through fresh slots and wraps only onto slots aged past TTL plus margin', () => {
    let cursor: unknown
    let now = CLOCK_START
    for (let expected = 0; expected < authenticatedPlaywrightAccountsPerWorker; expected += 1) {
      const allocation = allocateAccountFromCursor(cursor, now)
      expect(allocation.sequence).toBe(expected)
      expect(allocation.slot).toBe(expected)
      cursor = allocation.nextCursor
      now += 1_000
    }
    // 64 s in: every slot is still inside the 360 s reuse window, so the
    // allocator fails loudly instead of silently reusing a live account.
    expect(() => allocateAccountFromCursor(cursor, now)).toThrow(/exhausted/)
    // Once the oldest slot ages out, the monotonic sequence wraps onto it.
    const wrapped = allocateAccountFromCursor(cursor, CLOCK_START + AGENT_ACCOUNT_REUSE_AFTER_MS)
    expect(wrapped.sequence).toBe(authenticatedPlaywrightAccountsPerWorker)
    expect(wrapped.slot).toBe(0)
    expect(accountSlotForSequence(wrapped.sequence)).toBe(0)
  })

  it('serves 200 sequential single-worker allocations on a fake clock without reusing inside the TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(CLOCK_START)
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-cursor-'))
    const lastUse = new Map<number, number>()
    for (let expected = 0; expected < 200; expected += 1) {
      const sequence = allocatePersistedAccountSequence(directory, 0)
      expect(sequence).toBe(expected)
      const slot = accountSlotForSequence(sequence)
      const previous = lastUse.get(slot)
      if (previous !== undefined) {
        expect(Date.now() - previous).toBeGreaterThanOrEqual(AGENT_ACCOUNT_REUSE_AFTER_MS)
      }
      lastUse.set(slot, Date.now())
      vi.setSystemTime(Date.now() + 10_000)
    }
    const stored = readCursor(directory, 0)
    expect(stored.nextSequence).toBe(200)
    expect(Object.keys(stored.lastUsedAtMs)).toHaveLength(authenticatedPlaywrightAccountsPerWorker)
  })

  it('fails loudly instead of reusing when a single worker outruns TTL times pool', () => {
    vi.useFakeTimers()
    vi.setSystemTime(CLOCK_START)
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-cursor-'))
    for (let expected = 0; expected < authenticatedPlaywrightAccountsPerWorker; expected += 1) {
      expect(allocatePersistedAccountSequence(directory, 0)).toBe(expected)
      vi.setSystemTime(Date.now() + 1_000)
    }
    // 1 s per test is far below the ~5.6 s the 64-account pool needs per
    // test, so test 65 must name the remedy rather than reuse account 0.
    expect(() => allocatePersistedAccountSequence(directory, 0)).toThrow(/exhausted/)
    try {
      allocatePersistedAccountSequence(directory, 0)
      expect.unreachable('pool exhaustion must throw')
    } catch (error) {
      expect(String(error)).toMatch(/widen|slow/i)
    }
  })

  it('treats a backwards clock as just-used, never as aged-out', () => {
    let cursor: unknown
    for (let n = 0; n < authenticatedPlaywrightAccountsPerWorker; n += 1) {
      cursor = allocateAccountFromCursor(cursor, CLOCK_START + n * 1_000).nextCursor
    }
    // Every recorded use is in the future relative to this clock reading, so
    // every gap is negative and the scan fails closed instead of reusing.
    expect(() => allocateAccountFromCursor(cursor, CLOCK_START - 1)).toThrow(/exhausted/)
  })

  it('refuses corrupt cursor state and a broken clock instead of silently reusing accounts', () => {
    for (const persisted of [null, '3', [1], -1, 1.5, Number.NaN, {}, { nextSequence: 'a' }, { nextSequence: -2 }, { nextSequence: 1, lastUsedAtMs: 'x' }, { nextSequence: 1, lastUsedAtMs: { 0: -5 } }]) {
      expect(() => allocateAccountFromCursor(persisted, CLOCK_START), `persisted=${JSON.stringify(persisted)}`).toThrow(/cursor/i)
    }
    expect(() => allocateAccountFromCursor(undefined, Number.NaN)).toThrow(/clock/i)
    expect(() => allocateAccountFromCursor(undefined, -1)).toThrow(/clock/i)
    expect(() => accountSlotForSequence(-1)).toThrow(/out of range/)
  })

  it('accepts a cursor written before last-use timestamps as all-unused', () => {
    const allocation = allocateAccountFromCursor({ nextSequence: 41 }, CLOCK_START)
    expect(allocation.sequence).toBe(41)
    expect(allocation.slot).toBe(41)
  })
})

describe('authenticated Playwright persisted account cursor IO', () => {
  it('continues the persisted cursor across restarts instead of resetting to zero', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-cursor-'))
    expect(allocatePersistedAccountSequence(directory, 0)).toBe(0)
    expect(allocatePersistedAccountSequence(directory, 0)).toBe(1)
    expect(allocatePersistedAccountSequence(directory, 0)).toBe(2)
    const stored = readCursor(directory, 0)
    expect(stored.nextSequence).toBe(3)
    expect(Object.keys(stored.lastUsedAtMs)).toHaveLength(3)
    // A restarted worker carries no memory: it re-reads the same file and
    // continues with fresh accounts rather than reusing the dead run.
    expect(allocatePersistedAccountSequence(directory, 0)).toBe(3)
    expect(allocatePersistedAccountSequence(directory, 0)).toBe(4)
  })

  it('keeps parallel slots on independent cursors that map to disjoint accounts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-cursor-'))
    expect(allocatePersistedAccountSequence(directory, 0)).toBe(0)
    expect(allocatePersistedAccountSequence(directory, 1)).toBe(0)
    expect(allocatePersistedAccountSequence(directory, 0)).toBe(1)
    expect(readCursor(directory, 1).nextSequence).toBe(1)
    expect(authenticatedPlaywrightAccountIndex(0, accountSlotForSequence(1))).toBe(1)
    expect(authenticatedPlaywrightAccountIndex(1, accountSlotForSequence(0))).toBe(authenticatedPlaywrightAccountsPerWorker)
  })

  it('refuses a corrupt cursor file instead of reusing accounts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-cursor-'))
    const file = cursorPath(directory, 0)
    for (const raw of ['not json{', 'null', '[1]', '{"nextSequence":"3"}', '{"nextSequence":-1}', '{"nextSequence":2.5}', '{"nextSequence":1,"lastUsedAtMs":{"0":"yesterday"}}']) {
      writeFileSync(file, raw, 'utf8')
      expect(() => allocatePersistedAccountSequence(directory, 0), `raw=${raw}`).toThrow(/corrupt|read/i)
    }
  })

  it('serializes concurrent allocations from two async callers onto distinct sequences', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-cursor-'))
    expect(allocatePersistedAccountSequence(directory, 0)).toBe(0)
    const [first, second] = await Promise.all([
      (async () => allocatePersistedAccountSequence(directory, 0))(),
      (async () => allocatePersistedAccountSequence(directory, 0))(),
    ])
    expect(new Set([first, second])).toEqual(new Set([1, 2]))
    expect(readCursor(directory, 0).nextSequence).toBe(3)
    expect(readdirSync(directory).filter((entry) => entry.endsWith('.lock'))).toEqual([])
  })

  it('leaves no lock directory behind and writes the cursor through on every allocation', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-cursor-'))
    allocatePersistedAccountSequence(directory, 2)
    expect(readdirSync(directory)).toEqual([cursorFileName(2)])
    expect(readCursor(directory, 2).nextSequence).toBe(1)
  })

  it('applies the same TTL rule to ad-hoc runs without a run directory', () => {
    vi.useFakeTimers()
    vi.setSystemTime(CLOCK_START)
    for (let expected = 0; expected < authenticatedPlaywrightAccountsPerWorker; expected += 1) {
      expect(allocatePersistedAccountSequence(undefined, 29)).toBe(expected)
      vi.setSystemTime(Date.now() + 1_000)
    }
    expect(() => allocatePersistedAccountSequence(undefined, 29)).toThrow(/exhausted/)
  })

  it('names one cursor file per parallel worker without path separators', () => {
    expect(cursorFileName(0)).toBe('agent-account-cursor-0.json')
    expect(cursorFileName(3)).not.toBe(cursorFileName(0))
    expect(cursorFileName(2)).not.toMatch(/[/\\]/)
  })
})

describe('authenticated Playwright agent registration tracking', () => {
  it('retains each registered window until its own leave arrives', () => {
    const registered = observeAgentChannel([], {
      type: 'register',
      sessionId: 'session-a',
      showId: 'show-a',
      registrationId: 'registration-a',
    })
    expect(registered).toEqual([{ sessionId: 'session-a', showId: 'show-a', registrationId: 'registration-a' }])
    const afterLeave = observeAgentChannel(registered, { type: 'leave', registrationId: 'registration-a' })
    expect(afterLeave).toEqual([])
  })

  it('dedupes repeat register observations and ignores channel traffic without an identity', () => {
    const once = observeAgentChannel([], {
      type: 'register',
      sessionId: 'session-a',
      showId: 'show-a',
      registrationId: 'registration-a',
    })
    const twice = observeAgentChannel(once, {
      type: 'register',
      sessionId: 'session-a',
      showId: 'show-a',
      registrationId: 'registration-a',
    })
    expect(twice).toHaveLength(1)
    expect(observeAgentChannel(twice, { type: 'heartbeat', registrationId: 'registration-a' })).toHaveLength(1)
    expect(observeAgentChannel(twice, { type: 'register', sessionId: 'session-a', showId: 'show-a' })).toHaveLength(1)
    expect(observeAgentChannel(twice, { type: 'leave', registrationId: 'registration-unknown' })).toHaveLength(1)
    expect(observeAgentChannel(twice, { type: 'register' })).toHaveLength(1)
  })

  it('keeps concurrent windows side by side and retires only the window that left', () => {
    const first = observeAgentChannel([], {
      type: 'register',
      sessionId: 'session-a',
      showId: 'show-a',
      registrationId: 'registration-a',
    })
    const both = observeAgentChannel(first, {
      type: 'register',
      sessionId: 'session-b',
      showId: 'show-b',
      registrationId: 'registration-b',
    })
    expect(both).toHaveLength(2)
    const remaining = observeAgentChannel(both, { type: 'leave', registrationId: 'registration-a' })
    expect(remaining).toEqual([{ sessionId: 'session-b', showId: 'show-b', registrationId: 'registration-b' }])
  })
})

describe('authenticated Playwright agent release decision', () => {
  const registration: PendingAgentRegistration = { sessionId: 'session-a', showId: 'show-a', registrationId: 'registration-a' }

  it('skips the release round trip when nothing registered', () => {
    expect(shouldAttemptAgentLeave(0)).toBe(false)
    expect(shouldAttemptAgentLeave(1)).toBe(true)
    expect(shouldAttemptAgentLeave(8)).toBe(true)
  })

  it('sends the product leave shape for the exact window that registered', () => {
    expect(leaveRequestBody(registration)).toEqual({
      type: 'leave',
      registrationId: 'registration-a',
      sessionId: 'session-a',
      showId: 'show-a',
    })
  })

  it('carries the JSON content type and the runtime origin the route requires', () => {
    expect(leaveRequestHeaders('https://app.test')).toEqual({
      'Content-Type': 'application/json',
      Origin: 'https://app.test',
    })
    expect(() => leaveRequestHeaders('')).toThrow(/origin/i)
    expect(channelOrigin('http://localhost:5174/PXLBLZ-IDE/')).toBe('http://localhost:5174')
    expect(() => channelOrigin(undefined)).toThrow(/baseURL/i)
    expect(() => channelOrigin('not a url')).toThrow(/baseURL|parse/i)
  })

  it('builds a keepalive same-origin page fetch for the identical leave body', () => {
    const args = pageLeaveFetchArgs(registration)
    expect(args.path).toBe(AGENT_CHANNEL_PATH)
    expect(args.init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
    })
    expect(JSON.parse(args.init.body)).toEqual(leaveRequestBody(registration))
  })

  it('sends the leave from the page when it is still alive', async () => {
    const evaluated: unknown[] = []
    const page = {
      isClosed: () => false,
      evaluate: async (_callback: unknown, arg: unknown) => {
        evaluated.push(arg)
      },
    } as unknown as Page
    const posted: unknown[] = []
    const request = {
      post: async (_url: string, options: unknown) => {
        posted.push(options)
        return { text: async () => '' }
      },
    } as unknown as APIRequestContext
    await releaseAgentRegistrations({ page, request, origin: 'http://localhost:5174' }, [registration])
    expect(evaluated).toHaveLength(1)
    const [evalPath, evalInit] = evaluated[0] as [string, { body: string; keepalive: boolean }]
    expect(evalPath).toBe(AGENT_CHANNEL_PATH)
    expect(evalInit.keepalive).toBe(true)
    expect(JSON.parse(evalInit.body)).toEqual(leaveRequestBody(registration))
    expect(posted).toHaveLength(0)
  })

  it('falls back to the request transport with an explicit Origin when the page is closed', async () => {
    const evaluated: unknown[] = []
    const page = {
      isClosed: () => true,
      evaluate: async (_callback: unknown, arg: unknown) => {
        evaluated.push(arg)
      },
    } as unknown as Page
    const posted: Array<{ data: unknown; headers: Record<string, string> }> = []
    const request = {
      post: async (_url: string, options: { data: unknown; headers: Record<string, string> }) => {
        posted.push(options)
        return { text: async () => '' }
      },
    } as unknown as APIRequestContext
    await releaseAgentRegistrations({ page, request, origin: 'http://localhost:5174' }, [registration])
    expect(evaluated).toHaveLength(0)
    expect(posted).toHaveLength(1)
    expect(posted[0].data).toEqual(leaveRequestBody(registration))
    expect(posted[0].headers.Origin).toBe('http://localhost:5174')
  })

  it('falls back to the request transport when the page fetch throws', async () => {
    const page = {
      isClosed: () => false,
      evaluate: async () => {
        throw new Error('Target crashed')
      },
    } as unknown as Page
    const posted: unknown[] = []
    const request = {
      post: async () => {
        posted.push(true)
        return { text: async () => '' }
      },
    } as unknown as APIRequestContext
    await releaseAgentRegistrations({ page, request, origin: 'http://localhost:5174' }, [registration])
    expect(posted).toHaveLength(1)
  })

  it('never throws and never posts when there is nothing to release', async () => {
    const page = { isClosed: () => false, evaluate: async () => { throw new Error('must not run') } } as unknown as Page
    const request = {
      post: async () => {
        throw new Error('must not run')
      },
    } as unknown as APIRequestContext
    await expect(releaseAgentRegistrations({ page, request, origin: 'http://localhost:5174' }, [])).resolves.toBeUndefined()
  })
})

describe('authenticated Playwright account allocation log', () => {
  it('formats one JSON allocation per line', () => {
    expect(formatAccountAllocation({ parallelIndex: 2, sequence: 7, accountIndex: 135 })).toBe(
      '{"parallelIndex":2,"sequence":7,"accountIndex":135}\n',
    )
  })

  it('parses the log back and skips blank or corrupt lines', () => {
    const first = { parallelIndex: 0, sequence: 0, accountIndex: 0 }
    const second = { parallelIndex: 3, sequence: 1, accountIndex: 193 }
    const text = `${formatAccountAllocation(first)}not json\n\n${formatAccountAllocation(second)}`
    expect(parseAccountAllocations(text)).toEqual([first, second])
  })

  it('rejects records without integer allocation fields', () => {
    expect(parseAccountAllocations('{"parallelIndex":0,"sequence":"x","accountIndex":1}\n')).toEqual([])
    expect(parseAccountAllocations('{"parallelIndex":0}\n')).toEqual([])
    expect(parseAccountAllocations('')).toEqual([])
  })

  it('appends one line per allocation without throwing when there is no run directory', () => {
    expect(() => logAccountAllocation(undefined, { parallelIndex: 0, sequence: 0, accountIndex: 0 })).not.toThrow()
  })

  it('appends every allocation to the run log so a probe can audit account reuse', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-alloc-'))
    const first = { parallelIndex: 0, sequence: 0, accountIndex: 0 }
    const second = { parallelIndex: 0, sequence: 1, accountIndex: 1 }
    logAccountAllocation(directory, first)
    logAccountAllocation(directory, second)
    expect(parseAccountAllocations(readFileSync(join(directory, AGENT_ACCOUNT_ALLOCATION_LOG), 'utf8'))).toEqual([
      first,
      second,
    ])
  })

  it('never throws when the log cannot be written', () => {
    expect(() =>
      logAccountAllocation(join(tmpdir(), 'pxlblz-alloc-no-such-dir'), { parallelIndex: 0, sequence: 0, accountIndex: 0 }),
    ).not.toThrow()
  })
})
