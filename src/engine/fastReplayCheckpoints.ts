import {
  advanceFastReplayCooperatively,
  type CooperativeFastReplayCheckpointing,
  type FastReplayAdvanceOptions,
  type FastReplayResult,
  type FastReplayRuntime,
  type FastReplaySnapshot,
} from './fastReplay'

export interface FastReplayCheckpointKeyParts {
  artifactIdentity: object
  mapPointsIdentity: object
  randomSeed: number
  fidelity: 'fast' | 'fidelity'
  stepMs: number
  temporalFeedbackSeek: 'exact' | 'clear-at-target'
}

export interface FastReplayCheckpointStoreOptions {
  intervalMs?: number
  maxCheckpoints?: number
  targetSnapshotBytes?: number
}

export interface FastReplayCheckpoint<Key> {
  key: Key
  elapsedMs: number
  snapshot: FastReplaySnapshot
  byteSize: number
}

interface StoredFastReplayCheckpoint<Key> extends FastReplayCheckpoint<Key> {
  sequence: number
}

const objectIdentities = new WeakMap<object, number>()
let nextObjectIdentity = 1

function objectIdentity(value: object): number {
  const existing = objectIdentities.get(value)
  if (existing !== undefined) return existing
  const identity = nextObjectIdentity
  nextObjectIdentity += 1
  objectIdentities.set(value, identity)
  return identity
}

export function createFastReplayCheckpointKey(parts: FastReplayCheckpointKeyParts): string {
  return [
    objectIdentity(parts.artifactIdentity),
    objectIdentity(parts.mapPointsIdentity),
    parts.randomSeed,
    parts.fidelity,
    parts.stepMs,
    parts.temporalFeedbackSeek,
  ].join(':')
}

function estimateSnapshotBytes(value: unknown, seen = new WeakSet<object>()): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return 8
  if (typeof value === 'boolean') return 4
  if (typeof value === 'string') return value.length * 2
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return 0
  if (typeof value !== 'object') return 0
  if (seen.has(value)) return 0
  seen.add(value)
  if (ArrayBuffer.isView(value)) return value.byteLength
  if (value instanceof ArrayBuffer) return value.byteLength
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + estimateSnapshotBytes(item, seen), 16)
  }
  return Object.entries(value).reduce(
    (total, [key, item]) => total + key.length * 2 + estimateSnapshotBytes(item, seen),
    16,
  )
}

export class FastReplayCheckpointStore<Key> {
  readonly #intervalMs: number
  readonly #maxCheckpoints: number
  readonly #targetSnapshotBytes: number
  readonly #byKey = new Map<Key, StoredFastReplayCheckpoint<Key>[]>()
  readonly #spacingByKey = new Map<Key, number>()
  #sequence = 0
  #size = 0

  constructor(options: FastReplayCheckpointStoreOptions = {}) {
    this.#intervalMs = options.intervalMs ?? 2_000
    this.#maxCheckpoints = options.maxCheckpoints ?? 48
    this.#targetSnapshotBytes = options.targetSnapshotBytes ?? 64 * 1_024
    if (!Number.isFinite(this.#intervalMs) || this.#intervalMs <= 0) {
      throw new Error('Fast replay checkpoint interval must be a positive finite duration.')
    }
    if (!Number.isInteger(this.#maxCheckpoints) || this.#maxCheckpoints <= 0) {
      throw new Error('Fast replay checkpoint cap must be a positive integer.')
    }
    if (!Number.isFinite(this.#targetSnapshotBytes) || this.#targetSnapshotBytes <= 0) {
      throw new Error('Fast replay checkpoint snapshot target must be a positive finite byte count.')
    }
  }

  get size(): number {
    return this.#size
  }

  nextCaptureAt(key: Key, elapsedMs: number): number {
    const spacingMs = this.#spacingByKey.get(key) ?? this.#intervalMs
    const epsilon = Math.max(1e-9, spacingMs * 1e-9)
    let candidate = (Math.floor((elapsedMs + epsilon) / spacingMs) + 1) * spacingMs
    const entries = this.#byKey.get(key) ?? []
    while (entries.some((entry) => Math.abs(entry.elapsedMs - candidate) <= epsilon)) {
      candidate += spacingMs
    }
    return candidate
  }

  capture(key: Key, snapshot: FastReplaySnapshot): FastReplayCheckpoint<Key> {
    const byteSize = estimateSnapshotBytes(snapshot)
    const spacingMultiplier = Math.max(1, Math.ceil(byteSize / this.#targetSnapshotBytes))
    const currentSpacing = this.#spacingByKey.get(key) ?? this.#intervalMs
    this.#spacingByKey.set(key, Math.max(currentSpacing, this.#intervalMs * spacingMultiplier))

    const entries = this.#byKey.get(key) ?? []
    const existing = entries.find((entry) => entry.elapsedMs === snapshot.elapsedMs)
    if (existing) {
      existing.snapshot = snapshot
      existing.byteSize = byteSize
      return existing
    }
    const checkpoint: StoredFastReplayCheckpoint<Key> = {
      key,
      elapsedMs: snapshot.elapsedMs,
      snapshot,
      byteSize,
      sequence: this.#sequence,
    }
    this.#sequence += 1
    entries.push(checkpoint)
    entries.sort((left, right) => left.elapsedMs - right.elapsedMs)
    this.#byKey.set(key, entries)
    this.#size += 1
    this.#evictOverflow()
    return checkpoint
  }

  nearestAtOrBefore(key: Key, targetMs: number): FastReplayCheckpoint<Key> | null {
    const entries = this.#byKey.get(key)
    if (!entries) return null
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (entries[index].elapsedMs <= targetMs) return entries[index]
    }
    return null
  }

  remove(checkpoint: FastReplayCheckpoint<Key>): void {
    const entries = this.#byKey.get(checkpoint.key)
    if (!entries) return
    const index = entries.findIndex((candidate) => candidate === checkpoint)
    if (index < 0) return
    entries.splice(index, 1)
    this.#size -= 1
    if (entries.length === 0) {
      this.#byKey.delete(checkpoint.key)
      this.#spacingByKey.delete(checkpoint.key)
    }
  }

  checkpointTimes(key: Key): number[] {
    return (this.#byKey.get(key) ?? []).map((checkpoint) => checkpoint.elapsedMs)
  }

  cooperativeHooks(key: Key): CooperativeFastReplayCheckpointing {
    return {
      nextCaptureAt: (elapsedMs) => this.nextCaptureAt(key, elapsedMs),
      capture: (runtime) => this.capture(key, runtime.snapshot()),
    }
  }

  #evictOverflow(): void {
    while (this.#size > this.#maxCheckpoints) {
      let oldest: StoredFastReplayCheckpoint<Key> | null = null
      for (const entries of this.#byKey.values()) {
        for (const checkpoint of entries) {
          if (!oldest || checkpoint.sequence < oldest.sequence) oldest = checkpoint
        }
      }
      if (!oldest) return
      this.remove(oldest)
    }
  }
}

export interface FastReplayCheckpointReconstructionOptions<Key> {
  key: Key
  store: FastReplayCheckpointStore<Key>
  createRuntime: () => FastReplayRuntime
  existingRuntime?: FastReplayRuntime | null
  targetMs: number
  advance: FastReplayAdvanceOptions & { chunkMs: number }
  isCurrent: () => boolean
  yieldControl?: () => Promise<void>
}

export interface FastReplayCheckpointReconstruction {
  runtime: FastReplayRuntime
  result: FastReplayResult
  restoredFromMs: number | null
}

class FastReplayCheckpointCaptureError extends Error {
  constructor(readonly cause: unknown) {
    super('Fast replay checkpoint capture failed.')
  }
}

async function replayFromCurrent(
  runtime: FastReplayRuntime,
  targetMs: number,
  options: FastReplayCheckpointReconstructionOptions<unknown>,
  captureCheckpoints: boolean,
  hasRestoredState: boolean,
): Promise<FastReplayResult | null> {
  let result = hasRestoredState
    ? runtime.advanceTo(runtime.getElapsedMs(), options.advance)
    : runtime.renderCurrentFrame()
  if (targetMs <= runtime.getElapsedMs()) return options.isCurrent() ? result : null
  const hooks = captureCheckpoints ? options.store.cooperativeHooks(options.key) : undefined
  const checkpointing = hooks ? {
    nextCaptureAt: hooks.nextCaptureAt,
    capture: (checkpointRuntime: FastReplayRuntime) => {
      try {
        hooks.capture(checkpointRuntime)
      } catch (error) {
        throw new FastReplayCheckpointCaptureError(error)
      }
    },
  } : undefined
  result = await advanceFastReplayCooperatively(runtime, targetMs, {
    ...options.advance,
    isCurrent: options.isCurrent,
    yieldControl: options.yieldControl,
    checkpointing,
  }) ?? result
  return options.isCurrent() ? result : null
}

export async function reconstructFastReplayWithCheckpoints<Key>(
  options: FastReplayCheckpointReconstructionOptions<Key>,
): Promise<FastReplayCheckpointReconstruction | null> {
  if (!options.isCurrent()) return null
  const exactCandidate = options.store.nearestAtOrBefore(options.key, options.targetMs)
  const epsilon = Math.max(1e-9, options.advance.stepMs * 1e-9)
  const checkpoint = exactCandidate
    && Math.abs(exactCandidate.elapsedMs - options.targetMs) <= epsilon
    ? options.store.nearestAtOrBefore(options.key, options.targetMs - epsilon)
    : exactCandidate

  if (checkpoint) {
    const runtime = options.existingRuntime ?? options.createRuntime()
    try {
      runtime.restore(checkpoint.snapshot)
    } catch {
      options.store.remove(checkpoint)
      return reconstructCold(options, false)
    }
    try {
      const result = await replayFromCurrent(runtime, options.targetMs, options, true, true)
      return result ? { runtime, result, restoredFromMs: checkpoint.elapsedMs } : null
    } catch (error) {
      if (!(error instanceof FastReplayCheckpointCaptureError)) throw error
      return reconstructCold(options, false)
    }
  }
  return reconstructCold(options, true)
}

async function reconstructCold<Key>(
  options: FastReplayCheckpointReconstructionOptions<Key>,
  captureCheckpoints: boolean,
): Promise<FastReplayCheckpointReconstruction | null> {
  if (!options.isCurrent()) return null
  const runtime = options.createRuntime()
  try {
    const result = await replayFromCurrent(runtime, options.targetMs, options, captureCheckpoints, false)
    return result ? { runtime, result, restoredFromMs: null } : null
  } catch (error) {
    if (!(error instanceof FastReplayCheckpointCaptureError) || !captureCheckpoints) throw error
    return reconstructCold(options, false)
  }
}
