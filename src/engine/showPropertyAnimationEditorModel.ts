import {
  showClipEffectParameterValue,
  showClipEffectParameters,
} from './showEffectAuthoring'
import type {
  ShowPropertyAnimationKeyframe,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
} from './personalContentRecords'
import type { AutomatablePatternControl } from './showPatternControls'
import type { ControlSecondsPresentation } from '@/pixelblaze/controlDescriptions'
import type { ShowClipInspectorValue } from './showClipInspectorModel'
import {
  evaluateShowPropertyTrack,
  propertyTargetKey,
  type ShowPropertyAnimationValidationCode,
  type ShowPropertyAnimationValidationIssue,
} from './showPropertyAnimation'

export type ShowPropertyAnimationValuePresentation = 'number' | 'percentage' | 'multiplier' | 'degrees' | 'turns' | 'phase'

export interface ShowPropertyAnimationOption {
  key: string
  label: string
  target: ShowPropertyAnimationTarget
  value: number
  min: number
  max: number
  step: number
  presentation: ShowPropertyAnimationValuePresentation
  // Curated for stock pattern controls whose raw 0..1 value encodes seconds
  // linearly (value * scale); the editor renders an exact seconds field and
  // formats overview values in seconds (#819).
  secondsPresentation?: ControlSecondsPresentation
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
  value: Omit<ShowClipInspectorValue, 'owner'>,
  patternControls: readonly AutomatablePatternControl[] = [],
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
    ...Object.entries(value.simulation.controlTargets ?? {}).map(([exportName, current]) => {
      const meta = patternControls.find((control) => control.exportName === exportName)
      return {
        ...option(
          exportName,
          { kind: 'instance-control', instanceId, exportName },
          current,
          0,
          1,
          0.01,
          'percentage',
        ),
        // Seconds options carry the raw step matching the seconds field's
        // 0.001 s precision so keyframe insertion quantizes losslessly.
        ...(meta?.secondsPresentation
          ? { secondsPresentation: meta.secondsPresentation, step: 0.001 / meta.secondsPresentation.scale }
          : {}),
      }
    }),
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
      'phase',
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
      const presentation: ShowPropertyAnimationValuePresentation = parameter.presentation === 'percentage'
        ? 'percentage'
        : parameter.presentation === 'multiplier'
          ? 'multiplier'
          : parameter.presentation === 'direction' || parameter.presentation === 'rotation'
            ? 'degrees'
            : parameter.presentation === 'phase'
              ? 'phase'
              : parameter.presentation === 'cycles'
                ? 'turns'
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
  // steps like 1/360 are not representable in decimal, and odd-length
  // segments evaluate a hair off the grid in float arithmetic. The stored
  // value is the grid-snapped one so that exact validators (integer-step
  // Effect parameters) always accept it; the tolerance bounds the snap to a
  // millionth of a step, far below anything a renderer can show.
  for (const candidate of candidates) {
    const timeMs = Math.round(candidate.left.timeMs + candidate.gap / 2)
    const evaluated = evaluateShowPropertyTrack(track, timeMs)
    const quantized = Math.round(evaluated / step) * step
    if (Math.abs(quantized - evaluated) > step * 1e-6) continue
    const value = quantized === evaluated ? evaluated : quantized
    if (value < option.min || value > option.max) continue
    return { timeMs, value, easing: structuredClone(candidate.left.easing) }
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
  if (option?.secondsPresentation) {
    // The Luma runtime floors the loop at minSeconds; report what actually
    // plays so overview, editor, and playback agree on legacy raw-zero values.
    const { scale, minSeconds } = option.secondsPresentation
    return `${rounded(Math.max(minSeconds, value * scale))}s`
  }
  if (option?.presentation === 'percentage') return `${rounded(value * 100)}%`
  if (option?.presentation === 'multiplier') return `${rounded(value)}x`
  if (option?.presentation === 'degrees') return `${rounded(value * 360)}°`
  if (option?.presentation === 'turns' || option?.presentation === 'phase') return `${rounded(value)}t`
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
