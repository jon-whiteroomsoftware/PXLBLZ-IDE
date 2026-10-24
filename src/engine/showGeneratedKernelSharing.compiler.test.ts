import { createFastReplayRuntime } from './fastReplay'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from './showCompiler'
import type { ShowClipEffect } from './personalContentRecords'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { convertibleV2Record } from '../test/showEpeV2TestSupport'
import { stockShowV2ById } from '../pixelblaze/stock/showsV2'
import { nativeStockSourceLookupV2 } from '../pixelblaze/stock/showsV2Compile'
import { LIBRARIES } from '../pixelblaze/libs'
import { compileLibraries } from './libraries'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'

function repeatedScaleRecipe(memberCount: number, incompatibleIndex = -1): ShowRecipe {
  const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 15 }] }]
  const clips = Array.from({ length: memberCount }, (_, index) => ({
    id: `member-${index}`,
    source: 'export function render2D(index, x, y) { rgb(x, y, index / max(1, pixelCount - 1)) }',
    effects: index === incompatibleIndex
      ? [{ id: `move-${index}`, kind: 'translate' as const, x: 0.1, y: 0.2 }]
      : [{ id: `scale-${index}`, kind: 'scale' as const, x: 0.7 + index * 0.02, y: 0.9 }],
  }))
  return {
    masterPixelCount: 16,
    clips,
    zones,
    routingLayouts: [{ id: 'main', name: 'main', zones }],
    routedSceneSequence: {
      scenes: clips.map((clip, index) => {
        const effect = clip.effects![0]
        const parameterId = effect.kind === 'scale' ? 'x' : 'x'
        return {
          holdMs: 1_000,
          placements: [{
            placementId: `placement-${index}`,
            zoneName: 'main',
            clipId: clip.id,
            effects: clip.effects,
          }],
          propertyTracks: [{
            id: `track-${index}`,
            target: {
              kind: 'placement-effect' as const,
              placementId: `placement-${index}`,
              effectId: effect.id,
              effectKind: effect.kind,
              parameterId,
            },
            keyframes: [
              { id: `start-${index}`, timeMs: 0, value: effect.x, easing: { curve: 'linear' as const } },
              { id: `end-${index}`, timeMs: 1_000, value: effect.x + 0.1, easing: { curve: 'linear' as const } },
            ],
          }],
          ...(index < clips.length - 1
            ? { transitionOut: { kind: 'cut' as const, durationMs: 0 } }
            : {}),
        }
      }),
    },
    loopDurationMs: memberCount * 1_000,
  }
}

function affineRecipe(simultaneous = false, scale = 0.8, turns = 0.25): ShowRecipe {
  const recipe = repeatedScaleRecipe(3, 2)
  for (const [index, clip] of recipe.clips.entries()) {
    clip.source = `export var gain = ${0.3 + index * 0.1}
export var phase = 0
export function sliderGain(v) { gain = v }
export function beforeRender(delta) { phase += delta / 10000 }
export function render2D(index, x, y) { rgb(x * gain, y * gain, wave(phase + index / pixelCount)) }`
    clip.controlTargets = { sliderGain: 0.3 + index * 0.2 }
    if (index < 2) clip.effects = [
      { id: `scale-${index}`, kind: 'scale', x: scale, y: index ? -0.7 : 0.9 },
      { id: `rotate-${index}`, kind: 'rotate', turns: turns + index * 0.25 },
      { id: `translate-${index}`, kind: 'translate', x: index * 0.1, y: -0.15 },
      index === 0 ? { id: 'hue', kind: 'hue', turns: 0.1 }
        : { id: 'key', kind: 'chroma-key', color: '#123456', tolerance: 0.1, softness: 0 },
    ] satisfies ShowClipEffect[]
  }
  const scenes = recipe.routedSceneSequence!.scenes
  for (const [index, scene] of scenes.entries()) {
    scene.placements[0].effects = recipe.clips[index].effects
    if (index === 1) {
      const track = scene.propertyTracks![0]
      if (track.target.kind !== 'placement-effect') throw new Error('fixture target changed')
      track.target.effectId = 'rotate-1'
      track.target.effectKind = 'rotate'
      track.target.parameterId = 'turns'
      track.keyframes[0].value = turns
      track.keyframes[1].value = turns + 0.5
    }
  }
  if (simultaneous) {
    const zones = recipe.clips.map((clip, i) => ({ id: clip.id, name: clip.id, ranges: [{ start: i * 5, end: i === 2 ? 15 : i * 5 + 4 }] }))
    recipe.zones = zones
    recipe.routingLayouts = [{ id: 'main', name: 'main', zones }]
    for (const [index, scene] of scenes.entries()) {
      scene.placements = recipe.clips.map((clip, i) => ({
        placementId: `placement-${index}-${i}`, clipId: clip.id, zoneName: clip.id, effects: clip.effects,
      }))
      const target = scene.propertyTracks![0].target
      if (target.kind !== 'placement-effect') throw new Error('fixture target changed')
      target.placementId = `placement-${index}-${index}`
      if (index % 2) scene.placements.reverse()
      if (index < 2) scene.transitionOut = { kind: 'crossfade', durationMs: 200 }
    }
  }
  return recipe
}

function wholeFrames(recipe: ShowRecipe) {
  const shared = compileShow(recipe, {})
  const original = compileShow(recipe, {}, { generatedEffectKernelSharing: false })
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const replay = (artifact: GeneratedShowArtifact) => {
      const exported = buildShowEpeExportV2(convertibleV2Record(), artifact.code, { id: '1210-kernel', stampedAt: '2026-10-24T00:00:00.000Z' })
      if (exported.status !== 'exported') throw new Error(exported.message)
      const code = parseEpe(exported.text).src
      return createFastReplayRuntime({ code, fxCode: emitFixedPoint(code), metadata: artifact.metadata, dimension: 2 }, {
        mapPoints: Array.from({ length: 16 }, (_, i) => ({ sample: [(i % 4) / 3, Math.floor(i / 4) / 3] })), randomSeed: 1210, fidelity,
      })
    }
    const a = replay(shared), b = replay(original)
    const initialA = a.snapshot(), initialB = b.snapshot()
    let previous = 0
    for (const time of [0, 1, 499, 500, 999, 1000, 1001, 1199, 1200, 1999, 2000, 2999, 3000, 3001, 6100, 0, 750, 750, 0, 1250]) {
      if (time < previous) { a.restore(initialA); b.restore(initialB) }
      const actual = Array.from(a.advanceTo(time, { stepMs: 25, forceFullIntermediateRender: true }).frame)
      const expected = Array.from(b.advanceTo(time, { stepMs: 25, forceFullIntermediateRender: true }).frame)
      expect(actual.every(Number.isFinite), `${fidelity}/${time}: finite shared RGB`).toBe(true)
      expect(expected.every(Number.isFinite), `${fidelity}/${time}: finite original RGB`).toBe(true)
      expect(actual, `${fidelity}/${time}: complete delivered Stage`).toEqual(expected)
      previous = time
    }
  }
  return { shared, original }
}

describe('shared Scale Rotate Translate emission (#1210)', () => {
  it('declines the affine family when its scratch would remove shipped replay purity', () => {
    const record = stockShowV2ById('stock-show-remix-quadrille')!
    const libraries = compileLibraries(LIBRARIES, [])
    const prepared = prepareShowV2ForCompile(record, nativeStockSourceLookupV2(record), { libraries })
    if (prepared.status !== 'ready') throw new Error('Quadrille preparation refused')
    const baseline = compileShow(prepared.recipe, libraries, { generatedEffectKernelSharing: false })
    expect(baseline.metadata.deterministicReplay?.intermediateRender).toBe('state-pure')
    const candidate = compileShow(prepared.recipe, libraries)
    expect(candidate.metadata.deterministicReplay?.intermediateRender).toBe('state-pure')
    expect(candidate.expandedCode).toBe(baseline.expandedCode)
    expect(candidate.summary.specializations.generatedEffectKernels.selected).toBe(false)
  })

  it('emits the measured five-input, 45-local form and preserves delivered frames', () => {
    const recipe = affineRecipe()
    const before = structuredClone(recipe)
    const { shared, original } = wholeFrames(recipe)
    const helper = shared.expandedCode.match(/function __pxlblz_show_fxk_scale_rotate_translate_0\(([^)]*)\) \{([\s\S]*?)^\}/m)
    expect(helper).not.toBeNull()
    expect(helper![1].split(',')).toHaveLength(5)
    expect(helper![2].match(/\bvar /g)).toHaveLength(45)
    expect(shared.summary.specializations.generatedEffectKernels).toMatchObject({
      family: 'affine-scale-rotate-translate', memberCount: 2, parameterScalarGlobals: 10,
      sharedResultGlobals: 6, persistentGlobalsAvoided: 6, qualification: null, perPixelBranchesAdded: 0,
    })
    expect(Buffer.byteLength(shared.code)).toBeLessThan(Buffer.byteLength(original.code))
    expect(shared.summary.resources.persistentGlobals).toBeLessThan(original.summary.resources.persistentGlobals)
    expect(shared.summary.resources.totalWords).toBeLessThanOrEqual(original.summary.resources.totalWords)
    expect(recipe).toEqual(before)
  })

  it('retains private matrices and color work through simultaneous Zones, alternating updates and crossfades', () => {
    const { shared } = wholeFrames(affineRecipe(true))
    expect(shared.summary.specializations.generatedEffectKernels.family).toBe('affine-scale-rotate-translate')
  })

  it('retains absent Luma/Chroma identity tolerance -1 and softness 0 across placements', () => {
    const recipe = affineRecipe(true)
    for (const [index, scene] of recipe.routedSceneSequence!.scenes.entries()) {
      for (const placement of scene.placements) {
        if (placement.clipId === 'member-0' && index === 0) placement.effects = [
          ...placement.effects!.slice(0, 3),
          { id: 'luma', kind: 'luma-key', target: 0.5, tolerance: 0.05, softness: 0 },
        ]
        if (placement.clipId === 'member-1' && index === 2) placement.effects = placement.effects!.slice(0, 3)
      }
    }
    const { shared } = wholeFrames(recipe)
    expect(shared.summary.specializations.generatedEffectKernels.family).toBe('affine-scale-rotate-translate')
    expect(shared.expandedCode).toMatch(/_tolerance = -1/)
    expect(shared.expandedCode).toMatch(/_softness = 0/)
  })

  it.each(['single', 'static', 'incomplete', 'reordered', 'coordinate-tail'])(
    'preserves the original unrolled source for %s affine members', (shape) => {
      const recipe = affineRecipe()
      for (const [index, scene] of recipe.routedSceneSequence!.scenes.entries()) {
        const effects = recipe.clips[index].effects!
        if (index < 2) {
          if (shape === 'incomplete' || (shape === 'single' && index === 1)) effects.splice(2, 1)
          if (shape === 'reordered') [effects[0], effects[1]] = [effects[1], effects[0]]
          if (shape === 'coordinate-tail') effects.push({ id: 'extra', kind: 'shear', x: 0.1, y: 0 })
        }
        if (shape === 'static') scene.propertyTracks = []
      }
      const original = compileShow(recipe, {}, { generatedEffectKernelSharing: false })
      const candidate = compileShow(recipe, {})
      expect(candidate.summary.specializations.generatedEffectKernels.selected).toBe(false)
      expect(candidate.expandedCode).toBe(original.expandedCode)
    },
  )

  it.each([[-0.8, -0.5], [0, 0], [0.0000001, 0.5], [-0.0000001, 1]])(
    'retains guard and operator order for scale %s and rotation %s', (scale, turns) => {
      const { shared } = wholeFrames(affineRecipe(false, scale, turns))
      expect(shared.summary.specializations.generatedEffectKernels.selected).toBe(true)
    },
  )

  it('accounts for mixed families without extending Scale hardware qualification', () => {
    const recipe = repeatedScaleRecipe(4)
    const affine = affineRecipe()
    for (let i = 0; i < 2; i++) {
      recipe.clips[i] = affine.clips[i]
      recipe.routedSceneSequence!.scenes[i] = affine.routedSceneSequence!.scenes[i]
    }
    const shared = compileShow(recipe, {})
    expect(shared.summary.specializations.generatedEffectKernels).toMatchObject({
      family: 'mixed', kernelCount: 2, memberCount: 4, parameterScalarGlobals: 14,
      sharedResultGlobals: 12, persistentGlobalsAvoided: 12, qualification: null,
    })
  })
})

describe('shared generated Effect kernel emission (#538)', () => {
  it('emits one scale kernel while retaining member-owned matrices', () => {
    const recipe = repeatedScaleRecipe(3)
    const baseline = compileShow(recipe, {}, { generatedEffectKernelSharing: false })
    const shared = compileShow(recipe, {}, { generatedEffectKernelSharing: true })

    expect(baseline.expandedCode.match(/function __pxlblz_show_c\d+_fx_update/g)).toHaveLength(3)
    expect(shared.expandedCode.match(/function __pxlblz_show_fxk_scale_0\(/g)).toHaveLength(1)
    expect(shared.expandedCode.match(/function __pxlblz_show_c\d+_fx_update/g)).toHaveLength(3)
    expect(shared.expandedCode.match(/var __pxlblz_show_c\d+_fx_a =/g)).toHaveLength(3)
    expect(shared.expandedCode.match(/__pxlblz_show_fxk_scale_0\(__pxlblz_show_c\d+_fx_p0_x/g)).toHaveLength(3)
  })

  it('selects the hardware-qualified two-member boundary by default and reports its evidence', () => {
    const production = compileShow(repeatedScaleRecipe(2), {})

    expect(production.expandedCode).toContain('function __pxlblz_show_fxk_scale_0(')
    expect(production.summary.specializations.generatedEffectKernels).toMatchObject({
      selected: true,
      reason: 'selected',
      kernelCount: 1,
      memberCount: 2,
      parameterScalarGlobals: 4,
      persistentGlobalsAvoided: 6,
      perPixelBranchesAdded: 0,
      qualification: {
        controller: { boardType: 'pb32', firmwareVersion: '3.67' },
        minimumMembers: 2,
        cases: [
          { memberCount: 2, baselineControllerBytecodeBytes: 4_586, sharedControllerBytecodeBytes: 3_962 },
          { memberCount: 5, baselineControllerBytecodeBytes: 10_718, sharedControllerBytecodeBytes: 7_898 },
          { memberCount: 10, baselineControllerBytecodeBytes: 20_938, sharedControllerBytecodeBytes: 14_458 },
        ],
      },
    })
  })

  it('leaves an incompatible affine family unrolled', () => {
    const recipe = repeatedScaleRecipe(3, 1)
    const baseline = compileShow(recipe, {}, { generatedEffectKernelSharing: false })
    const shared = compileShow(recipe, {}, { generatedEffectKernelSharing: true })

    expect(shared.expandedCode.match(/function __pxlblz_show_fxk_scale_0\(/g)).toHaveLength(1)
    expect(shared.expandedCode).toContain('function __pxlblz_show_c1_fx_update()')
    expect(shared.summary.specializations.generatedEffectKernels.members).toContainEqual({
      id: 'member-1',
      status: 'unrolled',
      reason: 'unsupported-family',
    })
    for (const fidelity of ['fast', 'fidelity'] as const) {
      expect(checksums(shared, fidelity, [250, 1_250, 2_250])).toEqual(
        checksums(baseline, fidelity, [250, 1_250, 2_250]),
      )
    }
  })

  it('keeps different property-track shapes in separate unrolled representations', () => {
    const recipe = repeatedScaleRecipe(2)
    const secondTrack = recipe.routedSceneSequence!.scenes[1].propertyTracks![0]
    if (secondTrack.target.kind !== 'placement-effect') throw new Error('fixture target changed')
    secondTrack.target.parameterId = 'y'

    const artifact = compileShow(recipe, {}, { generatedEffectKernelSharing: true })

    expect(artifact.expandedCode).not.toContain('function __pxlblz_show_fxk_scale_0(')
    expect(artifact.summary.specializations.generatedEffectKernels).toMatchObject({
      selected: false,
      reason: 'no-repeat',
    })
    expect(artifact.summary.specializations.generatedEffectKernels.members).toEqual([
      { id: 'member-0', status: 'unrolled', reason: 'no-repeat' },
      { id: 'member-1', status: 'unrolled', reason: 'no-repeat' },
    ])
  })

  it('matches the unrolled representation in Fast and Precise replay', () => {
    const recipe = repeatedScaleRecipe(3)
    const baseline = compileShow(recipe, {}, { generatedEffectKernelSharing: false })
    const shared = compileShow(recipe, {}, { generatedEffectKernelSharing: true })
    const scoreTimes = [0, 250, 750, 1_250, 1_750, 2_250, 2_750]

    for (const fidelity of ['fast', 'fidelity'] as const) {
      expect(checksums(shared, fidelity, scoreTimes)).toEqual(checksums(baseline, fidelity, scoreTimes))
    }
  })
})

function checksums(
  artifact: GeneratedShowArtifact,
  fidelity: 'fast' | 'fidelity',
  scoreTimes: number[],
): string[] {
  const mapPoints = Array.from({ length: 16 }, (_, index) => ({
    sample: [(index % 4) / 3, Math.floor(index / 4) / 3],
  }))
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: 2,
  }, {
    mapPoints,
    randomSeed: 538,
    fidelity,
  })
  return scoreTimes.map((timeMs) => runtime.advanceTo(timeMs, { stepMs: 50 }).checksum)
}
