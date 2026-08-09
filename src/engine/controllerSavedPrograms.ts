import type { ProgramListEntry } from './PixelblazeConnection'
import type { BindingStore } from './controllerBinding'
import type { ControllerPushRecord, ControllerPushRecords } from './controllerPushRecord'
import type { ArtifactShowOutputContract } from './artifactStamp'
import type { ControllerProfile } from './controllerProfile'
import type { MapDimension } from './renderCompatibility'
import {
  controllerProfileArtifactSignature,
  readStoredArtifactSignature,
} from './controllerProfilePassRecipe'

export type ControllerSavedPatternFreshness = 'current' | 'stale' | 'unmanaged'
export type ControllerSavedPatternStatus = ControllerSavedPatternFreshness | 'queued' | 'updating' | 'failed'

export const CONTROLLER_SAVED_PATTERN_STATUS_LABELS: Record<ControllerSavedPatternStatus, string> = {
  current: 'CURRENT',
  stale: 'PUSH AGAIN',
  unmanaged: 'UNKNOWN',
  queued: 'QUEUED',
  updating: 'SYNCING',
  failed: 'FAILED',
}

export function describeProfileFreshness(
  pushRecord: ControllerPushRecord | undefined,
  currentProfileSignature: string,
): ControllerSavedPatternFreshness {
  if (!pushRecord?.profileSignature) return 'unmanaged'
  const stored = readStoredArtifactSignature(pushRecord.profileSignature)
  if (stored.kind !== 'recognized') return 'unmanaged'
  return stored.normalized === currentProfileSignature ? 'current' : 'stale'
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
  /** Which Studio entity produced this program; foreign rows default to pattern. */
  sourceKind: 'pattern' | 'show'
  freshness: ControllerSavedPatternFreshness
  showOutputContract?: ArtifactShowOutputContract
}

export interface ControllerSavedProgramsView {
  owned: ControllerSavedProgramRow[]
  foreign: ControllerSavedProgramRow[]
}

export type ControllerSavedProgramSort = {
  field: 'pattern' | 'pattern-id' | 'status'
  direction: 'ascending' | 'descending'
}

export interface InstalledControllerPatternChoice {
  patternId: string
  name: string
}

function compareProgramNames(a: ControllerSavedProgramRow, b: ControllerSavedProgramRow): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

export function sortControllerSavedPrograms(
  view: ControllerSavedProgramsView,
  sort: ControllerSavedProgramSort,
  statusByProgramId: Readonly<Partial<Record<string, ControllerSavedPatternStatus>>> = {},
): ControllerSavedProgramsView {
  const direction = sort.direction === 'ascending' ? 1 : -1
  const compare = (a: ControllerSavedProgramRow, b: ControllerSavedProgramRow) => {
    let result: number
    if (sort.field === 'pattern-id') {
      result = compareText(a.programId, b.programId)
    } else if (sort.field === 'status') {
      const aStatus = statusByProgramId[a.programId] ?? a.freshness
      const bStatus = statusByProgramId[b.programId] ?? b.freshness
      result = compareText(
        CONTROLLER_SAVED_PATTERN_STATUS_LABELS[aStatus],
        CONTROLLER_SAVED_PATTERN_STATUS_LABELS[bStatus],
      )
    } else {
      result = compareProgramNames(a, b)
    }
    return (result || compareProgramNames(a, b)) * direction
  }
  return {
    owned: [...view.owned].sort(compare),
    foreign: [...view.foreign].sort(compare),
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
  profile: ControllerProfile
  mapDim: MapDimension | null
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
        sourceKind: 'pattern',
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
      sourceKind: bindingKey.startsWith('show:') ? 'show' : 'pattern',
      freshness: describeProfileFreshness(
        pushRecord,
        controllerProfileArtifactSignature(input.profile, bindingKey, { mapDim: input.mapDim }),
      ),
      ...(pushRecord?.showOutputContract ? { showOutputContract: pushRecord.showOutputContract } : {}),
    })
  }

  return {
    owned,
    foreign,
  }
}
