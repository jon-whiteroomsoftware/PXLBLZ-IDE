import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime, prepareFastReplay } from '../../src/engine/fastReplay'
import { loadPattern } from '../../src/engine/loadPattern'
import { buildIssue537DiagnosticSources } from './issue537'

describe('issue #537 previous-RGB diagnostic', () => {
  it('seeds with exact live output, then retains a decaying linear-RGB trail', () => {
    const sources = buildIssue537DiagnosticSources(4, 0.5)
    const live = load(sources.live, 4)
    const trails = load(sources.trails, 4)

    expect(renderFrame(live, 4)).toEqual(renderFrame(trails, 4))
    const liveSecond = renderFrame(live, 4)
    const trailsSecond = renderFrame(trails, 4)

    expect(liveSecond.map((pixel) => pixel[0])).toEqual([0, 0, 1, 0])
    expect(trailsSecond.map((pixel) => pixel[0])).toEqual([0, 0.5, 1, 0])
  })

  it('clears the logical buffer before the first pixel at a deterministic Scene boundary', () => {
    const trails = load(buildIssue537DiagnosticSources(4, 0.5, 2).trails, 4)

    renderFrame(trails, 4)
    expect(renderFrame(trails, 4).map((pixel) => pixel[0])).toEqual([0, 0.5, 1, 0])
    expect(renderFrame(trails, 4).map((pixel) => pixel[0])).toEqual([0, 0, 0, 1])
  })

  it('reconstructs the same temporal sequence in Fast and Precise replay', () => {
    const source = buildIssue537DiagnosticSources(16, 0.5, 8).trails
    const checksums = (fidelity: 'fast' | 'fidelity') => {
      const replay = createFastReplayRuntime(prepareFastReplay(source, {}), {
        mapPoints: Array.from({ length: 16 }, (_, index) => [index / 15]),
        randomSeed: 537,
        fidelity,
      })
      return [16, 32, 64, 128, 144, 256].map((timeMs) => (
        replay.advanceTo(timeMs, { stepMs: 16 }).checksum
      ))
    }

    expect(checksums('fidelity')).toEqual(checksums('fast'))
  })
})

function load(source: string, pixelCount: number) {
  let color: [number, number, number] = [0, 0, 0]
  const handle = loadPattern(source, { exportedVars: [], patternVars: [], controls: [] }, {
    pixelCount,
    PI2: Math.PI * 2,
    rgb: (r: number, g: number, b: number) => { color = [r, g, b] },
    hsv: (h: number, s: number, v: number) => { color = [h, s, v] },
    abs: Math.abs,
    array: (length: number) => Array.from({ length }, () => 0),
    ceil: Math.ceil,
    clamp: (value: number, low: number, high: number) => Math.min(Math.max(value, low), high),
    floor: Math.floor,
    frac: (value: number) => value - Math.floor(value),
    max: Math.max,
    min: Math.min,
    sin: Math.sin,
  })
  return {
    beforeRender: handle.beforeRender,
    render: handle.render,
    color: () => [...color] as [number, number, number],
  }
}

function renderFrame(handle: ReturnType<typeof load>, pixelCount: number) {
  handle.beforeRender(16)
  return Array.from({ length: pixelCount }, (_, index) => {
    handle.render(index)
    return handle.color()
  })
}
