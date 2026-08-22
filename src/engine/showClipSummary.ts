import { steppedClockRateHz } from './steppedClock'
import { showClipEffectParameterValue, showClipEffectParameters } from './showEffectAuthoring'
import { normalizeShowClipTransform } from './showClipTransform'
import { compactShowClipViewport, normalizeShowClipViewport } from './showClipViewport'
import { materializeShowGroupOccurrences } from './showGroupModel'
import { formatPercentageValue } from './percentageValue'
import { formatDomainNumber } from './domainNumberPresentation'
import { anglePresentationKind, formatAngleValue } from './anglePresentation'
import type {
  ShowCell,
  ShowClipEffect,
  ShowCompositionV1,
  ShowPropertyAnimationTarget,
  ShowPropertyTransitions,
  ShowRecord,
} from './personalContentRecords'
import type { ShowUnifiedTimelineClipProjection } from './showUnifiedTimelineProjection'

export type ShowClipSummaryKind = 'playback' | 'controls' | 'view' | 'effects' | 'animation'

export interface ShowClipSummaryItem {
  id: string
  label: string
  value?: string
  timelineValue?: string
  /** The value is an animated keyframe range rather than a set value (#666). */
  animated?: boolean
}

export interface ShowClipSummarySection {
  kind: ShowClipSummaryKind
  label: string
  items: ShowClipSummaryItem[]
}

export interface ShowClipSummaryDestination {
  location: 'header' | 'pattern' | 'place' | 'effects' | 'playback'
  targetKey: string
  destinationLabel: string
}

/**
 * Glyph that leads a fact on the Clip row (#63). The row draws a glyph when
 * it differs from the preceding shown fact's, so sibling facts (two Pattern
 * controls, two Effects) share one. Boolean facts carry an empty display
 * value and speak through the glyph alone.
 */
export type ShowClipTimelineGlyph =
  | 'clock'
  | 'restart'
  | 'shutter'
  | 'controls'
  | 'eye'
  | 'sun'
  | 'mirror'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'viewport'
  | 'viewport-off'
  | 'effects'
  | 'animation'

export interface ShowClipTimelineSummaryItem extends ShowClipSummaryItem {
  showValue: boolean
  displayValue?: string
  glyph: ShowClipTimelineGlyph
}

export interface ShowClipTimelineSummarySection extends Omit<ShowClipSummarySection, 'items'> {
  items: ShowClipTimelineSummaryItem[]
}

const SECTION_LABELS: Record<ShowClipSummaryKind, string> = {
  playback: 'Playback',
  controls: 'Pattern controls',
  view: 'View',
  effects: 'Effects',
  animation: 'Animation',
}

/**
 * Resolve an authored summary fact to the tabbed Clip inspector surface that
 * owns it. Availability remains a UI concern: Place can disappear on a 1D
 * Stage, a Group Clip can lack instance controls, and imported legacy facts
 * can have no rendered editor at all.
 */
export function showClipSummaryDestination(
  kind: ShowClipSummaryKind,
  itemId: string,
): ShowClipSummaryDestination | null {
  if (kind === 'playback') {
    if (itemId === 'time-scale') {
      return { location: 'pattern', targetKey: 'speed', destinationLabel: 'Pattern Speed field' }
    }
    if (itemId === 'stepped-clock') {
      return { location: 'pattern', targetKey: 'stutter', destinationLabel: 'Pattern Stutter control' }
    }
    return null
  }
  if (kind === 'controls' && itemId.startsWith('control:')) {
    return { location: 'pattern', targetKey: itemId, destinationLabel: 'Pattern control' }
  }
  if (kind === 'view') {
    if (itemId === 'brightness' || itemId === 'opacity') {
      const field = itemId === 'brightness' ? 'Brightness' : 'Opacity'
      return {
        location: 'header',
        targetKey: itemId,
        destinationLabel: `Clip header ${field} field`,
      }
    }
    if (itemId === 'mirror') {
      return { location: 'effects', targetKey: 'mirror', destinationLabel: 'Effects Mirror row' }
    }
    if (itemId === 'phase') {
      return { location: 'playback', targetKey: 'phase', destinationLabel: 'Playback Phase field' }
    }
    if (itemId === 'viewport' || itemId.startsWith('viewport-')) {
      return { location: 'place', targetKey: 'viewport', destinationLabel: 'Place Viewport fields' }
    }
    if (itemId.startsWith('transform-')) {
      const field = itemId.slice('transform-'.length)
        .split('-')
        .map((word) => word[0]?.toUpperCase() + word.slice(1))
        .join(' ')
      return {
        location: 'place',
        targetKey: itemId,
        destinationLabel: `Place ${field} field`,
      }
    }
    return null
  }
  if (kind === 'effects' && itemId.startsWith('effect:')) {
    return { location: 'effects', targetKey: itemId, destinationLabel: 'Effects row' }
  }
  return null
}

/** Project the complete authored summary for one Clip without UI or layout concerns. */
export function projectGlobalShowClipSummary(
  show: ShowRecord,
  cellId: string,
  controlLabels: Record<string, string> = {},
): ShowClipSummarySection[] {
  const cell = show.cells.find((candidate) => candidate.id === cellId)
  if (!cell) return []

  return projectClipSummary(cell, controlLabels, animationItems(show, cell, controlLabels), EMPTY_OVERLAYS)
}

/** Adapt the authored unified Clip substrate to the retained summary language. */
export function projectCompositionShowClipSummary(
  composition: ShowCompositionV1,
  clip: Pick<ShowUnifiedTimelineClipProjection, 'id' | 'instanceId' | 'segmentIds'>,
  controlLabels: Record<string, string> = {},
): ShowClipSummarySection[] {
  const materialized = materializeShowGroupOccurrences(composition)
  const segmentIds = new Set(clip.segmentIds ?? [clip.id])
  const ownedPlacements = materialized.scenes.flatMap((scene) => (
    scene.zones.flatMap((zone) => [
      ...zone.main,
      ...zone.overlays.flatMap((layer) => layer.placements),
    ]).flatMap((placement) => (
      segmentIds.has(placement.id) ? [{ sceneId: scene.sceneId, placement }] : []
    ))
  ))
  const placement = ownedPlacements[0]?.placement
  const sceneIds = new Set(ownedPlacements.map((owner) => owner.sceneId))
  const instance = materialized.patternInstances.find((candidate) => candidate.id === clip.instanceId)
  if (!placement || !instance) return []
  const opacity = 'opacity' in placement && typeof placement.opacity === 'number'
    ? placement.opacity
    : undefined

  return projectClipSummary({
    adaptations: {
      mirror: placement.view.mirror,
      phase: placement.view.phase,
      brightness: placement.view.brightness,
      timeScale: instance.time.timeScale,
      ...(instance.time.lightShutter ? { lightShutter: instance.time.lightShutter } : {}),
      ...(instance.time.steppedClock ? { steppedClock: instance.time.steppedClock } : {}),
      ...(instance.time.timeOffsetMs !== 0 ? { timeOffsetMs: instance.time.timeOffsetMs } : {}),
    },
    ...(instance.controlTargets ? { controlTargets: instance.controlTargets } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(placement.transform ? { transform: placement.transform } : {}),
    ...(placement.viewport ? { viewport: placement.viewport } : {}),
    ...(placement.effects ? { effects: placement.effects } : {}),
  }, controlLabels, [], compositionAnimationOverlays(
    materialized,
    clip,
    segmentIds,
    sceneIds,
    placement.effects,
    controlLabels,
  ))
}

type ClipSummarySource = Pick<
  ShowCell,
  'adaptations' | 'controlTargets' | 'effects' | 'restartOnEntry' | 'transform' | 'viewport'
> & {
  opacity?: number
}

/**
 * Animated facts merge into the same slot as their set counterpart (#666):
 * one item per property, identified by the same id and icon whether the value
 * is set or animated. The `animated` flag plus a min–max range are the only
 * differences the UI renders.
 */
interface ShowClipAnimationOverlays {
  items: Array<{
    kind: Exclude<ShowClipSummaryKind, 'animation' | 'effects'>
    itemId: string
    label: string
    /** Timeline prefix matching the static contractions (x, rot, sx…). */
    tersePrefix?: string
    range: string
  }>
  /** Keyed `${effectId}:${parameterId}`; substituted into the Effect's item. */
  effectRanges: Map<string, string>
}

const EMPTY_OVERLAYS: ShowClipAnimationOverlays = { items: [], effectRanges: new Map() }

function projectClipSummary(
  source: ClipSummarySource,
  controlLabels: Record<string, string>,
  authoredAnimationItems: ShowClipSummaryItem[],
  overlays: ShowClipAnimationOverlays,
): ShowClipSummarySection[] {
  const sections: Record<ShowClipSummaryKind, ShowClipSummaryItem[]> = {
    playback: playbackItems(source),
    controls: Object.entries(source.controlTargets ?? {}).map(([exportName, value]) => ({
      id: `control:${exportName}`,
      label: controlLabels[exportName] ?? humanizeIdentifier(exportName.replace(/^slider/, '')),
      value: formatPercentageValue(value),
    })),
    view: viewItems(source),
    effects: (source.effects ?? []).map((effect) => {
      const parameters = showClipEffectParameters(effect).map((parameter) => {
        const raw = showClipEffectParameterValue(effect, parameter.id)
        const range = overlays.effectRanges.get(`${effect.id}:${parameter.id}`)
        return {
          id: parameter.id,
          label: compactEffectParameterLabel(parameter.label, effect.kind),
          value: range ?? formatToolkitValue(raw, parameter.unit, parameter.presentation, parameter.step),
          animated: range !== undefined,
          authored: range !== undefined || raw !== parameter.defaultValue,
        }
      })
      const value = parameters.length === 1
        ? parameters[0].value
        : parameters.map((parameter) => `${parameter.label} ${parameter.value}`).join(', ')
      // Default-valued parameters say nothing on the Clip row; drop them
      // there and keep the complete list in the Detail summary. An Effect
      // left entirely at defaults contracts to the section glyph (#666).
      // The Clip row is a hint, not a narrative: values only, in parameter
      // order, with names reserved for Clip Detail (#63).
      const authored = parameters.filter((parameter) => parameter.authored)
      return {
        id: `effect:${effect.id}`,
        label: humanizeIdentifier(effect.kind),
        value,
        timelineValue: parameters.length === 1
          ? (parameters[0].authored ? parameters[0].value : '')
          : pairEffectTimelineValues(effect.kind, parameters, authored),
        ...(parameters.some((parameter) => parameter.animated) ? { animated: true } : {}),
      }
    }),
    animation: authoredAnimationItems,
  }

  for (const overlay of overlays.items) {
    const items = sections[overlay.kind]
    const timelineValue = overlay.tersePrefix ? `${overlay.tersePrefix} ${overlay.range}` : undefined
    const existing = items.find((item) => item.id === overlay.itemId)
    if (existing) {
      existing.value = overlay.range
      if (timelineValue) existing.timelineValue = timelineValue
      else delete existing.timelineValue
      existing.animated = true
    } else {
      items.push({
        id: overlay.itemId,
        label: overlay.label,
        value: overlay.range,
        ...(timelineValue ? { timelineValue } : {}),
        animated: true,
      })
    }
  }

  return (Object.keys(sections) as ShowClipSummaryKind[]).flatMap((kind) => (
    sections[kind].length > 0
      ? [{ kind, label: SECTION_LABELS[kind], items: sections[kind] }]
      : []
  ))
}

type CompositionAnimationFact = {
  format: (value: number) => string
} & (
  | {
      kind: Exclude<ShowClipSummaryKind, 'animation' | 'effects'>
      itemId: string
      label: string
      tersePrefix?: string
    }
  | { kind: 'effects'; itemId: string }
)

function compositionAnimationOverlays(
  composition: ShowCompositionV1,
  clip: Pick<ShowUnifiedTimelineClipProjection, 'instanceId'>,
  segmentIds: ReadonlySet<string>,
  sceneIds: ReadonlySet<string>,
  effects: readonly ShowClipEffect[] | undefined,
  controlLabels: Record<string, string>,
): ShowClipAnimationOverlays {
  const facts = new Map<string, CompositionAnimationFact & { min: number; max: number }>()
  for (const scene of composition.scenes) {
    if (!sceneIds.has(scene.sceneId)) continue
    for (const track of scene.propertyTracks ?? []) {
      if (!animationTargetBelongsToClip(track.target, clip.instanceId, segmentIds)) continue
      const fact = compositionAnimationItem(track.target, effects, controlLabels)
      if (!fact || track.keyframes.length === 0) continue
      const entry = facts.get(`${fact.kind}:${fact.itemId}`) ?? { ...fact, min: Infinity, max: -Infinity }
      for (const keyframe of track.keyframes) {
        entry.min = Math.min(entry.min, keyframe.value)
        entry.max = Math.max(entry.max, keyframe.value)
      }
      facts.set(`${fact.kind}:${fact.itemId}`, entry)
    }
  }
  const overlays: ShowClipAnimationOverlays = { items: [], effectRanges: new Map() }
  for (const entry of facts.values()) {
    const range = formatAnimatedRange(entry.format, entry.min, entry.max)
    if (entry.kind === 'effects') {
      overlays.effectRanges.set(entry.itemId, range)
    } else {
      overlays.items.push({
        kind: entry.kind,
        itemId: entry.itemId,
        label: entry.label,
        ...(entry.tersePrefix ? { tersePrefix: entry.tersePrefix } : {}),
        range,
      })
    }
  }
  return overlays
}

/**
 * Absolute bounds for an animated property, in that property's own domain
 * unit. Sparklines carry the curve's shape; the Clip box carries its scale
 * (#666). A flat track reads as its single value, and a shared unit suffix
 * appears once: 0–65%, not 0%–65%.
 */
function formatAnimatedRange(format: (value: number) => string, min: number, max: number): string {
  const high = format(max)
  if (min === max) return high
  const low = format(min)
  const unit = high.match(/\D*$/)?.[0] ?? ''
  const trimmed = unit && low.endsWith(unit) ? low.slice(0, low.length - unit.length) : low
  return `${trimmed}–${high}`
}

function animationTargetBelongsToClip(
  target: ShowPropertyAnimationTarget,
  instanceId: string,
  segmentIds: ReadonlySet<string>,
): boolean {
  if (target.kind === 'instance-time-scale' || target.kind === 'instance-control') {
    return target.instanceId === instanceId
  }
  return segmentIds.has(target.placementId)
}

function compositionAnimationItem(
  target: ShowPropertyAnimationTarget,
  effects: readonly ShowClipEffect[] | undefined,
  controlLabels: Record<string, string>,
): CompositionAnimationFact | null {
  const percentage = (value: number) => formatPercentageValue(value)
  const multiplier = (value: number) => formatSummaryDomainNumber('multiplier', value, 0.01)
  if (target.kind === 'instance-time-scale') {
    return { kind: 'playback', itemId: 'time-scale', label: 'Animation speed', format: multiplier }
  }
  if (target.kind === 'instance-control') {
    return {
      kind: 'controls',
      itemId: `control:${target.exportName}`,
      label: controlLabels[target.exportName]
        ?? humanizeIdentifier(target.exportName.replace(/^slider/, '')),
      format: percentage,
    }
  }
  if (target.kind === 'placement-opacity') {
    return { kind: 'view', itemId: 'opacity', label: 'Opacity', format: percentage }
  }
  if (target.kind === 'placement-view') {
    return {
      kind: 'view',
      itemId: target.property,
      label: humanizeIdentifier(target.property),
      format: target.property === 'brightness' ? percentage : formatNumber,
    }
  }
  if (target.kind === 'placement-transform') {
    // Item ids match the static transform facts exactly.
    const presentation: Record<string, { itemId: string; tersePrefix?: string; format: (value: number) => string }> = {
      // Axes pair up on the Clip row (#63), so no terse prefix here.
      positionX: { itemId: 'transform-position-x', format: formatNumber },
      positionY: { itemId: 'transform-position-y', format: formatNumber },
      rotation: { itemId: 'transform-rotation', format: (value) => formatAngleValue('rotation', value) },
      scaleX: { itemId: 'transform-scale-x', format: multiplier },
      scaleY: { itemId: 'transform-scale-y', format: multiplier },
    }
    const transform = presentation[target.property]
    if (!transform) return null
    return {
      kind: 'view',
      itemId: transform.itemId,
      label: humanizeIdentifier(target.property),
      tersePrefix: transform.tersePrefix,
      format: transform.format,
    }
  }
  if (target.kind === 'placement-viewport') {
    // The Viewport icon carries identity on the Clip; the prefix is the axis alone.
    const short = target.property === 'width' ? 'w' : target.property === 'height' ? 'h' : target.property
    return {
      kind: 'view',
      itemId: `viewport-${target.property}`,
      label: `Viewport ${humanizeIdentifier(target.property).toLowerCase()}`,
      tersePrefix: short,
      format: formatNumber,
    }
  }
  const effect = effects?.find((candidate) => (
    candidate.id === target.effectId && candidate.kind === target.effectKind
  ))
  const parameter = effect
    ? showClipEffectParameters(effect).find((candidate) => candidate.id === target.parameterId)
    : undefined
  if (!effect || !parameter) return null
  return {
    kind: 'effects',
    itemId: `${target.effectId}:${target.parameterId}`,
    format: (value) => formatToolkitValue(value, parameter.unit, parameter.presentation, parameter.step),
  }
}

interface EffectAxisPair {
  axes: readonly [string, string]
  unit: string
  separator: string
  collapseUniform: boolean
}

/** Two-axis Effect parameters that read as one pair on the Clip row (#63). */
const EFFECT_AXIS_PAIRS: Readonly<Record<string, EffectAxisPair>> = {
  translate: { axes: ['translateX', 'translateY'], unit: '', separator: ',', collapseUniform: false },
  scale: { axes: ['scaleX', 'scaleY'], unit: 'x', separator: '×', collapseUniform: true },
  shear: { axes: ['shearX', 'shearY'], unit: '', separator: ',', collapseUniform: false },
  pixelate: { axes: ['columns', 'rows'], unit: '', separator: '×', collapseUniform: false },
}

interface EffectTimelineParameter {
  id: string
  value: string
  animated: boolean
  authored: boolean
}

/**
 * Join an Effect's authored parameter values for the Clip row, folding a
 * known axis pair into `x,y` / `w×h` form. The pair prints both axes when
 * either is authored, so it always reads as a pair; everything else keeps
 * the existing ` / ` join in parameter order.
 */
function pairEffectTimelineValues(
  kind: string,
  parameters: readonly EffectTimelineParameter[],
  authored: readonly EffectTimelineParameter[],
): string {
  const pair = EFFECT_AXIS_PAIRS[kind]
  if (!pair) return authored.map((parameter) => parameter.value).join(' / ')
  const axes = pair.axes.map((axisId) => parameters.find((parameter) => parameter.id === axisId))
  const parts: string[] = []
  let pairPlaced = false
  for (const parameter of parameters) {
    if (pair.axes.includes(parameter.id)) {
      if (pairPlaced || !axes.some((axis) => axis?.authored)) continue
      pairPlaced = true
      const texts = axes.map((axis) => {
        const text = axis?.value ?? ''
        return pair.unit && text.endsWith(pair.unit) ? text.slice(0, text.length - pair.unit.length) : text
      })
      const uniform = pair.collapseUniform && !axes.some((axis) => axis?.animated) && texts[0] === texts[1]
      parts.push(`${uniform ? texts[0] : texts.join(pair.separator)}${pair.unit}`)
    } else if (parameter.authored) {
      parts.push(parameter.value)
    }
  }
  return parts.join(' / ')
}

/** Full terse text for the timeline Clip. CSS may crop it; the model never drops facts. */
export function showClipInlineSummary(summary: readonly ShowClipSummarySection[]): string {
  const facts = summary.flatMap((section) => section.items.map((item) => (
    item.value ? `${item.label} ${item.value}` : item.label
  )))
  return facts.length > 0 ? facts.join(' · ') : 'defaults'
}

/**
 * Everything animatable lives in 0..1, so leading zeros dominate the Clip
 * row without informing: .05 reads as well as 0.05 where horizontal space is
 * the scarce resource. Once a number has two integer digits its decimals add
 * precision nobody reads at Clip size: 66.23° rounds to 66°. Timeline display
 * only — full values stay everywhere else (#666).
 */
function compactTimelineNumberText(text: string): string {
  return text
    .replace(/-?\d{2,}\.\d+/g, (match) => `${Math.round(Number(match))}`)
    .replace(/\b0\.(?=\d)/g, '.')
}

/** Keep timeline copy terse: values appear only when introduced or changed. */
export function projectShowClipTimelineSummary(
  summary: readonly ShowClipSummarySection[],
  previousSummary: readonly ShowClipSummarySection[] | null,
): ShowClipTimelineSummarySection[] {
  // Animation state is part of the fact: a flat animated 50% after a set 50%
  // formats identically but must stay visible as newly animated.
  const factKey = (item: ShowClipSummaryItem) => `${item.animated ? 'animated:' : ''}${item.value}`
  const previousValues = new Map((previousSummary ?? []).flatMap((section) => (
    pairTimelineAxes(section.kind, section.items)
      .map((item) => [`${section.kind}:${item.id}`, factKey(item)] as const)
  )))
  return summary.map((section) => ({
    ...section,
    items: pairTimelineAxes(section.kind, section.items).map((item) => {
      const displayValue = timelineDisplayValue(section.kind, item)
      return {
        ...item,
        ...(displayValue !== undefined ? { displayValue: compactTimelineNumberText(displayValue) } : {}),
        showValue: item.value !== undefined
          && previousValues.get(`${section.kind}:${item.id}`) !== factKey(item),
        glyph: timelineGlyph(section.kind, item.id, item.value),
      }
    }),
  }))
}

const GLYPH_ONLY_ITEMS = new Set(['restart', 'mirror'])

/** Boolean facts read through their glyph alone on the Clip row (#63). */
function timelineDisplayValue(kind: ShowClipSummaryKind, item: ShowClipSummaryItem): string | undefined {
  if (kind === 'view' || kind === 'playback') {
    if (GLYPH_ONLY_ITEMS.has(item.id) && !item.animated) return ''
  }
  return item.timelineValue ?? item.value
}

function timelineGlyph(kind: ShowClipSummaryKind, itemId: string, value: string | undefined): ShowClipTimelineGlyph {
  if (kind === 'playback') {
    if (itemId === 'restart') return 'restart'
    if (itemId === 'light-shutter') return 'shutter'
    return 'clock'
  }
  if (kind === 'controls') return 'controls'
  if (kind === 'effects') return 'effects'
  if (kind === 'animation') return 'animation'
  if (itemId === 'brightness') return 'sun'
  if (itemId === 'mirror') return 'mirror'
  if (itemId === 'transform-rotation') return 'rotate'
  if (itemId === 'transform-position') return 'move'
  if (itemId === 'transform-scale') return 'scale'
  if (itemId === 'viewport') return value?.startsWith('Off') ? 'viewport-off' : 'viewport'
  if (itemId.startsWith('viewport-')) return 'viewport'
  return 'eye'
}

interface TimelineAxisPair {
  id: string
  label: string
  axes: readonly [string, string]
  /** Text for an axis left at its default. */
  neutral: string
  /** Unit suffix shared by both axes and hoisted to the pair's end. */
  unit: string
  separator: string
  /** Whether two equal set axes collapse to a single value. */
  collapseUniform: boolean
}

const TIMELINE_AXIS_PAIRS: readonly TimelineAxisPair[] = [
  {
    id: 'transform-position',
    label: 'Position',
    axes: ['transform-position-x', 'transform-position-y'],
    neutral: '0',
    unit: '',
    separator: ',',
    collapseUniform: false,
  },
  {
    id: 'transform-scale',
    label: 'Scale',
    axes: ['transform-scale-x', 'transform-scale-y'],
    neutral: '1',
    unit: 'x',
    separator: '×',
    collapseUniform: true,
  },
]

/**
 * Fold per-axis Transform facts into one Clip-row pair (#63): `-.25,.25`
 * for position, `.5×.75x` for scale, collapsing a uniform scale to `.5x`.
 * A defaulted axis still appears so the pair always reads as (x, y). The
 * pair takes the position of its first axis and inherits animation from
 * either axis; the complete per-axis summary is untouched.
 */
function pairTimelineAxes(kind: ShowClipSummaryKind, items: ShowClipSummaryItem[]): ShowClipSummaryItem[] {
  if (kind !== 'view') return items
  let result = items
  for (const pair of TIMELINE_AXIS_PAIRS) {
    const first = result.findIndex((item) => pair.axes.includes(item.id))
    if (first < 0) continue
    const axes = pair.axes.map((axisId) => result.find((item) => item.id === axisId))
    const texts = axes.map((axis) => {
      if (!axis?.value) return pair.neutral
      return pair.unit && axis.value.endsWith(pair.unit)
        ? axis.value.slice(0, axis.value.length - pair.unit.length)
        : axis.value
    })
    const animated = axes.some((axis) => axis?.animated)
    const uniform = pair.collapseUniform && !animated && axes.every(Boolean) && texts[0] === texts[1]
    const value = `${uniform ? texts[0] : texts.join(pair.separator)}${pair.unit}`
    const paired: ShowClipSummaryItem = {
      id: pair.id,
      label: pair.label,
      value,
      ...(animated ? { animated: true } : {}),
    }
    result = result.flatMap((item, index) => (
      index === first ? [paired] : pair.axes.includes(item.id) ? [] : [item]
    ))
  }
  return result
}

function playbackItems(cell: Pick<ShowCell, 'adaptations' | 'restartOnEntry'>): ShowClipSummaryItem[] {
  const items: ShowClipSummaryItem[] = []
  if (cell.adaptations.timeScale !== 1) {
    items.push({
      id: 'time-scale',
      label: 'Animation speed',
      value: formatSummaryDomainNumber('multiplier', cell.adaptations.timeScale, 0.01),
    })
  }
  if (cell.restartOnEntry) items.push({ id: 'restart', label: 'Restart on entry', value: 'On' })
  if (cell.adaptations.steppedClock) {
    items.push({
      id: 'stepped-clock',
      label: 'Motion cadence',
      value: `${formatNumber(steppedClockRateHz(cell.adaptations.steppedClock.stepMs))}/s`,
    })
  }
  if ((cell.adaptations.timeOffsetMs ?? 0) !== 0) {
    const offsetMs = cell.adaptations.timeOffsetMs ?? 0
    items.push({
      id: 'time-offset',
      label: 'Start offset',
      value: `${formatNumber(offsetMs)} ms`,
      // A signed offset reads as a shift on the Clip row (#63).
      timelineValue: `${offsetMs > 0 ? '+' : ''}${formatNumber(offsetMs)}ms`,
    })
  }
  if (cell.adaptations.lightShutter) {
    const shutter = cell.adaptations.lightShutter
    items.push({
      id: 'light-shutter',
      label: 'Light shutter',
      value: [
        `${formatNumber(shutter.rateHz)} Hz`,
        `${Math.round(shutter.duty * 100)}% on`,
        ...(shutter.phase !== 0 ? [`phase ${formatNumber(shutter.phase)}`] : []),
        `${shutter.clockBehavior} clock`,
      ].join(', '),
      // Rate and duty carry the shutter on the Clip row; phase and the
      // frozen clock appear only when authored away from their defaults (#63).
      timelineValue: [
        `${formatNumber(shutter.rateHz)}Hz`,
        `${Math.round(shutter.duty * 100)}%`,
        ...(shutter.phase !== 0 ? [`φ${formatNumber(shutter.phase)}`] : []),
        ...(shutter.clockBehavior === 'freeze' ? ['❄'] : []),
      ].join(' '),
    })
  }
  return items
}

function viewItems(
  cell: Pick<ShowCell, 'adaptations' | 'transform' | 'viewport'> & { opacity?: number },
): ShowClipSummaryItem[] {
  const items: ShowClipSummaryItem[] = []
  if (cell.opacity !== undefined && cell.opacity !== 1) {
    items.push({ id: 'opacity', label: 'Opacity', value: `${Math.round(cell.opacity * 100)}%` })
  }
  if (cell.adaptations.brightness !== 1) {
    items.push({ id: 'brightness', label: 'Brightness', value: `${Math.round(cell.adaptations.brightness * 100)}%` })
  }
  if (cell.adaptations.mirror) items.push({ id: 'mirror', label: 'Mirror', value: 'On' })
  if (cell.adaptations.phase !== 0) {
    items.push({ id: 'phase', label: 'Phase', value: formatNumber(cell.adaptations.phase) })
  }
  const transform = normalizeShowClipTransform(cell.transform)
  // Position and scale axes pair up on the Clip row (#63); Clip Detail keeps each axis.
  if (transform.positionX !== 0) items.push({ id: 'transform-position-x', label: 'Position x', value: formatNumber(transform.positionX) })
  if (transform.positionY !== 0) items.push({ id: 'transform-position-y', label: 'Position y', value: formatNumber(transform.positionY) })
  // The circular-arrow icon names rotation on the Clip row; no text prefix.
  if (transform.rotation !== 0) items.push({ id: 'transform-rotation', label: 'Rotation', value: formatAngleValue('rotation', transform.rotation) })
  if (transform.scaleX !== 1) {
    items.push({ id: 'transform-scale-x', label: 'Scale x', value: formatSummaryDomainNumber('multiplier', transform.scaleX, 0.01) })
  }
  if (transform.scaleY !== 1) {
    items.push({ id: 'transform-scale-y', label: 'Scale y', value: formatSummaryDomainNumber('multiplier', transform.scaleY, 0.01) })
  }
  const authoredViewport = compactShowClipViewport(cell.viewport)
  if (authoredViewport) {
    const viewport = normalizeShowClipViewport(authoredViewport)
    items.push({
      id: 'viewport',
      label: 'Viewport',
      value: `${viewport.enabled ? 'On' : 'Off'} · x ${formatNumber(viewport.x)}, y ${formatNumber(viewport.y)}, ${formatNumber(viewport.width)} × ${formatNumber(viewport.height)}`,
      // The Viewport glyph carries identity on the Clip row: origin pair,
      // then size. A disabled Viewport clips nothing, so its geometry is
      // noise there (#63).
      timelineValue: viewport.enabled
        ? `${formatNumber(viewport.x)},${formatNumber(viewport.y)} ${formatNumber(viewport.width)}×${formatNumber(viewport.height)}`
        : 'off',
    })
  }
  return items
}

function animationItems(
  show: ShowRecord,
  cell: ShowCell,
  controlLabels: Record<string, string>,
): ShowClipSummaryItem[] {
  const labels = new Map<string, string>()
  for (const transition of show.transitions ?? []) {
    const properties = transition.propertyTransitions
    if (!properties) continue
    collectAnimatedProperty(labels, properties, cell, controlLabels)
  }
  return [...labels].map(([id, label]) => ({ id, label, value: 'animated' }))
}

function collectAnimatedProperty(
  labels: Map<string, string>,
  properties: ShowPropertyTransitions,
  cell: ShowCell,
  controlLabels: Record<string, string>,
): void {
  if (properties.timeScale?.fromByCellId[cell.id] !== undefined) labels.set('animation:time-scale', 'Animation speed')
  if (properties.brightness?.fromByCellId[cell.id] !== undefined) labels.set('animation:brightness', 'Brightness')
  for (const [exportName, transition] of Object.entries(properties.controls ?? {})) {
    if (transition.fromByCellId[cell.id] === undefined) continue
    labels.set(
      `animation:control:${exportName}`,
      controlLabels[exportName] ?? humanizeIdentifier(exportName.replace(/^slider/, '')),
    )
  }
  for (const [property, transition] of Object.entries(properties.transform ?? {})) {
    if (transition?.fromByCellId[cell.id] === undefined) continue
    labels.set(`animation:transform:${property}`, humanizeIdentifier(property))
  }
  for (const [effectId, parameters] of Object.entries(properties.effects ?? {})) {
    const effect = cell.effects?.find((candidate) => candidate.id === effectId)
    for (const [parameterId, transition] of Object.entries(parameters)) {
      if (transition.fromByCellId[cell.id] === undefined) continue
      labels.set(
        `animation:effect:${effectId}:${parameterId}`,
        `${humanizeIdentifier(effect?.kind ?? 'effect')} ${humanizeIdentifier(parameterId)}`,
      )
    }
  }
}

/** Sentence case, axes included: 'positionX' -> 'Position x', like every other summary label (#63). */
function humanizeIdentifier(value: string): string {
  const words = value
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  return words ? words[0].toUpperCase() + words.slice(1).toLowerCase() : 'Property'
}

/** Toolkit parameter labels arrive Title Cased ('Center X'); summaries read in sentence case ('Center x'). */
function sentenceCaseLabel(label: string): string {
  return label ? label[0].toUpperCase() + label.slice(1).toLowerCase() : label
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function formatSummaryDomainNumber(
  presentation: 'multiplier' | 'ratio',
  value: number,
  step: number,
): string {
  const domainValue = formatDomainNumber(presentation, value, step)
  if (presentation === 'ratio' && domainValue.includes(':')) return domainValue
  const rounded = formatNumber(value)
  return presentation === 'multiplier' ? `${rounded}x` : rounded
}

function formatToolkitValue(
  value: unknown,
  unit?: string,
  presentation?: 'percentage' | 'multiplier' | 'ratio' | 'direction' | 'phase' | 'rotation' | 'cycles',
  step = 0.01,
): string {
  if (typeof value === 'number') {
    if (presentation === 'percentage') return formatPercentageValue(value)
    if (presentation === 'multiplier' || presentation === 'ratio') {
      return formatSummaryDomainNumber(presentation, value, step)
    }
    const angleKind = anglePresentationKind(presentation)
    if (angleKind) return formatAngleValue(angleKind, value)
    return `${formatNumber(value)}${unit ? ` ${unit}` : ''}`
  }
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  return String(value)
}

function compactEffectParameterLabel(label: string, effectKind: string): string {
  const effectWords = humanizeIdentifier(effectKind).split(' ')
  const kept = label.split(' ').filter((word) => (
    !effectWords.some((effectWord) => effectWord.toLowerCase() === word.toLowerCase())
  ))
  const compact = kept.join(' ') || label
  // A lone axis reads lowercase, as it does on the property lanes.
  return /^[XYZ]$/i.test(compact) ? compact.toLowerCase() : sentenceCaseLabel(compact)
}

const TIMELINE_PARAMETER_CONTRACTIONS: Readonly<Record<string, string>> = {
  amount: 'amt',
  frequency: 'freq',
  'center x': 'cx',
  'center y': 'cy',
  radius: 'rad',
  threshold: 'thresh',
  'target luminance': 'luma',
  'target color': 'color',
  tolerance: 'tol',
  softness: 'soft',
  'x scale': 'sx',
  'y scale': 'sy',
  'x shear': 'shx',
  'y shear': 'shy',
  columns: 'cols',
  segments: 'segs',
  rotation: 'rot',
  'shadow red': 'sh r',
  'shadow green': 'sh g',
  'shadow blue': 'sh b',
  'highlight red': 'hi r',
  'highlight green': 'hi g',
  'highlight blue': 'hi b',
}

export function contractTimelineParameterLabel(label: string): string {
  const lower = label.toLowerCase()
  return TIMELINE_PARAMETER_CONTRACTIONS[lower] ?? lower
}
