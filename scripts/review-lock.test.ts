import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  acquireReviewLock,
  parseReviewLockOwner,
  reapStaleReviewLock,
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

  it('reaps a lock whose owning process is dead', async () => {
    const lockDirectory = join(base, 'review.lock')
    const dead = await acquireReviewLock({
      lockDirectory,
      owner: owner(99999),
      waitMs: 1_000,
      pollMs: 1,
    })
    void dead
    const handle = await acquireReviewLock({
      lockDirectory,
      owner: owner(process.pid),
      waitMs: 1_000,
      pollMs: 1,
      isAlive: () => false,
    })
    handle.release()
  })

  it('reaps only the exact observed-dead owner, never a live successor (#637 P1)', async () => {
    const lockDirectory = join(base, 'review.lock')

    // GPT scenario: reaper observed dead owner A, but successor B acquired
    // meanwhile. The identity precondition must leave B's lock untouched.
    const successor = await acquireReviewLock({
      lockDirectory,
      owner: owner(process.pid),
      waitMs: 1_000,
      pollMs: 1,
    })
    reapStaleReviewLock(lockDirectory, owner(99999), () => false)
    expect(parseReviewLockOwner(
      readFileSync(join(lockDirectory, 'owner.json'), 'utf8'),
    )).toEqual(owner(process.pid))

    // An identity match whose owner is still alive is restored, not reaped.
    reapStaleReviewLock(lockDirectory, owner(process.pid), () => true)
    expect(parseReviewLockOwner(
      readFileSync(join(lockDirectory, 'owner.json'), 'utf8'),
    )).toEqual(owner(process.pid))
    successor.release()
    expect(existsSync(lockDirectory)).toBe(false)

    // The exact observed-dead owner is removed for real.
    await acquireReviewLock({ lockDirectory, owner: owner(77777), waitMs: 1_000, pollMs: 1 })
    reapStaleReviewLock(lockDirectory, owner(77777), () => false)
    expect(existsSync(lockDirectory)).toBe(false)

    // Reaping an already-released lock is a no-op.
    reapStaleReviewLock(lockDirectory, owner(77777), () => false)
    expect(existsSync(lockDirectory)).toBe(false)
  })

  it('reaps an ownerless lock left by a crashed acquisition (#637 P2)', async () => {
    const lockDirectory = join(base, 'review.lock')
    mkdirSync(lockDirectory, { recursive: true })

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
