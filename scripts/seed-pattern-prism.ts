import fs from 'node:fs'
import path from 'node:path'
import { createSessionToken, sessionCookieName } from '../src/cloudflare/auth'
import { createPatternPrismShow } from '../src/engine/patternPrismShow'

const BASE_URL = process.env.PXLBLZ_LOCAL_URL ?? 'http://localhost:5174'

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

async function main(): Promise<void> {
  const secret = process.env.SESSION_SECRET ?? readDevVars().SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is required in .dev.vars or the shell environment.')
  const userId = process.env.PXLBLZ_LOCAL_USER_ID ?? 'github:local-dev'
  const githubUserId = userId.startsWith('github:') ? userId.slice('github:'.length) : userId
  const token = await createSessionToken({
    userId,
    githubUserId,
    githubLogin: process.env.PXLBLZ_LOCAL_GITHUB_LOGIN ?? 'local-dev',
    displayName: 'Local Dev',
    avatarUrl: null,
  }, secret)
  const cookie = `${sessionCookieName}=${encodeURIComponent(token)}`
  const show = createPatternPrismShow()
  const list = await fetch(`${BASE_URL}/api/shows`, { headers: { Cookie: cookie } })
  if (!list.ok) throw new Error(`GET /api/shows -> ${list.status}`)
  const existing = (await list.json() as { shows: Array<{ id: string }> }).shows.some((item) => item.id === show.id)
  const response = await fetch(`${BASE_URL}/api/shows${existing ? `/${encodeURIComponent(show.id)}` : ''}`, {
    method: existing ? 'PATCH' : 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(show),
  })
  if (!response.ok) throw new Error(`${existing ? 'PATCH' : 'POST'} /api/shows -> ${response.status}: ${await response.text()}`)
  console.log(`${existing ? 'Updated' : 'Created'} ${show.name}`)
  console.log(`${BASE_URL}/PXLBLZ-IDE/studio/shows/${show.id}?capture`)
}

void main()
