import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'
import { createSessionToken, sessionCookieName } from '../../src/cloudflare/auth'
import { readDevVarsFile } from '../../scripts/dev-runtime-auth'
import { authenticatedPlaywrightUser } from '../../scripts/authenticated-playwright-user'

type AuthenticatedFixtures = {
  authenticatedBoundary: void
}

export const test = base.extend<AuthenticatedFixtures>({
  storageState: async ({}, use, workerInfo) => {
    const devVarsFile = requiredEnvironment('PXLBLZ_DEV_VARS_FILE')
    const secret = process.env.SESSION_SECRET ?? readDevVarsFile(devVarsFile).SESSION_SECRET
    if (!secret) throw new Error(`SESSION_SECRET is required in ${devVarsFile} or the shell environment.`)
    const token = await createSessionToken(
      authenticatedPlaywrightUser(workerInfo.parallelIndex),
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

  authenticatedBoundary: [async ({ page, request }, use) => {
    await removeSyntheticContent(request)
    const errors = watchSeriousErrors(page)
    await use()
    await removeSyntheticContent(request)
    expect(errors, `Unexpected browser errors:\n${errors.join('\n')}`).toEqual([])
  }, { auto: true }],
})

export { expect }

export function showtimePath(path: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}showtime`
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for authenticated Playwright.`)
  return value
}

function watchSeriousErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
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
}
