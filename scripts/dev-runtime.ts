import { execFileSync, spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  classifyAssignmentPort,
  classifyMainApiHealth,
  classifyProcessGroupPort,
  decideMainApiAction,
  parseRuntimeManifest,
  type MainApiListener,
  type RuntimeAssignment,
  type RuntimeManifest,
  type RuntimeProfile,
} from './dev-runtime-core'
import { localIdentitySeedSql } from './dev-runtime-auth'
import {
  loadRuntimeRegistry,
  releaseRuntimeAssignment,
  reserveRuntimeAssignment,
  updateRuntimeAssignment,
} from './dev-runtime-store'

type DevRuntimeArgs =
  | { command: 'main' }
  | {
      command: 'start'
      issue: string
      description: string
      profile: RuntimeProfile
    }
  | { command: 'status'; json: boolean }
  | { command: 'release'; issue: string }

export interface RepositoryContext {
  worktree: string
  branch: string
  mainWorktree: string
  gitCommonDirectory: string
  runtimeDirectory: string
}

export function parseDevRuntimeArgs(args: readonly string[]): DevRuntimeArgs {
  const [command, ...rest] = args
  if (command === 'main') {
    rejectOptions(rest, 'main')
    return { command }
  }
  if (command === 'status') {
    const options = parseOptions(rest)
    rejectUnknownOptions(options, new Set(['json']))
    return { command, json: options.has('json') }
  }
  if (command === 'release') {
    const options = parseOptions(rest)
    rejectUnknownOptions(options, new Set(['issue']))
    const issue = requiredOption(options, 'issue', 'release')
    return { command, issue }
  }
  if (command === 'start') {
    const options = parseOptions(rest)
    rejectUnknownOptions(options, new Set(['issue', 'description', 'profile']))
    const issue = requiredOption(options, 'issue', 'start')
    const description = requiredOption(options, 'description', 'start')
    const profile = options.get('profile')
    if (profile !== 'shared' && profile !== 'isolated') {
      throw new Error('start requires --profile shared or --profile isolated.')
    }
    return { command, issue, description, profile }
  }
  throw new Error('Usage: dev-runtime <main|start|status|release> [options]')
}

async function main(): Promise<void> {
  try {
    const args = parseDevRuntimeArgs(process.argv.slice(2))
    const context = repositoryContext(process.cwd())
    const manifest = loadManifest(context.worktree)
    if (args.command === 'main') {
      await ensureMainRuntime(context, manifest)
      return
    }
    if (args.command === 'status') {
      await printStatus(context, manifest, args.json)
      return
    }
    if (args.command === 'release') {
      await releaseIssueRuntime(context, args.issue)
      return
    }
    await startIssueRuntime(context, manifest, args)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function startIssueRuntime(
  context: RepositoryContext,
  manifest: RuntimeManifest,
  args: Extract<DevRuntimeArgs, { command: 'start' }>,
): Promise<void> {
  keepMainWranglerTmpFresh(context)
  ensureSharedDevVarsLink(context)
  if (args.profile === 'shared') {
    await requireHealthySharedRuntime(manifest)
    ensureLocalIdentities(context, manifest)
  }
  const assignment = await reserveRuntimeAssignment({
    directory: context.runtimeDirectory,
    request: {
      issue: args.issue,
      description: args.description,
      worktree: context.worktree,
      branch: context.branch,
      profile: args.profile,
    },
    manifest,
    now: () => new Date().toISOString(),
    portIsAvailable,
  })
  if (args.profile === 'isolated') {
    await ensureIsolatedApi(context, manifest, assignment)
  }

  const portState = classifyAssignmentPort(assignment, listenerPids(assignment.uiPort))
  if (portState === 'foreign') {
    throw new Error(
      `Port ${assignment.uiPort} is owned by a process other than issue ${assignment.issue}; refusing to reuse it.`,
    )
  }
  if (portState === 'free') {
    const pid = startVite(context.worktree, assignment, context.runtimeDirectory)
    await updateRuntimeAssignment(context.runtimeDirectory, assignment.issue, (current) => ({
      ...current,
      uiPid: pid,
      updatedAt: new Date().toISOString(),
    }))
    await waitForUrl(issueUrl(assignment, manifest), 30_000)
  }
  console.log(runtimeStartSummary(assignment, manifest))
}

async function releaseIssueRuntime(
  context: RepositoryContext,
  issue: string,
): Promise<void> {
  const assignment = loadRuntimeRegistry(context.runtimeDirectory)
    .assignments.find((entry) => entry.issue === issue)
  if (!assignment) {
    console.log(`Issue ${issue} has no runtime assignment.`)
    return
  }
  const portState = classifyAssignmentPort(assignment, listenerPids(assignment.uiPort))
  if (portState === 'foreign') {
    throw new Error(
      `Port ${assignment.uiPort} is no longer owned by issue ${issue}; refusing to terminate or release it.`,
    )
  }
  const apiState = assignment.profile === 'isolated'
    ? classifyApiPort(assignment)
    : 'free'
  if (apiState === 'foreign') {
    throw new Error(
      `Port ${assignment.apiPort} is no longer owned by issue ${issue}; refusing to terminate or release it.`,
    )
  }
  if (portState === 'owned' && assignment.uiPid !== undefined) {
    stopProcessGroup(assignment.uiPid)
    await waitForPortFree(assignment.uiPort, 10_000)
  }
  if (assignment.profile === 'isolated') {
    if (apiState === 'owned' && assignment.apiPid !== undefined) {
      stopProcessGroup(assignment.apiPid)
      await waitForPortFree(assignment.apiPort, 10_000)
    }
  }
  await releaseRuntimeAssignment(context.runtimeDirectory, issue)
  console.log(`Released issue ${issue} runtime assignment on port ${assignment.uiPort}.`)
}

async function printStatus(
  context: RepositoryContext,
  manifest: RuntimeManifest,
  json: boolean,
): Promise<void> {
  keepMainWranglerTmpFresh(context)
  const apiUrl = `http://localhost:${manifest.shared.wranglerPort}/api/me`
  const apiListeners = listenerPids(manifest.shared.wranglerPort)
  const apiResponded = apiListeners.length > 0 && await probeUrl(apiUrl, serviceProbeTimeoutMs)
  const apiHealth = classifyMainApiHealth(apiListeners.length, apiResponded)
  const mainStatus = {
    issue: 'main',
    description: 'stable reviewed main',
    worktree: context.mainWorktree,
    branch: 'main',
    profile: 'shared',
    uiPort: manifest.shared.vitePort,
    uiUrl: `http://localhost:${manifest.shared.vitePort}${manifest.basePath}`,
    apiTarget: `http://localhost:${manifest.shared.wranglerPort}`,
    uiState: listenerPids(manifest.shared.vitePort).length > 0 ? 'listening' : 'stopped',
    apiState: apiHealth === 'ok' ? 'listening' : apiHealth,
  }
  const assignments = loadRuntimeRegistry(context.runtimeDirectory).assignments.map((assignment) => ({
    ...assignment,
    uiUrl: issueUrl(assignment, manifest),
    uiState: classifyAssignmentPort(assignment, listenerPids(assignment.uiPort)),
    apiState: assignment.profile === 'shared'
      ? (listenerPids(assignment.apiPort).length > 0 ? 'shared' : 'stopped')
      : classifyApiPort(assignment),
  }))
  if (json) {
    console.log(JSON.stringify({ main: mainStatus, assignments }, null, 2))
    return
  }
  console.log([
    `main: ${mainStatus.uiUrl} (${mainStatus.uiState}, API ${mainStatus.apiState})`,
    ...assignments.map((assignment) => (
      `${assignment.issue}:${assignment.uiPort} ${assignment.description}`
      + ` [${assignment.profile}, ${assignment.uiState}]`
      + ` ${assignment.uiUrl}`
    )),
  ].join('\n'))
}

async function ensureMainRuntime(
  context: RepositoryContext,
  manifest: RuntimeManifest,
): Promise<void> {
  if (!existsSync(join(context.mainWorktree, '.dev.vars'))) {
    throw new Error(`Shared main .dev.vars is required: ${join(context.mainWorktree, '.dev.vars')}`)
  }
  keepMainWranglerTmpFresh(context)
  const uiUrl = `http://localhost:${manifest.shared.vitePort}${manifest.basePath}`
  const apiUrl = `http://localhost:${manifest.shared.wranglerPort}/api/me`
  const uiPids = listenerPids(manifest.shared.vitePort)
  const apiPids = listenerPids(manifest.shared.wranglerPort)
  const [uiHealthy, apiResponded] = await Promise.all([
    uiPids.length > 0 ? probeUrl(uiUrl, serviceProbeTimeoutMs) : Promise.resolve(false),
    apiPids.length > 0 ? probeUrl(apiUrl, serviceProbeTimeoutMs) : Promise.resolve(false),
  ])
  if (uiPids.length > 0 && !uiHealthy) {
    throw new Error(`Port ${manifest.shared.vitePort} is occupied but ${uiUrl} is unhealthy.`)
  }
  const apiListeners: MainApiListener[] = apiPids.map((pid) => ({ pid, command: processCommand(pid) }))
  const apiAction = decideMainApiAction(apiListeners, apiResponded, context.mainWorktree)
  if (apiAction === 'refuse') {
    throw new Error(
      `Port ${manifest.shared.wranglerPort} is occupied but ${apiUrl} is unresponsive, and the listener is not this repository's Wrangler; refusing to terminate it:\n`
      + apiListeners.map((listener) => `  ${listener.pid} ${listener.command || '(unreadable command)'}`).join('\n'),
    )
  }
  if (apiAction === 'recover') {
    console.log(
      `Port ${manifest.shared.wranglerPort} is wedged (accepts TCP, never answers ${apiUrl}); `
      + `recovering by restarting the main Wrangler (PIDs ${apiPids.join(', ')}).`,
    )
    await stopWedgedListeners(apiPids, manifest.shared.wranglerPort)
  }
  prepareD1(context.mainWorktree, resolve(context.mainWorktree, '.wrangler/state'), manifest)
  if (apiAction !== 'none') {
    buildWorktree(context.mainWorktree)
    startWrangler(
      context.mainWorktree,
      manifest.shared.wranglerPort,
      resolve(context.mainWorktree, '.wrangler/state'),
      join(context.runtimeDirectory, 'logs', 'main-wrangler.log'),
    )
    await waitForUrl(apiUrl, 30_000)
  }
  if (!uiHealthy) {
    startDetached(
      process.execPath,
      [resolve(context.mainWorktree, 'node_modules/vite/bin/vite.js')],
      context.mainWorktree,
      join(context.runtimeDirectory, 'logs', 'main-vite.log'),
      {
        VITE_PORT: String(manifest.shared.vitePort),
        VITE_API_PROXY_TARGET: `http://localhost:${manifest.shared.wranglerPort}`,
      },
    )
    await waitForUrl(uiUrl, 30_000)
  }
  console.log(
    `Stable main is available at http://localhost:${manifest.shared.vitePort}${manifest.basePath}`
    + ` with shared API ${manifest.shared.wranglerPort}.`,
  )
}

async function requireHealthySharedRuntime(manifest: RuntimeManifest): Promise<void> {
  const uiUrl = `http://localhost:${manifest.shared.vitePort}${manifest.basePath}`
  const apiUrl = `http://localhost:${manifest.shared.wranglerPort}/api/me`
  const apiListenerCount = listenerPids(manifest.shared.wranglerPort).length
  const [uiHealthy, apiResponded] = await Promise.all([
    probeUrl(uiUrl, serviceProbeTimeoutMs),
    probeUrl(apiUrl, serviceProbeTimeoutMs),
  ])
  const apiHealth = classifyMainApiHealth(apiListenerCount, apiResponded)
  if (!uiHealthy || apiHealth !== 'ok') {
    throw new Error(
      `Stable main runtime is not healthy (${uiUrl}: ${uiHealthy ? 'ok' : 'down'},`
      + ` ${apiUrl}: ${apiHealth}). Run \`npm run dev:main\` to `
      + (apiHealth === 'wedged'
        ? 'recover the wedged main Wrangler'
        : 'start the persistent 5174/8788 pair')
      + ' before assigning shared issue runtimes.',
    )
  }
}

function startVite(
  worktree: string,
  assignment: RuntimeAssignment,
  runtimeDirectory: string,
): number {
  return startDetached(
    process.execPath,
    [resolve(worktree, 'node_modules/vite/bin/vite.js')],
    worktree,
    join(runtimeDirectory, 'logs', `issue-${assignment.issue}-vite.log`),
    {
      VITE_PORT: String(assignment.uiPort),
      VITE_API_PROXY_TARGET: assignment.apiTarget,
    },
  )
}

async function ensureIsolatedApi(
  context: RepositoryContext,
  manifest: RuntimeManifest,
  assignment: RuntimeAssignment,
): Promise<void> {
  const state = classifyApiPort(assignment)
  if (state === 'foreign') {
    throw new Error(
      `Port ${assignment.apiPort} is owned by a process other than issue ${assignment.issue}; refusing to reuse it.`,
    )
  }
  if (state === 'owned') return
  const persistence = isolatedPersistence(context.runtimeDirectory, assignment.issue)
  prepareD1(context.worktree, persistence, manifest)
  buildWorktree(context.worktree)
  const pid = startWrangler(
    context.worktree,
    assignment.apiPort,
    persistence,
    join(context.runtimeDirectory, 'logs', `issue-${assignment.issue}-wrangler.log`),
  )
  await updateRuntimeAssignment(context.runtimeDirectory, assignment.issue, (current) => ({
    ...current,
    apiPid: pid,
    updatedAt: new Date().toISOString(),
  }))
  assignment.apiPid = pid
  try {
    await waitForUrl(`${assignment.apiTarget}/api/me`, 30_000)
  } catch (error) {
    stopProcessGroup(pid)
    throw error
  }
}

function prepareD1(
  worktree: string,
  persistence: string,
  manifest: RuntimeManifest,
): void {
  mkdirSync(persistence, { recursive: true })
  const wranglerBin = resolve(worktree, 'node_modules/wrangler/bin/wrangler.js')
  runChecked(process.execPath, [
    wranglerBin,
    'd1',
    'migrations',
    'apply',
    'pxlblz-ide',
    '--local',
    '--persist-to',
    persistence,
  ], worktree, 'apply local D1 migrations')
  runChecked(process.execPath, [
    wranglerBin,
    'd1',
    'execute',
    'pxlblz-ide',
    '--local',
    '--persist-to',
    persistence,
    '--command',
    localIdentitySeedSql(manifest),
  ], worktree, 'provision local identities')
}

function buildWorktree(worktree: string): void {
  runChecked('npm', ['run', 'build'], worktree, 'build the worktree')
}

function startWrangler(
  worktree: string,
  port: number,
  persistence: string,
  logPath: string,
): number {
  return startDetached(
    process.execPath,
    [
      resolve(worktree, 'node_modules/wrangler/bin/wrangler.js'),
      'pages',
      'dev',
      'dist',
      '--port',
      String(port),
      '--persist-to',
      persistence,
    ],
    worktree,
    logPath,
  )
}

function startDetached(
  command: string,
  args: string[],
  cwd: string,
  logPath: string,
  env: NodeJS.ProcessEnv = {},
): number {
  mkdirSync(resolve(logPath, '..'), { recursive: true })
  const log = openSync(logPath, 'a')
  try {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      env: { ...process.env, ...env },
      stdio: ['ignore', log, log],
    })
    child.unref()
    if (!child.pid) throw new Error(`${command} did not return a PID; inspect ${logPath}.`)
    return child.pid
  } finally {
    closeSync(log)
  }
}

function runChecked(
  command: string,
  args: string[],
  cwd: string,
  action: string,
): void {
  try {
    execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error
      ? String((error as Error & { stderr?: string }).stderr ?? '').trim()
      : ''
    throw new Error(`Could not ${action}${stderr ? `: ${stderr}` : '.'}`, { cause: error })
  }
}

function isolatedPersistence(runtimeDirectory: string, issue: string): string {
  return join(runtimeDirectory, 'isolated', `issue-${issue.replaceAll(/[^A-Za-z0-9._-]/g, '_')}`)
}

function classifyApiPort(assignment: RuntimeAssignment) {
  const listeners = listenerPids(assignment.apiPort)
  return classifyProcessGroupPort(
    assignment.apiPid,
    listeners,
    new Map(listeners.map((pid) => [pid, processGroupId(pid)])),
  )
}

function processGroupId(pid: number): number {
  try {
    return Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim())
  } catch {
    return Number.NaN
  }
}

function processCommand(pid: number): string {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function stopProcessGroup(processGroupId: number): void {
  try {
    process.kill(-processGroupId, 'SIGTERM')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

// A wedged workerd may ignore SIGTERM (it sat for six days ignoring a broken
// control channel in the #895 incident), so escalate to SIGKILL per group.
async function stopWedgedListeners(pids: readonly number[], port: number): Promise<void> {
  const groups = [...new Set(pids.map(processGroupId).filter(Number.isInteger))]
  for (const group of groups) stopProcessGroup(group)
  try {
    await waitForPortFree(port, 5_000)
    return
  } catch {
    for (const group of groups) {
      try {
        process.kill(-group, 'SIGKILL')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
  }
  await waitForPortFree(port, 10_000)
}

// Every wrangler invocation deletes .wrangler/tmp entries whose mtime is older
// than 24h (workers-sdk#13930), including a live pages dev server's bundle dir
// once it goes a day without a rebuild — the #895 wedge. Coordinator commands
// run far more often than daily, so refreshing the mtimes here keeps the main
// server's entries permanently outside the sweep window.
export function touchWranglerTmpEntries(tmpRoot: string, now = new Date()): number {
  let entries
  try {
    entries = readdirSync(tmpRoot, { withFileTypes: true })
  } catch {
    return 0
  }
  let touched = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      utimesSync(join(tmpRoot, entry.name), now, now)
      touched += 1
    } catch {
      /* best effort — the entry may be gone already */
    }
  }
  return touched
}

function keepMainWranglerTmpFresh(context: RepositoryContext): void {
  touchWranglerTmpEntries(join(context.mainWorktree, '.wrangler', 'tmp'))
}

export function repositoryContext(cwd: string): RepositoryContext {
  const worktree = git(cwd, ['rev-parse', '--show-toplevel'])
  const branch = runtimeBranchLabel(
    git(cwd, ['branch', '--show-current']),
    git(cwd, ['rev-parse', 'HEAD']),
  )
  const gitCommonDirectory = git(cwd, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ])
  const mainWorktree = parseMainWorktree(git(cwd, ['worktree', 'list', '--porcelain']))
  return {
    worktree,
    branch,
    mainWorktree,
    gitCommonDirectory,
    runtimeDirectory: join(gitCommonDirectory, 'pxlblz', 'dev-runtime', 'v1'),
  }
}

export function runtimeBranchLabel(branch: string, headSha: string): string {
  const namedBranch = branch.trim()
  if (namedBranch) return namedBranch
  const commit = headSha.trim()
  if (!commit) throw new Error('Cannot identify the current branch or detached HEAD commit.')
  return `detached@${commit.slice(0, 12)}`
}

function parseMainWorktree(output: string): string {
  for (const record of output.split(/\n\n+/)) {
    const lines = record.split('\n')
    if (!lines.includes('branch refs/heads/main')) continue
    const worktree = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length)
    if (worktree) return worktree
  }
  throw new Error('Cannot locate the permanent main worktree.')
}

export function loadManifest(worktree: string): RuntimeManifest {
  return parseRuntimeManifest(JSON.parse(readFileSync(join(worktree, 'dev-runtime.json'), 'utf8')))
}

export function ensureSharedDevVarsLink(context: RepositoryContext): void {
  const shared = join(context.mainWorktree, '.dev.vars')
  if (!existsSync(shared)) throw new Error(`Shared main .dev.vars is required: ${shared}`)
  if (context.worktree === context.mainWorktree) return
  const link = join(context.worktree, '.dev.vars')
  try {
    const existing = lstatSync(link)
    if (!existing.isSymbolicLink()) {
      throw new Error(
        `${link} is a worktree-local file. Remove it so the runtime can link the shared main .dev.vars.`,
      )
    }
    try {
      if (realpathSync(link) === realpathSync(shared)) return
    } catch {
      unlinkSync(link)
      symlinkSync(shared, link)
      return
    }
    throw new Error(`${link} points somewhere other than the shared main .dev.vars.`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  symlinkSync(shared, link)
}

function ensureLocalIdentities(
  context: RepositoryContext,
  manifest: RuntimeManifest,
): void {
  const wranglerBin = resolve(context.mainWorktree, 'node_modules/wrangler/bin/wrangler.js')
  const persistence = resolve(context.mainWorktree, '.wrangler/state')
  try {
    execFileSync(process.execPath, [
      wranglerBin,
      'd1',
      'execute',
      'pxlblz-ide',
      '--local',
      '--persist-to',
      persistence,
      '--command',
      localIdentitySeedSql(manifest),
    ], {
      cwd: context.mainWorktree,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const detail = error instanceof Error && 'stderr' in error
      ? String((error as Error & { stderr?: string }).stderr ?? '').trim()
      : ''
    throw new Error(
      `Could not provision shared local identities in ${persistence}${detail ? `: ${detail}` : '.'}`,
      { cause: error },
    )
  }
}

function listenerPids(port: number): number[] {
  try {
    const output = execFileSync('lsof', [
      '-nP',
      `-iTCP:${port}`,
      '-sTCP:LISTEN',
      '-t',
    ], { encoding: 'utf8' })
    return [...new Set(output.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger))]
  } catch {
    return []
  }
}

export async function portIsAvailable(port: number): Promise<boolean> {
  if (listenerPids(port).length > 0) return false
  return new Promise((resolveAvailability) => {
    const server = createServer()
    server.once('error', () => resolveAvailability(false))
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(() => resolveAvailability(true))
    })
  })
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probeUrl(url, serviceProbeTimeoutMs)) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`Timed out waiting for ${url}.`)
}

async function waitForPortFree(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (listenerPids(port).length === 0) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error(`Timed out waiting for port ${port} to stop.`)
}

export const serviceProbeTimeoutMs = 3_000

// Bounded replacement for a bare fetch: a wedged server accepts the TCP
// connection and then never answers, so an untimed probe hangs forever.
export async function probeUrl(
  url: string,
  timeoutMs: number,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(url, { redirect: 'manual', signal: controller.signal })
    return response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function issueUrl(assignment: RuntimeAssignment, manifest: RuntimeManifest): string {
  return `http://localhost:${assignment.uiPort}${manifest.basePath}`
}

function runtimeStartSummary(
  assignment: RuntimeAssignment,
  manifest: RuntimeManifest,
): string {
  return [
    `Issue ${assignment.issue} runtime: ${issueUrl(assignment, manifest)}`,
    `API: ${assignment.apiTarget} (${assignment.profile})`,
    `Local identity: ${assignment.userId}`,
    `Task title: ${assignment.issue}:${assignment.uiPort} - ${assignment.description}`,
  ].join('\n')
}

function parseOptions(args: readonly string[]): Map<string, string | true> {
  const options = new Map<string, string | true>()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`)
    const name = argument.slice(2)
    const next = args[index + 1]
    if (!next || next.startsWith('--')) {
      options.set(name, true)
    } else {
      options.set(name, next)
      index += 1
    }
  }
  return options
}

function rejectUnknownOptions(
  options: ReadonlyMap<string, string | true>,
  allowed: ReadonlySet<string>,
): void {
  for (const option of options.keys()) {
    if (!allowed.has(option)) throw new Error(`Unknown option: --${option}`)
  }
}

function requiredOption(
  options: ReadonlyMap<string, string | true>,
  name: string,
  command: string,
): string {
  const value = options.get(name)
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${command} requires --${name}.`)
  }
  return value.trim()
}

function rejectOptions(args: readonly string[], command: string): void {
  if (args.length > 0) throw new Error(`${command} does not accept options.`)
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) void main()
