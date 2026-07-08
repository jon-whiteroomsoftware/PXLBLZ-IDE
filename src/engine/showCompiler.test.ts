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

  it('routes simultaneous clips to named controller zones with zone-local 1D coordinates', () => {
    const artifact = compileShow({
      zones: [
        { id: 'left', name: 'left', ranges: [{ start: 0, end: 3 }] },
        { id: 'right', name: 'right', ranges: [{ start: 4, end: 7 }] },
      ],
      clips: [
        {
          id: 'left-clip',
          zone: 'left',
          source: `
export var ticks = 0
export var seenPixelCount = 0
export function beforeRender(delta) {
  ticks = ticks + 1
  seenPixelCount = pixelCount
}
export function render(index) {
  rgb(index / pixelCount, seenPixelCount, ticks)
}
`,
        },
        {
          id: 'right-clip',
          zone: 'right',
          source: `
export var ticks = 0
export var seenPixelCount = 0
export function beforeRender(delta) {
  ticks = ticks + 1
  seenPixelCount = pixelCount
}
export function render(index) {
  rgb(0, index / pixelCount, seenPixelCount)
}
`,
        },
      ],
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 8)
    handle.beforeRender(16)

    handle.render(2)
    expect(pixel()).toEqual([0.5, 4, 1])

    handle.render(6)
    expect(pixel()).toEqual([0, 0.5, 4])

    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_seenPixelCount: 4,
      __pxlblz_show_c1_seenPixelCount: 4,
      __pxlblz_show_c0_ticks: 1,
      __pxlblz_show_c1_ticks: 1,
    })
    expect(artifact.summary).toMatchObject({
      renderPolicy: 'route-one-renderer-per-pixel',
      transitionCount: 0,
      warnings: [],
    })
  })

  it('routes multi-range zones as one continuous zone-local index space', () => {
    const artifact = compileShow({
      zones: [
        {
          id: 'row-band',
          name: 'row-band',
          ranges: [
            { start: 0, end: 1 },
            { start: 6, end: 7 },
          ],
        },
        { id: 'other', name: 'other', ranges: [{ start: 2, end: 5 }] },
      ],
      clips: [
        {
          id: 'row',
          zone: 'row-band',
          source: 'export function render(index) { rgb(index, pixelCount, 0) }',
        },
        {
          id: 'other',
          zone: 'other',
          source: 'export function render(index) { rgb(0, 0, 1) }',
        },
      ],
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 8)
    handle.beforeRender(16)

    handle.render(0)
    expect(pixel()).toEqual([0, 4, 0])
    handle.render(1)
    expect(pixel()).toEqual([1, 4, 0])
    handle.render(6)
    expect(pixel()).toEqual([2, 4, 0])
    handle.render(7)
    expect(pixel()).toEqual([3, 4, 0])
  })

  it('allows more than two clips when every clip is routed to a zone', () => {
    const artifact = compileShow({
      zones: [
        { id: 'a', name: 'a', ranges: [{ start: 0, end: 1 }] },
        { id: 'b', name: 'b', ranges: [{ start: 2, end: 3 }] },
        { id: 'c', name: 'c', ranges: [{ start: 4, end: 5 }] },
      ],
      clips: [
        { id: 'a', zone: 'a', source: 'export function render(index) { rgb(1, index, pixelCount) }' },
        { id: 'b', zone: 'b', source: 'export function render(index) { rgb(2, index, pixelCount) }' },
        { id: 'c', zone: 'c', source: 'export function render(index) { rgb(3, index, pixelCount) }' },
      ],
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 6)
    handle.beforeRender(16)

    handle.render(0)
    expect(pixel()).toEqual([1, 0, 2])
    handle.render(3)
    expect(pixel()).toEqual([2, 1, 2])
    handle.render(5)
    expect(pixel()).toEqual([3, 1, 2])
    expect(artifact.summary).toMatchObject({
      clipCount: 3,
      renderPolicy: 'route-one-renderer-per-pixel',
      worstInstantRenderersPerPixel: 1,
    })
  })

  it('expands one clip over several zones as independent domains by default', () => {
    const artifact = compileShow({
      zones: [
        { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }] },
        { id: 'right', name: 'right', ranges: [{ start: 4, end: 7 }] },
      ],
      clips: [
        {
          id: 'wash',
          zones: ['left', 'right'],
          source: 'export function render(index) { rgb(index, pixelCount, 0) }',
        },
      ],
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 8)
    handle.beforeRender(16)

    handle.render(0)
    expect(pixel()).toEqual([0, 2, 0])
    handle.render(1)
    expect(pixel()).toEqual([1, 2, 0])
    handle.render(4)
    expect(pixel()).toEqual([0, 4, 0])
    handle.render(7)
    expect(pixel()).toEqual([3, 4, 0])
    expect(artifact.summary.clips.map((clip) => clip.id)).toEqual(['wash:left', 'wash:right'])
  })

  it('routes one clip over several zones as one continuous span domain', () => {
    const artifact = compileShow({
      zones: [
        { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }] },
        { id: 'right', name: 'right', ranges: [{ start: 4, end: 7 }] },
      ],
      clips: [
        {
          id: 'wash',
          zones: ['left', 'right'],
          zoneMode: 'span',
          source: 'export function render(index) { rgb(index, pixelCount, 0) }',
        },
      ],
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 8)
    handle.beforeRender(16)

    handle.render(0)
    expect(pixel()).toEqual([0, 6, 0])
    handle.render(1)
    expect(pixel()).toEqual([1, 6, 0])
    handle.render(4)
    expect(pixel()).toEqual([2, 6, 0])
    handle.render(7)
    expect(pixel()).toEqual([5, 6, 0])
  })

  it('spans zones when one member zone is itself multi-range', () => {
    const artifact = compileShow({
      zones: [
        {
          id: 'band',
          name: 'band',
          ranges: [
            { start: 0, end: 1 },
            { start: 6, end: 7 },
          ],
        },
        { id: 'middle', name: 'middle', ranges: [{ start: 2, end: 5 }] },
      ],
      clips: [
        {
          id: 'wash',
          zones: ['band', 'middle'],
          zoneMode: 'span',
          source: 'export function render(index) { rgb(index, pixelCount, 0) }',
        },
      ],
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 8)
    handle.beforeRender(16)

    handle.render(0)
    expect(pixel()).toEqual([0, 8, 0])
    handle.render(6)
    expect(pixel()).toEqual([2, 8, 0])
    handle.render(2)
    expect(pixel()).toEqual([4, 8, 0])
    handle.render(5)
    expect(pixel()).toEqual([7, 8, 0])
  })

  it('reports missing controller zones as compile warnings', () => {
    const artifact = compileShow({
      zones: [{ id: 'left', name: 'left', ranges: [{ start: 0, end: 3 }] }],
      clips: [
        {
          id: 'left-clip',
          zone: 'left',
          source: 'export function render(index) { rgb(1, 0, 0) }',
        },
        {
          id: 'missing-clip',
          zone: 'doorframe',
          source: 'export function render(index) { rgb(0, 1, 0) }',
        },
      ],
    }, {})

    expect(artifact.summary.warnings).toEqual([
      'Clip "missing-clip" references missing zone "doorframe".',
    ])

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 8)
    handle.beforeRender(16)
    handle.render(5)
    expect(pixel()).toEqual([0, 0, 0])
  })

  it('emits a single continuous clip for a hold span with phase continuity across scene boundaries', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'held',
          source: `
export var elapsed = 0
export function beforeRender(delta) { elapsed = elapsed + delta }
export function render(index) { rgb(elapsed, index, 0) }
`,
        },
      ],
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(900)
    handle.render(2)
    expect(pixel()).toEqual([900, 2, 0])

    handle.beforeRender(200)
    handle.render(2)
    expect(pixel()).toEqual([1100, 2, 0])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed: 1100,
      __pxlblz_show_c0_elapsed_ms: 1100,
    })
    expect(artifact.summary).toMatchObject({
      clipCount: 1,
      transitionCount: 0,
      renderPolicy: 'single-continuous-hold',
      transitionCost: 'none',
      worstInstantRenderersPerPixel: 1,
    })
  })

  it('emits a cut boundary where the same pattern restarts as a fresh clip instance', () => {
    const source = `
export var elapsed = 0
export function beforeRender(delta) { elapsed = elapsed + delta }
export function render(index) { rgb(elapsed, index, 0) }
`
    const artifact = compileShow({
      clips: [
        { id: 'scene-a', source },
        { id: 'scene-b', source },
      ],
      cut: { startMs: 1000 },
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(900)
    handle.render(3)
    expect(pixel()).toEqual([900, 3, 0])

    handle.beforeRender(200)
    handle.render(3)
    expect(pixel()).toEqual([200, 3, 0])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed: 900,
      __pxlblz_show_c1_elapsed: 200,
      __pxlblz_show_c0_elapsed_ms: 900,
      __pxlblz_show_c1_elapsed_ms: 200,
    })
    expect(artifact.summary).toMatchObject({
      clipCount: 2,
      transitionCount: 1,
      renderPolicy: 'cut-restart',
      transitionCost: 'none',
      worstInstantRenderersPerPixel: 1,
    })
  })

  it('emits a same-pattern adaptation ramp as parameter-cost with one renderer per pixel', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'continuous',
          source: `
export var renderCalls = 0
export function render(index) {
  renderCalls = renderCalls + 1
  rgb(1, 1, 1)
}
`,
        },
      ],
      adaptationRamp: {
        startMs: 1000,
        durationMs: 1000,
        from: { brightness: 1, phase: 0 },
        to: { brightness: 0.25, phase: 0.2 },
      },
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(1500)
    handle.render(0)

    expect(pixel()).toEqual([0.625, 0.625, 0.625])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_renderCalls: 1,
      __pxlblz_show_c0_adapt_brightness: 0.625,
      __pxlblz_show_c0_adapt_phase: 0.1,
    })
    expect(artifact.summary).toMatchObject({
      clipCount: 1,
      transitionCount: 1,
      renderPolicy: 'parameter-ramp-one-renderer-per-pixel',
      transitionCost: 'parameter',
      worstInstantRenderersPerPixel: 1,
    })
  })

  it('emits a wipe transition that renders exactly one member per pixel during the transition window', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'from',
          source: `
export var calls = 0
export function beforeRender(delta) {}
export function render(index) { calls = calls + 1; rgb(1, 0, 0) }
`,
        },
        {
          id: 'to',
          source: `
export var calls = 0
export function beforeRender(delta) {}
export function render(index) { calls = calls + 1; rgb(0, 1, 0) }
`,
        },
      ],
      routeTransition: { kind: 'wipe', startMs: 1000, durationMs: 1000 },
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 10)

    handle.beforeRender(1500)
    handle.render(2)
    expect(pixel()).toEqual([0, 1, 0])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_mix: 0.5,
      __pxlblz_show_c0_calls: 0,
      __pxlblz_show_c1_calls: 1,
    })

    handle.render(8)
    expect(pixel()).toEqual([1, 0, 0])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_calls: 1,
      __pxlblz_show_c1_calls: 1,
    })
    expect(artifact.summary).toMatchObject({
      transitionCount: 1,
      renderPolicy: 'route-transition-one-renderer-per-pixel',
      transitionCost: 'route',
      worstInstantRenderersPerPixel: 1,
    })
  })

  it('emits a dither dissolve that hashes each pixel to one member renderer', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'from',
          source: `
export var calls = 0
export function render(index) { calls = calls + 1; rgb(1, 0, 0) }
`,
        },
        {
          id: 'to',
          source: `
export var calls = 0
export function render(index) { calls = calls + 1; rgb(0, 1, 0) }
`,
        },
      ],
      routeTransition: { kind: 'dither', startMs: 1000, durationMs: 1000 },
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 10)

    handle.beforeRender(1500)
    handle.render(0)
    expect(pixel()).toEqual([1, 0, 0])
    handle.render(1)
    expect(pixel()).toEqual([0, 1, 0])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_mix: 0.5,
      __pxlblz_show_c0_calls: 1,
      __pxlblz_show_c1_calls: 1,
    })
    expect(artifact.summary).toMatchObject({
      transitionCount: 1,
      renderPolicy: 'route-transition-one-renderer-per-pixel',
      transitionCost: 'route',
      worstInstantRenderersPerPixel: 1,
    })
  })
})
