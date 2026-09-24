import { validateShowRecordV2, type ShowClipV2, type ShowPropertyTargetV2, type ShowRecordV2 } from './showCompositionV2'
import type { PatternMetadata } from './loadPattern'
import type { ShowPatternRef } from './personalContentRecords'
import { materializeShowGroupsV2, effectiveShowInstanceUseCountV2, groupRuntimeBindings } from './showGroupsV2'
import { validateClipLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { copyShowInstancePropertyTracksV2, type CopyShowInstancePropertyTracksIntentV2, type ShowTransitionRampProjectionV2 } from './showPropertyAnimationV2'
import { firstShowTransitionPlacementRestrictionV2 } from './showTransitionPlacementV2'
import { editShowClipTemporalV2, type ShowClipTemporalRefusalV2 } from './showClipTemporalV2'
import type { ShowTimelineEditAffectedV2 } from './showTimelineV2'

export interface ShowClipDuplicateTrackIdentityV2 {
  trackId: string
  keyframeIdsBySourceId: Readonly<Record<string, string>>
}

export interface ShowClipDuplicateIdentityPlanV2 {
  clipId: string
  appearanceKeyIdsBySourceId: Readonly<Record<string, string>>
  clipTrackIdentitiesBySourceTrackId: Readonly<Record<string, ShowClipDuplicateTrackIdentityV2>>
}

export interface ShowIndependentInstancePlanV2 {
  instanceId: string
  identitiesBySourceTrackId: CopyShowInstancePropertyTracksIntentV2['identitiesBySourceTrackId']
}

export interface ShowClipIdentityAffectedV2 extends Partial<Omit<ShowTimelineEditAffectedV2, 'affectedClipIds' | 'affectedTrackIds'>> {
  affectedInstanceIds?: string[]
  affectedKeyframeIds?: string[]
  removedIds?: string[]
  discardedControlTargets?: Array<Extract<ShowPropertyTargetV2, { kind: 'instance-control' }>>
}

export type ShowClipEditIntentV2 =
  | { kind: 'set-entry-policy'; clipId: string; entryPolicy: ShowClipV2['entryPolicy'] }
  | { kind: 'make-independent'; clipId: string; independence: ShowIndependentInstancePlanV2 }
  | { kind: 'rejoin'; clipId: string; targetInstanceId: string }
  | { kind: 'move'; clipId: string; startMs: number }
  | { kind: 'replace-placement'; clipId: string; zoneId?: string; layerId?: string; startMs?: number; detachParticipantTransitions?: boolean }
  | { kind: 'trim' | 'extend'; clipId: string; startMs: number; endMs: number; propertyRampProjections?: readonly ShowTransitionRampProjectionV2[] }
  | { kind: 'split'; clipId: string; atMs: number; rightClipId: string }
  | {
      kind: 'duplicate'
      clipId: string
      zoneId: string
      layerId: string
      startMs: number
      identities: ShowClipDuplicateIdentityPlanV2
    }
  | { kind: 'replace-pattern'; clipId: string; replacement: ResolvedShowPatternReplacementV2; independence?: ShowIndependentInstancePlanV2 }

export interface ResolvedShowPatternReplacementV2 {
  patternReference: ShowPatternRef
  patternName: string
  exportedSliders: ReadonlyArray<Readonly<PatternMetadata['controls'][number] & { kind: 'slider' }>>
}

export type ShowClipEditRefusalV2 = 'invalid-record' | 'missing-clip' | 'invalid-intent' | 'unsupported-topology' | 'compiler-ineligible' | 'invalid-result' | ShowClipTemporalRefusalV2
export type ShowClipEditResultV2 = ShowClipIdentityAffectedV2 & (
  | { status: 'changed'; record: ShowRecordV2; affectedClipIds: string[]; affectedTrackIds: string[] }
  | { status: 'unchanged'; record: ShowRecordV2; affectedClipIds: []; affectedTrackIds: [] }
  | { status: 'refused'; record: ShowRecordV2; code: ShowClipEditRefusalV2; message: string; affectedClipIds: []; affectedTrackIds: [] }
)

/** Additive v2 engine owner. Adoption, history and saving remain caller-owned. */
export function editShowClipV2(record: ShowRecordV2, intent: ShowClipEditIntentV2): ShowClipEditResultV2 {
  if (intent.kind === 'move' || intent.kind === 'replace-placement' || intent.kind === 'trim' || intent.kind === 'extend' || intent.kind === 'split') {
    const temporal = editShowClipTemporalV2(record, intent)
    if (temporal.status === 'refused') return { ...temporal, affectedClipIds: [], affectedTrackIds: [] }
    if (temporal.status === 'unchanged') return { ...temporal, status: 'unchanged', affectedClipIds: [], affectedTrackIds: [] }
    return { ...temporal, status: 'changed' }
  }
  const refuse = (code: ShowClipEditRefusalV2, message: string): ShowClipEditResultV2 => ({
    status: 'refused', record, code, message, affectedClipIds: [], affectedTrackIds: [],
    ...(intent.kind === 'make-independent' || intent.kind === 'rejoin' || intent.kind === 'replace-pattern'
      ? { affectedInstanceIds: [], affectedKeyframeIds: [], removedIds: [] } : {}),
    ...(intent.kind === 'replace-pattern' ? { discardedControlTargets: [] } : {}),
  })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  const composition = record.composition
  const index = composition.clips.findIndex(clip => clip.id === intent.clipId)
  if (index < 0) return refuse('missing-clip', `Clip "${intent.clipId}" does not exist.`)
  const clip = composition.clips[index]
  if (intent.kind === 'set-entry-policy') return setShowClipEntryPolicyV2(record, clip, intent, refuse)
  if (intent.kind === 'make-independent' || intent.kind === 'rejoin') return editShowClipIdentityV2(record, clip, intent)
  if (intent.kind === 'duplicate') return duplicateShowClipV2(record, clip, intent, refuse)
  if (intent.kind === 'replace-pattern') return replaceShowClipPatternV2(record, clip, intent)
  return refuse('invalid-intent', 'Unsupported Clip intent.')
}

/**
 * Write one existing Clip's authored entry instruction.
 *
 * Restart is a Clip-entry instruction (specification section 4): the derived
 * reset event follows from Clip identity and first contribution, so setting the
 * flag cascades nothing and touches no other collection. This is the single
 * writer: `update_clips` and the editor's admission wrapper both call it.
 */
function setShowClipEntryPolicyV2(
  record: ShowRecordV2,
  clip: ShowClipV2,
  intent: Extract<ShowClipEditIntentV2, { kind: 'set-entry-policy' }>,
  refuse: (code: ShowClipEditRefusalV2, message: string) => ShowClipEditResultV2,
): ShowClipEditResultV2 {
  if (Object.keys(intent).length !== 3 || !['continue', 'restart'].includes(intent.entryPolicy)) {
    return refuse('invalid-intent', 'Give exactly one Clip identity and the entry policy "continue" or "restart".')
  }
  if (intent.entryPolicy === clip.entryPolicy) {
    return { status: 'unchanged', record, affectedClipIds: [], affectedTrackIds: [] }
  }
  const next = structuredClone(record)
  next.composition.clips.find(candidate => candidate.id === clip.id)!.entryPolicy = intent.entryPolicy
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  return {
    status: 'changed',
    record: next,
    affectedClipIds: [clip.id],
    affectedTrackIds: [],
    affectedInstanceIds: [],
  }
}

function duplicateShowClipV2(
  record: ShowRecordV2,
  clip: ShowClipV2,
  intent: Extract<ShowClipEditIntentV2, { kind: 'duplicate' }>,
  refuse: (code: ShowClipEditRefusalV2, message: string) => ShowClipEditResultV2,
): ShowClipEditResultV2 {
  const endMs = intent.startMs + clip.durationMs
  if (!Number.isSafeInteger(intent.startMs) || intent.startMs < 0
    || !Number.isSafeInteger(endMs) || endMs > record.composition.showEndMs) {
    return refuse('invalid-intent', 'Duplicate interval must use safe integer milliseconds within Show End.')
  }
  const rawPlan: unknown = intent.identities
  if (!isRecord(rawPlan)
    || typeof rawPlan.clipId !== 'string'
    || !isRecord(rawPlan.appearanceKeyIdsBySourceId)
    || !isRecord(rawPlan.clipTrackIdentitiesBySourceTrackId)) {
    return refuse('invalid-intent', 'Duplicate requires a complete identity plan.')
  }
  const plan = rawPlan as unknown as ShowClipDuplicateIdentityPlanV2
  const effective = record.composition.groupOccurrences.length > 0 ? materializeShowGroupsV2(record) : record
  const usedClipIds = new Set(effective.composition.clips.map(candidate => candidate.id))
  if (!plan.clipId.trim() || usedClipIds.has(plan.clipId)) {
    return refuse('invalid-intent', 'Duplicate requires a fresh nonblank Clip identity.')
  }
  const sourceTracks = record.composition.propertyTracks.filter(track => (
    'clipId' in track.target && track.target.clipId === clip.id
  ))
  if (!exactKeys(plan.appearanceKeyIdsBySourceId, clip.appearance.keys.map(key => key.id))
    || !exactKeys(plan.clipTrackIdentitiesBySourceTrackId, sourceTracks.map(track => track.id))) {
    return refuse('invalid-intent', 'Duplicate requires complete exact appearance and Clip-track identity maps.')
  }
  if (sourceTracks.some(track => {
    const identity: unknown = plan.clipTrackIdentitiesBySourceTrackId[track.id]
    return !isRecord(identity)
      || typeof identity.trackId !== 'string'
      || !isRecord(identity.keyframeIdsBySourceId)
  })) {
    return refuse('invalid-intent', 'Duplicate requires a complete identity for every Clip-owned track.')
  }
  const appearanceIds = clip.appearance.keys.map(key => plan.appearanceKeyIdsBySourceId[key.id])
  const trackIds = sourceTracks.map(track => plan.clipTrackIdentitiesBySourceTrackId[track.id]?.trackId ?? '')
  const keyIds = sourceTracks.flatMap(track => track.keyframes.map(key => (
    plan.clipTrackIdentitiesBySourceTrackId[track.id]?.keyframeIdsBySourceId[key.id] ?? ''
  )))
  const usedAppearanceIds = new Set(effective.composition.clips.flatMap(candidate => (
    candidate.appearance.keys.map(key => key.id)
  )))
  const usedTrackIds = new Set(effective.composition.propertyTracks.map(track => track.id))
  const usedKeyIds = new Set(effective.composition.propertyTracks.flatMap(track => (
    track.keyframes.map(key => key.id)
  )))
  if ([...appearanceIds, ...trackIds, ...keyIds].some(id => typeof id !== 'string' || !id.trim())
    || new Set(appearanceIds).size !== appearanceIds.length
    || new Set(trackIds).size !== trackIds.length
    || new Set(keyIds).size !== keyIds.length
    || appearanceIds.some(id => usedAppearanceIds.has(id))
    || trackIds.some(id => usedTrackIds.has(id))
    || keyIds.some(id => usedKeyIds.has(id))
    || sourceTracks.some(track => !exactKeys(
      plan.clipTrackIdentitiesBySourceTrackId[track.id].keyframeIdsBySourceId,
      track.keyframes.map(key => key.id),
    ))) {
    return refuse('invalid-intent', 'Duplicate identities must be complete, nonblank and unique.')
  }

  const deltaMs = intent.startMs - clip.startMs
  const next = structuredClone(record)
  // A linked duplicate is a new Clip under a fresh identity; conversion
  // provenance describes the converter's own segment, so it never copies (#1068).
  const { logicalClipId: _duplicateLogicalClipId, ...duplicateSource } = structuredClone(clip)
  next.composition.clips.push({
    ...duplicateSource,
    id: plan.clipId,
    zoneId: intent.zoneId,
    layerId: intent.layerId,
    startMs: intent.startMs,
    appearance: {
      keys: clip.appearance.keys.map(key => ({
        ...structuredClone(key),
        id: plan.appearanceKeyIdsBySourceId[key.id],
        timeMs: key.timeMs + deltaMs,
      })),
    },
  })
  const copies = sourceTracks.map(track => {
    const identity = plan.clipTrackIdentitiesBySourceTrackId[track.id]
    return {
      ...structuredClone(track),
      id: identity.trackId,
      target: { ...structuredClone(track.target), clipId: plan.clipId },
      activeStartMs: track.activeStartMs + deltaMs,
      keyframes: track.keyframes.map(key => ({
        ...structuredClone(key),
        id: identity.keyframeIdsBySourceId[key.id],
        timeMs: key.timeMs + deltaMs,
      })),
    }
  })
  next.composition.propertyTracks.push(...copies)
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  const availabilityIssue = validateClipLayoutAvailabilityV2(next, [plan.clipId])[0]
  if (availabilityIssue) {
    return refuse(
      'invalid-result',
      `Clip "${plan.clipId}" Zone is unavailable in Layout occurrence "${availabilityIssue.layoutOccurrenceId}".`,
    )
  }
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refuse('compiler-ineligible', compilerRestriction.message)
  return {
    status: 'changed', record: next, affectedClipIds: [plan.clipId], affectedTrackIds: trackIds,
  }
}

function editShowClipIdentityV2(
  record: ShowRecordV2,
  clip: ShowClipV2,
  intent: Extract<ShowClipEditIntentV2, { kind: 'make-independent' | 'rejoin' }>,
): ShowClipEditResultV2 {
  const empty = { affectedClipIds: [] as [], affectedTrackIds: [] as [], affectedInstanceIds: [], affectedKeyframeIds: [], removedIds: [] }
  const refuse = (message: string, code: ShowClipEditRefusalV2 = 'invalid-intent'): ShowClipEditResultV2 => ({ status: 'refused', record, code, message, ...empty })
  const unchanged = (): ShowClipEditResultV2 => ({ status: 'unchanged', record, ...empty })
  const source = record.composition.patternInstances.find(instance => instance.id === clip.instanceId)!
  const next = structuredClone(record)
  const edited = next.composition.clips.find(candidate => candidate.id === clip.id)!
  const retargetIncomingSpeedRamp = () => {
    for (const transition of next.composition.transitions) {
      if (!transition.participants.some(participant => participant.toClipId === edited.id)) continue
      for (const ramp of transition.propertyRamps) {
        if (ramp.target.kind === 'instance-time-scale' && ramp.target.instanceId === source.id) {
          ramp.target.instanceId = edited.instanceId
        }
      }
    }
  }
  let affectedInstanceIds: string[]
  let affectedTrackIds: string[] = []
  let affectedKeyframeIds: string[] = []
  let removedIds: string[] = []
  if (intent.kind === 'make-independent') {
    if (effectiveShowInstanceUseCountV2(record, source.id) === 1) return unchanged()
    const planIssue = independentPlanIssue(record, intent.independence)
    if (planIssue) return refuse(planIssue)
    const plan = intent.independence
    next.composition.patternInstances.push({ ...structuredClone(source), id: plan.instanceId })
    const copied = copyShowInstancePropertyTracksV2(next, { fromInstanceId: source.id, toInstanceId: plan.instanceId,
      placementDeltaMs: 0, identitiesBySourceTrackId: plan.identitiesBySourceTrackId })
    if (copied.status === 'refused') return refuse(copied.message)
    next.composition.propertyTracks = copied.propertyTracks
    edited.instanceId = plan.instanceId
    retargetIncomingSpeedRamp()
    next.composition.executionModel = 'continuous'
    affectedInstanceIds = [plan.instanceId]
    affectedTrackIds = copied.copiedTrackIds
    affectedKeyframeIds = next.composition.propertyTracks.filter(track => affectedTrackIds.includes(track.id)).flatMap(track => track.keyframes.map(key => key.id))
  } else {
    if (typeof intent.targetInstanceId !== 'string' || !intent.targetInstanceId.trim()) return refuse('Rejoin requires an explicit existing runtime identity.')
    if (intent.targetInstanceId === source.id) return unchanged()
    const target = record.composition.patternInstances.find(instance => instance.id === intent.targetInstanceId)
    if (!target || target.pattern.kind !== source.pattern.kind || target.pattern.id !== source.pattern.id) return refuse('Rejoin requires an existing instance with the same structured Pattern source identity.')
    edited.instanceId = target.id
    affectedInstanceIds = [target.id, source.id]
    retargetIncomingSpeedRamp()
    const collected = collectOrphanedShowInstanceV2(next, source.id)
    if (collected.removed) {
      affectedTrackIds = collected.removedTrackIds
      affectedKeyframeIds = collected.removedKeyframeIds
      removedIds = [source.id, ...affectedTrackIds, ...affectedKeyframeIds]
    }
  }
  const invalid = validateShowRecordV2(next)[0]
  if (invalid) return refuse(`${invalid.path}: ${invalid.message}`, 'invalid-result')
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuse(`${restriction.rule}: ${restriction.message}`, 'compiler-ineligible')
  return { status: 'changed', record: next, affectedClipIds: [clip.id], affectedTrackIds, affectedInstanceIds, affectedKeyframeIds, removedIds }
}

/** Remove `instanceId` and its instance-targeted tracks when nothing references it any more (spec §6). */
export function collectOrphanedShowInstanceV2(
  next: ShowRecordV2,
  instanceId: string,
): { removedTrackIds: string[]; removedKeyframeIds: string[]; removed: boolean } {
  const remainsBound = groupRuntimeBindings(next).some(binding => binding.runtimeId === instanceId)
  const remainsRampTarget = next.composition.transitions.some(transition => transition.propertyRamps.some(ramp => (
    'instanceId' in ramp.target && ramp.target.instanceId === instanceId
  )))
  if (effectiveShowInstanceUseCountV2(next, instanceId) !== 0 || remainsBound || remainsRampTarget) {
    return { removedTrackIds: [], removedKeyframeIds: [], removed: false }
  }
  const removedTracks = next.composition.propertyTracks.filter(track => 'instanceId' in track.target && track.target.instanceId === instanceId)
  const removedTrackIds = removedTracks.map(track => track.id)
  const removedKeyframeIds = removedTracks.flatMap(track => track.keyframes.map(key => key.id))
  next.composition.propertyTracks = next.composition.propertyTracks.filter(track => !removedTrackIds.includes(track.id))
  next.composition.patternInstances = next.composition.patternInstances.filter(instance => instance.id !== instanceId)
  next.composition.executionModel = 'continuous'
  return { removedTrackIds, removedKeyframeIds, removed: true }
}

function independentPlanIssue(record: ShowRecordV2, raw: unknown): string | null {
  if (!isRecord(raw) || !exactKeys(raw, ['instanceId', 'identitiesBySourceTrackId'])
    || typeof raw.instanceId !== 'string' || !raw.instanceId.trim()
    || !isRecord(raw.identitiesBySourceTrackId)) return 'Independence requires a fresh instance and complete track identity plan.'
  if (materializeShowGroupsV2(record).composition.patternInstances.some(instance => instance.id === raw.instanceId)) return 'The independent runtime identity is already owned.'
  for (const value of Object.values(raw.identitiesBySourceTrackId)) {
    if (!isRecord(value) || !exactKeys(value, ['trackId', 'keyframeIdsBySourceId'])
      || typeof value.trackId !== 'string' || !isRecord(value.keyframeIdsBySourceId)
      || Object.values(value.keyframeIdsBySourceId).some(id => typeof id !== 'string')) {
      return 'Every copied track requires an exact track and key identity plan.'
    }
  }
  return null
}

function replaceShowClipPatternV2(
  record: ShowRecordV2,
  clip: ShowClipV2,
  intent: Extract<ShowClipEditIntentV2, { kind: 'replace-pattern' }>,
): ShowClipEditResultV2 {
  const empty = { affectedClipIds: [] as [], affectedTrackIds: [] as [], affectedInstanceIds: [], affectedKeyframeIds: [], removedIds: [], discardedControlTargets: [] }
  const refuse = (message: string, code: ShowClipEditRefusalV2 = 'invalid-intent'): ShowClipEditResultV2 => ({ status: 'refused', record, code, message, ...empty })
  const raw: unknown = intent.replacement
  if (!isRecord(raw) || !exactKeys(raw, ['patternReference', 'patternName', 'exportedSliders'])
    || !isRecord(raw.patternReference) || !exactKeys(raw.patternReference, ['kind', 'id'])
    || (raw.patternReference.kind !== 'stock' && raw.patternReference.kind !== 'user')
    || typeof raw.patternReference.id !== 'string' || !raw.patternReference.id.trim()
    || typeof raw.patternName !== 'string' || !raw.patternName.trim()
    || !Array.isArray(raw.exportedSliders)
    || raw.exportedSliders.some(value => !isRecord(value) || value.kind !== 'slider'
      || typeof value.exportName !== 'string' || !value.exportName.trim() || typeof value.label !== 'string')) {
    return refuse('Replace requires a trusted resolved Pattern reference, name and public slider descriptors.')
  }
  const replacement = intent.replacement
  const exports = replacement.exportedSliders.map(control => control.exportName)
  if (new Set(exports).size !== exports.length) return refuse('Resolved slider exports must be unique.')
  const compatible = new Set(exports)
  const source = record.composition.patternInstances.find(instance => instance.id === clip.instanceId)!
  const shared = effectiveShowInstanceUseCountV2(record, source.id) > 1
  if (!shared && intent.independence !== undefined) return refuse('A sole-user Replace must not supply an independence plan.')
  const effective = materializeShowGroupsV2(record)
  const lostEffective = effective.composition.propertyTracks.filter(track => track.target.kind === 'instance-control'
    && track.target.instanceId === source.id && !compatible.has(track.target.exportName))
  const lostValues = Object.keys(source.controlTargets ?? {}).filter(name => !compatible.has(name))
  const sourceChanged = source.pattern.kind !== replacement.patternReference.kind || source.pattern.id !== replacement.patternReference.id
  const unchanged = !sourceChanged && source.patternName === replacement.patternName && lostEffective.length === 0 && lostValues.length === 0
  if (unchanged && intent.independence === undefined) {
    return { status: 'unchanged', record, ...empty }
  }
  const next = structuredClone(record)
  let instanceId = source.id
  let affectedTrackIds: string[]
  let affectedKeyframeIds: string[]
  let removedIds: string[] = []
  let discardedControlTargets: Array<Extract<ShowPropertyTargetV2, { kind: 'instance-control' }>>
  if (shared) {
    const planIssue = independentPlanIssue(record, intent.independence)
    if (planIssue) return refuse(planIssue)
    const plan = intent.independence!
    instanceId = plan.instanceId
    next.composition.patternInstances.push({ ...structuredClone(source), id: instanceId })
    const copied = copyShowInstancePropertyTracksV2(next, { fromInstanceId: source.id, toInstanceId: instanceId, placementDeltaMs: 0,
      identitiesBySourceTrackId: plan.identitiesBySourceTrackId, compatibleControlExports: exports })
    if (copied.status === 'refused') return refuse(copied.message)
    if (unchanged) return { status: 'unchanged', record, ...empty }
    next.composition.propertyTracks = copied.propertyTracks
    next.composition.clips.find(candidate => candidate.id === clip.id)!.instanceId = instanceId
    affectedTrackIds = copied.copiedTrackIds
    affectedKeyframeIds = next.composition.propertyTracks.filter(track => affectedTrackIds.includes(track.id)).flatMap(track => track.keyframes.map(key => key.id))
    discardedControlTargets = copied.discardedTargets.filter((target): target is Extract<ShowPropertyTargetV2, { kind: 'instance-control' }> => target.kind === 'instance-control')
    next.composition.executionModel = 'continuous'
  } else {
    const authoredIds = new Set(record.composition.propertyTracks.map(track => track.id))
    const unowned = lostEffective.find(track => !authoredIds.has(track.id))
    if (unowned && unowned.target.kind === 'instance-control') {
      const occurrence = record.composition.groupOccurrences.find(owner => record.composition.groupDefinitions
        .find(definition => definition.id === owner.definitionId)!.propertyTracks.some(track => `${owner.id}:${track.id}` === unowned.id))!
      return refuse(`Cannot replace this Clip: control "${unowned.target.exportName}" on Pattern instance "${source.id}" is animated by Group "${occurrence.definitionId}", occurrence "${occurrence.id}", track "${unowned.id}". Removing it would alter Group-owned choreography.`, 'compiler-ineligible')
    }
    affectedTrackIds = lostEffective.map(track => track.id)
    affectedKeyframeIds = lostEffective.flatMap(track => track.keyframes.map(key => key.id))
    removedIds = [...affectedTrackIds, ...affectedKeyframeIds]
    discardedControlTargets = lostEffective.map(track => structuredClone(track.target) as Extract<ShowPropertyTargetV2, { kind: 'instance-control' }>)
    next.composition.propertyTracks = next.composition.propertyTracks.filter(track => !affectedTrackIds.includes(track.id))
    if (sourceChanged) next.composition.executionModel = 'continuous'
  }
  for (const exportName of lostValues) {
    if (!discardedControlTargets.some(target => target.instanceId === source.id && target.exportName === exportName)) {
      discardedControlTargets.push({ kind: 'instance-control', instanceId: source.id, exportName })
    }
  }
  const target = next.composition.patternInstances.find(instance => instance.id === instanceId)!
  target.pattern = structuredClone(replacement.patternReference)
  target.patternName = replacement.patternName
  if (source.controlTargets !== undefined) target.controlTargets = Object.fromEntries(Object.entries(source.controlTargets).filter(([name]) => compatible.has(name)))
  const invalid = validateShowRecordV2(next)[0]
  if (invalid) return refuse(`${invalid.path}: ${invalid.message}`, 'invalid-result')
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuse(`${restriction.rule}: ${restriction.message}`, 'compiler-ineligible')
  return { status: 'changed', record: next, affectedClipIds: [clip.id], affectedInstanceIds: [instanceId], affectedTrackIds, affectedKeyframeIds, removedIds, discardedControlTargets }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: unknown, expected: readonly string[]): boolean {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  return JSON.stringify(actual) === JSON.stringify([...expected].sort())
}
