/**
 * Review serialization lock (#637). Two concurrent `review:candidate` runs
 * contend for reviewer quota and can starve each other into their caps, so
 * reviews queue on an exclusive lock in the shared git common directory
 * (worktrees share it). The lock is a directory published atomically by
 * renaming a fully formed staging directory into place, so it is never
 * visible without its owner.json (pid, range, start time); waiters report
 * who holds it, and locks whose recorded owner is gone -- or that are
 * ownerless, which staged publish makes synonymous with corrupt -- are
 * reaped identity-conditionally via quarantine.
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
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

let lockCounter = 0

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

/**
 * Reaps a lock previously observed dead (or ownerless, which the staged
 * publish in acquireReviewLock makes synonymous with corrupt) without the
 * displace-a-live-successor race: the reap is conditional on IDENTITY, not
 * liveness. The owner is re-read immediately before the rename and the reap
 * aborts unless it still equals the observed owner -- a successor that
 * acquired after the stale observation is therefore never renamed, no
 * matter how delayed the reaper is. The unique-destination rename is atomic,
 * so one of several racing reapers wins and the losers return on ENOENT.
 * After the rename the quarantined owner is verified again; anything other
 * than the confirmed-dead observed owner is renamed back intact, and if a
 * new lock has already replaced it the quarantine is abandoned with a
 * warning rather than deleting a live holder's lock. Reaching that warning
 * requires the owner to change within the read-to-rename microseconds AND a
 * third acquisition within the rename-to-restore microseconds.
 */
export function reapStaleReviewLock(
  lockDirectory: string,
  observed: ReviewLockOwner | null,
  isAlive: (pid: number) => boolean = processIsAlive,
): void {
  if (!sameLockOwner(readLockOwner(lockDirectory), observed)) return
  lockCounter += 1
  const quarantine = `${lockDirectory}.reaping-${process.pid}-${lockCounter}`
  try {
    renameSync(lockDirectory, quarantine)
  } catch {
    // Another reaper won, or the holder released; nothing to do.
    return
  }
  const quarantined = readLockOwner(quarantine)
  const confirmedReapable = observed === null
    ? quarantined === null
    : sameLockOwner(quarantined, observed) && !isAlive(observed.pid)
  if (confirmedReapable) {
    rmSync(quarantine, { recursive: true, force: true })
    return
  }
  try {
    renameSync(quarantine, lockDirectory)
  } catch {
    console.warn(
      `⚠ Review lock quarantine could not be restored; leaving ${quarantine} for inspection.`,
    )
  }
}

export async function acquireReviewLock(
  options: AcquireReviewLockOptions,
): Promise<ReviewLockHandle> {
  const isAlive = options.isAlive ?? processIsAlive
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const startedWaiting = now()

  for (;;) {
    // Staged publish: the lock directory is built fully formed (owner.json
    // first) and renamed into place atomically, so a lock is never visible
    // without its owner. A crash mid-acquisition leaves only an orphan
    // staging directory, and an ownerless lock is unambiguously corrupt.
    lockCounter += 1
    const staging = `${options.lockDirectory}.staging-${process.pid}-${lockCounter}`
    mkdirSync(staging, { recursive: true })
    writeFileSync(
      join(staging, 'owner.json'),
      `${JSON.stringify(options.owner, null, 2)}\n`,
    )
    try {
      renameSync(staging, options.lockDirectory)
      return {
        release: () => {
          // A reaper that misjudged this lock may have replaced it; never
          // delete a lock recorded to a different owner.
          const current = readLockOwner(options.lockDirectory)
          if (current && !sameLockOwner(current, options.owner)) return
          rmSync(options.lockDirectory, { recursive: true, force: true })
        },
      }
    } catch (error) {
      rmSync(staging, { recursive: true, force: true })
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw error
    }

    const holder = readLockOwner(options.lockDirectory)
    if (holder === null || !isAlive(holder.pid)) {
      reapStaleReviewLock(options.lockDirectory, holder, isAlive)
      continue
    }

    const waitedMs = now() - startedWaiting
    if (waitedMs >= options.waitMs) {
      const description = holder
        ? `pid ${holder.pid} reviewing ${holder.range} since ${holder.startedAt}`
        : 'an unidentified holder'
      throw new Error(
        `Timed out after ${Math.round(waitedMs / 60_000)} min waiting for the review lock held by ${description}. `
        + `Remove ${options.lockDirectory} only if that process is truly gone.`,
      )
    }
    options.onWait?.(holder, waitedMs)
    await sleep(options.pollMs)
  }
}
