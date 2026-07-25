import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  allocateRuntimeAssignment,
  emptyRuntimeRegistry,
  parseRuntimeRegistry,
  type RuntimeAllocationDependencies,
  type RuntimeAssignment,
  type RuntimeAssignmentRequest,
  type RuntimeManifest,
  type RuntimeRegistry,
} from './dev-runtime-core'

const REGISTRY_FILE = 'registry-v1.json'
const LOCK_DIRECTORY = 'registry-v1.lock'
const LOCK_OWNER_FILE = 'owner.json'
const LOCK_TIMEOUT_MS = 5_000
const LOCK_STALE_MS = 30_000

export interface ReserveRuntimeAssignmentInput extends RuntimeAllocationDependencies {
  directory: string
  request: RuntimeAssignmentRequest
  manifest: RuntimeManifest
}

export async function reserveRuntimeAssignment(
  input: ReserveRuntimeAssignmentInput,
): Promise<RuntimeAssignment> {
  return withRegistryLock(input.directory, async () => {
    const result = await allocateRuntimeAssignment(
      loadRuntimeRegistry(input.directory),
      input.request,
      input.manifest,
      input,
    )
    writeRuntimeRegistry(input.directory, result.registry)
    return result.assignment
  })
}

export function loadRuntimeRegistry(directory: string): RuntimeRegistry {
  try {
    return parseRuntimeRegistry(JSON.parse(readFileSync(join(directory, REGISTRY_FILE), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyRuntimeRegistry()
    throw error
  }
}

export async function updateRuntimeAssignment(
  directory: string,
  issue: string,
  update: (assignment: RuntimeAssignment) => RuntimeAssignment,
): Promise<RuntimeAssignment> {
  return withRegistryLock(directory, async () => {
    const registry = loadRuntimeRegistry(directory)
    const index = registry.assignments.findIndex((assignment) => assignment.issue === issue)
    if (index === -1) throw new Error(`Issue ${issue} has no runtime assignment.`)
    const assignment = update(registry.assignments[index])
    const assignments = [...registry.assignments]
    assignments[index] = assignment
    writeRuntimeRegistry(directory, { ...registry, assignments })
    return assignment
  })
}

export async function releaseRuntimeAssignment(
  directory: string,
  issue: string,
): Promise<RuntimeAssignment | null> {
  return withRegistryLock(directory, async () => {
    const registry = loadRuntimeRegistry(directory)
    const assignment = registry.assignments.find((entry) => entry.issue === issue) ?? null
    if (!assignment) return null
    writeRuntimeRegistry(directory, {
      ...registry,
      assignments: registry.assignments.filter((entry) => entry.issue !== issue),
    })
    return assignment
  })
}

function writeRuntimeRegistry(directory: string, registry: RuntimeRegistry): void {
  mkdirSync(directory, { recursive: true })
  const path = join(directory, REGISTRY_FILE)
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`, { flag: 'wx' })
  renameSync(temporary, path)
}

async function withRegistryLock<T>(
  directory: string,
  operation: () => Promise<T>,
): Promise<T> {
  mkdirSync(directory, { recursive: true })
  const lock = join(directory, LOCK_DIRECTORY)
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  while (true) {
    try {
      mkdirSync(lock)
      writeFileSync(join(lock, LOCK_OWNER_FILE), `${JSON.stringify({
        pid: process.pid,
        createdAt: Date.now(),
      })}\n`)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (registryLockIsStale(lock)) {
        rmSync(lock, { recursive: true, force: true })
        continue
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for runtime registry lock: ${lock}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  try {
    return await operation()
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

function registryLockIsStale(lock: string): boolean {
  try {
    const owner = JSON.parse(readFileSync(join(lock, LOCK_OWNER_FILE), 'utf8')) as {
      pid?: unknown
      createdAt?: unknown
    }
    if (!Number.isInteger(owner.pid) || !Number.isFinite(owner.createdAt)) return true
    if (Date.now() - Number(owner.createdAt) > LOCK_STALE_MS) return true
    try {
      process.kill(Number(owner.pid), 0)
      return false
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH'
    }
  } catch {
    try {
      return Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS
    } catch {
      return false
    }
  }
}
