import {
  showClipEffectParameterValue,
  showClipEffectParameters,
} from './showEffectAuthoring'
import type {
  ShowCompositionV1,
  ShowPropertyAnimationKeyframe,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
  ShowRecord,
} from './personalContentRecords'
import type { ShowClipInspectorValue } from './showClipInspectorModel'
import type { ShowGroupClipOwner } from './showGroupClipInspectorModel'
import { projectShowTimeline } from './showModel'
import {
  normalizeShowPropertyTracks,
  propertyTargetKey,
  validateShowPropertyTracks,
} from './showPropertyAnimation'
import { materializeShowGroupOccurrences, validateShowGroups } from './showGroupModel'

export type ShowPropertyAnimationValuePresentation = 'number' | 'percentage' | 'multiplier'

export interface ShowPropertyAnimationOption {
  key: string
  label: string
  target: ShowPropertyAnimationTarget
  value: number
  min: number
  max: number
  step: number
  presentation: ShowPropertyAnimationValuePresentation
}

export type ShowPropertyAnimationChange =
  | {
      kind: 'add-track'
      target: ShowPropertyAnimationTarget
      initialValue: number
      /** Omitted by the legacy picker; supplied by the per-parameter draft editor. */
      keyframes?: Array<Omit<ShowPropertyAnimationKeyframe, 'id'>>
    }
  | {
      kind: 'update-keyframe'
      trackId: string
      keyframeId: string
      changes: Partial<Pick<ShowPropertyAnimationKeyframe, 'timeMs' | 'value' | 'easing'>>
    }
  | { kind: 'delete-track'; trackId: string }

export type ShowPropertyAnimationStorageOwner =
  | { kind: 'scene'; sceneId: string }
  | { kind: 'group'; definitionId: string; occurrenceId: string }

export interface ShowPropertyAnimationEditorContext {
  storageOwner: ShowPropertyAnimationStorageOwner
  tracks: ShowPropertyAnimationTrack[]
  storageDurationMs: number
  showTimeOffsetMs: number
  instanceUseCount: number
}

export function buildShowPropertyAnimationOptions(
  value: ShowClipInspectorValue,
): ShowPropertyAnimationOption[] {
  if (!value.placementId || !value.instanceId) return []
  const option = (
    label: string,
    target: ShowPropertyAnimationTarget,
    current: number,
    min: number,
    max: number,
    step: number,
    presentation: ShowPropertyAnimationValuePresentation = 'number',
  ): ShowPropertyAnimationOption => ({
    key: propertyTargetKey(target),
    label,
    target,
    value: current,
    min,
    max,
    step,
    presentation,
  })
  const placementId = value.placementId
  const instanceId = value.instanceId
  return [
    option(
      'Animation speed',
      { kind: 'instance-time-scale', instanceId },
      value.simulation.timeScale,
      0,
      4,
      0.01,
      'multiplier',
    ),
    ...Object.entries(value.simulation.controlTargets ?? {}).map(([exportName, current]) => (
      option(
        exportName,
        { kind: 'instance-control', instanceId, exportName },
        current,
        0,
        1,
        0.01,
        'percentage',
      )
    )),
    ...(value.local?.opacity !== undefined
      ? [option(
          'Opacity',
          { kind: 'placement-opacity', placementId },
          value.local.opacity,
          0,
          1,
          0.01,
          'percentage',
        )]
      : []),
    option(
      'Brightness',
      { kind: 'placement-view', placementId, property: 'brightness' },
      value.view.brightness,
      0,
      1,
      0.01,
      'percentage',
    ),
    option(
      'Phase',
      { kind: 'placement-view', placementId, property: 'phase' },
      value.view.phase,
      0,
      1,
      0.01,
      'percentage',
    ),
    option('Position X', { kind: 'placement-transform', placementId, property: 'positionX' }, value.transform.positionX, -4, 4, 0.01),
    option('Position Y', { kind: 'placement-transform', placementId, property: 'positionY' }, value.transform.positionY, -4, 4, 0.01),
    option('Rotation', { kind: 'placement-transform', placementId, property: 'rotation' }, value.transform.rotation, -8, 8, 0.01),
    option('Scale X', { kind: 'placement-transform', placementId, property: 'scaleX' }, value.transform.scaleX, 0.01, 8, 0.01, 'multiplier'),
    option('Scale Y', { kind: 'placement-transform', placementId, property: 'scaleY' }, value.transform.scaleY, 0.01, 8, 0.01, 'multiplier'),
    option('Viewport X', { kind: 'placement-viewport', placementId, property: 'x' }, value.viewport.x, -4, 4, 0.01),
    option('Viewport Y', { kind: 'placement-viewport', placementId, property: 'y' }, value.viewport.y, -4, 4, 0.01),
    option('Viewport width', { kind: 'placement-viewport', placementId, property: 'width' }, value.viewport.width, 0.01, 8, 0.01, 'multiplier'),
    option('Viewport height', { kind: 'placement-viewport', placementId, property: 'height' }, value.viewport.height, 0.01, 8, 0.01, 'multiplier'),
    ...value.effects.flatMap((effect) => showClipEffectParameters(effect).flatMap((parameter) => {
      const current = showClipEffectParameterValue(effect, parameter.id)
      if (typeof current !== 'number') return []
      const presentation = parameter.presentation === 'percentage'
        ? 'percentage'
        : parameter.presentation === 'multiplier'
          ? 'multiplier'
          : 'number'
      return [option(
        `${effect.kind} - ${parameter.label}`,
        {
          kind: 'placement-effect',
          placementId,
          effectId: effect.id,
          effectKind: effect.kind,
          parameterId: parameter.id,
        },
        current,
        parameter.min ?? -1_000,
        parameter.max ?? 1_000,
        parameter.step ?? 0.01,
        presentation,
      )]
    })),
  ]
}

export function projectShowPropertyAnimationEditorContext(
  show: ShowRecord,
  value: ShowClipInspectorValue,
  groupOwner?: ShowGroupClipOwner,
): ShowPropertyAnimationEditorContext | null {
  const composition = show.composition
  if (!composition || !value.placementId || !value.instanceId) return null
  if (groupOwner) return projectGroupContext(show, composition, value, groupOwner)
  if (value.owner.kind !== 'scene-main' && value.owner.kind !== 'scene-overlay') return null
  const sceneId = value.owner.sceneId
  const scene = composition.scenes.find((candidate) => candidate.sceneId === sceneId)
  const sceneRange = projectShowTimeline(show).scenes.find((candidate) => candidate.sceneId === sceneId)
  const sourceScene = show.scenes.find((candidate) => candidate.id === sceneId)
  if (!scene || !sceneRange || !sourceScene) return null
  return {
    storageOwner: { kind: 'scene', sceneId },
    tracks: (scene.propertyTracks ?? []).filter((track) => trackBelongsToValue(track, value)),
    storageDurationMs: sourceScene.durationMs,
    showTimeOffsetMs: sceneRange.startMs,
    instanceUseCount: ordinaryInstanceUseCount(composition, value.instanceId),
  }
}

export function showPropertyAnimationGlobalSeconds(
  context: Pick<ShowPropertyAnimationEditorContext, 'showTimeOffsetMs'>,
  storageTimeMs: number,
): number {
  return (context.showTimeOffsetMs + storageTimeMs) / 1_000
}

export function showPropertyAnimationLocalTimeMs(
  context: Pick<ShowPropertyAnimationEditorContext, 'showTimeOffsetMs'>,
  showGlobalSeconds: number,
): number {
  return Math.round(showGlobalSeconds * 1_000 - context.showTimeOffsetMs)
}

export function applyShowGroupPropertyAnimationChange(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  composition: ShowCompositionV1,
  owner: Extract<ShowPropertyAnimationStorageOwner, { kind: 'group' }>,
  change: ShowPropertyAnimationChange,
  newId: () => string,
): ShowCompositionV1 {
  const draft = structuredClone(composition)
  const occurrence = draft.groupOccurrences?.find((candidate) => candidate.id === owner.occurrenceId)
  const definition = draft.groupDefinitions?.find((candidate) => candidate.id === owner.definitionId)
  if (!occurrence || occurrence.definitionId !== owner.definitionId || !definition) return composition
  if (change.kind === 'add-track') {
    const durationMs = Math.max(
      0,
      ...definition.placements.map((placement) => placement.startMs + placement.durationMs),
    )
    const keyframes = change.keyframes ?? [
      { timeMs: 0, value: change.initialValue, easing: { curve: 'linear' as const } },
      { timeMs: durationMs, value: change.initialValue, easing: { curve: 'linear' as const } },
    ]
    definition.propertyTracks = [
      ...(definition.propertyTracks ?? []),
      {
        id: newId(),
        target: structuredClone(change.target),
        keyframes: keyframes.map((keyframe) => ({ ...structuredClone(keyframe), id: newId() })),
      },
    ]
  } else if (change.kind === 'update-keyframe') {
    const track = definition.propertyTracks?.find((candidate) => candidate.id === change.trackId)
    const keyframe = track?.keyframes.find((candidate) => candidate.id === change.keyframeId)
    if (!track || !keyframe) return composition
    Object.assign(keyframe, structuredClone(change.changes))
    track.keyframes.sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  } else {
    if (!definition.propertyTracks?.some((candidate) => candidate.id === change.trackId)) return composition
    definition.propertyTracks = definition.propertyTracks.filter((candidate) => candidate.id !== change.trackId)
    if (definition.propertyTracks.length === 0) delete definition.propertyTracks
  }
  if (definition.propertyTracks) {
    definition.propertyTracks = normalizeShowPropertyTracks(definition.propertyTracks)
  }
  if (
    validateShowGroups(show, draft).length > 0
    || validateShowPropertyTracks(show, materializeShowGroupOccurrences(draft)).length > 0
  ) return composition
  return draft
}

function projectGroupContext(
  show: ShowRecord,
  composition: ShowCompositionV1,
  value: ShowClipInspectorValue,
  owner: ShowGroupClipOwner,
): ShowPropertyAnimationEditorContext | null {
  const occurrence = composition.groupOccurrences?.find((candidate) => candidate.id === owner.occurrenceId)
  const definition = composition.groupDefinitions?.find((candidate) => candidate.id === occurrence?.definitionId)
  const sceneRange = projectShowTimeline(show).scenes.find((candidate) => candidate.sceneId === occurrence?.sceneId)
  if (!occurrence || !definition || !sceneRange || !value.instanceId) return null
  const occurrenceCount = composition.groupOccurrences
    ?.filter((candidate) => candidate.definitionId === definition.id).length ?? 1
  const definitionUseCount = new Set(definition.placements
    .filter((placement) => placement.instanceId === value.instanceId)
    .map((placement) => placement.logicalClipId ?? placement.id)).size
  return {
    storageOwner: {
      kind: 'group',
      definitionId: definition.id,
      occurrenceId: occurrence.id,
    },
    tracks: (definition.propertyTracks ?? []).filter((track) => trackBelongsToValue(track, value)),
    storageDurationMs: Math.max(
      0,
      ...definition.placements.map((placement) => placement.startMs + placement.durationMs),
    ),
    showTimeOffsetMs: sceneRange.startMs + occurrence.startMs,
    instanceUseCount: definitionUseCount * occurrenceCount,
  }
}

function ordinaryInstanceUseCount(composition: ShowCompositionV1, instanceId: string): number {
  return new Set(composition.scenes.flatMap((scene) => scene.zones.flatMap((zone) => [
    ...zone.main.flatMap((placement) => placement.instanceId === instanceId
      ? [placement.logicalClipId ?? placement.id]
      : []),
    ...zone.overlays.flatMap((layer) => layer.placements.flatMap((placement) => (
      placement.instanceId === instanceId ? [placement.logicalClipId ?? placement.id] : []
    ))),
  ]))).size
}

function trackBelongsToValue(
  track: ShowPropertyAnimationTrack,
  value: ShowClipInspectorValue,
): boolean {
  if (track.target.kind === 'instance-time-scale' || track.target.kind === 'instance-control') {
    return track.target.instanceId === value.instanceId
  }
  return track.target.placementId === value.placementId
}
