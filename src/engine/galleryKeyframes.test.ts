import { describe, expect, it } from 'vitest'
import {
  createFastReplayRuntime,
  decodeFastReplaySnapshot,
  encodeFastReplaySnapshot,
  prepareFastReplay,
} from './fastReplay'
import {
  GALLERY_KEYFRAME_FORMAT_VERSION,
  buildGalleryKeyframe,
  galleryKeyframeKey,
  galleryKeyframeMatches,
  restoreGalleryKeyframe,
  scoreKeyframe,
  selectGalleryKeyframe,
} from './galleryKeyframes'
import type { MapPoint } from './maps/types'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'

function gridPoints(size: number): MapPoint[] {
  const points: MapPoint[] = []
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      points.push({ sample: [x / (size - 1), y / (size - 1)] } as MapPoint)
    }
  }
  return points
}

describe('scoreKeyframe', () => {
  const black = new Float64Array(64 * 3)
  const white = new Float64Array(64 * 3).fill(1)
  const half = new Float64Array(64 * 3)
  for (let i = 0; i < 32 * 3; i += 1) half[i] = 1

  it('ranks structured lit frames above washes and washes above darkness', () => {
    expect(scoreKeyframe(black)).toBe(0)
    expect(scoreKeyframe(white)).toBeGreaterThan(0)
    expect(scoreKeyframe(half)).toBeGreaterThan(scoreKeyframe(white))
  })

  it('clamps out-of-range channels so an overdriven frame scores like a full-white one', () => {
    const overdriven = new Float64Array(64 * 3).fill(40)
    const negative = new Float64Array(64 * 3).fill(-3)
    expect(scoreKeyframe(overdriven)).toBeCloseTo(scoreKeyframe(white), 12)
    expect(scoreKeyframe(negative)).toBe(0)
  })

  it('treats an empty frame as unscorable', () => {
    expect(scoreKeyframe(new Float64Array(0))).toBe(0)
  })
})

describe('selectGalleryKeyframe', () => {
  it('picks the highest-scoring sample and records every sample', () => {
    // Scripted runtime: brightness rises then falls across the window.
    const frames: Record<number, Float64Array> = {
      0: new Float64Array(12),
      100: new Float64Array(12).fill(0.2),
      200: Float64Array.from([1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0]),
      300: new Float64Array(12).fill(0.1),
    }
    const visited: number[] = []
    const runtime = {
      advanceTo: (timeMs: number) => {
        visited.push(timeMs)
        return { frame: frames[timeMs] } as never
      },
    }
    const selection = selectGalleryKeyframe(runtime, { startMs: 0, endMs: 300, sampleMs: 100 })
    expect(visited).toEqual([0, 100, 200, 300])
    expect(selection.posterTimeMs).toBe(200)
    expect(selection.samples).toHaveLength(4)
    expect(selection.score).toBe(scoreKeyframe(frames[200]))
  })
})

describe('galleryKeyframeKey', () => {
  const points = gridPoints(4)
  it('changes with the code, the map, and the seed, and ignores sub-1e-4 map noise', () => {
    const base = galleryKeyframeKey({ code: 'a', mapPoints: points, randomSeed: 1 })
    expect(galleryKeyframeKey({ code: 'b', mapPoints: points, randomSeed: 1 })).not.toBe(base)
    expect(galleryKeyframeKey({ code: 'a', mapPoints: gridPoints(3), randomSeed: 1 })).not.toBe(base)
    expect(galleryKeyframeKey({ code: 'a', mapPoints: points, randomSeed: 2 })).not.toBe(base)
    const noisy = points.map((p) => ({ ...p, sample: p.sample.map((v) => v + 1e-7) }) as MapPoint)
    expect(galleryKeyframeKey({ code: 'a', mapPoints: noisy, randomSeed: 1 })).toBe(base)
  })

  it('matches only artifacts with the current version and the same key', () => {
    const key = galleryKeyframeKey({ code: 'a', mapPoints: points, randomSeed: 1 })
    const artifact = { version: GALLERY_KEYFRAME_FORMAT_VERSION, key } as never
    expect(galleryKeyframeMatches(artifact, key)).toBe(true)
    expect(galleryKeyframeMatches({ version: 0, key } as never, key)).toBe(false)
    expect(galleryKeyframeMatches(artifact, 'other')).toBe(false)
    expect(galleryKeyframeMatches(null, key)).toBe(false)
  })
})

describe('buildGalleryKeyframe', () => {
  const prepared = prepareFastReplay(DEMOS.TestPattern2D, LIBRARIES)
  const mapPoints = gridPoints(8)

  it('produces a JSON-safe artifact whose restored state continues exactly like the original run', () => {
    const artifact = buildGalleryKeyframe({ name: 'TestPattern2D', prepared, mapPoints, selection: { startMs: 100, endMs: 600, sampleMs: 250 } })
    expect(artifact.posterTimeMs).toBeGreaterThanOrEqual(100)
    expect(artifact.pixelCount).toBe(64)
    expect(artifact.key).toBe(galleryKeyframeKey({ code: prepared.code, mapPoints, randomSeed: artifact.randomSeed }))

    const json = JSON.parse(JSON.stringify(artifact))
    const restored = createFastReplayRuntime(prepared, { mapPoints, randomSeed: artifact.randomSeed, fidelity: 'fast' })
    restoreGalleryKeyframe(restored, json)
    expect(restored.getElapsedMs()).toBe(artifact.posterTimeMs)

    const reference = createFastReplayRuntime(prepared, { mapPoints, randomSeed: artifact.randomSeed, fidelity: 'fast' })
    reference.advanceTo(artifact.posterTimeMs, { stepMs: 1000 / 60 })
    for (const delta of [16, 16, 33]) {
      expect(restored.advanceLive(delta).checksum).toBe(reference.advanceLive(delta).checksum)
    }
  })

  it('honours a pinned poster time', () => {
    const artifact = buildGalleryKeyframe({ name: 'TestPattern2D', prepared, mapPoints, posterTimeMs: 1234 })
    expect(artifact.posterTimeMs).toBe(1234)
    expect(artifact.snapshot.elapsedMs).toBeCloseTo(1234, 3)
  })
})

describe('fast replay snapshot codec', () => {
  it('round-trips tagged arrays, holes, undefined, and non-finite numbers', () => {
    const prepared = prepareFastReplay(DEMOS.TestPattern2D, LIBRARIES)
    const runtime = createFastReplayRuntime(prepared, { mapPoints: gridPoints(4), randomSeed: 7, fidelity: 'fast' })
    runtime.advanceTo(200, { stepMs: 1000 / 60 })
    const snapshot = runtime.snapshot()
    const sparse: unknown[] = [1, 2, 3]
    delete sparse[1]
    snapshot.runtimeState.__probe = [NaN, Infinity, -Infinity, undefined, { nested: sparse }]
    const decoded = decodeFastReplaySnapshot(JSON.parse(JSON.stringify(encodeFastReplaySnapshot(snapshot))))
    const probe = decoded.runtimeState.__probe as unknown[]
    expect(Number.isNaN(probe[0])).toBe(true)
    expect(probe[1]).toBe(Infinity)
    expect(probe[2]).toBe(-Infinity)
    expect(probe[3]).toBeUndefined()
    const nested = (probe[4] as { nested: unknown[] }).nested
    expect(nested).toHaveLength(3)
    expect(1 in nested).toBe(false)
    expect(decoded.frame).toBeInstanceOf(Float64Array)
    expect(decoded.frame.length).toBe(snapshot.frame.length)
    expect(decoded.elapsedMs).toBe(snapshot.elapsedMs)
  })

  it('preserves shared references and non-index array properties across the round trip', () => {
    const prepared = prepareFastReplay(DEMOS.TestPattern2D, LIBRARIES)
    const runtime = createFastReplayRuntime(prepared, { mapPoints: gridPoints(4), randomSeed: 7, fidelity: 'fast' })
    runtime.advanceTo(100, { stepMs: 1000 / 60 })
    const snapshot = runtime.snapshot()
    const shared: unknown[] & { label?: string } = [1, 2, 3]
    shared.label = 'shared'
    snapshot.runtimeState.__a = shared
    snapshot.runtimeState.__b = { inner: shared }
    snapshot.patternFunctionBindings.__c = shared
    const decoded = decodeFastReplaySnapshot(JSON.parse(JSON.stringify(encodeFastReplaySnapshot(snapshot))))
    const a = decoded.runtimeState.__a as unknown[] & { label?: string }
    const b = decoded.runtimeState.__b as { inner: unknown[] }
    expect(Array.from(a)).toEqual([1, 2, 3])
    expect(a.label).toBe('shared')
    expect(b.inner).toBe(a)
    expect(decoded.patternFunctionBindings.__c).toBe(a)
  })

  it('keeps Pattern-owned keys that look like graph metadata', () => {
    const prepared = prepareFastReplay(DEMOS.TestPattern2D, LIBRARIES)
    const runtime = createFastReplayRuntime(prepared, { mapPoints: gridPoints(4), randomSeed: 7, fidelity: 'fast' })
    runtime.advanceTo(100, { stepMs: 1000 / 60 })
    const snapshot = runtime.snapshot()
    const tricky: unknown[] & { $ref?: number } = [1]
    tricky.$ref = 9
    snapshot.runtimeState.__meta = { $id: 'mine', $ref: 5, $obj: { nested: true }, $num: 'NaN', $array: 'pattern', items: [tricky] }
    const decoded = decodeFastReplaySnapshot(JSON.parse(JSON.stringify(encodeFastReplaySnapshot(snapshot))))
    const meta = decoded.runtimeState.__meta as Record<string, unknown>
    expect(meta.$id).toBe('mine')
    expect(meta.$ref).toBe(5)
    expect(meta.$obj).toEqual({ nested: true })
    expect(meta.$num).toBe('NaN')
    expect(meta.$array).toBe('pattern')
    const items = meta.items as (unknown[] & { $ref?: number })[]
    expect(Array.from(items[0])).toEqual([1])
    expect(items[0].$ref).toBe(9)
  })

  it('restoring a keyframe presents the stored frame without ticking the runtime', () => {
    const prepared = prepareFastReplay(DEMOS.TestPattern2D, LIBRARIES)
    const mapPoints = gridPoints(8)
    const artifact = buildGalleryKeyframe({ name: 'TestPattern2D', prepared, mapPoints, posterTimeMs: 800 })
    const runtime = createFastReplayRuntime(prepared, { mapPoints, randomSeed: artifact.randomSeed, fidelity: 'fast' })
    const presented = restoreGalleryKeyframe(runtime, artifact)
    expect(Array.from(presented.frame)).toEqual(artifact.snapshot.frame)
    expect(runtime.getElapsedMs()).toBe(800)
  })
})
