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

function affineMember(id: string): ShowGeneratedEffectKernelMember {
  return member(id, { effects: [
    { id: `${id}-s`, kind: 'scale', x: 0.8, y: 0.9 },
    { id: `${id}-r`, kind: 'rotate', turns: 0.25 },
    { id: `${id}-t`, kind: 'translate', x: 0.1, y: -0.1 },
  ] })
}

describe('Scale Rotate Translate kernel selection (#1210)', () => {
  it('shares arithmetic independently of values, track shape, output and adaptation', () => {
    const a = affineMember('a'), b = affineMember('b')
    a.effects.push({ id: 'hue', kind: 'hue', turns: 0.2 })
    b.effects[0] = { id: 'different', kind: 'scale', x: -0.5, y: 0 }
    b.effects.push({ id: 'key', kind: 'chroma-key', color: '#123456', tolerance: 0.1, softness: 0 })
    b.animatedParameterPaths = ['rotate.turns']
    b.adaptationShape.mirror = true
    b.compositionEnvironment.contentKey = true
    b.compositionEnvironment.outputDimension = 1
    const before = structuredClone([a, b])
    expect(planShowGeneratedEffectKernels([a, b]).groups).toEqual([{
      id: 'affine-scale-rotate-translate-0', family: 'affine-scale-rotate-translate',
      memberIds: ['a', 'b'], parameterNames: ['scale.x', 'scale.y', 'rotate.turns', 'translate.x', 'translate.y'],
      privateStatePolicy: 'member-owned', controlPolicy: 'member-owned', clockPolicy: 'member-owned', perPixelBranchesAdded: 0,
    }])
    expect([a, b]).toEqual(before)
  })

  it('declines empty and single-member inputs', () => {
    expect(planShowGeneratedEffectKernels([]).groups).toEqual([])
    expect(planShowGeneratedEffectKernels([affineMember('a')]).members).toEqual([
      { id: 'a', status: 'unrolled', reason: 'no-repeat' },
    ])
  })

  it.each(['empty', 'static', 'incomplete', 'reordered', 'shear', 'other-prefix', 'affine-tail', 'wrap-tail', 'distortion-tail', 'color-prefix'])(
    'refuses %s even when repeated', (shape) => {
      const a = affineMember('a'), b = affineMember('b')
      for (const item of [a, b]) {
        if (shape === 'empty') item.effects = []
        if (shape === 'static') item.compositionEnvironment.staticPlanEffects = true
        if (shape === 'incomplete') item.effects.pop()
        if (shape === 'reordered') item.effects.reverse()
        if (shape === 'shear') item.effects[1] = { id: 'shear', kind: 'shear', x: 0.2, y: 0 }
        if (shape === 'other-prefix') item.effects[0] = { id: 'shear-first', kind: 'shear', x: 0.2, y: 0 }
        if (shape === 'affine-tail') item.effects.push({ id: 'extra', kind: 'translate', x: 0, y: 0 })
        if (shape === 'wrap-tail') item.effects.push({ id: 'wrap', kind: 'wrap' })
        if (shape === 'distortion-tail') item.effects.push({ id: 'swirl', kind: 'swirl', amount: 0.2, radius: 0.5, centerX: 0.5, centerY: 0.5 })
        if (shape === 'color-prefix') item.effects.unshift({ id: 'hue', kind: 'hue', turns: 0.2 })
      }
      expect(planShowGeneratedEffectKernels([a, b]).groups).toEqual([])
      expect(planShowGeneratedEffectKernels([a, b]).members.every((item) => item.reason === 'unsupported-family')).toBe(true)
    },
  )
})

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
