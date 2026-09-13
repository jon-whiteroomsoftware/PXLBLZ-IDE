import { describe, expect, it } from 'vitest'
import { boundaryFreeTrackedFixture, showCommandFixture, trackedCommandFixture } from '../../test/showCommandFixture'
import { showOverlayLayerFixture } from '../../test/showOverlayLayerFixture'
import type { ShowRecord } from '../personalContentRecords'
import { projectShowUnifiedTimeline } from '../showUnifiedTimelineProjection'
import { applyShowCommand, type ShowCommandContext } from './registry'

const source = 'export function sliderSpeed(v) { speed = v }\nexport function sliderDensity(v) { density = v }\nexport function render(index) { hsv(0, 1, 1) }'
const context: ShowCommandContext = { source: pattern => pattern.id === 'missing' ? undefined : source, libraries: {} }

function accepted(record: ShowRecord, name: string, input: Record<string, unknown>) {
  const outcome = applyShowCommand(record, name, input, context)
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues))
  return outcome
}

function refused(record: ShowRecord, name: string, input: Record<string, unknown>) {
  const outcome = applyShowCommand(record, name, input, context)
  expect(outcome.ok).toBe(false)
  return outcome.ok ? [] : outcome.issues
}

function withSecondZone(): ShowRecord {
  const show = showCommandFixture()
  show.zones.push({ id: 'zone-2', name: 'Zone 2', nominalPixelCount: 60 })
  for (const scene of show.composition!.scenes) scene.zones.push({ zoneId: 'zone-2', main: [], overlays: [] })
  return show
}

function withImplicitGroupShell(): ShowRecord {
  const show = showOverlayLayerFixture()
  const composition = show.composition!
  const zone = composition.scenes[0].zones.find(candidate => candidate.zoneId === 'zone-1')!
  zone.overlays[1].placements = zone.overlays[0].placements
  zone.overlays[0].placements = []
  composition.groupOccurrences = [{
    ...composition.groupOccurrences![0],
    id: 'high-group',
    sceneId: 'scene-1',
    startMs: 29_000,
    baseLayer: 2,
  }]
  return show
}

function projectedClip(record: ShowRecord, clipId: string) {
  return projectShowUnifiedTimeline(record, record.composition!).zones
    .flatMap(zone => zone.layers.flatMap(layer => layer.clips))
    .find(clip => clip.id === clipId)
}

describe('bulk Clip/Layer authoring acceptance partitions', () => {
  it('creates one Clip with neutral defaults and refuses an unavailable Pattern atomically', () => {
    const before = showCommandFixture()
    const outcome = accepted(before, 'create_clips', {
      schema_version: 1,
      clips: [{ zone_id: 'zone-1', layer: 'main', start_ms: 32_000, duration_ms: 1_000, pattern: { kind: 'stock', id: 'Rings' } }],
    })
    const result = (outcome.changes[0].details!.results as Array<Record<string, string>>)[0]
    const placement = outcome.record.composition!.scenes[1].zones[0].main.find(candidate => candidate.id === result.clipId)
    const instance = outcome.record.composition!.patternInstances.find(candidate => candidate.id === result.instanceId)
    expect(placement).toEqual(expect.objectContaining({ view: { mirror: false, phase: 0, brightness: 1 } }))
    expect(instance).toEqual(expect.objectContaining({ time: { timeScale: 1, timeOffsetMs: 0 } }))
    expect(instance).not.toHaveProperty('evaluationPolicy')

    expect(refused(before, 'create_clips', {
      schema_version: 1,
      clips: [{ zone_id: 'zone-1', layer: 'main', start_ms: 32_000, duration_ms: 1_000, pattern: { kind: 'stock', id: 'missing' } }],
    })).toEqual([expect.objectContaining({ code: 'unknown-pattern', path: '$.clips[0].pattern' })])
    expect(before.updatedAt).toBe(showCommandFixture().updatedAt)
  })

  it('creates new Layer arrays independently per Zone while retaining front-to-back order', () => {
    const outcome = accepted(withSecondZone(), 'create_layers', {
      schema_version: 1,
      layers: [
        { zone_id: 'zone-1', clips: [] },
        { zone_id: 'zone-2', clips: [{ start_ms: 32_000, duration_ms: 1_000, pattern: { kind: 'stock', id: 'Rings' } }] },
        { zone_id: 'zone-1', clips: [] },
      ],
    })
    const layers = outcome.changes[0].details!.layers as Array<Record<string, unknown>>
    for (const scene of outcome.record.composition!.scenes) {
      const zone1 = scene.zones.find(zone => zone.zoneId === 'zone-1')!
      const zone2 = scene.zones.find(zone => zone.zoneId === 'zone-2')!
      expect(zone1.overlays.slice(0, 2).map(layer => layer.id)).toEqual([0, 2].map(index => (layers[index].layerIdsBySceneId as Record<string, string>)[scene.sceneId]))
      expect(zone2.overlays[0].id).toBe((layers[1].layerIdsBySceneId as Record<string, string>)[scene.sceneId])
    }
  })

  it('applies every property family, then recursively patches and clears nested values', () => {
    const created = accepted(showCommandFixture(), 'create_clips', {
      schema_version: 1,
      clips: [{
        zone_id: 'zone-1', layer: 'main', start_ms: 32_000, duration_ms: 2_000,
        pattern: { kind: 'stock', id: 'Rings' },
        properties: {
          opacity: 0.6,
          view: { mirror: true, phase: 0.2, brightness: 0.7 },
          transform: { position_x: 0.1, position_y: -0.2, rotation: 0.25, scale_x: 2, scale_y: 0.5 },
          aperture: { enabled: true, x: 0.1, y: 0.2, width: 0.7, height: 0.6, aperture: 'star', edge: 'soft', feather: 0.02, rotation: 0.1, invert: true, star_points: 7, star_inner: 0.4 },
          effects: [{ kind: 'translate', parameters: { translateX: 0.25, translateY: -0.25 } }, { kind: 'brightness', parameters: { brightness: 1.2 } }],
          presentation: { mode: 'strobe', cadence_ms: 800 },
          blink: { rate_hz: 3, duty: 0.4, phase: 0.1 },
          time: { time_scale: 1.5, time_offset_ms: 20.6, light_shutter: { rate_hz: 6, duty: 0.6, phase: 0.2, clock_behavior: 'freeze' }, stepped_clock: { step_ms: 125 } },
          evaluation_policy: 'rolling-refresh',
          controls: { sliderSpeed: 0.4 },
        },
      }],
    })
    const ids = (created.changes[0].details!.results as Array<Record<string, string>>)[0]
    const scene = created.record.composition!.scenes[1]
    const placement = scene.zones[0].main.find(candidate => candidate.id === ids.clipId)!
    const instance = created.record.composition!.patternInstances.find(candidate => candidate.id === ids.instanceId)!
    expect(placement).toMatchObject({
      opacity: 0.6,
      view: { mirror: true, phase: 0.2, brightness: 0.7 },
      transform: { positionX: 0.1, positionY: -0.2, rotation: 0.25, scaleX: 2, scaleY: 0.5 },
      viewport: { enabled: true, aperture: 'star', starPoints: 7, starInner: 0.4 },
      presentation: { mode: 'strobe', cadenceMs: 800 },
      blink: { rateHz: 3, duty: 0.4, phase: 0.1 },
    })
    expect(placement.effects).toEqual([
      expect.objectContaining({ kind: 'translate', x: 0.25, y: -0.25 }),
      expect.objectContaining({ kind: 'brightness', brightness: 1.2 }),
    ])
    expect(instance).toMatchObject({
      time: { timeScale: 1.5, timeOffsetMs: 21, lightShutter: { rateHz: 6, duty: 0.6, phase: 0.2, clockBehavior: 'freeze' }, steppedClock: { stepMs: 125 } },
      evaluationPolicy: 'rolling-refresh', controlTargets: { sliderSpeed: 0.4 },
    })

    const patched = accepted(created.record, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: ids.clipId, properties: {
        aperture: { edge: null, feather: null },
        presentation: { cadence_ms: 500 },
        blink: { duty: 0.25 },
        time: { light_shutter: { phase: 0.75 }, stepped_clock: null },
        controls: { sliderSpeed: null },
        effects: [],
      } }],
    })
    const patchedPlacement = patched.record.composition!.scenes[1].zones[0].main.find(candidate => candidate.id === ids.clipId)!
    const patchedInstance = patched.record.composition!.patternInstances.find(candidate => candidate.id === ids.instanceId)!
    expect(patchedPlacement).toMatchObject({ viewport: { enabled: true, aperture: 'star', starPoints: 7 }, presentation: { mode: 'strobe', cadenceMs: 500 }, blink: { rateHz: 3, duty: 0.25, phase: 0.1 }, effects: [] })
    expect(patchedPlacement.viewport).not.toHaveProperty('edge')
    expect(patchedPlacement.viewport).not.toHaveProperty('feather')
    expect(patchedInstance).toMatchObject({ time: { lightShutter: { rateHz: 6, duty: 0.6, phase: 0.75, clockBehavior: 'freeze' } }, controlTargets: undefined })
    expect(patchedInstance.time.steppedClock).toBeUndefined()
  })

  it('coalesces disjoint partial light-shutter writes and reports original-to-final impact', () => {
    const enabled = accepted(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-a', properties: { time: { light_shutter: { rate_hz: 4 } } } }],
    })
    expect(enabled.record.composition!.patternInstances.find(instance => instance.id === 'instance-a')!.time.lightShutter)
      .toEqual({ rateHz: 4, duty: 0.5, phase: 0, clockBehavior: 'continue' })

    const outcome = accepted(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [
        { clip_id: 'clip-a', properties: { time: { light_shutter: { rate_hz: 4 } } } },
        { clip_id: 'clip-c', properties: { time: { light_shutter: { duty: 0.25 } } } },
      ],
    })
    expect(outcome.record.composition!.patternInstances.find(instance => instance.id === 'instance-a')!.time.lightShutter)
      .toEqual({ rateHz: 4, duty: 0.25, phase: 0, clockBehavior: 'continue' })
    expect(outcome.changes[0].details).toMatchObject({
      directClipIds: ['clip-a', 'clip-c'], linkedClipIds: [],
      changedInstanceIds: ['instance-a'],
      changedPaths: ['time.light_shutter.duty', 'time.light_shutter.rate_hz'],
    })

    const identical = accepted(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [
        { clip_id: 'clip-a', properties: { time: { time_scale: 0.5 } } },
        { clip_id: 'clip-c', properties: { time: { time_scale: 0.5 } } },
      ],
    })
    expect(identical.changes[0].details).toMatchObject({
      directClipIds: ['clip-a', 'clip-c'], linkedClipIds: [], changedInstanceIds: ['instance-a'],
    })

    expect(refused(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [
        { clip_id: 'clip-a', properties: { time: { light_shutter: null } } },
        { clip_id: 'clip-c', properties: { time: { light_shutter: { rate_hz: 4 } } } },
      ],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'shared-instance-conflict', path: '$.updates[0].properties.time.light_shutter' }),
      expect.objectContaining({ code: 'shared-instance-conflict', path: '$.updates[1].properties.time.light_shutter.rate_hz' }),
    ]))
  })

  it('deduplicates shared-instance fan-out and uses a named one-property summary', () => {
    const outcome = accepted(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-a', properties: { time: { time_scale: 0.5 } } }],
    })
    expect(outcome.changes).toEqual([expect.objectContaining({
      description: 'Updated speed on 1 Clip; 1 linked Clip also affected.',
      details: expect.objectContaining({ directClipIds: ['clip-a'], linkedClipIds: ['clip-c'], changedPaths: ['time.time_scale'] }),
    })])

    const linkedNoopTarget = accepted(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [
        { clip_id: 'clip-a', properties: { time: { time_scale: 0.5 } } },
        { clip_id: 'clip-c', properties: { opacity: 1 } },
      ],
    })
    expect(linkedNoopTarget.changes[0].details).toMatchObject({
      directClipIds: ['clip-a'], linkedClipIds: ['clip-c'], changedInstanceIds: ['instance-a'],
      results: [
        expect.objectContaining({ clipId: 'clip-a', status: 'changed' }),
        expect.objectContaining({ clipId: 'clip-c', status: 'no-op' }),
      ],
    })
  })

  it('clears a control, refuses unknown controls and validates finite timing boundaries', () => {
    const show = showCommandFixture()
    show.composition!.patternInstances[0].controlTargets = { sliderSpeed: 0.8 }
    const cleared = accepted(show, 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-a', properties: { controls: { sliderSpeed: null } } }] })
    expect(cleared.record.composition!.patternInstances[0].controlTargets).toBeUndefined()
    expect(refused(show, 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-a', properties: { controls: { guessed: 0.5 } } }] }))
      .toEqual([expect.objectContaining({ code: 'unknown-control', path: '$.updates[0].properties.controls.guessed' })])

    for (const [field, value] of [['start_ms', -1], ['start_ms', 0.5], ['start_ms', Number.MAX_SAFE_INTEGER + 1], ['duration_ms', 0], ['duration_ms', -1], ['duration_ms', 1.5]] as const) {
      const issues = refused(show, 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-a', [field]: value }] })
      expect(issues[0]).toMatchObject({ code: 'invalid-argument', path: `$.updates[0].${field}` })
    }
    expect(refused(show, 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-a', start_ms: 60_000 }] }))
      .toEqual([expect.objectContaining({ code: 'out-of-bounds', path: '$.updates[0].duration_ms' })])
  })

  it('supports an occupied two-Clip swap, move+resize and cross-Layer exchange', () => {
    const swapped = accepted(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-a', start_ms: 12_000, duration_ms: 8_000 }, { clip_id: 'clip-b', start_ms: 0, duration_ms: 10_000 }],
    })
    const scene = swapped.record.composition!.scenes[0].zones[0]
    expect(scene.main.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-b', 0, 10_000], ['clip-a', 12_000, 8_000], ['clip-c', 22_000, 6_000],
    ])

    const exchanged = accepted(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [
        { clip_id: 'clip-a', layer: 0, start_ms: 2_000, duration_ms: 6_000 },
        { clip_id: 'clip-ov', layer: 'main', start_ms: 0, duration_ms: 10_000 },
      ],
    })
    const exchangedZone = exchanged.record.composition!.scenes[0].zones[0]
    expect(exchangedZone.main[0]).toMatchObject({ id: 'clip-ov', startMs: 0, durationMs: 10_000 })
    expect(exchangedZone.overlays[0].placements[0]).toMatchObject({ id: 'clip-a', startMs: 2_000, durationMs: 6_000 })
  })

  it('refuses existing placement, sole-instance animation and connected Transition topology by name', () => {
    expect(refused(trackedCommandFixture(), 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-b', start_ms: 20_000 }] }))
      .toEqual([expect.objectContaining({ code: 'animated-placement' })])
    const instanceTracked = trackedCommandFixture()
    instanceTracked.composition!.scenes[0].propertyTracks = instanceTracked.composition!.scenes[0].propertyTracks!.filter(track => track.id === 'track-inst-b')
    expect(refused(instanceTracked, 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-b', start_ms: 20_000 }] }))
      .toEqual([expect.objectContaining({ code: 'animated-instance' })])
    const transitioned = showCommandFixture()
    transitioned.composition!.transitions = [{ id: 'transition-a-b', fromPlacementId: 'clip-a', toPlacementId: 'clip-b', kind: 'crossfade', durationMs: 2_000, easing: { curve: 'linear' } }]
    expect(refused(transitioned, 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-a', start_ms: 1_000 }] }))
      .toEqual([expect.objectContaining({ code: 'transition-owned' })])
    const trackedNoop = trackedCommandFixture()
    expect(accepted(trackedNoop, 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-b', start_ms: 12_000 }] }))
      .toEqual({ ok: true, record: trackedNoop, changes: [] })
    expect(accepted(transitioned, 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-a', start_ms: 0 }] }))
      .toMatchObject({ record: transitioned, changes: [] })
  })

  it('refuses a global span that would hide duration inside a visual Transition window', () => {
    expect(refused(showCommandFixture(), 'create_clips', {
      schema_version: 1,
      clips: [{ zone_id: 'zone-1', layer: 'main', start_ms: 28_000, duration_ms: 8_000, pattern: { kind: 'stock', id: 'Rings' } }],
    })).toEqual([expect.objectContaining({ code: 'occupied', path: '$.clips[0].start_ms' })])
  })

  it('preserves omitted per-segment values on a multi-Scene logical Clip', () => {
    const created = accepted(boundaryFreeTrackedFixture(), 'create_clips', {
      schema_version: 1,
      clips: [{ zone_id: 'zone-1', layer: 'main', start_ms: 28_000, duration_ms: 4_000, pattern: { kind: 'stock', id: 'Rings' } }],
    })
    const clipId = ((created.changes[0].details!.results as Array<Record<string, string>>)[0]).clipId
    const segments = created.record.composition!.scenes.flatMap(scene => scene.zones[0].main.filter(clip => (clip.logicalClipId ?? clip.id) === clipId))
    segments[0].transform = { positionX: 0, positionY: 0, rotation: 0, scaleX: 2, scaleY: 1 }
    segments[1].transform = { positionX: 0, positionY: 0, rotation: 0, scaleX: 3, scaleY: 1 }
    const patched = accepted(created.record, 'update_clips', { schema_version: 1, updates: [{ clip_id: clipId, properties: { transform: { position_x: 0.5 } } }] })
    const final = patched.record.composition!.scenes.flatMap(scene => scene.zones[0].main.filter(clip => (clip.logicalClipId ?? clip.id) === clipId))
    expect(final.map(clip => clip.transform)).toEqual([
      { positionX: 0.5, positionY: 0, rotation: 0, scaleX: 2, scaleY: 1 },
      { positionX: 0.5, positionY: 0, rotation: 0, scaleX: 3, scaleY: 1 },
    ])


    const divergent = structuredClone(created.record)
    const divergentSegments = divergent.composition!.scenes.flatMap(scene => scene.zones[0].main.filter(clip => (clip.logicalClipId ?? clip.id) === clipId))
    divergentSegments[0].presentation = { mode: 'strobe', cadenceMs: 800 }
    divergentSegments[1].presentation = { mode: 'strobe', cadenceMs: 1_200 }
    divergentSegments[0].blink = { rateHz: 3, duty: 0.4, phase: 0.1 }
    divergentSegments[1].blink = { rateHz: 4, duty: 0.6, phase: 0.2 }
    const nested = accepted(divergent, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: clipId, properties: { presentation: { cadence_ms: 500 }, blink: { duty: 0.25 } } }],
    })
    const nestedSegments = nested.record.composition!.scenes.flatMap(scene => scene.zones[0].main.filter(clip => (clip.logicalClipId ?? clip.id) === clipId))
    expect(nestedSegments.map(clip => clip.presentation)).toEqual([
      { mode: 'strobe', cadenceMs: 500 }, { mode: 'strobe', cadenceMs: 500 },
    ])
    expect(nestedSegments.map(clip => clip.blink)).toEqual([
      { rateHz: 3, duty: 0.25, phase: 0.1 }, { rateHz: 4, duty: 0.25, phase: 0.2 },
    ])
  })

  it('requires explicit IDs for ambiguous animated same-kind Effects and preserves them when supplied', () => {
    const show = showCommandFixture()
    show.composition!.scenes[0].zones[0].main[0].effects = [
      { id: 'opacity-a', kind: 'opacity', opacity: 0.2 },
      { id: 'opacity-b', kind: 'opacity', opacity: 0.8 },
    ]
    show.composition!.scenes[0].propertyTracks = [{
      id: 'effect-track', target: { kind: 'placement-effect', placementId: 'clip-a', effectId: 'opacity-a', effectKind: 'opacity', parameterId: 'opacity' },
      keyframes: [{ id: 'effect-kf', timeMs: 0, value: 0.2, easing: { curve: 'linear' } }],
    }]
    expect(refused(show, 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-a', properties: { effects: [{ kind: 'opacity', parameters: { opacity: 0.8 } }, { kind: 'opacity', parameters: { opacity: 0.2 } }] } }] }))
      .toEqual([expect.objectContaining({ code: 'ambiguous-effect-identity' })])
    const reordered = accepted(show, 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-a', properties: { effects: [{ id: 'opacity-b', kind: 'opacity', parameters: { opacity: 0.8 } }, { id: 'opacity-a', kind: 'opacity', parameters: { opacity: 0.2 } }] } }] })
    expect(reordered.record.composition!.scenes[0].zones[0].main[0].effects!.map(effect => effect.id)).toEqual(['opacity-b', 'opacity-a'])
    expect(reordered.record.composition!.scenes[0].propertyTracks![0].target).toMatchObject({ effectId: 'opacity-a' })
  })

  it('enforces the explicit finite batch limit without truncation', () => {
    const clips = Array.from({ length: 129 }, (_, index) => ({ zone_id: 'zone-1', layer: 'main', start_ms: index, duration_ms: 1, pattern: { kind: 'stock', id: 'Rings' } }))
    expect(refused(showCommandFixture(), 'create_clips', { schema_version: 1, clips }))
      .toEqual([expect.objectContaining({ code: 'batch-too-large', path: '$.clips' })])
  })

  it('collects independent reference failures with indexed paths', () => {
    expect(refused(showCommandFixture(), 'create_clips', {
      schema_version: 1,
      clips: [
        { zone_id: 'missing-zone', layer: 'main', start_ms: 0, duration_ms: 1, pattern: { kind: 'stock', id: 'missing' } },
        { zone_id: 'zone-1', layer: 'main', start_ms: 62_000, duration_ms: 1, pattern: { kind: 'stock', id: 'missing' } },
      ],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unknown-pattern', path: '$.clips[0].pattern' }),
      expect.objectContaining({ code: 'unknown-zone', path: '$.clips[0].zone_id' }),
      expect.objectContaining({ code: 'unknown-pattern', path: '$.clips[1].pattern' }),
      expect.objectContaining({ code: 'out-of-bounds', path: '$.clips[1].duration_ms' }),
    ]))

    expect(refused(showCommandFixture(), 'create_clips', {
      schema_version: 1,
      clips: [{ zone_id: 'zone-1', layer: 1, start_ms: 32_000, duration_ms: 1, pattern: { kind: 'stock', id: 'Rings' } }],
    })).toEqual([expect.objectContaining({ code: 'unknown-layer', path: '$.clips[0].layer' })])

    expect(refused(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [
        { clip_id: 'clip-a', zone_id: 'missing-zone' },
        { clip_id: 'clip-b', layer: 1 },
      ],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unknown-zone', path: '$.updates[0].zone_id' }),
      expect.objectContaining({ code: 'unknown-layer', path: '$.updates[1].layer' }),
    ]))
  })

  it('requires an overlay Layer in every Scene covered by a created or moved Clip', () => {
    const sparse = showCommandFixture()
    const create = (start_ms: number, duration_ms: number) => applyShowCommand(sparse, 'create_clips', {
      schema_version: 1,
      clips: [{ zone_id: 'zone-1', layer: 0, start_ms, duration_ms, pattern: { kind: 'stock', id: 'Rings' } }],
    }, context)
    expect(create(8_000, 1_000).ok).toBe(true)
    for (const [startMs, durationMs] of [[32_000, 1_000], [29_000, 4_000]]) {
      const outcome = create(startMs, durationMs)
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.issues).toEqual([
        expect.objectContaining({ code: 'unknown-layer', path: '$.clips[0].layer' }),
      ])
    }

    const move = (start_ms: number, duration_ms: number) => applyShowCommand(sparse, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-ov', layer: 0, start_ms, duration_ms }],
    }, context)
    expect(move(8_000, 1_000).ok).toBe(true)
    for (const [startMs, durationMs] of [[32_000, 1_000], [29_000, 4_000]]) {
      const outcome = move(startMs, durationMs)
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.issues).toEqual([
        expect.objectContaining({ code: 'unknown-layer', path: '$.updates[0].layer' }),
      ])
    }
  })

  it('uses materialized Layer identities around implicit Group shells without retargeting ordinary Clips', () => {
    const propertyBasis = withImplicitGroupShell()
    expect(projectedClip(propertyBasis, 'clip-ov')).toMatchObject({ layerId: 'bottom-scene-1', layerIndex: 2 })
    const property = accepted(propertyBasis, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-ov', properties: { view: { brightness: 0.5 } } }],
    })
    expect(projectedClip(property.record, 'clip-ov')).toMatchObject({
      layerId: 'bottom-scene-1',
      layerIndex: 2,
    })
    expect(property.record.composition!.scenes[0].zones[0].overlays[1].placements[0].view.brightness).toBe(0.5)

    const noopBasis = withImplicitGroupShell()
    expect(accepted(noopBasis, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-ov', properties: { view: { brightness: 1 } } }],
    })).toEqual({ ok: true, record: noopBasis, changes: [] })

    const timeMoved = accepted(withImplicitGroupShell(), 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-ov', start_ms: 10_000 }],
    })
    expect(projectedClip(timeMoved.record, 'clip-ov')).toMatchObject({
      layerId: 'bottom-scene-1',
      layerIndex: 2,
      startMs: 10_000,
    })

    const moved = accepted(withImplicitGroupShell(), 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-ov', layer: 1, start_ms: 10_000 }],
    })
    expect(projectedClip(moved.record, 'clip-ov')).toMatchObject({
      layerId: 'overlay-1',
      layerIndex: 1,
      startMs: 10_000,
    })

    const created = accepted(withImplicitGroupShell(), 'create_clips', {
      schema_version: 1,
      clips: [{ zone_id: 'zone-1', layer: 2, start_ms: 10_000, duration_ms: 1_000, pattern: { kind: 'stock', id: 'Rings' } }],
    })
    const createdId = (created.changes[0].details!.results as Array<Record<string, string>>)[0].clipId
    expect(projectedClip(created.record, createdId)).toMatchObject({
      layerId: 'bottom-scene-1',
      layerIndex: 2,
      startMs: 10_000,
    })
  })

  it('refuses implicit Group-only Layer destinations and Group-owned Clip updates by name', () => {
    const show = withImplicitGroupShell()
    expect(refused(show, 'create_clips', {
      schema_version: 1,
      clips: [{ zone_id: 'zone-1', layer: 0, start_ms: 10_000, duration_ms: 1_000, pattern: { kind: 'stock', id: 'Rings' } }],
    })).toEqual([expect.objectContaining({ code: 'unsupported-topology', path: '$.clips[0].layer' })])
    expect(refused(show, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-ov', layer: 0, start_ms: 10_000 }],
    })).toEqual([expect.objectContaining({ code: 'unsupported-topology', path: '$.updates[0].layer' })])

    const groupClip = projectShowUnifiedTimeline(show, show.composition!).zones
      .flatMap(zone => zone.layers.flatMap(layer => layer.clips))
      .find(clip => clip.groupOccurrenceId)!
    expect(refused(show, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: groupClip.id, properties: { opacity: 0.5 } }],
    })).toEqual([expect.objectContaining({ code: 'group-owned', path: '$.updates[0].clip_id' })])
  })
})
