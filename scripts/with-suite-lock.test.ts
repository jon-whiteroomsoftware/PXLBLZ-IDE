import { describe, expect, it } from 'vitest'
import { parseSuiteLockOwner, suiteLockOwnerIsStale } from './with-suite-lock'

describe('suite lock owner parsing', () => {
  it('accepts a complete owner record', () => {
    expect(parseSuiteLockOwner({
      pid: 4242,
      label: 'test:e2e',
      startedAt: '2026-08-07T18:00:00.000Z',
    })).toEqual({ pid: 4242, label: 'test:e2e', startedAt: '2026-08-07T18:00:00.000Z' })
  })

  it('rejects malformed records instead of trusting them', () => {
    for (const value of [null, 'x', 42, {}, { pid: 'nope', label: 'a', startedAt: 'b' }, { pid: 1.5, label: 'a', startedAt: 'b' }]) {
      expect(parseSuiteLockOwner(value)).toBeNull()
    }
  })

  it('rejects non-positive pids: kill(0) probes the whole process group and always looks alive', () => {
    for (const pid of [0, -1, -4242]) {
      expect(parseSuiteLockOwner({ pid, label: 'a', startedAt: 'b' })).toBeNull()
      expect(parseSuiteLockOwner({ pid: 4242, suitePid: pid, label: 'a', startedAt: 'b' })).toBeNull()
    }
  })

  it('carries an optional positive suitePid for the running command', () => {
    expect(parseSuiteLockOwner({ pid: 4242, suitePid: 4243, label: 'a', startedAt: 'b' }))
      .toEqual({ pid: 4242, suitePid: 4243, label: 'a', startedAt: 'b' })
  })
})

describe('suite lock staleness', () => {
  const owner = { pid: 4242, label: 'test:full', startedAt: '2026-08-07T18:00:00.000Z' }

  it('honours a live holder', () => {
    expect(suiteLockOwnerIsStale(owner, 0, () => true)).toBe(false)
  })

  it('reaps a dead holder immediately', () => {
    expect(suiteLockOwnerIsStale(owner, 0, () => false)).toBe(true)
  })

  it('honours the running suite when only the wrapper died: an orphaned suite still owns the machine', () => {
    const orphaned = { ...owner, suitePid: 4243 }
    expect(suiteLockOwnerIsStale(orphaned, 0, (pid) => pid === 4243)).toBe(false)
  })

  it('reaps the lock once wrapper and suite are both gone', () => {
    const orphaned = { ...owner, suitePid: 4243 }
    expect(suiteLockOwnerIsStale(orphaned, 0, () => false)).toBe(true)
  })

  it('tolerates a momentarily ownerless lock: a fresh claim has not written its owner yet', () => {
    expect(suiteLockOwnerIsStale(null, 0, () => true)).toBe(false)
    expect(suiteLockOwnerIsStale(null, 1, () => true)).toBe(false)
  })

  it('reaps an owner that stays unreadable across consecutive polls', () => {
    expect(suiteLockOwnerIsStale(null, 2, () => true)).toBe(true)
  })
})
