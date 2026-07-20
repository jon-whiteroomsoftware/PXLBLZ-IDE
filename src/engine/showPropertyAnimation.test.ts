import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import {
  addShowPropertyKeyframe,
  addShowPropertyTrack,
  deleteShowPropertyKeyframe,
  emitShowPropertyTrackExpression,
  evaluateShowPropertyTrack,
  moveShowPropertyKeyframe,
  normalizeShowPropertyTracks,
  propertyTargetKey,
  showPropertyTrackNeighbors,
  updateShowPropertyKeyframe,
  validateShowPropertyTracks,
} from './showPropertyAnimation'
import { showCubicBezierRuntimeSource } from './showEasing'
import type {
  ShowCompositionV1,
  ShowPropertyAnimationTrack,
  ShowRecord,
} from './personalContentRecords'

function fixture(): { show: ShowRecord; composition: ShowCompositionV1 } {
  const show = createDefaultShow('property-animation', 'Property animation', 1)
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [{
      id: 'instance-a',
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
      controlTargets: { sliderSpeed: 0.25 },
    }],
    scenes: [{
      sceneId: 'scene-1',
      propertyTracks: [],
      zones: [{
        zoneId: 'zone-1',
        main: [{
          id: 'placement-a',
          instanceId: 'instance-a',
          startMs: 0,
          durationMs: 30_000,
          view: { mirror: false, phase: 0, brightness: 1 },
          effects: [{ id: 'turn', kind: 'rotate', turns: 0 }],
        }],
        overlays: [{
          id: 'layer-a',
          name: 'Front',
          placements: [{
            id: 'overlay-a',
            instanceId: 'instance-a',
            startMs: 0,
            durationMs: 30_000,
            opacity: 0.8,
            view: { mirror: false, phase: 0, brightness: 0.7 },
          }],
        }],
      }],
    }],
  }
  return { show, composition }
}

function track(overrides: Partial<ShowPropertyAnimationTrack> = {}): ShowPropertyAnimationTrack {
  return {
    id: 'track-a',
    target: { kind: 'placement-opacity', placementId: 'overlay-a' },
    keyframes: [
      { id: 'key-a', timeMs: 0, value: 0, easing: { curve: 'linear' } },
      { id: 'key-b', timeMs: 1_000, value: 1, easing: { curve: 'linear' } },
    ],
    ...overrides,
  }
}

describe('Scene-local property animation (#490)', () => {
  it('evaluates linear, stepped, Hold, Bezier, and overshooting segments without clamping the curve', () => {
    expect(evaluateShowPropertyTrack(track(), 250)).toBeCloseTo(0.25)
    expect(evaluateShowPropertyTrack(track({
      keyframes: [
        { id: 'key-a', timeMs: 0, value: 0, easing: { curve: 'steps', steps: 4, position: 'end' } },
        { id: 'key-b', timeMs: 1_000, value: 1, easing: { curve: 'linear' } },
      ],
    }), 260)).toBeCloseTo(0.25)
    expect(evaluateShowPropertyTrack(track({
      keyframes: [
        { id: 'key-a', timeMs: 0, value: 0, easing: { curve: 'hold', at: 0.75 } },
        { id: 'key-b', timeMs: 1_000, value: 1, easing: { curve: 'linear' } },
      ],
    }), 700)).toBe(0)
    expect(evaluateShowPropertyTrack(track({
      keyframes: [
        { id: 'key-a', timeMs: 0, value: 0, easing: { curve: 'cubic-bezier', x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
        { id: 'key-b', timeMs: 1_000, value: 1, easing: { curve: 'linear' } },
      ],
    }), 500)).toBeCloseTo(0.5, 4)
    expect(evaluateShowPropertyTrack(track({
      keyframes: [
        { id: 'key-a', timeMs: 0, value: 0, easing: { curve: 'back', direction: 'out', overshoot: 1.7 } },
        { id: 'key-b', timeMs: 1_000, value: 1, easing: { curve: 'linear' } },
      ],
    }), 700)).toBeGreaterThan(1)
  })

  it('keeps the editor evaluator and emitted runtime expression equivalent for every easing family', () => {
    const easings: ShowPropertyAnimationTrack['keyframes'][number]['easing'][] = [
      { curve: 'linear' },
      { curve: 'steps', steps: 4, position: 'end' },
      { curve: 'hold', at: 0.6 },
      { curve: 'cubic-bezier', x1: 0.2, y1: -0.5, x2: 0.8, y2: 1.5 },
      { curve: 'back', direction: 'out', overshoot: 1.7 },
    ]
    for (const easing of easings) {
      const candidate = track({
        keyframes: [
          { id: 'key-a', timeMs: 100, value: 0.2, easing },
          { id: 'key-b', timeMs: 900, value: 0.8, easing: { curve: 'linear' } },
        ],
      })
      const expression = emitShowPropertyTrackExpression(candidate, 'atMs')
      const emitted = new Function(
        'atMs', 'floor', 'min', 'cos', 'PI',
        `${showCubicBezierRuntimeSource()}\nreturn ${expression}`,
      ) as (atMs: number, floor: typeof Math.floor, min: typeof Math.min, cos: typeof Math.cos, pi: number) => number
      for (const atMs of [0, 100, 250, 500, 899, 900, 1_200]) {
        expect(emitted(atMs, Math.floor, Math.min, Math.cos, Math.PI))
          .toBeCloseTo(
            evaluateShowPropertyTrack(candidate, atMs),
            typeof easing !== 'string' && easing.curve === 'cubic-bezier' ? 3 : 12,
          )
      }
    }
  })

  it('holds the nearest endpoint outside the authored keyframe range', () => {
    const value = track({
      keyframes: [
        { id: 'key-a', timeMs: 200, value: 0.2, easing: { curve: 'linear' } },
        { id: 'key-b', timeMs: 800, value: 0.8, easing: { curve: 'linear' } },
      ],
    })
    expect(evaluateShowPropertyTrack(value, 0)).toBe(0.2)
    expect(evaluateShowPropertyTrack(value, 1_000)).toBe(0.8)
  })

  it('normalizes track and keyframe order without inventing unanimated defaults', () => {
    const result = normalizeShowPropertyTracks([
      track({ id: 'track-z', keyframes: [...track().keyframes].reverse() }),
      track({ id: 'track-a', target: { kind: 'instance-time-scale', instanceId: 'instance-a' } }),
    ])
    expect(result!.map((candidate) => candidate.id)).toEqual(['track-a', 'track-z'])
    expect(result![1].keyframes.map((keyframe) => keyframe.id)).toEqual(['key-a', 'key-b'])
    expect(normalizeShowPropertyTracks(undefined)).toBeUndefined()
  })

  it('validates typed owners, local bounds, strict ordering, ranges, easing, and stable Effect identity', () => {
    const { show, composition } = fixture()
    const tracks: ShowPropertyAnimationTrack[] = [
      track({ id: 'missing-placement', target: { kind: 'placement-opacity', placementId: 'missing' } }),
      track({ id: 'bad-range', keyframes: [{ id: 'a', timeMs: 0, value: -1, easing: { curve: 'linear' } }, { id: 'b', timeMs: 100, value: 2, easing: { curve: 'linear' } }] }),
      track({ id: 'bad-time', keyframes: [{ id: 'a', timeMs: 50, value: 0, easing: { curve: 'linear' } }, { id: 'b', timeMs: 50, value: 1, easing: { curve: 'linear' } }, { id: 'c', timeMs: 40_000, value: 1, easing: { curve: 'linear' } }] }),
      track({ id: 'bad-easing', keyframes: [{ id: 'a', timeMs: 0, value: 0, easing: { curve: 'steps', steps: 0, position: 'end' } }, { id: 'b', timeMs: 100, value: 1, easing: { curve: 'linear' } }] }),
      track({ id: 'missing-effect', target: { kind: 'placement-effect', placementId: 'placement-a', effectId: 'turn', effectKind: 'rotate', parameterId: 'scaleX' } }),
      track({ id: 'wrong-effect-kind', target: { kind: 'placement-effect', placementId: 'placement-a', effectId: 'turn', effectKind: 'scale', parameterId: 'scaleX' } }),
      track({ id: 'missing-control', target: { kind: 'instance-control', instanceId: 'instance-a', exportName: 'notExported' } }),
    ]
    const issues = validateShowPropertyTracks(show, { ...composition, scenes: [{ ...composition.scenes[0], propertyTracks: tracks }] })
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-placement' }),
      expect.objectContaining({ code: 'out-of-bounds' }),
      expect.objectContaining({ code: 'unordered-keyframes' }),
      expect.objectContaining({ code: 'invalid-easing' }),
      expect.objectContaining({ code: 'missing-effect-parameter' }),
      expect.objectContaining({ code: 'effect-identity-mismatch' }),
      expect.objectContaining({ code: 'missing-control' }),
    ]))
  })

  it('validates stable placement Transform targets without requiring an Effect instance', () => {
    const { show, composition } = fixture()
    const transformTrack = track({
      target: { kind: 'placement-transform', placementId: 'placement-a', property: 'positionX' },
      keyframes: [
        { id: 'move-a', timeMs: 0, value: -1, easing: { curve: 'linear' } },
        { id: 'move-b', timeMs: 1_000, value: 1, easing: { curve: 'linear' } },
      ],
    })
    expect(validateShowPropertyTracks(show, {
      ...composition,
      scenes: [{ ...composition.scenes[0], propertyTracks: [transformTrack] }],
    })).toEqual([])
    expect(propertyTargetKey(transformTrack.target)).toBe('placement-transform:placement-a:positionX')
  })

  it('supports add-at-playhead, exact edit, move/delete, and previous/next navigation immutably', () => {
    const { show, composition } = fixture()
    const withTrack = addShowPropertyTrack(show, composition, 'scene-1', track())
    const withPoint = addShowPropertyKeyframe(show, withTrack, 'scene-1', 'track-a', {
      id: 'key-middle', timeMs: 500, value: 0.4, easing: { curve: 'linear' },
    })
    const edited = updateShowPropertyKeyframe(show, withPoint, 'scene-1', 'track-a', 'key-middle', {
      value: 0.6,
      easing: { curve: 'hold', at: 0.5 },
    })
    const moved = moveShowPropertyKeyframe(show, edited, 'scene-1', 'track-a', 'key-middle', 750)
    const currentTrack = moved.scenes[0].propertyTracks?.[0]
    expect(currentTrack?.keyframes).toMatchObject([
      { id: 'key-a', timeMs: 0 },
      { id: 'key-middle', timeMs: 750, value: 0.6, easing: { curve: 'hold' } },
      { id: 'key-b', timeMs: 1_000 },
    ])
    expect(showPropertyTrackNeighbors(currentTrack!, 'key-middle')).toEqual({ previousId: 'key-a', nextId: 'key-b' })
    expect(showPropertyTrackNeighbors(currentTrack!, 'key-a')).toEqual({ previousId: 'key-b', nextId: 'key-middle' })
    expect(showPropertyTrackNeighbors(currentTrack!, 'key-b')).toEqual({ previousId: 'key-middle', nextId: 'key-a' })
    expect(deleteShowPropertyKeyframe(moved, 'scene-1', 'track-a', 'key-middle').scenes[0].propertyTracks?.[0].keyframes)
      .toHaveLength(2)
    expect(composition.scenes[0].propertyTracks).toEqual([])
  })
})
