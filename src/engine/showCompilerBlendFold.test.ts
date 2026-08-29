import { compileShow, type ShowRecipe } from './showCompiler'
import { loadPattern } from './loadPattern'

function loadShow(code: string, metadata: ReturnType<typeof compileShow>['metadata'], pixelCount = 4) {
  let pixel: [number, number, number] = [0, 0, 0]
  const handle = loadPattern(code, metadata, {
    pixelCount,
    PI2: Math.PI * 2,
    rgb(r: number, g: number, b: number) { pixel = [r, g, b] },
    hsv(h: number, s: number, v: number) { pixel = [h, s, v] },
    abs: Math.abs,
    array(length: number) { return Array.from({ length }, () => 0) },
    ceil: Math.ceil,
    clamp(v: number, lo: number, hi: number) { return Math.min(Math.max(v, lo), hi) },
    floor: Math.floor,
    frac(v: number) { return v - Math.trunc(v) },
    max: Math.max,
    min: Math.min,
    sqrt: Math.sqrt,
  })
  return { handle, pixel: () => pixel }
}

const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 3 }] }]

function stackedRecipe(
  topPlacement: Record<string, unknown>,
  sceneExtras: Record<string, unknown> = {},
  bottomPlacement: Record<string, unknown> = {},
): ShowRecipe {
  return {
    clips: [
      { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
      { id: 'blue', source: 'export function render2D(index, x, y) { rgb(0, 0, 1) }' },
      { id: 'green', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
      {
        id: 'keyedTop',
        source: 'export function render2D(index, x, y) { if (x < 0.5) rgb(0, 0, 0); else rgb(0, 0, 1) }',
        effects: [{ id: 'top-key', kind: 'luma-key', target: 0, tolerance: 0, softness: 0 }],
      },
    ],
    zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 1000,
          placements: [
            { placementId: 'bottom', zoneName: 'main', clipId: 'red', stackOrder: 0, ...bottomPlacement },
            { placementId: 'top', zoneName: 'main', clipId: 'blue', stackOrder: 1, ...topPlacement },
          ],
          transitionOut: { kind: 'crossfade', durationMs: 1000 },
          ...sceneExtras,
        },
        {
          holdMs: 1000,
          placements: [{ placementId: 'solo', zoneName: 'main', clipId: 'green' }],
        },
      ],
    },
    loopDurationMs: 3000,
  }
}

describe('identity-blend fold in routed placement stacks (#904)', () => {
  it('folds the first contributor and keeps later opaque layers exact', () => {
    const artifact = compileShow(stackedRecipe({}), {})
    // The bottom placement writes over the provably-zero accumulator, so it
    // direct-assigns and the initializers become bare declarations. The top
    // opaque layer keeps its blend: in Fast float64 a non-finite lower
    // accumulator must still propagate through `t * 0`.
    expect(artifact.expandedCode).toMatch(/var __pxlblz_show_stack_\d+_r\n/)
    expect(artifact.expandedCode).not.toMatch(/var __pxlblz_show_stack_\d+_r = 0/)
    // Three channels at each of the stack's two emission sites (steady arm
    // and transition from-arm); the bottom layer contributes none.
    expect(artifact.expandedCode.match(/\* \(1\) \+ /g)).toHaveLength(6)

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)
    handle.beforeRender(400)
    handle.render2D(0, 0.25, 0.75)
    expect(pixel()).toEqual([0, 0, 1])
  })

  it('folds a single-placement stack completely', () => {
    const artifact = compileShow({
      clips: [
        { id: 'red', source: 'export function render2D(index, x, y) { rgb(1, 0, 0) }' },
        { id: 'green', source: 'export function render2D(index, x, y) { rgb(0, 1, 0) }' },
      ],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [{ placementId: 'solo-a', zoneName: 'main', clipId: 'red' }],
            transitionOut: { kind: 'crossfade', durationMs: 1000 },
          },
          { holdMs: 1000, placements: [{ placementId: 'solo-b', zoneName: 'main', clipId: 'green' }] },
        ],
      },
      loopDurationMs: 3000,
    }, {})
    expect(artifact.expandedCode).not.toContain('* (1) + ')
    expect(artifact.expandedCode).not.toContain('(1 - (1))')
    expect(artifact.summary.specializations.contentKeys?.fullWeightBlendBypasses ?? 0).toBeGreaterThan(0)
  })

  it('keeps the real blend for a static fractional opacity', () => {
    const artifact = compileShow(stackedRecipe({ opacity: 0.5 }), {})
    expect(artifact.expandedCode).toContain('* (0.5) + ')
    expect(artifact.expandedCode).toContain('(1 - (0.5))')
    // The opaque bottom placement still overwrites first, so the bare
    // declaration remains valid ahead of the top blend's read.
    expect(artifact.expandedCode).toMatch(/var __pxlblz_show_stack_\d+_r\n/)

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)
    handle.beforeRender(400)
    handle.render2D(0, 0.25, 0.75)
    expect(pixel()).toEqual([0.5, 0, 0.5])
  })

  it('excludes content-key stacks from the blend-bypass census', () => {
    const artifact = compileShow(stackedRecipe({
      clipId: 'keyedTop',
    }, {}, {}), {}, {})
    // The keyed stack routes through the content-key emitter, so its opaque
    // bottom never reaches the #904 direct-assignment branch and must not
    // count as a bypass; the second scene's solo placement still does.
    expect(artifact.summary.specializations.contentKeys?.fullWeightBlendBypasses).toBe(1)
  })

  it('reproduces the pre-fold emission under the vintage counterfactual', () => {
    const artifact = compileShow(stackedRecipe({}), {}, { identityBlendFold: false })
    expect(artifact.expandedCode).toContain('* (1) + ')
    expect(artifact.expandedCode).toContain('(1 - (1))')
    expect(artifact.expandedCode).toMatch(/var __pxlblz_show_stack_\d+_r = 0/)
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)
    handle.beforeRender(400)
    handle.render2D(0, 0.25, 0.75)
    expect(pixel()).toEqual([0, 0, 1])
  })

  it('keeps zero initializers when the first contributor blends conditionally', () => {
    const artifact = compileShow(stackedRecipe({}, {
      propertyTracks: [{
        id: 'bottom-opacity',
        target: { kind: 'placement-opacity', placementId: 'bottom' },
        keyframes: [
          { id: 'a', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
          { id: 'b', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } },
        ],
      }],
    }, { opacity: 1 }), {})
    expect(artifact.expandedCode).toMatch(/var __pxlblz_show_stack_\d+_r = 0/)
    // The statically opaque top placement still folds to direct assignment.
    expect(artifact.expandedCode).not.toContain('* (1) + ')

    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)
    handle.beforeRender(400)
    handle.render2D(0, 0.25, 0.75)
    expect(pixel()).toEqual([0, 0, 1])
  })
})
