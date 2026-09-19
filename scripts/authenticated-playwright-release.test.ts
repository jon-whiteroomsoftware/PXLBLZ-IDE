import { describe, expect, it } from 'vitest'
import { createSessionToken, sessionCookieName } from '../src/cloudflare/auth'
import { MAX_REGISTRATIONS, REGISTRATION_TTL_MS } from '../src/engine/agentRendezvous'
import type { WorkerEnv } from '../src/worker/apiRoutes'
import { onRequestPost } from '../src/worker/routes/agent/channel'
import { authenticatedPlaywrightAccountsPerWorker } from './authenticated-playwright-user'
import {
  AGENT_ACCOUNT_REUSE_AFTER_MS,
  AGENT_CHANNEL_PATH,
  AGENT_REGISTRATION_TTL_MS,
  leaveRequestBody,
  leaveRequestHeaders,
  type PendingAgentRegistration,
} from './authenticated-playwright-harness'

const TEST_SECRET = 'release-route-test-secret'
const ROUTE_URL = `https://app.test${AGENT_CHANNEL_PATH}`
const HOSTILE_ORIGIN = 'https://hostile.test'

interface StoredRegistration {
  registrationId: string
  sessionId: string
  showId: string
}

function registrationKey(registration: StoredRegistration): string {
  return `${registration.sessionId}\n${registration.showId}\n${registration.registrationId}`
}

function createFakeAgentAccounts() {
  const registrations = new Map<string, StoredRegistration>()
  const stub = {
    fetch: async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
      const inner = typeof input === 'string' || input instanceof URL ? new Request(input, init) : input
      const body = (await inner.json()) as { type?: unknown } & Partial<StoredRegistration>
      // Mirrors the real rendezvous contract for ending commands: a leave
      // removes the exact registration and answers 200 whether or not it
      // was still present (so teardown racing the app's own unmount leave
      // is safe), and nothing else in this fake store is reachable.
      if (
        body?.type === 'leave' &&
        typeof body.registrationId === 'string' &&
        typeof body.sessionId === 'string' &&
        typeof body.showId === 'string'
      ) {
        registrations.delete(registrationKey(body as StoredRegistration))
        return Response.json({ code: 'retired' }, { status: 200 })
      }
      return Response.json({ code: 'unexpected-command' }, { status: 500 })
    },
  }
  const env = {
    SESSION_SECRET: TEST_SECRET,
    AGENT_ACCOUNTS: {
      idFromName: (name: string) => name,
      get: () => stub,
    },
  } as unknown as WorkerEnv
  return { registrations, env }
}

async function sessionCookie(userId: string): Promise<string> {
  const token = await createSessionToken(
    { userId, primaryProvider: 'github', primaryHandle: null, displayName: null, avatarUrl: null },
    TEST_SECRET,
  )
  return `${sessionCookieName}=${token}`
}

function leaveHttpRequest(
  registration: PendingAgentRegistration,
  origin: string | undefined,
  cookie: string | undefined,
): Request {
  const headers: Record<string, string> = { ...(origin === undefined ? {} : leaveRequestHeaders(origin)) }
  if (cookie !== undefined) headers.Cookie = cookie
  return new Request(ROUTE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(leaveRequestBody(registration)),
  })
}

const observed: PendingAgentRegistration = {
  sessionId: 'session-a',
  showId: 'show-a',
  registrationId: 'registration-a',
}

describe('authenticated Playwright teardown release against the real channel route', () => {
  it('removes the registration through the real route when the leave carries Origin, cookies, and JSON', async () => {
    const { registrations, env } = createFakeAgentAccounts()
    registrations.set(registrationKey(observed), { ...observed })
    const response = await onRequestPost({
      request: leaveHttpRequest(observed, 'https://app.test', await sessionCookie('github:playwright-worker-000')),
      env,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ code: 'retired' })
    expect(registrations.has(registrationKey(observed))).toBe(false)
  })

  it('rejects the identical leave without an Origin header, which is how the old harness posted', async () => {
    const { registrations, env } = createFakeAgentAccounts()
    registrations.set(registrationKey(observed), { ...observed })
    const response = await onRequestPost({
      request: leaveHttpRequest(observed, undefined, await sessionCookie('github:playwright-worker-000')),
      env,
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ code: 'invalid_origin' })
    expect(registrations.has(registrationKey(observed))).toBe(true)
  })

  it('rejects a foreign Origin even with a valid session', async () => {
    const { registrations, env } = createFakeAgentAccounts()
    registrations.set(registrationKey(observed), { ...observed })
    const response = await onRequestPost({
      request: leaveHttpRequest(observed, HOSTILE_ORIGIN, await sessionCookie('github:playwright-worker-000')),
      env,
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ code: 'invalid_origin' })
    expect(registrations.has(registrationKey(observed))).toBe(true)
  })

  it('rejects an unauthenticated leave before any origin or store check', async () => {
    const { registrations, env } = createFakeAgentAccounts()
    registrations.set(registrationKey(observed), { ...observed })
    const response = await onRequestPost({ request: leaveHttpRequest(observed, 'https://app.test', undefined), env })
    expect(response.status).toBe(401)
    expect(registrations.has(registrationKey(observed))).toBe(true)
  })

  it('answers a repeated leave 200 so teardown racing the app unmount stays silent', async () => {
    const { registrations, env } = createFakeAgentAccounts()
    registrations.set(registrationKey(observed), { ...observed })
    const cookie = await sessionCookie('github:playwright-worker-000')
    const first = await onRequestPost({ request: leaveHttpRequest(observed, 'https://app.test', cookie), env })
    expect(first.status).toBe(200)
    const second = await onRequestPost({ request: leaveHttpRequest(observed, 'https://app.test', cookie), env })
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ code: 'retired' })
  })
})

describe('authenticated Playwright reuse rule mirrors the product registration contract', () => {
  it('reuses accounts only after the real TTL plus margin', () => {
    expect(AGENT_REGISTRATION_TTL_MS).toBe(REGISTRATION_TTL_MS)
    expect(AGENT_ACCOUNT_REUSE_AFTER_MS).toBeGreaterThan(REGISTRATION_TTL_MS)
  })

  it('keeps the documented single-slot rate inside the provisioned pool', () => {
    expect(MAX_REGISTRATIONS).toBe(8)
    expect(authenticatedPlaywrightAccountsPerWorker).toBe(64)
    expect(AGENT_ACCOUNT_REUSE_AFTER_MS / authenticatedPlaywrightAccountsPerWorker).toBeLessThanOrEqual(10_000)
  })
})
