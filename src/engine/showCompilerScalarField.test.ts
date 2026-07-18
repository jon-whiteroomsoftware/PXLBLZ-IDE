import { loadPattern } from './loadPattern'
import { compileShow, type ShowCompileOptions, type ShowRecipe } from './showCompiler'

const PIXELS = 16
const PATTERN_A = 'export function render2D(index, x, y) { rgb(x, y, 0.125) }'
const PATTERN_B = 'export function render2D(index, x, y) { rgb(1 - x, 1 - y, 0.875) }'

function dissolveRecipe(durationMs = 1_500): ShowRecipe {
  return {
    masterPixelCount: PIXELS,
    clips: [
      { id: 'from', source: PATTERN_A },
      { id: 'to', source: PATTERN_B },
    ],
    routeTransition: {
      kind: 'dither',
      dissolveVariant: 'soft-threshold',
      startMs: 100,
      durationMs,
      seed: 3,
      scale: 6,
      softness: 0.2,
      edgePolicy: 'blend',
    },
  }
}

function runtime(recipe: ShowRecipe, options?: ShowCompileOptions) {
  const artifact = compileShow(recipe, {}, options)
  let pixel: [number, number, number] = [0, 0, 0]
  const handle = loadPattern(artifact.code, artifact.metadata, {
    pixelCount: PIXELS,
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
  const frame = (delta: number) => {
    handle.beforeRender(delta)
    return Array.from({ length: PIXELS }, (_, index) => {
      const x = (index % 4) / 3
      const y = Math.floor(index / 4) / 3
      handle.render2D(index, x, y)
      return [...pixel] as [number, number, number]
    })
  }
  return { artifact, frame }
}

describe('Show scalar-field compiler integration (#519)', () => {
  it('plans an exact coherent-noise field on one arena plane', () => {
    const artifact = compileShow(dissolveRecipe(), {})

    expect(artifact.summary.specializations.scalarFields).toMatchObject({
      selectedFieldCount: 1,
      operationsAvoidedPerCachedFrame: 768,
      additionalArrayWords: 0,
      fields: [{
        producerKind: 'coherent-noise-2d',
        coordinateDomain: 'stage-sample-2d',
        status: 'selected',
        planes: [0],
        compatibleConsumerIds: ['outgoing-mask', 'incoming-mask'],
      }],
    })
    expect(artifact.summary.renderTargetPlan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'scalar-field', planes: [0] }),
    ]))
    expect(artifact.expandedCode).toContain('var __pxlblz_show_scalar_owner_0 = -1')
    expect(artifact.expandedCode).toContain('__pxlblz_show_rt_plane_0[index] = __pxlblz_show_dissolve_field')
    expect(artifact.expandedCode).toContain('__pxlblz_show_dissolve_field = __pxlblz_show_rt_plane_0[index]')
  })

  it('matches uncached output exactly on the production frame and cached replay frame', () => {
    const cached = runtime(dissolveRecipe())
    const direct = runtime(dissolveRecipe(), { scalarFieldCaching: false })

    expect(cached.frame(500)).toEqual(direct.frame(500))
    expect(cached.frame(16)).toEqual(direct.frame(16))
  })

  it('declines a one-frame field as non-profitable and reports the decision', () => {
    const artifact = compileShow(dissolveRecipe(1), {})

    expect(artifact.summary.specializations.scalarFields).toMatchObject({
      selectedFieldCount: 0,
      fields: [expect.objectContaining({ status: 'rejected', reason: 'non-profitable' })],
    })
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_scalar_owner_0')
  })

  it('falls back exactly when the arena is unavailable', () => {
    const cached = runtime(dissolveRecipe(), { renderTargetArenaEmission: false })
    const direct = runtime(dissolveRecipe(), {
      renderTargetArenaEmission: false,
      scalarFieldCaching: false,
    })

    expect(cached.artifact.summary.specializations.scalarFields.fields[0]).toMatchObject({
      status: 'rejected',
      reason: 'arena-unavailable',
    })
    expect(cached.frame(500)).toEqual(direct.frame(500))
    expect(cached.frame(16)).toEqual(direct.frame(16))
  })

  it('releases and reuses one physical plane across non-overlapping field lifetimes', () => {
    const transition = (seed: number) => ({
      kind: 'dither' as const,
      dissolveVariant: 'coherent-noise' as const,
      durationMs: 1_000,
      seed,
      scale: 5,
    })
    const artifact = compileShow({
      masterPixelCount: PIXELS,
      clips: [
        { id: 'a', source: PATTERN_A },
        { id: 'b', source: PATTERN_B },
        { id: 'c', source: 'export function render2D(index, x, y) { rgb(y, 0.5, x) }' },
      ],
      sceneSequence: {
        scenes: [
          { clipId: 'a', holdMs: 200, transitionOut: transition(1) },
          { clipId: 'b', holdMs: 200, transitionOut: transition(2) },
          { clipId: 'c', holdMs: 200 },
        ],
      },
    }, {})

    expect(artifact.summary.specializations.scalarFields.fields).toEqual([
      expect.objectContaining({ status: 'selected', planes: [0] }),
      expect.objectContaining({ status: 'selected', planes: [0] }),
    ])
    expect(artifact.expandedCode.match(/var __pxlblz_show_scalar_owner_0 = -1/g)).toHaveLength(1)
    expect(artifact.expandedCode).toContain('__pxlblz_show_scalar_owner_0 != 1')
    expect(artifact.expandedCode).toContain('__pxlblz_show_scalar_owner_0 != 2')
  })

  it('removes repeated field geometry from a Redline-derived five-surface transition', () => {
    const zones = Array.from({ length: 5 }, (_, index) => ({
      id: `zone-${index}`,
      name: `surface-${index}`,
      ranges: [{ start: index * 4, end: index * 4 + 3 }],
    }))
    const placements = (clipId: string) => zones.map((zone, index) => ({
      placementId: `${clipId}-${index}`,
      zoneName: zone.name,
      clipId,
    }))
    const artifact = compileShow({
      masterPixelCount: 20,
      clips: [
        { id: 'redline-a', source: PATTERN_A },
        { id: 'redline-b', source: PATTERN_B },
      ],
      zones,
      routingLayouts: [{ id: 'redline-stage', name: 'Redline stage', zones }],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 250,
            placements: placements('redline-a'),
            transitionOut: {
              kind: 'dither',
              dissolveVariant: 'soft-threshold',
              durationMs: 1_500,
              seed: 7,
              scale: 8,
              softness: 0.15,
            },
          },
          { holdMs: 250, placements: placements('redline-b') },
        ],
      },
      loopDurationMs: 2_000,
    }, {})

    expect(artifact.summary.specializations.scalarFields).toMatchObject({
      selectedFieldCount: 1,
      operationsAvoidedPerCachedFrame: 960,
      fields: [{ status: 'selected', planes: [0] }],
    })
    expect(artifact.expandedCode).toContain('__pxlblz_show_rt_plane_0[index] = __pxlblz_show_dissolve_field')
  })
})
