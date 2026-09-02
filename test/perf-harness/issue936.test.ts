import { describe, expect, it } from 'vitest'
import { compareVisualDrift, type BenchOptions } from './benchCore'
import { issue936Candidates } from './issue936'

/** Both modes: 'checksum-exact' when both checksums hold, 'display-exact'
 *  when only the 8-bit output does, else 'lossy' (the #933 tier, inlined
 *  until that helper lands). */
function tier(base: string, candidate: string, options: BenchOptions) {
  const modes = (['fast', 'precise'] as const).map((mode) => compareVisualDrift(base, candidate, {}, mode, options))
  const checksumExact = modes.every((drift) => drift.base.checksum === drift.candidate.checksum)
  const displayExact = modes.every((drift) => drift.max === 0)
  return { tier: checksumExact ? 'checksum-exact' : displayExact ? 'display-exact' : 'lossy', fast: modes[0], precise: modes[1] }
}

describe('boundary-latched Redline (#936 spike)', () => {
  it('rewrites all placement arms into a boundary block and stays checksum-exact in both modes on the full 2,000 px stage', () => {
    const c = issue936Candidates()
    expect(c.arms).toBe(18)
    expect(c.bodyGroups).toBe(2)
    for (const [name, code] of [['latched', c.latched], ['latchedCounters', c.latchedCounters], ['latchedChain', c.latchedChain]] as const) {
      expect(code).toContain('index == __pxlblz_lat_next')
      // 12 frames across the whole hold/transition schedule is not enough to
      // cross a scene; run long with a coarse clock so several scenes and
      // placements are exercised (60 s Show, 4 s per frame).
      const verdict = tier(c.exact, code, { frames: 20, warmup: 1, frameDeltaMs: 4_000, grid: { rows: 40, cols: 50 } })
      expect(verdict.tier, `${name}: fast max ${verdict.fast.max}, precise max ${verdict.precise.max}`).toBe('checksum-exact')
    }
  }, 300_000)

  it('is detected by a shuffled render order (the order contract is load-bearing)', () => {
    // The falsifier: rendering the latched artifact out of ascending order
    // must NOT reproduce the exact artifact. Simulated by shifting the
    // pixel index the dispatcher sees by one within a frame.
    const c = issue936Candidates()
    const shuffled = c.latchedCounters.replace('export function render2D(index, x, y) {', 'export function render2D(__i, x, y) {\n  var index = (__i * 7) % pixelCount')
    const exactShuffled = c.exact.replace('export function render2D(index, x, y) {', 'export function render2D(__i, x, y) {\n  var index = (__i * 7) % pixelCount')
    const verdict = tier(exactShuffled, shuffled, { frames: 6, warmup: 1, frameDeltaMs: 4_000, grid: { rows: 40, cols: 50 } })
    expect(verdict.tier).toBe('lossy')
  }, 300_000)
})
