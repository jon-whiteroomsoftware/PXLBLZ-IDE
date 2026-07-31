/**
 * Review serialization lock (#637). Two concurrent `review:candidate` runs
 * contend for reviewer quota and can starve each other into their caps, so
 * reviews queue on an exclusive lock in the shared git common directory
 * (worktrees share it). The claim primitive is `mkdir`, the only POSIX
 * create-if-absent that refuses every existing directory -- rename is
 * disqualified because it can replace an EMPTY directory, and a lock being
 * torn down by a releasing holder is transiently empty, so rename-based
 * claiming could seize a mid-release lock and then be destroyed by the
 * still-running removal. owner.json (pid, range, start time) is written
 * immediately after the claim; the microseconds-wide ownerless instants
 * (post-mkdir and mid-release) are absorbed by a short grace period.
 *
 * There is deliberately NO automatic reaping. POSIX filesystems provide no
 * compare-and-delete, so every automatic-removal scheme has an interleaving
 * in which a delayed reaper displaces a live successor's lock and two
 * reviews run concurrently (successive review rounds of adversarial
 * analysis kept finding them). Instead, this follows git's own index.lock
 * design: a lock is removed only by its holder's release or by an explicit
 * operator command, and a dead or persistently ownerless holder fails the
 * run immediately with exact cleanup instructions. Serialization is
 * therefore unconditional; the cost is one manual removal after a crash.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ReviewLockOwner {
  pid: number
  range: string
  startedAt: string
}

export function reviewLockDirectory(gitCommonDirectory: string): string {
  return join(gitCommonDirectory, 'pxlblz', 'review.lock')
}

export function parseReviewLockOwner(raw: string): ReviewLockOwner | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ReviewLockOwner>
    if (typeof parsed.pid !== 'number'
      || !Number.isInteger(parsed.pid)
      || parsed.pid <= 0
      || typeof parsed.range !== 'string'
      || typeof parsed.startedAt !== 'string') return null
    return parsed as ReviewLockOwner
  } catch {
    return null
  }
}

export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export interface AcquireReviewLockOptions {
  lockDirectory: string
  owner: ReviewLockOwner
  /** Total time to wait for the holder before giving up. */
  waitMs: number
  pollMs: number
  isAlive?: (pid: number) => boolean
  onWait?: (holder: ReviewLockOwner | null, waitedMs: number) => void
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export interface ReviewLockHandle {
  release: () => void
}

const defaultSleep = (ms: number): Promise<void> => (
  new Promise((resolve) => setTimeout(resolve, ms))
)

function readLockOwner(lockDirectory: string): ReviewLockOwner | null {
  try {
    return parseReviewLockOwner(
      readFileSync(join(lockDirectory, 'owner.json'), 'utf8'),
    )
  } catch {
    return null
  }
}

function sameLockOwner(a: ReviewLockOwner | null, b: ReviewLockOwner | null): boolean {
  if (a === null || b === null) return a === b
  return a.pid === b.pid && a.range === b.range && a.startedAt === b.startedAt
}

function abandonedLockError(lockDirectory: string, detail: string): Error {
  return new Error(
    `Review lock ${lockDirectory} appears abandoned: ${detail}. `
    + 'No review lock is ever removed automatically. Confirm no review is '
    + `actually running, then remove it yourself: rm -rf '${lockDirectory}'`,
  )
}

/** Consecutive ownerless observations tolerated before the lock is declared corrupt: a holder's release deletes owner.json before the directory, so a single ownerless read can be a healthy teardown in progress. */
const OWNERLESS_POLLS_BEFORE_CORRUPT = 3

export async function acquireReviewLock(
  options: AcquireReviewLockOptions,
): Promise<ReviewLockHandle> {
  const isAlive = options.isAlive ?? processIsAlive
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const startedWaiting = now()
  let ownerlessPolls = 0

  for (;;) {
    // mkdir is the claim: atomic create-if-absent that treats EVERY
    // existing directory -- including a transiently empty one mid-release
    // -- as contention. Never claim by rename; rename may replace an empty
    // directory and thereby seize a lock that its releasing holder is
    // still removing.
    try {
      mkdirSync(options.lockDirectory, { recursive: false })
      writeFileSync(
        join(options.lockDirectory, 'owner.json'),
        `${JSON.stringify(options.owner, null, 2)}\n`,
      )
      return {
        release: () => {
          // Defense against operator mistakes: never delete a lock
          // recorded to a different owner.
          const current = readLockOwner(options.lockDirectory)
          if (current && !sameLockOwner(current, options.owner)) return
          rmSync(options.lockDirectory, { recursive: true, force: true })
        },
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        // Parent .git/pxlblz does not exist yet; create it and retry.
        mkdirSync(join(options.lockDirectory, '..'), { recursive: true })
        continue
      }
      if (code !== 'EEXIST') throw error
    }

    const holder = readLockOwner(options.lockDirectory)
    if (holder === null) {
      // Either a healthy release mid-teardown (directory vanishes on the
      // next poll) or a corrupt leftover. Give it a few polls, then fail
      // closed with instructions -- never remove it ourselves.
      ownerlessPolls += 1
      if (ownerlessPolls >= OWNERLESS_POLLS_BEFORE_CORRUPT) {
        throw abandonedLockError(
          options.lockDirectory,
          `it has recorded no owner across ${ownerlessPolls} consecutive checks`,
        )
      }
      await sleep(options.pollMs)
      continue
    }
    ownerlessPolls = 0
    if (!isAlive(holder.pid)) {
      // Re-read before declaring abandonment: a live successor may have
      // replaced the lock between the first read and the liveness check.
      // Failing spuriously is safe (nothing is deleted); rerun to recover.
      const confirmed = readLockOwner(options.lockDirectory)
      if (!sameLockOwner(confirmed, holder)) continue
      throw abandonedLockError(
        options.lockDirectory,
        `its holder pid ${holder.pid} (reviewing ${holder.range} since ${holder.startedAt}) is no longer running`,
      )
    }

    const waitedMs = now() - startedWaiting
    if (waitedMs >= options.waitMs) {
      throw new Error(
        `Timed out after ${Math.round(waitedMs / 60_000)} min waiting for the review lock held by `
        + `pid ${holder.pid} reviewing ${holder.range} since ${holder.startedAt}. `
        + `If that process is truly gone, remove it yourself: rm -rf '${options.lockDirectory}'`,
      )
    }
    options.onWait?.(holder, waitedMs)
    await sleep(options.pollMs)
  }
}
