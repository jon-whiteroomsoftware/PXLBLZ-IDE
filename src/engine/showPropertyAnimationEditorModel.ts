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
  evaluateShowPropertyTrack,
  normalizeShowPropertyTracks,
  propertyTargetKey,
  validateShowPropertyTracks,
  type ShowPropertyAnimationValidationCode,
  type ShowPropertyAnimationValidationIssue,
} from './showPropertyAnimation'
import { materializeShowGroupOccurrences, validateShowGroups } from './showGroupModel'

export type ShowPropertyAnimationValuePresentation = 'number' | 'percentage' | 'multiplier' | 'degrees'

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
  | {
      kind: 'add-keyframe'
      trackId: string
      keyframe: Omit<ShowPropertyAnimationKeyframe, 'id'>
    }
  | { kind: 'delete-keyframe'; trackId: string; keyframeId: string }
  | { kind: 'delete-track'; trackId: string }

export type ShowPropertyAnimationStorageOwner =
  | { kind: 'scene'; sceneId: string }
  | { kind: 'group'; definitionId: string; occurrenceId: string }

export interface ShowPropertyAnimationEditorContext {
  storageOwner: ShowPropertyAnimationStorageOwner
  tracks: ShowPropertyAnimationTrack[]
  trackIssues: Record<string, ShowPropertyAnimationValidationIssue[]>
  storageDurationMs: number
  showTimeOffsetMs: number
  instanceUseCount: number
}

export type ShowPropertyAnimationFieldLocation = 'header' | 'pattern' | 'place' | 'effects' | 'playback'

export interface ShowPropertyAnimationOverviewRow {
  trackId: string
  targetKey: string
  group: 'placement' | 'instance'
  label: string
  valueRange: string
  timeRange: string
  fieldLocation: ShowPropertyAnimationFieldLocation | null
  linkedClipCount?: number
  keyframeCount: number
  readOnly: boolean
  orphaned: boolean
  orphanCode?: ShowPropertyAnimationValidationCode
  orphanMessage?: string
  removable: true
}

const ORPHAN_CODES = new Set<ShowPropertyAnimationValidationCode>([
  'missing-instance',
  'missing-control',
  'missing-placement',
  'missing-effect',
  'effect-identity-mismatch',
  'missing-effect-parameter',
])

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
      'number',
    ),
    option('Position X', { kind: 'placement-transform', placementId, property: 'positionX' }, value.transform.positionX, -4, 4, 0.01),
    option('Position Y', { kind: 'placement-transform', placementId, property: 'positionY' }, value.transform.positionY, -4, 4, 0.01),
    option('Rotation', { kind: 'placement-transform', placementId, property: 'rotation' }, value.transform.rotation, -8, 8, 1 / 360, 'degrees'),
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
    trackIssues: trackIssuesForScene(show, composition, sceneId),
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

export function projectShowPropertyAnimationOverview(
  context: Pick<
    ShowPropertyAnimationEditorContext,
    'tracks' | 'trackIssues' | 'showTimeOffsetMs' | 'instanceUseCount'
  >,
  options: readonly ShowPropertyAnimationOption[],
): ShowPropertyAnimationOverviewRow[] {
  const optionByKey = new Map(options.map((option) => [option.key, option]))
  return context.tracks.map((track) => {
    const targetKey = propertyTargetKey(track.target)
    const option = optionByKey.get(targetKey)
    const ordered = [...track.keyframes]
      .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
    const first = ordered[0]
    const last = ordered[ordered.length - 1]
    const orphanIssue = context.trackIssues[track.id]
      ?.find((issue) => ORPHAN_CODES.has(issue.code))
    const orphaned = Boolean(orphanIssue || !option)
    return {
      trackId: track.id,
      targetKey,
      group: isInstanceTarget(track.target) ? 'instance' : 'placement',
      label: option?.label ?? orphanTargetLabel(track.target),
      // Every keyframe value, in time order: a curve's meaning often lives in
      // its middle, so an endpoints-only summary can read as a flat line.
      valueRange: ordered.length > 0
        ? ordered.map((keyframe) => formatOverviewValue(option, keyframe.value)).join(' → ')
        : `${formatOverviewValue(option, undefined)} → ${formatOverviewValue(option, undefined)}`,
      timeRange: `${formatOverviewSeconds(context, first?.timeMs)} → ${formatOverviewSeconds(context, last?.timeMs)}`,
      fieldLocation: orphaned ? null : fieldLocation(track.target),
      ...(isInstanceTarget(track.target) ? { linkedClipCount: context.instanceUseCount } : {}),
      keyframeCount: ordered.length,
      readOnly: orphaned,
      orphaned,
      ...(orphanIssue ? { orphanCode: orphanIssue.code, orphanMessage: orphanIssue.message } : {}),
      removable: true,
    }
  })
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
  } else if (change.kind === 'add-keyframe') {
    const track = definition.propertyTracks?.find((candidate) => candidate.id === change.trackId)
    if (!track) return composition
    track.keyframes.push({ ...structuredClone(change.keyframe), id: newId() })
    track.keyframes.sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  } else if (change.kind === 'delete-keyframe') {
    const track = definition.propertyTracks?.find((candidate) => candidate.id === change.trackId)
    // A track needs at least two keyframes, matching the scene-path rule.
    if (!track || track.keyframes.length <= 2) return composition
    if (!track.keyframes.some((candidate) => candidate.id === change.keyframeId)) return composition
    track.keyframes = track.keyframes.filter((candidate) => candidate.id !== change.keyframeId)
  } else {
    if (!definition.propertyTracks?.some((candidate) => candidate.id === change.trackId)) return composition
    definition.propertyTracks = definition.propertyTracks.filter((candidate) => candidate.id !== change.trackId)
    if (definition.propertyTracks.length === 0) delete definition.propertyTracks
  }
  if (definition.propertyTracks) {
    definition.propertyTracks = normalizeShowPropertyTracks(definition.propertyTracks)
  }
  if (change.kind === 'delete-track') return draft
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
    trackIssues: trackIssuesForGroup(show, composition, occurrence.id, definition.propertyTracks ?? []),
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

function trackIssuesForScene(
  show: ShowRecord,
  composition: ShowCompositionV1,
  sceneId: string,
): Record<string, ShowPropertyAnimationValidationIssue[]> {
  const sceneIndex = composition.scenes.findIndex((scene) => scene.sceneId === sceneId)
  const scene = composition.scenes[sceneIndex]
  if (!scene) return {}
  const issues = validateShowPropertyTracks(show, composition)
  return Object.fromEntries((scene.propertyTracks ?? []).map((track, trackIndex) => [
    track.id,
    issues.filter((issue) => issuePathBelongsTo(
      issue.path,
      `scenes[${sceneIndex}].propertyTracks[${trackIndex}]`,
    )),
  ]))
}

function trackIssuesForGroup(
  show: ShowRecord,
  composition: ShowCompositionV1,
  occurrenceId: string,
  tracks: readonly ShowPropertyAnimationTrack[],
): Record<string, ShowPropertyAnimationValidationIssue[]> {
  const materialized = materializeShowGroupOccurrences(composition)
  const issues = validateShowPropertyTracks(show, materialized)
  return Object.fromEntries(tracks.map((track) => {
    const materializedId = `${occurrenceId}:${track.id}`
    for (const [sceneIndex, scene] of materialized.scenes.entries()) {
      const trackIndex = (scene.propertyTracks ?? []).findIndex((candidate) => candidate.id === materializedId)
      if (trackIndex < 0) continue
      const prefix = `scenes[${sceneIndex}].propertyTracks[${trackIndex}]`
      return [track.id, issues.filter((issue) => issuePathBelongsTo(issue.path, prefix))]
    }
    return [track.id, []]
  }))
}

function issuePathBelongsTo(path: string, trackPath: string): boolean {
  return path === trackPath
    || path.startsWith(`${trackPath}.`)
    || path.startsWith(`${trackPath}[`)
}

/**
 * Where Add keyframe may insert without changing the rendered animation.
 *
 * Insertion carries the curve's evaluated midpoint value, which is lossless
 * only when both halves of the split segment replay identically: a linear
 * segment, or a hold whose endpoint values are equal (any easing between
 * equal values is constant). The midpoint value must also survive the
 * property's step grid and bounds untouched - a linear 8-to-9 integer ramp
 * has no representable midpoint, and quantizing one in would reshape the
 * curve as surely as splitting an eased segment. Gaps are tried largest
 * first; when none is lossless the caller disables the affordance instead
 * of silently editing the curve or letting validation reject the keyframe.
 */
export function showPropertyKeyframeInsertion(
  track: ShowPropertyAnimationTrack,
  option: Pick<ShowPropertyAnimationOption, 'min' | 'max' | 'step'>,
): Omit<ShowPropertyAnimationKeyframe, 'id'> | null {
  const ordered = [...track.keyframes]
    .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  const candidates = ordered
    .flatMap((keyframe, index) => {
      if (index === 0) return []
      const left = ordered[index - 1]
      const constant = left.easing.curve === 'linear' || left.value === keyframe.value
      const gap = keyframe.timeMs - left.timeMs
      return constant && gap > 1 ? [{ left, gap }] : []
    })
    .sort((a, b) => b.gap - a.gap)
  const step = option.step > 0 ? option.step : 0.01
  // Grid membership is tested with a step-proportional tolerance because
  // steps like 1/360 are not representable in decimal: rounding the
  // candidate to fixed decimals would push every whole-degree Rotation off
  // its own grid. The stored value is the evaluated one - by definition on
  // the curve - once it proves to sit on the grid and inside the bounds.
  for (const candidate of candidates) {
    const timeMs = Math.round(candidate.left.timeMs + candidate.gap / 2)
    const evaluated = evaluateShowPropertyTrack(track, timeMs)
    const quantized = Math.round(evaluated / step) * step
    const offGrid = Math.abs(quantized - evaluated) > step * 1e-6
    const outOfBounds = evaluated < option.min || evaluated > option.max
    if (offGrid || outOfBounds) continue
    return { timeMs, value: evaluated, easing: structuredClone(candidate.left.easing) }
  }
  return null
}

function isInstanceTarget(target: ShowPropertyAnimationTarget): boolean {
  return target.kind === 'instance-time-scale' || target.kind === 'instance-control'
}

function fieldLocation(target: ShowPropertyAnimationTarget): ShowPropertyAnimationFieldLocation {
  if (target.kind === 'instance-time-scale' || target.kind === 'instance-control') return 'pattern'
  if (target.kind === 'placement-opacity') return 'header'
  if (target.kind === 'placement-view') return target.property === 'phase' ? 'playback' : 'header'
  if (target.kind === 'placement-transform' || target.kind === 'placement-viewport') return 'place'
  return 'effects'
}

function formatOverviewValue(option: ShowPropertyAnimationOption | undefined, value: number | undefined): string {
  if (value === undefined) return '—'
  const rounded = (candidate: number) => Number(candidate.toFixed(3)).toString()
  if (option?.presentation === 'percentage') return `${rounded(value * 100)}%`
  if (option?.presentation === 'multiplier') return `${rounded(value)}x`
  if (option?.presentation === 'degrees') return `${rounded(value * 360)}°`
  return rounded(value)
}

function formatOverviewSeconds(
  context: Pick<ShowPropertyAnimationEditorContext, 'showTimeOffsetMs'>,
  timeMs: number | undefined,
): string {
  if (timeMs === undefined) return '—'
  return `${Number(showPropertyAnimationGlobalSeconds(context, timeMs).toFixed(3))}s`
}

function orphanTargetLabel(target: ShowPropertyAnimationTarget): string {
  if (target.kind === 'instance-time-scale') return 'Animation speed'
  if (target.kind === 'instance-control') return humanize(target.exportName)
  if (target.kind === 'placement-opacity') return 'Opacity'
  if (target.kind === 'placement-view') return humanize(target.property)
  if (target.kind === 'placement-transform') return humanize(target.property)
  if (target.kind === 'placement-viewport') return `Viewport ${humanize(target.property)}`
  return `${humanize(target.effectKind)} ${humanize(target.parameterId)}`
}

function humanize(value: string): string {
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ')
  return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`
}
