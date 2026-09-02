import { describe, expect, it } from 'vitest'
import { bundle } from '../../src/engine/bundle'
import { loadPattern } from '../../src/engine/loadPattern'
import { createShim } from '../../src/engine/shim'
import { applyBlockHold, buildBaseArtifact, ISSUE927_HEIGHT, ISSUE927_PIXEL_COUNT, ISSUE927_WIDTH } from './issue927'
import { loadCachedWordCompiler } from './bytecodeOracle'

describe('2D block hold (#927 spike)', () => {
  it('keeps every anchor pixel bit-identical to the baseline over three frames of the full stage', () => {
    const base = buildBaseArtifact('ZippyZaps').code
    const block2 = applyBlockHold(base, 2)
    expect(block2.slots).toBe(23) // columns 0, 2, ..., 44
    expect(applyBlockHold(base, 4).slots).toBe(12) // 0, 4, ..., 44
    const N = ISSUE927_PIXEL_COUNT
    const mapPoints = Array.from({ length: N }, (_, i) => ({ sample: [(i % 50) / 49, Math.floor(i / 50) / 39] as [number, number], pos: [0, 0] as [number, number] }))
    const render = (code: string) => {
      let t = 0
      const shim = createShim({ pixelCount: N, dimensions: 2, mapPoints, getVirtualTime: () => t, randomSeed: 927 })
      const bundled = bundle(code, {})
      const handle = loadPattern(bundled.code, bundled.metadata, shim.builtins)
      const frames: number[][][] = []
      for (let frame = 0; frame < 3; frame += 1) {
        t += 250
        handle.beforeRender(250)
        const pixels: number[][] = []
        for (let index = 0; index < N; index += 1) {
          const [x, y] = mapPoints[index].sample
          handle.render2D(index, x, y)
          pixels.push([...shim.capturedPixel()])
        }
        frames.push(pixels)
      }
      return frames
    }
    const exact = render(base)
    const held = render(block2.code)
    let anchors = 0
    let differing = 0
    let heldDiffering = 0
    for (let frame = 0; frame < 3; frame += 1) {
      for (let index = 0; index < N; index += 1) {
        const row = Math.floor(index / ISSUE927_WIDTH)
        const col = index % ISSUE927_WIDTH
        const delta = Math.max(...exact[frame][index].map((value, channel) => Math.abs(value - held[frame][index][channel])))
        if (row % 2 === 0 && col % 2 === 0) { anchors += 1; if (delta > 1e-9) differing += 1 } else if (delta > 1e-9) heldDiffering += 1
      }
    }
    // 23 anchor rows x 23 anchor columns on the full rows, minus the anchors
    // the partial last row (20 columns) does not have.
    expect(anchors).toBe(3 * (22 * 23 + 10))
    expect(differing).toBe(0)
    // The held pixels are a blend, so most of them differ from the exact render.
    expect(heldDiffering).toBeGreaterThan(anchors)
  }, 300_000)

  it('compiles on the Controller compiler (offline cache) when the cache is present', () => {
    const compiler = loadCachedWordCompiler()
    if (!compiler) return
    const base = buildBaseArtifact('Caustics').code
    for (const k of [2, 4]) expect(() => compiler(applyBlockHold(base, k).code)).not.toThrow()
  })

  it('counts member evaluations per frame exactly: anchor rows x slots, with the last block-row copied rather than re-evaluated', () => {
    const base = buildBaseArtifact('ZippyZaps').code
    const N = ISSUE927_PIXEL_COUNT
    const mapPoints = Array.from({ length: N }, (_, i) => ({ sample: [(i % 50) / 49, Math.floor(i / 50) / 39] as [number, number], pos: [0, 0] as [number, number] }))
    for (const k of [2, 4] as const) {
      const held = applyBlockHold(base, k, ISSUE927_WIDTH, ISSUE927_HEIGHT, { countEvaluations: true })
      const shim = createShim({ pixelCount: N, dimensions: 2, mapPoints, getVirtualTime: () => 250, randomSeed: 927 })
      const bundled = bundle(held.code, {})
      const handle = loadPattern(bundled.code, bundled.metadata, shim.builtins)
      // Two frames: the counter resets at index 0, so it reads one frame's count.
      for (let frame = 0; frame < 2; frame += 1) {
        handle.beforeRender(250)
        for (let index = 0; index < N; index += 1) handle.render2D(index, 0, 0)
      }
      const evaluations = (handle.getExports() as { __pxlblz_bh_evals: number }).__pxlblz_bh_evals
      // Rows 0, K, 2K, ... up to the last anchor row (44 for both K), one
      // fill each: row 0 is the bootstrap fill at index 0, every later
      // anchor row is filled once as "next", and the last block-row copies.
      const anchorRows = Math.floor((ISSUE927_HEIGHT - 1) / k) + 1
      expect(evaluations).toBe(anchorRows * held.slots)
      expect(evaluations / N).toBeCloseTo(k === 2 ? 0.2645 : 0.072, 2)
    }
  })

  it('the scalar-cached replay paints exactly what the array replay paints', () => {
    const base = buildBaseArtifact('Caustics').code
    const N = ISSUE927_PIXEL_COUNT
    const mapPoints = Array.from({ length: N }, (_, i) => ({ sample: [(i % 50) / 49, Math.floor(i / 50) / 39] as [number, number], pos: [0, 0] as [number, number] }))
    const render = (code: string) => {
      const shim = createShim({ pixelCount: N, dimensions: 2, mapPoints, getVirtualTime: () => 500, randomSeed: 927 })
      const bundled = bundle(code, {})
      const handle = loadPattern(bundled.code, bundled.metadata, shim.builtins)
      const out: number[][] = []
      for (let frame = 0; frame < 2; frame += 1) {
        handle.beforeRender(250)
        for (let index = 0; index < N; index += 1) { handle.render2D(index, 0, 0); out.push([...shim.capturedPixel()]) }
      }
      return out
    }
    for (const k of [2, 4]) {
      const arrays = render(applyBlockHold(base, k).code)
      const scalars = render(applyBlockHold(base, k, ISSUE927_WIDTH, ISSUE927_HEIGHT, { scalarCache: true }).code)
      expect(scalars).toEqual(arrays)
    }
  }, 300_000)
})
