import { describe, expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { createShowClipV2 } from './showClipCreationV2'
import type { ShowRecordV2 } from './showCompositionV2'
import {
  createShowV2AddClipIntent,
  planShowV2ClipAtTime,
  planShowV2ClipAtTopmostAvailableLayer,
  type ShowV2ClipAddPlanReady,
} from './showV2ClipAddPlacement'
import type { ShowV2TimelineCapture } from './showV2TimelineEditorModel'

const MAIN = 'layer:zone:main'
const OVERLAY = 'layer:zone:overlay:1'

function baseRecord(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
  return converted.record
}

function emptyLongRecord(): ShowRecordV2 {
  const record = baseRecord()
  record.composition.showEndMs = 20_000
  record.composition.layoutOccurrences = [
    { id: 'lo', layoutId: 'layout', startMs: 0, durationMs: 20_000, parameters: {} },
  ]
  record.composition.clips = []
  record.composition.patternInstances = []
  return record
}

function authoredClip(id: string, layerId: string, startMs: number, durationMs: number) {
  return {
    id,
    instanceId: 'instance',
    zoneId: 'zone',
    layerId,
    startMs,
    durationMs,
    entryPolicy: 'continue' as const,
    zoneSampleMode: 'span' as const,
    appearance: { keys: [] },
  }
}

function splitAvailabilityRecord(): ShowRecordV2 {
  const record = emptyLongRecord()
  record.zones.push({ id: 'zone-b', name: 'B', nominalPixelCount: 16 })
  record.zoneLayouts.push({ id: 'narrow', name: 'Narrow', zones: [], logical: { kind: 'single', zoneIds: ['zone-b'] } } as never)
  record.composition.showEndMs = 10_000
  record.composition.layoutOccurrences = [
    { id: 'lo-full', layoutId: 'layout', startMs: 0, durationMs: 5_000, parameters: {} },
    { id: 'lo-narrow', layoutId: 'narrow', startMs: 5_000, durationMs: 5_000, parameters: {} },
  ]
  return record
}

function transitionRecord(): ShowRecordV2 {
  const record = emptyLongRecord()
  record.composition.clips = [
    authoredClip('clip-a', MAIN, 0, 2_000),
    authoredClip('clip-b', MAIN, 5_000, 2_000),
  ]
  record.composition.transitions = [{
    id: 'whole',
    kind: 'crossfade',
    durationMs: 1_000,
    wholeOutput: { startMs: 3_000, fromClipIds: ['clip-a'], toClipIds: ['clip-b'] },
    participants: [],
    propertyRamps: [],
  } as never]
  return record
}

function groupRecord(): ShowRecordV2 {
  const record = emptyLongRecord()
  record.composition.layers.push({ id: 'group-layer', name: 'Group', zoneId: 'zone', rank: 2 })
  record.composition.groupDefinitions = [{
    id: 'group',
    name: 'Group',
    patternInstances: [{
      id: 'slot', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: {},
    }],
    layers: [{ id: 'local-layer', name: 'Local', rank: 0 }],
    clips: [{
      id: 'child', instanceId: 'slot', layerId: 'local-layer', startMs: 0, durationMs: 200,
      zoneSampleMode: 'span', entryPolicy: 'restart',
      appearance: { keys: [{ id: 'child-key', timeMs: 0, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
    }],
    transitions: [],
    propertyTracks: [],
  }]
  record.composition.groupOccurrences = [{
    id: 'use', definitionId: 'group', layoutOccurrenceId: 'lo', zoneId: 'zone', startMs: 200,
    translationX: 0, translationY: 0,
    layerBindings: [{ definitionLayerId: 'local-layer', layerId: 'group-layer' }],
    holds: [],
  }]
  return record
}

function captureFor(record: ShowRecordV2, userPatterns: Array<{ id: string; name: string }> = []): ShowV2TimelineCapture {
  return {
    record,
    dependencies: { patterns: userPatterns } as unknown as ShowV2TimelineCapture['dependencies'],
    prepared: { status: 'refused', record } as unknown as ShowV2TimelineCapture['prepared'],
  }
}

function sequentialIds(): () => string {
  let next = 0
  return () => `fresh-${++next}`
}

function enabledPlan(record: ShowRecordV2, layerId: string, globalTimeMs: number): ShowV2ClipAddPlanReady {
  const plan = planShowV2ClipAtTime(record, { zoneId: 'zone', layerId, globalTimeMs })
  if (!plan.enabled) throw new Error(`Expected an enabled plan: ${plan.reason}`)
  return plan
}

describe('planShowV2ClipAtTime', () => {
  it('plans the default duration on free time', () => {
    const plan = planShowV2ClipAtTime(emptyLongRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 1_000 })
    expect(plan).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 1_000, durationMs: 5_000 })
  })

  it('clamps the room at the next Clip on the Layer', () => {
    const record = emptyLongRecord()
    record.composition.clips = [authoredClip('next', MAIN, 3_000, 2_000)]
    const plan = planShowV2ClipAtTime(record, { zoneId: 'zone', layerId: MAIN, globalTimeMs: 1_000 })
    expect(plan).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 1_000, durationMs: 2_000 })
  })

  it('clamps the room at a visual Transition window start', () => {
    const plan = planShowV2ClipAtTime(transitionRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 2_500 })
    expect(plan).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 2_500, durationMs: 500 })
  })

  it('clamps the room at the end of Zone availability', () => {
    const plan = planShowV2ClipAtTime(splitAvailabilityRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 4_000 })
    expect(plan).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 4_000, durationMs: 1_000 })
  })

  it('clamps the room at Show End', () => {
    const plan = planShowV2ClipAtTime(emptyLongRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 19_000 })
    expect(plan).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 19_000, durationMs: 1_000 })
  })

  it('refuses exactly at Show End with no empty time', () => {
    const plan = planShowV2ClipAtTime(emptyLongRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 20_000 })
    expect(plan).toEqual({ enabled: false, reason: 'There is no empty time on the selected Layer.' })
  })

  it('refuses inside a visual Transition window', () => {
    const plan = planShowV2ClipAtTime(transitionRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 3_500 })
    expect(plan).toEqual({ enabled: false, reason: 'A Clip cannot begin inside a Transition.' })
  })

  it('refuses on an occupied Layer', () => {
    const record = emptyLongRecord()
    record.composition.clips = [authoredClip('cover', MAIN, 0, 1_000)]
    const plan = planShowV2ClipAtTime(record, { zoneId: 'zone', layerId: MAIN, globalTimeMs: 500 })
    expect(plan).toEqual({ enabled: false, reason: 'The selected Layer already has a Clip at the playhead.' })
  })

  it('refuses on a Layer covered by a Group Clip', () => {
    const free = planShowV2ClipAtTime(groupRecord(), { zoneId: 'zone', layerId: 'group-layer', globalTimeMs: 100 })
    expect(free.enabled).toBe(true)
    const covered = planShowV2ClipAtTime(groupRecord(), { zoneId: 'zone', layerId: 'group-layer', globalTimeMs: 250 })
    expect(covered).toEqual({ enabled: false, reason: 'The selected Layer already has a Clip at the playhead.' })
  })

  it('refuses when the Zone is unavailable at the playhead', () => {
    const plan = planShowV2ClipAtTime(splitAvailabilityRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 6_000 })
    expect(plan).toEqual({ enabled: false, reason: 'The selected Zone has no Layer at the playhead.' })
  })

  it('refuses when the Layer is not in the Zone', () => {
    const plan = planShowV2ClipAtTime(emptyLongRecord(), { zoneId: 'zone', layerId: 'elsewhere', globalTimeMs: 1_000 })
    expect(plan).toEqual({ enabled: false, reason: 'The selected Zone has no Layer at the playhead.' })
  })

  it('refuses non-finite and negative times', () => {
    const record = emptyLongRecord()
    expect(planShowV2ClipAtTime(record, { zoneId: 'zone', layerId: MAIN, globalTimeMs: Number.NaN }))
      .toEqual({ enabled: false, reason: 'Choose a time inside the Show.' })
    expect(planShowV2ClipAtTime(record, { zoneId: 'zone', layerId: MAIN, globalTimeMs: -5 }))
      .toEqual({ enabled: false, reason: 'Choose a time before Show End.' })
    expect(planShowV2ClipAtTime(record, { zoneId: 'zone', layerId: MAIN, globalTimeMs: 20_001 }))
      .toEqual({ enabled: false, reason: 'Choose a time before Show End.' })
  })
})

describe('planShowV2ClipAtTopmostAvailableLayer', () => {
  it('picks the highest-rank free Layer', () => {
    const plan = planShowV2ClipAtTopmostAvailableLayer(emptyLongRecord(), { zoneId: 'zone', globalTimeMs: 1_000 })
    expect(plan?.layerId).toBe(OVERLAY)
  })

  it('falls to a lower Layer when the top is occupied', () => {
    const record = emptyLongRecord()
    record.composition.clips = [authoredClip('top-cover', OVERLAY, 0, 2_000)]
    const plan = planShowV2ClipAtTopmostAvailableLayer(record, { zoneId: 'zone', globalTimeMs: 1_000 })
    expect(plan?.layerId).toBe(MAIN)
  })

  it('returns null when every Layer is occupied', () => {
    const record = emptyLongRecord()
    record.composition.clips = [
      authoredClip('top-cover', OVERLAY, 0, 2_000),
      authoredClip('main-cover', MAIN, 0, 2_000),
    ]
    expect(planShowV2ClipAtTopmostAvailableLayer(record, { zoneId: 'zone', globalTimeMs: 1_000 })).toBeNull()
  })
})

describe('createShowV2AddClipIntent', () => {
  it('builds a first runtime the owner accepts', () => {
    const record = emptyLongRecord()
    const plan = enabledPlan(record, MAIN, 100)
    const built = createShowV2AddClipIntent(
      captureFor(record, [{ id: 'pip', name: 'Pip' }]),
      plan,
      { pattern: { kind: 'user', id: 'pip' }, patternName: 'Pip' },
      sequentialIds(),
    )
    expect(built.status).toBe('ready')
    if (built.status !== 'ready') throw new Error('Expected a ready intent.')
    expect(built.clipId).toBe(built.intent.clip.id)
    expect(built.intent.runtime).toMatchObject({ kind: 'first' })
    const result = createShowClipV2(record, built.intent)
    expect(result.status, JSON.stringify(result)).toBe('changed')
  })

  it('reuses the sole existing runtime the owner accepts', () => {
    const record = baseRecord()
    record.composition.showEndMs = 2_000
    record.composition.layoutOccurrences = [
      { id: 'lo', layoutId: 'layout', startMs: 0, durationMs: 2_000, parameters: {} },
    ]
    const plan = enabledPlan(record, MAIN, 1_500)
    expect(plan.durationMs).toBe(500)
    const built = createShowV2AddClipIntent(
      captureFor(record),
      plan,
      { pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D' },
      sequentialIds(),
    )
    expect(built.status).toBe('ready')
    if (built.status !== 'ready') throw new Error('Expected a ready intent.')
    expect(built.intent.runtime).toEqual({ kind: 'existing', instanceId: 'instance' })
    const result = createShowClipV2(record, built.intent)
    expect(result.status, JSON.stringify(result)).toBe('changed')
  })

  it('refuses when several runtimes exist without a choice', () => {
    const record = baseRecord()
    record.composition.patternInstances.push({ ...structuredClone(record.composition.patternInstances[0]), id: 'instance-two' })
    const plan = enabledPlan(record, OVERLAY, 100)
    const built = createShowV2AddClipIntent(
      captureFor(record),
      plan,
      { pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D' },
      sequentialIds(),
    )
    expect(built).toEqual({ status: 'refused', message: 'Select one existing runtime for this Pattern source.' })
  })
})
