import { describe, expect, it } from 'vitest'
import { bundle } from '../../src/engine/bundle'
import { loadPattern } from '../../src/engine/loadPattern'
import { createShim } from '../../src/engine/shim'
import { applyBlockHold, buildBaseArtifact, ISSUE927_HEIGHT, ISSUE927_WIDTH } from './issue927'
import { loadCachedWordCompiler } from './bytecodeOracle'

describe('2D block hold (#927 spike)', () => {
  it('keeps every anchor pixel bit-identical to the baseline over three frames of the full stage', () => {
    const base = buildBaseArtifact('ZippyZaps').code
    const block2 = applyBlockHold(base, 2)
    expect(block2.slots).toBe(23) // columns 0, 2, ..., 44
    expect(applyBlockHold(base, 4).slots).toBe(12) // 0, 4, ..., 44
    const N = ISSUE927_WIDTH * ISSUE927_HEIGHT
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
    expect(anchors).toBe(3 * 23 * 23)
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
})
