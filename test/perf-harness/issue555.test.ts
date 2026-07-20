import { compileShow } from '../../src/engine/showCompiler'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import {
  WAVE2_CHEAP_HSV_PATTERN,
  WAVE2_HEAVY_HSV_PATTERN,
  WAVE2_MASTER_PIXEL_COUNT,
  WAVE2_PIXEL_COUNTS,
  effectTaxRecipe,
  hsvSteadyStateRecipe,
  mirrorRecipe,
  wave2FixtureChecksums,
  wave2Fixtures,
  wave2ResourceRow,
} from './issue555'

describe('wave-2 Controller baseline fixtures (#555)', () => {
  it('builds the five fixtures with stable ids and production compiles', () => {
    expect(wave2Fixtures.map((fixture) => fixture.id)).toEqual([
      'redline-reference',
      'hsv-steady-state',
      'effect-tax',
      'mirror',
      'five-pattern-acceptance',
    ])
    for (const fixture of wave2Fixtures) {
      expect(fixture.artifact.code.length).toBeGreaterThan(0)
      const row = wave2ResourceRow(fixture)
      expect(row.sourceBytes).toBeGreaterThan(0)
      expect(row.expandedSourceBytes).toBeGreaterThanOrEqual(row.sourceBytes)
      expect(row.vmWords).toBeGreaterThan(0)
      expect(row.persistentGlobals).toBeGreaterThan(0)
    }
    expect(WAVE2_PIXEL_COUNTS).toEqual([256, 1_000, 2_000])
  })

  it('compiles deterministically from stock content', () => {
    const again = compileShow(hsvSteadyStateRecipe(), LIBRARIES)
    const fixture = wave2Fixtures.find((candidate) => candidate.id === 'hsv-steady-state')!
    expect(again.code).toBe(fixture.artifact.code)
  })

  it('shapes the HSV steady-state Show as one zone, two long holds, one 2 s Crossfade', () => {
    const recipe = hsvSteadyStateRecipe()
    expect(recipe.zones).toHaveLength(1)
    expect(recipe.zones![0].ranges).toEqual([{ start: 0, end: WAVE2_MASTER_PIXEL_COUNT - 1 }])
    const scenes = recipe.routedSceneSequence!.scenes
    expect(scenes).toHaveLength(2)
    for (const scene of scenes) {
      expect(scene.holdMs).toBeGreaterThanOrEqual(20_000)
      expect(scene.placements).toHaveLength(1)
    }
    expect(scenes[0].transitionOut).toEqual({ kind: 'crossfade', durationMs: 2_000 })
    expect(WAVE2_CHEAP_HSV_PATTERN).toBe('EasedSweep')
    expect(WAVE2_HEAVY_HSV_PATTERN).toBe('Caustics')
  })

  it('marks both HSV steady-state members as HSV emitters in the generated artifact', () => {
    const fixture = wave2Fixtures.find((candidate) => candidate.id === 'hsv-steady-state')!
    // Each member gets a renamed hsv wrapper only when the compiler saw hsv()
    // in its source (CompiledMember.usesHsv); assert per member prefix in the
    // expanded (pre-minification) artifact.
    const prefixes = [...new Set(
      [...fixture.artifact.expandedCode.matchAll(/__pxlblz_show_c\d+/g)].map((match) => match[0]),
    )]
    expect(prefixes.length).toBeGreaterThanOrEqual(2)
    for (const prefix of prefixes) {
      expect(fixture.artifact.expandedCode).toContain(`${prefix}_hsv`)
    }
  })

  it('adds an animated hue-rotate and a posterize Effect in the effect-tax Show', () => {
    const recipe = effectTaxRecipe()
    const scenes = recipe.routedSceneSequence!.scenes
    for (const scene of scenes) {
      const effects = scene.placements[0].effects ?? []
      expect(effects.some((effect) => effect.kind === 'hue')).toBe(true)
      expect(effects.some((effect) => effect.kind === 'posterize')).toBe(true)
      expect(scene.propertyTracks?.some((track) => (
        track.target.kind === 'placement-effect' && track.target.effectKind === 'hue'
      ))).toBe(true)
    }
    const fixture = wave2Fixtures.find((candidate) => candidate.id === 'effect-tax')!
    // The generated code must actually carry per-pixel effect lines beyond the
    // HSV steady-state artifact.
    const steady = wave2Fixtures.find((candidate) => candidate.id === 'hsv-steady-state')!
    expect(fixture.artifact.summary.expandedArtifactBytes)
      .toBeGreaterThan(steady.artifact.summary.expandedArtifactBytes)
  })

  it('mirrors the heavy member in the Mirror fixture', () => {
    const recipe = mirrorRecipe()
    expect(recipe.zones).toHaveLength(1)
    const scenes = recipe.routedSceneSequence!.scenes
    expect(scenes[0].placements[0].mirror).toBe(true)
    const fixture = wave2Fixtures.find((candidate) => candidate.id === 'mirror')!
    expect(fixture.artifact.expandedCode).toContain('_adapt_mirror')
  })

  it('replays the new fixture Shows deterministically in Fast and Precise', () => {
    for (const id of ['hsv-steady-state', 'effect-tax', 'mirror'] as const) {
      const first = wave2FixtureChecksums(id)
      const second = wave2FixtureChecksums(id)
      expect(first.fast.length).toBeGreaterThan(0)
      expect(first.precise.length).toBeGreaterThan(0)
      expect(second).toEqual(first)
    }
  }, 240_000)
})
