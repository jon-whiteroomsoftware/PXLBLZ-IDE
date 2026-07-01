import fs from 'node:fs'
import path from 'node:path'
import { createSessionToken, sessionCookieName } from '../src/cloudflare/auth'

function readDevVars(): Record<string, string> {
  const file = path.resolve(process.cwd(), '.dev.vars')
  if (!fs.existsSync(file)) return {}
  const vars: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    vars[trimmed.slice(0, index)] = trimmed.slice(index + 1)
  }
  return vars
}

const devVars = readDevVars()
const secret = process.env.SESSION_SECRET ?? devVars.SESSION_SECRET

if (!secret) {
  console.error('SESSION_SECRET is required. Set it in .dev.vars or the shell environment.')
  process.exit(1)
}

const token = await createSessionToken(
  {
    userId: 'github:local-dev',
    githubUserId: 'local-dev',
    githubLogin: 'local-dev',
    displayName: 'Local Dev',
    avatarUrl: null,
  },
  secret,
)

console.log(`${sessionCookieName}=${encodeURIComponent(token)}`)
