// #558: generated color-effect lines must not recompute frame-invariant
// coefficients per pixel. Animated members recompute them once per frame in
// the member's fx_update hook; static members initialize them once at pattern
// load (device arithmetic, so the values are exact by construction).
import { createFastReplayRuntime } from './fastReplay'
import {
  compileShow,
  type GeneratedShowArtifact,
  type ShowClipEffect,
  type ShowRecipe,
} from './showCompiler'

const SOURCE = 'export function render(index) { hsv(index / pixelCount, 1, 0.8) }'
const stageZone = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: 63 }] }

function effectRecipe(effects: ShowClipEffect[], options: { animate?: boolean } = {}): ShowRecipe {
  return {
    clips: [
      { id: 'first', source: SOURCE, effects },
      { id: 'second', source: SOURCE },
    ],
    zones: [stageZone],
    routingLayouts: [{ id: 'stage', name: 'stage', zones: [stageZone] }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 10_000,
          placements: [{ placementId: 'p0', zoneName: 'stage', clipId: 'first', effects }],
          ...(options.animate
            ? {
                propertyTracks: [{
                  id: 'track-0',
                  target: {
                    kind: 'placement-effect' as const,
                    placementId: 'p0',
                    effectId: effects[0].id,
                    effectKind: effects[0].kind,
                    parameterId: animatedParameter(effects[0]),
                  },
                  keyframes: [
                    { id: 'start', timeMs: 0, value: 0.1, easing: { curve: 'linear' as const } },
                    { id: 'end', timeMs: 10_000, value: 0.9, easing: { curve: 'linear' as const } },
                  ],
                }],
              }
            : {}),
          transitionOut: { kind: 'crossfade', durationMs: 2_000 },
        },
        {
          holdMs: 10_000,
          placements: [{ placementId: 'p1', zoneName: 'stage', clipId: 'second' }],
        },
      ],
    },
    loopDurationMs: 22_000,
  }
}

function animatedParameter(effect: ShowClipEffect): string {
  if (effect.kind === 'hue') return 'turns'
  if (effect.kind === 'posterize' || effect.kind === 'invert' || effect.kind === 'threshold') return 'amount'
  if (effect.kind === 'chroma-key') return 'tolerance'
  return 'amount'
}

/** Per-pixel effect lines are indented inside the render wrapper; top-level
 * coefficient declarations start at column zero and are excluded. */
function perPixelLines(artifact: GeneratedShowArtifact): string[] {
  return artifact.expandedCode
    .split('\n')
    .filter((line) => /^\s+var __pxlblz_show_c0_fx_color_/.test(line) && line !== line.trimStart())
}

describe('frame-invariant color-effect coefficient hoisting (#558)', () => {
  it('hoists animated hue-rotate trig into the per-frame update', () => {
    const artifact = compileShow(effectRecipe([{ id: 'fx', kind: 'hue', turns: 0.25 }], { animate: true }), {})
    const code = artifact.expandedCode
    // Coefficients are globals now, recomputed once per frame.
    expect(code).toMatch(/var __pxlblz_show_c0_fx_color_0_cos = /)
    expect(code).toMatch(/function __pxlblz_show_c0_fx_update\(\) \{[\s\S]*?__pxlblz_show_c0_fx_color_0_cos = cos\(/)
    // No per-pixel local recomputation of any coefficient.
    const locals = perPixelLines(artifact)
    expect(locals.filter((line) => /_(cos|sin|third|cross|diagonal) =/.test(line))).toEqual([])
    // The pixel-dependent r/g/b copies stay per pixel.
    expect(locals.some((line) => /_fx_color_0_r = /.test(line))).toBe(true)
    // The matrix apply still references the coefficients by name.
    expect(code).toContain('__pxlblz_show_c0_fx_color_0_diagonal * __pxlblz_show_c0_fx_color_0_r')
  })

  it('initializes static hue-rotate coefficients once at load with device arithmetic', () => {
    // Routed placements can always override parameters, so a truly static
    // member needs the non-routed crossfade path.
    const artifact = compileShow({
      clips: [
        { id: 'first', source: SOURCE, effects: [{ id: 'fx', kind: 'hue', turns: 0.25 }] },
        { id: 'second', source: SOURCE },
      ],
      crossfade: { startMs: 5_000, durationMs: 2_000 },
    }, {})
    const code = artifact.expandedCode
    expect(code).toContain('var __pxlblz_show_c0_fx_color_0_cos = cos(0.25 * 6.283185307179586)')
    expect(perPixelLines(artifact).filter((line) => /_(cos|sin|third|cross|diagonal) =/.test(line))).toEqual([])
    // Static members get no update function.
    expect(code).not.toContain('function __pxlblz_show_c0_fx_update')
  })

  it('keeps routed placement-driven members animated with per-frame coefficient refresh', () => {
    const artifact = compileShow(effectRecipe([{ id: 'fx', kind: 'hue', turns: 0.25 }]), {})
    const code = artifact.expandedCode
    // Placement overrides make the member animated; coefficients still hoist.
    expect(code).toMatch(/function __pxlblz_show_c0_fx_update\(\) \{[\s\S]*?__pxlblz_show_c0_fx_color_0_cos = cos\(/)
    expect(perPixelLines(artifact).filter((line) => /_(cos|sin|third|cross|diagonal) =/.test(line))).toEqual([])
  })

  it('hoists chroma-key tolerances and the matte denominator', () => {
    const artifact = compileShow(
      effectRecipe([{ id: 'fx', kind: 'chroma-key', color: '#00ff00', tolerance: 0.3, softness: 0.2 }], { animate: true }),
      {},
    )
    const code = artifact.expandedCode
    expect(code).toMatch(/var __pxlblz_show_c0_fx_color_0_inner2 = /)
    expect(code).toMatch(/var __pxlblz_show_c0_fx_color_0_denominator = /)
    const locals = perPixelLines(artifact)
    expect(locals.filter((line) => /_(inner2|outer|denominator) =/.test(line))).toEqual([])
    expect(code).toContain('/ __pxlblz_show_c0_fx_color_0_denominator, 0, 1)')
  })

  it('hoists posterize span and the keep factor', () => {
    const artifact = compileShow(
      effectRecipe([{ id: 'fx', kind: 'posterize', levels: 6, amount: 0.8 }], { animate: true }),
      {},
    )
    const code = artifact.expandedCode
    expect(code).toMatch(/var __pxlblz_show_c0_fx_color_0_span = /)
    expect(code).toMatch(/var __pxlblz_show_c0_fx_color_0_keep = /)
    expect(perPixelLines(artifact).filter((line) => /_(span|keep) =/.test(line))).toEqual([])
    expect(code).not.toMatch(/_r \* \(1 - __pxlblz_show_c0_fx_p0_amount\)/)
  })

  it('hoists the invert and threshold keep factors', () => {
    for (const effect of [
      { id: 'fx', kind: 'invert' as const, amount: 0.5 },
      { id: 'fx', kind: 'threshold' as const, threshold: 0.4, amount: 0.6 },
    ]) {
      const artifact = compileShow(effectRecipe([effect], { animate: true }), {})
      expect(artifact.expandedCode).toMatch(/var __pxlblz_show_c0_fx_color_0_keep = /)
      expect(artifact.expandedCode).not.toMatch(/\(1 - __pxlblz_show_c0_fx_p0_amount\)/)
    }
  })

  it('emits no coefficient globals for members without color effects', () => {
    const artifact = compileShow(effectRecipe([{ id: 'fx', kind: 'scale', x: 0.8, y: 0.9 }]), {})
    expect(artifact.expandedCode).not.toContain('_fx_color_')
  })

  it('replays animated effects deterministically across scene and ramp boundaries', () => {
    const recipe = effectRecipe([{ id: 'fx', kind: 'hue', turns: 0 }], { animate: true })
    const artifact = compileShow(recipe, {})
    const times = [0, 2_500, 7_500, 10_500, 11_900, 15_000, 21_500]
    const run = () => {
      const replay = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: 1,
      }, {
        mapPoints: Array.from({ length: 64 }, (_, index) => ({ sample: [index / 63] })),
        randomSeed: 558,
        fidelity: 'fast' as const,
      })
      return times.map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
    }
    const first = run()
    expect(run()).toEqual(first)
    expect(new Set(first).size).toBeGreaterThan(1)
  })
})
