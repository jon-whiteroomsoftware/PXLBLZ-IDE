import {
  planShowGeneratedEffectKernels,
  selectShowGeneratedKernelRepresentation,
  type ShowGeneratedEffectKernelMember,
} from './showGeneratedKernelSharing'

function member(
  id: string,
  patch: Partial<ShowGeneratedEffectKernelMember> = {},
): ShowGeneratedEffectKernelMember {
  return {
    id,
    effects: [{ id: `${id}-scale`, kind: 'scale', x: 0.8, y: 0.9 }],
    animatedParameterPaths: ['scale.x', 'scale.y'],
    adaptationShape: {
      mirror: false,
      lightShutter: false,
      steppedClock: false,
      brightnessScale: false,
    },
    compositionEnvironment: {
      outputDimension: 2,
      contentKey: false,
      coordinateField: false,
      staticPlanEffects: false,
    },
    ...patch,
  }
}

describe('shared generated Effect kernels (#538)', () => {
  it('groups the same animated affine structure while parameterizing ids and values', () => {
    const plan = planShowGeneratedEffectKernels([
      member('first'),
      member('second', {
        effects: [{ id: 'other-id', kind: 'scale', x: 1.2, y: 0.6 }],
      }),
    ])

    expect(plan.groups).toEqual([expect.objectContaining({
      family: 'affine-scale',
      memberIds: ['first', 'second'],
      parameterNames: ['x', 'y'],
      perPixelBranchesAdded: 0,
    })])
    expect(plan.members.every((entry) => entry.status === 'selected')).toBe(true)
  })

  it('keeps Effect order, property shape, adaptation shape, and composition environment in identity', () => {
    const plan = planShowGeneratedEffectKernels([
      member('baseline'),
      member('different-effect', {
        effects: [{ id: 'move', kind: 'translate', x: 0.1, y: 0.2 }],
      }),
      member('different-track', { animatedParameterPaths: ['scale.x'] }),
      member('different-adaptation', {
        adaptationShape: {
          mirror: true,
          lightShutter: false,
          steppedClock: false,
          brightnessScale: false,
        },
      }),
      member('different-environment', {
        compositionEnvironment: {
          outputDimension: 1,
          contentKey: false,
          coordinateField: false,
          staticPlanEffects: false,
        },
      }),
    ])

    expect(plan.groups).toEqual([])
    expect(plan.members).toEqual([
      { id: 'baseline', status: 'unrolled', reason: 'no-repeat' },
      { id: 'different-effect', status: 'unrolled', reason: 'unsupported-family' },
      { id: 'different-track', status: 'unrolled', reason: 'no-repeat' },
      { id: 'different-adaptation', status: 'unrolled', reason: 'no-repeat' },
      { id: 'different-environment', status: 'unrolled', reason: 'no-repeat' },
    ])
  })

  it('preserves independent instance ownership inside a shared structural group', () => {
    const plan = planShowGeneratedEffectKernels([
      member('instance-a'),
      member('instance-b'),
      member('instance-c'),
    ])

    expect(plan.groups[0]).toMatchObject({
      memberIds: ['instance-a', 'instance-b', 'instance-c'],
      privateStatePolicy: 'member-owned',
      controlPolicy: 'member-owned',
      clockPolicy: 'member-owned',
    })
  })

  it('selects production representation only after exact parity and lower Controller bytecode', () => {
    expect(selectShowGeneratedKernelRepresentation({
      exactFast: true,
      exactPrecise: true,
      baselineControllerBytecode: 12_000,
      sharedControllerBytecode: 9_500,
    })).toEqual({ selected: true, reason: 'selected', controllerBytecodeDelta: -2_500 })

    expect(selectShowGeneratedKernelRepresentation({
      exactFast: false,
      exactPrecise: true,
      baselineControllerBytecode: 12_000,
      sharedControllerBytecode: 9_500,
    }).reason).toBe('parity')
    expect(selectShowGeneratedKernelRepresentation({
      exactFast: true,
      exactPrecise: true,
      baselineControllerBytecode: 12_000,
      sharedControllerBytecode: 12_001,
    }).reason).toBe('controller-bytecode')
  })
})
