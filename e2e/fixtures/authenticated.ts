import { test as base, expect, type APIRequestContext, type ConsoleMessage, type Page, type Response } from '@playwright/test'
import { createSessionToken, sessionCookieName } from '../../src/cloudflare/auth'
import { readDevVarsFile } from '../../scripts/dev-runtime-auth'
import { authenticatedPlaywrightAccountIndex, authenticatedPlaywrightUser } from '../../scripts/authenticated-playwright-user'
import {
  AGENT_OBSERVE_SETTLE_MS,
  allocatePersistedAccountSequence,
  logAccountAllocation,
  observeAgentChannel,
  releaseAgentRegistrations,
  type PendingAgentRegistration,
} from '../../scripts/authenticated-playwright-harness'
import { installShowBacking, removeStoredShowsV2 } from '../support/showBacking'

type AuthenticatedFixtures = {
  authenticatedBoundary: void
  /**
   * Browser errors a test deliberately provokes (e.g. simulated-offline
   * request failures, #792). Everything else still fails the boundary.
   */
  allowedBrowserErrors: RegExp[]
}

export const test = base.extend<AuthenticatedFixtures>({
  allowedBrowserErrors: [[], { option: true }],
  storageState: async ({}, use, workerInfo) => {
    const devVarsFile = requiredEnvironment('PXLBLZ_DEV_VARS_FILE')
    const secret = process.env.SESSION_SECRET ?? readDevVarsFile(devVarsFile).SESSION_SECRET
    if (!secret) throw new Error(`SESSION_SECRET is required in ${devVarsFile} or the shell environment.`)
    // The cursor is persisted per parallel worker in the run's own temp dir,
    // so a restarted worker process continues with fresh accounts instead of
    // reusing the dead process's accounts inside the registration TTL (#1064).
    // Without the run dir (ad-hoc runs) this falls back to a process-local
    // sequence, exactly the old behavior.
    const directory = persistenceDirectory()
    const sequence = allocatePersistedAccountSequence(directory, workerInfo.parallelIndex)
    const accountIndex = authenticatedPlaywrightAccountIndex(workerInfo.parallelIndex, sequence)
    logAccountAllocation(directory, { parallelIndex: workerInfo.parallelIndex, sequence, accountIndex })
    const token = await createSessionToken(
      authenticatedPlaywrightUser(accountIndex),
      secret,
    )
    await use({
      cookies: [{
        name: sessionCookieName,
        value: token,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
        expires: -1,
      }],
      origins: [],
    })
  },

  // The Show suite runs against both stored record versions (#1066). Which
  // one a run uses is decided here and in that spec's seeding and readback
  // helpers; no test body knows. On the v1 run this is a no-op.
  page: async ({ page }, use) => {
    installShowBacking(page)
    await use(page)
  },

  authenticatedBoundary: [async ({ page, request, allowedBrowserErrors }, use) => {
    // Each test receives a separate account. This pre-use cleanup also makes
    // worker-restart account reuse deterministic without deleting an active
    // page's Show underneath its save and Agent callbacks during teardown.
    await removeSyntheticContent(request)
    const errorWatch = watchSeriousErrors(page)
    const registrationTracker = trackAgentRegistrations(page)
    await use()
    // Detach first so teardown's own traffic cannot add failures to a test
    // whose assertions already passed; the release below still runs before
    // the boundary assertion so a failing test still releases its slots.
    registrationTracker.stop()
    errorWatch.stop()
    await registrationTracker.settled()
    await releaseAgentRegistrations(request, registrationTracker.pending())
    const unexpected = errorWatch.errors.filter((error) => !allowedBrowserErrors.some((allowed) => allowed.test(error)))
    expect(unexpected, `Unexpected browser errors:\n${unexpected.join('\n')}`).toEqual([])
  }, { auto: true }],
})

export { expect }

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for authenticated Playwright.`)
  return value
}

function persistenceDirectory(): string | undefined {
  return process.env.PXLBLZ_D1_PERSIST_TO?.trim() || undefined
}

function watchSeriousErrors(page: Page): { errors: string[]; stop: () => void } {
  const errors: string[] = []
  const onPageError = (error: Error): void => {
    errors.push(`pageerror: ${error.message}`)
  }
  const onConsole = (message: ConsoleMessage): void => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  }
  page.on('pageerror', onPageError)
  page.on('console', onConsole)
  return {
    errors,
    stop: () => {
      page.off('pageerror', onPageError)
      page.off('console', onConsole)
    },
  }
}

function trackAgentRegistrations(page: Page): {
  pending: () => PendingAgentRegistration[]
  settled: () => Promise<void>
  stop: () => void
} {
  let pending: PendingAgentRegistration[] = []
  const inflight = new Set<Promise<void>>()
  const onResponse = (response: Response): void => {
    const sent = response.request()
    if (sent.method() !== 'POST' || !sent.url().includes('/api/agent/channel')) return
    let body: unknown
    try {
      body = JSON.parse(sent.postData() ?? '')
    } catch {
      return
    }
    if (typeof body !== 'object' || body === null) return
    const { type, sessionId, showId, registrationId } = body as {
      type?: unknown
      sessionId?: unknown
      showId?: unknown
      registrationId?: unknown
    }
    if (type === 'leave') {
      pending = observeAgentChannel(pending, { type, registrationId })
      return
    }
    if (type !== 'register') return
    const task = (async (): Promise<void> => {
      let reply: unknown
      try {
        reply = await response.json()
      } catch {
        return
      }
      pending = observeAgentChannel(pending, {
        type,
        sessionId,
        showId,
        registrationId: (reply as { registrationId?: unknown } | null)?.registrationId,
      })
    })()
    inflight.add(task)
    void task.then(() => {
      inflight.delete(task)
    })
  }
  page.on('response', onResponse)
  return {
    pending: () => pending,
    settled: async () => {
      await Promise.race([
        Promise.allSettled([...inflight]),
        new Promise((resolve) => setTimeout(resolve, AGENT_OBSERVE_SETTLE_MS)),
      ])
    },
    stop: () => {
      page.off('response', onResponse)
    },
  }
}

export async function removeSyntheticContent(request: APIRequestContext): Promise<void> {
  for (const resource of ['shows', 'patterns', 'maps', 'mixins', 'libraries', 'controllers'] as const) {
    const response = await request.get(`/api/${resource}`)
    if (!response.ok()) {
      throw new Error(`GET /api/${resource} -> ${response.status()}: ${await response.text()}`)
    }
    const body = await response.json() as Record<string, Array<{ id: string }>>
    for (const record of body[resource] ?? []) {
      const removed = await request.delete(`/api/${resource}/${encodeURIComponent(record.id)}`)
      if (!removed.ok()) throw new Error(`DELETE /api/${resource}/${record.id} -> ${removed.status()}`)
    }
  }
  // A Show the v2 run stored as a version-2 document is absent from the
  // version-1 listing above, so it needs its own sweep (#1066).
  await removeStoredShowsV2(request)
}
