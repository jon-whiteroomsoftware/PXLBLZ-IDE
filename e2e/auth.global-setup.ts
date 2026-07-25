import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createSessionToken, sessionCookieName } from '../src/cloudflare/auth'

const syntheticUserId = 'github:playwright-shows'
const ownershipProbeId = '__playwright_local_d1_owner_probe__'

export default async function prepareAuthenticatedPlaywrightUser(): Promise<() => void> {
  const now = Math.floor(Date.now() / 1000)
  const sql = `INSERT INTO users (id, display_name, avatar_url, created_at, updated_at)
    VALUES ('${syntheticUserId}', 'Playwright Shows', NULL, ${now}, ${now})
    ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at;
    INSERT INTO personal_patterns (user_id, id, name, src, controls_json, created_at, updated_at)
    VALUES ('${syntheticUserId}', '${ownershipProbeId}', 'Local D1 ownership probe', 'export function render(index) { }', '{}', ${now}, ${now})
    ON CONFLICT(user_id, id) DO UPDATE SET updated_at = excluded.updated_at;`

  executeLocalD1(sql)

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
  const vitePort = process.env.PLAYWRIGHT_AUTH_SMOKE_VITE_PORT ?? '5175'
  const studioUrl = process.env.PLAYWRIGHT_STUDIO_URL ?? `http://localhost:${vitePort}/PXLBLZ-IDE/`
  const response = await fetchApiWithRetry(studioUrl, token)
  const body = response.ok ? await response.json() as { patterns?: Array<{ id: string }> } : null
  if (!body?.patterns?.some((pattern) => pattern.id === ownershipProbeId)) {
    const responseSummary = response.ok ? 'the probe record was absent' : `GET /api/patterns returned ${response.status}`
    throw new Error(
      `Authenticated smoke D1 ownership mismatch: Vite at ${studioUrl} does not proxy to this worktree's local Wrangler D1 (${process.cwd()}); ${responseSummary}. Stop or reconfigure the server on port 8788, then retry.`,
    )
  }

  return () => executeLocalD1(`DELETE FROM personal_patterns WHERE user_id = '${syntheticUserId}' AND id = '${ownershipProbeId}';`)
}

function executeLocalD1(sql: string): void {
  execFileSync('npx', [
    'wrangler', 'd1', 'execute', 'pxlblz-ide', '--local', '--command', sql,
  ], { cwd: process.cwd(), stdio: 'inherit' })
}

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
