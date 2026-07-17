import { compileShow, type ShowRecipe } from './showCompiler'
import { loadPattern } from './loadPattern'

function pixelRunner(artifact: ReturnType<typeof compileShow>, pixelCount: number) {
  let pixel: [number, number, number] = [0, 0, 0]
  const handle = loadPattern(artifact.code, artifact.metadata, {
    pixelCount,
    PI2: Math.PI * 2,
    rgb: (r: number, g: number, b: number) => { pixel = [r, g, b] },
    hsv: (h: number, s: number, v: number) => { pixel = [h, s, v] },
    abs: Math.abs,
    array: (length: number) => Array.from({ length }, () => 0),
    atan2: Math.atan2,
    ceil: Math.ceil,
    clamp: (value: number, low: number, high: number) => Math.min(Math.max(value, low), high),
    cos: Math.cos,
    floor: Math.floor,
    frac: (value: number) => value - Math.floor(value),
    hypot: Math.hypot,
    max: Math.max,
    min: Math.min,
    sin: Math.sin,
    sqrt: Math.sqrt,
  })
  return { handle, pixel: () => pixel }
}

function routedRecipe(zones: ShowRecipe['zones']): ShowRecipe {
  return {
    masterPixelCount: 8,
    zones,
    clips: zones!.map((zone, index) => ({
      id: zone.name,
      zone: zone.name,
      source: `export function render(index) { rgb(${index + 1}, index, pixelCount) }`,
    })),
  }
}

describe('Show exact routing and capture specialization (#512)', () => {
  it('short-circuits a complete disjoint physical range plan and reports the comparison reduction', () => {
    const artifact = compileShow(routedRecipe([
      { id: 'outer', name: 'outer', ranges: [{ start: 0, end: 1 }, { start: 6, end: 7 }] },
      { id: 'middle', name: 'middle', ranges: [{ start: 2, end: 5 }] },
    ]), {})
    const runtime = pixelRunner(artifact, 8)

    runtime.handle.beforeRender(16)
    runtime.handle.render(7)

    expect(runtime.pixel()).toEqual([1, 3, 4])
    expect(artifact.expandedCode).toContain('if (index <= 1)')
    expect(artifact.expandedCode).toContain('else if (index <= 5)')
    expect(artifact.expandedCode).not.toContain('index >= 6 && index <= 7')
    expect(artifact.summary.specializations.routing).toEqual({
      kind: 'complete-disjoint-short-circuit',
      rangeCount: 3,
      baselineMaxComparisonsPerPixel: 6,
      selectedMaxComparisonsPerPixel: 2,
      maxComparisonsAvoidedPerPixel: 4,
    })
  })

  it('retains ordered first-match routing for overlaps and black output for gaps', () => {
    const overlap = compileShow(routedRecipe([
      { id: 'first', name: 'first', ranges: [{ start: 0, end: 4 }] },
      { id: 'second', name: 'second', ranges: [{ start: 4, end: 7 }] },
    ]), {})
    const gap = compileShow(routedRecipe([
      { id: 'first', name: 'first', ranges: [{ start: 0, end: 2 }] },
      { id: 'second', name: 'second', ranges: [{ start: 4, end: 7 }] },
    ]), {})
    const overlapRuntime = pixelRunner(overlap, 8)
    const gapRuntime = pixelRunner(gap, 8)

    overlapRuntime.handle.beforeRender(16)
    overlapRuntime.handle.render(4)
    gapRuntime.handle.beforeRender(16)
    gapRuntime.handle.render(3)

    expect(overlapRuntime.pixel()).toEqual([1, 4, 5])
    expect(gapRuntime.pixel()).toEqual([0, 0, 0])
    expect(overlap.summary.specializations.routing).toBeNull()
    expect(gap.summary.specializations.routing).toBeNull()
    expect(overlap.expandedCode).toContain('index >= 0 && index <= 4')
    expect(gap.expandedCode).toContain('index >= 4 && index <= 7')
  })

  it('leaves coordinate-predicate routing outside the physical specialization', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 3 }] },
      { id: 'right', name: 'right', ranges: [{ start: 4, end: 7 }] },
    ]
    const recipe = routedRecipe(zones)
    recipe.routingLayouts = [{
      id: 'logical',
      name: 'Logical',
      zones,
      logical: { kind: 'split', zoneNames: ['left', 'right'], axis: 'x' },
    }]
    recipe.routingSwitches = []
    recipe.loopDurationMs = 1000
    const artifact = compileShow(recipe, {})

    expect(artifact.summary.routingRepresentation).toBe('coordinate-predicates')
    expect(artifact.summary.specializations.routing).toBeNull()
    expect(artifact.expandedCode).toContain('__pxlblz_show_route_split_coordinate')
  })

  it('emits the identity capture path without mirror, brightness, or redundant clear work', () => {
    const artifact = compileShow({
      masterPixelCount: 8,
      clips: [{
        id: 'identity',
        source: 'export function render(index) { rgb(index / pixelCount, 0.5, 0.25) }',
      }],
    }, {})

    expect(artifact.expandedCode).not.toContain('var mappedIndex = index')
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_c0_adapt_mirror >= 0.5')
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_c0_r = __pxlblz_show_c0_r * __pxlblz_show_c0_adapt_brightness')
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_c0_clear()\n  __pxlblz_show_c0_render(index)')
    expect(artifact.summary.specializations.capture).toEqual([{
      clipId: 'identity',
      samplePath: 'identity',
      outputPath: 'identity',
      clearPolicy: 'omitted-guaranteed-output',
      operationsAvoidedPerEvaluatedPixel: 7,
    }])
  })

  it('retains clear and output scaling when source or authored semantics require them', () => {
    const conditional = compileShow({
      clips: [{
        id: 'conditional',
        source: 'export function render(index) { if (index > 0) rgb(1, 0, 0) }',
      }],
    }, {})
    const dimmed = compileShow({
      clips: [{
        id: 'dimmed',
        adaptation: { brightness: 0.5, mirror: true },
        source: 'export function render(index) { rgb(1, 0.5, 0.25) }',
      }],
    }, {})

    expect(conditional.expandedCode).toContain('__pxlblz_show_c0_clear()')
    expect(conditional.summary.specializations.capture[0].clearPolicy).toBe('retained')
    expect(dimmed.expandedCode).toContain('__pxlblz_show_c0_adapt_mirror >= 0.5')
    expect(dimmed.expandedCode).toContain('__pxlblz_show_c0_r = __pxlblz_show_c0_r * __pxlblz_show_c0_adapt_brightness')
    expect(dimmed.summary.specializations.capture[0]).toMatchObject({
      samplePath: 'mapped',
      outputPath: 'brightness',
    })
  })

  it('can emit the unspecialized counterfactual for exact visual and hardware comparisons', () => {
    const recipe: ShowRecipe = {
      masterPixelCount: 8,
      clips: [{ id: 'identity', source: 'export function render(index) { rgb(index / pixelCount, 0.5, 0.25) }' }],
    }
    const selected = compileShow(recipe, {})
    const counterfactual = compileShow(recipe, {}, { exactSpecializations: false })

    expect(selected.expandedCode).not.toBe(counterfactual.expandedCode)
    expect(counterfactual.summary.specializations.routing).toBeNull()
    expect(counterfactual.summary.specializations.capture).toEqual([])
  })
})
