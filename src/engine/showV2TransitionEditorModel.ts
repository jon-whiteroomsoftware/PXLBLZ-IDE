import type { ShowBoundaryTransition, ShowCrossfadePolicy, ShowTransitionKind } from './personalContentRecords'
import { repeatScaleAt } from './showV2ScalarProperties'
import { normalizeShowBoundaryTransition } from './showModel'
import { showBoundaryTransitionParameterChanges, showTransitionChangesForPresentation, type ShowTransitionChanges } from './showTransitionAuthoring'
import type { ShowToolkitParameterValue } from './showVisualToolkit'
import { buildShowToolkitPresentationCatalogue } from './showVisualToolkitPresentation'
import { isShowTransitionClipValueRampV2, showV2LogicalClipSegmentIds, type ShowRecordV2, type ShowTransitionV2 } from './showCompositionV2'
import type { ShowTransitionRampProjectionV2 } from './showPropertyAnimationV2'
import { isShowScalarRampTargetV2, projectShowTransitionJunctionsV2, transitionEndpoints, type ShowTransitionCarrierRampProjectionPlanV2, type ShowTransitionEditIntentV2 } from './showTransitionsV2'

export type ShowV2TransitionEditorIntent = Extract<ShowTransitionEditIntentV2, { kind: 'insert' | 'update-transition' | 'reset-to-cut' }>

export interface ShowV2TransitionKindOption {
  key: string
  label: string
  familyLabel: string
  compatible: boolean
}

export interface ShowV2TransitionJunctionOption {
  key: string
  label: string
  scope: 'participant' | 'whole-output'
  atMs: number
  fromClipIds: string[]
  toClipIds: string[]
  zoneId: string | null
  layerId: string | null
}

export interface ShowV2TransitionOption {
  id: string
  label: string
  kindKey: string
  kind: Exclude<ShowTransitionKind, 'cut'>
  scope: 'participant' | 'whole-output'
  startMs: number
  durationMs: number
  crossfadePolicy: ShowCrossfadePolicy
  carriesPropertyRamps: boolean
}

export interface ShowV2TransitionEditorModel {
  junctions: ShowV2TransitionJunctionOption[]
  transitions: ShowV2TransitionOption[]
  kinds: ShowV2TransitionKindOption[]
}

export type ShowV2TransitionEditorRequest =
  | { kind: 'insert'; junctionKey: string; kindKey: string; durationMs: number; crossfadePolicy: ShowCrossfadePolicy }
  | { kind: 'settings'; transitionId: string; kindKey: string; crossfadePolicy: ShowCrossfadePolicy }
  | { kind: 'parameter'; transitionId: string; parameterId: string; value: ShowToolkitParameterValue }
  | { kind: 'reset'; transitionId: string }

/**
 * The key a derived Cut junction is addressed by. A Cut is the absence of a
 * Transition at exact adjacency, so the key carries the boundary time and the
 * two Clip identities rather than any persisted owner.
 */
export function showV2TransitionJunctionKey(cut: {
  atMs: number
  zoneId: string
  layerId: string
  fromClipId: string
  toClipId: string
}): string {
  return `participant:${cut.atMs}:${cut.zoneId}:${cut.layerId}:${cut.fromClipId}:${cut.toClipId}`
}

export type ShowV2TransitionEditorPlan =
  | { status: 'ready'; intent: ShowV2TransitionEditorIntent }
  | { status: 'refused'; message: string }

const DEFAULT_CROSSFADE_POLICY: ShowCrossfadePolicy = 'live-live'

/** Derived selectable boundaries and existing Transitions; nothing here mints persisted identity. */
export function buildShowV2TransitionEditorModel(
  record: ShowRecordV2,
  stageDimensions: 1 | 2 | 3,
): ShowV2TransitionEditorModel {
  const kinds = buildShowToolkitPresentationCatalogue({ stageDimensions })
    .filter(item => item.kind === 'transition' && item.variantId !== 'cut')
    .map(item => ({ key: item.key, label: item.label, familyLabel: item.familyLabel, compatible: item.compatible }))
  const clips = record.composition.clips
  const junctions: ShowV2TransitionJunctionOption[] = projectShowTransitionJunctionsV2(record).map(junction => ({
    key: showV2TransitionJunctionKey(junction),
    label: `${junction.atMs} ms · ${junction.zoneId} · ${junction.layerId}`,
    scope: 'participant' as const,
    atMs: junction.atMs,
    fromClipIds: [junction.fromClipId],
    toClipIds: [junction.toClipId],
    zoneId: junction.zoneId,
    layerId: junction.layerId,
  }))
  for (const atMs of [...new Set(clips.map(clip => clip.startMs))].sort((left, right) => left - right)) {
    const fromClipIds = clips.filter(clip => clip.startMs + clip.durationMs === atMs).map(clip => clip.id).sort()
    const toClipIds = clips.filter(clip => clip.startMs === atMs).map(clip => clip.id).sort()
    const spanning = clips.some(clip => clip.startMs < atMs && clip.startMs + clip.durationMs > atMs)
    if (spanning || fromClipIds.length === 0 || toClipIds.length === 0) continue
    junctions.push({
      key: `whole-output:${atMs}`,
      label: `${atMs} ms · whole output · ${fromClipIds.length} to ${toClipIds.length}`,
      scope: 'whole-output',
      atMs,
      fromClipIds,
      toClipIds,
      zoneId: null,
      layerId: null,
    })
  }
  const transitions = record.composition.transitions.map(transition => {
    const startMs = transitionStartMs(record, transition)
    return {
      id: transition.id,
      label: `${transition.kind} · ${startMs ?? '—'}–${startMs === null ? '—' : startMs + transition.durationMs} ms · ${transition.id}`,
      kindKey: transitionKindKey(transition),
      kind: transition.kind,
      scope: transition.wholeOutput ? 'whole-output' as const : 'participant' as const,
      startMs: startMs ?? 0,
      durationMs: transition.durationMs,
      crossfadePolicy: transition.crossfadePolicy ?? DEFAULT_CROSSFADE_POLICY,
      carriesPropertyRamps: transition.propertyRamps.length > 0,
    }
  }).sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  return { junctions: junctions.sort((left, right) => left.atMs - right.atMs || left.key.localeCompare(right.key)), transitions, kinds }
}

/** Remove a boundary or reset to Cut, projecting surviving ramps first. */
export function planShowV2TransitionReset(
  record: ShowRecordV2,
  transitionId: string,
  allocate: () => string,
): ShowV2TransitionEditorPlan {
  const transition = record.composition.transitions.find(candidate => candidate.id === transitionId)
  if (!transition) return { status: 'refused', message: 'Select an existing Transition.' }
  if (transition.propertyRamps.length === 0) {
    return { status: 'ready', intent: { kind: 'reset-to-cut', transitionId: transition.id } }
  }
  const projections = planShowV2TransitionRampProjections(record, transition, allocate)
  if (projections.status === 'refused') return projections
  return { status: 'ready', intent: { kind: 'reset-to-cut', transitionId: transition.id, ...(projections.projections.length > 0 ? { propertyRampProjections: projections.projections } : {}) } }
}

/**
 * Apply one palette choice to a boundary Transition (#1066 slice 5b). v1 runs
 * the choice through its boundary normalizer, which rebuilds the Transition
 * for its kind; the same normalizer runs here and the v2-only fields are
 * reattached. A Cut choice is Reset to Cut.
 */
export function planShowV2BoundaryPaletteApply(
  record: ShowRecordV2,
  transitionId: string,
  changes: ShowTransitionChanges,
  allocate: () => string,
): ShowV2TransitionEditorPlan {
  if (changes.kind === 'cut') return planShowV2TransitionReset(record, transitionId, allocate)
  const current = record.composition.transitions.find(candidate => candidate.id === transitionId)
  if (!current) return { status: 'refused', message: 'Select an existing Transition.' }
  const { participants, wholeOutput, propertyRamps, origin, ...settings } = current
  const normalized = normalizeShowBoundaryTransition({ ...settings, ...changes, id: current.id, afterSceneId: 'boundary' } as ShowBoundaryTransition)
  if (normalized.kind === 'cut') return planShowV2TransitionReset(record, transitionId, allocate)
  const { afterSceneId: _afterSceneId, propertyTransitions: _propertyTransitions, layoutId: _layoutId, routingDirection: _routingDirection, ...fields } = normalized
  const next = {
    ...fields,
    participants,
    ...(wholeOutput ? { wholeOutput } : {}),
    propertyRamps,
    ...(origin ? { origin } : {}),
  } as unknown as ShowTransitionV2
  return { status: 'ready', intent: { kind: 'update-transition', transition: next } }
}

/**
 * Translate one explicit editor request into a typed Transition intent. Identity
 * is allocated here by the caller's generator, never inside the pure owner.
 */
export function planShowV2TransitionEdit(
  record: ShowRecordV2,
  request: ShowV2TransitionEditorRequest,
  allocate: () => string,
  stageDimensions: 1 | 2 | 3,
): ShowV2TransitionEditorPlan {
  if (request.kind === 'reset') return planShowV2TransitionReset(record, request.transitionId, allocate)

  if (request.kind === 'parameter') {
    const current = record.composition.transitions.find(candidate => candidate.id === request.transitionId)
    if (!current) return { status: 'refused', message: 'Select an existing Transition.' }
    // Duration belongs to the resize owner, which applies its delta once to the
    // incoming and downstream affected set. A settings edit never moves a Clip.
    if (request.parameterId === 'durationMs') {
      return { status: 'refused', message: 'Change a Transition duration with the duration control, which moves the downstream Clips once.' }
    }
    const item = buildShowToolkitPresentationCatalogue({ stageDimensions })
      .find(candidate => candidate.kind === 'transition' && candidate.key === transitionKindKey(current))
    if (!item) return { status: 'refused', message: 'This Transition kind is unavailable on this Stage.' }
    const changes = showBoundaryTransitionParameterChanges(current, item, request.parameterId, request.value, stageDimensions)
    if (!changes) return { status: 'refused', message: `"${request.parameterId}" is not a parameter of this Transition.` }
    return {
      status: 'ready',
      intent: { kind: 'update-transition', transition: { ...structuredClone(current), ...changes } as ShowTransitionV2 },
    }
  }

  const settings = kindSettings(request.kindKey, stageDimensions)
  if (settings.status === 'refused') return settings

  if (request.kind === 'settings') {
    const current = record.composition.transitions.find(candidate => candidate.id === request.transitionId)
    if (!current) return { status: 'refused', message: 'Select an existing Transition.' }
    return {
      status: 'ready',
      intent: {
        kind: 'update-transition',
        transition: {
          ...settings.value,
          ...(settings.value.kind === 'crossfade' ? { crossfadePolicy: request.crossfadePolicy } : {}),
          id: current.id,
          durationMs: current.durationMs,
          // A kind change leaves identity, timing, endpoints and the v1 family
          // this Transition converted from untouched. Only the converter writes
          // that provenance, and the owner refuses a settings edit that changes
          // or clears it, so the plan carries it through (#1065).
          ...(current.origin === undefined ? {} : { origin: current.origin }),
          easing: settings.value.easing ?? structuredClone(current.easing),
          participants: structuredClone(current.participants),
          ...(current.wholeOutput ? { wholeOutput: structuredClone(current.wholeOutput) } : {}),
          propertyRamps: structuredClone(current.propertyRamps),
        },
      },
    }
  }

  const junction = buildShowV2TransitionEditorModel(record, stageDimensions).junctions.find(candidate => candidate.key === request.junctionKey)
  if (!junction) return { status: 'refused', message: 'Select an existing Cut junction.' }
  if (!Number.isSafeInteger(request.durationMs) || request.durationMs <= 0) {
    return { status: 'refused', message: 'A Transition requires a positive whole-millisecond duration.' }
  }
  const id = allocate()
  if (typeof id !== 'string' || !id.trim() || record.composition.transitions.some(transition => transition.id === id)) {
    return { status: 'refused', message: 'Fresh Transition identity conflicts. Try the edit again.' }
  }
  const participants = junction.scope === 'participant'
    ? [{
        id: `${id}:participant:1`,
        zoneId: junction.zoneId!,
        layerId: junction.layerId!,
        fromClipId: junction.fromClipIds[0],
        toClipId: junction.toClipIds[0],
      }]
    : []
  return {
    status: 'ready',
    intent: {
      kind: 'insert',
      transition: {
        ...settings.value,
        ...(settings.value.kind === 'crossfade' ? { crossfadePolicy: request.crossfadePolicy } : {}),
        id,
        durationMs: request.durationMs,
        easing: settings.value.easing ?? { curve: 'linear' },
        participants,
        ...(junction.scope === 'whole-output'
          ? { wholeOutput: { startMs: junction.atMs, fromClipIds: [...junction.fromClipIds], toClipIds: [...junction.toClipIds] } }
          : {}),
        propertyRamps: [],
      },
    },
  }
}

/**
 * Plan one boundary Transition settings edit from v1-shaped changes (#1066
 * slice 5a). The settings surface owns everything the `update-transition`
 * owner accepts except identity, timing, endpoints, Clip-owned ramps and
 * provenance, so the palette (`kind`), resize (`durationMs`) and Layout
 * surfaces (`layoutId`, `routingDirection`) refuse here before any owner.
 *
 * `propertyTransitions` maps the scalar sections and incoming Clip value rows
 * onto their Transition ramps: `sample.repeatScale` to a `show-repeat-scale` ramp
 * and `routing.splitPosition` to a `layout-occurrence-split-position` ramp on
 * the occurrence covering the boundary end, descriptor fields verbatim, repeat
 * before split, after every other ramp. `undefined` removes those ramps.
 */
export type ShowV2BoundaryChangesPlan =
  | { status: 'ready'; intent: Extract<ShowTransitionEditIntentV2, { kind: 'update-transition' }> }
  | { status: 'no-op' }
  | { status: 'refused'; code: 'missing-transition' | 'unsupported-field'; message: string }

const BOUNDARY_SETTINGS_REFUSED_FIELDS = ['kind', 'durationMs', 'layoutId', 'routingDirection'] as const

export function planShowV2BoundaryTransitionChanges(
  record: ShowRecordV2,
  transitionId: string,
  changes: ShowTransitionChanges,
): ShowV2BoundaryChangesPlan {
  const current = record.composition.transitions.find(candidate => candidate.id === transitionId)
  if (!current) return { status: 'refused', code: 'missing-transition', message: `Transition "${transitionId}" does not exist.` }
  for (const key of BOUNDARY_SETTINGS_REFUSED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) {
      return { status: 'refused', code: 'unsupported-field', message: `"${key}" is not edited through the boundary settings surface.` }
    }
  }
  const { propertyTransitions, ...settings } = changes
  const next = structuredClone(current) as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete next[key]
    else next[key] = structuredClone(value)
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'propertyTransitions')) {
    const unsupported = Object.keys(propertyTransitions ?? {}).filter(key => key !== 'sample' && key !== 'routing' && key !== 'timeScale' && key !== 'brightness')
      .concat(Object.keys(propertyTransitions?.sample ?? {}).filter(key => key !== 'repeatScale').map(key => `sample.${key}`))
      .concat(Object.keys(propertyTransitions?.routing ?? {}).filter(key => key !== 'splitPosition').map(key => `routing.${key}`))
    if (unsupported.length > 0) {
      return { status: 'refused', code: 'unsupported-field', message: `"propertyTransitions.${unsupported[0]}" is not edited through the boundary settings surface.` }
    }
    const editsClipValueRamp = propertyTransitions?.timeScale !== undefined
      || propertyTransitions?.brightness !== undefined
      || current.propertyRamps.some(isShowTransitionClipValueRampV2)
    if (editsClipValueRamp && (current.wholeOutput !== undefined || current.participants.length !== 1)) {
      return { status: 'refused', code: 'unsupported-field', message: 'Animation speed and Brightness ramps require one Transition participant.' }
    }
    // Normalize scalar and Clip value rows with v1; omit inherited Clip value fields.
    const { participants: _participants, wholeOutput: _wholeOutput, propertyRamps: _ramps, origin: _origin, ...currentSettings } = current
    const normalized = propertyTransitions
      ? normalizeShowBoundaryTransition({ ...currentSettings, id: current.id, afterSceneId: 'boundary', propertyTransitions } as ShowBoundaryTransition).propertyTransitions
      : undefined
    const repeatScale = normalized?.sample?.repeatScale
    const splitPosition = normalized?.routing?.splitPosition
    const participant = current.participants[0]
    const destination = participant && record.composition.clips.find(clip => clip.id === participant.toClipId)
    if (editsClipValueRamp && !destination) {
      return { status: 'refused', code: 'unsupported-field', message: 'The incoming Clip for this Transition participant is missing.' }
    }
    const clipValueRamp = (property: 'timeScale' | 'brightness') => {
      const raw = propertyTransitions?.[property]
      const descriptor = normalized?.[property]
      const from = destination && descriptor?.fromByCellId[destination.id]
      if (from === undefined || !destination || !descriptor) return []
      return [{
        participantId: participant.id,
        target: property === 'timeScale'
          ? { kind: 'instance-time-scale' as const, instanceId: destination.instanceId }
          : { kind: 'clip-view' as const, clipId: destination.id, property: 'brightness' as const },
        from,
        ...(raw?.durationMs !== undefined && descriptor.durationMs !== current.durationMs
          ? { durationMs: descriptor.durationMs } : {}),
        ...(raw?.easing !== undefined && JSON.stringify(descriptor.easing) !== JSON.stringify(current.easing)
          ? { easing: structuredClone(descriptor.easing) } : {}),
      }]
    }
    const boundaryEndMs = (current.wholeOutput?.startMs ?? transitionStartMs(record, current) ?? 0) + current.durationMs
    const incoming = record.composition.layoutOccurrences.find(occurrence => (
      occurrence.startMs <= boundaryEndMs && occurrence.startMs + occurrence.durationMs > boundaryEndMs
    ))
    if (splitPosition && !incoming) {
      return { status: 'refused', code: 'unsupported-field', message: 'No Layout occurrence covers the end of this boundary, so its split position cannot animate.' }
    }
    const replacedClipValues = new Set<'timeScale' | 'brightness'>()
    const retainedRamps = current.propertyRamps.filter(ramp => !isShowScalarRampTargetV2(ramp.target)).flatMap(ramp => {
      if (!isShowTransitionClipValueRampV2(ramp)) return [structuredClone(ramp)]
      const property = ramp.target.kind === 'instance-time-scale' ? 'timeScale' : 'brightness'
      if (replacedClipValues.has(property)) return []
      replacedClipValues.add(property)
      return clipValueRamp(property)
    })
    next.propertyRamps = [
      ...retainedRamps,
      ...(repeatScale ? [{ target: { kind: 'show-repeat-scale' as const }, ...structuredClone(repeatScale) }] : []),
      ...(splitPosition ? [{ target: { kind: 'layout-occurrence-split-position' as const, layoutOccurrenceId: incoming!.id }, ...structuredClone(splitPosition) }] : []),
      ...(!replacedClipValues.has('timeScale') ? clipValueRamp('timeScale') : []),
      ...(!replacedClipValues.has('brightness') ? clipValueRamp('brightness') : []),
    ]
  }
  if (JSON.stringify(next) === JSON.stringify(current)) return { status: 'no-op' }
  return { status: 'ready', intent: { kind: 'update-transition', transition: next as unknown as ShowTransitionV2 } }
}

/**
 * Derive one projection per surviving boundary ramp. Incoming Clip value ramps
 * leave with their carrier. Other non-scalar targets still refuse.
 */
export function planShowV2TransitionRampProjections(
  record: ShowRecordV2,
  transition: ShowTransitionV2,
  allocate: () => string,
): { status: 'ready'; projections: ShowTransitionRampProjectionV2[] } | { status: 'refused'; message: string } {
  const startMs = transitionStartMs(record, transition)
  if (startMs === null) return { status: 'refused', message: `Transition "${transition.id}" has no resolvable boundary time.` }
  const used = new Set([
    ...record.composition.propertyTracks.map(track => track.id),
    ...record.composition.propertyTracks.flatMap(track => track.keyframes.map(key => key.id)),
  ])
  const projections: ShowTransitionRampProjectionV2[] = []
  for (const [rampIndex, ramp] of transition.propertyRamps.entries()) {
    if (isShowTransitionClipValueRampV2(ramp)) continue
    const endMs = startMs + (ramp.durationMs ?? transition.durationMs)
    const toValue = ramp.target.kind === 'show-repeat-scale'
      ? repeatScaleAt(record, endMs)
      : ramp.target.kind === 'layout-occurrence-split-position'
        ? record.composition.layoutOccurrences.find(occurrence => occurrence.id === (ramp.target as { layoutOccurrenceId: string }).layoutOccurrenceId)?.parameters.splitPosition ?? 0.5
        : null
    if (toValue === null) {
      return { status: 'refused', message: `Transition "${transition.id}" carries a ${ramp.target.kind} ramp with no projected destination value.` }
    }
    const identities = [allocate(), allocate(), allocate()]
    if (identities.some(id => typeof id !== 'string' || !id.trim() || used.has(id)) || new Set(identities).size !== 3) {
      return { status: 'refused', message: 'Fresh Property track identity conflicts. Try the edit again.' }
    }
    identities.forEach(id => used.add(id))
    projections.push({
      rampIndex,
      trackId: identities[0],
      startKeyId: identities[1],
      endKeyId: identities[2],
      activeEndMs: endMs,
      toValue,
    })
  }
  return { status: 'ready', projections }
}

/**
 * Plan the projections one ordinary Clip deletion needs, so surviving boundary
 * ramps become independent tracks before their visual carrier leaves the record.
 */
export function planShowV2ClipDeleteRampProjections(
  record: ShowRecordV2,
  clipId: string,
  allocate: () => string,
): { status: 'ready'; plans: ShowTransitionCarrierRampProjectionPlanV2[] } | { status: 'refused'; message: string } {
  const targets = new Set(showV2LogicalClipSegmentIds(record.composition, clipId))
  const plans: ShowTransitionCarrierRampProjectionPlanV2[] = []
  for (const transition of record.composition.transitions) {
    if (transition.propertyRamps.length === 0 || !transitionEndpoints(transition).all.some((endpoint) => targets.has(endpoint))) continue
    const projections = planShowV2TransitionRampProjections(record, transition, allocate)
    if (projections.status === 'refused') return projections
    if (projections.projections.length > 0) plans.push({ transitionId: transition.id, projections: projections.projections })
  }
  return { status: 'ready', plans }
}

function transitionStartMs(record: ShowRecordV2, transition: ShowTransitionV2): number | null {
  if (transition.wholeOutput) return transition.wholeOutput.startMs
  const outgoing = record.composition.clips.find(clip => clip.id === transitionEndpoints(transition).from[0])
  return outgoing ? outgoing.startMs + outgoing.durationMs : null
}

function transitionKindKey(transition: ShowTransitionV2): string {
  if (transition.kind === 'fade-color') return 'transition:fade:through-color'
  if (transition.kind === 'wipe') return `transition:wipe:${transition.wipeVariant ?? 'linear'}`
  if (transition.kind === 'dither') return `transition:dissolve:${transition.dissolveVariant ?? 'pixel'}`
  if (transition.kind === 'portal') return `transition:shape-reveal:${transition.shape ?? 'circle'}`
  if (transition.kind === 'motion') return `transition:motion:${transition.motionVariant ?? 'cover'}`
  return 'transition:blend:crossfade'
}

type KindSettings = Omit<ShowTransitionV2, 'id' | 'durationMs' | 'participants' | 'wholeOutput' | 'propertyRamps'> & { easing?: ShowTransitionV2['easing'] }

function kindSettings(
  kindKey: string,
  stageDimensions: 1 | 2 | 3,
): { status: 'ready'; value: KindSettings } | { status: 'refused'; message: string } {
  const item = buildShowToolkitPresentationCatalogue({ stageDimensions })
    .find(candidate => candidate.kind === 'transition' && candidate.key === kindKey && candidate.variantId !== 'cut')
  if (!item) return { status: 'refused', message: 'Choose a Transition kind for this Stage.' }
  if (!item.compatible) return { status: 'refused', message: item.compatibilityReason ?? 'This Transition kind is unavailable on this Stage.' }
  const { durationMs: _durationMs, ...changes } = showTransitionChangesForPresentation(item, undefined, stageDimensions)
  if (changes.kind === undefined || changes.kind === 'cut' || changes.kind === 'routing') {
    return { status: 'refused', message: 'Cut is the absence of a Transition; choose a visual kind.' }
  }
  return { status: 'ready', value: structuredClone(changes) as KindSettings }
}
