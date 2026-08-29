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

function crossfadeRecipe(secondPlacements: Array<Record<string, unknown>>): ShowRecipe {
  return {
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
          placements: [{ placementId: 'first', zoneName: 'main', clipId: 'red' }],
          transitionOut: { kind: 'crossfade', durationMs: 1000 },
        },
        { holdMs: 1000, placements: secondPlacements as never },
      ],
    },
    loopDurationMs: 3000,
  }
}

describe('per-pixel dedupe in generated transition arms and wrappers (#905)', () => {
  it('shares one decode and coordinate pair across a same-domain transition', () => {
    const artifact = compileShow(crossfadeRecipe([
      { placementId: 'second', zoneName: 'main', clipId: 'blue' },
    ]), {})
    expect(artifact.expandedCode).not.toContain('_to_index')
    expect(artifact.expandedCode).not.toContain('_to_x')
    expect(artifact.expandedCode).toMatch(/if \(__pxlblz_show_scene_zone_\d+_from_index >= 0\) \{/)

    // Mid-crossfade at t=1500 ms the blend weight is 0.5: red -> blue.
    const { handle, pixel } = loadShow(artifact.code, artifact.metadata)
    handle.beforeRender(1500)
    handle.render2D(0, 0.25, 0.75)
    const [r, , b] = pixel()
    expect(r).toBeCloseTo(0.5, 5)
    expect(b).toBeCloseTo(0.5, 5)
  })

  it('reproduces the dual-decode emission under the vintage counterfactual, with identical output', () => {
    const recipe = crossfadeRecipe([{ placementId: 'second', zoneName: 'main', clipId: 'blue' }])
    const deduped = compileShow(recipe, {}, {})
    const counterfactual = compileShow(recipe, {}, { perPixelDedup: false })
    expect(counterfactual.expandedCode).toContain('_to_index')
    expect(counterfactual.expandedCode).toMatch(/if \(__pxlblz_show_scene_zone_\d+_from_index >= 0 && __pxlblz_show_scene_zone_\d+_to_index >= 0\) \{/)

    for (const timeMs of [400, 1250, 1500, 1900]) {
      const a = loadShow(deduped.code, deduped.metadata)
      const b = loadShow(counterfactual.code, counterfactual.metadata)
      a.handle.beforeRender(timeMs)
      b.handle.beforeRender(timeMs)
      a.handle.render2D(1, 0.5, 0.5)
      b.handle.render2D(1, 0.5, 0.5)
      expect(a.pixel(), `t=${timeMs}`).toEqual(b.pixel())
    }
  })

  it('writes member RGB straight to the wrapper globals for a direct solo placement', () => {
    const artifact = compileShow(crossfadeRecipe([
      { placementId: 'second', zoneName: 'main', clipId: 'blue' },
    ]), {})
    // No pass-through capture accumulators anywhere in the artifact.
    expect(artifact.expandedCode).not.toContain('_capture_r')
  })

  it('keeps the generic capture path for a stacked wrapper', () => {
    const artifact = compileShow(crossfadeRecipe([
      { placementId: 'second', zoneName: 'main', clipId: 'blue', stackOrder: 0 },
      { placementId: 'third', zoneName: 'main', clipId: 'green', stackOrder: 1, opacity: 0.5 },
    ]), {})
    expect(artifact.expandedCode).toContain('_capture_r')
  })
})
