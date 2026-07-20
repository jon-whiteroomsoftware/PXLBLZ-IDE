// #571: per-pixel placement-prologue rebinding elimination. The scheduler's
// per-frame setup entry already writes adaptation values, effect parameters,
// and placement track values before the member's advance call; for members
// whose binding is provably uniform per frame the per-pixel re-assignments
// (~1.47 us each, #532/#556) are pure redundancy. Members with divergent
// per-arm values keep the per-pixel binding byte-for-byte.
import { createFastReplayRuntime } from './fastReplay'
import { compileShow, type ShowRecipe } from './showCompiler'

const SOURCE = 'export function render(index) { hsv(index / pixelCount, 1, 0.8) }'
const stageZone = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: 63 }] }

interface FixtureOverrides {
  effects?: Array<Record<string, unknown>>
  animateTrack?: boolean
  brightness?: number
  phase?: number
  secondPlacement?: boolean
  sceneTwoOverrides?: Record<string, unknown>
  sharedClipAcrossScenes?: boolean
  transitionKind?: 'crossfade' | 'cut'
}

function prologueRecipe(overrides: FixtureOverrides = {}): ShowRecipe {
  const effects = overrides.effects
  const secondClipId = overrides.sharedClipAcrossScenes ? 'first' : 'second'
  return {
    clips: [
      { id: 'first', source: SOURCE, ...(effects ? { effects: effects as never } : {}) },
      ...(overrides.sharedClipAcrossScenes ? [] : [{ id: 'second', source: SOURCE }]),
    ],
    zones: [stageZone],
    routingLayouts: [{ id: 'stage', name: 'stage', zones: [stageZone] }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 10_000,
          placements: [
            {
              placementId: 'p0',
              zoneName: 'stage',
              clipId: 'first',
              ...(overrides.brightness === undefined ? {} : { brightness: overrides.brightness }),
              ...(overrides.phase === undefined ? {} : { phase: overrides.phase }),
              ...(effects ? { effects: effects as never } : {}),
            },
            ...(overrides.secondPlacement
              ? [{ placementId: 'p0b', zoneName: 'stage', clipId: 'first', stackOrder: 1, opacity: 0.5 }]
              : []),
          ],
          ...(overrides.animateTrack && effects
            ? {
                propertyTracks: [{
                  id: 'track-0',
                  target: {
                    kind: 'placement-effect' as const,
                    placementId: 'p0',
                    effectId: String(effects[0].id),
                    effectKind: effects[0].kind as never,
                    parameterId: 'turns',
                  },
                  keyframes: [
                    { id: 'start', timeMs: 0, value: 0.1, easing: { curve: 'linear' as const } },
                    { id: 'end', timeMs: 10_000, value: 0.9, easing: { curve: 'linear' as const } },
                  ],
                }],
              }
            : {}),
          ...(overrides.transitionKind === 'cut'
            ? {}
            : { transitionOut: { kind: 'crossfade' as const, durationMs: 2_000 } }),
        },
        {
          holdMs: 10_000,
          placements: [{
            placementId: 'p1',
            zoneName: 'stage',
            clipId: secondClipId,
            ...(overrides.sceneTwoOverrides ?? {}),
          }],
        },
      ],
    },
    loopDurationMs: 22_000,
  }
}

/** Everything from `export function render(` to the end: the per-pixel arms. */
function renderSection(expandedCode: string): string {
  const start = expandedCode.indexOf('export function render(')
  expect(start).toBeGreaterThanOrEqual(0)
  return expandedCode.slice(start)
}

/** The scheduler body between beforeRender and render. */
function schedulerSection(expandedCode: string): string {
  const start = expandedCode.indexOf('export function beforeRender(')
  const end = expandedCode.indexOf('export function render(')
  expect(start).toBeGreaterThanOrEqual(0)
  return expandedCode.slice(start, end)
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

function checksums(recipe: ShowRecipe, options: Record<string, boolean>, fidelity: 'fast' | 'fidelity') {
  const artifact = compileShow(recipe, {}, options)
  const replay = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 1,
  }, {
    mapPoints: Array.from({ length: 64 }, (_, index) => ({ sample: [index / 63] })),
    randomSeed: 571,
    fidelity,
  })
  return [0, 2_500, 9_500, 11_000, 11_900, 15_000, 21_500]
    .map((timeMs) => replay.advanceTo(timeMs, { stepMs: 50 }).checksum)
}

describe('per-pixel placement-prologue rebinding elimination (#571)', () => {
  it('drops per-pixel adaptation and effect-track rebinding for uniform members', () => {
    const artifact = compileShow(prologueRecipe({
      effects: [{ id: 'fx', kind: 'hue', turns: 0.25 }],
      animateTrack: true,
      brightness: 0.6,
      phase: 0.25,
    }), {})
    const code = artifact.expandedCode
    const render = renderSection(code)
    const scheduler = schedulerSection(code)
    // The arms carry only the capture call: no adaptation or parameter writes.
    expect(render).not.toContain('__pxlblz_show_c0_adapt_brightness = ')
    expect(render).not.toContain('__pxlblz_show_c0_adapt_phase = ')
    expect(render).not.toMatch(/__pxlblz_show_c0_fx_\w+ = /)
    // The scheduler is the single writer, including the previously
    // per-pixel-only static phase, and assignments precede advance.
    expect(scheduler).toContain('__pxlblz_show_c0_adapt_phase = 0.25')
    expect(scheduler.indexOf('__pxlblz_show_c0_adapt_phase = 0.25'))
      .toBeLessThan(scheduler.indexOf('__pxlblz_show_c0_advance(delta)'))
    // No prologue writes hide in helper wrappers outside the scheduler either.
    expect(count(code, '__pxlblz_show_c0_adapt_brightness = 0.6'))
      .toBe(count(scheduler, '__pxlblz_show_c0_adapt_brightness = 0.6'))
    expect(artifact.summary.specializations.placementPrologue).toMatchObject({
      enabled: true,
      memberIds: expect.arrayContaining(['first']),
    })
  })

  it('drops the per-pixel affine parameter writes and fx_update call for uniform members', () => {
    const artifact = compileShow(prologueRecipe({
      effects: [{ id: 'sc', kind: 'scale', x: 0.8, y: 0.9 }],
    }), {})
    const render = renderSection(artifact.expandedCode)
    expect(render).not.toContain('__pxlblz_show_c0_fx_update()')
    expect(render).not.toMatch(/__pxlblz_show_c0_fx_\w+ = /)
    // The advance path keeps the per-frame refresh.
    expect(artifact.expandedCode).toMatch(
      /function __pxlblz_show_c0_advance\(delta\) \{\n {2}__pxlblz_show_c0_fx_update\(\)/,
    )
  })

  it('writes static-plan effect parameters from the scheduler instead of every pixel', () => {
    const artifact = compileShow(prologueRecipe({
      effects: [{ id: 'sc', kind: 'scale', x: 0.8, y: 0.9 }],
      transitionKind: 'cut',
    }), {})
    const render = renderSection(artifact.expandedCode)
    const scheduler = schedulerSection(artifact.expandedCode)
    expect(render).not.toMatch(/__pxlblz_show_c0_fx_\w+ = /)
    expect(scheduler).toMatch(/__pxlblz_show_c0_fx_a = /)
  })

  it('keeps per-pixel binding byte-for-byte for multi-placement members', () => {
    const recipe = prologueRecipe({
      effects: [{ id: 'fx', kind: 'hue', turns: 0.25 }],
      brightness: 0.6,
      secondPlacement: true,
    })
    const specialized = compileShow(recipe, {})
    const counterfactual = compileShow(recipe, {}, { placementPrologueHoisting: false })
    expect(specialized.expandedCode).toBe(counterfactual.expandedCode)
  })

  it('keeps per-pixel binding for clips whose bindings diverge across a transition pair', () => {
    const recipe = prologueRecipe({
      brightness: 0.6,
      sharedClipAcrossScenes: true,
      sceneTwoOverrides: { brightness: 0.9 },
    })
    const specialized = compileShow(recipe, {})
    const counterfactual = compileShow(recipe, {}, { placementPrologueHoisting: false })
    expect(specialized.expandedCode).toBe(counterfactual.expandedCode)
  })

  it('rebinding divergent mirror across a transition pair stays exact (#562 fix)', () => {
    const recipe = prologueRecipe({
      sharedClipAcrossScenes: true,
      sceneTwoOverrides: { mirror: true },
    })
    recipe.routedSceneSequence!.scenes[0].placements[0] = {
      ...recipe.routedSceneSequence!.scenes[0].placements[0],
      mirror: false,
    }
    // The transition setup entry writes one mirror value per member per frame,
    // so a mirror flip across the pair must fall back to per-pixel branching.
    for (const fidelity of ['fast', 'fidelity'] as const) {
      expect(checksums(recipe, {}, fidelity))
        .toEqual(checksums(recipe, { capturePrologueSimplification: false }, fidelity))
    }
    const artifact = compileShow(recipe, {})
    expect(artifact.expandedCode).toContain('var mappedIndex')
  })

  it('restores the previous emission under the benchmark counterfactual option', () => {
    const artifact = compileShow(prologueRecipe({
      effects: [{ id: 'fx', kind: 'hue', turns: 0.25 }],
      brightness: 0.6,
      phase: 0.25,
    }), {}, { placementPrologueHoisting: false })
    const render = renderSection(artifact.expandedCode)
    expect(render).toContain('__pxlblz_show_c0_adapt_brightness = 0.6')
    expect(render).toContain('__pxlblz_show_c0_adapt_phase = 0.25')
    expect(artifact.summary.specializations.placementPrologue).toMatchObject({ enabled: false })
  })

  it('replays with identical checksums to the rebinding build in both fidelities', () => {
    const fixtures: ShowRecipe[] = [
      prologueRecipe({
        effects: [{ id: 'fx', kind: 'hue', turns: 0.25 }],
        animateTrack: true,
        brightness: 0.6,
        phase: 0.25,
      }),
      prologueRecipe({ effects: [{ id: 'sc', kind: 'scale', x: 0.8, y: 0.9 }] }),
      prologueRecipe({ brightness: 0.4, phase: 0.5, transitionKind: 'cut' }),
    ]
    for (const recipe of fixtures) {
      for (const fidelity of ['fast', 'fidelity'] as const) {
        const specialized = checksums(recipe, {}, fidelity)
        expect(specialized).toEqual(checksums(recipe, { placementPrologueHoisting: false }, fidelity))
        expect(new Set(specialized).size).toBeGreaterThan(1)
      }
    }
  })
})
