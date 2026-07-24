import { steppedClockRateHz } from './steppedClock'
import { showClipEffectParameterValue, showClipEffectParameters } from './showEffectAuthoring'
import { normalizeShowClipTransform } from './showClipTransform'
import { materializeShowGroupOccurrences } from './showGroupModel'
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
}

export interface ShowClipSummarySection {
  kind: ShowClipSummaryKind
  label: string
  items: ShowClipSummaryItem[]
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

/** Project the complete authored summary for one Clip without UI or layout concerns. */
export function projectGlobalShowClipSummary(
  show: ShowRecord,
  cellId: string,
  controlLabels: Record<string, string> = {},
): ShowClipSummarySection[] {
  const cell = show.cells.find((candidate) => candidate.id === cellId)
  if (!cell) return []

  return projectClipSummary(cell, controlLabels, animationItems(show, cell, controlLabels))
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
    ...(placement.transform ? { transform: placement.transform } : {}),
    ...(placement.effects ? { effects: placement.effects } : {}),
  }, controlLabels, compositionAnimationItems(
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
  'adaptations' | 'controlTargets' | 'effects' | 'restartOnEntry' | 'transform'
>

function projectClipSummary(
  source: ClipSummarySource,
  controlLabels: Record<string, string>,
  authoredAnimationItems: ShowClipSummaryItem[],
): ShowClipSummarySection[] {
  const sections: Record<ShowClipSummaryKind, ShowClipSummaryItem[]> = {
    playback: playbackItems(source),
    controls: Object.entries(source.controlTargets ?? {}).map(([exportName, value]) => ({
      id: `control:${exportName}`,
      label: controlLabels[exportName] ?? humanizeIdentifier(exportName.replace(/^slider/, '')),
      value: formatNumber(value),
    })),
    view: viewItems(source),
    effects: (source.effects ?? []).map((effect) => {
      const parameters = showClipEffectParameters(effect).map((parameter) => ({
        label: compactEffectParameterLabel(parameter.label, effect.kind),
        value: formatToolkitValue(showClipEffectParameterValue(effect, parameter.id), parameter.unit),
      }))
      const value = parameters.length === 1
        ? parameters[0].value
        : parameters.map((parameter) => `${parameter.label} ${parameter.value}`).join(', ')
      return {
        id: `effect:${effect.id}`,
        label: humanizeIdentifier(effect.kind),
        value,
        timelineValue: parameters.length === 1
          ? value
          : parameters.map((parameter) => (
              `${contractTimelineParameterLabel(parameter.label)} ${parameter.value}`
            )).join(', '),
      }
    }),
    animation: authoredAnimationItems,
  }

  return (Object.keys(sections) as ShowClipSummaryKind[]).flatMap((kind) => (
    sections[kind].length > 0
      ? [{ kind, label: SECTION_LABELS[kind], items: sections[kind] }]
      : []
  ))
}

function compositionAnimationItems(
  composition: ShowCompositionV1,
  clip: Pick<ShowUnifiedTimelineClipProjection, 'instanceId'>,
  segmentIds: ReadonlySet<string>,
  sceneIds: ReadonlySet<string>,
  effects: readonly ShowClipEffect[] | undefined,
  controlLabels: Record<string, string>,
): ShowClipSummaryItem[] {
  const labels = new Map<string, string>()
  for (const scene of composition.scenes) {
    if (!sceneIds.has(scene.sceneId)) continue
    for (const track of scene.propertyTracks ?? []) {
      if (!animationTargetBelongsToClip(track.target, clip.instanceId, segmentIds)) continue
      const item = compositionAnimationItem(track.target, effects, controlLabels)
      if (item) labels.set(item.id, item.label)
    }
  }
  return [...labels].map(([id, label]) => ({ id, label, value: 'animated' }))
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
): Pick<ShowClipSummaryItem, 'id' | 'label'> | null {
  if (target.kind === 'instance-time-scale') {
    return { id: 'animation:time-scale', label: 'Animation speed' }
  }
  if (target.kind === 'instance-control') {
    return {
      id: `animation:control:${target.exportName}`,
      label: controlLabels[target.exportName] ?? humanizeIdentifier(target.exportName.replace(/^slider/, '')),
    }
  }
  if (target.kind === 'placement-opacity') {
    return { id: 'animation:opacity', label: 'Opacity' }
  }
  if (target.kind === 'placement-view') {
    return { id: `animation:view:${target.property}`, label: humanizeIdentifier(target.property) }
  }
  if (target.kind === 'placement-transform') {
    return { id: `animation:transform:${target.property}`, label: humanizeIdentifier(target.property) }
  }
  if (target.kind === 'placement-viewport') {
    return {
      id: `animation:viewport:${target.property}`,
      label: `Viewport ${humanizeIdentifier(target.property)}`,
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
    id: `animation:effect:${target.effectId}:${target.parameterId}`,
    label: `${humanizeIdentifier(effect.kind)} ${compactEffectParameterLabel(parameter.label, effect.kind)}`,
  }
}

/** Full terse text for the timeline Clip. CSS may crop it; the model never drops facts. */
export function showClipInlineSummary(summary: readonly ShowClipSummarySection[]): string {
  const facts = summary.flatMap((section) => section.items.map((item) => (
    item.value ? `${item.label} ${item.value}` : item.label
  )))
  return facts.length > 0 ? facts.join(' · ') : 'defaults'
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
    items: section.items.map((item) => ({
      ...item,
      displayValue: item.timelineValue ?? item.value,
      showValue: item.value !== undefined
        && previousValues.get(`${section.kind}:${item.id}`) !== item.value,
    })),
  }))
}

function playbackItems(cell: Pick<ShowCell, 'adaptations' | 'restartOnEntry'>): ShowClipSummaryItem[] {
  const items: ShowClipSummaryItem[] = []
  if (cell.adaptations.timeScale !== 1) {
    items.push({ id: 'time-scale', label: 'Animation speed', value: `${formatNumber(cell.adaptations.timeScale)}×` })
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

function viewItems(cell: Pick<ShowCell, 'adaptations' | 'transform'>): ShowClipSummaryItem[] {
  const items: ShowClipSummaryItem[] = []
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
  if (transform.rotation !== 0) items.push({ id: 'transform-rotation', label: 'Rotation', value: `${formatNumber(transform.rotation * 360)} deg`, timelineValue: `rot ${formatNumber(transform.rotation * 360)} deg` })
  if (transform.scaleX !== 1) items.push({ id: 'transform-scale-x', label: 'Scale X', value: `${formatNumber(transform.scaleX)}x`, timelineValue: `sx ${formatNumber(transform.scaleX)}` })
  if (transform.scaleY !== 1) items.push({ id: 'transform-scale-y', label: 'Scale Y', value: `${formatNumber(transform.scaleY)}x`, timelineValue: `sy ${formatNumber(transform.scaleY)}` })
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

function formatToolkitValue(value: unknown, unit?: string): string {
  if (typeof value === 'number') return `${formatNumber(value)}${unit ? ` ${unit}` : ''}`
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

const TIMELINE_PARAMETER_CONTRACTIONS: Record<string, string> = {
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

function contractTimelineParameterLabel(label: string): string {
  const lower = label.toLowerCase()
  return TIMELINE_PARAMETER_CONTRACTIONS[lower] ?? lower
}
