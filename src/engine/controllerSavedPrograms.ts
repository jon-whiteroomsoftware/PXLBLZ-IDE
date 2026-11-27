import type { ProgramListEntry } from './PixelblazeConnection'
import type { BindingStore } from './controllerBinding'
import { savedControllerWrapperOutcome, type ControllerPushRecord, type ControllerPushRecords } from './controllerPushRecord'
import type { ArtifactShowOutputContract } from './artifactStamp'
import {
  enabledControllerWrappers,
  type ControllerProfile,
  type ControllerWrapperOutcome,
  type ControllerWrapperType,
} from './controllerProfile'
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
  currentProfileSignature: string | null,
  currentSourceHash?: string,
): ControllerSavedPatternFreshness {
  if (!pushRecord?.profileSignature || currentProfileSignature === null) return 'unmanaged'
  const stored = readStoredArtifactSignature(pushRecord.profileSignature)
  if (stored.kind !== 'recognized') return 'unmanaged'
  return compareProfileFreshness(pushRecord, stored.normalized, currentProfileSignature, currentSourceHash)
}

function compareProfileFreshness(
  pushRecord: ControllerPushRecord,
  storedProfileSignature: string,
  currentProfileSignature: string,
  currentSourceHash?: string,
): ControllerSavedPatternFreshness {
  if (storedProfileSignature !== currentProfileSignature) return 'stale'
  if (pushRecord.sourceHash === undefined) return 'current'
  if (currentSourceHash === undefined) return 'unmanaged'
  return pushRecord.sourceHash === currentSourceHash ? 'current' : 'stale'
}

function describeUnresolvedWrapperFreshness(
  pushRecord: ControllerPushRecord | undefined,
  programId: string,
  enabled: readonly ControllerWrapperType[],
  signatureFor: (applied: readonly ControllerWrapperType[]) => string,
  currentSourceHash?: string,
): ControllerSavedPatternFreshness {
  if (!pushRecord?.profileSignature) return 'unmanaged'
  if (pushRecord.wrapperProgramId !== undefined && pushRecord.wrapperProgramId !== programId) return 'unmanaged'
  const stored = readStoredArtifactSignature(pushRecord.profileSignature)
  if (stored.kind !== 'recognized') return 'unmanaged'
  const applied = stored.appliedWrappers ?? []
  if (applied.some((type) => !enabled.includes(type))) return 'stale'
  // Hold the applied set fixed to compare the other profile fields and source.
  const known = compareProfileFreshness(pushRecord, stored.normalized, signatureFor(applied), currentSourceHash)
  return known === 'stale' ? 'stale' : 'unmanaged'
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
  showOutputContract?: ArtifactShowOutputContract
  wrapperOutcome?: ControllerWrapperOutcome
}

export interface ControllerSavedProgramsView {
  owned: ControllerSavedProgramRow[]
  foreign: ControllerSavedProgramRow[]
}

export type ControllerSavedProgramSort = {
  field: 'pattern' | 'status'
  direction: 'ascending' | 'descending'
}

/** A reconciliation program's live work state, as the Controller store reports it. */
export type ControllerSavedPatternWorkState = 'current' | 'queued' | 'updating' | 'failed'

export interface ControllerSavedPatternStatusSummary {
  current: number
  stale: number
  updating: number
  queued: number
  failed: number
  unmanaged: number
  total: number
}

/**
 * Resolve one effective status per managed program (#874). Live reconciliation
 * work states (queued, updating, failed) win; a completed `current` snapshot is
 * historical, so the row's fresh source/profile comparison supersedes it. This
 * single projection feeds both the inventory rows and the aggregate summary,
 * so the summary can never claim a freshness the rows deny. Reconciliation
 * programs without an inventory row yet keep their reported state.
 */
export function resolveControllerSavedPatternStatuses(
  owned: readonly Pick<ControllerSavedProgramRow, 'programId' | 'freshness'>[],
  reconciliationPrograms: readonly { programId: string; state: ControllerSavedPatternWorkState }[] = [],
): Record<string, ControllerSavedPatternStatus> {
  const statuses: Record<string, ControllerSavedPatternStatus> = {}
  for (const program of reconciliationPrograms) statuses[program.programId] = program.state
  for (const row of owned) {
    const work = statuses[row.programId]
    statuses[row.programId] = work && work !== 'current' ? work : row.freshness
  }
  return statuses
}

export function summarizeControllerSavedPatternStatuses(
  statuses: Readonly<Record<string, ControllerSavedPatternStatus>>,
): ControllerSavedPatternStatusSummary {
  const summary: ControllerSavedPatternStatusSummary = {
    current: 0,
    stale: 0,
    updating: 0,
    queued: 0,
    failed: 0,
    unmanaged: 0,
    total: 0,
  }
  for (const status of Object.values(statuses)) {
    summary[status] += 1
    summary.total += 1
  }
  return summary
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
    const isShow = bindingKey.startsWith('show:')
    const wrapperOutcome = isShow || input.profileSignatureReady === false
      ? undefined
      : savedControllerWrapperOutcome(pushRecord, program.id)
    const enabled = enabledControllerWrappers(input.profile, bindingKey)
    const evaluated = wrapperOutcome
      ? [...wrapperOutcome.applied, ...Object.keys(wrapperOutcome.skipped)]
      : []
    const wrapperDecisionReady = !enabled.length || (
      Boolean(wrapperOutcome)
      && pushRecord?.wrapperPixelCount !== undefined
      && pushRecord.wrapperPixelCount === input.profile.lastKnownPixelCount
      && evaluated.length === enabled.length
      && enabled.every((type) => evaluated.includes(type))
    )
    const signatureFor = (applied: readonly ControllerWrapperType[]) =>
      controllerProfileArtifactSignature(input.profile, bindingKey, { mapDim: input.mapDim }, applied)
    let freshness: ControllerSavedPatternFreshness = 'unmanaged'
    if (input.profileSignatureReady !== false) {
      freshness = wrapperDecisionReady
        ? describeProfileFreshness(
            pushRecord, signatureFor(enabled.length ? wrapperOutcome?.applied ?? [] : []), studioPattern?.sourceHash,
          )
        : describeUnresolvedWrapperFreshness(pushRecord, program.id, enabled, signatureFor, studioPattern?.sourceHash)
    }
    owned.push({
      kind: 'owned',
      programId: program.id,
      bindingKey,
      name: studioPattern?.name.trim() || deviceName,
      deviceName,
      routeId: studioPattern?.routeId ?? null,
      studioPatternMissing: !studioPattern,
      sourceKind: isShow ? 'show' : 'pattern',
      freshness,
      ...(pushRecord?.showOutputContract ? { showOutputContract: pushRecord.showOutputContract } : {}),
      ...(wrapperOutcome ? { wrapperOutcome } : {}),
    })
  }

  return {
    owned,
    foreign,
  }
}
