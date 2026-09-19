import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AGENT_ACCOUNT_ALLOCATION_LOG,
  allocateAccountSequence,
  cursorFileName,
  formatAccountAllocation,
  leaveRequestBody,
  logAccountAllocation,
  observeAgentChannel,
  parseAccountAllocations,
  shouldAttemptAgentLeave,
} from './authenticated-playwright-harness'

describe('authenticated Playwright account cursor', () => {
  it('starts a fresh worker at the first account and advances the cursor', () => {
    expect(allocateAccountSequence(undefined)).toEqual({ sequence: 0, nextCursor: 1 })
    expect(allocateAccountSequence({ nextSequence: 0 })).toEqual({ sequence: 0, nextCursor: 1 })
    expect(allocateAccountSequence({ nextSequence: 41 })).toEqual({ sequence: 41, nextCursor: 42 })
  })

  it('refuses a corrupt cursor instead of silently reusing accounts', () => {
    for (const persisted of [null, '3', -1, 1.5, Number.NaN, {}, { nextSequence: 'a' }, { nextSequence: -2 }]) {
      expect(() => allocateAccountSequence(persisted), `persisted=${JSON.stringify(persisted)}`).toThrow(/cursor/i)
    }
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
  it('skips the release round trip when nothing registered', () => {
    expect(shouldAttemptAgentLeave(0)).toBe(false)
    expect(shouldAttemptAgentLeave(1)).toBe(true)
    expect(shouldAttemptAgentLeave(8)).toBe(true)
  })

  it('sends the product leave shape for the exact window that registered', () => {
    expect(leaveRequestBody({ sessionId: 'session-a', showId: 'show-a', registrationId: 'registration-a' })).toEqual({
      type: 'leave',
      registrationId: 'registration-a',
      sessionId: 'session-a',
      showId: 'show-a',
    })
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
