import { describe, expect, it } from 'vitest'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from './showCompiler'
import type { ShowClipEffect } from './personalContentRecords'
import { createFastReplayRuntime } from './fastReplay'
import { emitFixedPoint } from './fxEmit'
import { parseEpe } from './epeImport'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { validateShowRecordV2 } from './showCompositionV2'
import { normalizeShowClipEffects } from './showEffects'
import { convertibleV2Record } from '../test/showEpeV2TestSupport'

const SOURCE = 'export function render2D(index,x,y){rgb(0.2+x/2,0.1+y/2,0.3)}'
const POINTS = Array.from({ length: 16 }, (_, i) => ({ sample: [(i % 4) / 3, Math.floor(i / 4) / 3] }))
const TIMES = [0, 1, 300, 599, 600, 601, 1000, 1399, 1400, 1401, 1700, 1999, 2000, 2001, 2300, 2599, 2600, 2601, 3399, 3400, 3401]
const TIMEOUT_MS = 15_000
const vignette = (id: string, amount: number): ShowClipEffect => ({
  id, kind: 'vignette', amount, radius: 0.4, softness: 0.25, centerX: 0.5, centerY: 0.5, aspect: 1,
})

function fixture(): ShowRecipe {
  const zones = [{ id: 'stage', name: 'stage', ranges: [{ start: 0, end: 15 }] }]
  const effects = [vignette('first', 0.3), vignette('second', 0.7)]
  return {
    masterPixelCount: 16,
    clips: [{ id: 'shared', source: SOURCE, effects }],
    zones,
    routingLayouts: [{ id: 'stage', name: 'stage', zones }],
    routedSceneSequence: { scenes: [
      { holdMs: 600, placements: [{ placementId: 'a', clipId: 'shared', zoneName: 'stage', effects: [effects[0]] }] },
      { holdMs: 800, placements: [{ placementId: 'b', clipId: 'shared', zoneName: 'stage', effects: [effects[1]] }] },
      { holdMs: 600, placements: [{ placementId: 'c', clipId: 'shared', zoneName: 'stage', effects: [] }] },
    ] },
    loopDurationMs: 2000,
  }
}

function selection(artifact: GeneratedShowArtifact) {
  return artifact.summary.specializations.effectParameterHoisting
}

function delivered(artifact: GeneratedShowArtifact, record = convertibleV2Record()) {
  const exported = buildShowEpeExportV2(record, artifact.code, { id: '1210-test', stampedAt: '2026-10-24T00:00:00.000Z' })
  if (exported.status !== 'exported') throw new Error(exported.message)
  const opened = parseEpe(exported.text)
  expect(opened.src).toContain(artifact.code)
  return opened.src
}

function compare(recipe: ShowRecipe, times = TIMES, record = convertibleV2Record()) {
  const optimized = compileShow(recipe, {})
  const disabled = compileShow(recipe, {}, { effectParameterHoisting: false })
  const optimizedSource = delivered(optimized, record), disabledSource = delivered(disabled, record)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const runtime = (artifact: GeneratedShowArtifact, code: string) => createFastReplayRuntime({
      code, fxCode: emitFixedPoint(code), metadata: artifact.metadata, dimension: 2,
    }, { mapPoints: POINTS, fidelity, randomSeed: 1210 })
    const a = runtime(optimized, optimizedSource), b = runtime(disabled, disabledSource)
    for (const time of times) {
      const frame = (replay: typeof a) => Array.from(time === 0 ? replay.renderCurrentFrame().frame : replay.advanceTo(time, { stepMs: 25, forceFullIntermediateRender: true }).frame)
      const actual = frame(a), expected = frame(b)
      expect(actual.every(Number.isFinite), `${fidelity}/${time}: finite optimized RGB`).toBe(true)
      expect(expected.every(Number.isFinite), `${fidelity}/${time}: finite counterfactual RGB`).toBe(true)
      expect(actual, `${fidelity}/${time}: complete delivered RGB`).toEqual(expected)
    }
  }
  return { optimized, disabled, optimizedSource, disabledSource }
}

function parameterWrites(artifact: GeneratedShowArtifact, field: string) {
  return artifact.expandedCode.match(new RegExp(`__pxlblz_show_c0_fx_p\\d+_${field} =`, 'g'))?.length ?? 0
}

describe('constant routed Effect parameter bindings (#1210)', () => {
  it('shrinks distinct same-kind Effects while preserving absent identities, cuts and loop re-entry', () => {
    const recipe = fixture()
    recipe.routedSceneSequence!.scenes[0].placements[0].transform = { positionX: 0.1, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
    const { optimized, disabled, optimizedSource, disabledSource } = compare(recipe)
    expect(optimized.summary.artifactBytes).toBeLessThan(disabled.summary.artifactBytes)
    expect(Buffer.byteLength(optimizedSource)).toBeLessThan(Buffer.byteLength(disabledSource))
    expect(selection(optimized)).toMatchObject({ enabled: true, memberIds: ['shared'] })
    expect(selection(optimized)?.constantParameterCount).toBe(10)
    expect(parameterWrites(optimized, 'amount')).toBeGreaterThan(2)
    expect(parameterWrites(optimized, 'radius')).toBe(2) // declarations remain
    expect(optimized.expandedCode).not.toMatch(/var __pxlblz_show_c0_fx_p\d+_[xy] =/)
    const declarations = (a: GeneratedShowArtifact) => a.expandedCode.split('\n').filter(line => /^var __pxlblz_show_c0_fx_p\d+_/.test(line))
    expect(declarations(optimized)).toEqual(declarations(disabled))
    expect(optimized.metadata.patternVars.length).toBe(disabled.metadata.patternVars.length)
    for (const key of ['persistentGlobals', 'totalWords', 'renderTargetWords', 'memberPatternWords', 'routingWords', 'planWords', 'auxiliaryCacheWords'] as const) {
      expect(optimized.summary.resources[key]).toBeLessThanOrEqual(disabled.summary.resources[key])
    }
  }, TIMEOUT_MS)

  it.each(['track', 'transition-ramp'] as const)('excludes %s writers by Effect ID despite a prepended Transform and restores placement baselines', writer => {
    const recipe = fixture()
    const effect = vignette('reused', 0.3)
    recipe.clips[0].effects = [effect]
    const scenes = recipe.routedSceneSequence!.scenes
    for (const [index, scene] of scenes.entries()) scene.placements[0].effects = index === 2 ? [] : [vignette('reused', index ? 0.7 : 0.3)]
    scenes[0].placements[0].transform = { positionX: 0.1, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
    if (writer === 'track') scenes[0].propertyTracks = [{
      id: 'radius', target: { kind: 'placement-effect', placementId: 'a', effectId: 'reused', effectKind: 'vignette', parameterId: 'radius' },
      keyframes: [{ id: 'start', timeMs: 0, value: 0.4, easing: { curve: 'linear' } }, { id: 'end', timeMs: 600, value: 0.9, easing: { curve: 'linear' } }],
    }]
    else {
      scenes[0].transitionOut = { kind: 'crossfade', durationMs: 200 }
      scenes[0].transitionRamps = [{ clipId: 'shared', effectRamps: { reused: { radius: { from: 0.4, to: 0.9, durationMs: 200, easing: 'linear' } } } }]
      recipe.loopDurationMs = 2200
    }
    const times = writer === 'track' ? TIMES : [0, 599, 600, 601, 700, 799, 800, 801, 1599, 1600, 1601, 2199, 2200, 2201, 2799, 2800, 2801, 3001]
    const { optimized, disabled } = compare(recipe, times)
    expect(selection(optimized)?.constantParameterCount).toBeGreaterThan(0)
    expect(parameterWrites(optimized, 'radius')).toBe(parameterWrites(disabled, 'radius'))
    expect(parameterWrites(optimized, 'radius')).toBeGreaterThan(1)
    expect(parameterWrites(optimized, 'softness')).toBe(1)
    expect(parameterWrites(optimized, 'amount')).toBeGreaterThan(1)
  }, TIMEOUT_MS)

  it('preserves simultaneous divergent physical Zones and both crossfade arms without parameter leakage', () => {
    const recipe = fixture()
    const zones = [{ id: 'left', name: 'left', ranges: [{ start: 0, end: 7 }] }, { id: 'right', name: 'right', ranges: [{ start: 8, end: 15 }] }]
    recipe.zones = zones
    recipe.routingLayouts = [{ id: 'split', name: 'split', zones }]
    for (const [index, scene] of recipe.routedSceneSequence!.scenes.entries()) {
      const effects = recipe.clips[0].effects!
      scene.placements = [
        { placementId: `left-${index}`, clipId: 'shared', zoneName: 'left', effects: index === 1 ? [] : [effects[0]] },
        { placementId: `right-${index}`, clipId: 'shared', zoneName: 'right', effects: index === 1 ? [effects[0]] : [effects[1]] },
      ]
      if (index === 0) scene.transitionOut = { kind: 'crossfade', durationMs: 200 }
    }
    recipe.loopDurationMs = 2200
    const { optimized } = compare(recipe, [0, 300, 599, 600, 601, 700, 799, 800, 801, 1200, 1599, 1600, 1601, 2199, 2200, 2201, 2801, 2900, 3001])
    expect(selection(optimized)?.constantParameterCount).toBe(10)
    expect(parameterWrites(optimized, 'amount')).toBeGreaterThan(2)
  }, TIMEOUT_MS)

  it.each(['luma-key', 'chroma-key'] as const)('retains absent %s -1/0 identities and authored malformed-value normalization', kind => {
    const recipe = fixture()
    const effect: ShowClipEffect = kind === 'luma-key'
      ? { id: 'key', kind, target: 0.4, tolerance: -1, softness: 0 }
      : { id: 'key', kind, color: '#00ff00', tolerance: -1, softness: 0 }
    expect(normalizeShowClipEffects([effect])[0]).toMatchObject({ tolerance: 0, softness: 0 })
    recipe.clips[0].effects = [effect]
    recipe.routedSceneSequence!.scenes.forEach((scene, index) => { scene.placements[0].effects = index === 0 ? [effect] : [] })
    const { optimized } = compare(recipe)
    expect(optimized.expandedCode).toMatch(/_fx_p\d+_tolerance = -1/)
    expect(parameterWrites(optimized, 'tolerance')).toBeGreaterThan(1)
    expect(parameterWrites(optimized, 'softness')).toBe(1)
    expect(selection(optimized)?.constantParameterCount).toBeGreaterThan(0)
  }, TIMEOUT_MS)

  it('reopens a valid native Show with held appearance keys and an Effect track before real lowering', async () => {
    const record = convertibleV2Record()
    record.composition.showEndMs = 2000
    record.composition.layoutOccurrences[0].durationMs = 2000
    const clip = record.composition.clips[0], first = clip.appearance.keys[0]
    clip.durationMs = 2000
    clip.appearance.keys = [0, 600, 1400].map((timeMs, index) => ({ ...structuredClone(first), id: `held-${index}`, timeMs,
      value: { ...structuredClone(first.value), effects: [vignette('native', index === 1 ? 0.7 : 0.3)] },
    }))
    record.composition.propertyTracks = [{ id: 'effect-track', target: { kind: 'clip-effect', clipId: clip.id, effectId: 'native', effectKind: 'vignette', parameterId: 'radius' },
      activeStartMs: 0, activeDurationMs: 2000,
      keyframes: [{ id: 'start', timeMs: 0, value: 0.4, easing: { curve: 'linear' } }, { id: 'end', timeMs: 2000, value: 0.8, easing: { curve: 'linear' } }],
    }]
    const before = structuredClone(record)
    expect(validateShowRecordV2(record)).toEqual([])
    const bundle = buildShowFileBundle(record, { patterns: [], maps: [], libraries: [] }, { appVersion: '1210', exportedAt: '2026-10-24T00:00:00.000Z' })
    const opened = await parseShowFileBundle(await serializeShowFileBundle(bundle.bundle), { acceptV2: true })
    expect(opened.version).toBe(2)
    if (opened.version !== 2) throw new Error('Expected native Show')
    expect(opened.show).toEqual(record)
    expect(validateShowRecordV2(opened.show)).toEqual([])
    const prepared = prepareShowV2ForCompile(opened.show, { byCellId: {}, stageDimension: 2, byPatternInstanceId: { instance: SOURCE } }, { libraries: {} })
    if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared))
    const { optimized } = compare(prepared.recipe, TIMES, opened.show)
    expect(selection(optimized)?.constantParameterCount).toBeGreaterThan(0)
    expect(record).toEqual(before)
    expect(opened.show).toEqual(before)
  }, TIMEOUT_MS)

  it('keeps disabled and non-routed emission, declarations and metadata consistent', () => {
    const routed = fixture()
    const disabledOptions = { effectParameterHoisting: false }
    const disabled = compileShow(routed, {}, disabledOptions)
    expect(selection(disabled)).toEqual({ enabled: false, constantParameterCount: 0, memberIds: [] })
    const plain: ShowRecipe = { clips: [{ id: 'plain', source: SOURCE, effects: [vignette('plain', 0.3)] }], masterPixelCount: 16 }
    const ordinary = compileShow(plain, {}), counterfactual = compileShow(plain, {}, disabledOptions)
    expect(ordinary.code).toBe(counterfactual.code)
    expect(ordinary.fxCode).toBe(counterfactual.fxCode)
    expect(ordinary.metadata).toEqual(counterfactual.metadata)
    expect(selection(ordinary)).toBeNull()
  }, TIMEOUT_MS)
})
