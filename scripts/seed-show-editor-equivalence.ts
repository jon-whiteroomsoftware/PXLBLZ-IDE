import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createSessionToken, sessionCookieName } from '../src/cloudflare/auth'
import type { ShowRecord } from '../src/engine/personalContentRecords'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import { convertShowRecordV1ToV2 } from '../src/engine/showRecordV1ToV2'
import { DEMOS, resolveStockPatternId } from '../src/pixelblaze/stock/patterns'
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

function convert(source: ShowRecord, key: string) {
  const conversion = convertShowRecordV1ToV2(source, {
    byCellId: Object.fromEntries(source.cells.map(cell => {
      if (cell.pattern.kind !== 'stock') throw new Error(`${key} has a non-stock flat Pattern dependency.`)
      const patternSource = DEMOS[resolveStockPatternId(cell.pattern.id)]
      if (!patternSource) throw new Error(`${key} is missing stock Pattern source ${cell.pattern.id}.`)
      return [cell.id, patternSource]
    })),
  })
  if (conversion.status !== 'converted') {
    throw new Error(`${key} conversion refused: ${JSON.stringify(conversion.issues)}`)
  }
  if (conversion.report.retiredSilentRuntimeUses.length > 0) {
    throw new Error(`${key} has retired silent runtime uses and cannot enter the basic equivalence corpus.`)
  }
  return conversion
}

async function readStoredV1(url: URL, headers: Record<string, string>, id: string): Promise<ShowRecord> {
  const response = await fetch(new URL('/api/shows', url), { headers })
  await requireOk(response, `read persisted v1 row ${id}`)
  const shows = (await response.json()).shows as ShowRecord[]
  const show = shows.find(candidate => candidate.id === id)
  if (!show) throw new Error(`Persisted v1 row ${id} was not returned after creation.`)
  return show
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
  const rawV1 = { ...structuredClone(fixture.source), id: v1Id, name, updatedAt: 1 }
  const rawV2Source = { ...structuredClone(fixture.source), id: v2Id, name, updatedAt: 1 }
  const committedV2 = { ...structuredClone(fixture.converted), id: v2Id, name, updatedAt: 1 }
  const fixtureConversion = convert(rawV2Source, `${fixture.key}-fixture-freshness`)
  if (!isDeepStrictEqual(fixtureConversion.record, committedV2)) {
    throw new Error(`${fixture.key} committed converted fixture is stale against the runtime converter.`)
  }

  for (const id of [v1Id, v2Id]) {
    await fetch(new URL(`/api/shows/${id}`, args.url), { method: 'DELETE', headers })
  }
  await requireOk(await fetch(new URL('/api/shows', args.url), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(rawV1),
  }), `create ${v1Id}`)

  const persistedV1 = await readStoredV1(args.url, headers, v1Id)
  const persistedV2Source = {
    ...structuredClone(persistedV1),
    id: v2Id,
    name,
    updatedAt: 1,
  }
  await requireOk(await fetch(new URL('/api/shows', args.url), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(persistedV2Source),
  }), `create persisted v1 staging row ${v2Id}`)

  const persistedConversion = convert(persistedV2Source, `${fixture.key}-persisted-v1`)
  await requireOk(await fetch(new URL(`/api/shows/${v2Id}?show-version=2`, args.url), {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(persistedConversion.record),
  }), `store ${v2Id} as v2`)
  routes.push({
    key: fixture.key,
    name,
    v1: new URL(`studio/shows/${v1Id}`, args.url).href,
    v2: new URL(`studio/shows/${v2Id}`, args.url).href,
  })
}

console.log(JSON.stringify({ user: user.userId, routes }, null, 2))
