import type { ProgramListEntry } from './PixelblazeConnection'
import type { BindingStore } from './controllerBinding'
import type { ControllerPushRecord, ControllerPushRecords } from './controllerPushRecord'

export type TransformFreshness = 'current' | 'stale' | 'unmanaged'

export function enabledControllerTransformIds(
  transforms: readonly { id: string; enabled: boolean }[],
): string[] {
  return transforms.filter((transform) => transform.enabled).map((transform) => transform.id)
}

export function describeTransformFreshness(
  pushRecord: ControllerPushRecord | undefined,
  enabledTransforms: readonly string[],
): TransformFreshness {
  if (!pushRecord) return 'unmanaged'
  const pushed = [...new Set(pushRecord.transforms)].sort()
  const enabled = [...new Set(enabledTransforms)].sort()
  return pushed.length === enabled.length && pushed.every((value, index) => value === enabled[index])
    ? 'current'
    : 'stale'
}

export interface StudioPatternIdentity {
  /** The key used by controller bindings: record id or `demo:<name>`. */
  bindingKey: string
  /** The id used by the Studio patterns route: record id or demo name. */
  routeId: string
  name: string
}

export interface ControllerSavedProgramRow {
  kind: 'owned' | 'foreign'
  programId: string
  name: string
  deviceName: string
  routeId: string | null
  studioPatternMissing: boolean
  freshness: TransformFreshness
}

export interface ControllerSavedProgramsView {
  owned: ControllerSavedProgramRow[]
  foreign: ControllerSavedProgramRow[]
}

export function describeControllerSavedPrograms(input: {
  controllerId: string
  programs: readonly ProgramListEntry[]
  bindings: BindingStore
  studioPatterns: readonly StudioPatternIdentity[]
  pushRecords: ControllerPushRecords
  enabledTransforms: readonly string[]
}): ControllerSavedProgramsView {
  const bindingByProgramId = new Map<string, string>()
  for (const [bindingKey, programId] of Object.entries(input.bindings[input.controllerId] ?? {})) {
    if (!bindingByProgramId.has(programId)) bindingByProgramId.set(programId, bindingKey)
  }
  const studioByBindingKey = new Map(
    input.studioPatterns.map((pattern) => [pattern.bindingKey, pattern]),
  )
  const owned: ControllerSavedProgramRow[] = []
  const foreign: ControllerSavedProgramRow[] = []

  for (const program of input.programs) {
    const deviceName = program.name.trim() || 'Unnamed program'
    const bindingKey = bindingByProgramId.get(program.id)
    if (!bindingKey) {
      foreign.push({
        kind: 'foreign',
        programId: program.id,
        name: deviceName,
        deviceName,
        routeId: null,
        studioPatternMissing: false,
        freshness: 'unmanaged',
      })
      continue
    }

    const studioPattern = studioByBindingKey.get(bindingKey)
    owned.push({
      kind: 'owned',
      programId: program.id,
      name: studioPattern?.name.trim() || deviceName,
      deviceName,
      routeId: studioPattern?.routeId ?? null,
      studioPatternMissing: !studioPattern,
      freshness: describeTransformFreshness(
        input.pushRecords[input.controllerId]?.[bindingKey],
        input.enabledTransforms,
      ),
    })
  }

  return { owned, foreign }
}
