import { describe, expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { createShowClipV2 } from './showClipCreationV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { addShowClipAtGlobalTimeExtendingShow } from './showTimelineClipAuthoring'
import type { ShowCompositionV1, ShowPatternInstance, ShowRecord } from './personalContentRecords'
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
    expect(plan).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 1_000, durationMs: 5_000, extendsShowEnd: false })
  })

  it('clamps the room at the next Clip on the Layer', () => {
    const record = emptyLongRecord()
    record.composition.clips = [authoredClip('next', MAIN, 3_000, 2_000)]
    const plan = planShowV2ClipAtTime(record, { zoneId: 'zone', layerId: MAIN, globalTimeMs: 1_000 })
    expect(plan).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 1_000, durationMs: 2_000, extendsShowEnd: false })
  })

  it('clamps the room at a visual Transition window start', () => {
    const plan = planShowV2ClipAtTime(transitionRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 2_500 })
    expect(plan).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 2_500, durationMs: 500, extendsShowEnd: false })
  })

  it('clamps the room at the end of Zone availability', () => {
    const plan = planShowV2ClipAtTime(splitAvailabilityRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 4_000 })
    expect(plan).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 4_000, durationMs: 1_000, extendsShowEnd: false })
  })

  it('clamps the room at Show End', () => {
    const plan = planShowV2ClipAtTime(emptyLongRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 19_000 })
    expect(plan).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 19_000, durationMs: 1_000, extendsShowEnd: false })
  })

  it('extends at Show End with the full default duration (#1091)', () => {
    const plan = planShowV2ClipAtTime(emptyLongRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 20_000 })
    expect(plan).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 20_000, durationMs: 5_000, extendsShowEnd: true })
    const custom = planShowV2ClipAtTime(emptyLongRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 20_000, defaultDurationMs: 2_000 })
    expect(custom).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 20_000, durationMs: 2_000, extendsShowEnd: true })
  })

  it('clips inside-Show time near the end without extending (#1091)', () => {
    const open = planShowV2ClipAtTime(emptyLongRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 18_000 })
    expect(open).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 18_000, durationMs: 2_000, extendsShowEnd: false })
    const record = emptyLongRecord()
    record.composition.clips = [authoredClip('tail', MAIN, 19_000, 1_000)]
    const blocked = planShowV2ClipAtTime(record, { zoneId: 'zone', layerId: MAIN, globalTimeMs: 18_000 })
    expect(blocked).toEqual({ enabled: true, zoneId: 'zone', layerId: MAIN, startMs: 18_000, durationMs: 1_000, extendsShowEnd: false })
  })

  it('refuses past Show End with the past-end message (#1091)', () => {
    const plan = planShowV2ClipAtTime(emptyLongRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 20_001 })
    expect(plan).toEqual({ enabled: false, reason: 'Choose a time before Show End.' })
  })

  it('refuses at Show End when the last Layout occurrence provides another Zone (#1091)', () => {
    const plan = planShowV2ClipAtTime(splitAvailabilityRecord(), { zoneId: 'zone', layerId: MAIN, globalTimeMs: 10_000 })
    expect(plan).toEqual({ enabled: false, reason: 'The selected Zone has no Layer at the playhead.' })
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

  it('carries extendShowEnd only for an extending plan (#1091)', () => {
    const record = emptyLongRecord()
    const inside = enabledPlan(record, MAIN, 100)
    expect(inside.extendsShowEnd).toBe(false)
    const builtInside = createShowV2AddClipIntent(
      captureFor(record, [{ id: 'pip', name: 'Pip' }]),
      inside,
      { pattern: { kind: 'user', id: 'pip' }, patternName: 'Pip' },
      sequentialIds(),
    )
    if (builtInside.status !== 'ready') throw new Error('Expected a ready intent.')
    expect('extendShowEnd' in builtInside.intent).toBe(false)
    const atEnd = enabledPlan(record, MAIN, 20_000)
    expect(atEnd.extendsShowEnd).toBe(true)
    const builtEnd = createShowV2AddClipIntent(
      captureFor(record, [{ id: 'pip', name: 'Pip' }]),
      atEnd,
      { pattern: { kind: 'user', id: 'pip' }, patternName: 'Pip' },
      sequentialIds(),
    )
    if (builtEnd.status !== 'ready') throw new Error('Expected a ready intent.')
    expect(builtEnd.intent.extendShowEnd).toBe(true)
    const result = createShowClipV2(record, builtEnd.intent)
    expect(result.status, JSON.stringify(result)).toBe('changed')
  })
})

describe('v1 Add Clip at Show End parity (#1091)', () => {
  function parityV1Input(): { show: ShowRecord; composition: ShowCompositionV1 } {
    const show = {
      id: 'parity-20k',
      name: 'Parity 20s',
      scenes: [{ id: 's1', name: 'S1', durationMs: 20_000 }],
      zones: [{ id: 'z1', name: 'Main', nominalPixelCount: 16 }],
      cells: [],
      routingLayouts: [{ id: 'layout', name: 'Full', zones: [], logical: { kind: 'single', zoneIds: ['z1'] } }],
      transitions: [],
      outputContract: {
        version: 1,
        kind: 'portable-2d',
        referenceMapId: 'plane',
        referencePixelCount: 16,
        compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
      },
      updatedAt: 1,
    } as unknown as ShowRecord
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [],
      scenes: [{ sceneId: 's1', zones: [{ zoneId: 'z1', main: [], overlays: [] }] }],
    }
    return { show, composition }
  }

  it('matches the converted v1 extension on Show End, layout and the new Clip', () => {
    const before = parityV1Input()
    const converted = convertShowRecordV1ToV2({ ...before.show, composition: before.composition })
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
    const record = converted.record
    const layerId = record.composition.layers.find((layer) => layer.zoneId === 'z1')!.id
    const plan = planShowV2ClipAtTime(record, { zoneId: 'z1', layerId, globalTimeMs: 20_000 })
    if (!plan.enabled) throw new Error(`Expected an enabled plan: ${JSON.stringify(plan)}`)
    expect(plan.startMs).toBe(20_000)
    expect(plan.durationMs).toBe(5_000)
    expect(plan.extendsShowEnd).toBe(true)
    const built = createShowV2AddClipIntent(
      captureFor(record),
      plan,
      { pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D' },
      sequentialIds(),
    )
    if (built.status !== 'ready') throw new Error(`Expected a ready intent: ${JSON.stringify(built)}`)
    const created = createShowClipV2(record, built.intent)
    expect(created.status, JSON.stringify(created)).toBe('changed')
    if (created.status !== 'changed') throw new Error('Expected a changed record.')
    const viaPlanner = created.record
    const fresh = parityV1Input()
    const instance: ShowPatternInstance = {
      id: 'inst-9',
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }
    const v1After = addShowClipAtGlobalTimeExtendingShow(
      { ...fresh.show, composition: fresh.composition },
      fresh.composition,
      { zoneId: 'z1', globalTimeMs: 20_000, target: { kind: 'main' }, instance, placementId: 'clip-1' },
    )
    const scrubbed = structuredClone(v1After)
    if (scrubbed.composition && 'executionModel' in scrubbed.composition
      && (scrubbed.composition as { executionModel?: string }).executionModel === undefined) {
      delete (scrubbed.composition as { executionModel?: string }).executionModel
    }
    const convertedAfter = convertShowRecordV1ToV2(scrubbed)
    if (convertedAfter.status !== 'converted') throw new Error(JSON.stringify(convertedAfter))
    const viaV1 = convertedAfter.record
    expect(viaPlanner.composition.showEndMs).toBe(viaV1.composition.showEndMs)
    expect(viaPlanner.composition.showEndMs).toBe(25_000)
    const layoutOf = (value: ShowRecordV2) => [...value.composition.layoutOccurrences]
      .sort((left, right) => left.startMs - right.startMs)
      .map((occurrence) => ({ startMs: occurrence.startMs, durationMs: occurrence.durationMs }))
    expect(layoutOf(viaPlanner)).toEqual(layoutOf(viaV1))
    expect(layoutOf(viaPlanner)).toEqual([{ startMs: 0, durationMs: 25_000 }])
    const clipAtEnd = (value: ShowRecordV2) => value.composition.clips.find((clip) => clip.startMs === 20_000)!
    const planned = clipAtEnd(viaPlanner)
    const convertedClip = clipAtEnd(viaV1)
    expect(planned.zoneId).toBe(convertedClip.zoneId)
    expect(planned.layerId).toBe(convertedClip.layerId)
    expect(planned.startMs).toBe(20_000)
    expect(planned.durationMs).toBe(5_000)
    expect(convertedClip.startMs).toBe(20_000)
    expect(convertedClip.durationMs).toBe(5_000)
  })
})
