import { createSessionToken, sessionCookieName } from '../src/cloudflare/auth'
import { readDevVarsFile } from '../scripts/dev-runtime-auth'
import {
  authenticatedPlaywrightProbeId,
  authenticatedPlaywrightUserId,
} from '../scripts/authenticated-playwright-user'

export default async function prepareAuthenticatedPlaywrightUser(): Promise<() => void> {
  const devVarsFile = requiredEnvironment('PXLBLZ_DEV_VARS_FILE')
  const secret = process.env.SESSION_SECRET ?? readDevVarsFile(devVarsFile).SESSION_SECRET
  if (!secret) throw new Error(`SESSION_SECRET is required in ${devVarsFile} or the shell environment.`)
  const token = await createSessionToken({
    userId: authenticatedPlaywrightUserId,
    primaryProvider: 'github',
    primaryHandle: 'playwright-shows',
    githubUserId: 'playwright-shows',
    githubLogin: 'playwright-shows',
    displayName: 'Playwright Shows',
    avatarUrl: null,
  }, secret)
  const vitePort = requiredEnvironment('PLAYWRIGHT_AUTH_SMOKE_VITE_PORT')
  const studioUrl = process.env.PLAYWRIGHT_STUDIO_URL ?? `http://localhost:${vitePort}/PXLBLZ-IDE/`
  const response = await fetchApiWithRetry(studioUrl, token)
  const body = response.ok ? await response.json() as { patterns?: Array<{ id: string }> } : null
  if (!body?.patterns?.some((pattern) => pattern.id === authenticatedPlaywrightProbeId)) {
    const responseSummary = response.ok ? 'the probe record was absent' : `GET /api/patterns returned ${response.status}`
    throw new Error(
      `Authenticated smoke D1 ownership mismatch: Vite at ${studioUrl} does not proxy to the isolated D1 at ${requiredEnvironment('PXLBLZ_D1_PERSIST_TO')}; ${responseSummary}.`,
    )
  }

  return async () => {
    await fetch(new URL(`/api/patterns/${authenticatedPlaywrightProbeId}`, studioUrl), {
      method: 'DELETE',
      headers: { Cookie: `${sessionCookieName}=${token}` },
    })
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for authenticated Playwright.`)
  return value
}

async function fetchApiWithRetry(studioUrl: string, token: string): Promise<Response> {
  const url = new URL('/api/patterns', studioUrl)
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await fetch(url, { headers: { Cookie: `${sessionCookieName}=${token}` } })
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`Authenticated smoke could not reach Vite at ${studioUrl} after 5 seconds: ${String(lastError)}`)
}
