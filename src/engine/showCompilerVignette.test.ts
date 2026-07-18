import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import { loadPattern, nativeDimension } from './loadPattern'
import { compileShow, type ShowCompileOptions, type ShowRecipe } from './showCompiler'

const PIXELS = 16
const SOURCE = 'export function render2D(index, x, y) { rgb(1, 0.5, 0.25) }'

function recipe(): ShowRecipe {
  return {
    masterPixelCount: PIXELS,
    clips: [{
      id: 'clip',
      source: SOURCE,
      effects: [{
        id: 'edge', kind: 'vignette', amount: 1, radius: 0.25,
        softness: 0.25, centerX: 0.5, centerY: 0.5, aspect: 1,
      }],
    }],
  }
}

function runtime(options?: ShowCompileOptions) {
  const artifact = compileShow(recipe(), {}, options)
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

describe('Vignette scalar-field compiler integration (#539)', () => {
  it('selects one exact show-lifetime scalar plane for a static full-stage clip', () => {
    const artifact = compileShow(recipe(), {})

    expect(artifact.summary.specializations.scalarFields).toMatchObject({
      selectedFieldCount: 1,
      operationsAvoidedPerCachedFrame: PIXELS * 16,
      fields: [{
        producerKind: 'vignette',
        coordinateDomain: 'stage-sample-2d',
        status: 'selected',
        reason: 'selected',
        planes: [0],
      }],
    })
    expect(artifact.expandedCode).toContain('__pxlblz_show_rt_plane_0[index]')
    expect(artifact.expandedCode).toContain('hypot(')
    expect(artifact.summary.cost.cpu.effects).toMatchObject({
      colorScalarOpsPerEvaluatedPixel: 16,
      colorSqrtCallsPerEvaluatedPixel: 1,
    })
  })

  it('matches the inline path exactly on both the fill and replay frames', () => {
    const cached = runtime()
    const inline = runtime({ scalarFieldCaching: false })

    expect(cached.frame(16)).toEqual(inline.frame(16))
    expect(cached.frame(16)).toEqual(inline.frame(16))
  })

  it('matches inline output in Fast and Precise replay', () => {
    const cached = compileShow(recipe(), {})
    const inline = compileShow(recipe(), {}, { scalarFieldCaching: false })
    const mapPoints = Array.from({ length: PIXELS }, (_, index) => ({
      sample: [(index % 4) / 3, Math.floor(index / 4) / 3],
    }))
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const replay = (artifact: typeof cached) => createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: nativeDimension(artifact.metadata.renderFns),
      }, { mapPoints, randomSeed: 539, fidelity })
      const cachedRuntime = replay(cached)
      const inlineRuntime = replay(inline)
      expect(cachedRuntime.renderCurrentFrame().checksum).toBe(inlineRuntime.renderCurrentFrame().checksum)
      expect(cachedRuntime.advanceLive(16).checksum).toBe(inlineRuntime.advanceLive(16).checksum)
    }
  })

  it('keeps non-Vignette artifacts byte-identical when scalar caching is toggled', () => {
    const plain: ShowRecipe = { masterPixelCount: PIXELS, clips: [{ id: 'clip', source: SOURCE }] }
    expect(compileShow(plain, {}).code).toBe(compileShow(plain, {}, { scalarFieldCaching: false }).code)
  })

  it('reports animated Vignette properties as an exact inline fallback', () => {
    const animated = recipe()
    animated.adaptationRamp = {
      startMs: 0,
      durationMs: 1_000,
      from: {},
      to: {},
      effectRamps: {
        edge: { amount: { from: 0, to: 1, durationMs: 1_000, easing: 'linear' } },
      },
    }
    const artifact = compileShow(animated, {})

    expect(artifact.summary.specializations.scalarFields.fields).toEqual([
      expect.objectContaining({
        producerKind: 'vignette', status: 'rejected', reason: 'animated-parameter', planes: [],
      }),
    ])
    expect(artifact.expandedCode).not.toContain('__pxlblz_show_scalar_ready_')
    expect(artifact.expandedCode).toContain('hypot(')
  })

  it('falls back inline when the arena is unavailable', () => {
    const cached = runtime({ renderTargetArenaEmission: false })
    const inline = runtime({ renderTargetArenaEmission: false, scalarFieldCaching: false })

    expect(cached.artifact.summary.specializations.scalarFields.fields[0]).toMatchObject({
      status: 'rejected', reason: 'arena-unavailable', planes: [],
    })
    expect(cached.frame(16)).toEqual(inline.frame(16))
  })

  it('reports arena ownership conflicts and keeps the exact inline path', () => {
    const conflicted = recipe()
    conflicted.clips.push({ id: 'incoming', source: SOURCE })
    conflicted.crossfade = {
      startMs: 100,
      durationMs: 1_000,
      crossfadePolicy: 'snapshot-live',
    }
    const artifact = compileShow(conflicted, {})

    expect(artifact.summary.specializations.scalarFields.fields[0]).toMatchObject({
      producerKind: 'vignette',
      status: 'rejected',
      reason: 'insufficient-overlap-capacity',
      planes: [],
    })
    expect(artifact.expandedCode).toContain('hypot(')
  })
})
