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

export interface ShowClipTimelineSummaryItem extends ShowClipSummaryItem {
  showValue: boolean
  displayValue?: string
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
      // there and keep the complete list in the Detail summary (#666).
      const authored = parameters.filter((parameter) => parameter.authored)
      const timelineParameters = authored.length > 0 ? authored : parameters
      return {
        id: `effect:${effect.id}`,
        label: humanizeIdentifier(effect.kind),
        value,
        timelineValue: parameters.length === 1
          ? parameters[0].value
          : timelineParameters.map((parameter) => (
              `${contractTimelineParameterLabel(parameter.label)} ${parameter.value}`
            )).join(' '),
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
    // Item ids and terse prefixes match the static transform facts exactly.
    const presentation: Record<string, { itemId: string; tersePrefix?: string; format: (value: number) => string }> = {
      positionX: { itemId: 'transform-position-x', tersePrefix: 'x', format: formatNumber },
      positionY: { itemId: 'transform-position-y', tersePrefix: 'y', format: formatNumber },
      rotation: { itemId: 'transform-rotation', format: (value) => formatAngleValue('rotation', value) },
      scaleX: { itemId: 'transform-scale-x', tersePrefix: 'sx', format: multiplier },
      scaleY: { itemId: 'transform-scale-y', tersePrefix: 'sy', format: multiplier },
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
      label: `Viewport ${humanizeIdentifier(target.property)}`,
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
  const previousValues = new Map((previousSummary ?? []).flatMap((section) => (
    section.items.map((item) => [`${section.kind}:${item.id}`, item.value] as const)
  )))
  return summary.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const displayValue = item.timelineValue ?? item.value
      return {
        ...item,
        ...(displayValue !== undefined ? { displayValue: compactTimelineNumberText(displayValue) } : {}),
        showValue: item.value !== undefined
          && previousValues.get(`${section.kind}:${item.id}`) !== item.value,
      }
    }),
  }))
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
    items.push({ id: 'time-offset', label: 'Start offset', value: `${formatNumber(cell.adaptations.timeOffsetMs ?? 0)} ms` })
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
  if (transform.positionX !== 0) items.push({ id: 'transform-position-x', label: 'Position X', value: formatNumber(transform.positionX), timelineValue: `x ${formatNumber(transform.positionX)}` })
  if (transform.positionY !== 0) items.push({ id: 'transform-position-y', label: 'Position Y', value: formatNumber(transform.positionY), timelineValue: `y ${formatNumber(transform.positionY)}` })
  // The circular-arrow icon names rotation on the Clip row; no text prefix.
  if (transform.rotation !== 0) items.push({ id: 'transform-rotation', label: 'Rotation', value: formatAngleValue('rotation', transform.rotation) })
  if (transform.scaleX !== 1) {
    const value = formatSummaryDomainNumber('multiplier', transform.scaleX, 0.01)
    items.push({ id: 'transform-scale-x', label: 'Scale X', value, timelineValue: `sx ${value}` })
  }
  if (transform.scaleY !== 1) {
    const value = formatSummaryDomainNumber('multiplier', transform.scaleY, 0.01)
    items.push({ id: 'transform-scale-y', label: 'Scale Y', value, timelineValue: `sy ${value}` })
  }
  const authoredViewport = compactShowClipViewport(cell.viewport)
  if (authoredViewport) {
    const viewport = normalizeShowClipViewport(authoredViewport)
    items.push({
      id: 'viewport',
      label: 'Viewport',
      value: `${viewport.enabled ? 'On' : 'Off'} · x ${formatNumber(viewport.x)}, y ${formatNumber(viewport.y)}, ${formatNumber(viewport.width)} × ${formatNumber(viewport.height)}`,
      // Whitespace separates well enough on the Clip row; commas cost width.
      timelineValue: `${viewport.enabled ? 'On' : 'Off'} x ${formatNumber(viewport.x)} y ${formatNumber(viewport.y)} ${formatNumber(viewport.width)}×${formatNumber(viewport.height)}`,
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

function humanizeIdentifier(value: string): string {
  const words = value
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  return words ? words[0].toUpperCase() + words.slice(1) : 'Property'
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
  return kept.join(' ') || label
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
