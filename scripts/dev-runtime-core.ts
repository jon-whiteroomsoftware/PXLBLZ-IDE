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

export type MainApiHealth = 'ok' | 'wedged' | 'stopped'

// A port that accepts TCP but never answers is wedged, not listening: since
// wrangler's 24h tmp sweep can delete a live server's bundle dir out from
// under it (#895), occupancy alone says nothing about health.
export function classifyMainApiHealth(
  listenerCount: number,
  probeResponded: boolean,
): MainApiHealth {
  if (listenerCount === 0) return 'stopped'
  return probeResponded ? 'ok' : 'wedged'
}

export interface MainApiListener {
  pid: number
  command: string
}

export type MainApiAction = 'none' | 'start' | 'recover' | 'refuse'

// Recovery may only terminate processes provably ours: the repository's own
// wrangler CLI or its workerd child, resolved under the main worktree. An
// unreadable command (ps failed, process gone) is not proof of ownership.
export function isRepositoryWranglerCommand(command: string, mainWorktree: string): boolean {
  if (!command.includes(`${mainWorktree}/node_modules/`)) return false
  return command.includes('/wrangler/') || command.includes('workerd')
}

export function decideMainApiAction(
  listeners: readonly MainApiListener[],
  probeResponded: boolean,
  mainWorktree: string,
): MainApiAction {
  if (listeners.length === 0) return 'start'
  if (probeResponded) return 'none'
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
