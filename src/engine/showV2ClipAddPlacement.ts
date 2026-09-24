import type { ShowRecordV2 } from './showCompositionV2'
import type { ShowPatternRef } from './personalContentRecords'
import type { CreateShowClipIntentV2 } from './showClipCreationV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { visualWindows } from './showTimelineV2'
import {
  allocateShowClipTimingIdsV2,
  buildShowV2TimelineEditorModel,
  type ShowV2TimelineCapture,
} from './showV2TimelineEditorModel'

export interface ShowV2ClipAddPlanReady {
  enabled: true
  zoneId: string
  layerId: string
  startMs: number
  durationMs: number
  extendsShowEnd: boolean
}

/** Why a Clip cannot start here; the timeline maps it to user copy (#1098). */
export type ShowV2ClipAddRefusalCode = 'invalid-time' | 'inside-transition' | 'no-layout' | 'occupied' | 'no-room'

export interface ShowV2ClipAddPlanRefused {
  enabled: false
  code: ShowV2ClipAddRefusalCode
  reason: string
}

export type ShowV2ClipAddPlan = ShowV2ClipAddPlanReady | ShowV2ClipAddPlanRefused

export interface ShowV2ClipAddLocation {
  zoneId: string
  layerId: string
  globalTimeMs: number
  defaultDurationMs?: number
}

export interface ShowV2ClipAddZoneLocation {
  zoneId: string
  globalTimeMs: number
  defaultDurationMs?: number
}

export type ShowV2AddClipIntentResult =
  | { status: 'ready'; intent: CreateShowClipIntentV2; clipId: string }
  | { status: 'refused'; message: string }

function layoutOccurrenceCovering(record: ShowRecordV2, timeMs: number) {
  const ordered = [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  return ordered.find((occurrence) => occurrence.startMs <= timeMs && timeMs < occurrence.startMs + occurrence.durationMs)
    ?? ordered.find((occurrence) => occurrence.startMs <= timeMs && timeMs <= occurrence.startMs + occurrence.durationMs)
    ?? null
}

function layoutProvidesZone(record: ShowRecordV2, layoutId: string, zoneId: string): boolean {
  const layout = record.zoneLayouts.find((candidate) => candidate.id === layoutId)
  if (!layout) return false
  const ids = layout.logical?.zoneIds ?? (layout.zones.length > 0
    ? layout.zones.map((zone) => zone.zoneId)
    : record.zones.map((zone) => zone.id))
  return [...new Set(ids)].includes(zoneId)
}

export function planShowV2ClipAtTime(record: ShowRecordV2, input: ShowV2ClipAddLocation): ShowV2ClipAddPlan {
  if (!Number.isFinite(input.globalTimeMs)) {
    return { enabled: false, code: 'invalid-time', reason: 'Choose a time inside the Show.' }
  }
  const startMs = Math.round(input.globalTimeMs)
  const showEndMs = record.composition.showEndMs
  if (startMs < 0 || startMs > showEndMs) {
    return { enabled: false, code: 'invalid-time', reason: 'Choose a time before Show End.' }
  }
  const windows = visualWindows(record)
  if (windows.some((window) => startMs >= window.startMs && startMs < window.endMs)) {
    return { enabled: false, code: 'inside-transition', reason: 'A Clip cannot begin inside a Transition.' }
  }
  const layer = record.composition.layers.find(
    (candidate) => candidate.id === input.layerId && candidate.zoneId === input.zoneId,
  )
  const occurrence = layoutOccurrenceCovering(record, startMs)
  if (!layer || !occurrence || !layoutProvidesZone(record, occurrence.layoutId, input.zoneId)) {
    return { enabled: false, code: 'no-layout', reason: 'The selected Zone has no Layer at the playhead.' }
  }
  const effective = record.composition.groupOccurrences.length > 0 ? materializeShowGroupsV2(record) : record
  const layerClips = effective.composition.clips.filter(
    (clip) => clip.zoneId === input.zoneId && clip.layerId === input.layerId,
  )
  if (layerClips.some((clip) => startMs >= clip.startMs && startMs < clip.startMs + clip.durationMs)) {
    return { enabled: false, code: 'occupied', reason: 'The selected Layer already has a Clip at the playhead.' }
  }
  const defaultDurationMs = Math.max(1, Math.round(input.defaultDurationMs ?? 5_000))
  if (startMs === showEndMs) {
    return { enabled: true, zoneId: input.zoneId, layerId: input.layerId, startMs, durationMs: defaultDurationMs, extendsShowEnd: true }
  }
  const nextClipStartMs = layerClips
    .filter((clip) => clip.startMs > startMs)
    .reduce((nearest, clip) => Math.min(nearest, clip.startMs), Number.POSITIVE_INFINITY)
  const nextWindowStartMs = windows
    .filter((window) => window.startMs > startMs)
    .reduce((nearest, window) => Math.min(nearest, window.startMs), Number.POSITIVE_INFINITY)
  const roomMs = Math.min(nextClipStartMs, nextWindowStartMs, occurrence.startMs + occurrence.durationMs, showEndMs) - startMs
  if (roomMs < 1) {
    return { enabled: false, code: 'no-room', reason: 'There is no empty time on the selected Layer.' }
  }
  return { enabled: true, zoneId: input.zoneId, layerId: input.layerId, startMs, durationMs: Math.min(defaultDurationMs, roomMs), extendsShowEnd: false }
}

export function planShowV2ClipAtTopmostAvailableLayer(
  record: ShowRecordV2,
  input: ShowV2ClipAddZoneLocation,
): ShowV2ClipAddPlanReady | null {
  const layers = record.composition.layers
    .filter((layer) => layer.zoneId === input.zoneId)
    .sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id))
  for (const layer of layers) {
    const plan = planShowV2ClipAtTime(record, { ...input, layerId: layer.id })
    if (plan.enabled) return plan
  }
  return null
}

export function createShowV2AddClipIntent(
  capture: ShowV2TimelineCapture,
  plan: ShowV2ClipAddPlanReady,
  source: { pattern: ShowPatternRef; patternName: string },
  allocate: () => string,
): ShowV2AddClipIntentResult {
  const entry = buildShowV2TimelineEditorModel(capture).sources.find(
    (candidate) => candidate.reference.kind === source.pattern.kind && candidate.reference.id === source.pattern.id,
  )
  if (!entry) return { status: 'refused', message: 'The selected Pattern source is unavailable.' }
  if (entry.runtimeIds.length > 1) {
    return { status: 'refused', message: 'Select one existing runtime for this Pattern source.' }
  }
  const first = entry.runtimeIds.length === 0
  const ids = allocateShowClipTimingIdsV2(capture.record, 'create', first, allocate)
  if (ids.status === 'refused') return { status: 'refused', message: ids.message }
  if (!ids.appearanceKeyId) {
    return { status: 'refused', message: 'Fresh Clip identities conflict. Try the edit again.' }
  }
  let runtime: CreateShowClipIntentV2['runtime']
  if (first) {
    if (!ids.instanceId) {
      return { status: 'refused', message: 'Fresh Clip identities conflict. Try the edit again.' }
    }
    runtime = {
      kind: 'first',
      instance: {
        id: ids.instanceId,
        pattern: { ...entry.reference },
        patternName: source.patternName,
        time: { timeScale: 1, timeOffsetMs: 0 },
        controlTargets: {},
      },
    }
  } else {
    runtime = { kind: 'existing', instanceId: entry.runtimeIds[0] }
  }
  return {
    status: 'ready',
    clipId: ids.clipId,
    intent: {
      kind: 'create-clip',
      ...(plan.extendsShowEnd ? { extendShowEnd: true as const } : {}),
      patternReference: { ...entry.reference },
      clip: {
        id: ids.clipId,
        zoneId: plan.zoneId,
        layerId: plan.layerId,
        startMs: plan.startMs,
        durationMs: plan.durationMs,
        entryPolicy: 'continue',
        zoneSampleMode: 'span',
        appearance: {
          keys: [{
            id: ids.appearanceKeyId,
            timeMs: plan.startMs,
            value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
          }],
        },
      },
      runtime,
    },
  }
}
