import type { ShowCrossfadePolicy, ShowTransitionKind } from './personalContentRecords'
import { repeatScaleAt } from './showV2ScalarProperties'
import { showTransitionChangesForPresentation } from './showTransitionAuthoring'
import { buildShowToolkitPresentationCatalogue } from './showVisualToolkitPresentation'
import type { ShowRecordV2, ShowTransitionV2 } from './showCompositionV2'
import type { ShowTransitionRampProjectionV2 } from './showPropertyAnimationV2'
import { projectShowTransitionJunctionsV2, transitionEndpoints, type ShowTransitionCarrierRampProjectionPlanV2, type ShowTransitionEditIntentV2 } from './showTransitionsV2'

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
  | { kind: 'reset'; transitionId: string }

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
    key: `participant:${junction.atMs}:${junction.zoneId}:${junction.layerId}:${junction.fromClipId}:${junction.toClipId}`,
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
  if (request.kind === 'reset') {
    const transition = record.composition.transitions.find(candidate => candidate.id === request.transitionId)
    if (!transition) return { status: 'refused', message: 'Select an existing Transition.' }
    if (transition.propertyRamps.length === 0) {
      return { status: 'ready', intent: { kind: 'reset-to-cut', transitionId: transition.id } }
    }
    const projections = planShowV2TransitionRampProjections(record, transition, allocate)
    if (projections.status === 'refused') return projections
    return { status: 'ready', intent: { kind: 'reset-to-cut', transitionId: transition.id, propertyRampProjections: projections.projections } }
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
 * Derive one projection per surviving boundary ramp. Only the global scalar
 * carriers that conversion produces and lowering accepts are planned here;
 * any other target refuses so no value is invented for the consumer.
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
  const plans: ShowTransitionCarrierRampProjectionPlanV2[] = []
  for (const transition of record.composition.transitions) {
    if (transition.propertyRamps.length === 0 || !transitionEndpoints(transition).all.includes(clipId)) continue
    const projections = planShowV2TransitionRampProjections(record, transition, allocate)
    if (projections.status === 'refused') return projections
    plans.push({ transitionId: transition.id, projections: projections.projections })
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
  const { durationMs: _durationMs, ...changes } = showTransitionChangesForPresentation(item)
  if (changes.kind === undefined || changes.kind === 'cut' || changes.kind === 'routing') {
    return { status: 'refused', message: 'Cut is the absence of a Transition; choose a visual kind.' }
  }
  return { status: 'ready', value: structuredClone(changes) as KindSettings }
}
