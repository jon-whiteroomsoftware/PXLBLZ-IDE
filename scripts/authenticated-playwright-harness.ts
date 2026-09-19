/**
 * Test-harness account allocation and agent-registration release for the
 * authenticated Playwright suite (#1064). Test harness only: no product
 * route, capacity, TTL, or authentication behavior is changed here. Product
 * values below are read-only mirrors of the cited sources.
 *
 * Two cooperating rules stop one real failure from cascading into 409
 * `capacity` conflicts on later tests:
 *
 * - Every worker slot draws from a persisted per-worker account cursor that
 *   records each account's last-use timestamp. An account is reused only
 *   after the agent-registration TTL (300 s, src/engine/agentRendezvous.ts
 *   REGISTRATION_TTL_MS) plus a margin has elapsed since its last use, so a
 *   restarted worker advances past accounts whose leaked registrations the
 *   server may still hold, while a long single-worker suite (e2e/shows.auth.spec.ts
 *   under --workers=1) wraps within its 64-account pool instead of dying at
 *   test 65. When every account in the slot is still inside the TTL the
 *   allocator throws loudly instead of silently reusing a live account. This
 *   is the load-bearing rule: it holds for crashed pages and timed-out
 *   gestures because it never depends on page liveness.
 * - Fixture teardown sends the product's own `leave` for each registration
 *   the test's page was observed to acquire: from the page context itself
 *   (fetch with keepalive and same-origin credentials, so the browser
 *   attaches the Origin header the route requires) while the page is alive,
 *   falling back to the request fixture with an explicit Origin header
 *   matching the runtime origin. Bounded, never throwing, runs before the
 *   boundary assertion so failed tests still release. This keeps green runs
 *   tidy but is explicitly not relied upon for contexts that died before
 *   teardown.
 *
 * A 409 observed on `/api/agent/channel` is still a product defect signal:
 * nothing here filters, ignores, or allows those console errors.
 */
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { APIRequestContext, Page } from '@playwright/test'
import { authenticatedPlaywrightAccountsPerWorker } from './authenticated-playwright-user'

export const AGENT_ACCOUNT_CURSOR_PREFIX = 'agent-account-cursor-'
export const AGENT_ACCOUNT_ALLOCATION_LOG = 'agent-account-allocations.jsonl'
export const AGENT_ACCOUNT_CURSOR_LOCK_TIMEOUT_MS = 2000
// Read-only mirrors of the product registration contract. The harness never
// changes these; the reuse rule below must stay strictly above the TTL:
// - src/engine/agentRendezvous.ts REGISTRATION_TTL_MS = 300_000: a leaked
//   registration stops counting against the cap 300 s after its last heartbeat.
// - src/engine/agentRendezvous.ts MAX_REGISTRATIONS = 8.
export const AGENT_REGISTRATION_TTL_MS = 300_000
export const AGENT_ACCOUNT_REUSE_MARGIN_MS = 60_000
export const AGENT_ACCOUNT_REUSE_AFTER_MS = AGENT_REGISTRATION_TTL_MS + AGENT_ACCOUNT_REUSE_MARGIN_MS
export const AGENT_CHANNEL_PATH = '/api/agent/channel'
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

export interface AccountCursorState {
  nextSequence: number
  lastUsedAtMs: Record<string, number>
}

export interface AccountAllocationResult {
  sequence: number
  slot: number
  nextCursor: AccountCursorState
}

export function accountSlotForSequence(sequence: number): number {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error(`Authenticated Playwright account sequence is out of range (${String(sequence)}); refusing to reuse accounts.`)
  }
  return sequence % authenticatedPlaywrightAccountsPerWorker
}

export function allocateAccountFromCursor(cursor: unknown, nowMs: number): AccountAllocationResult {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error('Authenticated Playwright account allocator needs a valid clock; refusing to reuse accounts.')
  }
  const state = normalizeAccountCursor(cursor)
  for (let offset = 0; offset < authenticatedPlaywrightAccountsPerWorker; offset += 1) {
    const sequence = state.nextSequence + offset
    const slot = sequence % authenticatedPlaywrightAccountsPerWorker
    const lastUsed = state.lastUsedAtMs[String(slot)]
    // A slot with no recorded use is free. A recorded use is reusable only
    // once the leaked registration it may hold has certainly expired
    // server-side. A clock that ran backwards reads as "just used", never
    // as "aged out": the scan fails closed toward fresh accounts.
    if (lastUsed === undefined || nowMs - lastUsed >= AGENT_ACCOUNT_REUSE_AFTER_MS) {
      return {
        sequence,
        slot,
        nextCursor: {
          nextSequence: sequence + 1,
          lastUsedAtMs: { ...state.lastUsedAtMs, [String(slot)]: nowMs },
        },
      }
    }
  }
  throw new Error(
    `Authenticated Playwright exhausted its per-worker account pool: all ${authenticatedPlaywrightAccountsPerWorker} accounts were used within the last ${AGENT_ACCOUNT_REUSE_AFTER_MS / 1000} s (registration TTL ${AGENT_REGISTRATION_TTL_MS / 1000} s plus ${AGENT_ACCOUNT_REUSE_MARGIN_MS / 1000} s margin). ` +
    `A single worker slot sustains about one test per ${(AGENT_ACCOUNT_REUSE_AFTER_MS / authenticatedPlaywrightAccountsPerWorker / 1000).toFixed(1)} s; reusing an account inside the TTL would risk 409 capacity conflicts, so widen the per-worker pool (and its seed) or slow the suite down rather than reusing live accounts.`,
  )
}

function normalizeAccountCursor(cursor: unknown): AccountCursorState {
  if (cursor === undefined) return { nextSequence: 0, lastUsedAtMs: {} }
  if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) {
    throw new Error(
      `Authenticated Playwright account cursor is corrupt (${JSON.stringify(cursor) ?? 'unserializable'}); refusing to reuse accounts.`,
    )
  }
  const { nextSequence, lastUsedAtMs } = cursor as { nextSequence?: unknown; lastUsedAtMs?: unknown }
  if (!Number.isSafeInteger(nextSequence) || (nextSequence as number) < 0) {
    throw new Error(
      `Authenticated Playwright account cursor is corrupt (${JSON.stringify(cursor) ?? 'unserializable'}); refusing to reuse accounts.`,
    )
  }
  // A cursor written before last-use timestamps existed carries no reuse
  // information. Run directories are fresh per run (scripts/run-authenticated-playwright.ts
  // creates and removes PXLBLZ_D1_PERSIST_TO around the suite), so every slot
  // is genuinely unused; treat the map as empty rather than failing the run.
  const timestamps: Record<string, number> = {}
  if (lastUsedAtMs !== undefined) {
    if (typeof lastUsedAtMs !== 'object' || lastUsedAtMs === null || Array.isArray(lastUsedAtMs)) {
      throw new Error(
        `Authenticated Playwright account cursor is corrupt (${JSON.stringify(cursor) ?? 'unserializable'}); refusing to reuse accounts.`,
      )
    }
    for (const [key, value] of Object.entries(lastUsedAtMs)) {
      if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(
          `Authenticated Playwright account cursor is corrupt (${JSON.stringify(cursor) ?? 'unserializable'}); refusing to reuse accounts.`,
        )
      }
      const slot = Number(key)
      if (Number.isSafeInteger(slot) && slot >= 0 && slot < authenticatedPlaywrightAccountsPerWorker) {
        timestamps[String(slot)] = value as number
      }
    }
  }
  return { nextSequence: nextSequence as number, lastUsedAtMs: timestamps }
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

export function leaveRequestHeaders(origin: string): { 'Content-Type': string; Origin: string } {
  if (typeof origin !== 'string' || origin.length === 0) {
    throw new Error('Authenticated Playwright needs the runtime origin to release agent registrations.')
  }
  return { 'Content-Type': 'application/json', Origin: origin }
}

export interface PageLeaveFetchInit {
  method: 'POST'
  headers: { 'Content-Type': string }
  body: string
  credentials: 'same-origin'
  keepalive: boolean
}

export function pageLeaveFetchArgs(registration: PendingAgentRegistration): { path: string; init: PageLeaveFetchInit } {
  return {
    path: AGENT_CHANNEL_PATH,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leaveRequestBody(registration)),
      credentials: 'same-origin',
      keepalive: true,
    },
  }
}

export function channelOrigin(baseURL: string | undefined): string {
  if (!baseURL) {
    throw new Error('Authenticated Playwright needs a baseURL to release agent registrations against the runtime origin.')
  }
  try {
    return new URL(baseURL).origin
  } catch {
    throw new Error('Authenticated Playwright could not parse its baseURL to release agent registrations.')
  }
}

const volatileAccountCursors = new Map<number, AccountCursorState>()

export function allocatePersistedAccountSequence(directory: string | undefined, parallelIndex: number, nowMs: number = Date.now()): number {
  cursorFileName(parallelIndex)
  if (!directory) {
    const allocation = allocateAccountFromCursor(volatileAccountCursors.get(parallelIndex), nowMs)
    volatileAccountCursors.set(parallelIndex, allocation.nextCursor)
    return allocation.sequence
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
    const allocation = allocateAccountFromCursor(raw === undefined ? undefined : parseAccountCursor(raw, file), nowMs)
    writeFileSync(file, JSON.stringify(allocation.nextCursor), 'utf8')
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

export interface AgentReleaseTransports {
  page: Page
  request: APIRequestContext
  origin: string
}

export async function releaseAgentRegistrations(
  transports: AgentReleaseTransports,
  pending: readonly PendingAgentRegistration[],
): Promise<void> {
  if (!shouldAttemptAgentLeave(pending.length)) return
  const releases = pending.slice(0, AGENT_RELEASE_MAX_REQUESTS).map((registration) =>
    releaseOneAgentRegistration(transports, registration).catch(() => {}),
  )
  await Promise.race([
    Promise.allSettled(releases),
    new Promise((resolve) => setTimeout(resolve, AGENT_RELEASE_TIMEOUT_MS)),
  ])
}

async function releaseOneAgentRegistration(
  { page, request, origin }: AgentReleaseTransports,
  registration: PendingAgentRegistration,
): Promise<void> {
  // The product's own client posts from the page, where the browser attaches
  // the Origin header the route requires (src/agent/browserSession.ts). A
  // dead page cannot run the fetch, so fall back to the request fixture with
  // an explicit Origin header matching the runtime origin. Either transport
  // may find the registration already released by the app's own unmount
  // leave; the route answers ending commands 200 either way, so no outcome
  // here can fail the test.
  if (!page.isClosed()) {
    try {
      const { path, init } = pageLeaveFetchArgs(registration)
      await page.evaluate(
        ([evalPath, evalInit]: [string, PageLeaveFetchInit]) =>
          fetch(evalPath, evalInit).then(
            async (response) => {
              await response.text().catch(() => {})
            },
            () => {},
          ),
        [path, init] as [string, PageLeaveFetchInit],
      )
      return
    } catch {
      // The page died mid-teardown; fall through to the request transport.
    }
  }
  await request.post(AGENT_CHANNEL_PATH, {
    data: leaveRequestBody(registration),
    headers: { Origin: origin },
    timeout: AGENT_RELEASE_REQUEST_TIMEOUT_MS,
  }).then(
    async (response) => {
      await response.text().catch(() => {})
    },
    () => {},
  )
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
