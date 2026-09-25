import { groupDefinitionAsRecord, groupDuration, groupOccurrenceDuration, materializeShowGroupsV2 } from './showGroupsV2'
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import Ajv2020 from 'ajv/dist/2020'
import draft07MetaSchemaText from 'ajv/dist/refs/json-schema-draft-07.json?raw'
import showRecordV1SchemaText from '../../schemas/show-record.schema.json?raw'
import showRecordV2SchemaText from '../../schemas/show-record-v2.provisional.schema.json?raw'
import type {
  ShowBoundaryTransition,
  ShowClipBlink,
  ShowClipEffect,
  ShowClipPresentation,
  ShowClipTransform,
  ShowClipViewport,
  ShowLayerTransition,
  ShowOutputContract,
  ShowOutputEffect,
  ShowPatternInstance,
  ShowPlacementView,
  ShowRoutingDirection,
  ShowRoutingLayout,
  ShowStructuredEasing,
  ShowTimelineMarker,
  ShowTransitionKind,
  ShowZone,
} from './personalContentRecords'
import { validateShowEasing } from './showEasing'
import type { ShowPropertyCurveSegment } from './showPropertyAnimation'
import { findShowInstancePropertyTrackConflictsV2 } from './showPropertyTrackConflictsV2'

export interface ShowLayerV2 {
  id: string
  zoneId: string
  name: string
  /** Zero is the bottom Layer. */
  rank: number
}

/**
 * A timeline Marker with the optional narrative role. `chapter` is the only
 * enumerated role: it selects a Marker for the Gallery, reading-card and Live
 * chapter projections and owns no time partition or execution trigger.
 *
 * `origin` is explicit conversion provenance, written only by the v1 converter
 * on a chapter Marker it newly created from a former Scene label (#1065). It is
 * never inferred from an ID, name, time or role, so a Marker without it stays
 * plainly authored and visible; it carries no timing, ownership, compilation or
 * playback meaning.
 */
export interface ShowMarkerV2 extends ShowTimelineMarker {
  role?: 'chapter'
  origin?: 'converted-scene-label'
}

export interface ShowClipV2 {
  id: string
  instanceId: string
  zoneId: string
  layerId: string
  startMs: number
  durationMs: number
  entryPolicy: 'continue' | 'restart'
  zoneSampleMode: 'independent' | 'span'
  appearance: ShowClipAppearanceTimelineV2
  /**
   * Conversion provenance for a `--layout-N` segment of one v1 logical Clip
   * (#1068 item 1b), under `docs/reference/contracts/show-v2-conversion-provenance.md`.
   * Written only by the v1 converter when a Zone unavailable for part of the
   * span splits the Clip; inert for playback and never authored by a command.
   */
  logicalClipId?: string
}

export interface ShowClipAppearanceTimelineV2 {
  keys: ShowClipAppearanceKeyV2[]
}

/**
 * Every segment of the logical Clip a `--layout-N` conversion split produced.
 * A Clip without `logicalClipId` is its own logical Clip; otherwise the group
 * is every Clip carrying the same field (#1068 item 1b). Sorted for stable
 * delete reporting.
 */
export function showV2LogicalClipSegmentIds(
  composition: Pick<ShowCompositionV2, 'clips'>,
  clipId: string,
): string[] {
  const clip = composition.clips.find((candidate) => candidate.id === clipId)
  if (!clip || clip.logicalClipId === undefined) return [clipId]
  return composition.clips
    .filter((candidate) => candidate.logicalClipId === clip.logicalClipId)
    .map((candidate) => candidate.id)
    .sort()
}

/** The v1 `logicalClipId ?? id` identity v2 dedupes ordinary Clips by. */
export function showV2LogicalClipKey(clip: Pick<ShowClipV2, 'id' | 'logicalClipId'>): string {
  return clip.logicalClipId ?? clip.id
}

export interface ShowClipAppearanceKeyV2 {
  id: string
  timeMs: number
  value: ShowClipAppearanceValueV2
}

export interface ShowClipAppearanceValueV2 {
  opacity: number
  view: ShowPlacementView
  presentation?: ShowClipPresentation
  blink?: ShowClipBlink
  transform?: ShowClipTransform
  aperture?: ShowClipViewport
  effects?: ShowClipEffect[]
}

export interface ShowTransitionParticipantV2 {
  id: string
  zoneId: string
  layerId: string
  fromClipId: string
  toClipId: string
}

export type ShowPropertyTargetV2 =
  | { kind: 'instance-time-scale'; instanceId: string }
  | { kind: 'instance-control'; instanceId: string; exportName: string }
  | { kind: 'clip-opacity'; clipId: string }
  | { kind: 'clip-view'; clipId: string; property: 'brightness' | 'phase' }
  | { kind: 'clip-transform'; clipId: string; property: keyof ShowClipTransform }
  | { kind: 'clip-aperture'; clipId: string; property: 'x' | 'y' | 'width' | 'height' }
  | { kind: 'clip-effect'; clipId: string; effectId: string; effectKind: ShowClipEffect['kind']; parameterId: string }
  | { kind: 'layout-occurrence-split-position'; layoutOccurrenceId: string }
  | { kind: 'show-repeat-scale' }

export interface ShowTransitionPropertyRampV2 {
  participantId?: string
  target: ShowPropertyTargetV2
  from: number
  durationMs?: number
  easing?: ShowStructuredEasing
}

export function isShowTransitionClipValueRampV2(ramp: ShowTransitionPropertyRampV2): boolean {
  return ramp.target.kind === 'instance-time-scale'
    || (ramp.target.kind === 'clip-view' && ramp.target.property === 'brightness')
}

/**
 * The participant a Clip-value ramp animates: the one it names, or the only
 * participant when it names none. Validation, lowering and the editor summary
 * all resolve through this rule.
 */
export function showTransitionClipRampParticipantV2(
  transition: Pick<ShowTransitionV2, 'participants'>,
  ramp: ShowTransitionPropertyRampV2,
): ShowTransitionParticipantV2 | undefined {
  return ramp.participantId !== undefined
    ? transition.participants.find(candidate => candidate.id === ramp.participantId)
    : transition.participants.length === 1 ? transition.participants[0] : undefined
}

export function retimeShowTransitionRampsV2(transition: ShowTransitionV2, newDurationMs: number): ShowTransitionPropertyRampV2[] {
  return transition.propertyRamps.map(ramp => {
    if (ramp.durationMs === undefined) return structuredClone(ramp)
    const floor = isShowTransitionClipValueRampV2(ramp) ? 100 : 1
    const durationMs = Math.min(newDurationMs, Math.max(Math.min(floor, newDurationMs), Math.round(ramp.durationMs * newDurationMs / transition.durationMs)))
    const { durationMs: _previousDurationMs, ...rest } = structuredClone(ramp)
    return durationMs === newDurationMs ? rest : { ...rest, durationMs }
  })
}

export interface ShowTransitionV2 extends Omit<
  ShowBoundaryTransition,
  'afterSceneId' | 'kind' | 'layoutId' | 'routingDirection' | 'propertyTransitions'
> {
  kind: Exclude<ShowTransitionKind, 'cut'>
  /**
   * Whole-output ownership preserves existing boundary compositing without pairing Layers.
   * Either contributor side may be empty: the empty side renders the
   * compiler-owned Empty, so a boundary that fades to or from Black needs no
   * invented Clip (#1068). Validation still requires each side to name every
   * Clip abutting its window edge, so emptiness is exact, never a default.
   */
  wholeOutput?: { startMs: number; fromClipIds: string[]; toClipIds: string[] }
  participants: ShowTransitionParticipantV2[]
  propertyRamps: ShowTransitionPropertyRampV2[]
  /**
   * Explicit conversion provenance, written only by the v1 converter (#1065).
   * v1 keeps Scene-boundary Transitions and Layer Transitions in two different
   * collections and edits them through two different editor surfaces, while a
   * converted boundary Transition reaches Layer participant scope whenever it
   * does not need whole-output ownership. Structure therefore cannot recover
   * the distinction, and it is never inferred from an id, kind or scope.
   *
   * It carries no timing, ownership, compilation or playback meaning: lowering
   * strips it before the compiler sees a Transition.
   */
  origin?: 'converted-boundary-transition' | 'converted-layer-transition'
}

export interface ShowLayoutTransferV2 {
  easing?: ShowStructuredEasing
  id: string
  fromOccurrenceId: string
  durationMs: number
  direction: ShowRoutingDirection
}

/**
 * Conversion provenance for a v1 zero-duration routing switch (#1065).
 *
 * Section 8 keeps the execution invariant that zero duration is a switch
 * *without* a timed transfer object, so this is a separate inert record rather
 * than a `durationMs: 0` transfer. It preserves the authored v1 routing
 * Transition identity and only the settings v1 actually authored, so the
 * existing editor can select and describe that switch exactly as it did on v1.
 * Lowering derives the switch from the Layout change itself and never reads
 * this field, so compiled playback is unchanged.
 */
export interface ShowLayoutSwitchProvenanceV2 {
  /** The one admitted origin. */
  origin: 'converted-routing-cut'
  /** The authored v1 routing Transition identity. */
  id: string
  fromOccurrenceId: string
  /** Present only when v1 authored `routingDirection`; absent is not 'forward'. */
  direction?: ShowRoutingDirection
  easing?: ShowStructuredEasing
}

export interface ShowLayoutOccurrenceV2 {
  id: string
  layoutId: string
  startMs: number
  durationMs: number
  parameters: { splitPosition?: number }
  incomingTransfer?: ShowLayoutTransferV2
  /** Mutually exclusive with `incomingTransfer`: a switch has no timed transfer. */
  incomingSwitch?: ShowLayoutSwitchProvenanceV2
}

export interface ShowPropertyKeyframeV2 {
  id: string
  timeMs: number
  value: number
  easing: ShowStructuredEasing
  /** Exact outgoing source-curve interval retained by restriction or insertion. */
  curveSegment?: ShowPropertyCurveSegment
}

export interface ShowPropertyTrackV2 {
  id: string
  target: ShowPropertyTargetV2
  activeStartMs: number
  activeDurationMs: number
  keyframes: ShowPropertyKeyframeV2[]
}

export interface ShowGroupLayerV2 {
  id: string
  name: string
  rank: number
}

export type ShowGroupClipV2 = Omit<ShowClipV2, 'zoneId'>

export interface ShowGroupDefinitionV2 {
  id: string
  name: string
  patternInstances: ShowPatternInstance[]
  layers: ShowGroupLayerV2[]
  clips: ShowGroupClipV2[]
  transitions: ShowLayerTransition[]
  propertyTracks: ShowPropertyTrackV2[]
}

export interface ShowGroupLayerBindingV2 {
  definitionLayerId: string
  layerId: string
}

export interface ShowGroupOccurrenceHoldV2 {
  id: string
  localTimeMs: number
  durationMs: number
}

export interface ShowGroupOccurrenceV2 {
  /** Omission shares definition instances; explicit bindings preserve independent runtimes. */
  instanceBindings?: Record<string, string>
  /** Explicit source contribution interval for migrated definition tracks. */
  trackActivation?: { startMs: number; durationMs: number }
  id: string
  definitionId: string
  layoutOccurrenceId: string
  zoneId: string
  startMs: number
  translationX: number
  translationY: number
  layerBindings: ShowGroupLayerBindingV2[]
  holds: ShowGroupOccurrenceHoldV2[]
}

export interface ShowCompositionV2 {
  version: 2
  executionModel: 'continuous' | 'deterministic-loop'
  showEndMs: number
  sampleRemap: { repeatScale: number; origin?: 'converted-authored-repeat-scale' }
  patternInstances: ShowPatternInstance[]
  layers: ShowLayerV2[]
  clips: ShowClipV2[]
  transitions: ShowTransitionV2[]
  layoutOccurrences: ShowLayoutOccurrenceV2[]
  propertyTracks: ShowPropertyTrackV2[]
  markers: ShowMarkerV2[]
  groupDefinitions: ShowGroupDefinitionV2[]
  groupOccurrences: ShowGroupOccurrenceV2[]
}

export interface ShowRecordV2 {
  version: 2
  id: string
  name: string
  zones: ShowZone[]
  zoneLayouts: ShowRoutingLayout[]
  targetControllerProfileId?: string
  stageMapId?: string | null
  outputContract: ShowOutputContract
  composition: ShowCompositionV2
  outputEffects?: ShowOutputEffect[]
  importMetadata?: {
    kind: 'show-file'
    originalShowId: string
    appVersion: string
    exportedAt: string
    importedAt: number
  }
  updatedAt: number
}

export type ShowCompositionV2ValidationCode =
  | 'schema'
  | 'invalid-version'
  | 'duplicate-id'
  | 'missing-reference'
  | 'not-finite'
  | 'not-integer'
  | 'out-of-bounds'
  | 'overlap'
  | 'invalid-transition'
  | 'invalid-layout-coverage'
  | 'invalid-group-binding'
  | 'invalid-property-target'

export interface ShowCompositionV2ValidationIssue {
  path: string
  code: ShowCompositionV2ValidationCode
  message: string
}

export type ProvisionalShowRecordV2OpenResult =
  | { status: 'opened'; record: ShowRecordV2 }
  | { status: 'refused'; issues: ShowCompositionV2ValidationIssue[] }

/** Additive tracer codec only; production import/export does not call this. */
export function serializeProvisionalShowRecordV2(record: ShowRecordV2): string {
  const issues = validateShowRecordV2(record)
  if (issues.length > 0) throw new Error(`Invalid provisional Show v2 record at ${issues[0].path}: ${issues[0].message}`)
  return `${JSON.stringify(record, null, 2)}\n`
}

/** Reopen additive tracer bytes through both structural and domain validation. */
export function parseProvisionalShowRecordV2(text: string): ProvisionalShowRecordV2OpenResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      status: 'refused',
      issues: [{ path: '/', code: 'schema', message: 'Document is not valid JSON.' }],
    }
  }
  const structural = structuralIssues(v2StructuralValidator(), parsed)
  if (structural.length > 0) return { status: 'refused', issues: structural }
  const record = parsed as ShowRecordV2
  const issues = validateShowRecordV2(record)
  return issues.length > 0 ? { status: 'refused', issues } : { status: 'opened', record }
}

/**
 * Validate a complete provisional v2 record without normalizing or repairing it.
 * The validator is intentionally additive and is not a production admission path.
 */
export function validateShowRecordV2(record: ShowRecordV2): ShowCompositionV2ValidationIssue[] {
  const issues = structuralIssues(v2StructuralValidator(), record)
  if (issues.length > 0) return issues
  return validateShowRecordV2Domain(record)
}

/** Run referential and timeline validation after a trusted structural validator. */
export function validateShowRecordV2Domain(record: ShowRecordV2, derivedStructuralIssues: (value: unknown) => ShowCompositionV2ValidationIssue[] = desktopStructuralIssuesV2): ShowCompositionV2ValidationIssue[] {
  const issues: ShowCompositionV2ValidationIssue[] = []
  if (record.version !== 2) {
    addIssue(issues, 'version', 'invalid-version', 'Show record version must be 2.')
  }
  if (record.composition.version !== 2) {
    addIssue(
      issues,
      'composition.version',
      'invalid-version',
      'Show composition must use version 2.',
    )
  }

  const composition = record.composition
  validatePositiveTime(issues, 'composition.showEndMs', composition.showEndMs)
  const zones = uniqueIndex(issues, 'zones', record.zones)
  const layouts = uniqueIndex(issues, 'zoneLayouts', record.zoneLayouts)
  const instances = uniqueIndex(issues, 'composition.patternInstances', composition.patternInstances)
  const layers = uniqueIndex(issues, 'composition.layers', composition.layers)
  const clips = uniqueIndex(issues, 'composition.clips', composition.clips)
  uniqueIndex(issues, 'composition.transitions', composition.transitions)
  const occurrences = uniqueIndex(issues, 'composition.layoutOccurrences', composition.layoutOccurrences)
  const definitions = uniqueIndex(issues, 'composition.groupDefinitions', composition.groupDefinitions)
  uniqueIndex(issues, 'composition.groupOccurrences', composition.groupOccurrences)
  validateUniqueNestedIds(issues, composition)

  // v1's `validateShowComposition` requires a finite whole-millisecond time
  // offset and a finite time scale on every Pattern instance, and
  // `validateShowCompositionTimelineMetadata` requires a finite, nonnegative
  // whole-millisecond Marker time. The v2 schema types both as plain numbers,
  // so neither reached a `ShowRecordV2`. Classification is v1's: composition
  // errors, reported by the record validator every v2 owner and admission runs.
  composition.patternInstances.forEach((instance, index) => {
    validateWholeMilliseconds(issues, `composition.patternInstances[${index}].time.timeOffsetMs`, instance.time.timeOffsetMs)
    if (!Number.isFinite(instance.time.timeScale)) {
      addIssue(issues, `composition.patternInstances[${index}].time.timeScale`, 'not-finite', 'Animation speed must be finite.')
    }
  })
  composition.markers.forEach((marker, index) => {
    validateNonnegativeTime(issues, `composition.markers[${index}].timeMs`, marker.timeMs)
  })

  const ranks = new Set<string>()
  composition.layers.forEach((layer, index) => {
    const path = `composition.layers[${index}]`
    if (!zones.has(layer.zoneId)) {
      addIssue(issues, `${path}.zoneId`, 'missing-reference', `Zone "${layer.zoneId}" does not exist.`)
    }
    validateNonnegativeTime(issues, `${path}.rank`, layer.rank)
    const rankKey = `${layer.zoneId}:${layer.rank}`
    if (ranks.has(rankKey)) {
      addIssue(issues, `${path}.rank`, 'duplicate-id', `Layer rank ${layer.rank} is duplicated in Zone "${layer.zoneId}".`)
    }
    ranks.add(rankKey)
  })

  composition.clips.forEach((clip, index) => {
    const path = `composition.clips[${index}]`
    const layer = layers.get(clip.layerId)
    if (!instances.has(clip.instanceId)) {
      addIssue(issues, `${path}.instanceId`, 'missing-reference', `Pattern instance "${clip.instanceId}" does not exist.`)
    }
    if (!zones.has(clip.zoneId)) {
      addIssue(issues, `${path}.zoneId`, 'missing-reference', `Zone "${clip.zoneId}" does not exist.`)
    }
    if (!layer) {
      addIssue(issues, `${path}.layerId`, 'missing-reference', `Layer "${clip.layerId}" does not exist.`)
    } else if (layer.zoneId !== clip.zoneId) {
      addIssue(issues, `${path}.layerId`, 'missing-reference', 'The Clip Layer belongs to a different Zone.')
    }
    validateNonnegativeTime(issues, `${path}.startMs`, clip.startMs)
    validatePositiveTime(issues, `${path}.durationMs`, clip.durationMs)
    if (safeAdd(clip.startMs, clip.durationMs) > composition.showEndMs) {
      addIssue(issues, path, 'out-of-bounds', 'The Clip extends beyond Show End.')
    }
    if (clip.logicalClipId !== undefined && clips.has(clip.logicalClipId)) {
      addIssue(issues, `${path}.logicalClipId`, 'duplicate-id', `Logical Clip identity "${clip.logicalClipId}" shadows another Clip.`)
    }
    uniqueIndex(issues, `${path}.appearance.keys`, clip.appearance.keys)
    clip.appearance.keys.forEach((key, keyIndex) => {
      const keyPath = `${path}.appearance.keys[${keyIndex}]`
      validateNonnegativeTime(issues, `${keyPath}.timeMs`, key.timeMs)
      if (key.timeMs < clip.startMs || key.timeMs >= safeAdd(clip.startMs, clip.durationMs)) {
        addIssue(issues, `${keyPath}.timeMs`, 'out-of-bounds', 'Appearance key time must be inside the Clip interval.')
      }
      if (keyIndex === 0 && key.timeMs !== clip.startMs) {
        addIssue(issues, `${keyPath}.timeMs`, 'out-of-bounds', 'The first appearance key must start with the Clip.')
      }
      if (keyIndex > 0 && key.timeMs <= clip.appearance.keys[keyIndex - 1].timeMs) {
        addIssue(issues, `${keyPath}.timeMs`, 'overlap', 'Appearance key times must be strictly increasing.')
      }
      if (!Number.isFinite(key.value.opacity) || key.value.opacity < 0 || key.value.opacity > 1) {
        addIssue(issues, `${keyPath}.value.opacity`, 'out-of-bounds', 'Clip opacity must be finite and between 0 and 1.')
      }
    })
  })

  const clipsByLayer = new Map<string, Array<{ clip: ShowClipV2; index: number }>>()
  composition.clips.forEach((clip, index) => {
    const key = `${clip.zoneId}:${clip.layerId}`
    const entries = clipsByLayer.get(key) ?? []
    entries.push({ clip, index })
    clipsByLayer.set(key, entries)
  })
  for (const entries of clipsByLayer.values()) {
    entries.sort((left, right) => left.clip.startMs - right.clip.startMs || left.clip.id.localeCompare(right.clip.id))
    entries.forEach((entry, index) => {
      const previous = entries[index - 1]
      if (previous && safeAdd(previous.clip.startMs, previous.clip.durationMs) > entry.clip.startMs) {
        addIssue(issues, `composition.clips[${entry.index}]`, 'overlap', 'Clips on one Zone and Layer cannot overlap.')
      }
    })
  }

  composition.transitions.forEach((transition, transitionIndex) => {
    const path = `composition.transitions[${transitionIndex}]`
    validatePositiveTime(issues, `${path}.durationMs`, transition.durationMs)
    if (transition.wholeOutput) {
      const scope = transition.wholeOutput
      validateNonnegativeTime(issues, `${path}.wholeOutput.startMs`, scope.startMs)
      if (transition.participants.length !== 0 || safeAdd(scope.startMs, transition.durationMs) > composition.showEndMs) {
        addIssue(issues, path, 'invalid-transition', 'Whole-output scope requires a positive in-bounds window and no Layer participants.')
      }
      const endMs = safeAdd(scope.startMs, transition.durationMs)
      const expectedFrom = composition.clips.filter(clip => safeAdd(clip.startMs, clip.durationMs) === scope.startMs).map(clip => clip.id).sort()
      const expectedTo = composition.clips.filter(clip => clip.startMs === endMs).map(clip => clip.id).sort()
      if (JSON.stringify([...scope.fromClipIds].sort()) !== JSON.stringify(expectedFrom)
        || JSON.stringify([...scope.toClipIds].sort()) !== JSON.stringify(expectedTo)
        || composition.clips.some(clip => clip.startMs < endMs && safeAdd(clip.startMs, clip.durationMs) > scope.startMs)) {
        addIssue(issues, path, 'invalid-transition', 'Whole-output scope must name every boundary contributor and cannot hide an intervening Clip.')
      }
      // Either side may be empty: a v1 boundary Transition blends its named
      // contributors to or from the compiler-owned Empty when the neighbouring
      // Scene contributes no Clip in that Zone (#1068). The exact-match rule
      // above already forces completeness, so an empty side is valid only when
      // no Clip abuts that window edge.
      for (const [side, ids] of [['from', scope.fromClipIds], ['to', scope.toClipIds]] as const) {
        if (new Set(ids).size !== ids.length) addIssue(issues, path, 'invalid-transition', `Whole-output ${side} contributors must be unique.`)
        for (const id of ids) {
          const clip = clips.get(id)
          if (!clip) addIssue(issues, path, 'missing-reference', 'Whole-output contributor Clips must exist.')
          else if (side === 'from' ? safeAdd(clip.startMs, clip.durationMs) !== scope.startMs : clip.startMs !== safeAdd(scope.startMs, transition.durationMs)) {
            addIssue(issues, path, 'invalid-transition', 'Whole-output contributors must meet the exact window endpoints.')
          }
        }
      }
    } else if (transition.participants.length === 0) {
      addIssue(issues, `${path}.participants`, 'invalid-transition', 'A Transition needs at least one participant.')
    }
    transition.participants.forEach((participant, participantIndex) => {
      const participantPath = `${path}.participants[${participantIndex}]`
      const from = clips.get(participant.fromClipId)
      const to = clips.get(participant.toClipId)
      if (!from || !to) {
        addIssue(issues, participantPath, 'missing-reference', 'Transition participant Clips must exist.')
        return
      }
      const exactEndpoints = from.zoneId === participant.zoneId
        && to.zoneId === participant.zoneId
        && from.layerId === participant.layerId
        && to.layerId === participant.layerId
        && safeAdd(from.startMs, from.durationMs) + transition.durationMs === to.startMs
      if (!exactEndpoints) {
        addIssue(
          issues,
          participantPath,
          'invalid-transition',
          'A Transition participant must join exact endpoints on one Zone and Layer.',
        )
      }
    })
    const scalarTargets = new Set<string>()
    const clipRampSeen = new Set<string>()
    transition.propertyRamps.forEach((ramp, index) => {
      const rampPath = `${path}.propertyRamps[${index}]`
      if (ramp.target.kind === 'show-repeat-scale' || ramp.target.kind === 'layout-occurrence-split-position') {
        if (scalarTargets.has(ramp.target.kind)) addIssue(issues, rampPath, 'invalid-transition', 'A scalar target may have only one boundary ramp.')
        scalarTargets.add(ramp.target.kind)
        if (!transition.wholeOutput || ramp.participantId !== undefined) addIssue(issues, rampPath, 'invalid-transition', 'Global scalar ramps require whole-output scope.')
        if (ramp.target.kind === 'layout-occurrence-split-position') {
          const occurrence = occurrences.get(ramp.target.layoutOccurrenceId)
          const atMs = (transition.wholeOutput?.startMs ?? 0) + transition.durationMs
          if (!occurrence || occurrence.startMs > atMs || occurrence.startMs + occurrence.durationMs <= atMs) addIssue(issues, rampPath, 'missing-reference', 'Split ramp must target the incoming Layout occurrence.')
          if (ramp.from < 0 || ramp.from > 1) addIssue(issues, rampPath, 'out-of-bounds', 'Split ramp origin must be between zero and one.')
        } else if (ramp.from <= 0) addIssue(issues, rampPath, 'out-of-bounds', 'Repeat-scale ramp origin must be positive.')
        return
      }
      if (ramp.target.kind !== 'instance-time-scale' && ramp.target.kind !== 'clip-view') return
      const isSpeed = ramp.target.kind === 'instance-time-scale'
      const isBrightness = ramp.target.kind === 'clip-view' && ramp.target.property === 'brightness'
      if (!isSpeed && !isBrightness) {
        addIssue(issues, rampPath, 'invalid-property-target', 'Transition property ramps animate only the incoming Clip\'s Animation speed or Brightness.')
        return
      }
      if (transition.wholeOutput !== undefined) {
        addIssue(issues, rampPath, 'invalid-transition', 'A Transition speed or brightness ramp belongs to a participant.')
        return
      }
      const participant = showTransitionClipRampParticipantV2(transition, ramp)
      if (!participant) {
        addIssue(issues, rampPath, 'invalid-transition', 'Name the participant this ramp animates.')
        return
      }
      const incoming = clips.get(participant.toClipId)
      if (!incoming) {
        addIssue(issues, rampPath, 'missing-reference', 'A Transition ramp animates the incoming Clip of its participant.')
        return
      }
      const namesIncoming = isSpeed
        ? (ramp.target.kind === 'instance-time-scale' && ramp.target.instanceId === incoming.instanceId)
        : (ramp.target.kind === 'clip-view' && ramp.target.clipId === incoming.id)
      if (!namesIncoming) {
        addIssue(issues, rampPath, 'invalid-property-target', 'A Transition ramp animates the incoming Clip of its participant.')
        return
      }
      const rampKey = `${participant.id}:${isSpeed ? 'timeScale' : 'brightness'}`
      if (clipRampSeen.has(rampKey)) {
        addIssue(issues, rampPath, 'invalid-transition', 'A Transition participant may have only one speed ramp and one brightness ramp.')
      } else {
        clipRampSeen.add(rampKey)
      }
      if (!Number.isFinite(ramp.from)) {
        addIssue(issues, rampPath, 'not-finite', isSpeed ? 'Speed ramp origin must be finite.' : 'Brightness ramp origin must be finite.')
      } else if (isSpeed ? (ramp.from < 0 || ramp.from > 4) : (ramp.from < 0 || ramp.from > 1)) {
        addIssue(issues, rampPath, 'out-of-bounds', isSpeed ? 'Speed ramp origin must be between 0 and 4.' : 'Brightness ramp origin must be between 0 and 1.')
      }
      if (ramp.durationMs !== undefined) {
        if (!Number.isFinite(ramp.durationMs)) {
          addIssue(issues, rampPath, 'not-finite', 'Ramp duration must be finite.')
        } else if (!Number.isSafeInteger(ramp.durationMs)) {
          addIssue(issues, rampPath, 'not-integer', 'Ramp duration must be a safe integer.')
        } else {
          const minDurationMs = Math.min(100, transition.durationMs)
          if (ramp.durationMs < minDurationMs || ramp.durationMs > transition.durationMs) {
            addIssue(issues, rampPath, 'out-of-bounds', `Ramp duration must be between ${minDurationMs} and ${transition.durationMs}.`)
          }
        }
      }
      if (ramp.easing !== undefined && !validateShowEasing(ramp.easing).valid) {
        addIssue(issues, rampPath, 'out-of-bounds', 'Ramp easing must be valid.')
      }
    })
  })

  validateLayoutCoverage(issues, record, layouts, occurrences)
  composition.propertyTracks.forEach((track, index) => {
    validatePropertyTrack(issues, `composition.propertyTracks[${index}]`, track, {
      instances,
      clips,
      occurrences,
      showEndMs: composition.showEndMs,
    })
  })
  for (const conflict of findShowInstancePropertyTrackConflictsV2(composition.propertyTracks)) {
    const index = composition.propertyTracks.findIndex(track => track.id === conflict.trackIds[1])
    addIssue(
      issues,
      `composition.propertyTracks[${index}].target`,
      'invalid-property-target',
      `Instance animation track "${conflict.trackIds[1]}" overlaps active owner "${conflict.trackIds[0]}" for the same target.`,
    )
  }
  validateGroups(issues, record, {
    layers,
    occurrences,
    routingLayouts: layouts,
    definitions,
  }, derivedStructuralIssues)

  return issues
}

let cachedV1StructuralValidator: ValidateFunction | undefined
let cachedV2StructuralValidator: ValidateFunction | undefined

export function validateShowRecordV1Structure(record: unknown): ShowCompositionV2ValidationIssue[] {
  if (!cachedV1StructuralValidator) {
    cachedV1StructuralValidator = new Ajv({ allErrors: true, strict: false, strictNumbers: true })
      .compile(JSON.parse(showRecordV1SchemaText))
  }
  return structuralIssues(cachedV1StructuralValidator, record)
}

function v2StructuralValidator(): ValidateFunction {
  if (!cachedV2StructuralValidator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false, strictNumbers: true })
    ajv.addMetaSchema(JSON.parse(draft07MetaSchemaText))
    ajv.addSchema(JSON.parse(showRecordV1SchemaText), 'https://pxlblz.dev/schemas/show-record.schema.json')
    cachedV2StructuralValidator = ajv.compile(JSON.parse(showRecordV2SchemaText))
  }
  return cachedV2StructuralValidator
}

/**
 * The provisional v2 record schema alone, with its raw keyword errors (#1039).
 *
 * Admission reports schema, domain, dependency and compiler eligibility as
 * distinct checks, and the schema half needs the failing keyword to name a
 * bounded diagnostic. Callers share this one compiled validator rather than
 * compiling a second copy of the same schema.
 */
export function validateShowRecordV2Structure(value: unknown): { valid: true } | { valid: false; errors: ErrorObject[] } {
  const validator = v2StructuralValidator()
  return validator(value) ? { valid: true } : { valid: false, errors: validator.errors ?? [] }
}

function structuralIssues(
  validator: ValidateFunction,
  record: unknown,
): ShowCompositionV2ValidationIssue[] {
  if (validator(record)) return []
  return (validator.errors ?? []).map((error: ErrorObject) => ({
    path: error.instancePath || '/',
    code: 'schema' as const,
    message: `${error.instancePath || 'document'} ${error.message ?? 'is invalid'}`.trim(),
  }))
}

function addIssue(
  issues: ShowCompositionV2ValidationIssue[],
  path: string,
  code: ShowCompositionV2ValidationCode,
  message: string,
): void {
  issues.push({ path, code, message })
}

function uniqueIndex<T extends { id: string }>(
  issues: ShowCompositionV2ValidationIssue[],
  path: string,
  values: readonly T[],
): Map<string, T> {
  const result = new Map<string, T>()
  values.forEach((value, index) => {
    if (typeof value.id !== 'string' || value.id.length === 0) {
      addIssue(issues, `${path}[${index}].id`, 'missing-reference', 'Identity must be a non-empty string.')
    } else if (result.has(value.id)) {
      addIssue(issues, `${path}[${index}].id`, 'duplicate-id', `Identity "${value.id}" is duplicated.`)
    } else {
      result.set(value.id, value)
    }
  })
  return result
}

function validateUniqueNestedIds(
  issues: ShowCompositionV2ValidationIssue[],
  composition: ShowCompositionV2,
): void {
  uniqueIndex(issues, 'composition.markers', composition.markers)
  uniqueIndex(issues, 'composition.propertyTracks', composition.propertyTracks)
  composition.propertyTracks.forEach((track, index) => {
    uniqueIndex(issues, `composition.propertyTracks[${index}].keyframes`, track.keyframes)
  })
  composition.transitions.forEach((transition, index) => {
    uniqueIndex(issues, `composition.transitions[${index}].participants`, transition.participants)
  })
  composition.groupOccurrences.forEach((occurrence, index) => {
    uniqueIndex(issues, `composition.groupOccurrences[${index}].holds`, occurrence.holds)
    occurrence.holds.forEach((hold, holdIndex) => {
      if (hold.id.trim().length === 0) {
        addIssue(
          issues,
          `composition.groupOccurrences[${index}].holds[${holdIndex}].id`,
          'missing-reference',
          'Identity must contain a non-whitespace character.',
        )
      }
    })
  })
}

/**
 * v1's `validateFiniteInteger`, in the v2 record's own units: a whole
 * millisecond of unrestricted sign. Specification section 3 makes every v2 time
 * a *safe* integer, so this asks for a safe one where v1 asked only for an
 * integer - the two differ only past 2^53 milliseconds.
 */
function validateWholeMilliseconds(
  issues: ShowCompositionV2ValidationIssue[],
  path: string,
  value: number,
): void {
  if (!Number.isFinite(value)) addIssue(issues, path, 'not-finite', 'Value must be finite.')
  else if (!Number.isSafeInteger(value)) addIssue(issues, path, 'not-integer', 'Value must be a safe integer.')
}

function validateNonnegativeTime(
  issues: ShowCompositionV2ValidationIssue[],
  path: string,
  value: number,
): void {
  if (!Number.isFinite(value)) addIssue(issues, path, 'not-finite', 'Value must be finite.')
  else if (!Number.isSafeInteger(value)) addIssue(issues, path, 'not-integer', 'Value must be a safe integer.')
  else if (value < 0) addIssue(issues, path, 'out-of-bounds', 'Value must be nonnegative.')
}

function validatePositiveTime(
  issues: ShowCompositionV2ValidationIssue[],
  path: string,
  value: number,
): void {
  validateNonnegativeTime(issues, path, value)
  if (Number.isSafeInteger(value) && value <= 0) addIssue(issues, path, 'out-of-bounds', 'Value must be positive.')
}

function safeAdd(left: number, right: number): number {
  const sum = left + right
  return Number.isSafeInteger(sum) ? sum : Number.POSITIVE_INFINITY
}

function validateLayoutCoverage(
  issues: ShowCompositionV2ValidationIssue[],
  record: ShowRecordV2,
  layouts: Map<string, ShowRoutingLayout>,
  occurrences: Map<string, ShowLayoutOccurrenceV2>,
): void {
  const ordered = [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  let cursorMs = 0
  // A transfer and a converted switch are both selectable routing identities on
  // one timeline, so they share one identity space.
  const routingIds = new Set<string>()
  ordered.forEach((occurrence, index) => {
    const path = `composition.layoutOccurrences[${record.composition.layoutOccurrences.indexOf(occurrence)}]`
    validateNonnegativeTime(issues, `${path}.startMs`, occurrence.startMs)
    validatePositiveTime(issues, `${path}.durationMs`, occurrence.durationMs)
    if (!layouts.has(occurrence.layoutId)) {
      addIssue(issues, `${path}.layoutId`, 'missing-reference', `Zone Layout "${occurrence.layoutId}" does not exist.`)
    }
    if (occurrence.startMs !== cursorMs) {
      addIssue(issues, 'composition.layoutOccurrences', 'invalid-layout-coverage', 'Layout occurrences must cover Show time exactly once.')
    }
    cursorMs = safeAdd(occurrence.startMs, occurrence.durationMs)
    if (occurrence.incomingTransfer) {
      if (index === 0 || !occurrences.has(occurrence.incomingTransfer.fromOccurrenceId) || ordered[index - 1].id !== occurrence.incomingTransfer.fromOccurrenceId) {
        addIssue(issues, `${path}.incomingTransfer.fromOccurrenceId`, 'missing-reference', 'Incoming transfer must reference a preceding occurrence.')
      }
      validatePositiveTime(issues, `${path}.incomingTransfer.durationMs`, occurrence.incomingTransfer.durationMs)
      if (index > 0 && (occurrence.incomingTransfer.durationMs > ordered[index - 1].durationMs
        || occurrence.incomingTransfer.durationMs > occurrence.durationMs
        || safeAdd(occurrence.startMs, occurrence.incomingTransfer.durationMs) > record.composition.showEndMs)) {
        addIssue(issues, `${path}.incomingTransfer.durationMs`, 'out-of-bounds', 'Incoming transfer must fit both adjacent Layout occurrences and Show End.')
      }
    }
    if (occurrence.incomingSwitch) {
      const owner = occurrence.incomingSwitch
      if (occurrence.incomingTransfer) {
        addIssue(issues, `${path}.incomingSwitch`, 'invalid-layout-coverage', 'A zero-duration switch cannot also own a timed transfer.')
      }
      if (index === 0 || !occurrences.has(owner.fromOccurrenceId) || ordered[index - 1].id !== owner.fromOccurrenceId) {
        addIssue(issues, `${path}.incomingSwitch.fromOccurrenceId`, 'missing-reference', 'Incoming switch must reference a preceding occurrence.')
      }
      if (owner.id.trim().length === 0) {
        addIssue(issues, `${path}.incomingSwitch.id`, 'missing-reference', 'Identity must contain a non-whitespace character.')
      }
    }
    for (const [field, id] of [
      ['incomingTransfer', occurrence.incomingTransfer?.id],
      ['incomingSwitch', occurrence.incomingSwitch?.id],
    ] as const) {
      if (id === undefined) continue
      if (routingIds.has(id)) addIssue(issues, `${path}.${field}.id`, 'duplicate-id', `Routing identity "${id}" is used more than once.`)
      routingIds.add(id)
    }
  })
  if (cursorMs !== record.composition.showEndMs) {
    addIssue(issues, 'composition.layoutOccurrences', 'invalid-layout-coverage', 'Layout occurrences must end exactly at Show End.')
  }
}

interface PropertyValidationContext {
  instances: Map<string, ShowPatternInstance>
  clips: Map<string, ShowClipV2>
  occurrences: Map<string, ShowLayoutOccurrenceV2>
  showEndMs: number
}

function validatePropertyTrack(
  issues: ShowCompositionV2ValidationIssue[],
  path: string,
  track: ShowPropertyTrackV2,
  context: PropertyValidationContext,
): void {
  validateNonnegativeTime(issues, `${path}.activeStartMs`, track.activeStartMs)
  validatePositiveTime(issues, `${path}.activeDurationMs`, track.activeDurationMs)
  const activeEndMs = safeAdd(track.activeStartMs, track.activeDurationMs)
  if (activeEndMs > context.showEndMs) {
    addIssue(issues, `${path}.activeDurationMs`, 'out-of-bounds', 'Property activation must stay inside Show End.')
  }
  if (track.keyframes.length < 2) {
    addIssue(issues, `${path}.keyframes`, 'out-of-bounds', 'A property track requires at least two keyframes.')
  }
  let previous = -1
  track.keyframes.forEach((keyframe, index) => {
    validateNonnegativeTime(issues, `${path}.keyframes[${index}].timeMs`, keyframe.timeMs)
    if (keyframe.timeMs <= previous || keyframe.timeMs < track.activeStartMs || keyframe.timeMs > activeEndMs) {
      addIssue(issues, `${path}.keyframes[${index}].timeMs`, 'out-of-bounds', 'Keyframe times must be ordered inside the active interval.')
    }
    if (!Number.isFinite(keyframe.value)) {
      addIssue(issues, `${path}.keyframes[${index}].value`, 'not-finite', 'Keyframe value must be finite.')
    }
    if (!validateShowEasing(keyframe.easing).valid) {
      addIssue(issues, `${path}.keyframes[${index}].easing`, 'out-of-bounds', 'Keyframe easing must be valid.')
    }
    if (keyframe.curveSegment) {
      const segment = keyframe.curveSegment
      const retainedDurationMs = track.keyframes[index + 1]?.timeMs - keyframe.timeMs
      if (index === track.keyframes.length - 1) {
        addIssue(issues, `${path}.keyframes[${index}].curveSegment`, 'out-of-bounds', 'The last keyframe cannot own an outgoing curve segment.')
      }
      if (!Number.isFinite(segment.baseValue) || !Number.isFinite(segment.deltaValue)) {
        addIssue(issues, `${path}.keyframes[${index}].curveSegment`, 'not-finite', 'Curve coefficients must be finite.')
      }
      validatePositiveTime(issues, `${path}.keyframes[${index}].curveSegment.sourceDurationMs`, segment.sourceDurationMs)
      validateNonnegativeTime(issues, `${path}.keyframes[${index}].curveSegment.elapsedOffsetMs`, segment.elapsedOffsetMs)
      if (!validateShowEasing(segment.easing).valid) {
        addIssue(issues, `${path}.keyframes[${index}].curveSegment.easing`, 'out-of-bounds', 'Retained curve easing must be valid.')
      }
      if (Number.isSafeInteger(retainedDurationMs) && segment.elapsedOffsetMs + retainedDurationMs > segment.sourceDurationMs) {
        addIssue(issues, `${path}.keyframes[${index}].curveSegment`, 'out-of-bounds', 'Retained curve interval must stay inside its source duration.')
      }
    }
    previous = keyframe.timeMs
  })
  validatePropertyTarget(issues, `${path}.target`, track, context)
}

function validatePropertyTarget(
  issues: ShowCompositionV2ValidationIssue[],
  path: string,
  track: ShowPropertyTrackV2,
  context: PropertyValidationContext,
): void {
  const target = track.target
  const activeEndMs = safeAdd(track.activeStartMs, track.activeDurationMs)
  if (target.kind === 'show-repeat-scale') return
  if (target.kind === 'layout-occurrence-split-position') {
    const occurrence = context.occurrences.get(target.layoutOccurrenceId)
    if (!occurrence) {
      addIssue(issues, path, 'invalid-property-target', 'Property target Layout occurrence does not exist.')
    } else if (track.activeStartMs < occurrence.startMs
      || activeEndMs > safeAdd(occurrence.startMs, occurrence.durationMs)) {
      addIssue(issues, path, 'out-of-bounds', 'Layout property activation must remain inside its owning occurrence.')
    }
    return
  }
  if (target.kind === 'instance-time-scale' || target.kind === 'instance-control') {
    if (!context.instances.has(target.instanceId)) {
      addIssue(issues, path, 'invalid-property-target', 'Property target Pattern instance does not exist.')
    }
    return
  }
  const clip = context.clips.get(target.clipId)
  if (!clip) {
    addIssue(issues, path, 'invalid-property-target', 'Property target Clip does not exist.')
  } else if (target.kind === 'clip-effect') {
    const everyAppearanceOwnsEffect = clip.appearance.keys.every((key, index) => {
      const keyEndMs = clip.appearance.keys[index + 1]?.timeMs ?? clip.startMs + clip.durationMs
      if (key.timeMs >= activeEndMs || keyEndMs <= track.activeStartMs) return true
      return (key.value.effects ?? []).some(effect => effect.id === target.effectId && effect.kind === target.effectKind)
    })
    if (!everyAppearanceOwnsEffect) {
      addIssue(issues, path, 'invalid-property-target', 'Property target Effect identity does not match its Clip.')
    }
  }
}

function validateGroups(
  issues: ShowCompositionV2ValidationIssue[],
  record: ShowRecordV2,
  context: {
    layers: Map<string, ShowLayerV2>
    occurrences: Map<string, ShowLayoutOccurrenceV2>
    routingLayouts: Map<string, ShowRoutingLayout>
    definitions: Map<string, ShowGroupDefinitionV2>
  },
  derivedStructuralIssues: (value: unknown) => ShowCompositionV2ValidationIssue[],
): void {
  record.composition.groupDefinitions.forEach((definition, definitionIndex) => {
    const path = `composition.groupDefinitions[${definitionIndex}]`
    const layers = uniqueIndex(issues, `${path}.layers`, definition.layers)
    const instances = uniqueIndex(issues, `${path}.patternInstances`, definition.patternInstances)
    uniqueIndex(issues, `${path}.clips`, definition.clips)
    const ranks = new Set<number>()
    definition.layers.forEach((layer, index) => {
      validateNonnegativeTime(issues, `${path}.layers[${index}].rank`, layer.rank)
      if (ranks.has(layer.rank)) addIssue(issues, `${path}.layers[${index}].rank`, 'duplicate-id', 'Group Layer rank is duplicated.')
      ranks.add(layer.rank)
    })
    if (definition.propertyTracks.some(track => track.target.kind === 'layout-occurrence-split-position' || track.target.kind === 'show-repeat-scale')) addIssue(issues, path, 'invalid-group-binding', 'Group tracks must target definition-local Clips or instances.')
    for (const issue of validateDerivedShowRecordV2(groupDefinitionAsRecord(record, definition), derivedStructuralIssues)) {
      addIssue(issues, `${path}.${issue.path}`, issue.code, issue.message)
    }
    definition.clips.forEach((clip, index) => {
      const clipPath = `${path}.clips[${index}]`
      if (!layers.has(clip.layerId)) addIssue(issues, `${clipPath}.layerId`, 'missing-reference', 'Group Clip Layer does not exist.')
      if (!instances.has(clip.instanceId)) addIssue(issues, `${clipPath}.instanceId`, 'missing-reference', 'Group Clip instance does not exist.')
      validateNonnegativeTime(issues, `${clipPath}.startMs`, clip.startMs)
      validatePositiveTime(issues, `${clipPath}.durationMs`, clip.durationMs)
    })
  })

  record.composition.groupOccurrences.forEach((occurrence, occurrenceIndex) => {
    const path = `composition.groupOccurrences[${occurrenceIndex}]`
    const definition = context.definitions.get(occurrence.definitionId)
    if (!definition) addIssue(issues, `${path}.definitionId`, 'missing-reference', 'Group definition does not exist.')
    if (!context.occurrences.has(occurrence.layoutOccurrenceId)) {
      addIssue(issues, `${path}.layoutOccurrenceId`, 'missing-reference', 'Layout occurrence does not exist.')
    }
    if (definition) {
      const definitionDurationMs = groupDuration(definition)
      let previousHoldTimeMs = -1
      occurrence.holds.forEach((hold, holdIndex) => {
        const holdPath = `${path}.holds[${holdIndex}]`
        validateNonnegativeTime(issues, `${holdPath}.localTimeMs`, hold.localTimeMs)
        validatePositiveTime(issues, `${holdPath}.durationMs`, hold.durationMs)
        if (hold.localTimeMs <= 0 || hold.localTimeMs >= definitionDurationMs) {
          addIssue(issues, `${holdPath}.localTimeMs`, 'out-of-bounds', 'Group hold time must be strictly inside the definition duration.')
        }
        if (hold.localTimeMs <= previousHoldTimeMs) {
          addIssue(issues, `${holdPath}.localTimeMs`, 'out-of-bounds', 'Group holds must be ordered by strictly increasing local time.')
        }
        previousHoldTimeMs = hold.localTimeMs
      })
      const durationMs = groupOccurrenceDuration(definition, occurrence)
      if (!Number.isSafeInteger(durationMs)) {
        addIssue(issues, `${path}.holds`, 'out-of-bounds', 'Group occurrence duration must be a safe integer.')
      }
      const endMs = safeAdd(occurrence.startMs, durationMs)
      const layout = context.occurrences.get(occurrence.layoutOccurrenceId)
      if (!layout
        || occurrence.startMs < layout.startMs
        || occurrence.startMs >= safeAdd(layout.startMs, layout.durationMs)) {
        addIssue(issues, `${path}.layoutOccurrenceId`, 'out-of-bounds', 'Group occurrence Layout association must own its start time.')
      }
      if (endMs > record.composition.showEndMs) {
        addIssue(issues, path, 'out-of-bounds', 'Group occurrence must end within Show End.')
      }
      for (const intersected of record.composition.layoutOccurrences) {
        if (occurrence.startMs >= safeAdd(intersected.startMs, intersected.durationMs)
          || endMs <= intersected.startMs) continue
        const routing = context.routingLayouts.get(intersected.layoutId)
        const zoneIds = routing?.logical?.zoneIds ?? (routing?.zones.length
          ? routing.zones.map(zone => zone.zoneId)
          : record.zones.map(zone => zone.id))
        if (!zoneIds.includes(occurrence.zoneId)) {
          addIssue(issues, path, 'out-of-bounds', `Group occurrence Zone is unavailable in Layout occurrence "${intersected.id}".`)
        }
      }
      if (Object.keys(occurrence.instanceBindings ?? {}).some(id => !definition.patternInstances.some(instance => instance.id === id))) addIssue(issues, path, 'missing-reference', 'Group runtime binding must name a definition instance.')
      if (occurrence.trackActivation && (occurrence.trackActivation.startMs > occurrence.startMs || occurrence.trackActivation.startMs + occurrence.trackActivation.durationMs < endMs || occurrence.trackActivation.startMs + occurrence.trackActivation.durationMs > record.composition.showEndMs)) addIssue(issues, path, 'out-of-bounds', 'Group track activation must cover the occurrence inside Show End.')
    }
    const boundDefinitionLayers = new Set<string>()
    occurrence.layerBindings.forEach((binding, bindingIndex) => {
      const bindingPath = `${path}.layerBindings[${bindingIndex}]`
      if (!definition?.layers.some(layer => layer.id === binding.definitionLayerId)) {
        addIssue(issues, `${bindingPath}.definitionLayerId`, 'invalid-group-binding', 'Bound Group Layer does not exist.')
      }
      const destination = context.layers.get(binding.layerId)
      if (!destination || destination.zoneId !== occurrence.zoneId) {
        addIssue(issues, `${bindingPath}.layerId`, 'invalid-group-binding', 'Destination Layer must exist in the occurrence Zone.')
      }
      if (boundDefinitionLayers.has(binding.definitionLayerId)) {
        addIssue(issues, bindingPath, 'invalid-group-binding', 'A Group Layer may be bound only once.')
      }
      boundDefinitionLayers.add(binding.definitionLayerId)
    })
    if (definition && definition.layers.some(layer => !boundDefinitionLayers.has(layer.id))) {
      addIssue(issues, `${path}.layerBindings`, 'invalid-group-binding', 'Every Group Layer requires an explicit binding.')
    }
  })
  if (issues.length === 0 && record.composition.groupOccurrences.length > 0) {
    try {
      for (const issue of validateDerivedShowRecordV2(materializeShowGroupsV2(record), derivedStructuralIssues)) addIssue(issues, `materialized.${issue.path}`, issue.code, issue.message)
    } catch (error) {
      addIssue(issues, 'composition.groupOccurrences', 'invalid-group-binding', error instanceof Error ? error.message : String(error))
    }
  }
}

function desktopStructuralIssuesV2(value: unknown): ShowCompositionV2ValidationIssue[] {
  return structuralIssues(v2StructuralValidator(), value)
}

function validateDerivedShowRecordV2(record: ShowRecordV2, structural: (value: unknown) => ShowCompositionV2ValidationIssue[]): ShowCompositionV2ValidationIssue[] {
  const issues = structural(record)
  return issues.length > 0 ? issues : validateShowRecordV2Domain(record, structural)
}
