export type RuntimeProfile = 'shared' | 'isolated'

export interface PortRange {
  start: number
  end: number
}

export interface RuntimeManifest {
  schemaVersion: 1
  project: string
  basePath: string
  shared: {
    vitePort: number
    wranglerPort: number
    issueVitePorts: PortRange
  }
  isolated: {
    vitePorts: PortRange
    wranglerPorts: PortRange
  }
  localIdentities: {
    developerUserId: string
    agentUserIdPrefix: string
    agentPoolSize: number
  }
}

export interface RuntimeAssignmentRequest {
  issue: string
  description: string
  worktree: string
  branch: string
  profile: RuntimeProfile
}

export interface RuntimeAssignment extends RuntimeAssignmentRequest {
  uiPort: number
  apiPort: number
  apiTarget: string
  userId: string
  createdAt: string
  updatedAt: string
  uiPid?: number
  apiPid?: number
}

export interface RuntimeRegistry {
  schemaVersion: 1
  assignments: RuntimeAssignment[]
}

export interface RuntimeAllocationDependencies {
  now(): string
  portIsAvailable(port: number): Promise<boolean>
}

export interface RuntimeAllocationResult {
  assignment: RuntimeAssignment
  registry: RuntimeRegistry
}

export type AssignmentPortState = 'free' | 'owned' | 'foreign'

export function emptyRuntimeRegistry(): RuntimeRegistry {
  return { schemaVersion: 1, assignments: [] }
}

export function parseRuntimeRegistry(value: unknown): RuntimeRegistry {
  if (!value || typeof value !== 'object') throw new Error('Runtime registry must be an object.')
  const registry = value as Partial<RuntimeRegistry>
  if (registry.schemaVersion !== 1 || !Array.isArray(registry.assignments)) {
    throw new Error('Runtime registry fields are malformed or unsupported.')
  }
  for (const assignment of registry.assignments) validateAssignment(assignment)
  return registry as RuntimeRegistry
}

export function parseRuntimeManifest(value: unknown): RuntimeManifest {
  if (!value || typeof value !== 'object') throw new Error('Runtime manifest must be an object.')
  const manifest = value as Partial<RuntimeManifest>
  if (manifest.schemaVersion !== 1
    || !nonEmptyString(manifest.project)
    || !nonEmptyString(manifest.basePath)
    || !manifest.shared
    || !validPort(manifest.shared.vitePort)
    || !validPort(manifest.shared.wranglerPort)
    || !validPortRange(manifest.shared.issueVitePorts)
    || !manifest.isolated
    || !validPortRange(manifest.isolated.vitePorts)
    || !validPortRange(manifest.isolated.wranglerPorts)
    || !manifest.localIdentities
    || !nonEmptyString(manifest.localIdentities.developerUserId)
    || !nonEmptyString(manifest.localIdentities.agentUserIdPrefix)
    || !Number.isInteger(manifest.localIdentities.agentPoolSize)
    || manifest.localIdentities.agentPoolSize < 1) {
    throw new Error('Runtime manifest fields are malformed or unsupported.')
  }
  if (portInRange(manifest.shared.vitePort, manifest.shared.issueVitePorts)) {
    throw new Error(
      `Runtime manifest issue Vite port range overlaps stable main Vite port ${manifest.shared.vitePort}.`,
    )
  }
  if (portInRange(manifest.shared.vitePort, manifest.isolated.vitePorts)) {
    throw new Error(
      `Runtime manifest isolated Vite port range overlaps stable main Vite port ${manifest.shared.vitePort}.`,
    )
  }
  if (rangesOverlap(manifest.shared.issueVitePorts, manifest.isolated.vitePorts)) {
    throw new Error('Runtime manifest shared and isolated Vite port ranges overlap.')
  }
  if (portInRange(manifest.shared.wranglerPort, manifest.isolated.wranglerPorts)) {
    throw new Error(
      `Runtime manifest isolated Wrangler port range overlaps shared Wrangler port ${manifest.shared.wranglerPort}.`,
    )
  }
  return manifest as RuntimeManifest
}

export function classifyAssignmentPort(
  assignment: RuntimeAssignment,
  listenerPids: readonly number[],
): AssignmentPortState {
  const uniqueListeners = [...new Set(listenerPids)]
  if (uniqueListeners.length === 0) return 'free'
  if (assignment.uiPid !== undefined
    && uniqueListeners.length === 1
    && uniqueListeners[0] === assignment.uiPid) {
    return 'owned'
  }
  return 'foreign'
}

// A wedge is a transport-level failure: the port accepts TCP but no response
// ever arrives. A server that answers — even with a 5xx — has proven it is
// running and must never be terminated by recovery.
export type ProbeOutcome = 'ok' | 'error' | 'unresponsive'

export type MainApiHealth = 'ok' | 'erroring' | 'wedged' | 'stopped'

// Occupancy alone says nothing about health: since wrangler's 24h tmp sweep
// can delete a live server's bundle dir out from under it (#895), a listening
// port may hang every request forever.
export function classifyMainApiHealth(
  listenerCount: number,
  probe: ProbeOutcome,
): MainApiHealth {
  if (listenerCount === 0) return 'stopped'
  if (probe === 'ok') return 'ok'
  return probe === 'error' ? 'erroring' : 'wedged'
}

export interface MainApiListener {
  pid: number
  command: string
}

export type MainApiAction = 'none' | 'start' | 'recover' | 'refuse' | 'unhealthy'

// Recovery may only terminate processes provably ours: the repository's own
// wrangler CLI or its workerd child, resolved under the main worktree's
// node_modules. Only the executable and node-script argv positions count — a
// process merely mentioning a wrangler path in a later argument is not ours.
// Tokens are path-normalized so `..` segments cannot smuggle a foreign script
// past a prefix check, package prefixes are exact (`wrangler/`,
// `@cloudflare/workerd[-platform]/`) so lookalike packages fail, and an
// unreadable command (ps failed, process gone) is not proof of ownership.
export function isRepositoryWranglerCommand(command: string, mainWorktree: string): boolean {
  const tokens = command.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false
  if (matchesRepositoryWranglerPath(tokens[0], mainWorktree)) return true
  const executable = tokens[0].split('/').pop()
  if (executable !== 'node') return false
  // Node options can consume a following operand (--require, --loader, ...),
  // so a generic skip-the-dashes scan can mistake an operand for the script.
  // Only the exact no-operand flags wrangler's own child uses are allowed;
  // any other flag refuses conservatively.
  let index = 1
  while (index < tokens.length && tokens[index].startsWith('-')) {
    if (!wranglerChildNodeFlags.has(tokens[index])) return false
    index += 1
  }
  return index < tokens.length && matchesRepositoryWranglerPath(tokens[index], mainWorktree)
}

const wranglerChildNodeFlags = new Set(['--no-warnings', '--experimental-vm-modules'])

// The allowlist is grounded in the observed process group of a live
// `wrangler pages dev` (4.106.0): the wrangler CLI script, its pages child,
// two workerd processes, and one esbuild service binary.
function matchesRepositoryWranglerPath(token: string, mainWorktree: string): boolean {
  const moduleRoot = `${mainWorktree}/node_modules/`
  const normalized = normalizePathish(token)
  if (!normalized.startsWith(moduleRoot)) return false
  const relative = normalized.slice(moduleRoot.length)
  return relative.startsWith('wrangler/')
    || /^@cloudflare\/workerd(?:-[a-z0-9-]+)?\//.test(relative)
    || /^@esbuild\/[a-z0-9_-]+\/bin\/esbuild$/.test(relative)
}

// Everything recovery would signal must be provably ours: signals go to whole
// process groups, so every member — not just the port listener — needs to
// pass the ownership check before any signal is sent.
export function unownedGroupMembers(
  members: readonly MainApiListener[],
  mainWorktree: string,
): MainApiListener[] {
  return members.filter((member) => !isRepositoryWranglerCommand(member.command, mainWorktree))
}

function normalizePathish(token: string): string {
  const segments: string[] = []
  for (const segment of token.split('/')) {
    if (segment === '' && segments.length > 0) continue
    if (segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join('/')
}

export function decideMainApiAction(
  listeners: readonly MainApiListener[],
  probe: ProbeOutcome,
  mainWorktree: string,
): MainApiAction {
  if (listeners.length === 0) return 'start'
  if (probe === 'ok') return 'none'
  if (probe === 'error') return 'unhealthy'
  return listeners.every((listener) => isRepositoryWranglerCommand(listener.command, mainWorktree))
    ? 'recover'
    : 'refuse'
}

export function classifyProcessGroupPort(
  processGroupId: number | undefined,
  listenerPids: readonly number[],
  processGroups: ReadonlyMap<number, number>,
): AssignmentPortState {
  const uniqueListeners = [...new Set(listenerPids)]
  if (uniqueListeners.length === 0) return 'free'
  if (processGroupId !== undefined && uniqueListeners.every(
    (pid) => processGroups.get(pid) === processGroupId
  )) {
    return 'owned'
  }
  return 'foreign'
}

export async function allocateRuntimeAssignment(
  registry: RuntimeRegistry,
  request: RuntimeAssignmentRequest,
  manifest: RuntimeManifest,
  dependencies: RuntimeAllocationDependencies,
): Promise<RuntimeAllocationResult> {
  validateAssignmentRequest(request)
  const existing = registry.assignments.find((assignment) => (
    assignment.issue === request.issue
  ))
  if (existing) {
    if (existing.worktree !== request.worktree) {
      throw new Error(`Issue ${request.issue} is already assigned to ${existing.worktree}.`)
    }
    if (existing.profile !== request.profile) {
      throw new Error(
        `Issue ${request.issue} is already assigned with profile ${existing.profile}; release it before changing profiles.`,
      )
    }
    return { assignment: existing, registry }
  }

  const uiRange = request.profile === 'shared'
    ? manifest.shared.issueVitePorts
    : manifest.isolated.vitePorts
  const uiPort = await firstAvailablePort(
    uiRange,
    registry.assignments.map((assignment) => assignment.uiPort),
    dependencies.portIsAvailable,
  )
  const apiPort = request.profile === 'shared'
    ? manifest.shared.wranglerPort
    : await firstAvailablePort(
        manifest.isolated.wranglerPorts,
        registry.assignments.map((assignment) => assignment.apiPort),
        dependencies.portIsAvailable,
      )
  const now = dependencies.now()
  const assignment: RuntimeAssignment = {
    ...request,
    uiPort,
    apiPort,
    apiTarget: `http://localhost:${apiPort}`,
    userId: nextAgentUserId(registry, manifest),
    createdAt: now,
    updatedAt: now,
  }
  return {
    assignment,
    registry: {
      ...registry,
      assignments: [...registry.assignments, assignment],
    },
  }
}

async function firstAvailablePort(
  range: PortRange,
  reserved: readonly number[],
  portIsAvailable: (port: number) => Promise<boolean>,
): Promise<number> {
  for (let port = range.start; port <= range.end; port += 1) {
    if (reserved.includes(port)) continue
    if (await portIsAvailable(port)) return port
  }
  throw new Error(`No available port in ${range.start}-${range.end}.`)
}

function nextAgentUserId(
  registry: RuntimeRegistry,
  manifest: RuntimeManifest,
): string {
  const assigned = new Set(registry.assignments.map((assignment) => assignment.userId))
  for (let index = 1; index <= manifest.localIdentities.agentPoolSize; index += 1) {
    const candidate = `${manifest.localIdentities.agentUserIdPrefix}${String(index).padStart(2, '0')}`
    if (!assigned.has(candidate)) return candidate
  }
  throw new Error('No local agent identity is available.')
}

function validPort(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 65_535
}

function validPortRange(value: unknown): value is PortRange {
  if (!value || typeof value !== 'object') return false
  const range = value as Partial<PortRange>
  return validPort(range.start) && validPort(range.end) && range.start <= range.end
}

function portInRange(port: number, range: PortRange): boolean {
  return port >= range.start && port <= range.end
}

function rangesOverlap(first: PortRange, second: PortRange): boolean {
  return first.start <= second.end && second.start <= first.end
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateAssignmentRequest(value: RuntimeAssignmentRequest): void {
  if (!nonEmptyString(value.issue)
    || !nonEmptyString(value.description)
    || !nonEmptyString(value.worktree)
    || !nonEmptyString(value.branch)
    || (value.profile !== 'shared' && value.profile !== 'isolated')) {
    throw new Error('Runtime assignment request fields are malformed or unsupported.')
  }
}

function validateAssignment(value: unknown): asserts value is RuntimeAssignment {
  if (!value || typeof value !== 'object') throw new Error('Runtime assignment must be an object.')
  const assignment = value as Partial<RuntimeAssignment>
  if (!nonEmptyString(assignment.issue)
    || !nonEmptyString(assignment.description)
    || !nonEmptyString(assignment.worktree)
    || !nonEmptyString(assignment.branch)
    || (assignment.profile !== 'shared' && assignment.profile !== 'isolated')
    || !validPort(assignment.uiPort)
    || !validPort(assignment.apiPort)
    || !nonEmptyString(assignment.apiTarget)
    || !nonEmptyString(assignment.userId)
    || !nonEmptyString(assignment.createdAt)
    || !nonEmptyString(assignment.updatedAt)
    || (assignment.uiPid !== undefined && (!Number.isInteger(assignment.uiPid) || assignment.uiPid < 1))
    || (assignment.apiPid !== undefined && (!Number.isInteger(assignment.apiPid) || assignment.apiPid < 1))) {
    throw new Error('Runtime assignment fields are malformed or unsupported.')
  }
}
