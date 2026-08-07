// Serialize heavy test suites across this repository's worktrees (#748).
//
// One full suite fits this machine comfortably; several concurrent ones do
// not: stacked Vitest worker pools and Playwright fleets produced contention
// timeouts and wall-clock skew failures in timing-sensitive tests. The lock
// lives under the common git directory, so every worktree queues on the same
// mutex. Unlike the review lock, a dead holder is reaped automatically by
// pid-liveness: the worst case of a reap race is one overlapped suite run,
// not a corrupted approval, so self-healing is the right trade here.
//
// Usage: tsx scripts/with-suite-lock.ts <label> -- <command> [args...]
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const POLL_MS = 2_000
const REPORT_EVERY_MS = 30_000
const WAIT_CAP_MS = 45 * 60_000
const OWNER_FILE = 'owner.json'

export interface SuiteLockOwner {
  pid: number
  label: string
  startedAt: string
}

function positivePid(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0
}

export function parseSuiteLockOwner(value: unknown): SuiteLockOwner | null {
  if (!value || typeof value !== 'object') return null
  const { pid, label, startedAt } = value as Record<string, unknown>
  if (!positivePid(pid)) return null
  if (typeof label !== 'string' || typeof startedAt !== 'string') return null
  return { pid, label, startedAt }
}

// Ownership hands off to the suite process itself once it starts: `pid`
// always names the live holder (wrapper while claiming, suite while
// running), so every revision's pid-liveness check honours an orphaned
// suite even when the wrapper was SIGKILLed. A separate field would only
// protect contenders new enough to read it; worktrees routinely run mixed
// revisions of this script against the same lock.
export function suiteOwnerAfterSpawn(
  owner: SuiteLockOwner,
  childPid: number | undefined,
): SuiteLockOwner {
  if (!positivePid(childPid)) return owner
  return { ...owner, pid: childPid }
}

// A dead holder is stale immediately. An unreadable owner is stale only
// after it persists across consecutive polls: mkdir claims the lock before
// owner.json is written, so a momentarily ownerless lock is usually a fresh
// claim mid-write, and reaping it instantly would admit two suites at once.
export function suiteLockOwnerIsStale(
  owner: SuiteLockOwner | null,
  consecutiveOwnerlessReads: number,
  pidIsAlive: (pid: number) => boolean,
): boolean {
  if (!owner) return consecutiveOwnerlessReads >= 2
  return !pidIsAlive(owner.pid)
}

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function readOwner(lock: string): SuiteLockOwner | null {
  try {
    return parseSuiteLockOwner(JSON.parse(readFileSync(join(lock, OWNER_FILE), 'utf8')))
  } catch {
    return null
  }
}

function writeOwner(lock: string, owner: SuiteLockOwner): void {
  writeFileSync(join(lock, OWNER_FILE), `${JSON.stringify(owner)}\n`)
}

async function acquire(lock: string, label: string): Promise<SuiteLockOwner> {
  const startedWaiting = Date.now()
  let lastReport = 0
  let ownerlessReads = 0
  while (true) {
    try {
      mkdirSync(lock)
      const owner: SuiteLockOwner = {
        pid: process.pid,
        label,
        startedAt: new Date().toISOString(),
      }
      writeOwner(lock, owner)
      return owner
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const owner = readOwner(lock)
    ownerlessReads = owner ? 0 : ownerlessReads + 1
    if (suiteLockOwnerIsStale(owner, ownerlessReads, pidIsAlive)) {
      rmSync(lock, { recursive: true, force: true })
      ownerlessReads = 0
      continue
    }
    const waited = Date.now() - startedWaiting
    if (waited >= WAIT_CAP_MS) {
      throw new Error(
        `Timed out after ${Math.round(waited / 60_000)}m waiting for the suite lock`
        + (owner ? ` held by pid ${owner.pid} (${owner.label}).` : '.'),
      )
    }
    if (owner && Date.now() - lastReport >= REPORT_EVERY_MS) {
      lastReport = Date.now()
      console.log(
        `… waiting for the suite lock (${Math.round(waited / 1000)}s):`
        + ` pid ${owner.pid} running ${owner.label} since ${owner.startedAt}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

async function main(): Promise<void> {
  const separator = process.argv.indexOf('--')
  const label = process.argv[2]
  if (!label || label === '--' || separator === -1 || separator + 1 >= process.argv.length) {
    console.error('Usage: with-suite-lock <label> -- <command> [args...]')
    process.exitCode = 2
    return
  }
  const command = process.argv.slice(separator + 1)
  const gitCommon = execFileSync('git', [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ], { encoding: 'utf8' }).trim()
  mkdirSync(join(gitCommon, 'pxlblz'), { recursive: true })
  const lock = join(gitCommon, 'pxlblz', 'suite.lock')

  const owner = await acquire(lock, label)
  try {
    process.exitCode = await runSuite(lock, owner, command)
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

// Ownership follows the suite: once the command starts, owner.json names
// its pid, so a contender of any revision honours the running suite even
// when the wrapper itself died without cleanup.
function runSuite(
  lock: string,
  owner: SuiteLockOwner,
  command: string[],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { stdio: 'inherit' })
    child.once('spawn', () => {
      writeOwner(lock, suiteOwnerAfterSpawn(owner, child.pid))
    })
    child.once('error', reject)
    child.once('close', (code) => resolve(code ?? 1))
  })
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
