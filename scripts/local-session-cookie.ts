import fs from 'node:fs'
import path from 'node:path'
import { createSessionToken, sessionCookieName } from '../src/cloudflare/auth'
import {
  localSessionUser,
  readDevVarsFile,
} from './dev-runtime-auth'
import { loadRuntimeRegistry } from './dev-runtime-store'
import {
  loadManifest,
  repositoryContext,
} from './dev-runtime'

function parseArgs(args: readonly string[]): {
  developer: boolean
  issue?: string
  json: boolean
} {
  let developer = false
  let issue: string | undefined
  let json = false
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--developer') developer = true
    else if (args[index] === '--json') json = true
    else if (args[index] === '--issue') {
      issue = args[index + 1]
      if (!issue) throw new Error('--issue requires an issue number.')
      index += 1
    } else {
      throw new Error(`Unknown local-session option: ${args[index]}`)
    }
  }
  if (developer && issue) throw new Error('Choose either --developer or --issue, not both.')
  return { developer: developer || !issue, issue, json }
}

const args = parseArgs(process.argv.slice(2))
const context = repositoryContext(process.cwd())
const manifest = loadManifest(context.worktree)
const devVarsPath = path.join(context.mainWorktree, '.dev.vars')
if (!fs.existsSync(devVarsPath)) {
  console.error(`Shared main .dev.vars is required: ${devVarsPath}`)
  process.exit(1)
}
const devVars = readDevVarsFile(devVarsPath)
const secret = process.env.SESSION_SECRET ?? devVars.SESSION_SECRET

if (!secret) {
  console.error(`SESSION_SECRET is required in ${devVarsPath} or the shell environment.`)
  process.exit(1)
}

const user = localSessionUser(
  args.issue ? { issue: args.issue } : { developer: true },
  loadRuntimeRegistry(context.runtimeDirectory),
  manifest,
)
const token = await createSessionToken(
  user,
  secret,
)

const cookie = `${sessionCookieName}=${encodeURIComponent(token)}`
if (args.json) {
  console.log(JSON.stringify({
    user,
    cookie: {
      name: sessionCookieName,
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  }, null, 2))
} else {
  console.log(cookie)
}
