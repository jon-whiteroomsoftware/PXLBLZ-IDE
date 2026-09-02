// #936: boundary-latched decode in the shared physical cut-scene dispatcher.
//
// Oracles: (1) compiled-artifact checksums in both preview modes across the
// stock catalogue, latch on versus off, with several frames per Show so the
// scene table and every placement configuration is exercised; (2) a
// deliberately shuffled render order must be DETECTED - the latched
// artifact rendered out of ascending order must differ from the exact one,
// or the order contract the pass rests on would be silently tolerated;
// (3) the Controller's own compiler accepts the latched artifact.
import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import type { MapPoint } from './maps/types'
import type { GeneratedShowArtifact } from './showCompiler'
import { compileShowForArtifact } from './showPreviewArtifact'
import { LIBRARIES } from '@/pixelblaze/libs'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { loadCachedWordCompiler } from '../../test/perf-harness/bytecodeOracle'
import { compareVisualDrift } from '../../test/perf-harness/benchCore'

const MAP_SIDE = 16
const MAP_POINTS: MapPoint[] = Array.from({ length: MAP_SIDE * MAP_SIDE }, (_, index) => ({
  sample: [(index % MAP_SIDE) / (MAP_SIDE - 1), Math.floor(index / MAP_SIDE) / (MAP_SIDE - 1)],
}))
const CHECKSUM_TIMES_MS = [0, 1_500, 4_000, 12_000, 20_000]

function checksums(artifact: Pick<GeneratedShowArtifact, 'code' | 'fxCode' | 'metadata'>, fidelity: 'fast' | 'fidelity'): string[] {
  const replay = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 2,
  }, { mapPoints: MAP_POINTS, randomSeed: 936, fidelity })
  return CHECKSUM_TIMES_MS.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 250 }).checksum)
}

const compileStock = (item: (typeof STOCK_SHOWS)[number], boundaryLatchedDecode: boolean) => {
  const compiled = compileShowForArtifact(item.show, [], undefined, LIBRARIES, { stageDimension: 2, boundaryLatchedDecode })
  if (!compiled.artifact) throw new Error(`${item.id}: ${compiled.error}`)
  return compiled.artifact
}

describe('boundary-latched decode (#936)', () => {
  it('is exact across the stock catalogue in both preview modes and latches every shared cut-scene dispatcher', () => {
    const latched: string[] = []
    const reasons = new Map<string, number>()
    for (const item of STOCK_SHOWS) {
      const off = compileStock(item, false)
      const on = compileStock(item, true)
      const summary = on.summary.specializations.boundaryLatch
      expect(off.summary.specializations.boundaryLatch, item.id).toEqual(
        summary?.reason === 'no-shared-cut-dispatcher' || summary === null ? off.summary.specializations.boundaryLatch : { selected: false, reason: 'disabled' },
      )
      const reason = summary?.reason ?? 'null'
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
      if (summary?.selected) {
        latched.push(item.id)
        // Generated symbols are compacted, so match the latch shape, not the name.
        expect(on.code, item.id).toMatch(/if \(index == 0 \|\| index >= __pxlblz_\w+\) \{/)
        expect(on.code, item.id).not.toBe(off.code)
      } else {
        expect(on.code, item.id).toBe(off.code)
      }
      expect(on.summary.resources.blockers, item.id).toEqual([])
      expect(checksums(on, 'fast'), item.id).toEqual(checksums(off, 'fast'))
      expect(checksums(on, 'fidelity'), item.id).toEqual(checksums(off, 'fidelity'))
    }
    // Census pinned: two index-routed Installation Shows latch (Redline and
    // 301), two shared cut-scene dispatchers keep per-pixel decode because
    // their plans are not interned (302 and the Overture remix: property
    // tracks or reuse groups), and the other 36 have no such dispatcher
    // (coordinate routing, transitions, or spans).
    expect(latched.sort()).toEqual(['stock-show-301-installation-mapping', 'stock-show-showcase-redline-installation'])
    expect(reasons.get('non-interned-plans') ?? 0).toBe(2)
    expect(reasons.get('no-literal-ranges') ?? 0).toBe(0)
    expect(reasons.get('configuration-reads-local') ?? 0).toBe(0)
  }, 600_000)

  it('is detected by a shuffled render order: the order contract is load-bearing', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-redline-installation')!
    const off = compileStock(item, false)
    const on = compileStock(item, true)
    const shuffle = (code: string) => code.replace('export function render2D(index, x, y) {', 'export function render2D(__i, x, y) {\n  var index = (__i * 7) % pixelCount')
    expect(off.code).toContain('export function render2D(index, x, y) {')
    // Same permutation applied to both: the exact artifact is order-free,
    // the latched one is not, so they must diverge.
    const options = { frames: 6, warmup: 1, frameDeltaMs: 4_000, grid: { rows: 40, cols: 50 } }
    const fast = compareVisualDrift(shuffle(off.code), shuffle(on.code), {}, 'fast', options)
    expect(fast.max).toBeGreaterThan(0)
    // And in ascending order they agree on the same stage.
    const ordered = compareVisualDrift(off.code, on.code, {}, 'fast', options)
    expect(ordered.max).toBe(0)
  }, 300_000)

  it('compiles on the Controller compiler (offline cache) when the cache is present', () => {
    const compiler = loadCachedWordCompiler()
    if (!compiler) return
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-redline-installation')!
    const on = compileStock(item, true)
    expect(() => compiler(on.code)).not.toThrow()
  })

  it('stays exact under the spatial hold, whose stride-spaced visits step over zone boundaries (301, stride 4)', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-301-installation-mapping')!
    const compileHeld = (boundaryLatchedDecode: boolean) => {
      const compiled = compileShowForArtifact(item.show, [], undefined, LIBRARIES, { stageDimension: 2, boundaryLatchedDecode, spatialHold: { stride: 4, mode: 'lerp' } })
      if (!compiled.artifact) throw new Error(`${item.id}: ${compiled.error}`)
      return compiled.artifact
    }
    const off = compileHeld(false)
    const on = compileHeld(true)
    expect(on.summary.specializations.spatialHold?.selected, 'hold must engage for the case to mean anything').toBe(true)
    expect(on.summary.specializations.boundaryLatch?.selected).toBe(true)
    // 1,000 px stage so the zone boundary at 250 sits between stride-4 anchors.
    const options = { frames: 6, warmup: 1, frameDeltaMs: 4_000, grid: { rows: 25, cols: 40 } }
    for (const mode of ['fast', 'precise'] as const) {
      const drift = compareVisualDrift(off.code, on.code, {}, mode, options)
      expect(drift.max, mode).toBe(0)
    }
  }, 300_000)
})
