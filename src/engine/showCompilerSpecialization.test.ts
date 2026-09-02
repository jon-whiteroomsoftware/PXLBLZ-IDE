import { compileShow, type ShowRecipe } from './showCompiler'
import { loadPattern } from './loadPattern'
import { DEMOS } from '@/pixelblaze/stock/patterns'

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

/** The inlined form of the per-pixel clear (#929): the member's channel
 * globals reset in place, immediately before the member render call. */
const INLINED_CLEAR_BEFORE_MEMBER_RENDER = [
  '__pxlblz_show_c0_r = 0',
  '__pxlblz_show_c0_g = 0',
  '__pxlblz_show_c0_b = 0',
  '__pxlblz_show_c0_render(index)',
].join('\n  ')

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
    // #938: with the clear omitted, the exported render enters the member
    // render directly; nothing resets the channels first. The uncalled
    // wrapper declaration may still be emitted; the render body is the oracle.
    expect(artifact.expandedCode).not.toContain(INLINED_CLEAR_BEFORE_MEMBER_RENDER)
    expect(artifact.expandedCode).toContain('export function render(index) {\n  __pxlblz_show_c0_render(index)\n')
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

    // #929 inlines the trivial clear wrapper at its only call site, so the
    // retained clear is the three channel resets immediately before the
    // member render call rather than a `_clear()` call (#938).
    expect(conditional.summary.specializations.wrapperInlining.selected).toBe(true)
    expect(conditional.expandedCode).toContain(INLINED_CLEAR_BEFORE_MEMBER_RENDER)
    expect(conditional.summary.specializations.capture[0].clearPolicy).toBe('retained')
    // #562 replaced the per-pixel mirror branch with the branch-free
    // per-frame coefficient form; the authored mirror still applies.
    expect(dimmed.expandedCode).toContain('__pxlblz_show_c0_mir_base_i + __pxlblz_show_c0_mir_sign * index')
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

  it('hoists proven frame-only Pattern arithmetic after the member beforeRender call', () => {
    const recipe: ShowRecipe = {
      masterPixelCount: 2_000,
      clips: [{
        id: 'frame-math',
        source: `
          var energy = 0
          export function beforeRender(delta) { energy = delta / 1000 }
          function field(x) {
            var density = 4 + floor(energy * 10)
            return x * density
          }
          export function render2D(index, x, y) {
            var punctuation = energy > 0.5
            rgb(field(x), y, punctuation)
          }
        `,
      }],
    }
    const selected = compileShow(recipe, {})
    const counterfactual = compileShow(recipe, {}, { frameInvariantHoisting: false })
    const selectedRuntime = pixelRunner(selected, 8)
    const counterfactualRuntime = pixelRunner(counterfactual, 8)

    selectedRuntime.handle.beforeRender(750)
    counterfactualRuntime.handle.beforeRender(750)
    selectedRuntime.handle.render2D(3, 0.25, 0.6)
    counterfactualRuntime.handle.render2D(3, 0.25, 0.6)

    expect(selectedRuntime.pixel()).toEqual(counterfactualRuntime.pixel())
    expect(selected.expandedCode).toContain('__pxlblz_show_c0___pxlblz_frame_update()')
    expect(selected.expandedCode.indexOf('__pxlblz_show_c0_beforeRender(scaledDelta)'))
      .toBeLessThan(selected.expandedCode.indexOf('__pxlblz_show_c0___pxlblz_frame_update()'))
    expect(selected.summary.specializations.frameInvariants).toEqual([expect.objectContaining({
      clipId: 'frame-math',
      candidateCount: 2,
      selectedCount: 2,
      operationsAvoidedPerEvaluatedPixel: 4,
    })])
    expect(counterfactual.summary.specializations.frameInvariants[0].selectedCount).toBe(0)
  })

  it('does not hoist private state that a render path mutates', () => {
    const artifact = compileShow({
      masterPixelCount: 2_000,
      clips: [{
        id: 'stateful',
        source: `
          var accumulator = 0
          function field() {
            accumulator = accumulator + 1
            var changing = accumulator * 2
            return changing
          }
          export function render(index) { rgb(field(), 0, 0) }
        `,
      }],
    }, {})

    expect(artifact.summary.specializations.frameInvariants[0]).toMatchObject({
      candidateCount: 0,
      selectedCount: 0,
      operationsAvoidedPerEvaluatedPixel: 0,
    })
    expect(artifact.expandedCode).not.toContain('__pxlblz_frame_update')
  })

  it.each(['AuroraSphere', 'PendulumWave'] as const)(
    'selects frame invariants for the unrelated %s Pattern family',
    (patternId) => {
      const artifact = compileShow({
        masterPixelCount: 1_000,
        clips: [{ id: patternId, source: DEMOS[patternId] }],
      }, {})

      expect(artifact.summary.specializations.frameInvariants[0]).toMatchObject({
        clipId: patternId,
        selectedCount: expect.any(Number),
      })
      expect(artifact.summary.specializations.frameInvariants[0].selectedCount).toBeGreaterThan(0)
    },
  )

  it('enforces the frame-hoist byte allowance against actual emitted source', () => {
    const declarations = Array.from({ length: 12 }, (_, index) => (
      `var invariant${index} = energy * 1 + energy * 2 + energy * 3 + energy * 4`
    )).join('\n')
    const artifact = compileShow({
      masterPixelCount: 2_000,
      clips: [{
        id: 'byte-boundary',
        source: `
          var energy = 0
          export function beforeRender(delta) { energy = delta / 1000 }
          export function render(index) {
            ${declarations}
            rgb(invariant0, invariant5, invariant11)
          }
        `,
      }],
    }, {})

    const summary = artifact.summary.specializations.frameInvariants[0]
    expect(summary.selectedCount).toBeGreaterThan(0)
    expect(summary.selectedCount).toBeLessThan(summary.candidateCount)
    expect(summary.addedSourceBytes).toBeLessThanOrEqual(1_024)
  })
})
