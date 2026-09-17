import fs from 'node:fs'
import path from 'node:path'
import { createSessionToken, sessionCookieName } from '../src/cloudflare/auth'
import type { ShowRecord } from '../src/engine/personalContentRecords'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import { localSessionUser, readDevVarsFile } from './dev-runtime-auth'
import { loadManifest, repositoryContext } from './dev-runtime'
import { loadRuntimeRegistry } from './dev-runtime-store'

type FixturePair = {
  source: ShowRecord
  converted: ShowRecordV2
  conversionReport: { retiredSilentRuntimeUses: unknown[] }
}
type CorpusManifest = {
  corpus: Array<{ key: string } & FixturePair>
  behavior: FixturePair
}

function parseArgs(args: readonly string[]): { issue: string; url: URL } {
  let issue = '1065'
  let url: URL | undefined
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--issue') issue = args[++index] ?? ''
    else if (args[index] === '--url') url = new URL(args[++index] ?? '')
    else throw new Error(`Unknown seed option: ${args[index]}`)
  }
  if (!issue) throw new Error('--issue requires an issue number.')
  if (!url) throw new Error('--url requires the managed issue runtime URL.')
  return { issue, url }
}

async function requireOk(response: Response, operation: string): Promise<void> {
  if (!response.ok) throw new Error(`${operation}: ${response.status} ${await response.text()}`)
}

const args = parseArgs(process.argv.slice(2))
const context = repositoryContext(process.cwd())
const runtimeManifest = loadManifest(context.worktree)
const devVarsPath = path.join(context.mainWorktree, '.dev.vars')
if (!fs.existsSync(devVarsPath)) throw new Error(`Shared main .dev.vars is required: ${devVarsPath}`)
const secret = process.env.SESSION_SECRET ?? readDevVarsFile(devVarsPath).SESSION_SECRET
if (!secret) throw new Error('SESSION_SECRET is required for the synthetic local session.')
const user = localSessionUser(
  { issue: args.issue },
  loadRuntimeRegistry(context.runtimeDirectory),
  runtimeManifest,
)
const token = await createSessionToken(user, secret)
const headers = { Cookie: `${sessionCookieName}=${encodeURIComponent(token)}` }
const fixturePath = path.resolve('e2e/fixtures/showEditorEquivalence.json')
const manifest = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as CorpusManifest
const fixtures = [...manifest.corpus, { key: 'pointer-drag', ...manifest.behavior }]
const routes: Array<{ key: string; name: string; v1: string; v2: string }> = []

for (const fixture of fixtures) {
  const v1Id = `oracle-${fixture.key}-v1`
  const v2Id = `oracle-${fixture.key}-v2`
  const name = fixture.source.name
  const v1 = { ...structuredClone(fixture.source), id: v1Id, name, updatedAt: 1 }
  const v2Source = { ...structuredClone(fixture.source), id: v2Id, name, updatedAt: 1 }
  const v2 = { ...structuredClone(fixture.converted), id: v2Id, name, updatedAt: 1 }
  if (fixture.conversionReport.retiredSilentRuntimeUses.length > 0) {
    throw new Error(`${fixture.key} has retired silent runtime uses and cannot enter the basic equivalence corpus.`)
  }
  for (const id of [v1Id, v2Id]) {
    await fetch(new URL(`/api/shows/${id}`, args.url), { method: 'DELETE', headers })
  }
  for (const source of [v1, v2Source]) {
    await requireOk(await fetch(new URL('/api/shows', args.url), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(source),
    }), `create ${source.id}`)
  }
  await requireOk(await fetch(new URL(`/api/shows/${v2Id}?show-version=2`, args.url), {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(v2),
  }), `store ${v2Id} as v2`)
  routes.push({
    key: fixture.key,
    name,
    v1: new URL(`studio/shows/${v1Id}`, args.url).href,
    v2: new URL(`studio/shows/${v2Id}`, args.url).href,
  })
}

console.log(JSON.stringify({ user: user.userId, routes }, null, 2))
