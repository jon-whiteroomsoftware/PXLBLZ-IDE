import { loadPattern } from './loadPattern'
import { compileShow, type ShowCompileOptions, type ShowRecipe } from './showCompiler'

const ZONES = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 7 }] }]

const EXPENSIVE_PURE_PATTERN = `
export function render(index) {
  var x = index / pixelCount
  var a = sin(x * 6.28318)
  var b = cos(x * 12.56636)
  var c = wave(x + a * 0.125)
  rgb(a * a, b * b, c)
}
`

function repeatedPlacementRecipe(source = EXPENSIVE_PURE_PATTERN): ShowRecipe {
  return {
    masterPixelCount: 8,
    clips: [{ id: 'shared', source }],
    zones: ZONES,
    routingLayouts: [{ id: 'default', name: 'Default', zones: ZONES }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 1000,
          placements: [
            { placementId: 'base', zoneName: 'main', clipId: 'shared', stackOrder: 0 },
            { placementId: 'overlay', zoneName: 'main', clipId: 'shared', stackOrder: 1, opacity: 0.5 },
          ],
          transitionOut: { kind: 'cut', durationMs: 0 },
        },
        {
          holdMs: 1000,
          placements: [{ placementId: 'single', zoneName: 'main', clipId: 'shared' }],
        },
      ],
    },
    loopDurationMs: 2000,
  }
}

function renderFrame(recipe: ShowRecipe, options?: ShowCompileOptions): Array<[number, number, number]> {
  const artifact = compileShow(recipe, {}, options)
  let pixel: [number, number, number] = [0, 0, 0]
  const handle = loadPattern(artifact.code, artifact.metadata, {
    pixelCount: 8,
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
    triangle: (value: number) => {
      const x = value - Math.floor(value)
      return x < 0.5 ? x * 2 : 2 - x * 2
    },
    wave: (value: number) => (1 - Math.cos(value * Math.PI * 2)) / 2,
  })
  handle.beforeRender(16)
  return Array.from({ length: 8 }, (_, index) => {
    handle.render(index)
    return [...pixel] as [number, number, number]
  })
}

describe('Show compatible Pattern output reuse (#518)', () => {
  it('selects one exact frame cache for compatible repeated placements', () => {
    const artifact = compileShow(repeatedPlacementRecipe(), {})

    expect(artifact.summary.specializations.patternOutputReuse).toMatchObject({
      selectedGroupCount: 1,
      evaluationsAvoidedPerFrame: 8,
      additionalArrayWords: 0,
      groups: [{
        sceneIndex: 0,
        zoneName: 'main',
        producerId: 'scene:0:placement:0',
        consumerIds: ['scene:0:placement:0', 'scene:0:placement:1'],
        status: 'selected',
      }],
    })
    expect(artifact.summary.renderTargetPlan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'shared-pattern-output', planes: [0, 1, 2] }),
    ]))
    expect(artifact.expandedCode).toContain('for (var __pxlblz_show_reuse_index = 0;')
    expect(artifact.expandedCode).toContain('__pxlblz_show_rt_plane_0[__pxlblz_show_reuse_index]')
  })

  it('matches independent rendering exactly across the full frame', () => {
    const recipe = repeatedPlacementRecipe()

    expect(renderFrame(recipe)).toEqual(renderFrame(recipe, { patternOutputReuse: false }))
  })

  it('shares one local-index output across equal-size physical Zones', () => {
    const zones = [
      { id: 'left', name: 'left', ranges: [{ start: 0, end: 3 }] },
      { id: 'right', name: 'right', ranges: [{ start: 4, end: 7 }] },
    ]
    const recipe: ShowRecipe = {
      masterPixelCount: 8,
      clips: [{ id: 'shared', source: EXPENSIVE_PURE_PATTERN }],
      zones,
      routingLayouts: [{ id: 'default', name: 'Default', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1000,
            placements: [
              { placementId: 'left-copy', zoneName: 'left', clipId: 'shared' },
              { placementId: 'right-copy', zoneName: 'right', clipId: 'shared' },
            ],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          { holdMs: 1000, placements: [{ zoneName: 'left', clipId: 'shared' }] },
        ],
      },
      loopDurationMs: 2000,
    }
    const artifact = compileShow(recipe, {})

    expect(artifact.summary.specializations.patternOutputReuse).toMatchObject({
      selectedGroupCount: 1,
      evaluationsAvoidedPerFrame: 4,
      groups: [expect.objectContaining({ zoneName: 'left+right', status: 'selected' })],
    })
    expect(renderFrame(recipe)).toEqual(renderFrame(recipe, { patternOutputReuse: false }))
  })

  it('keeps incompatible placement properties on independent rendering', () => {
    const recipe = repeatedPlacementRecipe()
    recipe.routedSceneSequence!.scenes[0].placements[1].brightness = 0.5

    const artifact = compileShow(recipe, {})

    expect(artifact.summary.specializations.patternOutputReuse).toMatchObject({
      selectedGroupCount: 0,
      groups: [],
      excluded: expect.arrayContaining([
        expect.objectContaining({ consumerId: 'scene:0:placement:1', reasons: ['property-values'] }),
      ]),
    })
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_reuse_index')
  })

  it('keeps keyed alpha outputs out of the RGB-only reuse cache (#527)', () => {
    const recipe = repeatedPlacementRecipe()
    recipe.clips[0].effects = [{
      id: 'black-key', kind: 'luma-key', target: 0, tolerance: 0.05, softness: 0.05,
    }]

    const artifact = compileShow(recipe, {})

    expect(artifact.summary.specializations.patternOutputReuse).toMatchObject({
      selectedGroupCount: 0,
      groups: [],
      excluded: expect.arrayContaining([
        expect.objectContaining({ reasons: ['output-alpha'] }),
      ]),
    })
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_reuse_index')
  })

  it('never shares a render function that mutates Pattern state', () => {
    const artifact = compileShow(repeatedPlacementRecipe(`
export var renders = 0
export function render(index) { renders = renders + 1; rgb(renders, index, 0) }
`), {})

    expect(artifact.summary.specializations.patternOutputReuse).toMatchObject({
      selectedGroupCount: 0,
      excluded: expect.arrayContaining([
        expect.objectContaining({ reasons: ['render-mutating-state'] }),
      ]),
    })
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_reuse_index')
  })

  it('declines compatible output when RGB replay costs more than recomputation', () => {
    const artifact = compileShow(repeatedPlacementRecipe(
      'export function render(index) { rgb(1, 0, 0) }',
    ), {})

    expect(artifact.summary.specializations.patternOutputReuse).toMatchObject({
      selectedGroupCount: 0,
      evaluationsAvoidedPerFrame: 0,
      groups: [expect.objectContaining({ status: 'rejected', reason: 'non-profitable' })],
    })
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_reuse_index')
  })

  it('falls back to independent rendering when the arena is disabled', () => {
    const artifact = compileShow(repeatedPlacementRecipe(), {}, { renderTargetArenaEmission: false })

    expect(artifact.summary.specializations.patternOutputReuse).toMatchObject({
      selectedGroupCount: 0,
      groups: [expect.objectContaining({ status: 'rejected', reason: 'arena-unavailable' })],
    })
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_reuse_index')
    expect(renderFrame(repeatedPlacementRecipe(), { renderTargetArenaEmission: false })).toEqual(
      renderFrame(repeatedPlacementRecipe(), { patternOutputReuse: false, renderTargetArenaEmission: false }),
    )
  })
})
