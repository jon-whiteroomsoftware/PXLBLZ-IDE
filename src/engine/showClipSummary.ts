import { steppedClockRateHz } from './steppedClock'
import { showClipEffectParameterValue, showClipEffectParameters } from './showEffectAuthoring'
import type { ShowCell, ShowPropertyTransitions, ShowRecord } from './personalContentRecords'

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

  const sections: Record<ShowClipSummaryKind, ShowClipSummaryItem[]> = {
    playback: playbackItems(cell),
    controls: Object.entries(cell.controlTargets ?? {}).map(([exportName, value]) => ({
      id: `control:${exportName}`,
      label: controlLabels[exportName] ?? humanizeIdentifier(exportName.replace(/^slider/, '')),
      value: formatNumber(value),
    })),
    view: viewItems(cell),
    effects: (cell.effects ?? []).map((effect) => {
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
    animation: animationItems(show, cell, controlLabels),
  }

  return (Object.keys(sections) as ShowClipSummaryKind[]).flatMap((kind) => (
    sections[kind].length > 0
      ? [{ kind, label: SECTION_LABELS[kind], items: sections[kind] }]
      : []
  ))
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

function playbackItems(cell: ShowCell): ShowClipSummaryItem[] {
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

function viewItems(cell: ShowCell): ShowClipSummaryItem[] {
  const items: ShowClipSummaryItem[] = []
  if (cell.adaptations.brightness !== 1) {
    items.push({ id: 'brightness', label: 'Brightness', value: `${Math.round(cell.adaptations.brightness * 100)}%` })
  }
  if (cell.adaptations.mirror) items.push({ id: 'mirror', label: 'Mirror', value: 'On' })
  if (cell.adaptations.phase !== 0) {
    items.push({ id: 'phase', label: 'Phase', value: formatNumber(cell.adaptations.phase) })
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
