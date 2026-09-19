/**
 * Test-harness account allocation and agent-registration release for the
 * authenticated Playwright suite (#1064). Test harness only: no product
 * route, capacity, TTL, or authentication behavior is referenced here beyond
 * the public channel shapes the browser itself sends.
 *
 * Two cooperating rules stop one real failure from cascading into 409
 * `capacity` conflicts on later tests:
 *
 * - Every worker process continues a persisted per-worker account cursor
 *   instead of restarting its sequence at zero. A restarted worker therefore
 *   receives fresh accounts whose registrations cannot still be held by the
 *   dead process inside the server TTL. This is the load-bearing rule: it
 *   holds for crashed pages and timed-out gestures because it never depends
 *   on page liveness.
 * - Fixture teardown sends the product's own `leave` for each registration
 *   the test's page was observed to acquire, awaited with a bounded timeout
 *   and never throwing. This keeps green runs tidy but is explicitly not
 *   relied upon for contexts that died before teardown.
 *
 * A 409 observed on `/api/agent/channel` is still a product defect signal:
 * nothing here filters, ignores, or allows those console errors.
 */
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { APIRequestContext } from '@playwright/test'

export const AGENT_ACCOUNT_CURSOR_PREFIX = 'agent-account-cursor-'
export const AGENT_ACCOUNT_ALLOCATION_LOG = 'agent-account-allocations.jsonl'
export const AGENT_ACCOUNT_CURSOR_LOCK_TIMEOUT_MS = 2000
export const AGENT_OBSERVE_SETTLE_MS = 1000
export const AGENT_RELEASE_TIMEOUT_MS = 5000
export const AGENT_RELEASE_REQUEST_TIMEOUT_MS = 3000
export const AGENT_RELEASE_MAX_REQUESTS = 8

export interface AccountAllocation {
  parallelIndex: number
  sequence: number
  accountIndex: number
}

export function formatAccountAllocation(allocation: AccountAllocation): string {
  return `${JSON.stringify({
    parallelIndex: allocation.parallelIndex,
    sequence: allocation.sequence,
    accountIndex: allocation.accountIndex,
  })}\n`;
}

export function parseAccountAllocations(text: string): AccountAllocation[] {
  const allocations: AccountAllocation[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed) as unknown
    } catch {
      continue
    }
    if (typeof parsed !== 'object' || parsed === null) continue
    const { parallelIndex, sequence, accountIndex } = parsed as {
      parallelIndex?: unknown
      sequence?: unknown
      accountIndex?: unknown
    }
    if (!Number.isSafeInteger(parallelIndex) || !Number.isSafeInteger(sequence) || !Number.isSafeInteger(accountIndex)) {
      continue
    }
    allocations.push({
      parallelIndex: parallelIndex as number,
      sequence: sequence as number,
      accountIndex: accountIndex as number,
    })
  }
  return allocations
}

export interface PendingAgentRegistration {
  sessionId: string
  showId: string
  registrationId: string
}

export interface AgentChannelObservation {
  type?: unknown
  sessionId?: unknown
  showId?: unknown
  registrationId?: unknown
}

const MAX_TRACKED_REGISTRATIONS = 32

export function cursorFileName(parallelIndex: number): string {
  if (!Number.isSafeInteger(parallelIndex) || parallelIndex < 0) {
    throw new Error('Authenticated Playwright worker index is out of range.')
  }
  return `${AGENT_ACCOUNT_CURSOR_PREFIX}${parallelIndex}.json`
}

export function allocateAccountSequence(persisted: unknown): { sequence: number; nextCursor: number } {
  if (persisted === undefined) return { sequence: 0, nextCursor: 1 }
  const next = typeof persisted === 'object' && persisted !== null
    ? (persisted as { nextSequence?: unknown }).nextSequence
    : undefined
  if (!Number.isSafeInteger(next) || (next as number) < 0) {
    throw new Error(
      `Authenticated Playwright account cursor is corrupt (${JSON.stringify(persisted) ?? 'unserializable'}); refusing to reuse accounts.`,
    )
  }
  const sequence = next as number
  return { sequence, nextCursor: sequence + 1 }
}

export function observeAgentChannel(
  pending: PendingAgentRegistration[],
  observation: AgentChannelObservation,
): PendingAgentRegistration[] {
  if (observation.type === 'leave') {
    if (typeof observation.registrationId !== 'string') return pending
    if (!pending.some((registration) => registration.registrationId === observation.registrationId)) return pending
    return pending.filter((registration) => registration.registrationId !== observation.registrationId)
  }
  if (observation.type !== 'register') return pending
  const { sessionId, showId, registrationId } = observation
  if (typeof sessionId !== 'string' || typeof showId !== 'string' || typeof registrationId !== 'string') return pending
  if (pending.some((registration) => registration.registrationId === registrationId)) return pending
  if (pending.length >= MAX_TRACKED_REGISTRATIONS) return pending
  return [...pending, { sessionId, showId, registrationId }]
}

export function shouldAttemptAgentLeave(pendingCount: number): boolean {
  return pendingCount > 0
}

export function leaveRequestBody(registration: PendingAgentRegistration): {
  type: 'leave'
  registrationId: string
  sessionId: string
  showId: string
} {
  return {
    type: 'leave',
    registrationId: registration.registrationId,
    sessionId: registration.sessionId,
    showId: registration.showId,
  }
}

let volatileAccountSequence = 0

export function allocatePersistedAccountSequence(directory: string | undefined, parallelIndex: number): number {
  if (!directory) {
    const sequence = volatileAccountSequence
    volatileAccountSequence += 1
    return sequence
  }
  const file = join(directory, cursorFileName(parallelIndex))
  return withAccountCursorLock(file, () => {
    let raw: string | undefined
    try {
      raw = readFileSync(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw new Error(`Authenticated Playwright could not read its account cursor at ${file}.`)
      }
    }
    const allocation = allocateAccountSequence(raw === undefined ? undefined : parseAccountCursor(raw, file))
    writeFileSync(file, JSON.stringify({ nextSequence: allocation.nextCursor }), 'utf8')
    return allocation.sequence
  })
}

export function logAccountAllocation(directory: string | undefined, allocation: AccountAllocation): void {
  if (!directory) return
  try {
    appendFileSync(join(directory, AGENT_ACCOUNT_ALLOCATION_LOG), formatAccountAllocation(allocation), 'utf8')
  } catch {
    // Best-effort harness telemetry; a failed write must never fail test setup.
  }
}

export async function releaseAgentRegistrations(
  request: APIRequestContext,
  pending: readonly PendingAgentRegistration[],
): Promise<void> {
  if (!shouldAttemptAgentLeave(pending.length)) return
  const releases = pending.slice(0, AGENT_RELEASE_MAX_REQUESTS).map((registration) =>
    request.post('/api/agent/channel', {
      data: leaveRequestBody(registration),
      timeout: AGENT_RELEASE_REQUEST_TIMEOUT_MS,
    }).then(
      async (response) => {
        await response.text().catch(() => {})
      },
      () => {},
    ))
  await Promise.race([
    Promise.allSettled(releases),
    new Promise((resolve) => setTimeout(resolve, AGENT_RELEASE_TIMEOUT_MS)),
  ])
}

function parseAccountCursor(raw: string, file: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error(`Authenticated Playwright account cursor is corrupt at ${file}; refusing to reuse accounts.`)
  }
}

function withAccountCursorLock<T>(file: string, task: () => T): T {
  const lock = `${file}.lock`
  const deadline = Date.now() + AGENT_ACCOUNT_CURSOR_LOCK_TIMEOUT_MS
  for (;;) {
    try {
      mkdirSync(lock)
      break
    } catch {
      if (Date.now() >= deadline) {
        throw new Error(`Authenticated Playwright could not lock its account cursor at ${lock}.`)
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
  try {
    return task()
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}
