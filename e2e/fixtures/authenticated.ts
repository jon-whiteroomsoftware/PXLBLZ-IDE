import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { createSessionToken, sessionCookieName } from '../../src/cloudflare/auth'

const syntheticUserId = 'github:playwright-shows'

type AuthenticatedFixtures = {
  authenticatedBoundary: void
}

export const test = base.extend<AuthenticatedFixtures>({
  storageState: async ({}, use) => {
    const secret = process.env.SESSION_SECRET ?? readDevVars().SESSION_SECRET
    if (!secret) throw new Error('SESSION_SECRET is required in .dev.vars or the shell environment.')
    const token = await createSessionToken({
      userId: syntheticUserId,
      primaryProvider: 'github',
      primaryHandle: 'playwright-shows',
      githubUserId: 'playwright-shows',
      githubLogin: 'playwright-shows',
      displayName: 'Playwright Shows',
      avatarUrl: null,
    }, secret)
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

function readDevVars(): Record<string, string> {
  const file = path.resolve(process.cwd(), '.dev.vars')
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return []
    const separator = trimmed.indexOf('=')
    return separator === -1 ? [] : [[trimmed.slice(0, separator), trimmed.slice(separator + 1)]]
  }))
}

function watchSeriousErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

async function removeSyntheticContent(request: APIRequestContext): Promise<void> {
  for (const resource of ['shows', 'patterns', 'maps'] as const) {
    const response = await request.get(`/api/${resource}`)
    if (!response.ok()) throw new Error(`GET /api/${resource} -> ${response.status()}`)
    const body = await response.json() as Record<string, Array<{ id: string }>>
    for (const record of body[resource] ?? []) {
      const removed = await request.delete(`/api/${resource}/${encodeURIComponent(record.id)}`)
      if (!removed.ok()) throw new Error(`DELETE /api/${resource}/${record.id} -> ${removed.status()}`)
    }
  }
}
