import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export type PublicationState = 'pending' | 'failed' | 'verified'
export interface CommandResult { status: number | null; stdout: string; stderr: string }
export type ReadCommand = (command: string, args: readonly string[]) => Promise<CommandResult>
const ref = 'refs/heads/main'
const service = 'pxlblz-ide-worker'
const shaPattern = /^[0-9a-f]{40}$/
const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const uuidPattern = new RegExp(`^${uuid}$`)
interface Observation { state: PublicationState; reason: string; command: CommandResult }
interface RemoteObservation extends Observation { ref: string; sha: string | null }
interface WorkerObservation extends Observation {
  service: string
  head_sha?: string
  checkId?: number
  checkUrl?: string
  buildUrl?: string
  externalId?: string
  versionId?: string
}
export interface PublicationReport {
  state: PublicationState
  sha: string
  observedAt: string
  push: { state: PublicationState; exitCode: number | null }
  remote: RemoteObservation
  worker: WorkerObservation
}

/** Bounded reads, no shell. Signals and spawn errors retain null status. */
export const productionReadCommand: ReadCommand = (command, args) => new Promise(resolve => {
  execFile(command, [...args], { encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    resolve({ status: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout, stderr: error ? `${stderr}\n${error.message}` : stderr })
  })
})

function remoteEvidence(sha: string, pushExit: number | null, command: CommandResult): RemoteObservation {
  const lines = command.stdout.trim().split(/\r?\n/)
  const match = lines.length === 1 ? /^([0-9a-f]{40})\s+(refs\/heads\/main)$/.exec(lines[0]) : null
  const observed = match?.[1] ?? null
  const base = { command, ref, sha: observed }
  if (command.status !== 0 || !observed) return { ...base, state: 'failed', reason: 'Remote read failed or did not contain one exact main ref and full SHA' }
  if (observed === sha) return { ...base, state: 'verified', reason: 'Remote main matches intended SHA' }
  return { ...base, state: pushExit === null ? 'pending' : 'failed', reason: 'Remote main differs from intended SHA' }
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
function workerEvidence(sha: string, command: CommandResult): WorkerObservation {
  const base: WorkerObservation = { command, service, state: 'failed', reason: 'Worker observation failed' }
  if (command.status !== 0) return base
  let pages: unknown
  try { pages = JSON.parse(command.stdout) } catch { return { ...base, reason: 'Malformed check-runs JSON' } }
  if (!Array.isArray(pages) || pages.some(page => !object(page) || !Array.isArray(page.check_runs) || page.check_runs.some(check => !object(check)))) {
    return { ...base, reason: 'Malformed paginated check-runs envelope' }
  }
  const matches = pages.flatMap(page => page.check_runs as Record<string, unknown>[]).filter(check =>
    check.head_sha === sha && check.name === `Workers Builds: ${service}` && object(check.app) && check.app.id === 85455 && check.app.slug === 'cloudflare-workers-and-pages')
  if (!matches.length) return { ...base, state: 'pending', reason: 'No exact-SHA Worker check for the production service' }
  // An unorderable matching record cannot safely be displaced by an older success.
  if (matches.some(check => !Number.isSafeInteger(check.id) || Number(check.id) < 0)) return { ...base, reason: 'Invalid Worker check ID' }
  const selected = matches.reduce((latest, check) => Number(check.id) > Number(latest.id) ? check : latest)
  const result: WorkerObservation = {
    ...base, head_sha: sha, checkId: selected.id as number,
    checkUrl: typeof selected.html_url === 'string' ? selected.html_url : undefined,
    buildUrl: typeof selected.details_url === 'string' ? selected.details_url : undefined,
    externalId: typeof selected.external_id === 'string' ? selected.external_id : undefined,
  }
  if (object(selected.output) && typeof selected.output.summary === 'string') {
    result.versionId = new RegExp(`^Version ID: (${uuid})\\r?$`, 'm').exec(selected.output.summary)?.[1]
  }
  const expectedUrl = `https://dash.cloudflare.com/bcb0dc2806acf947e2b4873e034b8988/workers/services/view/${service}/production/builds/${result.externalId}`
  // Exact serialized URL also rejects explicit default ports, credentials and URL normalization tricks.
  if (!result.externalId || !uuidPattern.test(result.externalId) || result.buildUrl !== expectedUrl) return { ...result, reason: 'Unsupported Worker build identity or Details URL' }
  if (typeof selected.status !== 'string') return { ...result, reason: 'Invalid Worker status' }
  if (['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(selected.status)) return { ...result, state: 'pending', reason: 'Worker build is pending' }
  if (selected.status !== 'completed') return { ...result, reason: 'Invalid Worker status' }
  if (selected.conclusion === null || selected.conclusion === undefined) return { ...result, state: 'pending', reason: 'Completed Worker check has no conclusion' }
  if (selected.conclusion === 'success') return { ...result, state: 'verified', reason: 'Exact-SHA production Worker check succeeded' }
  return { ...result, reason: `Worker conclusion is not success: ${String(selected.conclusion)}` }
}

export async function observePublication(sha: string, pushExit: number | null, run: ReadCommand = productionReadCommand): Promise<PublicationReport> {
  if (!shaPattern.test(sha) || (pushExit !== null && (!Number.isInteger(pushExit) || pushExit < 0 || pushExit > 255))) throw new Error('Invalid SHA or push-exit argument')
  const read = async (command: string, args: readonly string[]): Promise<CommandResult> => {
    try { return await run(command, args) } catch (error) { return { status: null, stdout: '', stderr: String(error) } }
  }
  const [remoteCommand, workerCommand] = await Promise.all([
    read('git', ['ls-remote', '--exit-code', 'origin', ref]),
    read('gh', ['api', '--method', 'GET', '--paginate', '--slurp', `repos/jon-whiteroomsoftware/PXLBLZ-IDE/commits/${sha}/check-runs?per_page=100&filter=all`]),
  ])
  const push = { state: pushExit === null ? 'pending' : pushExit === 0 ? 'verified' : 'failed', exitCode: pushExit } as const
  const remote = remoteEvidence(sha, pushExit, remoteCommand)
  const worker = workerEvidence(sha, workerCommand)
  const states = [push.state, remote.state, worker.state]
  return { state: states.includes('failed') ? 'failed' : states.every(state => state === 'verified') ? 'verified' : 'pending', sha, observedAt: new Date().toISOString(), push, remote, worker }
}

function parseArgs(args: string[]): { sha: string; pushExit: number | null } {
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    if (!['--sha', '--push-exit'].includes(key) || values.has(key) || !args[index + 1]) throw new Error(`Invalid, repeated or missing-value argument: ${key}`)
    values.set(key, args[index + 1])
  }
  const sha = values.get('--sha') ?? ''
  const raw = values.get('--push-exit') ?? 'pending'
  if (!shaPattern.test(sha)) throw new Error('--sha requires a full lowercase 40-character hexadecimal SHA')
  if (raw !== 'pending' && (!/^(0|[1-9][0-9]*)$/.test(raw) || Number(raw) > 255)) throw new Error('--push-exit requires an integer 0..255 or pending')
  return { sha, pushExit: raw === 'pending' ? null : Number(raw) }
}

export async function main(args = process.argv.slice(2), io: { run?: ReadCommand; out?: (text: string) => void; error?: (text: string) => void } = {}): Promise<number> {
  const out = io.out ?? console.log
  if (args.length === 1 && args[0] === '--help') {
    out('Usage: npx tsx scripts/publication-status.ts --sha <full-sha> [--push-exit <0..255|pending>]\nRead-only JSON report: exits 0 verified, 1 failed, 2 pending; push.exitCode preserves the supplied push status.')
    return 0
  }
  try {
    const { sha, pushExit } = parseArgs(args)
    const report = await observePublication(sha, pushExit, io.run)
    out(JSON.stringify(report, null, 2))
    return report.state === 'verified' ? 0 : report.state === 'failed' ? 1 : 2
  } catch (error) {
    (io.error ?? console.error)(String(error))
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
