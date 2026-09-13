import { describe, expect, it } from 'vitest'
import { showCommandFixture } from '../../test/showCommandFixture'
import { projectShowUnifiedTimeline } from '../showUnifiedTimelineProjection'
import { applyShowCommand, type ShowCommandContext } from './registry'

const context: ShowCommandContext = {
  source: () => 'export function sliderSpeed(v) { speed = v }\nexport function render(index) { hsv(0, 1, 1) }',
  libraries: {},
}

function applyOk(record: ReturnType<typeof showCommandFixture>, name: string, input: Record<string, unknown>) {
  const outcome = applyShowCommand(record, name, input, context)
  expect(outcome.ok, JSON.stringify(outcome)).toBe(true)
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues))
  return outcome
}

function applyRefused(record: ReturnType<typeof showCommandFixture>, name: string, input: Record<string, unknown>) {
  const outcome = applyShowCommand(record, name, input, context)
  expect(outcome.ok).toBe(false)
  return outcome.ok ? [] : outcome.issues
}

function clips(record: ReturnType<typeof showCommandFixture>) {
  return projectShowUnifiedTimeline(record, record.composition!).zones.flatMap(zone =>
    zone.layers.flatMap(layer => layer.clips))
}

describe('bulk Clip and Layer authoring commands (#1021)', () => {
  it('creates several exactly configured Clips in one immutable command and maps ids to input order', () => {
    const before = showCommandFixture()
    const outcome = applyOk(before, 'create_clips', {
      schema_version: 1,
      clips: [
        {
          zone_id: 'zone-1', layer: 'main', start_ms: 32_000, duration_ms: 4_000,
          pattern: { kind: 'stock', id: 'CometLoom' },
          properties: {
            opacity: 0.8,
            view: { brightness: 0.7 },
            transform: { position_x: 0.2 },
            time: { time_scale: 1.5 },
            controls: { sliderSpeed: 0.4 },
          },
        },
        {
          zone_id: 'zone-1', layer: 'main', start_ms: 38_000, duration_ms: 3_000,
          pattern: { kind: 'stock', id: 'Rings' },
        },
      ],
    })

    expect(before).toEqual(showCommandFixture())
    expect(outcome.changes).toHaveLength(1)
    expect(outcome.changes[0].description).toBe('Created 2 Clips.')
    const results = outcome.changes[0].details?.results as Array<Record<string, unknown>>
    expect(results.map(result => result.inputIndex)).toEqual([0, 1])
    expect(new Set(results.map(result => result.clipId)).size).toBe(2)
    expect(new Set(results.map(result => result.instanceId)).size).toBe(2)
    expect(results.map(result => [result.startMs, result.durationMs])).toEqual([[32_000, 4_000], [38_000, 3_000]])
    const created = clips(outcome.record).filter(clip => results.some(result => result.clipId === clip.id))
    expect(created.map(clip => [clip.startMs, clip.durationMs])).toEqual([[32_000, 4_000], [38_000, 3_000]])
    const firstPlacement = outcome.record.composition!.scenes[1].zones[0].main.find(item => item.id === results[0].clipId)!
    const firstInstance = outcome.record.composition!.patternInstances.find(item => item.id === results[0].instanceId)!
    expect(firstPlacement).toMatchObject({ opacity: 0.8, view: { mirror: false, phase: 0, brightness: 0.7 }, transform: { positionX: 0.2, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 } })
    expect(firstInstance).toMatchObject({ time: { timeScale: 1.5, timeOffsetMs: 0 }, controlTargets: { sliderSpeed: 0.4 } })
  })

  it('creates ordered overlay Layers with nested Clips, keeping the first new Layer topmost', () => {
    const outcome = applyOk(showCommandFixture(), 'create_layers', {
      schema_version: 1,
      layers: [
        { zone_id: 'zone-1', clips: [{ start_ms: 32_000, duration_ms: 2_000, pattern: { kind: 'stock', id: 'Rings' } }] },
        { zone_id: 'zone-1', clips: [] },
      ],
    })
    expect(outcome.changes).toHaveLength(1)
    expect(outcome.changes[0].description).toBe('Created 2 Layers with 1 Clip.')
    const layers = outcome.changes[0].details?.layers as Array<Record<string, unknown>>
    expect(layers.map(layer => layer.inputIndex)).toEqual([0, 1])
    for (const scene of outcome.record.composition!.scenes) {
      const zone = scene.zones.find(candidate => candidate.zoneId === 'zone-1')!
      expect(zone.overlays.slice(0, 2).map(layer => layer.id)).toEqual(layers.map(layer => (layer.layerIdsBySceneId as Record<string, string>)[scene.sceneId]))
    }
  })

  it('applies simultaneous swaps and rotations from the original snapshot independent of update order', () => {
    const updates = [
      { clip_id: 'clip-a', start_ms: 12_000 },
      { clip_id: 'clip-b', start_ms: 22_000 },
      { clip_id: 'clip-c', start_ms: 0 },
    ]
    const forward = applyOk(showCommandFixture(), 'update_clips', { schema_version: 1, updates })
    const reverse = applyOk(showCommandFixture(), 'update_clips', { schema_version: 1, updates: [...updates].reverse() })
    const positions = (record: typeof forward.record) => clips(record)
      .filter(clip => clip.kind === 'main')
      .map(clip => [clip.id, clip.startMs, clip.durationMs])
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
    expect(positions(forward.record)).toEqual([
      ['clip-a', 12_000, 10_000],
      ['clip-b', 22_000, 8_000],
      ['clip-c', 0, 6_000],
    ])
    expect(positions(reverse.record)).toEqual(positions(forward.record))
    expect(forward.changes).toHaveLength(1)
    expect(forward.changes[0].details).toMatchObject({ directClipIds: ['clip-a', 'clip-b', 'clip-c'], linkedClipIds: [], changedPaths: ['start_ms'] })
  })

  it('rejects a final collision atomically with indexed issues', () => {
    const before = showCommandFixture()
    const issues = applyRefused(before, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-a', start_ms: 12_000 }],
    })
    expect(issues.some(issue => issue.code === 'occupied' && issue.path === '$.updates[0].start_ms')).toBe(true)
    expect(before).toEqual(showCommandFixture())
  })

  it('does not expose an arranged candidate when later property ownership validation refuses', () => {
    const before = showCommandFixture()
    const snapshot = structuredClone(before)
    const issues = applyRefused(before, 'update_clips', {
      schema_version: 1,
      updates: [{
        clip_id: 'clip-a',
        start_ms: 32_000,
        properties: { effects: [{ id: 'not-owned', kind: 'opacity', parameters: { opacity: 0.5 } }] },
      }],
    })
    expect(issues).toEqual([expect.objectContaining({ code: 'unknown-effect', path: '$.updates[0].properties.effects[0].id' })])
    expect(before).toEqual(snapshot)
  })

  it('coalesces disjoint and identical shared-instance patches but refuses canonical conflicts', () => {
    const combined = applyOk(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [
        { clip_id: 'clip-a', properties: { time: { time_offset_ms: 100.4 }, controls: { sliderSpeed: 0.5 } } },
        { clip_id: 'clip-c', properties: { time: { time_offset_ms: 100 }, evaluation_policy: 'rolling-refresh' } },
      ],
    })
    expect(combined.record.composition!.patternInstances.find(instance => instance.id === 'instance-a')).toMatchObject({
      time: { timeScale: 1, timeOffsetMs: 100 },
      evaluationPolicy: 'rolling-refresh',
      controlTargets: { sliderSpeed: 0.5 },
    })
    expect(combined.changes[0].details).toMatchObject({ directClipIds: ['clip-a', 'clip-c'], linkedClipIds: [] })

    const issues = applyRefused(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [
        { clip_id: 'clip-a', properties: { time: { time_scale: 0.5 } } },
        { clip_id: 'clip-c', properties: { time: { time_scale: 2 } } },
      ],
    })
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'shared-instance-conflict', path: '$.updates[0].properties.time.time_scale' }),
      expect.objectContaining({ code: 'shared-instance-conflict', path: '$.updates[1].properties.time.time_scale' }),
    ]))
  })

  it('refuses unsupported versions, unknown nested keys, empty patches, duplicates and empty collections', () => {
    expect(applyRefused(showCommandFixture(), 'create_clips', { schema_version: 2, clips: [] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unsupported-schema-version', path: '$.schema_version' })]))
    expect(applyRefused(showCommandFixture(), 'create_clips', {
      schema_version: 1,
      clips: [{ zone_id: 'zone-1', layer: 'main', start_ms: 1, duration_ms: 1, pattern: { kind: 'stock', id: 'Rings', surprise: true } }],
    })).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unknown-field', path: '$.clips[0].pattern.surprise' })]))
    expect(applyRefused(showCommandFixture(), 'create_clips', {
      schema_version: 1,
      clips: [{ zone_id: 'zone-1', layer: 'main', start_ms: 1, duration_ms: 1, pattern: { kind: 'stock', id: 'Rings', constructor: true } }],
    })).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unknown-field', path: '$.clips[0].pattern.constructor' })]))
    expect(applyRefused(showCommandFixture(), 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-a' }] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'empty-patch', path: '$.updates[0]' })]))
    expect(applyRefused(showCommandFixture(), 'update_clips', { schema_version: 1, updates: [{ clip_id: 'clip-a', start_ms: 1 }, { clip_id: 'clip-a', duration_ms: 2 }] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'duplicate-target', path: '$.updates[1].clip_id' })]))
    expect(applyRefused(showCommandFixture(), 'create_layers', { schema_version: 1, layers: [] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'empty-collection', path: '$.layers' })]))
  })

  it('accepts a valid same-value patch as a true no-op', () => {
    const before = showCommandFixture()
    const outcome = applyOk(before, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-a', properties: { view: { brightness: 1 } } }],
    })
    expect(outcome).toEqual({ ok: true, record: before, changes: [] })
  })

  it('treats omitted neutral defaults as no-ops but reports a newly enabled optional setting', () => {
    const before = showCommandFixture()
    const neutral = applyOk(before, 'update_clips', {
      schema_version: 1,
      updates: [{
        clip_id: 'clip-a',
        properties: { opacity: 1, transform: { position_x: 0 }, aperture: { enabled: false }, effects: [] },
      }],
    })
    expect(neutral).toEqual({ ok: true, record: before, changes: [] })

    const enabled = applyOk(before, 'update_clips', {
      schema_version: 1,
      updates: [{ clip_id: 'clip-a', properties: { blink: { rate_hz: 2 } } }],
    })
    expect(enabled.changes[0]).toMatchObject({
      description: 'Updated blink.rate_hz on 1 Clip.',
      details: { changedPaths: ['blink.rate_hz'] },
    })
  })

  it('collects independent shape, metadata and missing-target issues in one refusal', () => {
    const issues = applyRefused(showCommandFixture(), 'update_clips', {
      schema_version: 1,
      updates: [
        { clip_id: 'missing-a', properties: { view: { brightness: 2, surprise: true } } },
        { clip_id: 'missing-b', start_ms: 0 },
        { clip_id: 'clip-a', properties: { controls: { guessed: 0.5 } } },
      ],
    })
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-argument', path: '$.updates[0].properties.view.brightness' }),
      expect.objectContaining({ code: 'unknown-field', path: '$.updates[0].properties.view.surprise' }),
      expect.objectContaining({ code: 'unknown-clip', path: '$.updates[0].clip_id' }),
      expect.objectContaining({ code: 'unknown-clip', path: '$.updates[1].clip_id' }),
      expect.objectContaining({ code: 'unknown-control', path: '$.updates[2].properties.controls.guessed' }),
    ]))
  })
})
