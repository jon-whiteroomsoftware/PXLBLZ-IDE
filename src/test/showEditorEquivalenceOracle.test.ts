import { describe, expect, it } from 'vitest'
import {
  assessBehaviorPair,
  assessVisualPair,
  collectDifferingJsonPaths,
  compareRgbaPixels,
  normalizeShowEquivalenceRecord,
} from './showEditorEquivalenceOracle'

describe('Show editor equivalence oracle fault sensitivity', () => {
  it('rejects a one-channel pixel difference and a missing named surface', () => {
    expect(compareRgbaPixels(
      new Uint8ClampedArray([10, 20, 30, 255]),
      new Uint8ClampedArray([10, 20, 31, 255]),
    )).toEqual({ changedPixels: 1, maximumChannelDelta: 1 })
    expect(assessVisualPair({
      surface: 'timeline',
      v1: { present: true, x: 0, y: 0, width: 1, height: 1 },
      v2: { present: true, x: 0, y: 0, width: 1, height: 1 },
      changedPixels: 1,
      maximumChannelDelta: 1,
    })).toMatchObject({ equivalent: false, reason: 'pixels-differ' })

    expect(assessVisualPair({
      surface: 'Zone Map',
      v1: { present: true, x: 0, y: 0, width: 320, height: 200 },
      v2: { present: false },
    })).toMatchObject({ equivalent: false, reason: 'surface-missing' })
    expect(assessVisualPair({
      surface: 'v1 animation editor baseline',
      v1: { present: false },
      v2: { present: false },
    })).toMatchObject({ equivalent: false, reason: 'surface-missing' })
  })

  it('rejects empty pixels and incomplete capture evidence', () => {
    expect(() => compareRgbaPixels(new Uint8ClampedArray(), new Uint8ClampedArray()))
      .toThrow('non-empty')
    expect(assessVisualPair({
      surface: 'timeline',
      v1: { present: true, x: 0, y: 0, width: 1, height: 1 },
      v2: { present: true, x: 0, y: 0, width: 1, height: 1 },
    })).toMatchObject({ equivalent: false, reason: 'incomplete-evidence' })
    expect(assessVisualPair({
      surface: 'timeline',
      v1: { present: true, x: 0, y: 0, width: 0, height: 1 },
      v2: { present: true, x: 0, y: 0, width: 0, height: 1 },
      changedPixels: 0,
      maximumChannelDelta: 0,
    })).toMatchObject({ equivalent: false, reason: 'incomplete-evidence' })
    expect(assessVisualPair({
      surface: 'timeline',
      v1: { present: true, x: 0, y: 0, width: 10, height: 1 },
      v2: { present: true, x: 0, y: 0, width: 11, height: 1 },
    })).toMatchObject({ equivalent: false, reason: 'dimensions-differ' })
    expect(assessVisualPair({
      surface: 'property panel',
      v1: { present: true, x: 100, y: 20, width: 10, height: 10 },
      v2: { present: true, x: 101, y: 20, width: 10, height: 10 },
      changedPixels: 0,
      maximumChannelDelta: 0,
    })).toMatchObject({ equivalent: false, reason: 'geometry-differ' })
  })

  it('normalizes only row identity and ordering stamp', () => {
    const base = {
      id: 'v1-row',
      name: 'Same Show',
      updatedAt: 10,
      composition: { clips: [{ id: 'clip', startMs: 1_000 }] },
    }
    expect(normalizeShowEquivalenceRecord(base)).toEqual(normalizeShowEquivalenceRecord({
      ...base,
      id: 'v2-row',
      updatedAt: 99,
    }))
    expect(normalizeShowEquivalenceRecord(base)).not.toEqual(normalizeShowEquivalenceRecord({
      ...base,
      composition: { clips: [{ id: 'clip', startMs: 1_001 }] },
    }))
    expect(normalizeShowEquivalenceRecord({ ...base, stageMapId: null })).not.toEqual(
      normalizeShowEquivalenceRecord(base),
    )
  })

  it('rejects unequal records, history depth, save count, or Undo restoration', () => {
    const valid = {
      convertedV1: { id: 'a', updatedAt: 1, name: 'Same', composition: { clips: [{ id: 'clip', startMs: 2_000 }] } },
      savedV2: { id: 'b', updatedAt: 2, name: 'Same', composition: { clips: [{ id: 'clip', startMs: 2_000 }] } },
      history: { v1: 1, v2: 1 },
      saves: { v1: 1, v2: 1 },
      reloadPreserved: { v1: true, v2: true },
      undoRestored: { v1: true, v2: true },
    }
    expect(assessBehaviorPair(valid)).toMatchObject({ equivalent: true })
    expect(assessBehaviorPair({ ...valid, savedV2: { ...valid.savedV2, name: 'Different' } })).toMatchObject({ equivalent: false })
    expect(assessBehaviorPair({ ...valid, history: { v1: 1, v2: 2 } })).toMatchObject({ equivalent: false })
    expect(assessBehaviorPair({ ...valid, saves: { v1: 1, v2: 0 } })).toMatchObject({ equivalent: false })
    expect(assessBehaviorPair({ ...valid, reloadPreserved: { v1: false, v2: true } })).toMatchObject({ equivalent: false })
    expect(assessBehaviorPair({ ...valid, undoRestored: { v1: true, v2: false } })).toMatchObject({ equivalent: false })
  })

  it('reports the exact set of differing JSON paths in ascending order', () => {
    expect(collectDifferingJsonPaths({ a: 1 }, { a: 1 })).toEqual([])
    expect(collectDifferingJsonPaths(
      { composition: { clips: [{ id: 'clip', startMs: 1_000 }] } },
      { composition: { clips: [{ startMs: 1_000, id: 'clip' }] } },
    )).toEqual([])
    expect(collectDifferingJsonPaths(
      { composition: { clips: [{ id: 'left', startMs: 0 }, { id: 'right', startMs: 500 }] } },
      { composition: { clips: [{ id: 'left', startMs: 0 }, { id: 'right', startMs: 501 }] } },
    )).toEqual(['$.composition.clips[1].startMs'])
    expect(collectDifferingJsonPaths(
      { b: 2, a: { keys: [{ id: 'x' }, { id: 'y' }] } },
      { b: 3, a: { keys: [{ id: 'x' }, { id: 'z' }] } },
    )).toEqual(['$.a.keys[1].id', '$.b'])
    expect(collectDifferingJsonPaths({ a: [1, 2] }, { a: [1] })).toEqual(['$.a'])
    expect(collectDifferingJsonPaths({ a: 1 }, { a: '1' })).toEqual(['$.a'])
    expect(collectDifferingJsonPaths({ a: 1 }, {})).toEqual(['$.a'])
  })

  it('split and conversion agree on right-half appearance-key ids', () => {
    const appearanceKeyId = (clipId: string, index: number): string => `${clipId}:appearance:${index + 1}`
    const leftClipId = 'clip'
    const rightClipId = '__split-right-clip__'
    const left = { id: leftClipId, appearance: { keys: [{ id: appearanceKeyId(leftClipId, 0) }] } }
    const convertedRight = { id: rightClipId, appearance: { keys: [{ id: appearanceKeyId(rightClipId, 0) }] } }
    const splitRight = { id: rightClipId, appearance: { keys: [{ id: `${rightClipId}:appearance:1` }] } }
    expect(collectDifferingJsonPaths(
      { composition: { clips: [left, convertedRight] } },
      { composition: { clips: [left, splitRight] } },
    )).toEqual([])
    const regressedRight = { id: rightClipId, appearance: { keys: [{ id: appearanceKeyId(leftClipId, 0) }] } }
    expect(collectDifferingJsonPaths(
      { composition: { clips: [left, convertedRight] } },
      { composition: { clips: [left, regressedRight] } },
    )).toEqual(['$.composition.clips[1].appearance.keys[0].id'])
  })
})
