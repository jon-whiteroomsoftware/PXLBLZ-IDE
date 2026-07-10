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

  it('ramps to exact pause, dwells, and resumes the same private clock without restart', () => {
    const source = `
export var elapsed = 0
export var frames = 0
export function beforeRender(delta) { elapsed = elapsed + delta; frames = frames + 1 }
export function render(index) { rgb(time(1), elapsed, index) }
`
    const toPause = compileShow({
      clips: [{ id: 'continuous', source }],
      adaptationRamp: {
        startMs: 100,
        durationMs: 100,
        from: { timeScale: 1 },
        to: { timeScale: 0 },
      },
    }, {})
    const paused = loadShow(toPause.code, toPause.metadata)

    paused.handle.beforeRender(50)
    paused.handle.beforeRender(100)
    paused.handle.beforeRender(50)
    paused.handle.beforeRender(500)
    paused.handle.render(3)

    expect(paused.pixel()).toEqual([0.1, 100, 3])
    expect(paused.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 100,
      __pxlblz_show_c0_elapsed: 100,
      __pxlblz_show_c0_frames: 4,
      __pxlblz_show_c0_adapt_timeScale: 0,
    })
    expect(toPause.summary).toMatchObject({
      clockPolicy: 'exact-pause-ramp',
      renderPolicy: 'parameter-ramp-one-renderer-per-pixel',
      worstInstantRenderersPerPixel: 1,
    })

    const fromPause = compileShow({
      clips: [{ id: 'continuous', source, adaptation: { timeScale: 0 } }],
      adaptationRamp: {
        startMs: 500,
        durationMs: 200,
        from: { timeScale: 0 },
        to: { timeScale: 1 },
      },
    }, {})
    const resumed = loadShow(fromPause.code, fromPause.metadata)

    resumed.handle.beforeRender(500)
    resumed.handle.beforeRender(100)
    resumed.handle.beforeRender(100)

    expect(resumed.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 150,
      __pxlblz_show_c0_elapsed: 150,
      __pxlblz_show_c0_adapt_timeScale: 1,
    })
    expect(fromPause.summary.clockPolicy).toBe('exact-pause-ramp')
  })

  it('keeps exact pause distinct from hold rendering and explicit cut restart', () => {
    const source = `
export var elapsed = 0
export var renders = 0
export function beforeRender(delta) { elapsed = elapsed + delta }
export function render(index) { renders = renders + 1; rgb(elapsed, renders, index) }
`
    const held = compileShow({
      clips: [{ id: 'held', source, adaptation: { timeScale: 0 } }],
    }, {})
    const heldRuntime = loadShow(held.code, held.metadata)

    heldRuntime.handle.beforeRender(500)
    heldRuntime.handle.render(2)

    expect(heldRuntime.pixel()).toEqual([0, 1, 2])
    expect(heldRuntime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 0,
      __pxlblz_show_c0_elapsed: 0,
    })
    expect(held.summary).toMatchObject({
      clockPolicy: 'exact-pause',
      renderPolicy: 'single-continuous-hold',
      worstInstantRenderersPerPixel: 1,
    })

    const restarted = compileShow({
      clips: [
        { id: 'paused', source, adaptation: { timeScale: 0 } },
        { id: 'fresh', source, adaptation: { timeScale: 1 } },
      ],
      cut: { startMs: 100 },
    }, {})
    const restartRuntime = loadShow(restarted.code, restarted.metadata)

    restartRuntime.handle.beforeRender(50)
    restartRuntime.handle.beforeRender(100)

    expect(restartRuntime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 0,
      __pxlblz_show_c0_elapsed: 0,
      __pxlblz_show_c1_elapsed_ms: 100,
      __pxlblz_show_c1_elapsed: 100,
    })
    expect(restarted.summary).toMatchObject({
      clockPolicy: 'exact-pause',
      renderPolicy: 'cut-restart',
      worstInstantRenderersPerPixel: 1,
    })
  })

  it('masks a continued Pattern behind a full-clip light shutter without calling its renderer', () => {
    const artifact = compileShow({
      clips: [{
        id: 'continued',
        source: `
export var elapsed = 0
export var renderCalls = 0
export function beforeRender(delta) { elapsed = elapsed + delta }
export function render(index) { renderCalls = renderCalls + 1; rgb(elapsed, index, 1) }
`,
        adaptation: {
          lightShutter: { rateHz: 1, duty: 0.25, phase: 0, clockBehavior: 'continue' },
        },
      }],
    }, {})
    const runtime = loadShow(artifact.code, artifact.metadata)

    runtime.handle.beforeRender(300)
    runtime.handle.render(4)

    expect(runtime.pixel()).toEqual([0, 0, 0])
    expect(runtime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed: 300,
      __pxlblz_show_c0_renderCalls: 0,
      __pxlblz_show_c0_shutter_open: 0,
    })

    runtime.handle.beforeRender(700)
    runtime.handle.render(4)

    expect(runtime.pixel()).toEqual([1000, 4, 1])
    expect(runtime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed: 1000,
      __pxlblz_show_c0_renderCalls: 1,
      __pxlblz_show_c0_shutter_open: 1,
    })
    expect(artifact.summary).toMatchObject({
      evaluationPolicy: 'masked-shutter',
      expectedActiveFraction: 0.25,
      clips: [expect.objectContaining({
        evaluationPolicy: 'masked-shutter-continue',
        expectedActiveFraction: 0.25,
      })],
    })
  })

  it('freezes Pattern time for the exact closed portion of shutter intervals', () => {
    const artifact = compileShow({
      clips: [{
        id: 'frozen',
        source: `
export var elapsed = 0
export var frames = 0
export var renderCalls = 0
export function beforeRender(delta) { elapsed = elapsed + delta; frames = frames + 1 }
export function render(index) { renderCalls = renderCalls + 1; rgb(elapsed, frames, index) }
`,
        adaptation: {
          lightShutter: { rateHz: 1, duty: 0.25, phase: 0, clockBehavior: 'freeze' },
        },
      }],
    }, {})
    const runtime = loadShow(artifact.code, artifact.metadata)

    runtime.handle.beforeRender(300)
    runtime.handle.render(2)
    runtime.handle.beforeRender(400)
    runtime.handle.render(2)

    expect(runtime.pixel()).toEqual([0, 0, 0])
    expect(runtime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 250,
      __pxlblz_show_c0_elapsed: 250,
      __pxlblz_show_c0_frames: 1,
      __pxlblz_show_c0_renderCalls: 0,
    })

    runtime.handle.beforeRender(300)
    runtime.handle.render(2)

    expect(runtime.pixel()).toEqual([250, 1, 2])
    expect(runtime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 250,
      __pxlblz_show_c0_elapsed: 250,
      __pxlblz_show_c0_frames: 1,
      __pxlblz_show_c0_renderCalls: 1,
      __pxlblz_show_c0_shutter_open: 1,
    })
    expect(artifact.summary.clips[0]).toMatchObject({
      evaluationPolicy: 'masked-shutter-freeze',
      expectedActiveFraction: 0.25,
    })
  })

  it('keeps shutter duty endpoints exact and leaves unmasked artifacts unchanged', () => {
    const source = `export function render(index) { rgb(1, 0, 0) }`
    const baseline = compileShow({ clips: [{ id: 'plain', source }] }, {})
    const explicitDefault = compileShow({ clips: [{ id: 'plain', source, adaptation: {} }] }, {})
    const alwaysClosed = compileShow({
      clips: [{
        id: 'closed',
        source,
        adaptation: { lightShutter: { rateHz: 8, duty: 0, phase: 1, clockBehavior: 'continue' } },
      }],
    }, {})
    const alwaysOpen = compileShow({
      clips: [{
        id: 'open',
        source,
        adaptation: { lightShutter: { rateHz: 8, duty: 1, phase: 0.75, clockBehavior: 'freeze' } },
      }],
    }, {})
    const closedRuntime = loadShow(alwaysClosed.code, alwaysClosed.metadata)
    const openRuntime = loadShow(alwaysOpen.code, alwaysOpen.metadata)

    closedRuntime.handle.beforeRender(1000)
    closedRuntime.handle.render(0)
    openRuntime.handle.beforeRender(1000)
    openRuntime.handle.render(0)

    expect(explicitDefault.code).toBe(baseline.code)
    expect(explicitDefault.summary).toEqual(baseline.summary)
    expect(closedRuntime.pixel()).toEqual([0, 0, 0])
    expect(openRuntime.pixel()).toEqual([1, 0, 0])
    expect(alwaysClosed.summary.expectedActiveFraction).toBe(0)
    expect(alwaysOpen.summary.expectedActiveFraction).toBe(1)
    expect(baseline.summary).toMatchObject({
      evaluationPolicy: 'full',
      expectedActiveFraction: 1,
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
      routePolicy: 'hard-wipe',
    })
    expect(artifact.code).toContain('index / pixelCount < __pxlblz_show_mix')
    expect(artifact.code).not.toContain('__pxlblz_show_feather_progress')
  })

  it('keeps an explicit zero feather byte-identical to the original hard wipe', () => {
    const clips = [
      { id: 'from', source: 'export function render(index) { rgb(1, 0, 0) }' },
      { id: 'to', source: 'export function render(index) { rgb(0, 1, 0) }' },
    ]
    const hard = compileShow({
      clips,
      routeTransition: { kind: 'wipe', startMs: 1000, durationMs: 1000 },
    }, {})
    const zero = compileShow({
      clips,
      routeTransition: { kind: 'wipe', startMs: 1000, durationMs: 1000, feather: 0 },
    }, {})

    expect(zero.code).toBe(hard.code)
    expect(zero.fxCode).toBe(hard.fxCode)
  })

  it('routes a feathered wipe through a stable spatial threshold with one renderer per pixel', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'from',
          source: 'export var calls = 0\nexport function render(index) { calls = calls + 1; rgb(1, 0, 0) }',
        },
        {
          id: 'to',
          source: 'export var calls = 0\nexport function render(index) { calls = calls + 1; rgb(0, 1, 0) }',
        },
      ],
      routeTransition: { kind: 'wipe', startMs: 1000, durationMs: 1000, feather: 0.4 },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 10)

    handle.beforeRender(1500)
    handle.render(4)
    expect(pixel()).toEqual([0, 1, 0])
    handle.render(5)
    expect(pixel()).toEqual([1, 0, 0])
    handle.render(5)
    expect(pixel()).toEqual([1, 0, 0])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_calls: 2,
      __pxlblz_show_c1_calls: 1,
    })
    expect(artifact.summary).toMatchObject({
      routePolicy: 'feathered-wipe',
      renderPolicy: 'route-transition-one-renderer-per-pixel',
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
      routePolicy: 'dither',
    })
  })
})
