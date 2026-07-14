import { loadPattern, type PatternHandle } from './loadPattern'
import { compileShow } from './showCompiler'
import { createShim } from './shim'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { remapShowIndex, remapShowSample } from './showCoordinateRemap'
import { showWipeMaskPosition, type ShowWipeSettings } from './showWipe'
import { showCoherentDissolveField } from './showDissolve'
import { showShapeRevealSignedDistance } from './showShapeReveal'

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
    array(length: number) {
      return Array.from({ length }, () => 0)
    },
    atan2: Math.atan2,
    ceil: Math.ceil,
    clamp(v: number, lo: number, hi: number) {
      return Math.min(Math.max(v, lo), hi)
    },
    cos: Math.cos,
    floor: Math.floor,
    frac(v: number) {
      return v - Math.floor(v)
    },
    max: Math.max,
    min: Math.min,
    sin: Math.sin,
    hypot: Math.hypot,
    sqrt: Math.sqrt,
    triangle(v: number) {
      const x = v - Math.floor(v)
      return x < 0.5 ? x * 2 : 2 - x * 2
    },
  })
  return { handle, pixel: () => pixel }
}

describe('compileShow', () => {
  it('animates synchronized tiling once per frame without adding renderers (#406)', () => {
    const source = 'export function render2D(index, x, y) { rgb(x, y, 0) }'
    const artifact = compileShow({
      clips: [
        { id: 'first', source },
        { id: 'second', source },
        { id: 'third', source },
      ],
      sceneSequence: {
        scenes: [
          { clipId: 'first', holdMs: 1000, transitionOut: { kind: 'cut', durationMs: 0 } },
          { clipId: 'second', holdMs: 1000, transitionOut: { kind: 'cut', durationMs: 0 } },
          { clipId: 'third', holdMs: 1000 },
        ],
      },
      samplePropertyRamps: {
        repeatScale: {
          initial: 1,
          ramps: [{ atMs: 1000, from: 1, to: 3, durationMs: 1000, easing: 'linear' }],
        },
      },
    }, {})

    expect(artifact.summary.sampleRemappingEstimate).toEqual({
      kind: 'synchronized-tiling',
      scalarGlobals: 1,
      rendererDelta: 0,
      dimensions: '1D/2D',
      maxMultiplicationsPerPixel: 2,
      maxFracCallsPerPixel: 2,
    })
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)
    handle.beforeRender(1500)
    handle.render2D(0, 0.25, 0.75)
    const expected = remapShowSample([0.25, 0.75], 2)
    expect(pixel()[0]).toBeCloseTo(expected[0])
    expect(pixel()[1]).toBeCloseTo(expected[1])
  })

  it('remaps a 1D renderer through the repeated normalized index domain (#406)', () => {
    const artifact = compileShow({
      clips: [{ id: 'strip', source: 'export function render(index) { rgb(index / 4, 0, 0) }' }],
      samplePropertyRamps: { repeatScale: { initial: 2, ramps: [] } },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 5)

    handle.beforeRender(16)
    handle.render(2)
    expect(pixel()[0]).toBe(remapShowIndex(2, 5, 2) / 4)
  })

  it('applies tiling after routing has produced zone-local coordinates (#406)', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 3 }] },
      { id: 'right', name: 'right', ranges: [{ start: 4, end: 7 }] },
    ]
    const artifact = compileShow({
      clips: [
        { id: 'left', zone: 'left', source: 'export function render2D(index, x, y) { rgb(1, x, y) }' },
        { id: 'right', zone: 'right', source: 'export function render2D(index, x, y) { rgb(0, x, y) }' },
      ],
      zones,
      routingLayouts: [{
        id: 'split',
        name: 'Split',
        zones,
        logical: { kind: 'split', zoneNames: ['left', 'right'], axis: 'x' },
      }],
      routingPropertyRamps: { splitPosition: { initial: 0.25, ramps: [] } },
      samplePropertyRamps: { repeatScale: { initial: 2, ramps: [] } },
      loopDurationMs: 1000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 8)

    handle.beforeRender(16)
    handle.render2D(0, 0.0625, 0.25)
    expect(pixel()).toEqual([1, 0.5, 0.5])
  })

  it('animates a moving split through one routed renderer per pixel (#405)', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 3 }] },
      { id: 'right', name: 'right', ranges: [{ start: 4, end: 7 }] },
    ]
    const artifact = compileShow({
      clips: [
        { id: 'left', zone: 'left', source: 'export function render2D(index, x, y) { rgb(1, x, pixelCount / 10) }' },
        { id: 'right', zone: 'right', source: 'export function render2D(index, x, y) { rgb(0, x, pixelCount / 10) }' },
      ],
      zones,
      routingLayouts: [{
        id: 'split',
        name: 'Moving split',
        zones,
        logical: { kind: 'split', zoneNames: ['left', 'right'], axis: 'x' },
      }],
      routingPropertyRamps: {
        splitPosition: {
          initial: 0.25,
          ramps: [{ atMs: 30000, from: 0.25, to: 0.75, durationMs: 1000, easing: 'linear' }],
        },
      },
      loopDurationMs: 60000,
    }, {})

    expect(artifact.summary.routingRepresentation).toBe('coordinate-predicates')
    expect(artifact.summary.transitionCount).toBe(1)
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
    expect(artifact.summary.routingParameterEstimate).toEqual({
      kind: 'moving-split',
      scalarGlobals: 1,
      arrayElements: 0,
      routeComparisonsPerPixel: 1,
      equivalentEnumeratedArrayElements: 16,
    })
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 8)
    handle.beforeRender(29500)
    handle.render2D(2, 0.3, 0.5)
    expect(pixel()[0]).toBe(0)
    expect(pixel()[1]).toBeCloseTo((0.3 - 0.25) / 0.75)
    expect(pixel()[2]).toBe(0.6)
    handle.beforeRender(1100)
    handle.render2D(2, 0.3, 0.5)
    expect(pixel()[0]).toBe(1)
    expect(pixel()[1]).toBeCloseTo(0.3 / 0.55)
    expect(pixel()[2]).toBe(0.4)
  })

  it('compiles equivalent contiguous routing layouts to a generated formula (#408)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'red', zone: 'red-zone', source: 'export function render(index) { rgb(1, index / 10, 0) }' },
        { id: 'blue', zone: 'blue-zone', source: 'export function render(index) { rgb(0, index / 10, 1) }' },
      ],
      zones: [
        { id: 'red-a', name: 'red-zone', ranges: [{ start: 0, end: 3 }] },
        { id: 'blue-a', name: 'blue-zone', ranges: [{ start: 4, end: 7 }] },
      ],
      routingLayouts: [
        { id: 'red-first', name: 'Red first', zones: [
          { id: 'red-a', name: 'red-zone', ranges: [{ start: 0, end: 3 }] },
          { id: 'blue-a', name: 'blue-zone', ranges: [{ start: 4, end: 7 }] },
        ] },
        { id: 'blue-first', name: 'Blue first', zones: [
          { id: 'red-b', name: 'red-zone', ranges: [{ start: 4, end: 7 }] },
          { id: 'blue-b', name: 'blue-zone', ranges: [{ start: 0, end: 3 }] },
        ] },
      ],
      routingSwitches: [{ atMs: 1000, layoutId: 'blue-first' }],
      loopDurationMs: 2000,
    }, {})

    expect(artifact.summary.routingRepresentation).toBe('generated-formula')
    expect(artifact.summary.routingEstimate).toMatchObject({
      pixelCount: 8,
      layoutCount: 2,
      runCount: 4,
      arrayElements: 0,
      estimatedArrayBytes: 0,
    })
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 8)
    handle.beforeRender(500)
    handle.render(6)
    expect(pixel()).toEqual([0, 0.2, 1])
    handle.beforeRender(600)
    handle.render(6)
    expect(pixel()).toEqual([1, 0.2, 0])
  })

  it('compiles equivalent row-band routing layouts to a generated formula (#408)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'red', zone: 'red-zone', source: 'export function render(index) { rgb(1, index / 10, 0) }' },
        { id: 'blue', zone: 'blue-zone', source: 'export function render(index) { rgb(0, index / 10, 1) }' },
      ],
      zones: [
        { id: 'red-a', name: 'red-zone', ranges: [{ start: 0, end: 3 }, { start: 8, end: 11 }] },
        { id: 'blue-a', name: 'blue-zone', ranges: [{ start: 4, end: 7 }, { start: 12, end: 15 }] },
      ],
      routingLayouts: [
        { id: 'red-first', name: 'Red first', zones: [
          { id: 'red-a', name: 'red-zone', ranges: [{ start: 0, end: 3 }, { start: 8, end: 11 }] },
          { id: 'blue-a', name: 'blue-zone', ranges: [{ start: 4, end: 7 }, { start: 12, end: 15 }] },
        ] },
        { id: 'blue-first', name: 'Blue first', zones: [
          { id: 'red-b', name: 'red-zone', ranges: [{ start: 4, end: 7 }, { start: 12, end: 15 }] },
          { id: 'blue-b', name: 'blue-zone', ranges: [{ start: 0, end: 3 }, { start: 8, end: 11 }] },
        ] },
      ],
      routingSwitches: [{ atMs: 1000, layoutId: 'blue-first' }],
      loopDurationMs: 2000,
    }, {})

    expect(artifact.summary.routingRepresentation).toBe('generated-formula')
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)
    handle.beforeRender(500)
    handle.render(14)
    expect(pixel()).toEqual([0, 0.6, 1])
    handle.beforeRender(600)
    handle.render(14)
    expect(pixel()).toEqual([1, 0.6, 0])
  })

  it('progressively transfers routing ownership with one renderer per pixel while clocks continue (#403)', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'red',
          zone: 'red-zone',
          source: 'export var ticks = 0\nexport function beforeRender(delta) { ticks = ticks + 1 }\nexport function render(index) { rgb(1, ticks, index) }',
        },
        {
          id: 'blue',
          zone: 'blue-zone',
          source: 'export var ticks = 0\nexport function beforeRender(delta) { ticks = ticks + 1 }\nexport function render(index) { rgb(0, ticks, index) }',
        },
      ],
      zones: [
        { id: 'red-a', name: 'red-zone', ranges: [{ start: 0, end: 1 }] },
        { id: 'blue-a', name: 'blue-zone', ranges: [{ start: 2, end: 3 }] },
      ],
      routingLayouts: [
        { id: 'layout-a', name: 'Red left', zones: [
          { id: 'red-a', name: 'red-zone', ranges: [{ start: 0, end: 1 }] },
          { id: 'blue-a', name: 'blue-zone', ranges: [{ start: 2, end: 3 }] },
        ] },
        { id: 'layout-b', name: 'Blue left', zones: [
          { id: 'red-b', name: 'red-zone', ranges: [{ start: 2, end: 3 }] },
          { id: 'blue-b', name: 'blue-zone', ranges: [{ start: 0, end: 1 }] },
        ] },
      ],
      routingSwitches: [{
        atMs: 1000,
        layoutId: 'layout-b',
        durationMs: 1000,
        easing: 'linear',
        direction: 'forward',
      }],
      loopDurationMs: 3000,
    }, {})

    expect(artifact.summary.renderPolicy).toBe('route-one-renderer-per-pixel')
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(1500)
    handle.render(0)
    expect(pixel()).toEqual([0, 1, 0])
    handle.render(3)
    expect(pixel()).toEqual([0, 1, 1])

    handle.beforeRender(600)
    handle.render(3)
    expect(pixel()).toEqual([1, 2, 1])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_ticks: 2,
      __pxlblz_show_c1_ticks: 2,
    })
  })

  it('applies progressive ownership through coordinate-defined routing layouts (#403)', () => {
    const zones = [
      { id: 'a', name: 'a', ranges: [{ start: 0, end: 1 }] },
      { id: 'b', name: 'b', ranges: [{ start: 2, end: 3 }] },
    ]
    const artifact = compileShow({
      clips: [
        { id: 'a', zone: 'a', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'b', zone: 'b', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      ],
      zones,
      routingLayouts: [
        { id: 'ab', name: 'A then B', zones, logical: { kind: 'stripes', zoneNames: ['a', 'b'], axis: 'x' } },
        { id: 'ba', name: 'B then A', zones, logical: { kind: 'stripes', zoneNames: ['b', 'a'], axis: 'x' } },
      ],
      routingSwitches: [{ atMs: 1000, layoutId: 'ba', durationMs: 1000 }],
      loopDurationMs: 3000,
    }, {})

    expect(artifact.summary.routingRepresentation).toBe('coordinate-predicates')
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)
    handle.beforeRender(1500)
    handle.render2D(0, 0.25, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render2D(3, 0.75, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
  })

  it('applies progressive ownership through an interleaved routing formula (#403, #408)', () => {
    const alternatingRanges = (parity: number) => Array.from({ length: 32 }, (_, run) => ({
      start: run * 2 + parity,
      end: run * 2 + parity,
    }))
    const layout = (id: string, swapped: boolean) => ({
      id,
      name: id,
      zones: [
        { id: `${id}-a`, name: 'a', ranges: alternatingRanges(swapped ? 1 : 0) },
        { id: `${id}-b`, name: 'b', ranges: alternatingRanges(swapped ? 0 : 1) },
      ],
    })
    const artifact = compileShow({
      clips: [
        { id: 'a', zone: 'a', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'b', zone: 'b', source: 'export function render(index) { rgb(0, 0, 1) }' },
      ],
      zones: [
        { id: 'a', name: 'a', ranges: alternatingRanges(0) },
        { id: 'b', name: 'b', ranges: alternatingRanges(1) },
      ],
      routingLayouts: [layout('source', false), layout('destination', true)],
      routingSwitches: [{ atMs: 1000, layoutId: 'destination', durationMs: 1000 }],
      loopDurationMs: 3000,
    }, {})

    expect(artifact.summary.routingRepresentation).toBe('generated-formula')
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 64)
    handle.beforeRender(1500)
    handle.render(0)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render(63)
    expect(pixel()).toEqual([0, 0, 1])
  })

  it('uses the bounded packed fallback for irregular high-run routing layouts (#408)', () => {
    const singletonRanges = (indices: number[]) => indices.map((index) => ({ start: index, end: index }))
    const even = Array.from({ length: 32 }, (_, index) => index * 2)
    const odd = Array.from({ length: 32 }, (_, index) => index * 2 + 1)
    const irregularRed = [0, ...odd.filter((index) => index !== 1)]
    const irregularBlue = [1, ...even.filter((index) => index !== 0)]
    const layout = (id: string, red: number[], blue: number[]) => ({
      id,
      name: id,
      zones: [
        { id: `${id}-red`, name: 'red', ranges: singletonRanges(red) },
        { id: `${id}-blue`, name: 'blue', ranges: singletonRanges(blue) },
      ],
    })
    const artifact = compileShow({
      clips: [
        { id: 'red', zone: 'red', source: 'export function render(index) { rgb(1, index / 100, 0) }' },
        { id: 'blue', zone: 'blue', source: 'export function render(index) { rgb(0, index / 100, 1) }' },
      ],
      zones: layout('base', even, odd).zones,
      routingLayouts: [
        layout('alternating', even, odd),
        layout('irregular', irregularRed, irregularBlue),
      ],
      routingSwitches: [{ atMs: 1000, layoutId: 'irregular' }],
      loopDurationMs: 2000,
    }, {})

    expect(artifact.summary.routingRepresentation).toBe('packed-pixels')
    expect(artifact.summary.routingEstimate).toMatchObject({
      arrayElements: 128,
      estimatedArrayBytes: 512,
    })
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 64)
    handle.beforeRender(1100)
    handle.render(3)
    expect(pixel()).toEqual([1, 0.01, 0])
  })

  it('switches named routing layouts on a looping schedule without restarting members (#398)', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'red',
          zone: 'red-zone',
          source: `
export var ticks = 0
export function beforeRender(delta) { ticks = ticks + 1 }
export function render(index) { rgb(1, ticks, index) }
`,
        },
        {
          id: 'blue',
          zone: 'blue-zone',
          source: `
export var ticks = 0
export function beforeRender(delta) { ticks = ticks + 1 }
export function render(index) { rgb(0, ticks, index) }
`,
        },
      ],
      zones: [
        { id: 'red-a', name: 'red-zone', ranges: [{ start: 0, end: 1 }] },
        { id: 'blue-a', name: 'blue-zone', ranges: [{ start: 2, end: 3 }] },
      ],
      routingLayouts: [
        {
          id: 'layout-a',
          name: 'Red left',
          zones: [
            { id: 'red-a', name: 'red-zone', ranges: [{ start: 0, end: 1 }] },
            { id: 'blue-a', name: 'blue-zone', ranges: [{ start: 2, end: 3 }] },
          ],
        },
        {
          id: 'layout-b',
          name: 'Blue left',
          zones: [
            { id: 'red-b', name: 'red-zone', ranges: [{ start: 2, end: 3 }] },
            { id: 'blue-b', name: 'blue-zone', ranges: [{ start: 0, end: 1 }] },
          ],
        },
      ],
      routingSwitches: [{ atMs: 1000, layoutId: 'layout-b' }],
      loopDurationMs: 2000,
    }, {})

    expect(artifact.summary.renderPolicy).toBe('route-one-renderer-per-pixel')
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render(0)
    expect(pixel()).toEqual([1, 1, 0])

    handle.beforeRender(600)
    handle.render(0)
    expect(pixel()).toEqual([0, 2, 0])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_ticks: 2,
      __pxlblz_show_c1_ticks: 2,
    })

    handle.beforeRender(1000)
    handle.render(0)
    expect(pixel()).toEqual([1, 3, 0])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_ticks: 3,
      __pxlblz_show_c1_ticks: 3,
    })
  })

  it('routes native 2D members through normalized zone-local square coordinates (#401)', () => {
    const artifact = compileShow({
      clips: [{
        id: 'ribbon',
        zone: 'canvas',
        source: `
export var ticks = 0
export function beforeRender(delta) { ticks = ticks + 1 }
export function render2D(index, x, y) { rgb(x, y, ticks / 10) }
`,
      }],
      zones: [{ id: 'canvas-a', name: 'canvas', ranges: [{ start: 0, end: 3 }] }],
      routingLayouts: [
        { id: 'left', name: 'Left', zones: [{ id: 'canvas-left', name: 'canvas', ranges: [{ start: 0, end: 3 }] }] },
        { id: 'right', name: 'Right', zones: [{ id: 'canvas-right', name: 'canvas', ranges: [{ start: 4, end: 7 }] }] },
      ],
      routingSwitches: [{ atMs: 1000, layoutId: 'right' }],
      loopDurationMs: 2000,
    }, {})

    expect(artifact.metadata.renderFns).toMatchObject({ hasRender: false, hasRender2D: true })
    expect(artifact.summary.renderPolicy).toBe('route-one-renderer-per-pixel')
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
    expect(artifact.summary.routingRepresentation).toBe('range-branches')
    expect(artifact.code).toContain('export function render2D(index, x, y)')

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 8)
    handle.beforeRender(500)
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([0, 0, 0.1])
    handle.render2D(3, 1, 1)
    expect(pixel()).toEqual([1, 1, 0.1])

    handle.beforeRender(600)
    handle.render2D(4, 0, 0)
    expect(pixel()).toEqual([0, 0, 0.2])
    handle.render2D(7, 1, 1)
    expect(pixel()).toEqual([1, 1, 0.2])
  })

  it.each([
    { size: 16, index: 15 * 16 + 15 },
    { size: 32, index: 31 * 32 + 31 },
  ])('routes one coordinate-defined Show artifact at $size x $size (#409)', ({ size, index }) => {
    const zones = ['nw', 'ne', 'sw', 'se']
    const artifact = compileShow({
      clips: zones.map((zone, zoneIndex) => ({
        id: zone,
        zone,
        source: `export function render2D(index, x, y) { rgb(${zoneIndex}, x, y) }`,
      })),
      zones: zones.map((name, zoneIndex) => ({
        id: name,
        name,
        ranges: [{ start: zoneIndex * 64, end: zoneIndex * 64 + 63 }],
      })),
      routingLayouts: [{
        id: 'quadrants',
        name: 'Quadrants',
        zones: zones.map((name, zoneIndex) => ({
          id: name,
          name,
          ranges: [{ start: zoneIndex * 64, end: zoneIndex * 64 + 63 }],
        })),
        logical: { kind: 'grid', zoneNames: zones, columns: 2, rows: 2 },
      }],
      routingSwitches: [],
      loopDurationMs: 1000,
    }, {})

    expect(artifact.summary.routingRepresentation).toBe('coordinate-predicates')
    expect(artifact.code).not.toContain('__pxlblz_show_route_pixels')
    expect(artifact.code).not.toContain('if (index < 256)')

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, size * size)
    handle.beforeRender(16)
    handle.render2D(index, 1, 1)
    expect(pixel()).toEqual([3, 1, 1])
  })

  it('mirrors routed 2D member coordinates with the existing mirror adaptation (#401)', () => {
    const artifact = compileShow({
      clips: [{
        id: 'mirror',
        zone: 'canvas',
        adaptation: { mirror: true },
        source: 'export function render2D(index, x, y) { rgb(x, y, index) }',
      }],
      zones: [{ id: 'canvas', name: 'canvas', ranges: [{ start: 0, end: 3 }] }],
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(16)
    handle.render2D(0, 0, 0)

    expect(pixel()).toEqual([1, 0, 3])
  })

  it('warns when a routing layout assigns one physical pixel to multiple zones (#398)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'a', zone: 'a', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'b', zone: 'b', source: 'export function render(index) { rgb(0, 0, 1) }' },
      ],
      zones: [
        { id: 'a', name: 'a', ranges: [{ start: 0, end: 3 }] },
        { id: 'b', name: 'b', ranges: [{ start: 4, end: 7 }] },
      ],
      routingLayouts: [{
        id: 'overlap',
        name: 'Overlap',
        zones: [
          { id: 'a', name: 'a', ranges: [{ start: 0, end: 4 }] },
          { id: 'b', name: 'b', ranges: [{ start: 4, end: 7 }] },
        ],
      }],
      routingSwitches: [],
      loopDurationMs: 2000,
    }, {})

    expect(artifact.summary.warnings).toContain(
      'Routing layout "Overlap" assigns overlapping pixels to clips "a" and "b"; the first route wins.',
    )
  })

  it('warns that pixels missing from a routing layout render black deterministically (#403)', () => {
    const artifact = compileShow({
      clips: [{ id: 'a', zone: 'a', source: 'export function render(index) { rgb(1, 0, 0) }' }],
      zones: [{ id: 'all', name: 'a', ranges: [{ start: 0, end: 3 }] }],
      routingLayouts: [
        { id: 'complete', name: 'Complete', zones: [{ id: 'all', name: 'a', ranges: [{ start: 0, end: 3 }] }] },
        { id: 'gap', name: 'Gap', zones: [{ id: 'partial', name: 'a', ranges: [{ start: 0, end: 1 }] }] },
      ],
      routingSwitches: [{ atMs: 1000, layoutId: 'gap', durationMs: 500 }],
      loopDurationMs: 2000,
    }, {})

    expect(artifact.summary.warnings).toContain(
      'Routing layout "Gap" leaves 2 of 4 physical pixels unassigned; those pixels render black.',
    )
  })

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

  it('uses the shared renderer cascade for a mixed 2D and 1D crossfade', () => {
    const artifact = compileShow({
      clips: [
        { id: 'surface', source: 'export function render2D(index, x, y) { rgb(x, y, 0) }' },
        { id: 'strand', source: 'export function render(index) { rgb(index, 0, 0) }' },
      ],
      crossfade: { startMs: 1000, durationMs: 1000 },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    expect(artifact.metadata.renderFns).toMatchObject({ hasRender: false, hasRender2D: true })
    handle.beforeRender(1500)
    handle.render2D(2, 0.25, 0.75)
    expect(pixel()).toEqual([1.125, 0.375, 0])
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

  it('repeats one shared 2D member over several zone-local domains', () => {
    const artifact = compileShow({
      zones: [
        { id: 'left', name: 'left', ranges: [{ start: 0, end: 3 }] },
        { id: 'right', name: 'right', ranges: [{ start: 4, end: 7 }] },
      ],
      clips: [{
        id: 'loom',
        zones: ['left', 'right'],
        zoneMode: 'repeat',
        source: `
export var ticks = 0
export function beforeRender(delta) { ticks = ticks + 1 }
export function render2D(index, x, y) { rgb(x, y, ticks) }
`,
      }],
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 8)

    expect(artifact.summary.clipCount).toBe(1)
    handle.beforeRender(16)
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render2D(3, 1, 1)
    expect(pixel()).toEqual([1, 1, 1])
    handle.render2D(4, 0, 0)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render2D(7, 1, 1)
    expect(pixel()).toEqual([1, 1, 1])
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_ticks: 1 })
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

  it('preserves a single clip native 2D renderer and Stage coordinates', () => {
    const artifact = compileShow({
      clips: [{
        id: 'surface',
        source: 'export function render2D(index, x, y) { rgb(x, y, index) }',
      }],
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    expect(artifact.metadata.renderFns).toEqual({
      hasBeforeRender: true,
      hasRender: false,
      hasRender2D: true,
      hasRender3D: false,
    })
    handle.beforeRender(16)
    handle.render2D(2, 0.25, 0.75)
    expect(pixel()).toEqual([0.25, 0.75, 2])
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

  it('preserves native 2D renderers across a cut boundary', () => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export function render2D(index, x, y) { rgb(x, y, 0) }' },
        { id: 'to', source: 'export function render2D(index, x, y) { rgb(0, x, y) }' },
      ],
      cut: { startMs: 1000 },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    expect(artifact.metadata.renderFns).toMatchObject({ hasRender: false, hasRender2D: true })
    handle.beforeRender(500)
    handle.render2D(0, 0.25, 0.75)
    expect(pixel()).toEqual([0.25, 0.75, 0])

    handle.beforeRender(500)
    handle.render2D(0, 0.25, 0.75)
    expect(pixel()).toEqual([0, 0.25, 0.75])
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
        easing: 'ease-in',
      },
    }, {})

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(1500)
    handle.render(0)

    expect(pixel()).toEqual([0.8125, 0.8125, 0.8125])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_renderCalls: 1,
      __pxlblz_show_c0_adapt_brightness: 0.8125,
      __pxlblz_show_c0_adapt_phase: 0.05,
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

  it('evaluates independent brightness and time-scale curves on one member (#418)', () => {
    const artifact = compileShow({
      clips: [{ id: 'continuous', source: 'export function render(index) { rgb(1, 1, 1) }' }],
      adaptationRamp: {
        startMs: 0,
        durationMs: 2000,
        from: { brightness: 1, timeScale: 1 },
        to: { brightness: 0.2, timeScale: 0 },
        propertyRamps: {
          brightness: { from: 1, to: 0.2, durationMs: 1000, easing: 'ease-in' },
          timeScale: { from: 1, to: 0, durationMs: 2000, easing: 'ease-out' },
        },
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(500)
    handle.render(0)

    expect(pixel()).toEqual([0.8, 0.8, 0.8])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_adapt_brightness: 0.8,
      __pxlblz_show_c0_adapt_timeScale: 0.5625,
    })
    expect(artifact.summary).toMatchObject({
      clipCount: 1,
      renderPolicy: 'parameter-ramp-one-renderer-per-pixel',
      transitionCost: 'parameter',
      worstInstantRenderersPerPixel: 1,
    })
  })

  it('calls an alpha-renamed public slider once per frame with its eased value (#419)', () => {
    const source = `
var speed = 0
export var sliderCalls = 0
export function sliderSpeed(v) { speed = v; sliderCalls = sliderCalls + 1 }
export function render(index) { rgb(speed, 0, 0) }
`
    const artifact = compileShow({
      clips: [{ id: 'controlled', source, controlTargets: { sliderSpeed: 0.2 } }],
      adaptationRamp: {
        startMs: 0,
        durationMs: 1000,
        from: {},
        to: {},
        controlRamps: {
          sliderSpeed: { from: 0.2, to: 0.8, durationMs: 1000, easing: 'ease-in' },
        },
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(500)
    handle.render(0)
    handle.render(1)

    expect(pixel()[0]).toBeCloseTo(0.35)
    expect(handle.getExports().__pxlblz_show_c0_speed).toBeCloseTo(0.35)
    expect(handle.getExports().__pxlblz_show_c0_control_sliderSpeed).toBeCloseTo(0.35)
    expect(handle.getExports().__pxlblz_show_c0_sliderCalls).toBe(1)
    expect(artifact.code).toContain('__pxlblz_show_c0_sliderSpeed(__pxlblz_show_c0_control_sliderSpeed)')
    expect(artifact.summary).toMatchObject({ transitionCost: 'parameter', worstInstantRenderersPerPixel: 1 })
  })

  it('rejects missing or incompatible Pattern controls with an actionable error (#419)', () => {
    expect(() => compileShow({
      clips: [{ id: 'broken', source: 'export function render(index) { rgb(1, 0, 0) }', controlTargets: { sliderSpeed: 0.5 } }],
    }, {})).toThrow(/clip "broken".*sliderSpeed.*public slider control not found/i)

    expect(() => compileShow({
      clips: [{
        id: 'toggle-only',
        source: 'export function toggleSpeed(v) {}\nexport function render(index) { rgb(1, 0, 0) }',
        controlTargets: { toggleSpeed: 1 },
      }],
    }, {})).toThrow(/public slider control not found/i)
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
      temporalPolicy: 'continuous',
    })
  })

  it('holds private time between stepped-clock boundaries while continuing to render', () => {
    const artifact = compileShow({
      clips: [{
        id: 'stepped',
        source: `
export var elapsed = 0
export var frames = 0
export var renders = 0
export function beforeRender(delta) { elapsed = elapsed + delta; frames = frames + 1 }
export function render(index) { renders = renders + 1; rgb(elapsed, frames, renders) }
`,
        adaptation: { steppedClock: { stepMs: 100 } },
      }],
    }, {})
    const runtime = loadShow(artifact.code, artifact.metadata)

    runtime.handle.beforeRender(40)
    runtime.handle.render(0)
    expect(runtime.pixel()).toEqual([0, 0, 1])
    runtime.handle.beforeRender(35)
    runtime.handle.render(0)
    expect(runtime.pixel()).toEqual([0, 0, 2])
    runtime.handle.beforeRender(30)
    runtime.handle.render(0)
    expect(runtime.pixel()).toEqual([100, 1, 3])
    runtime.handle.beforeRender(195)
    runtime.handle.render(0)

    expect(runtime.pixel()).toEqual([300, 2, 4])
    expect(runtime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 300,
      __pxlblz_show_c0_step_pending_ms: 0,
      __pxlblz_show_c0_elapsed: 300,
      __pxlblz_show_c0_frames: 2,
      __pxlblz_show_c0_renders: 4,
    })
    expect(artifact.summary).toMatchObject({
      temporalPolicy: 'stepped-clock',
      renderPolicy: 'single-continuous-hold',
      worstInstantRenderersPerPixel: 1,
      clips: [expect.objectContaining({ temporalPolicy: 'stepped-clock', stepMs: 100 })],
    })
  })

  it('preserves a stepped schedule through a hold and starts a fresh schedule after a cut', () => {
    const source = `
export var elapsed = 0
export function beforeRender(delta) { elapsed = elapsed + delta }
export function render(index) { rgb(elapsed, index, 0) }
`
    const held = compileShow({
      clips: [{ id: 'held', source, adaptation: { steppedClock: { stepMs: 100 } } }],
    }, {})
    const heldRuntime = loadShow(held.code, held.metadata)

    heldRuntime.handle.beforeRender(60)
    heldRuntime.handle.beforeRender(60)

    expect(heldRuntime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 100,
      __pxlblz_show_c0_step_pending_ms: 20,
      __pxlblz_show_c0_elapsed: 100,
    })

    const restarted = compileShow({
      clips: [
        { id: 'from', source, adaptation: { steppedClock: { stepMs: 100 } } },
        { id: 'to', source, adaptation: { steppedClock: { stepMs: 100 } } },
      ],
      cut: { startMs: 100 },
    }, {})
    const restartRuntime = loadShow(restarted.code, restarted.metadata)

    restartRuntime.handle.beforeRender(60)
    restartRuntime.handle.beforeRender(60)
    restartRuntime.handle.beforeRender(40)

    expect(restartRuntime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 0,
      __pxlblz_show_c0_step_pending_ms: 60,
      __pxlblz_show_c1_elapsed_ms: 100,
      __pxlblz_show_c1_step_pending_ms: 0,
    })
    expect(restarted.summary).toMatchObject({
      temporalPolicy: 'stepped-clock',
      renderPolicy: 'cut-restart',
    })
  })

  it('composes stepped time after time scaling and shutter freeze eligibility', () => {
    const artifact = compileShow({
      clips: [{
        id: 'composed',
        source: `
export var elapsed = 0
export function beforeRender(delta) { elapsed = elapsed + delta }
export function render(index) { rgb(elapsed, index, 0) }
`,
        adaptation: {
          timeScale: 0.5,
          steppedClock: { stepMs: 100 },
          lightShutter: { rateHz: 1, duty: 0.5, phase: 0, clockBehavior: 'freeze' },
        },
      }],
    }, {})
    const runtime = loadShow(artifact.code, artifact.metadata)

    runtime.handle.beforeRender(300)
    runtime.handle.beforeRender(400)

    expect(runtime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 250,
      __pxlblz_show_c0_step_pending_ms: 0,
      __pxlblz_show_c0_step_pending_delta: 0,
      __pxlblz_show_c0_elapsed: 250,
    })
    expect(artifact.summary).toMatchObject({
      clockPolicy: 'scaled',
      temporalPolicy: 'stepped-clock',
      evaluationPolicy: 'masked-shutter',
    })
  })

  it('offsets private time before stepped cadence releases accumulated motion', () => {
    const artifact = compileShow({
      clips: [{
        id: 'offset',
        source: `
export var frames = 0
export function beforeRender(delta) { frames = frames + 1 }
export function render(index) { rgb(time(1), frames, index) }
`,
        adaptation: { timeOffsetMs: 250, steppedClock: { stepMs: 100 } },
      }],
    }, {})
    const runtime = loadShow(artifact.code, artifact.metadata)

    runtime.handle.render(3)
    expect(runtime.pixel()).toEqual([0.25, 0, 3])
    runtime.handle.beforeRender(50)
    runtime.handle.render(3)
    expect(runtime.pixel()).toEqual([0.25, 0, 3])
    runtime.handle.beforeRender(50)
    runtime.handle.render(3)

    expect(runtime.pixel()[0]).toBeCloseTo(0.35)
    expect(runtime.pixel().slice(1)).toEqual([1, 3])
    expect(artifact.summary).toMatchObject({
      timeOffsetPolicy: 'per-clip',
      worstInstantRenderersPerPixel: 1,
      clips: [expect.objectContaining({ timeOffsetMs: 250 })],
    })
  })

  it('restarts a fresh member at its configured private time offset after a cut', () => {
    const source = `export function render(index) { rgb(time(1), index, 0) }`
    const artifact = compileShow({
      clips: [
        { id: 'from', source, adaptation: { timeOffsetMs: 100 } },
        { id: 'to', source, adaptation: { timeOffsetMs: 500 } },
      ],
      cut: { startMs: 100 },
    }, {})
    const runtime = loadShow(artifact.code, artifact.metadata)

    runtime.handle.beforeRender(60)
    runtime.handle.render(0)
    expect(runtime.pixel()[0]).toBeCloseTo(0.16)
    runtime.handle.beforeRender(60)
    runtime.handle.render(0)

    expect(runtime.pixel()[0]).toBeCloseTo(0.56)
    expect(runtime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 160,
      __pxlblz_show_c1_elapsed_ms: 560,
    })
  })

  it('stagger-routes repeated Patterns across multi-range zones with one renderer per pixel', () => {
    const source = `
export var renders = 0
export function render(index) { renders = renders + 1; rgb(time(1), index, renders) }
`
    const artifact = compileShow({
      zones: [
        { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }, { start: 4, end: 5 }] },
        { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }, { start: 6, end: 7 }] },
      ],
      clips: [
        { id: 'round-left', source, zone: 'left', adaptation: { timeOffsetMs: 0 } },
        { id: 'round-right', source, zone: 'right', adaptation: { timeOffsetMs: 250 } },
      ],
    }, {})
    const runtime = loadShow(artifact.code, artifact.metadata, 8)

    runtime.handle.beforeRender(100)
    runtime.handle.render(4)
    expect(runtime.pixel()).toEqual([0.1, 2, 1])
    runtime.handle.render(6)

    expect(runtime.pixel()[0]).toBeCloseTo(0.35)
    expect(runtime.pixel().slice(1)).toEqual([2, 1])
    expect(artifact.summary).toMatchObject({
      renderPolicy: 'route-one-renderer-per-pixel',
      transitionCost: 'route',
      timeOffsetPolicy: 'per-clip',
      worstInstantRenderersPerPixel: 1,
      clips: [
        expect.objectContaining({ id: 'round-left', timeOffsetMs: 0 }),
        expect.objectContaining({ id: 'round-right', timeOffsetMs: 250 }),
      ],
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

  it('projects a directional Wipe through normalized 2D Stage coordinates with one renderer per pixel (#446)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(1, 0, 0) }' },
        { id: 'to', source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(0, 1, 0) }' },
      ],
      routeTransition: { kind: 'wipe', startMs: 1000, durationMs: 1000, direction: 0.25, edgePolicy: 'hard' },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, 0.9, 0.25)
    expect(pixel()).toEqual([0, 1, 0])
    handle.render2D(1, 0.1, 0.75)
    expect(pixel()).toEqual([1, 0, 0])
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_calls: 1, __pxlblz_show_c1_calls: 1 })
    expect(artifact.summary).toMatchObject({
      renderPolicy: 'spatial-route-one-renderer-per-pixel',
      transitionCost: 'route',
      routePolicy: 'hard-wipe',
      worstInstantRenderersPerPixel: 1,
      cost: { cpu: { patternEvaluations: { formula: 'N', basePerPixel: 1 } } },
    })
    expect(artifact.code).toContain('export function render2D(index, x, y)')
    expect(artifact.code).toContain('y * 1')
  })

  it('limits true Wipe blending to the feather band and reports N + E (#446)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(1, 0, 0) }' },
        { id: 'to', source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(0, 1, 0) }' },
      ],
      routeTransition: {
        kind: 'wipe', startMs: 1000, durationMs: 1000,
        direction: 0, feather: 0.2, edgePolicy: 'blend',
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, 0.5, 0.2)
    expect(pixel()[0]).toBeCloseTo(0.5)
    expect(pixel()[1]).toBeCloseTo(0.5)
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_calls: 1, __pxlblz_show_c1_calls: 1 })
    expect(artifact.summary).toMatchObject({
      renderPolicy: 'spatial-route-bounded-feather',
      transitionCost: 'bounded-renderer-window',
      routePolicy: 'blended-wipe',
      worstInstantRenderersPerPixel: 2,
      cost: { cpu: { patternEvaluations: { formula: 'N + E', basePerPixel: 1, additionalPerEdgePixel: 1 } } },
    })
  })

  it.each([
    ['split-out', { wipeVariant: 'split', wipeMode: 'center-out', orientation: 'vertical' }, 0.5, 0.2],
    ['split-in', { wipeVariant: 'split', wipeMode: 'center-in', orientation: 'vertical' }, 0.5, 0.2],
    ['barn-doors', { wipeVariant: 'barn-doors', centerX: 0.5, centerY: 0.5 }, 0.5, 0.5],
    ['horizontal-blinds', { wipeVariant: 'blinds', orientation: 'horizontal', count: 4 }, 0.2, 0.3],
    ['clock', { wipeVariant: 'clock', centerX: 0.5, centerY: 0.5, phase: 0 }, 1, 0.5],
    ['checker', { wipeVariant: 'checker', count: 4 }, 0.1, 0.1],
    ['grid', { wipeVariant: 'grid', count: 4 }, 0.125, 0.125],
  ] as const)('matches the pure %s Wipe mask in generated output (#450)', (_name, settings, x, y) => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'to', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
      ],
      routeTransition: {
        kind: 'wipe', startMs: 1000, durationMs: 1000, edgePolicy: 'hard',
        ...settings,
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, x, y)
    expect(pixel()).toEqual(showWipeMaskPosition(settings as ShowWipeSettings, x, y) < 0.5
      ? [0, 1, 0]
      : [1, 0, 0])
    expect(artifact.summary).toMatchObject({
      renderPolicy: 'spatial-route-one-renderer-per-pixel',
      transitionCost: 'route', routePolicy: 'hard-wipe', worstInstantRenderersPerPixel: 1,
    })
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

  it('routes a portal feather through a stable 2D threshold with one renderer per pixel', () => {
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
      routeTransition: {
        kind: 'portal',
        startMs: 1000,
        durationMs: 1000,
        centerX: 0.5,
        centerY: 0.5,
        feather: 0.2,
        invert: false,
        featherPolicy: 'dither',
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, 0.5, 0.5)
    expect(pixel()).toEqual([0, 1, 0])
    handle.render2D(1, 0, 0)
    expect(pixel()).toEqual([1, 0, 0])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_calls: 1,
      __pxlblz_show_c1_calls: 1,
    })
    expect(artifact.summary).toMatchObject({
      renderPolicy: 'spatial-route-one-renderer-per-pixel',
      transitionCost: 'route',
      routePolicy: 'portal-dithered-feather',
      worstInstantRenderersPerPixel: 1,
    })
  })

  it.each([
    {
      shape: 'diamond' as const,
      transition: { shape: 'diamond' as const, rotation: 0.125, spin: 0.5 },
      incoming: [0.5, 0.5] as const,
      outgoing: [0, 0] as const,
    },
    {
      shape: 'ring' as const,
      transition: { shape: 'ring' as const, ringWidth: 0.2 },
      incoming: [0.853553, 0.5] as const,
      outgoing: [0.5, 0.5] as const,
    },
  ])('renders a frame-stable $shape spatial transition with one renderer per pixel (#404)', ({ transition, incoming, outgoing }) => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'to', source: 'export function render(index) { rgb(0, 1, 0) }' },
      ],
      routeTransition: {
        kind: 'portal',
        startMs: 1000,
        durationMs: 1000,
        centerX: 0.5,
        centerY: 0.5,
        feather: 0,
        invert: false,
        featherPolicy: 'dither',
        scale: 1,
        ...transition,
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, incoming[0], incoming[1])
    expect(pixel()).toEqual([0, 1, 0])
    handle.render2D(1, outgoing[0], outgoing[1])
    expect(pixel()).toEqual([1, 0, 0])
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
  })

  it('runs both member renderers only inside a blended portal feather band', () => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export var calls = 0\nexport function render(index) { calls = calls + 1; rgb(1, 0, 0) }' },
        { id: 'to', source: 'export var calls = 0\nexport function render(index) { calls = calls + 1; rgb(0, 1, 0) }' },
      ],
      routeTransition: {
        kind: 'portal',
        startMs: 1000,
        durationMs: 1000,
        centerX: 0.5,
        centerY: 0.5,
        feather: 0.2,
        invert: false,
        featherPolicy: 'blend',
      },
    }, {})
    const { handle } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, 0.853553, 0.5)
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_calls: 1,
      __pxlblz_show_c1_calls: 1,
    })
    handle.render2D(1, 0, 0)
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_calls: 2,
      __pxlblz_show_c1_calls: 1,
    })
    expect(artifact.summary).toMatchObject({
      renderPolicy: 'spatial-route-bounded-feather',
      transitionCost: 'bounded-renderer-window',
      routePolicy: 'portal-blended-feather',
      worstInstantRenderersPerPixel: 2,
    })
  })

  it('loops a portal sequence across two shared Pattern instances', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'warm',
          source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(1, 0, 0) }',
        },
        {
          id: 'cool',
          source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(0, 1, 0) }',
        },
      ],
      sceneSequence: {
        scenes: [
          {
            clipId: 'warm',
            holdMs: 1000,
            transitionOut: {
              kind: 'portal',
              durationMs: 1000,
              centerX: 0.5,
              centerY: 0.5,
              feather: 0.2,
              invert: false,
              featherPolicy: 'blend',
            },
          },
          {
            clipId: 'cool',
            holdMs: 1000,
            transitionOut: {
              kind: 'portal',
              durationMs: 1000,
              centerX: 0.25,
              centerY: 0.75,
              feather: 0.08,
              invert: true,
              featherPolicy: 'dither',
            },
          },
          { clipId: 'warm', holdMs: 1000 },
        ],
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 256)

    handle.beforeRender(500)
    handle.render2D(0, 0.5, 0.5)
    expect(pixel()).toEqual([1, 0, 0])

    handle.beforeRender(1000)
    handle.render2D(1, 0.5, 0.5)
    expect(pixel()).toEqual([0, 1, 0])

    handle.beforeRender(1000)
    handle.render2D(2, 0.5, 0.5)
    expect(pixel()).toEqual([0, 1, 0])

    handle.beforeRender(1000)
    handle.render2D(3, 0, 0)
    expect(pixel()).toEqual([1, 0, 0])

    handle.beforeRender(2000)
    handle.render2D(4, 0.5, 0.5)
    expect(pixel()).toEqual([1, 0, 0])
    expect(artifact.summary).toMatchObject({
      clipCount: 2,
      transitionCount: 2,
      renderPolicy: 'spatial-route-bounded-feather',
      transitionCost: 'bounded-renderer-window',
      worstInstantRenderersPerPixel: 2,
    })
    expect(artifact.code).toContain('__pxlblz_show_elapsed_ms = (__pxlblz_show_elapsed_ms + delta) % 5000')
  })

  it('eases one private clock to exact pause and back across a scene sequence (#417)', () => {
    const source = `
export var elapsed = 0
export function beforeRender(delta) { elapsed = elapsed + delta }
export function render(index) { rgb(elapsed, time(1), index) }
`
    const artifact = compileShow({
      clips: [{ id: 'continuous', source }],
      sceneSequence: {
        scenes: [
          {
            clipId: 'continuous', holdMs: 100,
            timeScale: 1,
            transitionOut: {
              kind: 'crossfade', durationMs: 100, easing: 'ease-in',
              propertyRamps: { timeScale: { from: 1, to: 0, durationMs: 100, easing: 'ease-in' } },
            },
          },
          {
            clipId: 'continuous', holdMs: 500,
            timeScale: 0,
            transitionOut: {
              kind: 'crossfade', durationMs: 100, easing: 'ease-out',
              propertyRamps: { timeScale: { from: 0, to: 1, durationMs: 100, easing: 'ease-out' } },
            },
          },
          { clipId: 'continuous', holdMs: 100, timeScale: 1 },
        ],
      },
    }, {})
    const { handle } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(100) // transition begins at scale 1
    handle.beforeRender(50) // ease-in midpoint: scale .75
    handle.beforeRender(50) // exact zero
    handle.beforeRender(500) // pause hold remains exact zero
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed: 137.5,
      __pxlblz_show_c0_adapt_timeScale: 0,
    })

    handle.beforeRender(50) // ease-out midpoint: scale .75
    handle.beforeRender(50) // resumed at scale 1
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed: 225,
      __pxlblz_show_c0_adapt_timeScale: 1,
    })
    expect(artifact.summary.clipCount).toBe(1)
  })

  it('plays every scene when portal and wipe boundaries are mixed', () => {
    const artifact = compileShow({
      clips: [
        { id: 'heat', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'circuit', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
        { id: 'glyphs', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      ],
      sceneSequence: {
        scenes: [
          {
            clipId: 'heat',
            holdMs: 1000,
            transitionOut: {
              kind: 'portal',
              durationMs: 1000,
              centerX: 0.5,
              centerY: 0.5,
              feather: 0.12,
              featherPolicy: 'blend',
            },
          },
          {
            clipId: 'circuit',
            holdMs: 1000,
            transitionOut: { kind: 'wipe', durationMs: 1000, feather: 0.2 },
          },
          { clipId: 'glyphs', holdMs: 1000 },
        ],
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 256)

    handle.beforeRender(2500)
    handle.render2D(255, 1, 1)
    expect(pixel()).toEqual([0, 1, 0])
    handle.beforeRender(1000)
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([0, 0, 1])
    handle.beforeRender(1000)
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([0, 0, 1])
    handle.beforeRender(1000)
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([1, 0, 0])
    expect(artifact.summary).toMatchObject({ clipCount: 3, transitionCount: 2 })
  })

  it('initializes and renders the real Glyph Rain source as a third scene', () => {
    const artifact = compileShow({
      clips: [
        { id: 'heat', source: DEMOS.HeatShimmerTiles },
        { id: 'circuit', source: DEMOS.NeonCircuitBoard },
        { id: 'glyphs', source: DEMOS.GlyphRain },
      ],
      sceneSequence: {
        scenes: [
          {
            clipId: 'heat',
            holdMs: 1000,
            transitionOut: {
              kind: 'portal',
              durationMs: 1000,
              centerX: 0.5,
              centerY: 0.5,
              feather: 0.12,
              featherPolicy: 'blend',
            },
          },
          {
            clipId: 'circuit',
            holdMs: 1000,
            transitionOut: { kind: 'wipe', durationMs: 1000, feather: 0.2 },
          },
          { clipId: 'glyphs', holdMs: 1000 },
        ],
      },
    }, {})
    const mapPoints = Array.from({ length: 256 }, (_, index) => ({
      sample: [(index % 16) / 15, Math.floor(index / 16) / 15],
    }))
    const shim = createShim({ pixelCount: 256, dimensions: 2, mapPoints, getVirtualTime: () => 0 })
    const handle = loadPattern(artifact.code, artifact.metadata, shim.builtins)

    handle.beforeRender(4500)
    let brightest = 0
    for (let index = 0; index < 256; index += 1) {
      const x = (index % 16) / 15
      const y = Math.floor(index / 16) / 15
      handle.render2D(index, x, y)
      brightest = Math.max(brightest, ...shim.capturedPixel())
    }

    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c2_built: 1 })
    expect(brightest).toBeGreaterThan(0)
  })

  it('passes Stage coordinates through to native 2D member renderers', () => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export function render2D(index, x, y) { rgb(x, y, 0) }' },
        { id: 'to', source: 'export function render2D(index, x, y) { rgb(0, x, y) }' },
      ],
      routeTransition: {
        kind: 'portal', startMs: 1000, durationMs: 1000,
        centerX: 0.5, centerY: 0.5, feather: 0, invert: false, featherPolicy: 'dither',
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, 0.5, 0.5)
    expect(pixel()).toEqual([0, 0.5, 0.5])
  })

  it('keeps legacy invert byte-identical to the equivalent explicit reveal mode (#448)', () => {
    const clips = [
      { id: 'from', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
      { id: 'to', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
    ]
    const legacy = compileShow({
      clips,
      routeTransition: {
        kind: 'portal', startMs: 1000, durationMs: 1000,
        centerX: 0.5, centerY: 0.5, shape: 'circle', invert: true, feather: 0.1, featherPolicy: 'dither',
      },
    }, {})
    const explicit = compileShow({
      clips,
      routeTransition: {
        kind: 'portal', startMs: 1000, durationMs: 1000,
        centerX: 0.5, centerY: 0.5, shape: 'circle', invert: true,
        revealMode: 'shrink-outgoing', feather: 0.1, featherPolicy: 'dither',
      },
    }, {})

    expect(explicit.code).toBe(legacy.code)
    expect(explicit.fxCode).toBe(legacy.fxCode)
  })

  it('routes a rotated Box SDF without moving member coordinates (#448)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export function render2D(index, x, y) { rgb(1, x, y) }' },
        { id: 'to', source: 'export function render2D(index, x, y) { rgb(0, x, y) }' },
      ],
      routeTransition: {
        kind: 'portal', startMs: 1000, durationMs: 1000,
        centerX: 0.5, centerY: 0.5, shape: 'box', aspect: 2, rotation: 0.125,
        revealMode: 'grow-incoming', feather: 0, edgePolicy: 'hard',
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1250)
    handle.render2D(0, 0.5, 0.5)
    expect(pixel()).toEqual([0, 0.5, 0.5])
    handle.render2D(1, 0, 0)
    expect(pixel()).toEqual([1, 0, 0])
    expect(artifact.code).toContain('max(abs(__pxlblz_show_portal_rx)')
    expect(artifact.summary).toMatchObject({
      transitionCost: 'route', routePolicy: 'portal-hard', worstInstantRenderersPerPixel: 1,
      cost: { cpu: { patternEvaluations: { formula: 'N', basePerPixel: 1 } } },
    })
  })

  it.each([
    ['ellipse', { shape: 'ellipse', aspect: 1.6, rotation: 0.125 }],
    ['rounded-box', { shape: 'rounded-box', aspect: 1.4, rotation: 0.125, cornerRadius: 0.35 }],
    ['cross', { shape: 'cross', aspect: 1.2, rotation: 0.125, crossWidth: 0.3 }],
    ['heart', { shape: 'heart', aspect: 1, rotation: 0 }],
    ['star', { shape: 'star', starPoints: 5, starInner: 0.45, rotation: 0.05 }],
    ['crescent', { shape: 'crescent', aspect: 1.1, crescentOffset: 0.45, rotation: 0.1 }],
    ['triangle', { shape: 'polygon', polygonSides: 3, rotation: 0.05 }],
    ['octagon', { shape: 'polygon', polygonSides: 8, rotation: 0.05 }],
    ['cat-head', { shape: 'cat-head', aspect: 1, rotation: 0 }],
    ['cat-side-profile', { shape: 'cat-side-profile', aspect: 1.6, rotation: 0 }],
    ['bastet', { shape: 'bastet', aspect: 0.65, rotation: 0 }],
  ] as const)('matches the pure %s SDF sign in generated output (#452)', (_name, settings) => {
    const x = 0.28
    const y = 0.47
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'to', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
      ],
      routeTransition: {
        kind: 'portal', startMs: 1000, durationMs: 1000,
        centerX: 0.5, centerY: 0.5, revealMode: 'grow-incoming',
        scale: 1, feather: 0, edgePolicy: 'hard', ...settings,
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1550)
    handle.render2D(0, x, y)
    const signed = showShapeRevealSignedDistance({
      x, y, centerX: 0.5, centerY: 0.5, progress: 0.55,
      revealMode: 'grow-incoming', scale: 1, ...settings,
    })
    expect(pixel()).toEqual(signed <= 0 ? [0, 1, 0] : [1, 0, 0])
    expect(artifact.summary.artifactBudgetRatio).toBeLessThan(1)
  })

  it('runs hard Cover through transformed incoming coordinates with one renderer per pixel (#449)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(1, x, y) }' },
        { id: 'to', source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(0, x, y) }' },
      ],
      routeTransition: {
        kind: 'motion', motionVariant: 'cover', startMs: 1000, durationMs: 1000,
        direction: 0, addressPolicy: 'clip', edgePolicy: 'hard',
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, 0.25, 0.5)
    expect(pixel()).toEqual([0, 0.75, 0.5])
    handle.render2D(1, 0.75, 0.5)
    expect(pixel()).toEqual([1, 0.75, 0.5])
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_calls: 1, __pxlblz_show_c1_calls: 1 })
    expect(artifact.summary).toMatchObject({
      renderPolicy: 'spatial-route-one-renderer-per-pixel',
      transitionCost: 'route', routePolicy: 'motion-selector', worstInstantRenderersPerPixel: 1,
      cost: { cpu: { patternEvaluations: { formula: 'N', basePerPixel: 1 } } },
    })
  })

  it('anchors Content Grow and reports full motion blending as 2N (#449)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(1, 0, 0) }' },
        { id: 'to', source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(0, x, y) }' },
      ],
      routeTransition: {
        kind: 'motion', motionVariant: 'content-grow', startMs: 1000, durationMs: 1000,
        anchorX: 0, anchorY: 0, contentScale: 0.25, addressPolicy: 'wrap', edgePolicy: 'blend',
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1000)
    handle.render2D(0, 0.125, 0.125)
    expect(pixel()).toEqual([1, 0, 0])
    handle.beforeRender(500)
    handle.render2D(1, 0.125, 0.125)
    expect(pixel()[0]).toBeCloseTo(0.5)
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_calls: 2, __pxlblz_show_c1_calls: 2 })
    expect(artifact.summary).toMatchObject({
      renderPolicy: 'steady-active-transition-both',
      transitionCost: 'renderer-window', routePolicy: 'motion-full-blend', worstInstantRenderersPerPixel: 2,
      cost: { cpu: {
        patternEvaluations: { formula: '2N', basePerPixel: 2 },
        effects: { addressPolicy: 'wrap', affineScalarOpsPerEvaluatedPixel: 8 },
      } },
    })
  })

  it('reuses motion coordinate semantics inside a scene sequence (#449)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export function render2D(index, x, y) { rgb(1, x, y) }' },
        { id: 'to', source: 'export function render2D(index, x, y) { rgb(0, x, y) }' },
      ],
      sceneSequence: {
        scenes: [
          {
            clipId: 'from', holdMs: 1000,
            transitionOut: {
              kind: 'motion', motionVariant: 'reveal', durationMs: 1000,
              direction: 0, addressPolicy: 'clip', edgePolicy: 'hard',
            },
          },
          { clipId: 'to', holdMs: 1000 },
        ],
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, 0.25, 0.5)
    expect(pixel()).toEqual([0, 0.25, 0.5])
    handle.render2D(1, 0.75, 0.5)
    expect(pixel()).toEqual([1, 0.25, 0.5])
    expect(artifact.summary).toMatchObject({
      routePolicy: 'motion-selector', renderPolicy: 'spatial-route-one-renderer-per-pixel',
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

  it('matches the pure Coherent Noise field in generated output (#451)', () => {
    const x = 0.37
    const y = 0.62
    const field = showCoherentDissolveField(x, y, 6, 17)
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'to', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
      ],
      routeTransition: {
        kind: 'dither', dissolveVariant: 'coherent-noise', startMs: 1000, durationMs: 1000,
        seed: 17, scale: 6, edgePolicy: 'hard',
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, x, y)
    expect(pixel()).toEqual(field < 0.5 ? [0, 1, 0] : [1, 0, 0])
    expect(artifact.summary).toMatchObject({
      renderPolicy: 'spatial-route-one-renderer-per-pixel', transitionCost: 'route',
      routePolicy: 'dissolve-hard', worstInstantRenderersPerPixel: 1,
      cost: { cpu: { patternEvaluations: { formula: 'N', basePerPixel: 1 } } },
    })
  })

  it('blends Soft Threshold only inside its active band and reports N + E (#451)', () => {
    const x = 0.37
    const y = 0.62
    const field = showCoherentDissolveField(x, y, 6, 17)
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(1, 0, 0) }' },
        { id: 'to', source: 'export var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(0, 1, 0) }' },
      ],
      routeTransition: {
        kind: 'dither', dissolveVariant: 'soft-threshold', startMs: 1000, durationMs: 1000,
        seed: 17, scale: 6, softness: 0.2, edgePolicy: 'blend',
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1000 + field * 1000)
    handle.render2D(0, x, y)
    expect(pixel()[0]).toBeCloseTo(0.5, 9)
    expect(pixel()[1]).toBeCloseTo(0.5, 9)
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_calls: 1, __pxlblz_show_c1_calls: 1 })
    expect(artifact.summary).toMatchObject({
      renderPolicy: 'spatial-route-bounded-feather', transitionCost: 'bounded-renderer-window',
      routePolicy: 'dissolve-blended-edge', worstInstantRenderersPerPixel: 2,
      cost: { cpu: { patternEvaluations: { formula: 'N + E', basePerPixel: 1, additionalPerEdgePixel: 1 } } },
    })
  })

  it('keeps legacy Dither byte-identical to explicit zero-seed Pixel Dissolve (#447)', () => {
    const clips = [
      { id: 'from', source: 'export function render(index) { rgb(1, 0, 0) }' },
      { id: 'to', source: 'export function render(index) { rgb(0, 1, 0) }' },
    ]
    const legacy = compileShow({
      clips, routeTransition: { kind: 'dither', startMs: 1000, durationMs: 1000 },
    }, {})
    const pixel = compileShow({
      clips,
      routeTransition: {
        kind: 'dither', startMs: 1000, durationMs: 1000,
        dissolveVariant: 'pixel', seed: 0, edgePolicy: 'dither',
      },
    }, {})

    expect(pixel.code).toBe(legacy.code)
    expect(pixel.fxCode).toBe(legacy.fxCode)
    expect(pixel.summary.cost.cpu.patternEvaluations).toEqual({ formula: 'N', basePerPixel: 1 })
  })

  it('hashes every member of a Block Dissolve cell to one stable source renderer (#447)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export var calls = 0\nexport function render(index) { calls = calls + 1; rgb(1, 0, 0) }' },
        { id: 'to', source: 'export var calls = 0\nexport function render(index) { calls = calls + 1; rgb(0, 1, 0) }' },
      ],
      routeTransition: {
        kind: 'dither', startMs: 1000, durationMs: 1000,
        dissolveVariant: 'block', seed: 17, blockSize: 8, edgePolicy: 'dither',
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 32)

    handle.beforeRender(1500)
    handle.render(8)
    const first = pixel()
    handle.render(15)
    expect(pixel()).toEqual(first)
    const exports = handle.getExports()
    expect(Number(exports.__pxlblz_show_c0_calls) + Number(exports.__pxlblz_show_c1_calls)).toBe(2)
    expect(artifact.code).toContain('__pxlblz_show_hash01(floor(index / 8) + 2227)')
    expect(artifact.summary).toMatchObject({
      transitionCost: 'route', worstInstantRenderersPerPixel: 1,
      cost: { cpu: { patternEvaluations: { formula: 'N', basePerPixel: 1 } } },
    })
  })
})
