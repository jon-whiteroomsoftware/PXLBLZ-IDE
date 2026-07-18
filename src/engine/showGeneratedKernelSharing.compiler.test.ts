import { createFastReplayRuntime } from './fastReplay'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from './showCompiler'

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
