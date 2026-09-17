export interface VisualEndpoint {
  present: boolean
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface VisualPairInput {
  surface: string
  v1: VisualEndpoint
  v2: VisualEndpoint
  changedPixels?: number
  maximumChannelDelta?: number
}

export type VisualPairAssessment = VisualPairInput & {
  equivalent: boolean
  reason: 'equivalent' | 'surface-missing' | 'incomplete-evidence' | 'dimensions-differ' | 'geometry-differ' | 'pixels-differ'
}

export function compareRgbaPixels(
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
): { changedPixels: number; maximumChannelDelta: number } {
  if (left.length === 0 || left.length !== right.length || left.length % 4 !== 0) {
    throw new Error('RGBA buffers must have equal, non-empty four-channel lengths.')
  }
  let changedPixels = 0
  let maximumChannelDelta = 0
  for (let offset = 0; offset < left.length; offset += 4) {
    let changed = false
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(left[offset + channel] - right[offset + channel])
      if (delta > 0) changed = true
      maximumChannelDelta = Math.max(maximumChannelDelta, delta)
    }
    if (changed) changedPixels += 1
  }
  return { changedPixels, maximumChannelDelta }
}

export function assessVisualPair(input: VisualPairInput): VisualPairAssessment {
  if (!input.v1.present || !input.v2.present) {
    return { ...input, equivalent: false, reason: 'surface-missing' }
  }
  if (!isCoordinate(input.v1.x) || !isCoordinate(input.v1.y)
    || !isCoordinate(input.v2.x) || !isCoordinate(input.v2.y)
    || !isPositiveInteger(input.v1.width) || !isPositiveInteger(input.v1.height)
    || !isPositiveInteger(input.v2.width) || !isPositiveInteger(input.v2.height)) {
    return { ...input, equivalent: false, reason: 'incomplete-evidence' }
  }
  if (input.v1.width !== input.v2.width || input.v1.height !== input.v2.height) {
    return { ...input, equivalent: false, reason: 'dimensions-differ' }
  }
  if (input.v1.x !== input.v2.x || input.v1.y !== input.v2.y) {
    return { ...input, equivalent: false, reason: 'geometry-differ' }
  }
  if (!isMetric(input.changedPixels) || !isMetric(input.maximumChannelDelta)
    || input.changedPixels > input.v1.width * input.v1.height
    || input.maximumChannelDelta > 255) {
    return { ...input, equivalent: false, reason: 'incomplete-evidence' }
  }
  if (input.changedPixels !== 0 || input.maximumChannelDelta !== 0) {
    return { ...input, equivalent: false, reason: 'pixels-differ' }
  }
  return { ...input, equivalent: true, reason: 'equivalent' }
}

function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value) && value >= 0
}

export function normalizeShowEquivalenceRecord<T>(record: T): T {
  const copy = structuredClone(record) as T & { id?: unknown; updatedAt?: unknown }
  delete copy.id
  delete copy.updatedAt
  return copy
}

interface BehaviorPairInput {
  convertedV1: unknown
  savedV2: unknown
  history: { v1: number; v2: number }
  saves: { v1: number; v2: number }
  reloadPreserved: { v1: boolean; v2: boolean }
  undoRestored: { v1: boolean; v2: boolean }
}

export type BehaviorPairAssessment = BehaviorPairInput & {
  equivalent: boolean
  checks: {
    records: boolean
    history: boolean
    saves: boolean
    reload: boolean
    undo: boolean
  }
}

export function assessBehaviorPair(input: BehaviorPairInput): BehaviorPairAssessment {
  const checks = {
    records: stableJson(normalizeShowEquivalenceRecord(input.convertedV1))
      === stableJson(normalizeShowEquivalenceRecord(input.savedV2)),
    history: input.history.v1 === 1 && input.history.v2 === 1,
    saves: input.saves.v1 === 1 && input.saves.v2 === 1,
    reload: input.reloadPreserved.v1 && input.reloadPreserved.v2,
    undo: input.undoRestored.v1 && input.undoRestored.v2,
  }
  return { ...input, equivalent: Object.values(checks).every(Boolean), checks }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
