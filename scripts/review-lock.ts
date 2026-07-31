/**
 * Review serialization lock (#637). Two concurrent `review:candidate` runs
 * contend for reviewer quota and can starve each other into their caps, so
 * reviews queue on an exclusive lock in the shared git common directory
 * (worktrees share it). The lock is a directory created atomically with
 * `mkdir`; the owner file records pid, range, and start time so a waiter can
 * report who holds it and reap locks whose owning process is gone.
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

let reapCounter = 0

/**
 * Reaps an apparently dead lock without the delete-a-live-lock race: the
 * directory is first renamed into a unique quarantine path (atomic, so
 * exactly one of several racing reapers wins), then the owner is re-read
 * INSIDE the quarantine. If the quarantined owner turns out to be alive --
 * the stale observation predated a reacquisition -- the directory is renamed
 * back intact. Only a confirmed-dead quarantine is removed. The residual
 * window (a third process acquiring between rename and rename-back after a
 * liveness misjudgment) requires pid-level misreporting plus a microsecond
 * race, versus the removed bug which needed only two waiters and one crash.
 */
export function reapStaleReviewLock(
  lockDirectory: string,
  isAlive: (pid: number) => boolean = processIsAlive,
): void {
  reapCounter += 1
  const quarantine = `${lockDirectory}.reaping-${process.pid}-${reapCounter}`
  try {
    renameSync(lockDirectory, quarantine)
  } catch {
    // Another reaper won, or the holder released; nothing to do.
    return
  }
  let quarantinedOwner: ReviewLockOwner | null = null
  try {
    quarantinedOwner = parseReviewLockOwner(
      readFileSync(join(quarantine, 'owner.json'), 'utf8'),
    )
  } catch {
    quarantinedOwner = null
  }
  if (quarantinedOwner && isAlive(quarantinedOwner.pid)) {
    try {
      renameSync(quarantine, lockDirectory)
      return
    } catch {
      // A new lock appeared in the window; fall through to drop quarantine.
    }
  }
  rmSync(quarantine, { recursive: true, force: true })
}

export async function acquireReviewLock(
  options: AcquireReviewLockOptions,
): Promise<ReviewLockHandle> {
  const isAlive = options.isAlive ?? processIsAlive
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const ownerPath = join(options.lockDirectory, 'owner.json')
  const startedWaiting = now()

  for (;;) {
    try {
      mkdirSync(options.lockDirectory, { recursive: false })
      writeFileSync(ownerPath, `${JSON.stringify(options.owner, null, 2)}\n`)
      return {
        release: () => {
          // A reaper that misjudged our liveness may have replaced this
          // lock; never delete a lock recorded to a different owner.
          try {
            const current = parseReviewLockOwner(readFileSync(ownerPath, 'utf8'))
            if (current && current.pid !== options.owner.pid) return
          } catch {
            // Missing or unreadable owner: removal below is a no-op or ours.
          }
          rmSync(options.lockDirectory, { recursive: true, force: true })
        },
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Parent .git/pxlblz does not exist yet; create it and retry.
        mkdirSync(join(options.lockDirectory, '..'), { recursive: true })
        continue
      }
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }

    let holder: ReviewLockOwner | null = null
    try {
      holder = parseReviewLockOwner(readFileSync(ownerPath, 'utf8'))
    } catch {
      holder = null
    }
    if (holder && !isAlive(holder.pid)) {
      reapStaleReviewLock(options.lockDirectory, isAlive)
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
