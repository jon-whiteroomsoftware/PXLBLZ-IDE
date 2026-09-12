import { describe, expect, it } from 'vitest'
import { applyShowCommand, runShowCommandTransaction, type ShowCommandContext } from './registry'
import { showAnimationCommandFixture } from '../../test/showAnimationCommandFixture'
import { showSplitClipFixture } from '../../test/showSplitClipFixture'
import { trackedCommandFixture } from '../../test/showCommandFixture'
import { projectShowUnifiedTimeline } from '../showUnifiedTimelineProjection'
import { createDefaultShow } from '../showModel'
import type { PatternRecord } from '../personalContentRecords'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '../showFileBundle'
import { compileShowForArtifact } from '../showPreviewArtifact'
import { createShim } from '../shim'
import { loadPattern } from '../loadPattern'

const controlContext: ShowCommandContext = {
  source: () => 'export function sliderSpeed(value) {} export function render(index) { rgb(0, 0, 0) }',
  libraries: {},
}

function expectRefused(
  record: ReturnType<typeof showAnimationCommandFixture>,
  input: Record<string, unknown>,
  code: string,
  context?: ShowCommandContext,
) {
  const before = structuredClone(record)
  const outcome = applyShowCommand(record, 'add_property_track', input, context)
  expect(outcome.ok).toBe(false)
  if (outcome.ok) return
  expect(outcome.issues[0].code).toBe(code)
  expect(record).toStrictEqual(before)
}

describe('expanded add_property_track animation authoring', () => {
  it('authors a three-key opacity shortcut and describes structured easing and ownership', () => {
    const fixture = showAnimationCommandFixture()
    const clip = fixture.composition!.scenes[0].zones[0].main.find((placement) => placement.id === 'clip-a')
    expect(clip).toBeDefined()
    clip!.startMs = 2_000
    clip!.durationMs = 5_000

    const outcome = applyShowCommand(
      fixture,
      'add_property_track', {
        target: 'opacity',
        clip_id: 'clip-a',
        keyframes: [
          { time_ms: 2_000, value: 0, easing: 'linear' },
          {
            time_ms: 4_000,
            value: 1,
            easing: { curve: 'quadratic', direction: 'out' },
          },
          { time_ms: 7_000, value: 0.25 },
        ],
      },
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.changes[0].details).toMatchObject({
      clipId: 'clip-a',
      ownership: 'placement',
      sceneId: 'scene-1',
      keyframes: [
          { timeMs: 2_000, structuredEasing: { curve: 'linear' } },
          {
            timeMs: 4_000,
            structuredEasing: { curve: 'quadratic', direction: 'out' },
          },
          { timeMs: 7_000, structuredEasing: { curve: 'linear' } },
        ],
    })
  })

  it.each([
    ['opacity', { kind: 'placement-opacity', placementId: 'clip-a' }],
    ['view-brightness', { kind: 'placement-view', placementId: 'clip-a', property: 'brightness' }],
    ['view-phase', { kind: 'placement-view', placementId: 'clip-a', property: 'phase' }],
    ['transform-position-x', { kind: 'placement-transform', placementId: 'clip-a', property: 'positionX' }],
    ['transform-position-y', { kind: 'placement-transform', placementId: 'clip-a', property: 'positionY' }],
    ['transform-rotation', { kind: 'placement-transform', placementId: 'clip-a', property: 'rotation' }],
    ['transform-scale-x', { kind: 'placement-transform', placementId: 'clip-a', property: 'scaleX' }],
    ['transform-scale-y', { kind: 'placement-transform', placementId: 'clip-a', property: 'scaleY' }],
    ['viewport-x', { kind: 'placement-viewport', placementId: 'clip-a', property: 'x' }],
    ['viewport-y', { kind: 'placement-viewport', placementId: 'clip-a', property: 'y' }],
    ['viewport-width', { kind: 'placement-viewport', placementId: 'clip-a', property: 'width' }],
    ['viewport-height', { kind: 'placement-viewport', placementId: 'clip-a', property: 'height' }],
  ])('maps %s to the persisted target', (target, expectedTarget) => {
    const outcome = applyShowCommand(
      showAnimationCommandFixture(),
      'add_property_track',
      { target, clip_id: 'clip-a', initial_value: target.includes('scale') || target.endsWith('width') || target.endsWith('height') ? 1 : 0 },
    )

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.changes[0].details).toMatchObject({
      clipId: 'clip-a',
      ownership: 'placement',
      target: expectedTarget,
    })
  })

  it('derives Effect identity from the placement and matches the persisted target form', () => {
    const shortcut = applyShowCommand(showAnimationCommandFixture(), 'add_property_track', {
      target: 'effect',
      clip_id: 'clip-a',
      effect_id: 'effect-a',
      parameter_id: 'brightness',
      initial_value: 0.6,
    })
    const persisted = applyShowCommand(showAnimationCommandFixture(), 'add_property_track', {
      target: {
        kind: 'placement-effect',
        placementId: 'clip-a',
        effectId: 'effect-a',
        effectKind: 'brightness',
        parameterId: 'brightness',
      },
      initial_value: 0.6,
    })

    expect(shortcut.ok).toBe(true)
    expect(persisted.ok).toBe(true)
    if (!shortcut.ok || !persisted.ok) return
    expect(shortcut.changes[0].details).toMatchObject({
      ownership: 'placement',
      clipId: 'clip-a',
      target: persisted.changes[0].details?.target,
    })

    expectRefused(showAnimationCommandFixture(), {
      target: 'effect', clip_id: 'clip-a', parameter_id: 'brightness', initial_value: 0.5,
    }, 'invalid-argument')
    expectRefused(showAnimationCommandFixture(), {
      target: 'effect', clip_id: 'clip-a', effect_id: 'missing', parameter_id: 'brightness', initial_value: 0.5,
    }, 'unknown-effect')
    const color = showAnimationCommandFixture()
    color.composition!.scenes[0].zones[0].main[0].effects!.push({
      id: 'color-map', kind: 'color-map', amount: 1,
      shadowR: 0, shadowG: 0, shadowB: 0,
      highlightR: 1, highlightG: 1, highlightB: 1,
    })
    expectRefused(color, {
      target: 'effect', clip_id: 'clip-a', effect_id: 'color-map', parameter_id: 'shadowColor', initial_value: 0.5,
    }, 'unknown-effect-parameter')
  })

  it('requires existing authored slider metadata and reports all affected logical Clips for control', () => {
    const outcome = applyShowCommand(showAnimationCommandFixture(), 'add_property_track', {
      target: 'control',
      clip_id: 'clip-a',
      control_export_name: 'sliderSpeed',
      initial_value: 0.5,
    }, controlContext)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.changes[0].details).toMatchObject({
      ownership: 'instance',
      clipId: 'clip-a',
      instanceId: 'instance-a',
      affectedClipIds: ['clip-a', 'clip-c'],
      target: { kind: 'instance-control', instanceId: 'instance-a', exportName: 'sliderSpeed' },
    })

    const absentSource: ShowCommandContext = { source: () => undefined, libraries: {} }
    expectRefused(showAnimationCommandFixture(), {
      target: 'control', clip_id: 'clip-a', control_export_name: 'sliderSpeed', initial_value: 0.5,
    }, 'unknown-control', absentSource)
    expectRefused(showAnimationCommandFixture(), {
      target: 'control', clip_id: 'clip-a', control_export_name: 'missing', initial_value: 0.5,
    }, 'unknown-control', controlContext)
    expectRefused(showAnimationCommandFixture(), {
      target: 'control', clip_id: 'clip-a', control_export_name: 'sliderSpeed', initial_value: 0.5,
    }, 'unknown-control', { source: () => { throw new Error('capture failed') }, libraries: {} })
    const unauthored = showAnimationCommandFixture()
    delete unauthored.composition!.patternInstances[0].controlTargets
    expectRefused(unauthored, {
      target: 'control', clip_id: 'clip-a', control_export_name: 'sliderSpeed', initial_value: 0.5,
    }, 'unknown-control', controlContext)
  })

  it('describes instance time-scale ownership on an overlay Clip', () => {
    const outcome = applyShowCommand(showAnimationCommandFixture(), 'add_property_track', {
      target: 'time-scale', clip_id: 'clip-ov', initial_value: 1.25,
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.changes[0].details).toMatchObject({
      ownership: 'instance',
      clipId: 'clip-ov',
      instanceId: 'instance-ov',
      affectedClipIds: ['clip-ov'],
    })
  })

  it('sorts many global keys after Scene-offset conversion and keeps inclusive endpoints', () => {
    const record = showSplitClipFixture()
    const outcome = applyShowCommand(record, 'add_property_track', {
      target: { kind: 'placement-opacity', placementId: 'clip-b--span-scene-2' },
      keyframes: [
        { time_ms: 60_000, value: 1 },
        { time_ms: 30_000, value: 0 },
        { time_ms: 45_000, value: 0.5, easing: 'ease-in-out' },
        { time_ms: 40_000, value: 0.25 },
        { time_ms: 50_000, value: 0.75 },
      ],
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.changes[0].details?.keyframes).toMatchObject([
      { timeMs: 30_000, structuredEasing: { curve: 'linear' } },
      { timeMs: 40_000 },
      { timeMs: 45_000, structuredEasing: { curve: 'quadratic', direction: 'in-out' } },
      { timeMs: 50_000 },
      { timeMs: 60_000 },
    ])
    expect(outcome.record.composition!.scenes[1].propertyTracks!
      .find((track) => track.target.kind === 'placement-opacity')?.keyframes.map((key) => key.timeMs))
      .toEqual([0, 10_000, 15_000, 20_000, 30_000])
  })

  it('resolves a shortcut from the Clip current owner after it moves to another Scene', () => {
    const moved = applyShowCommand(trackedCommandFixture(), 'move_clip', {
      clip_id: 'clip-b', start_ms: 34_000,
    })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const outcome = applyShowCommand(moved.record, 'add_property_track', {
      target: 'opacity', clip_id: 'clip-b', keyframes: [
        { time_ms: 34_000, value: 0 },
        { time_ms: 40_000, value: 1 },
      ],
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.changes[0].details).toMatchObject({ sceneId: 'scene-2', clipId: 'clip-b' })
    expect(outcome.record.composition!.scenes[1].propertyTracks!
      .find((track) => track.target.kind === 'placement-opacity')?.keyframes.map((key) => key.timeMs))
      .toEqual([2_000, 8_000])
  })

  it('refuses Group and multi-Scene logical Clips', () => {
    const grouped = showSplitClipFixture()
    const groupClipId = projectShowUnifiedTimeline(grouped, grouped.composition!).zones
      .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .find((clip) => clip.groupOccurrenceId)?.id
    expect(groupClipId).toBeDefined()
    expectRefused(grouped, {
      target: 'opacity', clip_id: groupClipId, initial_value: 0.5,
    }, 'group')
    expectRefused(showSplitClipFixture(), {
      target: 'opacity', clip_id: 'clip-b', initial_value: 0.5,
    }, 'multi-segment-clip')
  })

  it('refuses irrelevant shortcut selectors and selectors on persisted targets', () => {
    expectRefused(showAnimationCommandFixture(), {
      target: 'opacity', clip_id: 'clip-a', control_export_name: 'sliderSpeed', initial_value: 0.5,
    }, 'invalid-argument')
    expectRefused(showAnimationCommandFixture(), {
      target: 'control', clip_id: 'clip-a', control_export_name: 'sliderSpeed', effect_id: 'effect-a', initial_value: 0.5,
    }, 'invalid-argument', controlContext)
    expectRefused(showAnimationCommandFixture(), {
      target: { kind: 'placement-opacity', placementId: 'clip-a' }, effect_id: 'effect-a', initial_value: 0.5,
    }, 'invalid-argument')
  })

  it('validates global time before rounding, post-rounding collisions, value domains, and exact input choice', () => {
    expectRefused(showAnimationCommandFixture(), {
      target: 'opacity', clip_id: 'clip-a', keyframes: [{ time_ms: -0.1, value: 0 }, { time_ms: 1, value: 1 }],
    }, 'outside-scene')
    expectRefused(showAnimationCommandFixture(), {
      target: 'opacity', clip_id: 'clip-a', keyframes: [{ time_ms: 0.1, value: 0 }, { time_ms: 0.4, value: 1 }],
    }, 'duplicate-keyframe-time')
    expectRefused(showAnimationCommandFixture(), {
      target: 'opacity', clip_id: 'clip-a', initial_value: 1.01,
    }, 'engine-refused')
    expectRefused(showAnimationCommandFixture(), {
      target: 'opacity', clip_id: 'clip-a', initial_value: 0.5, keyframes: [{ time_ms: 0, value: 0 }, { time_ms: 1, value: 1 }],
    }, 'invalid-argument')
    expectRefused(showAnimationCommandFixture(), {
      target: 'opacity', clip_id: 'clip-a',
    }, 'invalid-argument')
  })

  it('refuses unknown, null, and wrongly typed nested keyframe fields without changing the record', () => {
    for (const [first, message] of [
      [{ time_ms: 0, value: 0, typo: true }, 'unknown field "typo"'],
      [{ time_ms: 0, value: null }, 'finite number fields'],
      [{ time_ms: '0', value: 0 }, 'finite number fields'],
      [{ time_ms: 0, value: 0, easing: null }, 'easing is invalid'],
    ] as const) {
      const fixture = showAnimationCommandFixture()
      const before = structuredClone(fixture)
      const outcome = applyShowCommand(fixture, 'add_property_track', {
        target: 'opacity',
        clip_id: 'clip-a',
        keyframes: [first, { time_ms: 10_000, value: 1 }],
      })

      expect(outcome.ok).toBe(false)
      if (outcome.ok) continue
      expect(outcome.issues[0].message).toContain('keyframes[0]')
      expect(outcome.issues[0].message).toContain(message)
      expect(fixture).toEqual(before)
    }
  })
})

describe('edit_property_keyframes atomic authoring', () => {
  it.each([
    { kind: 'instance-time-scale', instanceId: 'instance-ov' },
    { kind: 'instance-control', instanceId: 'instance-a', exportName: 'sliderSpeed' },
    { kind: 'placement-opacity', placementId: 'clip-ov' },
    { kind: 'placement-view', placementId: 'clip-a', property: 'phase' },
    { kind: 'placement-transform', placementId: 'clip-a', property: 'positionX' },
    { kind: 'placement-viewport', placementId: 'clip-a', property: 'x' },
    {
      kind: 'placement-effect', placementId: 'clip-a', effectId: 'effect-a',
      effectKind: 'brightness', parameterId: 'brightness',
    },
  ] as const)('revises the persisted $kind target without changing its ownership identity', (target) => {
    const context = target.kind === 'instance-control' ? controlContext : undefined
    const added = applyShowCommand(showAnimationCommandFixture(), 'add_property_track', {
      target,
      scene_id: 'scene-1',
      keyframes: [{ time_ms: 0, value: 0.2 }, { time_ms: 1000, value: 0.8 }],
    }, context)
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const trackId = added.changes[0].targetId!
    const beforeTrack = added.record.composition!.scenes[0].propertyTracks!
      .find((track) => track.id === trackId)!
    const outcome = applyShowCommand(added.record, 'edit_property_keyframes', {
      track_id: trackId,
      edits: [{ operation: 'update', keyframe_id: beforeTrack.keyframes[0].id, value: 0.3 }],
    }, context)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const afterTrack = outcome.record.composition!.scenes[0].propertyTracks!
      .find((track) => track.id === trackId)!
    expect(afterTrack.id).toBe(trackId)
    expect(afterTrack.target).toEqual(target)
    expect(afterTrack.keyframes.map((key) => key.value)).toEqual([0.3, 0.8])
  })

  it('plans a time swap and addition against the preimage, then sorts and validates once', () => {
    const record = trackedCommandFixture()
    const outcome = applyShowCommand(record, 'edit_property_keyframes', {
      track_id: 'track-b',
      edits: [
        { operation: 'update', keyframe_id: 'kf-1', time_ms: 19_000, easing: { curve: 'quadratic', direction: 'out' } },
        { operation: 'update', keyframe_id: 'kf-2', time_ms: 12_000 },
        { operation: 'add', time_ms: 15_000, value: 0.6, easing: 'ease-in' },
      ],
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const track = outcome.record.composition!.scenes[0].propertyTracks!
      .find((candidate) => candidate.id === 'track-b')!
    expect(track.keyframes.map((keyframe) => [keyframe.id, keyframe.timeMs, keyframe.value]))
      .toMatchObject([
        ['kf-2', 12_000, 0.2],
        [expect.any(String), 15_000, 0.6],
        ['kf-1', 19_000, 1],
      ])
    expect(outcome.changes).toHaveLength(1)
    expect(outcome.changes[0]).toMatchObject({
      command: 'edit_property_keyframes',
      targetId: 'track-b',
      details: {
        sceneId: 'scene-1',
        target: { kind: 'placement-view', placementId: 'clip-b', property: 'brightness' },
        ownership: 'placement',
        beforeKeyframeCount: 2,
        afterKeyframeCount: 3,
        results: [
          {
            inputIndex: 0,
            operation: 'update',
            keyframeId: 'kf-1',
            timeMs: 19_000,
            value: 1,
            structuredEasing: { curve: 'quadratic', direction: 'out' },
          },
          { inputIndex: 1, operation: 'update', keyframeId: 'kf-2', timeMs: 12_000, value: 0.2 },
          { inputIndex: 2, operation: 'add', keyframeId: expect.any(String), timeMs: 15_000, value: 0.6 },
        ],
        deletedKeyframeIds: [],
      },
    })
  })

  it('permits delete plus add at the same time and reports the generated id', () => {
    const outcome = applyShowCommand(trackedCommandFixture(), 'edit_property_keyframes', {
      track_id: 'track-b',
      edits: [
        { operation: 'delete', keyframe_id: 'kf-1' },
        { operation: 'add', time_ms: 12_000, value: 0.75 },
      ],
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const details = outcome.changes[0].details!
    expect(details.deletedKeyframeIds).toEqual(['kf-1'])
    expect(details.results).toMatchObject([
      { inputIndex: 0, operation: 'delete', keyframeId: 'kf-1' },
      { inputIndex: 1, operation: 'add', keyframeId: expect.any(String), timeMs: 12_000, value: 0.75 },
    ])
    const generatedId = (details.results as Array<{ keyframeId: string }>)[1].keyframeId
    expect(generatedId).not.toBe('kf-1')
  })

  it('composes create, revise, add, remove, and delete while transactions roll back a later refusal', () => {
    const created = applyShowCommand(showAnimationCommandFixture(), 'add_property_track', {
      target: 'opacity', clip_id: 'clip-a', keyframes: [
        { time_ms: 0, value: 0 },
        { time_ms: 5_000, value: 0.5 },
        { time_ms: 10_000, value: 1 },
      ],
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const trackId = created.changes[0].targetId!
    const keys = created.record.composition!.scenes[0].propertyTracks!
      .find((track) => track.id === trackId)!.keyframes
    const revised = applyShowCommand(created.record, 'edit_property_keyframes', {
      track_id: trackId,
      edits: [
        { operation: 'update', keyframe_id: keys[0].id, value: 0.1 },
        { operation: 'add', time_ms: 7_500, value: 0.75 },
        { operation: 'delete', keyframe_id: keys[1].id },
      ],
    })
    expect(revised.ok).toBe(true)
    if (!revised.ok) return
    const removed = applyShowCommand(revised.record, 'delete_property_track', { track_id: trackId })
    expect(removed.ok).toBe(true)
    if (removed.ok) expect(removed.record.composition!.scenes[0].propertyTracks!
      .some((track) => track.id === trackId)).toBe(false)

    const transactionSource = trackedCommandFixture()
    const transaction = runShowCommandTransaction(transactionSource, [
      { name: 'edit_property_keyframes', input: {
        track_id: 'track-b', edits: [{ operation: 'add', time_ms: 15_000, value: 0.5 }],
      } },
      { name: 'edit_property_keyframes', input: {
        track_id: 'track-b', edits: [{ operation: 'delete', keyframe_id: 'kf-1' }],
      } },
      { name: 'edit_property_keyframes', input: {
        track_id: 'track-b', edits: [{ operation: 'delete', keyframe_id: 'kf-2' }],
      } },
    ])
    expect(transaction).toMatchObject({ ok: false, step: 2, issues: [{ code: 'engine-refused' }] })
    expect(transactionSource).toEqual(trackedCommandFixture())
  })

  it('returns the original identity and no change for normalized update-only no-ops', () => {
    const record = trackedCommandFixture()
    const outcome = applyShowCommand(record, 'edit_property_keyframes', {
      track_id: 'track-b',
      edits: [{ operation: 'update', keyframe_id: 'kf-1', value: 1, easing: 'linear' }],
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.record).toBe(record)
    expect(outcome.changes).toEqual([])
  })

  it.each([
    ['empty', []],
    ['unknown field', [{ operation: 'add', time_ms: 14_000, value: 0.5, typo: true }]],
    ['null field', [{ operation: 'add', time_ms: 14_000, value: null }]],
    ['null easing', [{ operation: 'add', time_ms: 14_000, value: 0.5, easing: null }]],
    ['id on add', [{ operation: 'add', keyframe_id: 'caller-id', time_ms: 14_000, value: 0.5 }]],
    ['value on delete', [{ operation: 'delete', keyframe_id: 'kf-1', value: 0.5 }]],
    ['empty update', [{ operation: 'update', keyframe_id: 'kf-1' }]],
    ['unknown operation', [{ operation: 'replace', keyframe_id: 'kf-1', value: 0.5 }]],
  ])('refuses malformed %s edit arrays with the edit index', (_label, edits) => {
    const record = trackedCommandFixture()
    const before = structuredClone(record)
    const outcome = applyShowCommand(record, 'edit_property_keyframes', { track_id: 'track-b', edits })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.issues[0].code).toBe('invalid-argument')
    if (edits.length > 0) expect(outcome.issues[0].message).toContain('edits[0]')
    expect(record).toStrictEqual(before)
  })

  it('refuses duplicate existing-key references, wrong-track keys, collisions, and a final one-key track', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ track_id: 'track-b', edits: [
        { operation: 'update', keyframe_id: 'kf-1', value: 0.8 },
        { operation: 'delete', keyframe_id: 'kf-1' },
      ] }, 'duplicate-keyframe-reference'],
      [{ track_id: 'track-b', edits: [{ operation: 'update', keyframe_id: 'kf-3', value: 0.8 }] }, 'unknown-keyframe'],
      [{ track_id: 'track-b', edits: [{ operation: 'update', keyframe_id: 'kf-1', time_ms: 19_000 }] }, 'engine-refused'],
      [{ track_id: 'track-b', edits: [{ operation: 'delete', keyframe_id: 'kf-1' }] }, 'engine-refused'],
    ]
    for (const [input, code] of cases) {
      const record = trackedCommandFixture()
      const before = structuredClone(record)
      const outcome = applyShowCommand(record, 'edit_property_keyframes', input)
      expect(outcome.ok).toBe(false)
      if (outcome.ok) continue
      expect(outcome.issues[0].code).toBe(code)
      expect(record).toStrictEqual(before)
    }
  })

  it('accepts 128 edits, refuses 129, and edits a preexisting track with more than 128 keys', () => {
    const manyEdits = Array.from({ length: 128 }, (_, index) => ({
      operation: 'add', time_ms: index, value: 0.5,
    }))
    const accepted = applyShowCommand(trackedCommandFixture(), 'edit_property_keyframes', {
      track_id: 'track-b', edits: manyEdits,
    })
    expect(accepted.ok).toBe(true)

    const refused = applyShowCommand(trackedCommandFixture(), 'edit_property_keyframes', {
      track_id: 'track-b', edits: [...manyEdits, { operation: 'add', time_ms: 128, value: 0.5 }],
    })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.issues[0].code).toBe('invalid-argument')

    const existingMany = trackedCommandFixture()
    existingMany.composition!.scenes[0].propertyTracks![0].keyframes = Array.from({ length: 129 }, (_, index) => ({
      id: `many-${index}`,
      timeMs: index,
      value: 0.5,
      easing: { curve: 'linear' as const },
    }))
    const revised = applyShowCommand(existingMany, 'edit_property_keyframes', {
      track_id: 'track-b', edits: [{ operation: 'update', keyframe_id: 'many-64', value: 0.75 }],
    })
    expect(revised.ok).toBe(true)
  })

  it('revalidates orphan, control-source, and Effect dependencies before a no-op or edit', () => {
    const orphan = trackedCommandFixture()
    orphan.composition!.scenes[0].propertyTracks![0].target = {
      kind: 'placement-view', placementId: 'removed-placement', property: 'brightness',
    }
    const orphanOutcome = applyShowCommand(orphan, 'edit_property_keyframes', {
      track_id: 'track-b', edits: [{ operation: 'update', keyframe_id: 'kf-1', value: 1 }],
    })
    expect(orphanOutcome.ok).toBe(false)

    const control = showAnimationCommandFixture()
    control.composition!.scenes[0].propertyTracks!.push({
      id: 'control-track',
      target: { kind: 'instance-control', instanceId: 'instance-a', exportName: 'sliderSpeed' },
      keyframes: [
        { id: 'control-a', timeMs: 0, value: 0.25, easing: { curve: 'linear' } },
        { id: 'control-b', timeMs: 1000, value: 0.75, easing: { curve: 'linear' } },
      ],
    })
    const absent = applyShowCommand(control, 'edit_property_keyframes', {
      track_id: 'control-track', edits: [{ operation: 'update', keyframe_id: 'control-a', value: 0.3 }],
    }, { source: () => undefined, libraries: {} })
    expect(absent.ok).toBe(false)
    const valid = applyShowCommand(control, 'edit_property_keyframes', {
      track_id: 'control-track', edits: [{ operation: 'update', keyframe_id: 'control-a', value: 0.3 }],
    }, controlContext)
    expect(valid.ok).toBe(true)
    if (valid.ok) expect(valid.changes[0].details).toMatchObject({
      ownership: 'instance',
      instanceId: 'instance-a',
      affectedClipIds: ['clip-a', 'clip-c'],
    })

    const missingEffect = showAnimationCommandFixture()
    missingEffect.composition!.scenes[0].propertyTracks!.push({
      id: 'effect-track',
      target: {
        kind: 'placement-effect', placementId: 'clip-a', effectId: 'removed-effect',
        effectKind: 'brightness', parameterId: 'brightness',
      },
      keyframes: [
        { id: 'effect-a', timeMs: 0, value: 0.25, easing: { curve: 'linear' } },
        { id: 'effect-b', timeMs: 1000, value: 0.75, easing: { curve: 'linear' } },
      ],
    })
    const effectOutcome = applyShowCommand(missingEffect, 'edit_property_keyframes', {
      track_id: 'effect-track', edits: [{ operation: 'update', keyframe_id: 'effect-a', value: 0.3 }],
    })
    expect(effectOutcome.ok).toBe(false)
  })

  it('converts Scene-offset endpoints before rounding and refuses rounded collisions', () => {
    const record = showSplitClipFixture()
    const replaced = applyShowCommand(record, 'edit_property_keyframes', {
      track_id: 'tail-track',
      edits: [
        { operation: 'update', keyframe_id: 'tail-first', time_ms: 30_000 },
        { operation: 'update', keyframe_id: 'tail-last', time_ms: 60_000 },
      ],
    })
    expect(replaced.ok).toBe(true)
    if (replaced.ok) {
      expect(replaced.record.composition!.scenes[1].propertyTracks![0].keyframes.map((key) => key.timeMs))
        .toEqual([0, 30_000])
    }

    const beforeRound = applyShowCommand(record, 'edit_property_keyframes', {
      track_id: 'tail-track', edits: [{ operation: 'add', time_ms: 29_999.9, value: 0.5 }],
    })
    expect(beforeRound.ok).toBe(false)
    if (!beforeRound.ok) expect(beforeRound.issues[0].code).toBe('outside-scene')

    const collision = applyShowCommand(record, 'edit_property_keyframes', {
      track_id: 'tail-track', edits: [
        { operation: 'add', time_ms: 31_000.1, value: 0.5 },
        { operation: 'add', time_ms: 31_000.4, value: 0.6 },
      ],
    })
    expect(collision.ok).toBe(false)
    if (!collision.ok) expect(collision.issues[0].code).toBe('engine-refused')
  })

  it('survives the standard Show-file reopen and drives compiled endpoint and interior output', async () => {
    const pattern: PatternRecord = {
      id: 'animation-red',
      name: 'Animation Red',
      src: 'export function render(index) { rgb(1, 0, 0) }',
      controls: {},
      updatedAt: 1,
    }
    const show = createDefaultShow('animation-proof', 'Animation proof', 1)
    show.cells[0] = { ...show.cells[0], pattern: { kind: 'user', id: pattern.id }, patternName: pattern.name }
    show.transitions = [{
      id: 'animation-cut', afterSceneId: 'scene-1', kind: 'cut', durationMs: 0, easing: { curve: 'linear' },
    }]
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'animation-instance', pattern: { kind: 'user', id: pattern.id }, patternName: pattern.name,
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [{
        sceneId: 'scene-1',
        zones: [{
          zoneId: 'zone-1',
          main: [{
            id: 'animation-clip', instanceId: 'animation-instance', startMs: 0, durationMs: 30_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      }, {
        sceneId: 'scene-2',
        zones: [{ zoneId: 'zone-1', main: [], overlays: [] }],
      }],
    }

    const added = applyShowCommand(show, 'add_property_track', {
      target: 'opacity',
      clip_id: 'animation-clip',
      keyframes: [
        { time_ms: 0, value: 0 },
        { time_ms: 10_000, value: 0.5 },
        { time_ms: 20_000, value: 1 },
      ],
    })
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const trackId = added.changes[0].targetId!
    const middleId = added.record.composition!.scenes[0].propertyTracks![0].keyframes[1].id
    const revised = applyShowCommand(added.record, 'edit_property_keyframes', {
      track_id: trackId,
      edits: [{ operation: 'update', keyframe_id: middleId, value: 0.25 }],
    })
    expect(revised.ok).toBe(true)
    if (!revised.ok) return

    const { bundle } = buildShowFileBundle(
      revised.record,
      { patterns: [pattern], maps: [] },
      { appVersion: '1016-test', exportedAt: '2026-09-12T00:00:00Z' },
    )
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle))
    expect(reopened.show.composition).toEqual(revised.record.composition)

    const compiled = compileShowForArtifact(reopened.show, reopened.patterns, undefined, {})
    expect(compiled.error).toBeNull()
    const shim = createShim({ pixelCount: 60, dimensions: 1, mapPoints: [], getVirtualTime: () => 0 })
    const handle = loadPattern(compiled.artifact!.code, compiled.artifact!.metadata, shim.builtins)
    const redAt = (deltaMs: number) => {
      handle.beforeRender(deltaMs)
      handle.render(0)
      return shim.capturedPixel()[0]
    }
    expect(redAt(0)).toBeCloseTo(0, 6)
    expect(redAt(10_000)).toBeCloseTo(0.25, 5)
    expect(redAt(10_000)).toBeCloseTo(1, 5)
  })
})
