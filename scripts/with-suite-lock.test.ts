import { describe, expect, it } from 'vitest'
import {
  parseSuiteLockOwner,
  suiteLockOwnerIsStale,
  suiteOwnerAfterSpawn,
} from './with-suite-lock'

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
    }
  })
})

describe('ownership handoff to the running suite', () => {
  const owner = { pid: 4242, label: 'test:full', startedAt: '2026-08-07T18:00:00.000Z' }

  it('moves pid to the spawned suite so any revision honours the real holder', () => {
    expect(suiteOwnerAfterSpawn(owner, 4243))
      .toEqual({ pid: 4243, label: 'test:full', startedAt: '2026-08-07T18:00:00.000Z' })
  })

  it('keeps the wrapper as owner when the spawned pid is unusable', () => {
    for (const childPid of [undefined, 0, -1]) {
      expect(suiteOwnerAfterSpawn(owner, childPid)).toEqual(owner)
    }
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

  it('tolerates a momentarily ownerless lock: a fresh claim has not written its owner yet', () => {
    expect(suiteLockOwnerIsStale(null, 0, () => true)).toBe(false)
    expect(suiteLockOwnerIsStale(null, 1, () => true)).toBe(false)
  })

  it('reaps an owner that stays unreadable across consecutive polls', () => {
    expect(suiteLockOwnerIsStale(null, 2, () => true)).toBe(true)
  })
})
