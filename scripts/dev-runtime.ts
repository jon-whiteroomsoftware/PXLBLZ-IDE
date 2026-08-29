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
  groupIndicatesWorkerRuntime,
  isRepositoryRuntimeCommand,
  parseRuntimeManifest,
  unownedGroupMembers,
  type MainApiListener,
  type ProbeOutcome,
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
  if (args.profile === 'shared' && assignment.apiPort !== manifest.shared.vitePort) {
    // A persisted pre-#900 shared assignment still targets the retired
    // standalone Wrangler port. Stop its stale proxy Vite (which froze that
    // target at spawn), repoint the assignment at the main origin, and let
    // the normal start path below bring up a fresh proxy.
    await stopOwnedUiProcess(assignment)
    const updated = await updateRuntimeAssignment(context.runtimeDirectory, assignment.issue, (current) => ({
      ...current,
      apiPort: manifest.shared.vitePort,
      apiTarget: `http://localhost:${manifest.shared.vitePort}`,
      uiPid: undefined,
      updatedAt: new Date().toISOString(),
    }))
    Object.assign(assignment, updated)
  }
  if (args.profile === 'isolated' && assignment.apiPort !== assignment.uiPort) {
    // Coordinator-started isolated runtimes are single-process (#900): the
    // Worker runs inside the Vite process, so the assignment self-targets its
    // UI origin. A persisted two-process assignment first retires its owned
    // legacy API service and proxy Vite so nothing is orphaned when the
    // registry entry stops describing them. (The authenticated Playwright
    // wrapper still reserves and serves a distinct API port until #901; it
    // does not pass through here.)
    // Validate both halves before touching either, so a refusal leaves the
    // legacy runtime whole instead of half-dismantled.
    const apiState = classifyApiPort(assignment)
    if (apiState === 'foreign') {
      throw new Error(
        `Port ${assignment.apiPort} is owned by a process other than issue ${assignment.issue}; refusing to reuse it.`,
      )
    }
    const legacyUiListeners = listenerPids(assignment.uiPort)
    const uiState = classifyAssignmentPort(assignment, legacyUiListeners)
    if (uiState === 'foreign') {
      throw new Error(
        `Port ${assignment.uiPort} is owned by a process other than issue ${assignment.issue}; refusing to reuse it.`,
      )
    }
    if (apiState === 'owned') {
      await stopWedgedListeners(listenerPids(assignment.apiPort), assignment.apiPort, assignment.worktree)
    }
    if (uiState === 'owned') {
      await stopWedgedListeners(legacyUiListeners, assignment.uiPort, assignment.worktree)
    }
    const updated = await updateRuntimeAssignment(context.runtimeDirectory, assignment.issue, (current) => ({
      ...current,
      apiPort: current.uiPort,
      apiTarget: `http://localhost:${current.uiPort}`,
      apiPid: undefined,
      uiPid: undefined,
      updatedAt: new Date().toISOString(),
    }))
    Object.assign(assignment, updated)
  }

  const portState = classifyAssignmentPort(assignment, listenerPids(assignment.uiPort))
  if (portState === 'foreign') {
    throw new Error(
      `Port ${assignment.uiPort} is owned by a process other than issue ${assignment.issue}; refusing to reuse it.`,
    )
  }
  if (portState === 'free') {
    if (args.profile === 'isolated') {
      const persistence = isolatedPersistence(context.runtimeDirectory, assignment.issue)
      prepareD1(context.worktree, persistence, manifest)
      const pid = startVite(context.worktree, assignment, context.runtimeDirectory, {
        kind: 'worker',
        persistState: persistence,
      })
      await updateRuntimeAssignment(context.runtimeDirectory, assignment.issue, (current) => ({
        ...current,
        uiPid: pid,
        updatedAt: new Date().toISOString(),
      }))
      try {
        await waitForUrl(issueUrl(assignment, manifest), 30_000)
        await waitForUrl(`${assignment.apiTarget}/api/me`, 30_000)
      } catch (error) {
        // Roll the failed startup back so the next run does not mistake the
        // registered-but-broken process for a healthy owned runtime. The
        // ownership record is cleared only once the process is verifiably
        // gone; a survivor keeps its registry entry so nothing leaks as
        // unowned.
        await stopStartedProcess(pid, context.worktree, error)
        await updateRuntimeAssignment(context.runtimeDirectory, assignment.issue, (current) => ({
          ...current,
          uiPid: undefined,
          updatedAt: new Date().toISOString(),
        }))
        throw error
      }
    } else {
      const pid = startVite(context.worktree, assignment, context.runtimeDirectory, {
        kind: 'proxy',
        target: assignment.apiTarget,
      })
      await updateRuntimeAssignment(context.runtimeDirectory, assignment.issue, (current) => ({
        ...current,
        uiPid: pid,
        updatedAt: new Date().toISOString(),
      }))
      await waitForUrl(issueUrl(assignment, manifest), 30_000)
    }
  }
  console.log(runtimeStartSummary(assignment, manifest))
}

// Stops an assignment's owned UI process (its proxy or worker-dev Vite)
// ahead of a topology rewrite; a foreign occupant refuses, a free port is a
// no-op. A registry PID match alone does not authorize the signal — PIDs get
// reused — so the stop verifies every member of the process group against
// the assignment's own worktree before anything is signaled.
async function stopOwnedUiProcess(assignment: RuntimeAssignment): Promise<void> {
  const uiListeners = listenerPids(assignment.uiPort)
  const uiState = classifyAssignmentPort(assignment, uiListeners)
  if (uiState === 'foreign') {
    throw new Error(
      `Port ${assignment.uiPort} is owned by a process other than issue ${assignment.issue}; refusing to reuse it.`,
    )
  }
  if (uiState === 'owned') {
    await stopWedgedListeners(uiListeners, assignment.uiPort, assignment.worktree)
  }
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
  // Single-process runtimes (#900) self-target their UI port; only legacy
  // two-process assignments have a separate API service to classify.
  const apiState = assignment.profile === 'isolated' && assignment.apiPort !== assignment.uiPort
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
  if (assignment.profile === 'isolated' && assignment.apiPort !== assignment.uiPort) {
    // Legacy two-process assignments only; single-process runtimes (#900)
    // self-target their UI port and have no separate API service.
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
  const apiUrl = `http://localhost:${manifest.shared.vitePort}/api/me`
  const apiListeners = listenerPids(manifest.shared.vitePort)
  const apiProbe = apiListeners.length > 0
    ? await probeService(apiUrl, serviceProbeTimeoutMs)
    : 'unresponsive'
  const apiHealth = classifyMainApiHealth(apiListeners.length, apiProbe)
  const mainStatus = {
    issue: 'main',
    description: 'stable reviewed main',
    worktree: context.mainWorktree,
    branch: 'main',
    profile: 'shared',
    uiPort: manifest.shared.vitePort,
    uiUrl: `http://localhost:${manifest.shared.vitePort}${manifest.basePath}`,
    apiTarget: `http://localhost:${manifest.shared.vitePort}`,
    uiState: listenerPids(manifest.shared.vitePort).length > 0 ? 'listening' : 'stopped',
    apiState: apiHealth === 'ok' ? 'listening' : apiHealth,
  }
  const assignments = loadRuntimeRegistry(context.runtimeDirectory).assignments.map((assignment) => ({
    ...assignment,
    uiUrl: issueUrl(assignment, manifest),
    uiState: classifyAssignmentPort(assignment, listenerPids(assignment.uiPort)),
    apiState: assignment.profile === 'shared'
      ? (listenerPids(assignment.apiPort).length > 0 ? 'shared' : 'stopped')
      : assignment.apiPort === assignment.uiPort
        // Self-targeted single-process runtimes (#900): the API lives in the
        // UI process, so its state is the UI process's state.
        ? classifyAssignmentPort(assignment, listenerPids(assignment.uiPort))
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

// The stable main runtime is one worker-dev Vite process (#900): the
// Cloudflare plugin serves the Worker and local D1 from the Vite port, and
// the legacy `wrangler pages dev` on the manifest's wranglerPort is retired
// on sight. Recovery still refuses any process that is not provably ours.
async function ensureMainRuntime(
  context: RepositoryContext,
  manifest: RuntimeManifest,
): Promise<void> {
  if (!existsSync(join(context.mainWorktree, '.dev.vars'))) {
    throw new Error(`Shared main .dev.vars is required: ${join(context.mainWorktree, '.dev.vars')}`)
  }
  keepMainWranglerTmpFresh(context)
  const uiUrl = `http://localhost:${manifest.shared.vitePort}${manifest.basePath}`
  const apiUrl = `http://localhost:${manifest.shared.vitePort}/api/me`

  // Every refusal happens before any signal is sent, so a refused run leaves
  // whatever topology it found intact.
  const uiPids = listenerPids(manifest.shared.vitePort)
  const apiProbe = uiPids.length > 0
    ? await probeService(apiUrl, serviceProbeTimeoutMs)
    : 'unresponsive'
  const uiListeners: MainApiListener[] = uiPids.map((pid) => ({ pid, command: processCommand(pid) }))
  let runtimeAction = decideMainApiAction(uiListeners, apiProbe, context.mainWorktree)
  const uiGroupMembers = uiPids
    .map(processGroupId)
    .filter(Number.isInteger)
    .flatMap((group) => processGroupMembers(group))
  if (runtimeAction === 'unhealthy') {
    // A worker-dev runtime carries workerd in its process group; a legacy
    // proxy-mode Vite does not. An owned, workerd-less group answering 5xx is
    // the beheaded proxy whose standalone API target retired — restart it as
    // the single process. A group with workerd is a live application erroring
    // and is never terminated.
    const beheadedProxy = uiGroupMembers.length > 0
      && unownedGroupMembers(uiGroupMembers, context.mainWorktree).length === 0
      && !groupIndicatesWorkerRuntime(uiGroupMembers)
    if (!beheadedProxy) {
      throw new Error(
        `Port ${manifest.shared.vitePort} answers ${apiUrl} with server errors; the process is alive, so`
        + ' recovery will not terminate it. Inspect the main runtime log and stop it manually if a restart is needed.',
      )
    }
    console.log(
      `Port ${manifest.shared.vitePort} is a legacy proxy-mode Vite without its API target (#900); `
      + 'restarting it as the single-process runtime.',
    )
    runtimeAction = 'recover'
  }
  if (runtimeAction === 'refuse') {
    throw new Error(
      `Port ${manifest.shared.vitePort} is occupied but ${apiUrl} is unresponsive, and the listener is not this repository's runtime; refusing to terminate it:\n`
      + uiListeners.map((listener) => `  ${listener.pid} ${listener.command || '(unreadable command)'}`).join('\n'),
    )
  }
  if (uiPids.length > 0) {
    // A healthy probe does not prove identity: another worktree's healthy
    // worker-dev on this port must never be reported as reviewed main. And
    // the full 5174 group must be provably ours before the legacy 8788 is
    // touched, so a later group refusal cannot leave the topology beheaded.
    const unownedListeners = uiListeners.filter(
      (listener) => !isRepositoryRuntimeCommand(listener.command, context.mainWorktree),
    )
    if (unownedListeners.length > 0) {
      throw new Error(
        `Port ${manifest.shared.vitePort} is served by a process that is not the reviewed-main runtime; refusing to adopt or replace it:\n`
        + unownedListeners.map((listener) => `  ${listener.pid} ${listener.command || '(unreadable command)'}`).join('\n'),
      )
    }
    if (uiGroupMembers.length === 0) {
      throw new Error(
        `Cannot enumerate the process group serving port ${manifest.shared.vitePort}; refusing to proceed.`,
      )
    }
    const unownedMembers = unownedGroupMembers(uiGroupMembers, context.mainWorktree)
    if (unownedMembers.length > 0) {
      throw new Error(
        `The process group serving port ${manifest.shared.vitePort} contains processes that are not this repository's runtime; refusing to proceed:\n`
        + unownedMembers.map((member) => `  ${member.pid} ${member.command || '(unreadable command)'}`).join('\n'),
      )
    }
  }

  const legacyPids = listenerPids(manifest.shared.wranglerPort)
  if (legacyPids.length > 0) {
    const legacyListeners: MainApiListener[] = legacyPids.map((pid) => ({ pid, command: processCommand(pid) }))
    const unowned = legacyListeners.filter((listener) => !isRepositoryRuntimeCommand(listener.command, context.mainWorktree))
    if (unowned.length > 0) {
      throw new Error(
        `Port ${manifest.shared.wranglerPort} is occupied by processes that are not this repository's legacy Wrangler; refusing to retire them:\n`
        + unowned.map((listener) => `  ${listener.pid} ${listener.command || '(unreadable command)'}`).join('\n'),
      )
    }
  }
  if (runtimeAction === 'none' && legacyPids.length > 0 && !groupIndicatesWorkerRuntime(uiGroupMembers)) {
    // A healthy 5174 answering only through a live legacy 8788 is the old
    // proxy topology; both halves restart as the single process.
    console.log(
      `Port ${manifest.shared.vitePort} is a legacy proxy-mode Vite answering through ${manifest.shared.wranglerPort} (#900); `
      + 'restarting it as the single-process runtime.',
    )
    runtimeAction = 'recover'
  }

  // All refusals are behind us: retire the legacy standalone Wrangler, then
  // any Vite this run replaces.
  if (legacyPids.length > 0) {
    console.log(
      `Retiring the legacy two-process pair (#900): stopping wrangler pages dev on ${manifest.shared.wranglerPort}`
      + ` (PIDs ${legacyPids.join(', ')}).`,
    )
    await stopWedgedListeners(legacyPids, manifest.shared.wranglerPort, context.mainWorktree)
  }
  if (runtimeAction === 'recover') {
    // The no-workerd constraint travels into the stop: if workerd appears in
    // the group between the decision above and the signal, the guard refuses
    // rather than killing what has become a live worker runtime.
    const requireProxyGroup = apiProbe === 'error'
      ? (members: readonly MainApiListener[]) => {
          if (groupIndicatesWorkerRuntime(members)) {
            throw new Error(
              'Refusing to terminate: the group now contains workerd, so it is a live worker runtime, not a beheaded proxy.',
            )
          }
        }
      : undefined
    await stopWedgedListeners(uiPids, manifest.shared.vitePort, context.mainWorktree, requireProxyGroup)
  }
  if (runtimeAction === 'none') {
    // A healthy /api does not prove the UI: probe the base path too, and
    // refuse to report a partially-broken runtime as available.
    const uiProbe = await probeService(uiUrl, serviceProbeTimeoutMs)
    if (uiProbe !== 'ok') {
      throw new Error(
        `Port ${manifest.shared.vitePort} serves ${apiUrl} but ${uiUrl} is unhealthy;`
        + ' inspect the main runtime log and stop it manually if a restart is needed.',
      )
    }
  }
  prepareD1(context.mainWorktree, resolve(context.mainWorktree, '.wrangler/state'), manifest)
  if (runtimeAction !== 'none') {
    startDetached(
      process.execPath,
      [resolve(context.mainWorktree, 'node_modules/vite/bin/vite.js')],
      context.mainWorktree,
      join(context.runtimeDirectory, 'logs', 'main-vite.log'),
      {
        VITE_PORT: String(manifest.shared.vitePort),
      },
    )
    await waitForUrl(apiUrl, 60_000)
    await waitForUrl(uiUrl, 30_000)
  }
  console.log(
    `Stable main is available at http://localhost:${manifest.shared.vitePort}${manifest.basePath}`
    + ` serving UI and /api from one process.`,
  )
}

async function requireHealthySharedRuntime(manifest: RuntimeManifest): Promise<void> {
  const uiUrl = `http://localhost:${manifest.shared.vitePort}${manifest.basePath}`
  const apiUrl = `http://localhost:${manifest.shared.vitePort}/api/me`
  const apiListenerCount = listenerPids(manifest.shared.vitePort).length
  const [uiProbe, apiProbe] = await Promise.all([
    probeService(uiUrl, serviceProbeTimeoutMs),
    probeService(apiUrl, serviceProbeTimeoutMs),
  ])
  const uiHealthy = uiProbe === 'ok'
  const apiHealth = classifyMainApiHealth(apiListenerCount, apiProbe)
  if (!uiHealthy || apiHealth !== 'ok') {
    throw new Error(
      `Stable main runtime is not healthy (${uiUrl}: ${uiHealthy ? 'ok' : 'down'},`
      + ` ${apiUrl}: ${apiHealth}). Run \`npm run dev:main\` to `
      + (apiHealth === 'wedged'
        ? 'recover the wedged main runtime'
        : 'start the single-process main runtime')
      + ' before assigning shared issue runtimes.',
    )
  }
}

type ViteMode =
  | { kind: 'proxy'; target: string }
  | { kind: 'worker'; persistState: string }

function startVite(
  worktree: string,
  assignment: RuntimeAssignment,
  runtimeDirectory: string,
  mode: ViteMode,
): number {
  return startDetached(
    process.execPath,
    [resolve(worktree, 'node_modules/vite/bin/vite.js')],
    worktree,
    join(runtimeDirectory, 'logs', `issue-${assignment.issue}-vite.log`),
    {
      VITE_PORT: String(assignment.uiPort),
      ...(mode.kind === 'proxy'
        ? { VITE_API_PROXY_TARGET: mode.target }
        : { VITE_CF_PERSIST_STATE: mode.persistState }),
    },
  )
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
    // Topology-selecting variables must come only from the caller: an
    // inherited proxy target or persistence path from the invoking shell
    // would silently flip a runtime's mode or point it at the wrong D1.
    const merged: NodeJS.ProcessEnv = { ...process.env }
    for (const key of ['VITE_PORT', 'VITE_API_PROXY_TARGET', 'VITE_CF_PERSIST_STATE', 'VITE_BASE_PATH']) {
      delete merged[key]
    }
    Object.assign(merged, env)
    const child = spawn(command, args, {
      cwd,
      detached: true,
      env: merged,
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

// All processes in a group, from one full-table ps read; [] when ps fails.
function processGroupMembers(group: number): MainApiListener[] {
  let output: string
  try {
    output = execFileSync('ps', ['-axo', 'pid=,pgid=,command='], { encoding: 'utf8' })
  } catch {
    return []
  }
  const members: MainApiListener[] = []
  for (const line of output.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
    if (!match) continue
    if (Number(match[2]) !== group) continue
    members.push({ pid: Number(match[1]), command: match[3] })
  }
  return members
}

function stopProcessGroup(processGroupId: number): void {
  try {
    process.kill(-processGroupId, 'SIGTERM')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

// Retires a process this run just started: group membership is re-verified
// under the launching worktree before any signal, SIGTERM escalates to
// SIGKILL, and a survivor (or a group no longer provably ours) throws so the
// caller keeps its ownership record instead of leaking an unowned process.
async function stopStartedProcess(pid: number, worktreeRoot: string, startupError: unknown): Promise<void> {
  const group = processGroupId(pid)
  if (!Number.isInteger(group)) return
  const members = processGroupMembers(group)
  if (members.length === 0) return
  const unowned = unownedGroupMembers(members, worktreeRoot)
  if (unowned.length > 0) {
    throw new Error(
      `Startup failed and process group ${group} can no longer be proven ours; leaving it and its registry record in place:\n`
      + unowned.map((member) => `  ${member.pid} ${member.command || '(unreadable command)'}`).join('\n'),
      { cause: startupError },
    )
  }
  stopProcessGroup(group)
  if (await waitForGroupGone(group, 5_000)) return
  try {
    process.kill(-group, 'SIGKILL')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    return
  }
  if (!await waitForGroupGone(group, 5_000)) {
    throw new Error(
      `Startup failed and process group ${group} survived SIGKILL; leaving its registry record in place.`,
      { cause: startupError },
    )
  }
}

// Only ESRCH proves a group is gone; other probe errors propagate.
function groupGone(group: number): boolean {
  try {
    process.kill(-group, 0)
    return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true
    throw error
  }
}

async function waitForGroupGone(group: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (groupGone(group)) return true
    await new Promise((resolveWait) => setTimeout(resolveWait, 150))
  }
  return groupGone(group)
}

async function stopWedgedListeners(
  pids: readonly number[],
  port: number,
  mainWorktree: string,
  requireGroup?: (members: readonly MainApiListener[]) => void,
): Promise<void> {
  const groupsByPid = pids.map((pid) => ({ pid, group: processGroupId(pid) }))
  const unresolved = groupsByPid.filter(({ group }) => !Number.isInteger(group))
  if (groupsByPid.length === 0 || unresolved.length > 0) {
    // Signaling only the resolvable groups would partially terminate the
    // runtime and then time out on the survivor; all-or-nothing keeps state.
    throw new Error(
      `Cannot resolve process groups for PIDs ${(unresolved.length > 0 ? unresolved.map(({ pid }) => pid) : [...pids]).join(', ')}; refusing to signal any of them.`,
    )
  }
  const groups = [...new Set(groupsByPid.map(({ group }) => group))]
  for (const group of groups) {
    const members = processGroupMembers(group)
    if (members.length === 0) {
      throw new Error(`Cannot enumerate process group ${group}; refusing to signal it.`)
    }
    const unowned = unownedGroupMembers(members, mainWorktree)
    if (unowned.length > 0) {
      throw new Error(
        `Process group ${group} contains processes that are not this repository's Wrangler; refusing to terminate it:\n`
        + unowned.map((member) => `  ${member.pid} ${member.command || '(unreadable command)'}`).join('\n'),
      )
    }
    requireGroup?.(members)
  }
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
    if (await probeService(url, serviceProbeTimeoutMs) === 'ok') return
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

// Hard-bounded tri-state probe: a wedged server accepts the TCP connection
// and then never answers, so the timeout must win even against a fetcher that
// ignores its abort signal — the race, not the abort, enforces the bound. An
// answered request, whatever its status, proves the process is alive; only
// silence is 'unresponsive'.
export async function probeService(
  url: string,
  timeoutMs: number,
  fetcher: typeof fetch = fetch,
): Promise<ProbeOutcome> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<ProbeOutcome>((resolveTimeout) => {
    timer = setTimeout(() => {
      controller.abort()
      resolveTimeout('unresponsive')
    }, timeoutMs)
  })
  const request = fetcher(url, { redirect: 'manual', signal: controller.signal })
    .then((response): ProbeOutcome => (response.status < 500 ? 'ok' : 'error'))
    .catch((): ProbeOutcome => 'unresponsive')
  try {
    return await Promise.race([request, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
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
