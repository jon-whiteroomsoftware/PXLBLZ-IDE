import { loadPattern } from './loadPattern'
import { compileShow, type GeneratedShowArtifact, type ShowCompileOptions, type ShowRecipe } from './showCompiler'

const PIXELS = 20
const PATTERN = `
export function render2D(index, x, y) {
  rgb(x, y, wave(time(0.03) + x - y))
}
`
const zones = Array.from({ length: 5 }, (_, index) => ({
  id: `zone-${index}`,
  name: `surface-${index}`,
  ranges: [{ start: index * 4, end: index * 4 + 3 }],
}))
const placements = (scene: number) => zones.map((zone, index) => ({
  placementId: `scene-${scene}-placement-${index}`,
  zoneName: zone.name,
  clipId: 'pattern',
  mirror: index % 2 === 1,
  effects: [
    { id: 'rotate', kind: 'rotate' as const, turns: (scene + index) / 16 },
    { id: 'scale', kind: 'scale' as const, x: 0.8 + index * 0.025, y: 0.9 },
    { id: 'wrap', kind: 'wrap' as const },
  ],
}))

function recipe(holdMs = 1_000): ShowRecipe {
  return {
    masterPixelCount: PIXELS,
    clips: [{
      id: 'pattern',
      source: PATTERN,
      effects: [
        { id: 'rotate', kind: 'rotate', turns: 0 },
        { id: 'scale', kind: 'scale', x: 1, y: 1 },
        { id: 'wrap', kind: 'wrap' },
      ],
    }],
    zones,
    routingLayouts: [{ id: 'stage', name: 'Five-surface stage', zones }],
    routedSceneSequence: {
      scenes: [
        { holdMs, placements: placements(0), transitionOut: { kind: 'cut', durationMs: 0 } },
        { holdMs, placements: placements(1) },
      ],
    },
    loopDurationMs: holdMs * 2,
  }
}

function runtime(artifact: GeneratedShowArtifact) {
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
  return (delta: number) => {
    handle.beforeRender(delta)
    return Array.from({ length: PIXELS }, (_, index) => {
      handle.render2D(index, (index % 5) / 4, Math.floor(index / 5) / 3)
      return [...pixel] as [number, number, number]
    })
  }
}

const compile = (options: ShowCompileOptions) => compileShow(recipe(), {}, options)

describe('Show coordinate-field compiler integration (#528)', () => {
  it('plans scene-lifetime X/Y pairs on the existing arena with no extra arrays', () => {
    const artifact = compile({ coordinateFieldCaching: true })

    expect(artifact.summary.specializations.coordinateFields).toMatchObject({
      selectedFieldCount: 2,
      additionalArrayWords: 0,
      fields: [
        expect.objectContaining({ status: 'selected', planes: [0, 1], consumerCount: 5 }),
        expect.objectContaining({ status: 'selected', planes: [0, 1], consumerCount: 5 }),
      ],
    })
    expect(artifact.summary.renderTargetPlan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'sample-xy', planes: [0, 1] }),
    ]))
    expect(artifact.expandedCode).toContain('var __pxlblz_show_coord_owner = -1')
    expect(artifact.expandedCode).toContain('__pxlblz_show_rt_plane_0[index] = __pxlblz_show_coord_x')
    expect(artifact.expandedCode).toContain('__pxlblz_show_coord_x = __pxlblz_show_rt_plane_0[index]')
    expect(artifact.expandedCode).toContain('__pxlblz_show_rt_plane_1[index] = __pxlblz_show_coord_y')
  })

  it('matches the direct path on fill, replay, invalidation, and second-scene replay frames', () => {
    const cached = runtime(compile({ coordinateFieldCaching: true }))
    const direct = runtime(compile({ coordinateFieldCaching: false }))

    for (const delta of [100, 16, 900, 16]) {
      expect(cached(delta)).toEqual(direct(delta))
    }
  })

  it('declines a one-frame field as non-profitable', () => {
    const artifact = compileShow(recipe(1), {}, { coordinateFieldCaching: true })

    expect(artifact.summary.specializations.coordinateFields.fields).toEqual([
      expect.objectContaining({ status: 'rejected', reason: 'non-profitable' }),
      expect.objectContaining({ status: 'rejected', reason: 'non-profitable' }),
    ])
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_coord_owner')
  })

  it('falls back exactly when the arena is unavailable', () => {
    const cachedArtifact = compile({ coordinateFieldCaching: true, renderTargetArenaEmission: false })
    const directArtifact = compile({ coordinateFieldCaching: false, renderTargetArenaEmission: false })
    const cached = runtime(cachedArtifact)
    const direct = runtime(directArtifact)

    expect(cachedArtifact.summary.specializations.coordinateFields.fields[0]).toMatchObject({
      status: 'rejected',
      reason: 'arena-unavailable',
    })
    expect(cached(100)).toEqual(direct(100))
    expect(cached(16)).toEqual(direct(16))
  })
})
