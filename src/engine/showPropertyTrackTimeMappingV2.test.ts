import { expect, it } from 'vitest'
import type { ShowPropertyTrackV2 } from './showCompositionV2'
import { evaluateShowPropertyKeysV2, insertTimeInPropertyTracksV2 } from './showPropertyTrackTimeMappingV2'

it('holds an exact discontinuous last key and keeps its authored identity on the right', () => {
  const tracks: ShowPropertyTrackV2[] = [{
    id: 'track', target: { kind: 'show-repeat-scale' }, activeStartMs: 0, activeDurationMs: 200,
    keyframes: [
      { id: 'track:hold:100', timeMs: 0, value: 0, easing: { curve: 'hold', at: 1 } },
      { id: 'authored-last', timeMs: 100, value: 1, easing: { curve: 'linear' } },
    ],
  }]
  const before = structuredClone(tracks)

  const result = insertTimeInPropertyTracksV2(tracks, 200, 100, 50)
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return

  const mapped = result.propertyTracks[0]
  expect(mapped.activeDurationMs).toBe(250)
  expect(mapped.keyframes.map(key => [key.id, key.timeMs, key.value])).toEqual([
    ['track:hold:100', 0, 0],
    ['track:hold:100:2', 100, 1],
    ['authored-last', 150, 1],
  ])
  expect(evaluateShowPropertyKeysV2(mapped.keyframes, 99)).toBe(0)
  expect(evaluateShowPropertyKeysV2(mapped.keyframes, 100)).toBe(1)
  expect(evaluateShowPropertyKeysV2(mapped.keyframes, 149)).toBe(1)
  expect(tracks).toEqual(before)
})

it('resumes a retained nonlinear descriptor from its exact source offset after a hold', () => {
  const tracks: ShowPropertyTrackV2[] = [{
    id: 'retained', target: { kind: 'show-repeat-scale' }, activeStartMs: 0, activeDurationMs: 250,
    keyframes: [
      {
        id: 'left', timeMs: 20, value: 0.209, easing: { curve: 'quadratic', direction: 'in' },
        curveSegment: {
          baseValue: 0.2, deltaValue: 0.6, easing: { curve: 'quadratic', direction: 'in' },
          sourceDurationMs: 200, elapsedOffsetMs: 10,
        },
      },
      { id: 'right', timeMs: 220, value: 0.8, easing: { curve: 'linear' } },
    ],
  }]

  const result = insertTimeInPropertyTracksV2(tracks, 250, 70, 25)
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const mapped = result.propertyTracks[0]
  expect(mapped.keyframes.find(key => key.id === 'retained:resume:95')?.curveSegment?.elapsedOffsetMs).toBe(60)
  expect(evaluateShowPropertyKeysV2(mapped.keyframes, 96)).toBeCloseTo(0.2 + 0.6 * (61 / 200) ** 2)
})

it.each([50, 150])('seeds constant hold/resume keys inside activation outside the authored key range at %i', atMs => {
  const tracks: ShowPropertyTrackV2[] = [{
    id: 'constant', target: { kind: 'show-repeat-scale' }, activeStartMs: 0, activeDurationMs: 200,
    keyframes: [
      { id: 'first', timeMs: 100, value: 1, easing: { curve: 'linear' } },
      { id: 'last', timeMs: 120, value: 2, easing: { curve: 'linear' } },
    ],
  }]
  const before = structuredClone(tracks)
  const result = insertTimeInPropertyTracksV2(tracks, 200, atMs, 25)
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') return
  const keys = result.propertyTracks[0].keyframes
  expect(keys.find(key => key.id === `constant:hold:${atMs}`)).toMatchObject({ timeMs: atMs, value: atMs === 50 ? 1 : 2 })
  expect(keys.find(key => key.id === `constant:resume:${atMs + 25}`)).toMatchObject({ timeMs: atMs + 25, value: atMs === 50 ? 1 : 2 })
  expect(keys.every(key => key.timeMs <= 225)).toBe(true)
  expect(evaluateShowPropertyKeysV2(keys, atMs + 24)).toBe(atMs === 50 ? 1 : 2)
  expect(tracks).toEqual(before)
})
