import { loadPattern, type PatternHandle } from './loadPattern'
import { compileShow } from './showCompiler'
import { DEMOS } from '@/pixelblaze/stock/patterns'

interface LoadedShow {
  handle: PatternHandle
  pixel: () => [number, number, number]
}

function loadShow(code: string, metadata: ReturnType<typeof compileShow>['metadata'], pixelCount = 10): LoadedShow {
  let pixel: [number, number, number] = [0, 0, 0]
  const handle = loadPattern(code, metadata, {
    pixelCount,
    rgb(r: number, g: number, b: number) {
      pixel = [r, g, b]
    },
    hsv(h: number, s: number, v: number) {
      pixel = [h, s, v]
    },
    abs: Math.abs,
    clamp(v: number, lo: number, hi: number) {
      return Math.min(Math.max(v, lo), hi)
    },
    floor: Math.floor,
    frac(v: number) {
      return v - Math.floor(v)
    },
    max: Math.max,
    min: Math.min,
    triangle(v: number) {
      const x = v - Math.floor(v)
      return x < 0.5 ? x * 2 : 2 - x * 2
    },
  })
  return { handle, pixel: () => pixel }
}

describe('compileShow', () => {
  it('keeps member globals independent and runs only participating beforeRender hooks', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'lead',
          source: `
export var hue = 0.1
export var ticks = 0
export function beforeRender(delta) {
  hue = hue + delta * 0.001
  ticks = ticks + 1
}
export function render(index) {
  var hue = 0.4
  rgb(hue, ticks, index)
}
`,
        },
        {
          id: 'follow',
          source: `
export var hue = 0.9
export var ticks = 0
export function beforeRender(delta) {
  hue = hue - delta * 0.001
  ticks = ticks + 1
}
export function render(index) {
  rgb(0, hue, ticks)
}
`,
        },
      ],
      crossfade: { startMs: 1000, durationMs: 1000 },
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(500)
    handle.render(3)
    expect(pixel()).toEqual([0.4, 1, 3])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_hue: 0.6,
      __pxlblz_show_c0_ticks: 1,
      __pxlblz_show_c1_hue: 0.9,
      __pxlblz_show_c1_ticks: 0,
    })

    handle.beforeRender(750)
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_ticks: 2,
      __pxlblz_show_c1_ticks: 1,
    })

    handle.beforeRender(1000)
    handle.render(3)
    expect(pixel()).toEqual([0, -0.85, 2])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_ticks: 2,
      __pxlblz_show_c1_ticks: 2,
    })
  })

  it('captures member output and emits an RGB crossfade during the transition', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'red',
          source: `
export var ticks = 0
export function beforeRender(delta) { ticks = ticks + 1 }
export function render(index) { rgb(1, 0, 0) }
`,
        },
        {
          id: 'blue',
          source: `
export var ticks = 0
export function beforeRender(delta) { ticks = ticks + 1 }
export function render(index) { rgb(0, 0, 1) }
`,
        },
      ],
      crossfade: { startMs: 1000, durationMs: 1000 },
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(1500)
    handle.render(0)

    expect(pixel()).toEqual([0.5, 0, 0.5])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_mix: 0.5,
      __pxlblz_show_phase: 1,
      __pxlblz_show_c0_ticks: 1,
      __pxlblz_show_c1_ticks: 1,
    })
  })

  it('virtualizes time so inactive clips freeze outside transition windows', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'a',
          source: `
export var t = 0
export function beforeRender(delta) { t = time(1) }
export function render(index) { rgb(t, 0, 0) }
`,
        },
        {
          id: 'b',
          source: `
export var t = 0
export function beforeRender(delta) { t = time(1) }
export function render(index) { rgb(0, t, 0) }
`,
        },
      ],
      crossfade: { startMs: 1000, durationMs: 1000 },
    }, {})

    const { handle } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(500)
    handle.beforeRender(1000)
    handle.beforeRender(1000)

    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 1500,
      __pxlblz_show_c1_elapsed_ms: 2000,
      __pxlblz_show_c0_t: 0.5,
      __pxlblz_show_c1_t: 0,
    })
  })

  it('compiles two real stock 1D patterns and reports artifact size against the measured device budget', () => {
    const artifact = compileShow({
      clips: [
        { id: 'test-pattern', source: DEMOS.TestPattern1D },
        { id: 'comet-loom', source: DEMOS.CometLoom },
      ],
      crossfade: { startMs: 1000, durationMs: 500 },
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 32)

    handle.beforeRender(1250)
    handle.render(4)

    expect(pixel().every(Number.isFinite)).toBe(true)
    expect(artifact.metadata.renderFns).toEqual({
      hasBeforeRender: true,
      hasRender: true,
      hasRender2D: false,
      hasRender3D: false,
    })
    expect(artifact.summary.artifactBytes).toBeGreaterThan(artifact.summary.sourceBytesBeforeMerge)
    expect(artifact.summary.measuredDeviceBudgetBytes).toBe(68384)
    expect(artifact.summary.artifactBudgetRatio).toBeGreaterThan(0)
    expect(artifact.summary.clips).toEqual([
      expect.objectContaining({ id: 'test-pattern', prefix: '__pxlblz_show_c0' }),
      expect.objectContaining({ id: 'comet-loom', prefix: '__pxlblz_show_c1' }),
    ])
  })
})
