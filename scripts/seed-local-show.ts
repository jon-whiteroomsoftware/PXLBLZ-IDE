import fs from 'node:fs'
import path from 'node:path'
import { createSessionToken, sessionCookieName } from '../src/cloudflare/auth'
import type { PatternRecord, ShowRecord } from '../src/engine/personalContentRecords'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import { convertShowRecordV1ToV2 } from '../src/engine/showRecordV1ToV2'
import { showV1ConversionSources } from '../src/engine/showV2MigrationQualification'

const BASE_URL = process.env.PXLBLZ_LOCAL_URL ?? 'http://localhost:5174'

/**
 * Seed one authored Show into the local workspace as a stored v2 row (#1042).
 * The v1 record converts here, against the built-in catalogue and the local
 * user's Patterns, before anything is written; the Worker no longer accepts
 * v1 Shows. Run under `src/agent-harness/run.ts`, which resolves the built-in
 * Pattern sources the conversion needs.
 */
export async function seedLocalShow(source: ShowRecord): Promise<void> {
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
  const patterns = await fetch(`${BASE_URL}/api/patterns`, { headers: { Cookie: cookie } })
  if (!patterns.ok) throw new Error(`GET /api/patterns -> ${patterns.status}`)
  const userPatterns = (await patterns.json() as { patterns: PatternRecord[] }).patterns
  const conversion = convertShowRecordV1ToV2(source, showV1ConversionSources(source, userPatterns, []))
  if (conversion.status === 'refused') {
    throw new Error(`${source.name} cannot be stored as a v2 Show: ${conversion.issues[0]?.message ?? 'conversion refused'}`)
  }
  const show: ShowRecordV2 = conversion.record
  const list = await fetch(`${BASE_URL}/api/shows?show-version=2`, { headers: { Cookie: cookie } })
  if (!list.ok) throw new Error(`GET /api/shows?show-version=2 -> ${list.status}`)
  const existing = (await list.json() as { shows: Array<{ id: string }> }).shows.some((item) => item.id === show.id)
  const method = existing ? 'PUT' : 'POST'
  const response = await fetch(`${BASE_URL}/api/shows${existing ? `/${encodeURIComponent(show.id)}` : ''}?show-version=2`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(show),
  })
  if (!response.ok) throw new Error(`${method} /api/shows?show-version=2 -> ${response.status}: ${await response.text()}`)
  console.log(`${existing ? 'Updated' : 'Created'} ${show.name}`)
  console.log(`${BASE_URL}/PXLBLZ-IDE/studio/shows/${show.id}?capture`)
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
