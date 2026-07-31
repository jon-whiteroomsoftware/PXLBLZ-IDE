import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  acquireReviewLock,
  parseReviewLockOwner,
  reviewLockDirectory,
  type ReviewLockOwner,
} from './review-lock'

describe('review serialization lock (#637)', () => {
  let base: string
  const owner = (pid: number): ReviewLockOwner => ({
    pid,
    range: 'aaaa..bbbb',
    startedAt: '2026-07-31T12:00:00.000Z',
  })

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'review-lock-'))
  })
  afterEach(() => {
    rmSync(base, { recursive: true, force: true })
  })

  it('places the lock inside the shared git common directory', () => {
    expect(reviewLockDirectory('/repo/.git')).toBe('/repo/.git/pxlblz/review.lock')
  })

  it('parses valid owners and rejects malformed ones', () => {
    expect(parseReviewLockOwner(JSON.stringify(owner(42)))).toEqual(owner(42))
    expect(parseReviewLockOwner('not json')).toBeNull()
    expect(parseReviewLockOwner('{"pid":"x"}')).toBeNull()
    expect(parseReviewLockOwner('{"pid":-1,"range":"r","startedAt":"t"}')).toBeNull()
  })

  it('acquires immediately when free, creating missing parents, and releases cleanly', async () => {
    const lockDirectory = join(base, 'pxlblz', 'review.lock')
    const first = await acquireReviewLock({
      lockDirectory,
      owner: owner(process.pid),
      waitMs: 1_000,
      pollMs: 1,
    })
    first.release()
    const second = await acquireReviewLock({
      lockDirectory,
      owner: owner(process.pid),
      waitMs: 1_000,
      pollMs: 1,
    })
    second.release()
  })

  it('queues behind a live holder and reports who holds the lock', async () => {
    const lockDirectory = join(base, 'review.lock')
    const held = await acquireReviewLock({
      lockDirectory,
      owner: owner(11111),
      waitMs: 1_000,
      pollMs: 1,
    })
    const waits: Array<ReviewLockOwner | null> = []
    let polls = 0
    const waiter = acquireReviewLock({
      lockDirectory,
      owner: owner(22222),
      waitMs: 5_000,
      pollMs: 1,
      isAlive: () => true,
      onWait: (holder) => waits.push(holder),
      sleep: async () => {
        polls += 1
        if (polls === 3) held.release()
      },
    })
    const handle = await waiter
    handle.release()
    expect(waits.length).toBeGreaterThanOrEqual(3)
    expect(waits[0]).toEqual(owner(11111))
  })

  it('fails closed with cleanup instructions when the holder is dead, deleting nothing (#637)', async () => {
    const lockDirectory = join(base, 'review.lock')
    await acquireReviewLock({
      lockDirectory,
      owner: owner(99999),
      waitMs: 1_000,
      pollMs: 1,
    })

    await expect(acquireReviewLock({
      lockDirectory,
      owner: owner(process.pid),
      waitMs: 1_000,
      pollMs: 1,
      isAlive: () => false,
    })).rejects.toThrow(/pid 99999.*no longer running[\s\S]*rm -rf/)

    // The dead holder's lock is untouched: only an operator removes locks.
    expect(parseReviewLockOwner(
      readFileSync(join(lockDirectory, 'owner.json'), 'utf8'),
    )).toEqual(owner(99999))
  })

  it('keeps waiting when a live successor replaces a dead holder mid-check (#637 P1)', async () => {
    const lockDirectory = join(base, 'review.lock')
    await acquireReviewLock({
      lockDirectory,
      owner: owner(11111),
      waitMs: 1_000,
      pollMs: 1,
    })

    let polls = 0
    const handle = await acquireReviewLock({
      lockDirectory,
      owner: owner(process.pid),
      waitMs: 5_000,
      pollMs: 1,
      isAlive: (pid) => {
        if (pid === 11111) {
          // Simulate the race: a live successor replaces the dead holder
          // between the owner read and this liveness verdict. The waiter
          // must resume waiting -- no abandonment error, no deletion.
          writeFileSync(
            join(lockDirectory, 'owner.json'),
            `${JSON.stringify(owner(22222), null, 2)}\n`,
          )
          return false
        }
        return true
      },
      sleep: async () => {
        polls += 1
        if (polls >= 2) rmSync(lockDirectory, { recursive: true, force: true })
      },
    })
    handle.release()
    expect(polls).toBeGreaterThanOrEqual(2)
  })

  it('atomically replaces an empty legacy lock directory instead of blocking on it', async () => {
    const lockDirectory = join(base, 'review.lock')
    mkdirSync(lockDirectory, { recursive: true })

    // rename(2) may replace an empty target directory, so a bare directory
    // with no contents is claimed directly and safely.
    const handle = await acquireReviewLock({
      lockDirectory,
      owner: owner(process.pid),
      waitMs: 1_000,
      pollMs: 1,
    })
    expect(parseReviewLockOwner(
      readFileSync(join(lockDirectory, 'owner.json'), 'utf8'),
    )).toEqual(owner(process.pid))
    handle.release()
  })

  it('fails closed on a persistently unreadable owner without removing it (#637 P2)', async () => {
    const lockDirectory = join(base, 'review.lock')
    mkdirSync(lockDirectory, { recursive: true })
    writeFileSync(join(lockDirectory, 'owner.json'), 'corrupt, not json')

    await expect(acquireReviewLock({
      lockDirectory,
      owner: owner(process.pid),
      waitMs: 5_000,
      pollMs: 1,
      sleep: async () => {},
    })).rejects.toThrow(/no owner across 3 consecutive checks[\s\S]*rm -rf/)
    expect(readFileSync(join(lockDirectory, 'owner.json'), 'utf8'))
      .toBe('corrupt, not json')
  })

  it('tolerates a transiently unreadable owner during a healthy release teardown', async () => {
    const lockDirectory = join(base, 'review.lock')
    mkdirSync(lockDirectory, { recursive: true })
    writeFileSync(join(lockDirectory, 'owner.json'), 'mid-teardown')

    let polls = 0
    const handle = await acquireReviewLock({
      lockDirectory,
      owner: owner(process.pid),
      waitMs: 5_000,
      pollMs: 1,
      sleep: async () => {
        polls += 1
        if (polls === 2) rmSync(lockDirectory, { recursive: true, force: true })
      },
    })
    handle.release()
    expect(polls).toBe(2)
  })

  it('never releases a lock recorded to a different owner (#637 P1)', async () => {
    const lockDirectory = join(base, 'review.lock')
    const displaced = await acquireReviewLock({
      lockDirectory,
      owner: owner(process.pid),
      waitMs: 1_000,
      pollMs: 1,
    })
    const replacement: ReviewLockOwner = {
      pid: process.pid + 1,
      range: 'cccc..dddd',
      startedAt: '2026-07-31T14:00:00.000Z',
    }
    writeFileSync(
      join(lockDirectory, 'owner.json'),
      `${JSON.stringify(replacement, null, 2)}\n`,
    )

    displaced.release()

    expect(existsSync(join(lockDirectory, 'owner.json'))).toBe(true)
    expect(parseReviewLockOwner(
      readFileSync(join(lockDirectory, 'owner.json'), 'utf8'),
    )).toEqual(replacement)
  })

  it('times out with the holder identity when the holder never releases', async () => {
    const lockDirectory = join(base, 'review.lock')
    await acquireReviewLock({
      lockDirectory,
      owner: owner(33333),
      waitMs: 1_000,
      pollMs: 1,
    })
    let clock = 0
    await expect(acquireReviewLock({
      lockDirectory,
      owner: owner(44444),
      waitMs: 10,
      pollMs: 1,
      isAlive: () => true,
      sleep: async () => {},
      now: () => {
        clock += 6
        return clock
      },
    })).rejects.toThrow(/pid 33333 reviewing aaaa\.\.bbbb/)
  })
})
