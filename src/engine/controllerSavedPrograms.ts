import type { ProgramListEntry } from './PixelblazeConnection'
import type { BindingStore } from './controllerBinding'
import type { ControllerPushRecord, ControllerPushRecords } from './controllerPushRecord'
import type { ArtifactShowOutputContract } from './artifactStamp'

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
  showOutputContract?: ArtifactShowOutputContract
}

export interface ControllerSavedProgramsView {
  owned: ControllerSavedProgramRow[]
  foreign: ControllerSavedProgramRow[]
}

export type ControllerSavedProgramSort = 'device' | 'alphabetical'

export interface InstalledControllerPatternChoice {
  patternId: string
  name: string
}

function compareProgramNames(a: ControllerSavedProgramRow, b: ControllerSavedProgramRow): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export function sortControllerSavedPrograms(
  view: ControllerSavedProgramsView,
  sort: ControllerSavedProgramSort,
): ControllerSavedProgramsView {
  if (sort === 'device') return view
  return {
    owned: [...view.owned].sort(compareProgramNames),
    foreign: [...view.foreign].sort(compareProgramNames),
  }
}

export function installedControllerPatternChoices(input: {
  controllerId: string
  programs: readonly ProgramListEntry[]
  bindings: BindingStore
}): InstalledControllerPatternChoice[] {
  const installedById = new Map(input.programs.map((program) => [program.id, program]))
  return Object.entries(input.bindings[input.controllerId] ?? {})
    .filter(([patternId, programId]) => !patternId.startsWith('show:') && installedById.has(programId))
    .map(([patternId, programId]) => ({
      patternId,
      name: installedById.get(programId)?.name.trim() || 'Unnamed program',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
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
    const pushRecord = input.pushRecords[input.controllerId]?.[bindingKey]
    owned.push({
      kind: 'owned',
      programId: program.id,
      name: studioPattern?.name.trim() || deviceName,
      deviceName,
      routeId: studioPattern?.routeId ?? null,
      studioPatternMissing: !studioPattern,
      freshness: describeTransformFreshness(
        pushRecord,
        input.enabledTransforms,
      ),
      ...(pushRecord?.showOutputContract ? { showOutputContract: pushRecord.showOutputContract } : {}),
    })
  }

  return {
    owned,
    foreign,
  }
}
