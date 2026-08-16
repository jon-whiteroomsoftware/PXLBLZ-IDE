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

export interface ControllerSavedProgramFeatures {
  powerCap: boolean
  hardwareBrightness: boolean
  controlBinding: boolean
  variableBinding: boolean
}

/** Report only profile features supported by durable artifact evidence. */
export function controllerSavedProgramFeatures(
  pushRecord: ControllerPushRecord | undefined,
): ControllerSavedProgramFeatures {
  const features: ControllerSavedProgramFeatures = {
    powerCap: pushRecord?.transforms.includes('power-cap') === true,
    hardwareBrightness: pushRecord?.transforms.includes('hardware-brightness') === true,
    controlBinding: false,
    variableBinding: false,
  }
  if (!pushRecord?.profileSignature) return features
  const stored = readStoredArtifactSignature(pushRecord.profileSignature)
  if (stored.kind !== 'recognized') return features

  const signature = JSON.parse(stored.normalized) as {
    transforms: Array<{
      type: string
      inputId?: string
      mode?: string
      maxDuty?: number
    }>
    inputs: Array<{ id: string; signal: string }>
    bindings: Array<{ inputId: string; target: { kind: string } }>
  }
  for (const transform of signature.transforms) {
    if (transform.type === 'power-cap' && (transform.maxDuty ?? -1) >= 0) {
      features.powerCap = true
    }
    if (
      transform.type === 'hardware-brightness'
      && transform.mode === 'multiply-output'
      && signature.inputs.some((input) => (
        input.id === transform.inputId && input.signal === 'analog'
      ))
      && !signature.bindings.some((binding) => binding.inputId === transform.inputId)
    ) features.hardwareBrightness = true
  }
  for (const binding of signature.bindings) {
    if (
      binding.target.kind === 'call-exported-slider'
      || binding.target.kind === 'call-function'
    ) features.controlBinding = true
    if (binding.target.kind === 'assign-variable') features.variableBinding = true
  }
  return features
}

export function describeProfileFreshness(
  pushRecord: ControllerPushRecord | undefined,
  currentProfileSignature: string | null,
  currentSourceHash?: string,
): ControllerSavedPatternFreshness {
  if (!pushRecord?.profileSignature || currentProfileSignature === null) return 'unmanaged'
  const stored = readStoredArtifactSignature(pushRecord.profileSignature)
  if (stored.kind !== 'recognized') return 'unmanaged'
  if (stored.normalized !== currentProfileSignature) return 'stale'
  if (pushRecord.sourceHash === undefined) return 'current'
  if (currentSourceHash === undefined) return 'unmanaged'
  return pushRecord.sourceHash === currentSourceHash ? 'current' : 'stale'
}

export interface StudioPatternIdentity {
  /** The key used by controller bindings: record id or `demo:<name>`. */
  bindingKey: string
  /** The id used by the Studio patterns route: record id or demo name. */
  routeId: string
  name: string
  /** Hash of the current canonical Studio source, when this entity can be regenerated. */
  sourceHash?: string
}

export interface ControllerSavedProgramRow {
  kind: 'owned' | 'foreign'
  programId: string
  /** Exact Studio entity identity for managed metadata cleanup. */
  bindingKey: string | null
  name: string
  deviceName: string
  routeId: string | null
  studioPatternMissing: boolean
  /** Which Studio entity produced this program; foreign rows default to pattern. */
  sourceKind: 'pattern' | 'show'
  freshness: ControllerSavedPatternFreshness
  /** Profile features baked into the durable Controller artifact. */
  profileFeatures?: ControllerSavedProgramFeatures
  showOutputContract?: ArtifactShowOutputContract
}

export interface ControllerSavedProgramsView {
  owned: ControllerSavedProgramRow[]
  foreign: ControllerSavedProgramRow[]
}

export type ControllerSavedProgramSort = {
  field: 'pattern' | 'status'
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
    if (sort.field === 'status') {
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
  /** False while the live map or metadata evidence is being refreshed. */
  profileSignatureReady?: boolean
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
        bindingKey: null,
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
      bindingKey,
      name: studioPattern?.name.trim() || deviceName,
      deviceName,
      routeId: studioPattern?.routeId ?? null,
      studioPatternMissing: !studioPattern,
      sourceKind: bindingKey.startsWith('show:') ? 'show' : 'pattern',
      profileFeatures: controllerSavedProgramFeatures(pushRecord),
      freshness: describeProfileFreshness(
        pushRecord,
        input.profileSignatureReady === false
          ? null
          : controllerProfileArtifactSignature(input.profile, bindingKey, { mapDim: input.mapDim }),
        studioPattern?.sourceHash,
      ),
      ...(pushRecord?.showOutputContract ? { showOutputContract: pushRecord.showOutputContract } : {}),
    })
  }

  return {
    owned,
    foreign,
  }
}
