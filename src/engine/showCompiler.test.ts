import { loadPattern, type PatternHandle } from './loadPattern'
import { compileShow, promoteShowRendererToInstalledMap3D } from './showCompiler'
import { createShim } from './shim'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import { remapShowIndex, remapShowSample } from './showCoordinateRemap'
import { showWipeMaskPosition, type ShowWipeSettings } from './showWipe'
import { showCoherentDissolveField } from './showDissolve'
import { showShapeRevealSignedDistance } from './showShapeReveal'
import { sampleShowMotionTransition } from './showMotionTransition'
import { routeShowLogicalPoint, type ShowLogicalRouting } from './showLogicalRouting'
import { createFastReplayRuntime, prepareFastReplay } from './fastReplay'
import type { MapPoint } from './maps/types'

interface LoadedShow {
  handle: PatternHandle
  pixel: () => [number, number, number]
}

function loadShow(code: string, metadata: ReturnType<typeof compileShow>['metadata'], pixelCount = 10): LoadedShow {
  let pixel: [number, number, number] = [0, 0, 0]
  const handle = loadPattern(code, metadata, {
    pixelCount,
    PI2: Math.PI * 2,
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
  it('isolates an inactive member coordinate transform from the active member', () => {
    const plainSource = 'export function render2D(index, x, y) { rgb(x, y, 0) }'
    const artifact = compileShow({
      clips: [
        { id: 'plain', source: plainSource },
        {
          id: 'translated',
          source: 'translate(-0.5, -0.5)\nexport function render2D(index, x, y) { rgb(x, y, 1) }',
        },
      ],
      routingLayouts: [{
        id: 'normalized',
        name: 'Normalized',
        zones: [],
        logical: { kind: 'single', zoneNames: ['main'] },
      }],
      routedSceneSequence: {
        scenes: [
          { holdMs: 1_000, placements: [{ zoneName: 'main', clipId: 'plain' }] },
          { holdMs: 1_000, placements: [{ zoneName: 'main', clipId: 'translated' }] },
        ],
      },
      loopDurationMs: 2_000,
    }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [
        { sample: [0, 0], pos: [0, 0] },
        { sample: [1, 0], pos: [1, 0] },
        { sample: [0, 1], pos: [0, 1] },
        { sample: [1, 1], pos: [1, 1] },
      ],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ])
  })

  it('isolates an inactive member coordinate transform referenced through an alias', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'plain',
          source: 'export function render2D(index, x, y) { rgb(x, y, 0) }',
        },
        {
          id: 'translated',
          source: `
var move = translate
move(-0.5, -0.5)
export function render2D(index, x, y) { rgb(x, y, 1) }
`,
        },
      ],
      routingLayouts: [{
        id: 'normalized',
        name: 'Normalized',
        zones: [],
        logical: { kind: 'single', zoneNames: ['main'] },
      }],
      routedSceneSequence: {
        scenes: [
          { holdMs: 1_000, placements: [{ zoneName: 'main', clipId: 'plain' }] },
          { holdMs: 1_000, placements: [{ zoneName: 'main', clipId: 'translated' }] },
        ],
      },
      loopDurationMs: 2_000,
    }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [
        { sample: [0, 0], pos: [0, 0] },
        { sample: [1, 0], pos: [1, 0] },
        { sample: [0, 1], pos: [0, 1] },
        { sample: [1, 1], pos: [1, 1] },
      ],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ])
  })

  it('preserves object keys for shorthand coordinate-builtin aliases', () => {
    const source = `
var helper = { translate }
helper.translate(0.5, 0)
export function render2D(index, x, y) { rgb(x, y, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'shorthand-alias', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0, 0], pos: [0, 0] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[0.5, 0, 0]])
    expect(artifact.expandedCode).toContain(
      '{ translate: __pxlblz_show_c0_translate }',
    )
  })

  it('keeps assignments to coordinate builtins on the isolated wrapper', () => {
    const source = `
var move = translate
translate = move
translate(0.5, 0)
export function render2D(index, x, y) { rgb(x, y, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'assigned-builtin', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0, 0], pos: [0, 0] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[0.5, 0, 0]])
    expect(artifact.expandedCode).toContain(
      '__pxlblz_show_c0_translate = __pxlblz_show_c0_move',
    )
  })

  it('keeps assignments to mapPixels on the isolated wrapper', () => {
    const source = `
var visitedX = 0
translate(0.5, 0)
function capture(index, x, y, z) { visitedX = x }
var visit = mapPixels
mapPixels = visit
visit(capture)
export function render2D(index, x, y) { rgb(visitedX, y, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'assigned-mapPixels', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0, 0], pos: [0, 0] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[0.5, 0, 0]])
  })

  it('isolates implicit-global aliases of member coordinate builtins', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'first',
          source: `
applyTransform = translate
visitMap = mapPixels
applyTransform(-0.5, -0.5)
function capture(index, x, y) {}
visitMap(capture)
export function render2D(index, x, y) { rgb(x, y, 0) }
`,
        },
        {
          id: 'second',
          source: `
applyTransform = translate
visitMap = mapPixels
applyTransform(0.25, 0.25)
function capture(index, x, y) {}
visitMap(capture)
export function render2D(index, x, y) { rgb(x, y, 0) }
`,
        },
      ],
      crossfade: { startMs: 1_000, durationMs: 1_000 },
    }, {})

    expect(artifact.expandedCode).toContain(
      '__pxlblz_show_implicit_c0_applyTransform = __pxlblz_show_c0_translate',
    )
    expect(artifact.expandedCode).toContain(
      '__pxlblz_show_implicit_c1_applyTransform = __pxlblz_show_c1_translate',
    )
    expect(artifact.expandedCode).toContain(
      '__pxlblz_show_implicit_c0_visitMap = __pxlblz_show_c0_mapPixels',
    )
    expect(artifact.expandedCode).toContain(
      '__pxlblz_show_implicit_c1_visitMap = __pxlblz_show_c1_mapPixels',
    )
  })

  it('keeps implicit globals distinct from compiler-owned member state', () => {
    const source = `
r = 0.25
export function render2D(index, x, y) {
  if (index) rgb(r, 0, 0)
}
`
    const artifact = compileShow({ clips: [{ id: 'implicit-red', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [
        { sample: [0, 0], pos: [0, 0] },
        { sample: [1, 0], pos: [1, 0] },
      ],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([
      [0, 0, 0],
      [0.25, 0, 0],
    ])
  })

  it('isolates a coordinate transform referenced by a default parameter', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'plain',
          source: 'export function render2D(index, x, y) { rgb(x, y, 0) }',
        },
        {
          id: 'translated',
          source: `
function applyTransform(fn = translate) {
  var translate = 0
  fn(-0.5, -0.5)
}
applyTransform()
export function render2D(index, x, y) { rgb(x, y, 1) }
`,
        },
      ],
      routingLayouts: [{
        id: 'normalized',
        name: 'Normalized',
        zones: [],
        logical: { kind: 'single', zoneNames: ['main'] },
      }],
      routedSceneSequence: {
        scenes: [
          { holdMs: 1_000, placements: [{ zoneName: 'main', clipId: 'plain' }] },
          { holdMs: 1_000, placements: [{ zoneName: 'main', clipId: 'translated' }] },
        ],
      },
      loopDurationMs: 2_000,
    }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [
        { sample: [0, 0], pos: [0, 0] },
        { sample: [1, 1], pos: [1, 1] },
      ],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([
      [0, 0, 0],
      [1, 1, 0],
    ])
  })

  it('preserves a named function expression self-binding', () => {
    const source = `
var recurse = function translate(remaining) {
  return remaining ? translate(remaining - 1) : 7
}
var value = recurse(2)
export function render2D(index, x, y) { rgb(value, x, y) }
`
    const artifact = compileShow({ clips: [{ id: 'recursive', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0.25, 0.75], pos: [0.25, 0.75] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[7, 0.25, 0.75]])
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_c0_ctm_')
  })

  it('renames top-level function declaration self-references', () => {
    const source = `
function sum(remaining) {
  return remaining ? sum(remaining - 1) + 1 : 0
}
var value = sum(3)
export function render2D(index, x, y) { rgb(value, x, y) }
`
    const artifact = compileShow({ clips: [{ id: 'recursive', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0.25, 0.75], pos: [0.25, 0.75] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[3, 0.25, 0.75]])
    expect(artifact.expandedCode).toContain(
      'return remaining ? __pxlblz_show_c0_sum(remaining - 1) + 1 : 0',
    )
  })

  it('preserves function-local helpers declared inside a block', () => {
    const source = `
function evaluate() {
  if (1) {
    function scale(value) { return value * 2 }
  }
  return scale(3)
}
var value = evaluate()
export function render2D(index, x, y) { rgb(value, x, y) }
`
    const artifact = compileShow({ clips: [{ id: 'block-helper', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0.25, 0.75], pos: [0.25, 0.75] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[6, 0.25, 0.75]])
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_c0_ctm_')
  })

  it('renames program helpers declared inside a block', () => {
    const source = `
if (1) {
  function scale(value) { return value * 2 }
}
var value = scale(3)
export function render2D(index, x, y) { rgb(value, x, y) }
`
    const artifact = compileShow({ clips: [{ id: 'program-block-helper', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0.25, 0.75], pos: [0.25, 0.75] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[6, 0.25, 0.75]])
    expect(artifact.expandedCode).toContain(
      'function __pxlblz_show_c0_scale(value) { return value * 2 }',
    )
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_c0_ctm_')
  })

  it('renames top-level destructuring bindings', () => {
    const source = `
var [value] = [7]
var sourceValue = { bonus: 2 }
var { bonus } = sourceValue
export function render2D(index, x, y) { rgb(value + bonus, x, y) }
`
    const artifact = compileShow({ clips: [{ id: 'destructured', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0.25, 0.75], pos: [0.25, 0.75] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[9, 0.25, 0.75]])
    expect(artifact.expandedCode).toContain('var [__pxlblz_show_c0_value] = [7]')
    expect(artifact.expandedCode).toContain('var { bonus: __pxlblz_show_c0_bonus }')
  })

  it('preserves keys in shorthand destructuring assignments with defaults', () => {
    const source = `
var value = 0
var sourceValue = { value: 3 }
;({ value = 7 } = sourceValue)
export function render2D(index, x, y) { rgb(value, x, y) }
`
    const artifact = compileShow({ clips: [{ id: 'destructured-default', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0.25, 0.75], pos: [0.25, 0.75] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[3, 0.25, 0.75]])
    expect(artifact.expandedCode).toContain(
      '({ value: __pxlblz_show_c0_value = 7 } = __pxlblz_show_c0_sourceValue)',
    )
  })

  it('respects switch-scoped shadows of coordinate-transform builtins', () => {
    const source = `
function evaluate(value) {
  switch (value) {
    case 1:
      let translate = 7
      return translate
    default:
      return 0
  }
}
var value = evaluate(1)
export function render2D(index, x, y) { rgb(value, x, y) }
`
    const artifact = compileShow({ clips: [{ id: 'switch-shadow', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0.25, 0.75], pos: [0.25, 0.75] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[7, 0.25, 0.75]])
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_c0_ctm_')
  })

  it('preserves a member dynamic 2D coordinate transform', () => {
    const source = `
export function beforeRender(delta) {
  resetTransform()
  translate(-0.5, -0.5)
  rotate(PI / 3)
  scale(1.25, 0.75)
  translate(0.5, 0.5)
}
export function render2D(index, x, y) { rgb(x, y, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'transformed', source }] }, {})
    const mapPoints: MapPoint[] = [
      { sample: [0, 0], pos: [0, 0] },
      { sample: [1, 0], pos: [1, 0] },
      { sample: [0, 1], pos: [0, 1] },
      { sample: [1, 1], pos: [1, 1] },
    ]
    const standalone = createFastReplayRuntime(prepareFastReplay(source, {}), {
      mapPoints,
      randomSeed: 1,
    }).advanceLive(16).pixels
    const show = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints,
      randomSeed: 1,
    }).advanceLive(16).pixels

    for (let index = 0; index < standalone.length; index++) {
      expect(show[index][0]).toBeCloseTo(standalone[index][0])
      expect(show[index][1]).toBeCloseTo(standalone[index][1])
      expect(show[index][2]).toBeCloseTo(standalone[index][2])
    }

    const standalonePrecise = createFastReplayRuntime(prepareFastReplay(source, {}), {
      mapPoints,
      randomSeed: 1,
      fidelity: 'fidelity',
    }).advanceLive(16).pixels
    const showPrecise = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints,
      randomSeed: 1,
      fidelity: 'fidelity',
    }).advanceLive(16).pixels

    for (let index = 0; index < standalonePrecise.length; index++) {
      expect(showPrecise[index][0]).toBeCloseTo(standalonePrecise[index][0], 3)
      expect(showPrecise[index][1]).toBeCloseTo(standalonePrecise[index][1], 3)
      expect(showPrecise[index][2]).toBeCloseTo(standalonePrecise[index][2], 3)
    }
  })

  it('keeps animated Precise coordinate transforms close to the float-backed builtin', () => {
    const source = `
export function beforeRender(delta) { rotate(0.01) }
export function render2D(index, x, y) { rgb(x, y, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'rotating', source }] }, {})
    const mapPoints: MapPoint[] = [{ sample: [1, 0], pos: [1, 0] }]
    const standalone = createFastReplayRuntime(prepareFastReplay(source, {}), {
      mapPoints,
      randomSeed: 1,
      fidelity: 'fidelity',
    })
    const show = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints,
      randomSeed: 1,
      fidelity: 'fidelity',
    })

    for (let frame = 0; frame < 1_000; frame++) {
      standalone.advanceLive(16)
      show.advanceLive(16)
    }

    const standalonePixel = standalone.renderCurrentFrame().pixels[0]
    const showPixel = show.renderCurrentFrame().pixels[0]
    expect(Math.abs(showPixel[0] - standalonePixel[0])).toBeLessThan(0.01)
    expect(Math.abs(showPixel[1] - standalonePixel[1])).toBeLessThan(0.01)
  })

  it('quantizes each coordinate-transform composition in Precise replay', () => {
    const source = `
scale(0.1, 0.1)
scale(0.1, 0.1)
scale(0.1, 0.1)
export function render2D(index, x, y) { rgb(x, y, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'quantized-scale', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [1, 1], pos: [1, 1] }],
      randomSeed: 1,
      fidelity: 'fidelity',
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([
      [65 / 65_536, 65 / 65_536, 0],
    ])
  })

  it('preserves a member 3D coordinate transform for a 2D renderer', () => {
    const source = `
export function beforeRender(delta) {
  resetTransform()
  translate3D(0.1, -0.2, 0.3)
  rotateX(PI / 5)
  rotateY(-PI / 7)
  scale3D(1.1, 0.8, 1.2)
  transform(
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0.05, 0.1, -0.2, 1
  )
}
export function render2D(index, x, y) { rgb(x, y, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'transformed', source }] }, {})
    expect(artifact.metadata.renderFns).toMatchObject({
      hasRender2D: true,
      hasRender3D: true,
    })
    const mapPoints: MapPoint[] = [
      { sample: [0, 0], pos: [0, 0] },
      { sample: [1, 0], pos: [1, 0] },
      { sample: [0, 1], pos: [0, 1] },
      { sample: [1, 1], pos: [1, 1] },
    ]
    const standalone = createFastReplayRuntime(prepareFastReplay(source, {}), {
      mapPoints,
      randomSeed: 1,
    }).advanceLive(16).pixels
    const show = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints,
      randomSeed: 1,
    }).advanceLive(16).pixels

    for (let index = 0; index < standalone.length; index++) {
      expect(show[index][0]).toBeCloseTo(standalone[index][0])
      expect(show[index][1]).toBeCloseTo(standalone[index][1])
      expect(show[index][2]).toBeCloseTo(standalone[index][2])
    }

    const standalonePrecise = createFastReplayRuntime(prepareFastReplay(source, {}), {
      mapPoints,
      randomSeed: 1,
      fidelity: 'fidelity',
    }).advanceLive(16).pixels
    const showPrecise = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints,
      randomSeed: 1,
      fidelity: 'fidelity',
    }).advanceLive(16).pixels

    for (let index = 0; index < standalonePrecise.length; index++) {
      expect(showPrecise[index][0]).toBeCloseTo(standalonePrecise[index][0], 3)
      expect(showPrecise[index][1]).toBeCloseTo(standalonePrecise[index][1], 3)
      expect(showPrecise[index][2]).toBeCloseTo(standalonePrecise[index][2], 3)
    }
  })

  it('preserves installed-map z through a private 3D transform before render2D', () => {
    const source = `
rotateY(PI / 2)
export function render2D(index, x, y) { rgb(x, y, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'depth-aware', source }] }, {})
    expect(artifact.metadata.renderFns).toMatchObject({
      hasRender2D: true,
      hasRender3D: true,
    })
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 3,
    }, {
      mapPoints: [{ sample: [0, 0, 1], pos: [0, 0, 1] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[1, 0, 0]])
  })

  it('promotes the generated renderer when authored comments mimic its signature', () => {
    const source = `
rotateY(PI / 2)
// export function render2D(index, x, y) {
/*
export function render2D(index, x, y) {
*/
export function render2D(index, x, y) { rgb(x, y, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'commented-depth-aware', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 3,
    }, {
      mapPoints: [{ sample: [0, 0, 1], pos: [0, 0, 1] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[1, 0, 0]])
  })

  it('targets the final outer renderer declaration during installed-map promotion', () => {
    const signature = 'export function render2D(index, x, y) {'
    const source = `// ${signature}
/*
${signature}
*/
${signature}
  rgb(x, y, 0)
}`

    const promoted = promoteShowRendererToInstalledMap3D(source)

    expect(promoted).toContain(`// ${signature}`)
    expect(promoted).toContain(`/*
${signature}
*/`)
    expect(promoted).toContain('function __pxlblz_show_render_installed_map(index, x, y) {')
  })

  it('preserves the fourth matrix row when composing arbitrary transforms', () => {
    const source = `
transform(
  1, 0, 0, 1,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
)
translate(1, 0)
export function render2D(index, x, y) { rgb(x, y, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'projective', source }] }, {})
    const mapPoints: MapPoint[] = [
      { sample: [0, 0], pos: [0, 0] },
      { sample: [1, 0], pos: [1, 0] },
    ]
    const standalone = createFastReplayRuntime(prepareFastReplay(source, {}), {
      mapPoints,
      randomSeed: 1,
    }).renderCurrentFrame().pixels
    const show = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints,
      randomSeed: 1,
    }).renderCurrentFrame().pixels

    expect(show).toEqual(standalone)
  })

  it('respects block-scoped shadows of coordinate-transform builtins', () => {
    const source = `
var value = 0
{
  let translate = 1
  value = translate
}
export function render2D(index, x, y) { rgb(value, x, y) }
`
    const artifact = compileShow({ clips: [{ id: 'shadowed', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0.25, 0.75], pos: [0.25, 0.75] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[1, 0.25, 0.75]])
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_c0_ctm_')
  })

  it('preserves block-local shadows of renamed program bindings', () => {
    const source = `
var value = 1
export function render2D(index, x, y) {
  let value = 2
  rgb(value, x, y)
}
`
    const artifact = compileShow({ clips: [{ id: 'program-shadow', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0.25, 0.75], pos: [0.25, 0.75] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[2, 0.25, 0.75]])
  })

  it('respects program-scoped var shadows declared inside statements', () => {
    const source = `
if (1) {
  var translate = 7
}
export function render2D(index, x, y) { rgb(translate, x, y) }
`
    const artifact = compileShow({ clips: [{ id: 'hoisted-shadow', source }] }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [0.25, 0.75], pos: [0.25, 0.75] }],
      randomSeed: 1,
    })

    expect(runtime.renderCurrentFrame().pixels).toEqual([[7, 0.25, 0.75]])
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_c0_ctm_')
  })

  it('keeps generated transform state separate from authored bindings', () => {
    const source = `
var ctm_a = 0.25
translate(0.5, 0)
export function render2D(index, x, y) { rgb(ctm_a, x, y) }
`
    const artifact = compileShow({ clips: [{ id: 'collision', source }] }, {})
    const mapPoints: MapPoint[] = [
      { sample: [0, 0], pos: [0, 0] },
      { sample: [1, 1], pos: [1, 1] },
    ]
    const standalone = createFastReplayRuntime(prepareFastReplay(source, {}), {
      mapPoints,
      randomSeed: 1,
    }).renderCurrentFrame().pixels
    const show = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints,
      randomSeed: 1,
    }).renderCurrentFrame().pixels

    expect(show).toEqual(standalone)
  })

  it('applies a member coordinate transform to mapPixels callbacks', () => {
    const source = `
var cornerX = 0
var cornerY = 0
translate(-0.5, -0.25)
function captureMap(index, x, y, z) {
  if (index == pixelCount - 1) {
    cornerX = x
    cornerY = y
  }
}
var visitMap = mapPixels
visitMap(captureMap)
export function render2D(index, x, y) { rgb(cornerX, cornerY, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'mapped', source }] }, {})
    const mapPoints: MapPoint[] = [
      { sample: [0, 0], pos: [0, 0] },
      { sample: [1, 0], pos: [1, 0] },
      { sample: [0, 1], pos: [0, 1] },
      { sample: [1, 1], pos: [1, 1] },
    ]
    const standalone = createFastReplayRuntime(prepareFastReplay(source, {}), {
      mapPoints,
      randomSeed: 1,
    }).renderCurrentFrame().pixels
    const show = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints,
      randomSeed: 1,
    }).renderCurrentFrame().pixels

    expect(show).toEqual(standalone)

    const standalonePrecise = createFastReplayRuntime(prepareFastReplay(source, {}), {
      mapPoints,
      randomSeed: 1,
      fidelity: 'fidelity',
    }).renderCurrentFrame().pixels
    const showPrecise = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints,
      randomSeed: 1,
      fidelity: 'fidelity',
    }).renderCurrentFrame().pixels

    expect(showPrecise).toEqual(standalonePrecise)
  })

  it('preserves the active callback across nested mapPixels traversals', () => {
    const source = `
var outerCount = 0
var nestedCount = 0
var nested = 0
translate(-0.5, -0.25)
function captureNested(index, x, y, z) { nestedCount = nestedCount + 1 }
function captureOuter(index, x, y, z) {
  outerCount = outerCount + 1
  if (!nested) {
    nested = 1
    mapPixels(captureNested)
  }
}
mapPixels(captureOuter)
export function render2D(index, x, y) { rgb(outerCount, nestedCount, 0) }
`
    const artifact = compileShow({ clips: [{ id: 'nested-map', source }] }, {})
    const mapPoints: MapPoint[] = [
      { sample: [0, 0], pos: [0, 0] },
      { sample: [1, 1], pos: [1, 1] },
    ]
    const standalone = createFastReplayRuntime(prepareFastReplay(source, {}), {
      mapPoints,
      randomSeed: 1,
    }).renderCurrentFrame().pixels
    const show = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints,
      randomSeed: 1,
    }).renderCurrentFrame().pixels

    expect(show).toEqual(standalone)
  })

  it('emits coordinate-transform runtime only for members that call its builtins', () => {
    const plain = compileShow({
      clips: [{ id: 'plain', source: 'export function render2D(index, x, y) { rgb(x, y, 0) }' }],
    }, {})
    const locallyNamed = compileShow({
      clips: [{
        id: 'local',
        source: `
function scale(value) { return value * 2 }
export function render2D(index, x, y) { rgb(scale(x), y, 0) }
`,
      }],
    }, {})
    const scaled = compileShow({
      clips: [{
        id: 'scaled',
        source: `
scale(2, 3)
export function render2D(index, x, y) { rgb(x, y, 0) }
`,
      }],
    }, {})
    const locallyMapped = compileShow({
      clips: [{
        id: 'local-map',
        source: `
translate(0.25, 0.25)
function mapPixels(callback) { callback(0, 0.5, 0.5, 0) }
function capture(index, x, y, z) {}
mapPixels(capture)
export function render2D(index, x, y) { rgb(x, y, 0) }
`,
      }],
    }, {})
    const mapped = compileShow({
      clips: [{
        id: 'mapped',
        source: `
translate(0.25, 0.25)
function capture(index, x, y, z) {}
mapPixels(capture)
export function render2D(index, x, y) { rgb(x, y, 0) }
`,
      }],
    }, {})

    expect(plain.expandedCode).not.toContain('__pxlblz_show_c0_ctm_')
    expect(locallyNamed.expandedCode).not.toContain('__pxlblz_show_c0_ctm_')
    expect(scaled.expandedCode).toContain('function __pxlblz_show_c0_scale(')
    expect(scaled.expandedCode).not.toContain('function __pxlblz_show_c0_translate(')
    expect(scaled.expandedCode).not.toContain('function __pxlblz_show_c0_rotate(')
    expect(locallyMapped.expandedCode).not.toContain('__pxlblz_show_c0_ctm_map_callback')
    expect(scaled.summary.cost.memory.generatedScalarGlobals).toBe(12)
    expect(mapped.summary.cost.memory.generatedScalarGlobals).toBe(13)
  })

  it('lowers the canonical Clip Transform through the affine kernel and compiles neutral state away (#529)', () => {
    const clip = {
      id: 'placed',
      source: 'export function render2D(index, x, y) { rgb(x, y, 0) }',
    }
    const baseline = compileShow({ clips: [clip] }, {})
    const neutral = compileShow({
      clips: [{ ...clip, transform: { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 } }],
    }, {})
    const moved = compileShow({
      clips: [{ ...clip, transform: { positionX: 0.25, positionY: 0.25, rotation: 0, scaleX: 1, scaleY: 1 } }],
    }, {})
    const { handle, pixel } = loadShow(moved.code, moved.metadata, 4)

    handle.beforeRender(16)
    handle.render2D(3, 1, 1)

    expect(pixel()[0]).toBeCloseTo(0.75)
    expect(pixel()[1]).toBeCloseTo(0.75)
    expect(neutral.code).toBe(baseline.code)
    expect(moved.expandedCode).toContain('__pxlblz_show_c0_fx_a =')
  })

  it('reconciles exact named source chunks to the delivered generated source (#545)', () => {
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: `
// UTF-8 makes byte accounting stricter than string length: cyan ◆
export var ticks = 0
export function beforeRender(delta) { ticks = ticks + 1 }
export function render(index) { rgb(ticks, 0, 0) }
`,
      }],
    }, {})
    const inventory = artifact.summary.sourceInventory

    expect(inventory.totalBytes).toBe(artifact.summary.artifactBytes)
    expect(inventory.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)).toBe(inventory.totalBytes)
    expect(inventory.chunks[0]?.startByte).toBe(0)
    expect(inventory.chunks[inventory.chunks.length - 1]?.endByte).toBe(inventory.totalBytes)
    expect(inventory.chunks.every((chunk, index) => (
      index === 0 || chunk.startByte === inventory.chunks[index - 1].endByte
    ))).toBe(true)
    expect(inventory.chunks.some((chunk) => chunk.category === 'pattern' && chunk.ownerId === 'shared')).toBe(true)
    expect(inventory.chunks.some((chunk) => chunk.category === 'runtime-scheduler')).toBe(true)
    expect(inventory.chunks.some((chunk) => chunk.category === 'exports')).toBe(true)
  })

  it('compacts compiler-owned symbols under the PXLBLZ namespace (#499)', () => {
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: `
export var ticks = 0
export function beforeRender(delta) { ticks = ticks + 1 }
export function render(index) { rgb(ticks, 0, 0) }
`,
      }],
    }, {})
    const expandedCode = (artifact as typeof artifact & { expandedCode?: string }).expandedCode
    const { handle } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(16)

    expect(expandedCode).toContain('__pxlblz_show_c0_ticks')
    expect(artifact.code).not.toContain('__pxlblz_show_')
    expect(artifact.code).toContain('export function beforeRender(delta)')
    expect(artifact.code).toContain('export function render(index)')
    expect([...artifact.code.matchAll(/\b__pxlblz_[A-Za-z0-9_]+\b/g)].every((match) => (
      /^__pxlblz_[A-Za-z]+$/.test(match[0])
    ))).toBe(true)
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_ticks: 1 })
    expect(new TextEncoder().encode(artifact.code).length).toBeLessThan(new TextEncoder().encode(expandedCode!).length)
  })

  it('emits only the active output dimension for Pattern capture adapters (#499)', () => {
    const oneDimensionalClip = {
      id: 'shared',
      source: 'export function render(index) { rgb(1, 0, 0) }',
    }
    const twoDimensionalClip = {
      id: 'shared',
      source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }',
    }
    const oneDimensional = compileShow({ clips: [oneDimensionalClip] }, {})
    const twoDimensional = compileShow({ clips: [twoDimensionalClip] }, {})

    expect(oneDimensional.expandedCode).toContain('function __pxlblz_show_c0_renderCapture(index)')
    expect(oneDimensional.expandedCode).not.toContain('function __pxlblz_show_c0_renderCapture2D(index, x, y)')
    expect(oneDimensional.expandedCode).not.toContain('function __pxlblz_show_c0_applyOutputEffects')
    expect(twoDimensional.expandedCode).toContain('function __pxlblz_show_c0_renderCapture2D(index, x, y)')
    expect(twoDimensional.expandedCode).not.toContain('function __pxlblz_show_c0_renderCapture(index)')
    expect(twoDimensional.expandedCode).not.toContain('function __pxlblz_show_c0_applyOutputEffects')
  })

  it('emits adaptation mixing helpers only for adaptation-ramp Shows (#499)', () => {
    const clip = {
      id: 'shared',
      source: 'export function render(index) { rgb(1, 0, 0) }',
    }
    const direct = compileShow({ clips: [clip] }, {})
    const ramped = compileShow({
      clips: [clip],
      adaptationRamp: {
        startMs: 0,
        durationMs: 1000,
        from: { brightness: 1 },
        to: { brightness: 0.5 },
      },
    }, {})

    expect(direct.expandedCode).not.toContain('function __pxlblz_show_c0_setAdaptation')
    expect(direct.expandedCode).not.toContain('function __pxlblz_show_c0_mixAdaptation')
    expect(ramped.expandedCode).toContain('function __pxlblz_show_c0_setAdaptation')
    expect(ramped.expandedCode).toContain('function __pxlblz_show_c0_mixAdaptation')
  })

  it('emits HSV and time shims only when a Pattern uses them (#499)', () => {
    const rgbOnly = compileShow({
      clips: [{ id: 'rgb', source: 'export function render(index) { rgb(1, 0, 0) }' }],
    }, {})
    const hsvAndTime = compileShow({
      clips: [{ id: 'hsv', source: 'export function render(index) { hsv(time(1), 1, 1) }' }],
    }, {})
    const { handle, pixel } = loadShow(hsvAndTime.code, hsvAndTime.metadata)

    handle.beforeRender(0)
    handle.render(0)

    expect(rgbOnly.expandedCode).not.toContain('function __pxlblz_show_c0_hsv')
    expect(rgbOnly.expandedCode).not.toContain('function __pxlblz_show_c0_time')
    expect(rgbOnly.expandedCode).not.toContain('function __pxlblz_show_capture_hsv')
    expect(hsvAndTime.expandedCode).toContain('function __pxlblz_show_c0_hsv')
    expect(hsvAndTime.expandedCode).toContain('function __pxlblz_show_c0_time')
    // #559: the single HSV member gets a per-member conversion; the shared
    // dispatch chain exists only past the specialization threshold.
    expect(hsvAndTime.expandedCode).not.toContain('function __pxlblz_show_capture_hsv')
    expect(pixel()).toEqual([1, 0, 0])
  })

  it('does not emit unused Scene stack wrappers for cut-only routed Shows (#499)', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }] },
      { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }] },
    ]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export function render2D(index, x, y) { rgb(1, 0.5, 0.25) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [
              {
                placementId: 'left-a',
                zoneName: 'left',
                clipId: 'shared',
                opacity: 0.5,
              },
              {
                placementId: 'right-a',
                zoneName: 'right',
                clipId: 'shared',
                opacity: 0.25,
              },
            ],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: [
              { placementId: 'left-b', zoneName: 'left', clipId: 'shared' },
              { placementId: 'right-b', zoneName: 'right', clipId: 'shared' },
            ],
          },
        ],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 1)

    handle.beforeRender(500)
    handle.render2D(0, 0.25, 0.75)
    expect(pixel()).toEqual([0.5, 0.25, 0.125])
    handle.render2D(2, 0.25, 0.75)
    expect(pixel()).toEqual([0.25, 0.125, 0.0625])
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_stack_s')
    expect(artifact.expandedCode).not.toContain('function __pxlblz_show_hash01')
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_transition')
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_mix')
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_phase')
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_route_layout')
    expect(artifact.expandedCode.match(/__pxlblz_show_c0_advance\(delta\)/g)).toHaveLength(2)
    expect(artifact.expandedCode).toContain('__pxlblz_show_scene = floor(__pxlblz_show_elapsed_s / 1)')
    expect(artifact.expandedCode.match(/if \(index >= 0 && index <= 1\)/g)).toHaveLength(1)
    expect(artifact.expandedCode.match(/if \(index >= 2 && index <= 3\)/g)).toHaveLength(1)
  })

  it('emits only the active output dimension for routed Scene stack wrappers (#499)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
        { id: 'green', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [
              { zoneName: 'main', clipId: 'red', stackOrder: 0 },
              { zoneName: 'main', clipId: 'blue', stackOrder: 1, opacity: 0.5 },
            ],
            transitionOut: { kind: 'crossfade', durationMs: 1000 },
          },
          {
            holdMs: 1000,
            placements: [{ zoneName: 'main', clipId: 'green' }],
          },
        ],
      },
      loopDurationMs: 3000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(1500)
    handle.render2D(0, 0.25, 0.75)
    expect(pixel()).toEqual([0.25, 0.5, 0.25])
    expect(artifact.expandedCode).toContain('function __pxlblz_show_stack_s0_main_renderCapture2D(index, x, y)')
    expect(artifact.expandedCode).not.toContain('function __pxlblz_show_stack_s0_main_renderCapture(index)')
  })

  it('routes a single opaque placement without source-over stack machinery (#499)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export function render2D(index, x, y) { rgb(1, 0.5, 0.25) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [{
              placementId: 'main-a',
              zoneName: 'main',
              clipId: 'shared',
              brightness: 0.5,
            }],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: [{ placementId: 'main-b', zoneName: 'main', clipId: 'shared' }],
          },
        ],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render2D(0, 0.25, 0.75)
    expect(pixel()).toEqual([0.5, 0.25, 0.125])
    expect(artifact.expandedCode).not.toContain('var __pxlblz_show_stack_0_r')
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_c0_r * (1)')
  })

  it('clips one placement to its normalized Viewport and reveals the lower Layer (#585)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 1000,
          placements: [
            { zoneName: 'main', clipId: 'red', stackOrder: 0 },
            {
              placementId: 'blue-placement',
              zoneName: 'main',
              clipId: 'blue',
              stackOrder: 1,
              viewport: { enabled: true, x: 0, y: 0, width: 0.5, height: 1, edge: 'hard' },
            },
          ],
          transitionOut: { kind: 'cut', durationMs: 0 },
        }, {
          holdMs: 1000,
          placements: [{ zoneName: 'main', clipId: 'red' }],
        }],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(100)
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render2D(1, 1, 0)
    expect(pixel()).toEqual([1, 0, 0])
  })

  it.each([
    { kind: 'single' as const, insideX: 0.1, outsideX: 0.75 },
    { kind: 'split' as const, insideX: 0.1, outsideX: 0.2 },
    { kind: 'soft-split' as const, insideX: 0.1, outsideX: 0.3 },
  ])('clips Viewports during ordinary $kind logical-routing holds (#592)', ({ kind, insideX, outsideX }) => {
    const zoneNames = kind === 'single' ? ['main'] : ['left', 'right']
    const logical = kind === 'single'
      ? { kind, zoneNames: [zoneNames[0]] as [string] }
      : kind === 'split'
        ? { kind, zoneNames: [zoneNames[0], zoneNames[1]] as [string, string], axis: 'x' as const }
        : { kind, zoneNames: [zoneNames[0], zoneNames[1]] as [string, string], axis: 'x' as const, feather: 0.2 }
    const placements = zoneNames.flatMap((zoneName) => [
      { placementId: `${zoneName}-red`, zoneName, clipId: 'red', stackOrder: 0 },
      {
        placementId: `${zoneName}-blue`,
        zoneName,
        clipId: 'blue',
        stackOrder: 1,
        viewport: { enabled: true as const, x: 0, y: 0, width: 0.25, height: 1, edge: 'hard' as const },
      },
    ])
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      ],
      routingLayouts: [{
        id: kind,
        name: kind,
        zones: [],
        logical,
      }],
      routedSceneSequence: {
        scenes: [
          { holdMs: 1_000, placements, transitionOut: { kind: 'cut', durationMs: 0 } },
          { holdMs: 1_000, placements },
        ],
      },
      ...(kind === 'single'
        ? {}
        : { routingPropertyRamps: { splitPosition: { initial: 0.5, ramps: [] } } }),
      loopDurationMs: 2_000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(100)
    handle.render2D(0, insideX, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render2D(1, outsideX, 0.5)
    expect(pixel()).toEqual([1, 0, 0])
  })

  it('preserves a flat Clip Viewport through a routed Scene crossfade (#585)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const viewport = { enabled: true as const, x: 0, y: 0, width: 0.5, height: 1, edge: 'hard' as const }
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1_000,
            placements: [{ zoneName: 'main', clipId: 'red', viewport }],
            transitionOut: { kind: 'crossfade', durationMs: 1_000, crossfadePolicy: 'live-live' },
          },
          { holdMs: 1_000, placements: [{ zoneName: 'main', clipId: 'blue', viewport }] },
        ],
      },
      loopDurationMs: 3_000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(1_500)
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([0.5, 0, 0.5])
    handle.render2D(1, 1, 0)
    expect(pixel()).toEqual([0, 0, 0])
  })

  it('freezes one placement while another placement of the same Pattern instance stays Live (#586)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export var clock = 0\nexport function beforeRender(delta) { clock = clock + delta / 1000 }\nexport function render2D(index, x, y) { rgb(clock, 0, 0) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 2_000,
          placements: [{
            placementId: 'frozen-left',
            zoneName: 'main',
            clipId: 'shared',
            stackOrder: 0,
            presentation: { mode: 'freeze' },
            viewport: { enabled: true, x: 0, y: 0, width: 0.5, height: 1, edge: 'hard' },
          }, {
            placementId: 'live-right',
            zoneName: 'main',
            clipId: 'shared',
            stackOrder: 1,
            viewport: { enabled: true, x: 0.5, y: 0, width: 0.5, height: 1, edge: 'hard' },
          }],
          transitionOut: { kind: 'cut', durationMs: 0 },
        }, {
          holdMs: 2_000,
          placements: [{ zoneName: 'main', clipId: 'shared' }],
        }],
      },
      loopDurationMs: 4_000,
    }, {})
    expect(artifact.summary.specializations.freezeAtEntry.selectedSceneCount).toBe(1)
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)
    const renderFrame = () => [
      [0, 0], [1, 0], [0, 1], [1, 1],
    ].map(([x, y], index) => {
      handle.render2D(index, x, y)
      return pixel()[0]
    })

    handle.beforeRender(100)
    expect(renderFrame()).toEqual([0.1, 0.1, 0.1, 0.1])

    handle.beforeRender(100)
    expect(renderFrame()).toEqual([0.1, 0.2, 0.1, 0.2])
  })

  it('Strobe periodically captures a placement while the shared Pattern instance keeps advancing (#586)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export var clock = 0\nexport function beforeRender(delta) { clock = clock + delta / 1000 }\nexport function render2D(index, x, y) { rgb(clock, 0, 0) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 2_000,
          placements: [{
            placementId: 'strobed-left',
            zoneName: 'main',
            clipId: 'shared',
            stackOrder: 0,
            presentation: { mode: 'strobe', cadenceMs: 150 },
            viewport: { enabled: true, x: 0, y: 0, width: 0.5, height: 1, edge: 'hard' },
          }, {
            placementId: 'live-right',
            zoneName: 'main',
            clipId: 'shared',
            stackOrder: 1,
            viewport: { enabled: true, x: 0.5, y: 0, width: 0.5, height: 1, edge: 'hard' },
          }],
          transitionOut: { kind: 'cut', durationMs: 0 },
        }, { holdMs: 2_000, placements: [{ zoneName: 'main', clipId: 'shared' }] }],
      },
      loopDurationMs: 4_000,
    }, {})
    expect(artifact.summary.specializations.refresh.selectedSceneCount).toBe(1)
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)
    const renderFrame = () => [
      [0, 0], [1, 0], [0, 1], [1, 1],
    ].map(([x, y], index) => {
      handle.render2D(index, x, y)
      return pixel()[0]
    })

    handle.beforeRender(100)
    expect(renderFrame()).toEqual([0.1, 0.1, 0.1, 0.1])
    handle.beforeRender(25)
    expect(renderFrame()).toEqual([0.1, 0.125, 0.1, 0.125])
    handle.beforeRender(50)
    expect(renderFrame()).toEqual([0.175, 0.175, 0.175, 0.175])
  })

  it('Blink gates one placement without pausing its Pattern instance (#586)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{ id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 1_000,
          placements: [{
            placementId: 'blinking',
            zoneName: 'main',
            clipId: 'red',
            blink: { rateHz: 1, duty: 0.5, phase: 0 },
          }],
          transitionOut: { kind: 'cut', durationMs: 0 },
        }, { holdMs: 1_000, placements: [{ zoneName: 'main', clipId: 'red' }] }],
      },
      loopDurationMs: 2_000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(250)
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([1, 0, 0])
    handle.beforeRender(500)
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([0, 0, 0])
  })

  it('starts a new Pattern instance at local zero and advances a shared instance through hidden gaps (#586)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 0 }] }]
    const source = `
export var elapsed = 0
export var renders = 0
export function beforeRender(delta) { elapsed = elapsed + delta }
export function render(index) { renders = renders + 1; rgb(elapsed, renders, 0) }
`
    const artifact = compileShow({
      clips: [
        { id: 'shared', source },
        { id: 'gap', source: 'export function render(index) { rgb(0, 0, 0) }' },
        { id: 'late', source },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          { holdMs: 100, placements: [{ zoneName: 'main', clipId: 'shared' }], transitionOut: { kind: 'cut', durationMs: 0 } },
          { holdMs: 100, placements: [{ zoneName: 'main', clipId: 'gap' }], transitionOut: { kind: 'cut', durationMs: 0 } },
          { holdMs: 100, placements: [{ zoneName: 'main', clipId: 'shared' }, { zoneName: 'main', clipId: 'late', stackOrder: 1 }] },
        ],
      },
      loopDurationMs: 300,
      deterministicLoopReset: true,
    }, {}, { patternSlotSharing: 'none' })
    const { handle } = loadShow(artifact.code, artifact.metadata, 1)

    handle.beforeRender(50)
    handle.render(0)
    handle.beforeRender(100)
    handle.beforeRender(100)
    handle.render(0)

    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed: 250,
      __pxlblz_show_c0_renders: 2,
      __pxlblz_show_c2_elapsed: 100,
      __pxlblz_show_c2_renders: 1,
    })
  })

  it('resets Pattern instance state and clock deterministically at the Show loop boundary (#586)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 0 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'looping',
        source: 'export var elapsed = 0\nexport var frames = 0\nexport function beforeRender(delta) { elapsed = elapsed + delta; frames = frames + 1 }\nexport function render(index) { rgb(elapsed, frames, 0) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: { scenes: [
        { holdMs: 50, placements: [{ zoneName: 'main', clipId: 'looping' }], transitionOut: { kind: 'cut', durationMs: 0 } },
        { holdMs: 50, placements: [{ zoneName: 'main', clipId: 'looping' }] },
      ] },
      loopDurationMs: 100,
      deterministicLoopReset: true,
    }, {})
    const { handle } = loadShow(artifact.code, artifact.metadata, 1)

    handle.beforeRender(60)
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_elapsed: 60, __pxlblz_show_c0_frames: 1 })
    handle.beforeRender(60)

    const exports = handle.getExports()
    expect(exports.__pxlblz_show_elapsed_s).toBeCloseTo(0.02)
    expect(exports.__pxlblz_show_c0_elapsed).toBeCloseTo(20)
    expect(exports.__pxlblz_show_c0_elapsed_ms).toBeCloseTo(20)
    expect(exports.__pxlblz_show_c0_frames).toBe(1)
  })

  it('resets isolated coordinate transforms at deterministic Show loop boundaries', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 0 }] }]
    const source = `
translate(0.5, 0)
export function beforeRender(delta) { rotate(PI / 2) }
export function render2D(index, x, y) { rgb(x, y, 0) }
`
    const artifact = compileShow({
      clips: [{ id: 'rotating', source }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: { scenes: [
        { holdMs: 50, placements: [{ zoneName: 'main', clipId: 'rotating' }], transitionOut: { kind: 'cut', durationMs: 0 } },
        { holdMs: 50, placements: [{ zoneName: 'main', clipId: 'rotating' }] },
      ] },
      loopDurationMs: 100,
      deterministicLoopReset: true,
    }, {})
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: 2,
    }, {
      mapPoints: [{ sample: [1, 0], pos: [1, 0] }],
      randomSeed: 1,
    })

    const firstLoop = runtime.advanceLive(60).pixels[0]
    const secondLoop = runtime.advanceLive(60).pixels[0]
    expect(secondLoop[0]).toBeCloseTo(firstLoop[0])
    expect(secondLoop[1]).toBeCloseTo(firstLoop[1])
  })

  it('captures an incoming Freeze placement from the beginning of its transition (#586)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [
        { id: 'outgoing', source: 'export function render2D(index, x, y) { rgb(0, 0, 0) }' },
        {
          id: 'incoming',
          source: 'export var clock = 0\nexport function beforeRender(delta) { clock = clock + delta / 1000 }\nexport function render2D(index, x, y) { rgb(clock, 0, 0) }',
        },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: { scenes: [
        {
          holdMs: 1_000,
          placements: [{ zoneName: 'main', clipId: 'outgoing' }],
          transitionOut: { kind: 'crossfade', durationMs: 1_000, crossfadePolicy: 'live-live' },
        },
        {
          holdMs: 1_000,
          placements: [{
            placementId: 'frozen-incoming',
            zoneName: 'main',
            clipId: 'incoming',
            presentation: { mode: 'freeze' },
          }],
        },
      ] },
      loopDurationMs: 3_000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)
    const renderFrame = () => [0, 1, 2, 3].map((index) => {
      handle.render2D(index, index % 2, Math.floor(index / 2))
      return pixel()[0]
    })

    handle.beforeRender(1_100)
    renderFrame()
    handle.beforeRender(100)
    const second = renderFrame()

    expect(second.every((channel) => channel === second[0])).toBe(true)
    expect(second[0]).toBeCloseTo(1.1 * 0.2)
  })

  it('does not let a scene-zero Freeze capture hijack later Freeze captures (#586)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const clockSource = 'export var clock = 0\nexport function beforeRender(delta) { clock = clock + delta / 1000 }\nexport function render2D(index, x, y) { rgb(clock, 0, 0) }'
    const artifact = compileShow({
      clips: [
        { id: 'first', source: clockSource },
        { id: 'second', source: clockSource },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: { scenes: [
        {
          holdMs: 500,
          placements: [{
            placementId: 'first-freeze',
            zoneName: 'main',
            clipId: 'first',
            presentation: { mode: 'freeze' },
          }],
          transitionOut: { kind: 'cut', durationMs: 0 },
        },
        {
          holdMs: 500,
          placements: [{ zoneName: 'main', clipId: 'second' }],
          transitionOut: { kind: 'crossfade', durationMs: 500, crossfadePolicy: 'live-live' },
        },
        {
          holdMs: 500,
          placements: [{
            placementId: 'second-freeze',
            zoneName: 'main',
            clipId: 'second',
            presentation: { mode: 'freeze' },
          }],
        },
      ] },
      loopDurationMs: 2_000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)
    const renderFrame = () => [0, 1, 2, 3].map((index) => {
      handle.render2D(index, index % 2, Math.floor(index / 2))
      return pixel()[0]
    })

    handle.beforeRender(1_600)
    const first = renderFrame()
    handle.beforeRender(100)
    const second = renderFrame()

    expect(first.every((channel) => channel === first[0])).toBe(true)
    expect(second).toEqual(first)
  })

  it('keeps one Freeze capture across derived intervals for the same placement (#586, #676)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export var clock = 0\nexport function beforeRender(delta) { clock = clock + delta / 1000 }\nexport function render2D(index, x, y) { rgb(clock, 0, 0) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: { scenes: [
        {
          holdMs: 500,
          placements: [{
            placementId: 'continuous-freeze',
            zoneName: 'main',
            clipId: 'shared',
            presentation: { mode: 'freeze' },
          }],
          transitionOut: { kind: 'crossfade', durationMs: 500, crossfadePolicy: 'live-live' },
        },
        {
          holdMs: 500,
          placements: [{
            placementId: 'continuous-freeze',
            zoneName: 'main',
            clipId: 'shared',
            presentation: { mode: 'freeze' },
          }],
        },
      ] },
      loopDurationMs: 1_500,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)
    const renderFrame = () => [0, 1, 2, 3].map((index) => {
      handle.render2D(index, index % 2, Math.floor(index / 2))
      return pixel()[0]
    })

    handle.beforeRender(100)
    const entry = renderFrame()
    handle.beforeRender(500)
    const afterDerivedBoundary = renderFrame()

    expect(afterDerivedBoundary).toEqual(entry)
  })

  it('keeps one Strobe capture across derived intervals for the same placement (#676)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export var clock = 0\nexport function beforeRender(delta) { clock = clock + delta / 1000 }\nexport function render2D(index, x, y) { rgb(clock, 0, 0) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: { scenes: [
        {
          holdMs: 500,
          placements: [{
            placementId: 'continuous-strobe',
            zoneName: 'main',
            clipId: 'shared',
            presentation: { mode: 'strobe', cadenceMs: 1_000 },
          }],
          transitionOut: { kind: 'crossfade', durationMs: 500, crossfadePolicy: 'live-live' },
        },
        {
          holdMs: 500,
          placements: [{
            placementId: 'continuous-strobe',
            zoneName: 'main',
            clipId: 'shared',
            presentation: { mode: 'strobe', cadenceMs: 1_000 },
          }],
        },
      ] },
      loopDurationMs: 1_500,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)
    const renderFrame = () => [0, 1, 2, 3].map((index) => {
      handle.render2D(index, index % 2, Math.floor(index / 2))
      return pixel()[0]
    })

    handle.beforeRender(100)
    const entry = renderFrame()
    handle.beforeRender(500)
    const afterDerivedBoundary = renderFrame()

    expect(afterDerivedBoundary).toEqual(entry)
  })

  it.each([
    ['Freeze', { mode: 'freeze' } as const],
    ['Strobe', { mode: 'strobe', cadenceMs: 1_000 } as const],
  ])('still rejects independent overlapping %s captures (#676)', (label, presentation) => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const compile = () => compileShow({
      clips: [
        { id: 'first', source: 'export function render2D(index, x, y) { rgb(x, y, 0) }' },
        { id: 'second', source: 'export function render2D(index, x, y) { rgb(0, x, y) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: { scenes: [
        {
          holdMs: 500,
          placements: [{
            placementId: 'first-capture',
            zoneName: 'main',
            clipId: 'first',
            presentation,
          }],
          transitionOut: { kind: 'crossfade', durationMs: 500, crossfadePolicy: 'live-live' },
        },
        {
          holdMs: 500,
          placements: [{
            placementId: 'second-capture',
            zoneName: 'main',
            clipId: 'second',
            presentation,
          }],
        },
      ] },
      loopDurationMs: 1_500,
    }, {})

    expect(compile).toThrow(new RegExp(`${label} Clip presentation cannot be compiled exactly.*insufficient-overlap-capacity`))
  })

  it('does not intern Show-score stacks that differ only by Blink (#586)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const placement = (brightness: number, blink = false) => ({
      zoneName: 'main',
      clipId: 'red',
      brightness,
      ...(blink ? { blink: { rateHz: 1, duty: 0.5, phase: 0 } } : {}),
    })
    const artifact = compileShow({
      clips: [{ id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones, logical: { kind: 'single', zoneNames: ['main'] } }],
      routedSceneSequence: { scenes: [
        { holdMs: 100, placements: [placement(1)], transitionOut: { kind: 'crossfade', durationMs: 100, crossfadePolicy: 'live-live' } },
        { holdMs: 100, placements: [placement(0.5)], transitionOut: { kind: 'crossfade', durationMs: 100, crossfadePolicy: 'live-live' } },
        { holdMs: 100, placements: [placement(1, true)], transitionOut: { kind: 'crossfade', durationMs: 100, crossfadePolicy: 'live-live' } },
        { holdMs: 100, placements: [placement(0.5)] },
      ] },
      loopDurationMs: 700,
    }, {}, { showScoreSharing: 'force' })

    expect(artifact.summary.specializations.showScore?.selected).toBe(false)
  })

  it('blocks authored Freeze or Strobe when exact capture cannot be honored (#586)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const keyedFreeze = () => compileShow({
      clips: [{ id: 'keyed', source: 'export function render2D(index, x, y) { rgb(1, 1, 1) }' }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: { scenes: [
        {
          holdMs: 1_000,
          placements: [{
            placementId: 'keyed-freeze',
            zoneName: 'main',
            clipId: 'keyed',
            presentation: { mode: 'freeze' },
            effects: [{ id: 'black-key', kind: 'luma-key', target: 0, tolerance: 0.1, softness: 0.1 }],
          }],
          transitionOut: { kind: 'cut', durationMs: 0 },
        },
        { holdMs: 1_000, placements: [{ zoneName: 'main', clipId: 'keyed' }] },
      ] },
      loopDurationMs: 2_000,
    }, {})

    expect(keyedFreeze).toThrow(/Freeze.*cannot be compiled exactly/i)
  })

  it('rejects an enabled Clip Viewport when routed output is 1D (#585)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]

    expect(() => compileShow({
      clips: [{ id: 'blue', source: 'export function render(index) { rgb(0, 0, 1) }' }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1_000,
            placements: [{
              placementId: 'blue-placement',
              zoneName: 'main',
              clipId: 'blue',
              viewport: { enabled: true, x: 0, y: 0, width: 0.5, height: 1 },
            }],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1_000,
            placements: [{ placementId: 'blue-again', zoneName: 'main', clipId: 'blue' }],
          },
        ],
      },
      loopDurationMs: 2_000,
    }, {})).toThrow('Clip Viewports require 2D Show output.')
  })

  it('animates a Clip Viewport boundary without changing the Pattern coordinate field (#585)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 1000,
          placements: [
            { zoneName: 'main', clipId: 'red', stackOrder: 0 },
            {
              placementId: 'blue-placement',
              zoneName: 'main',
              clipId: 'blue',
              stackOrder: 1,
              viewport: { enabled: true, x: 0, y: 0, width: 0.25, height: 1, edge: 'hard' },
            },
          ],
          propertyTracks: [{
            id: 'viewport-width',
            target: { kind: 'placement-viewport', placementId: 'blue-placement', property: 'width' },
            keyframes: [
              { id: 'viewport-a', timeMs: 0, value: 0.25, easing: { curve: 'linear' } },
              { id: 'viewport-b', timeMs: 1000, value: 0.75, easing: { curve: 'linear' } },
            ],
          }],
          transitionOut: { kind: 'cut', durationMs: 0 },
        }, {
          holdMs: 1000,
          placements: [{ zoneName: 'main', clipId: 'red' }],
        }],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render2D(0, 0.4, 0)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render2D(1, 0.6, 0)
    expect(pixel()).toEqual([1, 0, 0])
  })

  it('renders a default rectangular X crawl through a continuous Soft boundary (#689)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 8 }] }]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 10_000,
          placements: [
            { zoneName: 'main', clipId: 'red', stackOrder: 0 },
            {
              placementId: 'blue-placement',
              zoneName: 'main',
              clipId: 'blue',
              stackOrder: 1,
              viewport: { enabled: true, x: -1, y: 0, width: 1, height: 1 },
            },
          ],
          propertyTracks: [{
            id: 'viewport-x',
            target: { kind: 'placement-viewport', placementId: 'blue-placement', property: 'x' },
            keyframes: [
              { id: 'viewport-a', timeMs: 0, value: -1, easing: { curve: 'linear' } },
              { id: 'viewport-b', timeMs: 10_000, value: 0, easing: { curve: 'linear' } },
            ],
          }],
          transitionOut: { kind: 'cut', durationMs: 0 },
        }, {
          holdMs: 1_000,
          placements: [{ zoneName: 'main', clipId: 'red' }],
        }],
      },
      loopDurationMs: 11_000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 100)

    handle.beforeRender(4_900)
    handle.render2D(4, 0.5, 0.5)
    const before = pixel()
    expect(before[0]).toBeCloseTo(17 / 30, 5)
    expect(before[2]).toBeCloseTo(13 / 30, 5)

    handle.beforeRender(100)
    handle.render2D(4, 0.5, 0.5)
    expect(pixel()).toEqual([0.5, 0, 0.5])
  })

  it('evaluates a Viewport mask after zone coordinates when Clip opacity is animated (#585)', () => {
    const zones = [
      { id: 'main', name: 'main', ranges: [{ start: 0, end: 0 }, { start: 2, end: 2 }] },
      { id: 'other', name: 'other', ranges: [{ start: 1, end: 1 }, { start: 3, end: 3 }] },
    ]
    const artifact = compileShow({
      clips: [{ id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 1000,
          placements: [
            {
              placementId: 'blue-placement',
              zoneName: 'main',
              clipId: 'blue',
              stackOrder: 0,
              opacity: 1,
              viewport: { enabled: true, x: 0, y: 0, width: 0.5, height: 1, edge: 'hard' },
            },
          ],
          propertyTracks: [{
            id: 'blue-opacity',
            target: { kind: 'placement-opacity', placementId: 'blue-placement' },
            keyframes: [
              { id: 'opacity-a', timeMs: 0, value: 1, easing: { curve: 'linear' } },
              { id: 'opacity-b', timeMs: 1000, value: 1, easing: { curve: 'linear' } },
            ],
          }],
          transitionOut: { kind: 'cut', durationMs: 0 },
        }, {
          holdMs: 1000,
          placements: [{ zoneName: 'main', clipId: 'blue' }],
        }],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(100)
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render2D(2, 1, 0)
    expect(pixel()).toEqual([0, 0, 0])
  })

  it('interns equivalent cut-only physical render plans across Scenes and Zones (#499)', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }] },
      { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }] },
    ]
    const placement = (placementId: string, zoneName: string, brightness: number) => ({
      placementId,
      zoneName,
      clipId: 'shared',
      brightness,
    })
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export function render2D(index, x, y) { rgb(1, 0.5, 0.25) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [placement('left-a', 'left', 0.5), placement('right-a', 'right', 0.5)],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: [placement('left-b', 'left', 0.5), placement('right-b', 'right', 1)],
          },
        ],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render2D(0, 0.25, 0.75)
    expect(pixel()).toEqual([0.5, 0.25, 0.125])
    handle.beforeRender(1000)
    handle.render2D(2, 0.25, 0.75)
    expect(pixel()).toEqual([1, 0.5, 0.25])
    expect(artifact.expandedCode).toContain('var __pxlblz_show_plan = -1')
    expect(artifact.expandedCode).toContain('var __pxlblz_show_plans = array(4)')
    expect(artifact.expandedCode.match(/_renderCapture2D\(__pxlblz_show_route_local_index/g)).toHaveLength(2)
  })

  it('bakes static affine placement Effects into interned render plans (#499)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export function render2D(index, x, y) { rgb(x, y, 0) }',
        effects: [{ id: 'move', kind: 'translate', x: 0, y: 0 }],
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [{
              placementId: 'main-a',
              zoneName: 'main',
              clipId: 'shared',
              effects: [{ id: 'move', kind: 'translate', x: 0, y: 0 }],
            }],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: [{
              placementId: 'main-b',
              zoneName: 'main',
              clipId: 'shared',
              effects: [{ id: 'move', kind: 'translate', x: 0.25, y: 0.25 }],
            }],
          },
        ],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render2D(3, 1, 1)
    expect(pixel()).toEqual([1, 1, 0])
    handle.beforeRender(1000)
    handle.render2D(3, 1, 1)
    expect(pixel()[0]).toBeCloseTo(0.75)
    expect(pixel()[1]).toBeCloseTo(0.75)
    expect(artifact.expandedCode).not.toContain('function __pxlblz_show_c0_fx_update')
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_c0_fx_p0_x')
    expect(artifact.expandedCode).toContain('__pxlblz_show_c0_fx_a =')
    expect(artifact.summary.cost.cpu.effects.affineOperationsPerFrame).toBe(0)
    expect(artifact.summary.cost.memory.generatedScalarGlobals).toBe(6)
  })

  it('caches interned plan configuration by Plan and physical Zone (#499)', () => {
    const zones = [
      { id: 'short', name: 'short', ranges: [{ start: 0, end: 1 }] },
      { id: 'long', name: 'long', ranges: [{ start: 2, end: 5 }] },
    ]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export function render(index) { rgb(index / max(1, pixelCount - 1), 0, 0) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 500,
            placements: [
              { placementId: 'short-a', zoneName: 'short', clipId: 'shared' },
              { placementId: 'long-a', zoneName: 'long', clipId: 'shared' },
            ],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 500,
            placements: [
              { placementId: 'short-b', zoneName: 'short', clipId: 'shared' },
              { placementId: 'long-b', zoneName: 'long', clipId: 'shared' },
            ],
          },
        ],
      },
      loopDurationMs: 1000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 6)

    handle.beforeRender(100)
    handle.render(1)
    expect(pixel()[0]).toBeCloseTo(1)
    handle.render(5)
    expect(pixel()[0]).toBeCloseTo(1)
    expect(artifact.expandedCode).toContain('__pxlblz_show_plan * 2 + __pxlblz_show_route_id')
    expect(artifact.expandedCode).toContain('var __pxlblz_show_plan_configure =')
  })

  it('canonicalizes cut-only scheduler setup independently for each Pattern (#499)', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }] },
      { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }] },
    ]
    const tickingClip = (id: string, channel: string) => ({
      id,
      source: `
export var ticks = 0
export function beforeRender(delta) { ticks = ticks + 1 }
export function render2D(index, x, y) { rgb(${channel === 'r' ? 1 : 0}, ${channel === 'g' ? 1 : 0}, 0) }
`,
    })
    const artifact = compileShow({
      clips: [tickingClip('always', 'r'), tickingClip('sometimes', 'g')],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [
              { placementId: 'always-a', zoneName: 'left', clipId: 'always' },
              { placementId: 'sometimes-a', zoneName: 'right', clipId: 'sometimes' },
            ],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: [{ placementId: 'always-b', zoneName: 'left', clipId: 'always' }],
          },
        ],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.beforeRender(1000)

    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_ticks: 2,
      __pxlblz_show_c1_ticks: 1,
    })
    expect(artifact.expandedCode.match(/__pxlblz_show_c0_advance\(delta\)/g)).toHaveLength(2)
    expect(artifact.expandedCode.match(/__pxlblz_show_c1_advance\(delta\)/g)).toHaveLength(2)
    expect(artifact.expandedCode).toContain('if (__pxlblz_show_scene <= 0)')
  })

  it('evaluates Scene-local instance and placement tracks with the generated easing runtime (#490)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'instance-a',
        source: 'export var amount = 0\nexport function sliderAmount(v) { amount = v }\nexport function render(index) { rgb(amount, 0, 0) }',
        controlTargets: { sliderAmount: 0 },
        effects: [{ id: 'gain', kind: 'brightness', brightness: 1 }],
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 1000,
          placements: [{
            placementId: 'placement-a', zoneName: 'main', clipId: 'instance-a', stackOrder: 0, opacity: 1,
            effects: [{ id: 'gain', kind: 'brightness', brightness: 1 }],
          }],
          propertyTracks: [
            {
              id: 'control',
              target: { kind: 'instance-control', instanceId: 'instance-a', exportName: 'sliderAmount' },
              keyframes: [
                { id: 'control-a', timeMs: 0, value: 0, easing: { curve: 'linear' } },
                { id: 'control-b', timeMs: 1000, value: 1, easing: { curve: 'linear' } },
              ],
            },
            {
              id: 'opacity',
              target: { kind: 'placement-opacity', placementId: 'placement-a' },
              keyframes: [
                { id: 'opacity-a', timeMs: 0, value: 0, easing: { curve: 'cubic-bezier', x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
                { id: 'opacity-b', timeMs: 1000, value: 1, easing: { curve: 'linear' } },
              ],
            },
            {
              id: 'effect',
              target: { kind: 'placement-effect', placementId: 'placement-a', effectId: 'gain', effectKind: 'brightness', parameterId: 'brightness' },
              keyframes: [
                { id: 'effect-a', timeMs: 0, value: 1, easing: { curve: 'hold', at: 0.75 } },
                { id: 'effect-b', timeMs: 1000, value: 2, easing: { curve: 'linear' } },
              ],
            },
          ],
          transitionOut: { kind: 'cut', durationMs: 0 },
        }, {
          holdMs: 1000,
          placements: [{ placementId: 'placement-b', zoneName: 'main', clipId: 'instance-a' }],
        }],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render(0)
    expect(pixel()[0]).toBeCloseTo(0.25, 3)
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_control_sliderAmount: 0.5 })
  })

  it('animates a stable placement Transform target through the generated affine kernel (#529)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'instance-a',
        source: 'export function render2D(index, x, y) { rgb(x, y, 0) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 1_000,
          placements: [{ placementId: 'placement-a', zoneName: 'main', clipId: 'instance-a' }],
          propertyTracks: [{
            id: 'move-x',
            target: { kind: 'placement-transform', placementId: 'placement-a', property: 'positionX' },
            keyframes: [
              { id: 'move-a', timeMs: 0, value: 0, easing: { curve: 'linear' } },
              { id: 'move-b', timeMs: 1_000, value: 0.5, easing: { curve: 'linear' } },
            ],
          }],
          transitionOut: { kind: 'cut', durationMs: 0 },
        }, {
          holdMs: 1_000,
          placements: [{ placementId: 'placement-b', zoneName: 'main', clipId: 'instance-a' }],
        }],
      },
      loopDurationMs: 2_000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render2D(3, 1, 0.5)

    expect(pixel()[0]).toBeCloseTo(0.75)
    expect(pixel()[1]).toBeCloseTo(1)
    expect(artifact.expandedCode).toContain('_fx_update()')
  })

  it('keeps full source-Scene curves truthful across a lowered hold offset (#490)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 0 }] }]
    const artifact = compileShow({
      clips: [{ id: 'instance-a', source: 'export function render(index) { rgb(1, 0, 0) }' }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 1000,
          localTimeOffsetMs: 1000,
          placements: [{ placementId: 'placement-a', zoneName: 'main', clipId: 'instance-a', opacity: 1 }],
          propertyTracks: [{
            id: 'opacity',
            target: { kind: 'placement-opacity', placementId: 'placement-a' },
            keyframes: [
              { id: 'a', timeMs: 0, value: 0, easing: { curve: 'linear' } },
              { id: 'b', timeMs: 2000, value: 1, easing: { curve: 'linear' } },
            ],
          }],
          transitionOut: { kind: 'cut', durationMs: 0 },
        }, {
          holdMs: 1000,
          placements: [{ placementId: 'placement-b', zoneName: 'main', clipId: 'instance-a' }],
        }],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 1)

    handle.beforeRender(500)
    handle.render(0)
    expect(pixel()[0]).toBeCloseTo(0.75)
  })

  it('holds authored placement endpoints through a parent Scene transition (#490)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 0 }] }]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'green', source: 'export function render(index) { rgb(0, 1, 0) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 1000,
          placements: [{ placementId: 'red-placement', zoneName: 'main', clipId: 'red', opacity: 1 }],
          propertyTracks: [{
            id: 'red-opacity',
            target: { kind: 'placement-opacity', placementId: 'red-placement' },
            keyframes: [
              { id: 'red-a', timeMs: 0, value: 1, easing: { curve: 'linear' } },
              { id: 'red-b', timeMs: 1000, value: 0.4, easing: { curve: 'linear' } },
            ],
          }],
          transitionOut: { kind: 'crossfade', durationMs: 1000 },
        }, {
          holdMs: 1000,
          placements: [{ placementId: 'green-placement', zoneName: 'main', clipId: 'green', opacity: 0.2 }],
          propertyTracks: [{
            id: 'green-opacity',
            target: { kind: 'placement-opacity', placementId: 'green-placement' },
            keyframes: [
              { id: 'green-a', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
              { id: 'green-b', timeMs: 1000, value: 1, easing: { curve: 'linear' } },
            ],
          }],
        }],
      },
      loopDurationMs: 3000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 1)

    handle.beforeRender(1500)
    handle.render(0)
    expect(pixel()[0]).toBeCloseTo(0.2)
    expect(pixel()[1]).toBeCloseTo(0.1)
  })

  it('honors zero, full, and intermediate overlay opacity deterministically (#489)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 0 }] }]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'blue', source: 'export function render(index) { rgb(0, 0, 1) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [0, 1, 0.25].map((opacity, index) => ({
          holdMs: 1000,
          placements: [
            { zoneName: 'main', clipId: 'red', stackOrder: 0 },
            { zoneName: 'main', clipId: 'blue', stackOrder: 1, opacity },
          ],
          ...(index < 2 ? { transitionOut: { kind: 'cut' as const, durationMs: 0 } } : {}),
        })),
      },
      loopDurationMs: 3000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 1)

    handle.beforeRender(500)
    handle.render(0)
    expect(pixel()).toEqual([1, 0, 0])
    handle.beforeRender(1000)
    handle.render(0)
    expect(pixel()).toEqual([0, 0, 1])
    handle.beforeRender(1000)
    handle.render(0)
    expect(pixel()).toEqual([0.75, 0, 0.25])
  })

  it('composites a keyed overlay through its generated matte (#527)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 2 }] }]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
        {
          id: 'keyed',
          source: 'export function render(index) { if (index == 0) rgb(0, 0, 0); else if (index == 1) rgb(0.15, 0.15, 0.15); else rgb(0, 1, 0) }',
          effects: [{ id: 'black-key', kind: 'luma-key', target: 0, tolerance: 0.1, softness: 0.1 }],
        },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [0, 1].map((index) => ({
          holdMs: 1000,
          placements: [
            { zoneName: 'main', clipId: 'red', stackOrder: 0 },
            { zoneName: 'main', clipId: 'keyed', stackOrder: 1 },
          ],
          ...(index === 0 ? { transitionOut: { kind: 'cut' as const, durationMs: 0 } } : {}),
        })),
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 3)

    handle.beforeRender(0)
    handle.render(0)
    expect(pixel()).toEqual([1, 0, 0])
    handle.render(1)
    expect(pixel()).toEqual([expect.closeTo(0.575, 12), expect.closeTo(0.075, 12), expect.closeTo(0.075, 12)])
    handle.render(2)
    expect(pixel()).toEqual([0, 1, 0])
  })

  it('skips a proven-pure covered lower renderer when a keyed overlay is fully opaque (#527, #534)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 1 }] }]
    const artifact = compileShow({
      clips: [
        {
          id: 'red',
          source: 'export function render(index) { rgb(1, 0, 0) }',
        },
        {
          id: 'keyed',
          source: 'export function render(index) { if (index == 0) rgb(0, 0, 0); else rgb(0, 1, 0) }',
          effects: [{ id: 'black-key', kind: 'luma-key', target: 0, tolerance: 0, softness: 0 }],
        },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [0, 1].map((index) => ({
          holdMs: 1000,
          placements: [
            { zoneName: 'main', clipId: 'red', stackOrder: 0 },
            { zoneName: 'main', clipId: 'keyed', stackOrder: 1 },
          ],
          ...(index === 0 ? { transitionOut: { kind: 'cut' as const, durationMs: 0 } } : {}),
        })),
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 2)

    expect(artifact.summary.specializations.contentKeys).toMatchObject({
      keyedClipCount: 1,
      selectedStackCount: 2,
      evaluationFormula: 'N + U',
      bestCaseRenderersPerPixel: 1,
      worstCaseRenderersPerPixel: 2,
      featheredPixelsEvaluateBoth: true,
    })

    handle.beforeRender(0)
    handle.render(1)
    expect(pixel()).toEqual([0, 1, 0])
    expect(artifact.expandedCode).toMatch(/__pxlblz_show_c1_renderCapture[^]*if \(__pxlblz_show_c1_alpha < 1\) \{[^]*__pxlblz_show_c0_renderCapture/)

    handle.render(0)
    expect(pixel()).toEqual([1, 0, 0])
  })

  it('composites ordered routed Scene layers before applying the parent Scene transition (#489)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'blue', source: 'export function render(index) { rgb(0, 0, 1) }' },
        { id: 'green', source: 'export function render(index) { rgb(0, 1, 0) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [
              { zoneName: 'main', clipId: 'red', stackOrder: 0 },
              { zoneName: 'main', clipId: 'blue', stackOrder: 1, opacity: 0.5 },
            ],
            transitionOut: { kind: 'crossfade', durationMs: 1000 },
          },
          {
            holdMs: 1000,
            placements: [{ zoneName: 'main', clipId: 'green', stackOrder: 0 }],
          },
        ],
      },
      loopDurationMs: 3000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render(0)
    expect(pixel()).toEqual([0.5, 0, 0.5])

    handle.beforeRender(1000)
    handle.render(0)
    expect(pixel()).toEqual([0.25, 0.5, 0.25])
    expect(artifact.summary).toMatchObject({
      steadyStateRenderersPerPixel: 2,
      worstInstantRenderersPerPixel: 3,
      cost: { cpu: { patternEvaluations: { formula: 'S * N', samplesPerPixel: 3 } } },
    })
  })

  it('keeps an unchanged routed Layer visually stable while the Layer below crossfades (#583)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'green', source: 'export function render(index) { rgb(0, 1, 0) }' },
        { id: 'blue', source: 'export function render(index) { rgb(0, 0, 1) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1_000,
            placements: [
              { placementId: 'from', zoneName: 'main', clipId: 'red', stackOrder: 0 },
              { placementId: 'stable', zoneName: 'main', clipId: 'blue', stackOrder: 1, opacity: 0.5 },
            ],
            transitionOut: { kind: 'crossfade', durationMs: 1_000 },
          },
          {
            holdMs: 1_000,
            placements: [
              { placementId: 'to', zoneName: 'main', clipId: 'green', stackOrder: 0 },
              { placementId: 'stable', zoneName: 'main', clipId: 'blue', stackOrder: 1, opacity: 0.5 },
            ],
          },
        ],
      },
      loopDurationMs: 3_000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(1_500)
    handle.render(0)

    expect(pixel()[0]).toBeCloseTo(0.25)
    expect(pixel()[1]).toBeCloseTo(0.25)
    expect(pixel()[2]).toBeCloseTo(0.5)
  })

  it('advances a semantic Pattern instance once when two layers reference it (#489)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export var elapsed = 0\nexport function beforeRender(delta) { elapsed = elapsed + delta }\nexport function render(index) { rgb(elapsed, 0, 0) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [
              { zoneName: 'main', clipId: 'shared', stackOrder: 0 },
              { zoneName: 'main', clipId: 'shared', stackOrder: 1, opacity: 0.5 },
            ],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: [{ zoneName: 'main', clipId: 'shared', stackOrder: 0 }],
          },
        ],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(100)

    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_elapsed: 100 })
    expect(artifact.expandedCode.match(/function __pxlblz_show_c0_beforeRender/g)).toHaveLength(1)
  })

  it('applies placement-owned view and effects while reusing one Pattern instance (#489)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export function render(index) { rgb(1, 0, 0) }',
        effects: [{ id: 'invert', kind: 'invert', amount: 1 }],
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [
              { zoneName: 'main', clipId: 'shared', stackOrder: 0, effects: [] },
              {
                zoneName: 'main',
                clipId: 'shared',
                stackOrder: 1,
                opacity: 0.5,
                phase: 0.25,
                mirror: true,
                effects: [{ id: 'invert', kind: 'invert', amount: 1 }],
              },
            ],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: [{ zoneName: 'main', clipId: 'shared', stackOrder: 0, effects: [] }],
          },
        ],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render(0)

    expect(pixel()[0]).toBeCloseTo(0.5)
    expect(pixel()[1]).toBeCloseTo(0.5)
    expect(pixel()[2]).toBeCloseTo(0.5)
    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_elapsed_ms: 500 })
  })

  it('composites Scene layers through normalized 2D routing (#489)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
        { id: 'green', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
      ],
      routingLayouts: [{
        id: 'normalized',
        name: 'Normalized',
        zones: [],
        logical: { kind: 'single', zoneNames: ['main'] },
      }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [
              { zoneName: 'main', clipId: 'red', stackOrder: 0 },
              { zoneName: 'main', clipId: 'blue', stackOrder: 1, opacity: 0.5 },
            ],
            transitionOut: { kind: 'wipe', durationMs: 1000 },
          },
          {
            holdMs: 1000,
            placements: [{ zoneName: 'main', clipId: 'green', stackOrder: 0 }],
          },
        ],
      },
      loopDurationMs: 3000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render2D(0, 0.25, 0.5)
    expect(pixel()).toEqual([0.5, 0, 0.5])

    handle.beforeRender(1000)
    handle.render2D(0, 0.25, 0.5)
    expect(pixel()).toEqual([0, 1, 0])
    handle.render2D(3, 0.75, 0.5)
    expect(pixel()).toEqual([0.5, 0, 0.5])
  })

  it('routes every Zone through the active top-level Scene schedule (#478)', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }] },
      { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }] },
    ]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'green', source: 'export function render(index) { rgb(0, 1, 0) }' },
        { id: 'blue', source: 'export function render(index) { rgb(0, 0, 1) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [{ zoneName: 'left', clipId: 'red' }, { zoneName: 'right', clipId: 'green' }],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: [{ zoneName: 'left', clipId: 'blue' }, { zoneName: 'right', clipId: 'red' }],
          },
        ],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render(0)
    expect(pixel()).toEqual([1, 0, 0])
    handle.render(2)
    expect(pixel()).toEqual([0, 1, 0])

    handle.beforeRender(1000)
    handle.render(0)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render(2)
    expect(pixel()).toEqual([1, 0, 0])
    expect(artifact.summary).toMatchObject({ clipCount: 3, transitionCount: 1 })
  })

  it('advances one shared Pattern instance once when several Zones place it (#478)', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }] },
      { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }] },
    ]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export var elapsed = 0\nexport function beforeRender(delta) { elapsed = elapsed + delta }\nexport function render(index) { rgb(elapsed, 0, 0) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [{ zoneName: 'left', clipId: 'shared' }, { zoneName: 'right', clipId: 'shared' }],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: [{ zoneName: 'left', clipId: 'shared' }, { zoneName: 'right', clipId: 'shared' }],
          },
        ],
      },
      loopDurationMs: 2000,
    }, {})
    const { handle } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(100)

    expect(handle.getExports()).toMatchObject({ __pxlblz_show_c0_elapsed: 100 })
    expect(artifact.expandedCode.match(/function __pxlblz_show_c0_beforeRender/g)).toHaveLength(1)
  })

  it('crossfades every routed Zone at the same Scene boundary (#478)', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }] },
      { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }] },
    ]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'green', source: 'export function render(index) { rgb(0, 1, 0) }' },
        { id: 'blue', source: 'export function render(index) { rgb(0, 0, 1) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [{ zoneName: 'left', clipId: 'red' }, { zoneName: 'right', clipId: 'green' }],
            transitionOut: { kind: 'crossfade', durationMs: 1000 },
          },
          {
            holdMs: 1000,
            placements: [{ zoneName: 'left', clipId: 'blue' }, { zoneName: 'right', clipId: 'red' }],
          },
        ],
      },
      loopDurationMs: 3000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(1500)
    handle.render(0)
    expect(pixel()).toEqual([0.5, 0, 0.5])
    handle.render(2)
    expect(pixel()).toEqual([0.5, 0.5, 0])
  })

  it('snapshots the fully composited outgoing routed Scene stack once (#516)', () => {
    const zones = [{ id: 'stage', name: 'stage', ranges: [{ start: 0, end: 3 }] }]
    const counted = (r: number, g: number, b: number) => `
export var renders = 0
export function render(index) { renders = renders + 1; rgb(${r}, ${g}, ${b}) }
`
    const artifact = compileShow({
      clips: [
        { id: 'red', source: counted(1, 0, 0) },
        { id: 'green', source: counted(0, 1, 0) },
        { id: 'blue', source: counted(0, 0, 1) },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [
              { placementId: 'red-base', zoneName: 'stage', clipId: 'red', stackOrder: 0 },
              { placementId: 'green-half', zoneName: 'stage', clipId: 'green', stackOrder: 1, opacity: 0.5 },
            ],
            transitionOut: {
              kind: 'crossfade',
              durationMs: 1000,
              crossfadePolicy: 'snapshot-live',
            },
          },
          {
            holdMs: 1000,
            placements: [{ placementId: 'blue', zoneName: 'stage', clipId: 'blue' }],
          },
        ],
      },
      masterPixelCount: 4,
      loopDurationMs: 3000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(1250)
    for (let index = 0; index < 4; index += 1) handle.render(index)
    expect(pixel()).toEqual([0.375, 0.375, 0.25])

    handle.beforeRender(250)
    for (let index = 0; index < 4; index += 1) handle.render(index)

    expect(pixel()).toEqual([0.25, 0.25, 0.5])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_renders: 4,
      __pxlblz_show_c1_renders: 4,
      __pxlblz_show_c2_renders: 8,
    })
    expect(artifact.summary.renderTarget.activeRole).toBe('stage-rgb')
    expect(artifact.summary.renderPolicy).toBe('snapshot-outgoing-transition-live-incoming')
  })

  it('routes Scene placements through a normalized logical split (#478)', () => {
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'green', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
        { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      ],
      routingLayouts: [{
        id: 'normalized',
        name: 'Normalized',
        zones: [],
        logical: { kind: 'split', axis: 'x', zoneNames: ['left', 'right'] },
      }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [{ zoneName: 'left', clipId: 'red' }, { zoneName: 'right', clipId: 'green' }],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: [{ zoneName: 'left', clipId: 'blue' }, { zoneName: 'right', clipId: 'red' }],
          },
        ],
      },
      routingPropertyRamps: { splitPosition: { initial: 0.5, ramps: [] } },
      loopDurationMs: 2000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(500)
    handle.render2D(0, 0.25, 0.5)
    expect(pixel()).toEqual([1, 0, 0])
    handle.render2D(2, 0.75, 0.5)
    expect(pixel()).toEqual([0, 1, 0])

    handle.beforeRender(1000)
    handle.render2D(0, 0.25, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render2D(2, 0.75, 0.5)
    expect(pixel()).toEqual([1, 0, 0])
  })

  it('animates a shared routed Pattern property through a Scene boundary (#478)', () => {
    const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]
    const artifact = compileShow({
      clips: [{
        id: 'shared',
        source: 'export var elapsed = 0\nexport function beforeRender(delta) { elapsed = elapsed + delta }\nexport function render(index) { rgb(elapsed, 0, 0) }',
      }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [{ zoneName: 'main', clipId: 'shared', timeScale: 1 }],
            transitionOut: { kind: 'crossfade', durationMs: 1000 },
            transitionRamps: [{
              clipId: 'shared',
              propertyRamps: { timeScale: { from: 1, to: 0, durationMs: 1000, easing: 'linear' } },
            }],
          },
          { holdMs: 1000, placements: [{ zoneName: 'main', clipId: 'shared', timeScale: 0 }] },
        ],
      },
      loopDurationMs: 3000,
    }, {})
    const { handle } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(1000)
    handle.beforeRender(500)

    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed: 1250,
      __pxlblz_show_c0_adapt_timeScale: 0.5,
    })
  })

  it('keeps one routed span continuous while Repeat resets each Zone domain (#478)', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }] },
      { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }] },
    ]
    const compile = (zoneMode: 'span' | 'repeat') => compileShow({
      clips: [{ id: 'shared', source: 'export function render(index) { rgb(index / max(1, pixelCount - 1), 0, 0) }' }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: ['left', 'right'].map((zoneName) => ({
              zoneName,
              clipId: 'shared',
              domainZoneNames: ['left', 'right'],
              zoneMode,
            })),
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1000,
            placements: ['left', 'right'].map((zoneName) => ({
              zoneName,
              clipId: 'shared',
              domainZoneNames: ['left', 'right'],
              zoneMode,
            })),
          },
        ],
      },
      loopDurationMs: 2000,
    }, {})
    const sample = (zoneMode: 'span' | 'repeat') => {
      const artifact = compile(zoneMode)
      const runtime = loadShow(artifact.code, artifact.metadata, 4)
      runtime.handle.beforeRender(100)
      return [0, 1, 2, 3].map((index) => {
        runtime.handle.render(index)
        return runtime.pixel()[0]
      })
    }

    expect(sample('span')).toEqual([0, 1 / 3, 2 / 3, 1])
    expect(sample('repeat')).toEqual([0, 1, 0, 1])
  })

  it('keeps a logical split span in one canvas while Repeat normalizes each side (#478)', () => {
    const compile = (zoneMode: 'span' | 'repeat') => compileShow({
      clips: [{ id: 'shared', source: 'export function render2D(index, x, y) { rgb(x, 0, 0) }' }],
      routingLayouts: [{
        id: 'logical',
        name: 'Logical',
        zones: [],
        logical: { kind: 'split', axis: 'x', zoneNames: ['left', 'right'] },
      }],
      routedSceneSequence: {
        scenes: [0, 1].map((sceneIndex) => ({
          holdMs: 1000,
          placements: ['left', 'right'].map((zoneName) => ({
            zoneName,
            clipId: 'shared',
            domainZoneNames: ['left', 'right'],
            zoneMode,
          })),
          ...(sceneIndex === 0 ? { transitionOut: { kind: 'cut' as const, durationMs: 0 } } : {}),
        })),
      },
      routingPropertyRamps: { splitPosition: { initial: 0.5, ramps: [] } },
      loopDurationMs: 2000,
    }, {})
    const sample = (zoneMode: 'span' | 'repeat') => {
      const artifact = compile(zoneMode)
      const runtime = loadShow(artifact.code, artifact.metadata, 4)
      runtime.handle.beforeRender(100)
      return [0.25, 0.75].map((x, index) => {
        runtime.handle.render2D(index, x, 0.5)
        return runtime.pixel()[0]
      })
    }

    expect(sample('span')).toEqual([0.25, 0.75])
    expect(sample('repeat')).toEqual([0.5, 0.5])
  })

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

  it('applies a scoped Layer Transition only inside its owning Zone (#630)', () => {
    const zones = [
      { id: 'left', name: 'Left', ranges: [{ start: 0, end: 0 }] },
      { id: 'right', name: 'Right', ranges: [{ start: 1, end: 1 }] },
    ]
    const artifact = compileShow({
      clips: [
        { id: 'left-before', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'left-after', source: 'export function render(index) { rgb(0, 1, 0) }' },
        { id: 'right-before', source: 'export function render(index) { rgb(0, 0, 1) }' },
        { id: 'right-after', source: 'export function render(index) { rgb(1, 1, 0) }' },
      ],
      zones,
      routingLayouts: [{ id: 'split', name: 'Split', zones }],
      routedSceneSequence: {
        scenes: [{
          holdMs: 1_000,
          placements: [
            { zoneName: 'Left', clipId: 'left-before' },
            { zoneName: 'Right', clipId: 'right-before' },
          ],
          transitionOut: {
            kind: 'crossfade',
            durationMs: 1_000,
            easing: 'linear',
            crossfadePolicy: 'live-live',
            scopeZoneName: 'Left',
          },
        }, {
          holdMs: 1_000,
          placements: [
            { zoneName: 'Left', clipId: 'left-after' },
            { zoneName: 'Right', clipId: 'right-after' },
          ],
        }],
      },
      loopDurationMs: 3_000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 2)

    handle.beforeRender(1_500)
    handle.render(0)
    expect(pixel()).toEqual([0.5, 0.5, 0])
    handle.render(1)
    expect(pixel()).toEqual([1, 1, 0])
  })

  it('applies the same Zone scope through Portable logical routing (#630)', () => {
    const zones = [
      { id: 'left', name: 'Left', ranges: [{ start: 0, end: 1 }] },
      { id: 'right', name: 'Right', ranges: [{ start: 2, end: 3 }] },
    ]
    const artifact = compileShow({
      clips: [
        { id: 'left-before', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'left-after', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
        { id: 'right-before', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
        { id: 'right-after', source: 'export function render2D(index, x, y) { rgb(1, 1, 0) }' },
      ],
      zones,
      routingLayouts: [{
        id: 'split',
        name: 'Split',
        zones,
        logical: { kind: 'split', zoneNames: ['Left', 'Right'], axis: 'x' },
      }],
      routingPropertyRamps: { splitPosition: { initial: 0.5, ramps: [] } },
      routedSceneSequence: {
        scenes: [{
          holdMs: 1_000,
          placements: [
            { zoneName: 'Left', clipId: 'left-before' },
            { zoneName: 'Right', clipId: 'right-before' },
          ],
          transitionOut: {
            kind: 'crossfade',
            durationMs: 1_000,
            easing: 'linear',
            crossfadePolicy: 'live-live',
            scopeZoneName: 'Left',
          },
        }, {
          holdMs: 1_000,
          placements: [
            { zoneName: 'Left', clipId: 'left-after' },
            { zoneName: 'Right', clipId: 'right-after' },
          ],
        }],
      },
      loopDurationMs: 3_000,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(1_500)
    handle.render2D(0, 0.25, 0.5)
    expect(pixel()).toEqual([0.5, 0.5, 0])
    handle.render2D(3, 0.75, 0.5)
    expect(pixel()).toEqual([1, 1, 0])
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

  it('keeps long routing-layout schedules inside the Pixelblaze 16.16 range', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 1 }] },
      { id: 'right', name: 'right', ranges: [{ start: 2, end: 3 }] },
    ]
    const artifact = compileShow({
      clips: [
        { id: 'red', zone: 'left', source: 'export function render(index) { rgb(1, 0, 0) }' },
        { id: 'blue', zone: 'right', source: 'export function render(index) { rgb(0, 0, 1) }' },
      ],
      zones,
      routingLayouts: [
        { id: 'original', name: 'Original', zones },
        {
          id: 'swapped',
          name: 'Swapped',
          zones: [
            { id: 'left-swapped', name: 'left', ranges: [{ start: 2, end: 3 }] },
            { id: 'right-swapped', name: 'right', ranges: [{ start: 0, end: 1 }] },
          ],
        },
      ],
      routingSwitches: [{ atMs: 40_000, layoutId: 'swapped' }],
      loopDurationMs: 60_000,
    }, {})

    expect(artifact.expandedCode).toContain('__pxlblz_show_elapsed_s = (__pxlblz_show_elapsed_s + delta / 1000) % 60')
    expect(artifact.expandedCode).toContain('__pxlblz_show_elapsed_s >= 40')
    expect(artifact.expandedCode).not.toContain('% 60000')
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
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_route_pixels')
    expect(artifact.expandedCode).not.toContain('if (index < 256)')

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, size * size)
    handle.beforeRender(16)
    handle.render2D(index, 1, 1)
    expect(pixel()).toEqual([3, 1, 1])
  })

  it('compiles Checker as one direct coordinate predicate with normalized cell-local coordinates (#507)', () => {
    const zones = ['red', 'black']
    const artifact = compileShow({
      clips: zones.map((zone, zoneIndex) => ({
        id: zone,
        zone,
        source: `export function render2D(index, x, y) { rgb(x, y, ${zoneIndex}) }`,
      })),
      zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
      routingLayouts: [{
        id: 'checker',
        name: 'Checker',
        zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
        logical: { kind: 'checker', zoneNames: ['red', 'black'], columns: 4, rows: 2 },
      }],
      routingSwitches: [],
      loopDurationMs: 1000,
    }, {})

    expect(artifact.summary.routingRepresentation).toBe('coordinate-predicates')
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_route_pixels')

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 64)
    handle.beforeRender(16)
    handle.render2D(0, 0.125, 0.25)
    expect(pixel()).toEqual([0.5, 0.5, 0])
    handle.render2D(1, 0.375, 0.25)
    expect(pixel()).toEqual([0.5, 0.5, 1])
    handle.render2D(2, 0.125, 0.75)
    expect(pixel()).toEqual([0.5, 0.5, 1])
  })

  it('compiles Rings as one direct radial predicate with normalized ring-local coordinates (#507)', () => {
    const zones = ['red', 'cyan']
    const artifact = compileShow({
      clips: zones.map((zone, zoneIndex) => ({
        id: zone,
        zone,
        source: `export function render2D(index, x, y) { rgb(x, y, ${zoneIndex}) }`,
      })),
      zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
      routingLayouts: [{
        id: 'rings',
        name: 'Rings',
        zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
        logical: { kind: 'rings', zoneNames: zones, rings: 4 },
      }],
      routingSwitches: [],
      loopDurationMs: 1000,
    }, {})

    expect(artifact.summary.routingRepresentation).toBe('coordinate-predicates')
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_route_pixels')

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 64)
    const ringCenterX = (ring: number) => 0.5 + Math.SQRT1_2 * (ring + 0.5) / 4
    handle.beforeRender(16)
    handle.render2D(0, ringCenterX(1), 0.5)
    expect(pixel()).toEqual([0, 0.5, 1])
    handle.render2D(1, ringCenterX(2), 0.5)
    expect(pixel()).toEqual([0, 0.5, 0])
  })

  it('compiles Pinwheel arms independently from ordered zones with rotation (#507)', () => {
    const zones = ['red', 'cyan']
    const artifact = compileShow({
      clips: zones.map((zone, zoneIndex) => ({
        id: zone,
        zone,
        source: `export function render2D(index, x, y) { rgb(x, y, ${zoneIndex}) }`,
      })),
      zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
      routingLayouts: [{
        id: 'pinwheel',
        name: 'Pinwheel',
        zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
        logical: {
          kind: 'pinwheel',
          zoneNames: zones,
          arms: 4,
          twist: 0,
          rotation: Math.PI / 2,
        },
      }],
      routingSwitches: [],
      loopDurationMs: 1000,
    }, {})

    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_route_pixels')

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 64)
    handle.beforeRender(16)
    handle.render2D(0, 0.75, 0.5)
    expect(pixel()[0]).toBe(0)
    expect(pixel()[1]).toBeCloseTo(Math.SQRT1_2 / 2)
    expect(pixel()[2]).toBe(1)
    handle.render2D(1, 0.5, 0.75)
    expect(pixel()[0]).toBe(0)
    expect(pixel()[1]).toBeCloseTo(Math.SQRT1_2 / 2)
    expect(pixel()[2]).toBe(0)
  })

  it('compiles Wave as one direct displaced-band predicate with local coordinates (#507)', () => {
    const zones = ['red', 'cyan']
    const artifact = compileShow({
      clips: zones.map((zone, zoneIndex) => ({
        id: zone,
        zone,
        source: `export function render2D(index, x, y) { rgb(x, y, ${zoneIndex}) }`,
      })),
      zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
      routingLayouts: [{
        id: 'wave',
        name: 'Wave',
        zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
        logical: {
          kind: 'wave',
          zoneNames: zones,
          axis: 'y',
          bands: 4,
          amplitude: 0.5,
          frequency: 1,
          phase: 0,
        },
      }],
      routingSwitches: [],
      loopDurationMs: 1000,
    }, {})

    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_route_pixels')

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 64)
    handle.beforeRender(16)
    handle.render2D(0, 0, 0.375)
    expect(pixel()).toEqual([0, 0.5, 0])
    handle.render2D(1, 0.5, 0.125)
    expect(pixel()).toEqual([0.5, 0.5, 1])
  })

  it('compiles Soft Split with one renderer outside its feather and two inside (#507)', () => {
    const zones = ['red', 'cyan']
    const artifact = compileShow({
      clips: zones.map((zone, zoneIndex) => ({
        id: zone,
        zone,
        source: `export function render2D(index, x, y) { rgb(x, y, ${zoneIndex}) }`,
      })),
      zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
      routingLayouts: [{
        id: 'soft-split',
        name: 'Soft Split',
        zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
        logical: { kind: 'soft-split', zoneNames: [zones[0], zones[1]], axis: 'x', feather: 0.2 },
      }],
      routingSwitches: [],
      routingPropertyRamps: { splitPosition: { initial: 0.5, ramps: [] } },
      loopDurationMs: 1000,
    }, {})

    expect(artifact.summary.renderPolicy).toBe('spatial-route-bounded-feather')
    expect(artifact.summary.steadyStateRenderersPerPixel).toBe(1)
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(2)
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_route_pixels')

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 64)
    handle.beforeRender(16)
    handle.render2D(0, 0.2, 0.4)
    expect(pixel()).toEqual([0.2, 0.4, 0])
    handle.render2D(1, 0.5, 0.4)
    expect(pixel()).toEqual([0.5, 0.4, 0.5])
    handle.render2D(2, 0.8, 0.4)
    expect(pixel()).toEqual([0.8, 0.4, 1])
  })

  it('lowers zero-feather Soft Split to a one-renderer hard boundary (#507)', () => {
    const zones = ['red', 'cyan']
    const artifact = compileShow({
      clips: zones.map((zone, zoneIndex) => ({
        id: zone,
        zone,
        source: `export function render2D(index, x, y) { rgb(${zoneIndex}, x, y) }`,
      })),
      zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
      routingLayouts: [{
        id: 'soft-split',
        name: 'Soft Split',
        zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
        logical: { kind: 'soft-split', zoneNames: [zones[0], zones[1]], axis: 'x', feather: 0 },
      }],
      routingSwitches: [],
      routingPropertyRamps: { splitPosition: { initial: 0.5, ramps: [] } },
      loopDurationMs: 1000,
    }, {})

    expect(artifact.summary.renderPolicy).toBe('route-one-renderer-per-pixel')
    expect(artifact.summary.steadyStateRenderersPerPixel).toBe(1)
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(1)
  })

  it('rejects invalid adaptive routing parameters before generating source (#507)', () => {
    const zones = ['red', 'cyan']
    expect(() => compileShow({
      clips: zones.map((zone) => ({
        id: zone,
        zone,
        source: 'export function render2D(index, x, y) { rgb(x, y, 1) }',
      })),
      zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
      routingLayouts: [{
        id: 'soft-split',
        name: 'Soft Split',
        zones: zones.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
        logical: { kind: 'soft-split', zoneNames: [zones[0], zones[1]], axis: 'x', feather: 1.2 },
      }],
      routingSwitches: [],
      loopDurationMs: 1000,
    }, {})).toThrow('Soft Split feather between 0 and 1')
  })

  it('blends Soft Split ownership in the production routed Scene path (#507)', () => {
    const firstPlacements = [
      { zoneName: 'red', clipId: 'red', stackOrder: 0 },
      { zoneName: 'cyan', clipId: 'cyan', stackOrder: 0 },
    ]
    const secondPlacements = [
      { zoneName: 'red', clipId: 'green', stackOrder: 0 },
      { zoneName: 'cyan', clipId: 'blue', stackOrder: 0 },
    ]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'cyan', source: 'export function render2D(index, x, y) { rgb(0, 1, 1) }' },
        { id: 'green', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
        { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      ],
      routingLayouts: [{
        id: 'soft-split',
        name: 'Soft Split',
        zones: [],
        logical: { kind: 'soft-split', zoneNames: ['red', 'cyan'], axis: 'x', feather: 0.2 },
      }],
      routedSceneSequence: {
        scenes: [
          { holdMs: 1000, placements: firstPlacements, transitionOut: { kind: 'crossfade', durationMs: 1000 } },
          { holdMs: 1000, placements: secondPlacements },
        ],
      },
      routingPropertyRamps: { splitPosition: { initial: 0.5, ramps: [] } },
      loopDurationMs: 3000,
    }, {})

    expect(artifact.summary.steadyStateRenderersPerPixel).toBe(1)
    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(4)
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 64)
    handle.beforeRender(500)
    handle.render2D(0, 0.5, 0.4)
    expect(pixel()).toEqual([0.5, 0.5, 0.5])
    handle.beforeRender(1000)
    handle.render2D(0, 0.5, 0.4)
    expect(pixel()).toEqual([0.25, 0.5, 0.5])
  })

  it('preserves Soft Split ownership across selector Scene transitions (#507)', () => {
    const firstPlacements = [
      { zoneName: 'red', clipId: 'red', stackOrder: 0 },
      { zoneName: 'cyan', clipId: 'cyan', stackOrder: 0 },
    ]
    const secondPlacements = [
      { zoneName: 'red', clipId: 'green', stackOrder: 0 },
      { zoneName: 'cyan', clipId: 'blue', stackOrder: 0 },
    ]
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'cyan', source: 'export function render2D(index, x, y) { rgb(0, 1, 1) }' },
        { id: 'green', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
        { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      ],
      routingLayouts: [{
        id: 'soft-split',
        name: 'Soft Split',
        zones: [],
        logical: { kind: 'soft-split', zoneNames: ['red', 'cyan'], axis: 'x', feather: 0.2 },
      }],
      routedSceneSequence: {
        scenes: [
          { holdMs: 1000, placements: firstPlacements, transitionOut: { kind: 'wipe', durationMs: 1000 } },
          { holdMs: 1000, placements: secondPlacements },
        ],
      },
      routingPropertyRamps: { splitPosition: { initial: 0.5, ramps: [] } },
      loopDurationMs: 3000,
    }, {})

    expect(artifact.summary.worstInstantRenderersPerPixel).toBe(2)
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 64)
    handle.beforeRender(1500)
    handle.render2D(0, 0.5, 0.4)
    expect(pixel()).toEqual([0, 0.5, 0.5])
  })

  it('matches adaptive preview routing at 16x16, 32x32, and 32x64 independent of wiring order (#507)', () => {
    const zoneIds: [string, string] = ['a', 'b']
    const cases: Array<{
      name: string
      preview: ShowLogicalRouting
      compiled: NonNullable<NonNullable<Parameters<typeof compileShow>[0]['routingLayouts']>[number]['logical']>
    }> = [
      {
        name: 'checker',
        preview: { kind: 'checker', zoneIds, columns: 5, rows: 3 },
        compiled: { kind: 'checker', zoneNames: zoneIds, columns: 5, rows: 3 },
      },
      {
        name: 'rings',
        preview: { kind: 'rings', zoneIds, rings: 6 },
        compiled: { kind: 'rings', zoneNames: zoneIds, rings: 6 },
      },
      {
        name: 'pinwheel',
        preview: { kind: 'pinwheel', zoneIds, arms: 7, twist: 2.1, rotation: 0.3 },
        compiled: { kind: 'pinwheel', zoneNames: zoneIds, arms: 7, twist: 2.1, rotation: 0.3 },
      },
      {
        name: 'wave',
        preview: { kind: 'wave', zoneIds, axis: 'y', bands: 5, amplitude: 0.35, frequency: 2.25, phase: 0.1 },
        compiled: { kind: 'wave', zoneNames: zoneIds, axis: 'y', bands: 5, amplitude: 0.35, frequency: 2.25, phase: 0.1 },
      },
      {
        name: 'soft-split',
        preview: { kind: 'soft-split', zoneIds, axis: 'x', feather: 0.2 },
        compiled: { kind: 'soft-split', zoneNames: zoneIds, axis: 'x', feather: 0.2 },
      },
    ]

    for (const routing of cases) {
      for (const [width, height] of [[16, 16], [32, 32], [32, 64]] as const) {
        const pixelCount = width * height
        const artifact = compileShow({
          clips: zoneIds.map((zone, index) => ({
            id: zone,
            zone,
            source: `export function render2D(index, x, y) { rgb(${index}, x, y) }`,
          })),
          zones: zoneIds.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
          routingLayouts: [{
            id: routing.name,
            name: routing.name,
            zones: zoneIds.map((name, index) => ({ id: name, name, ranges: [{ start: index, end: index }] })),
            logical: routing.compiled,
          }],
          routingSwitches: [],
          routingPropertyRamps: routing.preview.kind === 'soft-split'
            ? { splitPosition: { initial: 0.5, ramps: [] } }
            : undefined,
          loopDurationMs: 1000,
        }, {})
        const { handle, pixel } = loadShow(artifact.code, artifact.metadata, pixelCount)
        handle.beforeRender(16)

        for (let row = 0; row < height; row += 1) {
          for (let column = 0; column < width; column += 1) {
            const x = column / (width - 1)
            const y = row / (height - 1)
            const point = routeShowLogicalPoint(routing.preview, x, y, { splitPosition: 0.5 })
            const zone = zoneIds.indexOf(point.zoneId)
            const expected: [number, number, number] = routing.preview.kind === 'soft-split'
              ? [point.mix!, point.localX, point.localY]
              : [zone, point.localX, point.localY]
            const index = row * width + column
            handle.render2D(index, x, y)
            const actual = pixel()
            for (let channel = 0; channel < 3; channel += 1) {
              if (Math.abs(actual[channel] - expected[channel]) > 1e-9) {
                expect(actual, `${routing.name} ${width}x${height} @ ${column},${row}`).toEqual(expected)
              }
            }

            handle.render2D(pixelCount - 1 - index, x, y)
            expect(pixel(), `${routing.name} must ignore physical wiring index`).toEqual(actual)
          }
        }
      }
    }
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

  it('captures snapshot/live outgoing RGB once and skips its renderer on later transition frames (#516)', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'outgoing',
          source: `
export var renders = 0
export function render(index) {
  renders = renders + 1
  rgb(index / pixelCount, 0, 0)
}
`,
        },
        {
          id: 'incoming',
          source: `
export var renders = 0
export function render(index) {
  renders = renders + 1
  rgb(0, 0, index / pixelCount)
}
`,
        },
      ],
      crossfade: { startMs: 1000, durationMs: 3000, crossfadePolicy: 'snapshot-live' },
      masterPixelCount: 4,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(1500)
    for (let index = 0; index < 4; index += 1) handle.render(index)
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_renders: 4,
      __pxlblz_show_c1_renders: 4,
    })

    handle.beforeRender(500)
    for (let index = 0; index < 4; index += 1) handle.render(index)

    expect(pixel()).toEqual([0.5, 0, 0.25])
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_renders: 4,
      __pxlblz_show_c1_renders: 8,
    })
    expect(artifact.summary.renderTarget.activeRole).toBe('stage-rgb')
    expect(artifact.summary.renderPolicy).toBe('snapshot-outgoing-transition-live-incoming')
  })

  it('falls back explicitly to live/live when snapshot/live has no emitted arena (#516)', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'outgoing',
          source: `
export var renders = 0
export function render(index) { renders = renders + 1; rgb(1, 0, 0) }
`,
        },
        {
          id: 'incoming',
          source: `
export var renders = 0
export function render(index) { renders = renders + 1; rgb(0, 0, 1) }
`,
        },
      ],
      crossfade: { startMs: 1000, durationMs: 3000, crossfadePolicy: 'snapshot-live' },
      masterPixelCount: 4,
    }, {}, { renderTargetArenaEmission: false })
    const { handle } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(1500)
    for (let index = 0; index < 4; index += 1) handle.render(index)
    handle.beforeRender(500)
    for (let index = 0; index < 4; index += 1) handle.render(index)

    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_renders: 8,
      __pxlblz_show_c1_renders: 8,
    })
    expect(artifact.summary.renderTarget.activeRole).toBeNull()
    expect(artifact.summary.renderTargetPlan.decisions).toContainEqual(expect.objectContaining({
      candidateId: 'transition:direct:snapshot-live',
      status: 'rejected',
      reason: 'arena-unavailable',
    }))
    expect(artifact.summary.warnings).toContain(
      'Snapshot/live crossfade fell back to live/live because the Show render-target arena is unavailable.',
    )
  })

  it('invalidates a Scene-sequence snapshot when its transition loops and re-enters (#516)', () => {
    const artifact = compileShow({
      clips: [
        {
          id: 'outgoing',
          source: `
export var renders = 0
export function render(index) { renders = renders + 1; rgb(1, 0, 0) }
`,
        },
        {
          id: 'incoming',
          source: `
export var renders = 0
export function render(index) { renders = renders + 1; rgb(0, 0, 1) }
`,
        },
      ],
      sceneSequence: {
        scenes: [
          {
            clipId: 'outgoing',
            holdMs: 1000,
            transitionOut: {
              kind: 'crossfade',
              durationMs: 1000,
              crossfadePolicy: 'snapshot-live',
            },
          },
          { clipId: 'incoming', holdMs: 1000 },
        ],
      },
      masterPixelCount: 4,
    }, {})
    const { handle } = loadShow(artifact.code, artifact.metadata, 4)

    handle.beforeRender(1500)
    for (let index = 0; index < 4; index += 1) handle.render(index)
    handle.beforeRender(200)
    for (let index = 0; index < 4; index += 1) handle.render(index)
    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_renders: 4,
      __pxlblz_show_c1_renders: 8,
    })

    handle.beforeRender(1000)
    handle.beforeRender(500)
    handle.beforeRender(1000)
    for (let index = 0; index < 4; index += 1) handle.render(index)

    expect(handle.getExports()).toMatchObject({
      __pxlblz_show_c0_renders: 8,
      __pxlblz_show_c1_renders: 12,
    })
    expect(artifact.summary.renderTarget.activeRole).toBe('stage-rgb')
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
      __pxlblz_show_c0_t: 1500 / 65_536,
      __pxlblz_show_c1_t: 2000 / 65_536,
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

  it('preserves Pixelblaze time() periods inside a compiled Show', () => {
    const artifact = compileShow({
      clips: [{
        id: 'clock',
        source: 'export function render(index) { rgb(time(1), 0, 0) }',
      }],
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(32_768)
    handle.render(0)

    // Pixelblaze time(1) has a 65.536-second period.
    expect(pixel()[0]).toBeCloseTo(0.5, 10)
  })

  it('keeps the real Caustics clock at its ordinary Pattern rate inside a Show', () => {
    const artifact = compileShow({
      clips: [{ id: 'caustics', source: DEMOS.Caustics }],
    }, LIBRARIES)
    const { handle } = loadShow(artifact.code, artifact.metadata)

    handle.beforeRender(1_000)

    expect(handle.getExports()).toMatchObject({
      // Caustics: time(0.1) * (0.5 + speed * 3), with speed defaulting to 0.5.
      __pxlblz_show_c0_t: (1_000 / (0.1 * 65_536)) * 2,
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

    expect(paused.pixel()[0]).toBeCloseTo(100 / 65_536)
    expect(paused.pixel()[1]).toBeCloseTo(100)
    expect(paused.pixel()[2]).toBe(3)
    expect(paused.handle.getExports().__pxlblz_show_c0_elapsed_ms).toBeCloseTo(100)
    expect(paused.handle.getExports().__pxlblz_show_c0_elapsed).toBeCloseTo(100)
    expect(paused.handle.getExports()).toMatchObject({
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
    expect(artifact.expandedCode).toContain('__pxlblz_show_c0_sliderSpeed(__pxlblz_show_c0_control_sliderSpeed)')
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
    expect(runtime.pixel()).toEqual([40, 1, 1])
    runtime.handle.beforeRender(35)
    runtime.handle.render(0)
    expect(runtime.pixel()).toEqual([40, 1, 2])
    runtime.handle.beforeRender(30)
    runtime.handle.render(0)
    expect(runtime.pixel()).toEqual([40, 1, 3])
    runtime.handle.beforeRender(195)
    runtime.handle.render(0)

    expect(runtime.pixel()).toEqual([240, 2, 4])
    expect(runtime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 240,
      __pxlblz_show_c0_step_pending_ms: 60,
      __pxlblz_show_c0_elapsed: 240,
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

  it('primes stepped members with one beforeRender at activation before the first render (#663)', () => {
    const artifact = compileShow({
      clips: [{
        id: 'stepped',
        source: `
var scale
export var frames = 0
export function beforeRender(delta) { frames = frames + 1; scale = 2 + frames }
export function render(index) { rgb(scale, frames, index) }
`,
        adaptation: { steppedClock: { stepMs: 100 } },
      }],
    }, {})
    const runtime = loadShow(artifact.code, artifact.metadata)

    runtime.handle.beforeRender(16)
    runtime.handle.render(0)
    expect(runtime.pixel()).toEqual([3, 1, 0])
    runtime.handle.beforeRender(80)
    runtime.handle.render(0)
    expect(runtime.pixel()).toEqual([3, 1, 0])
    runtime.handle.beforeRender(20)
    runtime.handle.render(0)

    expect(runtime.pixel()).toEqual([4, 2, 0])
    expect(runtime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 116,
      __pxlblz_show_c0_step_pending_ms: 0,
      __pxlblz_show_c0_step_primed: 1,
      __pxlblz_show_c0_frames: 2,
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
    heldRuntime.handle.beforeRender(60)

    expect(heldRuntime.handle.getExports()).toMatchObject({
      __pxlblz_show_c0_elapsed_ms: 160,
      __pxlblz_show_c0_step_pending_ms: 20,
      __pxlblz_show_c0_elapsed: 160,
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
      __pxlblz_show_c0_elapsed_ms: 60,
      __pxlblz_show_c0_step_pending_ms: 0,
      __pxlblz_show_c1_elapsed_ms: 60,
      __pxlblz_show_c1_step_pending_ms: 40,
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

    const exports = runtime.handle.getExports()
    expect(exports.__pxlblz_show_c0_elapsed_ms).toBeCloseTo(250)
    expect(exports.__pxlblz_show_c0_step_pending_ms).toBeCloseTo(0)
    expect(exports.__pxlblz_show_c0_step_pending_delta).toBeCloseTo(0)
    expect(exports.__pxlblz_show_c0_elapsed).toBeCloseTo(250)
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
    expect(runtime.pixel()).toEqual([250 / 65_536, 0, 3])
    runtime.handle.beforeRender(50)
    runtime.handle.render(3)
    expect(runtime.pixel()[0]).toBeCloseTo(300 / 65_536)
    expect(runtime.pixel().slice(1)).toEqual([1, 3])
    runtime.handle.beforeRender(50)
    runtime.handle.render(3)
    expect(runtime.pixel()[0]).toBeCloseTo(300 / 65_536)
    expect(runtime.pixel().slice(1)).toEqual([1, 3])
    runtime.handle.beforeRender(50)
    runtime.handle.render(3)

    expect(runtime.pixel()[0]).toBeCloseTo(400 / 65_536)
    expect(runtime.pixel().slice(1)).toEqual([2, 3])
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
    expect(runtime.pixel()[0]).toBeCloseTo(160 / 65_536)
    runtime.handle.beforeRender(60)
    runtime.handle.render(0)

    expect(runtime.pixel()[0]).toBeCloseTo(560 / 65_536)
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
    expect(runtime.pixel()).toEqual([100 / 65_536, 2, 1])
    runtime.handle.render(6)

    expect(runtime.pixel()[0]).toBeCloseTo(350 / 65_536)
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
    expect(artifact.expandedCode).toContain('index / pixelCount < __pxlblz_show_mix')
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_feather_progress')
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
        revealMode: 'grow-incoming',
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
        revealMode: 'grow-incoming',
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
        revealMode: 'grow-incoming',
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
              revealMode: 'grow-incoming',
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
              revealMode: 'shrink-outgoing',
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
    expect(artifact.expandedCode).toContain('__pxlblz_show_elapsed_s = (__pxlblz_show_elapsed_s + delta / 1000) % 5')
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
    expect(handle.getExports().__pxlblz_show_c0_elapsed).toBeCloseTo(225)
    expect(handle.getExports().__pxlblz_show_c0_adapt_timeScale).toBe(1)
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
        centerX: 0.5, centerY: 0.5, feather: 0, revealMode: 'grow-incoming', featherPolicy: 'dither',
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, 0.5, 0.5)
    expect(pixel()).toEqual([0, 0.5, 0.5])
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
    expect(artifact.expandedCode).toContain('max(abs(__pxlblz_show_portal_rx)')
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
    ['cloud', { shape: 'cloud', aspect: 1.4, rotation: 0 }],
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

  it('matches anchored Zoom In plus clockwise Spin in pure and generated sampling (#453)', () => {
    const transition = {
      kind: 'motion' as const, motionVariant: 'zoom-in' as const,
      startMs: 1000, durationMs: 1000, contentScale: 0.25,
      rotation: 0.25, spinDirection: 'clockwise' as const,
      anchorX: 0.25, anchorY: 0.75, addressPolicy: 'clip' as const, edgePolicy: 'hard' as const,
    }
    const artifact = compileShow({
      clips: [
        { id: 'from', source: 'export function render2D(index, x, y) { rgb(1, x, y) }' },
        { id: 'to', source: 'export function render2D(index, x, y) { rgb(0, x, y) }' },
      ],
      routeTransition: transition,
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1250)
    const x = 0.25
    const y = 0.75
    handle.render2D(0, x, y)
    const pure = sampleShowMotionTransition(transition, 0.25, x, y)
    expect(pure.pick).toBe('incoming')
    expect(pixel()[0]).toBe(0)
    expect(pixel()[1]).toBeCloseTo(pure.incoming.x)
    expect(pixel()[2]).toBeCloseTo(pure.incoming.y)
    expect(artifact.summary).toMatchObject({
      transitionCost: 'route', routePolicy: 'motion-selector', worstInstantRenderersPerPixel: 1,
      cost: { cpu: { patternEvaluations: { formula: 'N', basePerPixel: 1 } } },
    })
  })

  it('compiles counterclockwise Zoom Out with Wrap and full blend in scene sequences (#453)', () => {
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
              kind: 'motion', motionVariant: 'zoom-out', durationMs: 1000,
              contentScale: 0.2, rotation: 0.5, spinDirection: 'counterclockwise',
              anchorX: 0.5, anchorY: 0.5, addressPolicy: 'wrap', edgePolicy: 'blend',
            },
          },
          { clipId: 'to', holdMs: 1000 },
        ],
      },
    }, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 16)

    handle.beforeRender(1500)
    handle.render2D(0, 0.25, 0.5)
    expect(pixel().every(Number.isFinite)).toBe(true)
    expect(artifact.summary).toMatchObject({
      transitionCost: 'renderer-window', routePolicy: 'motion-full-blend',
      worstInstantRenderersPerPixel: 2,
      cost: { cpu: {
        patternEvaluations: { formula: '2N', basePerPixel: 2 },
        effects: { addressPolicy: 'wrap', affineScalarOpsPerEvaluatedPixel: 8 },
      } },
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
    expect(artifact.expandedCode).toContain('__pxlblz_show_hash01(floor(index / 8) + 2227)')
    expect(artifact.summary).toMatchObject({
      transitionCost: 'route', worstInstantRenderersPerPixel: 1,
      cost: { cpu: { patternEvaluations: { formula: 'N', basePerPixel: 1 } } },
    })
  })
})

describe('shaped Clip Viewport apertures (#591)', () => {
  /*
    The routed zone grid derives pixel coordinates from the index: 25 pixels
    make a 5x5 grid whose points step by 0.25, so index 11 is (0.25, 0.5),
    index 12 is (0.5, 0.5), index 13 is (0.75, 0.5), index 0 is (0, 0). The
    render2D x/y arguments do not feed the Viewport mask. The `pixelCount`
    global only feeds the density-derived feather default, so tests vary it
    independently of the sampling grid.
  */
  const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 24 }] }]
  const stack = (viewport: Record<string, unknown>, propertyTracks?: unknown[]) => ({
    clips: [
      { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
      { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
    ],
    zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    routedSceneSequence: {
      scenes: [{
        holdMs: 1_000,
        placements: [
          { zoneName: 'main', clipId: 'red', stackOrder: 0 },
          {
            placementId: 'blue-placement',
            zoneName: 'main',
            clipId: 'blue',
            stackOrder: 1,
            viewport,
          },
        ],
        ...(propertyTracks ? { propertyTracks } : {}),
        transitionOut: { kind: 'cut' as const, durationMs: 0 },
      }, {
        holdMs: 1_000,
        placements: [{ zoneName: 'main', clipId: 'red' }],
      }],
    },
    loopDurationMs: 2_000,
  })
  // Frame x 0, y 0, width 0.5, height 1: ellipse center (0.25, 0.5), rx 0.25, ry 0.5.
  const frame = { enabled: true, x: 0, y: 0, width: 0.5, height: 1 }

  it('clips a hard ellipse to the frame-inscribed silhouette', () => {
    const artifact = compileShow(stack({ ...frame, aperture: 'ellipse', edge: 'hard' }) as never, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 25)

    handle.beforeRender(100)
    handle.render2D(11, 0.25, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
    // (0, 0) is inside the rectangular frame corner but outside the ellipse.
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([1, 0, 0])
    // (0.5, 0.5) sits exactly on the boundary, which the hard test includes.
    handle.render2D(12, 0.5, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
  })

  it('feathers the default ellipse edge with a density-derived band', () => {
    const artifact = compileShow(stack({ ...frame, aperture: 'ellipse' }) as never, {})

    // Dense output: 1.5 / sqrt(10000) = 0.015. The boundary blends at 0.5 and
    // one grid step outside (signed 0.25) is fully red.
    const dense = loadShow(artifact.code, artifact.metadata, 10_000)
    dense.handle.beforeRender(100)
    dense.handle.render2D(12, 0.5, 0.5)
    expect(dense.pixel()[2]).toBeCloseTo(0.5, 5)
    dense.handle.render2D(13, 0.75, 0.5)
    expect(dense.pixel()).toEqual([1, 0, 0])

    // Sparse output: 1.5 / sqrt(4) = 0.75. The same outside point now blends:
    // mix = 0.5 - 0.25 / 0.75 = 1/6.
    const sparse = loadShow(artifact.code, artifact.metadata, 4)
    sparse.handle.beforeRender(100)
    sparse.handle.render2D(13, 0.75, 0.5)
    expect(sparse.pixel()[2]).toBeCloseTo(1 / 6, 5)
  })

  it('honors an authored feather width over the density default', () => {
    const artifact = compileShow(stack({ ...frame, aperture: 'ellipse', feather: 0.1 }) as never, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 10_000)

    handle.beforeRender(100)
    handle.render2D(12, 0.5, 0.5)
    expect(pixel()[2]).toBeCloseTo(0.5, 5)
    expect(pixel()[0]).toBeCloseTo(0.5, 5)
    // signed 0.25 overwhelms the authored 0.1 band despite the huge default.
    handle.render2D(13, 0.75, 0.5)
    expect(pixel()).toEqual([1, 0, 0])
  })

  it('feathers a default rectangle with an authored width', () => {
    const artifact = compileShow(stack({ ...frame, feather: 0.1 }) as never, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 25)

    handle.beforeRender(100)
    // The frame's right edge passes through (0.5, 0.5).
    handle.render2D(12, 0.5, 0.5)
    expect(pixel()[2]).toBeCloseTo(0.5, 5)
    handle.render2D(11, 0.25, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
  })

  it('moves the soft ellipse band with an animated frame width', () => {
    const artifact = compileShow(stack(
      { ...frame, width: 0.25, aperture: 'ellipse', feather: 0.02 },
      [{
        id: 'viewport-width',
        target: { kind: 'placement-viewport', placementId: 'blue-placement', property: 'width' },
        keyframes: [
          { id: 'viewport-a', timeMs: 0, value: 0.25, easing: { curve: 'linear' } },
          { id: 'viewport-b', timeMs: 1_000, value: 0.75, easing: { curve: 'linear' } },
        ],
      }],
    ) as never, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 25)

    // t = 500ms: width 0.5, so the ellipse centers at x 0.25 with rx 0.25.
    handle.beforeRender(500)
    handle.render2D(11, 0.25, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render2D(13, 0.75, 0.5)
    expect(pixel()).toEqual([1, 0, 0])
  })

  it('clips catalogue silhouettes through the shared gauge helpers (#690)', () => {
    const artifact = compileShow(stack({ ...frame, aperture: 'heart', edge: 'hard' }) as never, {})
    expect(artifact.expandedCode).toContain('function __pxlblz_show_gauge_heart(')
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 25)

    handle.beforeRender(100)
    handle.render2D(11, 0.25, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([1, 0, 0])
  })

  it('injects dependency-closed gauge helpers exactly when used (#690)', () => {
    const cloud = compileShow(stack({ ...frame, aperture: 'cloud', edge: 'hard' }) as never, {})
    expect(cloud.expandedCode).toContain('function __pxlblz_show_gauge_cloud(')
    expect(cloud.expandedCode).toContain('function __pxlblz_show_gauge_bump(')
    expect(cloud.expandedCode).not.toContain('function __pxlblz_show_gauge_star(')
    const plain = compileShow(stack({ ...frame, aperture: 'ellipse' }) as never, {})
    expect(plain.expandedCode).not.toContain('__pxlblz_show_gauge_')
  })

  it('inverts a star aperture so the silhouette cuts out (#690)', () => {
    const artifact = compileShow(stack({
      ...frame, aperture: 'star', edge: 'hard', invert: true,
    }) as never, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 25)

    handle.beforeRender(100)
    handle.render2D(11, 0.25, 0.5)
    expect(pixel()).toEqual([1, 0, 0])
    handle.render2D(13, 0.75, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
  })

  it('rotates a catalogue aperture inside its frame (#690)', () => {
    // Frame center (0.25, 0.5), rx 0.25, ry 0.5. The unrotated cross arm
    // reaches the frame's right edge at (0.5, 0.5) exactly; an eighth turn in
    // the stretched frame swings the arm off that probe.
    const unrotated = compileShow(stack({
      ...frame, aperture: 'cross', edge: 'hard',
    }) as never, {})
    const rotated = compileShow(stack({
      ...frame, aperture: 'cross', edge: 'hard', rotation: 0.125,
    }) as never, {})

    const straight = loadShow(unrotated.code, unrotated.metadata, 25)
    straight.handle.beforeRender(100)
    straight.handle.render2D(12, 0.5, 0.5)
    expect(straight.pixel()).toEqual([0, 0, 1])

    const eighth = loadShow(rotated.code, rotated.metadata, 25)
    eighth.handle.beforeRender(100)
    eighth.handle.render2D(12, 0.5, 0.5)
    expect(eighth.pixel()).toEqual([1, 0, 0])
  })

  it('rejects unknown aperture shapes, edges, and non-positive feathers', () => {
    expect(() => compileShow(stack({ ...frame, aperture: 'blob' }) as never, {}))
      .toThrow('aperture')
    expect(() => compileShow(stack({ ...frame, edge: 'fuzzy' }) as never, {}))
      .toThrow('aperture')
    expect(() => compileShow(stack({ ...frame, feather: 0 }) as never, {}))
      .toThrow('aperture')
  })

  it('discloses aperture shape, edge, and feather source in the compile summary', () => {
    const shaped = compileShow(stack({ ...frame, aperture: 'ellipse' }) as never, {})
    expect(shaped.summary.specializations.apertures).toEqual([{
      sceneIndex: 0,
      zoneName: 'main',
      placementId: 'blue-placement',
      shape: 'ellipse',
      edge: 'soft',
      feather: 'density-default',
    }])

    const rectangular = compileShow(stack({ ...frame }) as never, {})
    expect(rectangular.summary.specializations.apertures).toEqual([{
      sceneIndex: 0,
      zoneName: 'main',
      placementId: 'blue-placement',
      shape: 'rectangle',
      edge: 'soft',
      feather: 'density-default',
    }])
  })
})

describe('Clip Viewport aperture catalogue (#678)', () => {
  const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 24 }] }]
  const catalogueStack = (viewport: Record<string, unknown>) => ({
    clips: [
      { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
      { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
    ],
    zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    routedSceneSequence: {
      scenes: [{
        holdMs: 1_000,
        placements: [
          { zoneName: 'main', clipId: 'red', stackOrder: 0 },
          { placementId: 'blue-placement', zoneName: 'main', clipId: 'blue', stackOrder: 1, viewport },
        ],
        transitionOut: { kind: 'cut' as const, durationMs: 0 },
      }, {
        holdMs: 1_000,
        placements: [{ zoneName: 'main', clipId: 'red' }],
      }],
    },
    loopDurationMs: 2_000,
  })
  // Frame x 0, y 0, width 0.5, height 1: center (0.25, 0.5), rx 0.25, ry 0.5.
  const frame = { enabled: true, x: 0, y: 0, width: 0.5, height: 1 }

  it('clips a hard diamond to the inscribed rhombus', () => {
    const artifact = compileShow(catalogueStack({ ...frame, aperture: 'diamond', edge: 'hard' }) as never, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 25)

    handle.beforeRender(100)
    handle.render2D(11, 0.25, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
    // Frame corner region: inside the rectangle, outside the rhombus.
    handle.render2D(5, 0, 0.25)
    expect(pixel()).toEqual([1, 0, 0])
    // Midline point halfway to the vertex stays inside.
    handle.render2D(16, 0.25, 0.75)
    expect(pixel()).toEqual([0, 0, 1])
  })

  it('cuts the ring hole and keeps the annulus band', () => {
    const artifact = compileShow(catalogueStack({
      ...frame, aperture: 'ring', ringWidth: 0.5, edge: 'hard',
    }) as never, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 25)

    handle.beforeRender(100)
    // The center falls in the hole.
    handle.render2D(11, 0.25, 0.5)
    expect(pixel()).toEqual([1, 0, 0])
    // The outer boundary belongs to the band.
    handle.render2D(12, 0.5, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
    // The inner boundary (radius 0.5 of unit) also belongs to the band.
    handle.render2D(16, 0.25, 0.75)
    expect(pixel()).toEqual([0, 0, 1])
  })

  it('rounds the box corners away while keeping the faces', () => {
    const artifact = compileShow(catalogueStack({
      ...frame, aperture: 'rounded-box', cornerRadius: 0.5, edge: 'hard',
    }) as never, {})
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 25)

    handle.beforeRender(100)
    handle.render2D(11, 0.25, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
    // The face midpoint stays exactly on the boundary, which hard includes.
    handle.render2D(10, 0, 0.5)
    expect(pixel()).toEqual([0, 0, 1])
    // The square corner is cut off by the radius.
    handle.render2D(0, 0, 0)
    expect(pixel()).toEqual([1, 0, 0])
  })

  it('discloses catalogue shapes and rejects bad band parameters', () => {
    const artifact = compileShow(catalogueStack({ ...frame, aperture: 'ring', ringWidth: 0.5 }) as never, {})
    expect(artifact.summary.specializations.apertures).toEqual([expect.objectContaining({
      shape: 'ring',
      edge: 'soft',
      feather: 'density-default',
    })])
    expect(() => compileShow(catalogueStack({ ...frame, aperture: 'ring', ringWidth: 0 }) as never, {}))
      .toThrow('aperture')
    expect(() => compileShow(catalogueStack({ ...frame, aperture: 'rounded-box', cornerRadius: Number.NaN }) as never, {}))
      .toThrow('aperture')
  })
})

describe('coverage-directed Viewport evaluation (#590, #679)', () => {
  const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 24 }] }]
  const coverageRecipe = (
    viewport: Record<string, unknown>,
    overrides: {
      lowerSource?: string
      topOpacity?: number
      topPresentation?: Record<string, unknown>
      extraPlacement?: Record<string, unknown>
      propertyTracks?: unknown[]
    } = {},
  ) => ({
    clips: [
      {
        id: 'red',
        source: overrides.lowerSource ?? 'export function render2D(index, x, y) { rgb(1, 0, 0) }',
      },
      { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      { id: 'green', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
    ],
    zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    routedSceneSequence: {
      scenes: [{
        holdMs: 1_000,
        placements: [
          { placementId: 'red-placement', zoneName: 'main', clipId: 'red', stackOrder: 0 },
          {
            placementId: 'blue-placement',
            zoneName: 'main',
            clipId: 'blue',
            stackOrder: 1,
            viewport,
            ...(overrides.topOpacity !== undefined ? { opacity: overrides.topOpacity } : {}),
            ...(overrides.topPresentation ? { presentation: overrides.topPresentation } : {}),
          },
          ...(overrides.extraPlacement ? [overrides.extraPlacement] : []),
        ],
        ...(overrides.propertyTracks ? { propertyTracks: overrides.propertyTracks } : {}),
        transitionOut: { kind: 'cut' as const, durationMs: 0 },
      }, {
        holdMs: 1_000,
        placements: [{ zoneName: 'main', clipId: 'red' }],
      }],
    },
    loopDurationMs: 2_000,
  })
  const frame = { enabled: true, x: 0, y: 0, width: 0.5, height: 1 }
  const coverageStatus = (artifact: ReturnType<typeof compileShow>) => (
    artifact.summary.specializations.viewportCoverage?.stacks[0]
  )
  const sweepPixels = (artifact: ReturnType<typeof compileShow>, timeMs: number) => {
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 10_000)
    handle.beforeRender(timeMs)
    return Array.from({ length: 25 }, (_, index) => {
      handle.render2D(index, (index % 5) / 4, Math.floor(index / 5) / 4)
      return pixel()
    })
  }

  it.each([
    ['hard rectangle', { ...frame, edge: 'hard' }],
    ['hard ellipse', { ...frame, aperture: 'ellipse', edge: 'hard' }],
    ['soft ellipse', { ...frame, aperture: 'ellipse', feather: 0.3 }],
    ['dither ellipse', { ...frame, aperture: 'ellipse', edge: 'dither', feather: 0.3 }],
    ['hard ring', { ...frame, aperture: 'ring', ringWidth: 0.5, edge: 'hard' }],
  ] as const)('matches the unoptimized output exactly for a %s aperture', (_name, viewport) => {
    const optimized = compileShow(coverageRecipe(viewport) as never, {})
    const fallback = compileShow(coverageRecipe(viewport) as never, {}, { coverageDirectedComposition: false })

    expect(coverageStatus(optimized)).toMatchObject({ status: 'selected' })
    expect(coverageStatus(fallback)).toMatchObject({ status: 'rejected', reason: 'disabled' })
    expect(optimized.code).not.toBe(fallback.code)
    expect(sweepPixels(optimized, 100)).toEqual(sweepPixels(fallback, 100))
  })

  it('keeps the animated frame equivalent through the coverage branch', () => {
    const tracks = [{
      id: 'viewport-width',
      target: { kind: 'placement-viewport', placementId: 'blue-placement', property: 'width' },
      keyframes: [
        { id: 'a', timeMs: 0, value: 0.25, easing: { curve: 'linear' } },
        { id: 'b', timeMs: 1_000, value: 0.75, easing: { curve: 'linear' } },
      ],
    }]
    const viewport = { ...frame, aperture: 'ellipse', edge: 'hard' }
    const optimized = compileShow(coverageRecipe(viewport, { propertyTracks: tracks }) as never, {})
    const fallback = compileShow(
      coverageRecipe(viewport, { propertyTracks: tracks }) as never,
      {},
      { coverageDirectedComposition: false },
    )
    expect(coverageStatus(optimized)).toMatchObject({ status: 'selected' })
    expect(sweepPixels(optimized, 500)).toEqual(sweepPixels(fallback, 500))
  })

  it('evaluates one Pattern per pixel where coverage selects', () => {
    // The folded ellipse constant appears once inside the branch predicate,
    // against three post-capture opacity multiplications in the fallback.
    const viewport = { ...frame, aperture: 'ellipse', edge: 'hard' }
    const optimized = compileShow(coverageRecipe(viewport) as never, {})
    const fallback = compileShow(coverageRecipe(viewport) as never, {}, { coverageDirectedComposition: false })
    const occurrences = (code: string) => (code.match(/0\.0625/g) ?? []).length
    expect(occurrences(optimized.code)).toBeLessThan(occurrences(fallback.code))
    expect(optimized.code).toMatch(/if \(+.*0\.0625/)
  })

  it('keeps the dither edge pixel-stable across frames', () => {
    const viewport = { ...frame, aperture: 'ellipse', edge: 'dither', feather: 0.4 }
    const artifact = compileShow(coverageRecipe(viewport) as never, {})
    expect(coverageStatus(artifact)).toMatchObject({ status: 'selected', edge: 'dither' })
    const first = sweepPixels(artifact, 100)
    const second = sweepPixels(artifact, 300)
    expect(second).toEqual(first)
    // The band actually dithers: pure top and pure lower both appear inside it.
    const kinds = new Set(first.map(([r, , b]) => `${r},${b}`))
    expect(kinds.has('1,0')).toBe(true)
    expect(kinds.has('0,1')).toBe(true)
  })

  it('preserves every required call for a render-mutating lower layer', () => {
    // The mutating clip encodes its own call count in its red channel. The
    // frame covers columns 0..0.5 (15 of 25 grid pixels); if coverage had
    // incorrectly skipped the covered calls, the final outside pixel would
    // read 10 calls instead of 25.
    const artifact = compileShow(coverageRecipe(
      { ...frame, edge: 'hard' },
      { lowerSource: 'var calls = 0\nexport function render2D(index, x, y) { calls = calls + 1; rgb(calls / 100, 0, 0) }' },
    ) as never, {})
    expect(coverageStatus(artifact)).toMatchObject({
      status: 'rejected',
      reason: 'render-mutating-layer',
    })
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata, 25)
    handle.beforeRender(100)
    let lastOutside: [number, number, number] = [0, 0, 0]
    for (let index = 0; index < 25; index += 1) {
      handle.render2D(index, (index % 5) / 4, Math.floor(index / 5) / 4)
      if (index === 24) lastOutside = pixel()
    }
    expect(lastOutside[0]).toBeCloseTo(0.25, 10)
  })

  it.each([
    ['translucent top', { topOpacity: 0.5 }, 'top-not-opaque'],
    ['Freeze capture top', { topPresentation: { mode: 'freeze' } }, 'presentation-capture'],
    ['three-layer stack', {
      extraPlacement: { placementId: 'green-placement', zoneName: 'main', clipId: 'green', stackOrder: 2 },
    }, 'stack-depth'],
  ] as const)('falls back with an actionable reason for a %s', (_name, overrides, reason) => {
    const artifact = compileShow(coverageRecipe({ ...frame, edge: 'hard' }, overrides) as never, {})
    expect(coverageStatus(artifact)).toMatchObject({ status: 'rejected', reason })
  })
})
