import { describe, expect, it } from 'vitest'
import { buildShowScorePlan, type ShowScorePlanInput } from './showScorePlan'

function compatibleInput(): ShowScorePlanInput {
  return {
    compatibility: {
      outputDimension: 2,
      routingLayoutCount: 1,
      logicalZoneCount: 1,
      routingSwitchCount: 0,
      routingPropertyRampCount: 0,
      placementPropertyTrackCount: 0,
      transitionRampCount: 0,
      freezeAtEntryCount: 0,
    },
    scenes: [
      {
        sceneIndex: 0,
        routingIdentity: { layout: 'full-stage', zone: 'main' },
        placements: [{ patternInstanceId: 'reference', memberId: 'clip-reference', layer: 0 }],
      },
      {
        sceneIndex: 1,
        routingIdentity: { layout: 'full-stage', zone: 'main' },
        placements: [{ patternInstanceId: 'selected', memberId: 'clip-selected', layer: 0 }],
      },
      {
        sceneIndex: 2,
        routingIdentity: { layout: 'full-stage', zone: 'main' },
        placements: [{ patternInstanceId: 'reference', memberId: 'clip-reference', layer: 0 }],
      },
    ],
    boundaries: [
      {
        boundaryIndex: 0,
        startMs: 3_000,
        durationMs: 1_800,
        fromSceneIndex: 0,
        toSceneIndex: 1,
        transition: {
          family: 'wipe',
          programIdentity: { variant: 'linear', edge: 'hard' },
          easingIdentity: 'quadratic-in',
          parameters: [0.25, 0],
        },
      },
      {
        boundaryIndex: 1,
        startMs: 8_000,
        durationMs: 1_800,
        fromSceneIndex: 1,
        toSceneIndex: 2,
        transition: {
          family: 'wipe',
          programIdentity: { edge: 'hard', variant: 'linear' },
          easingIdentity: 'quadratic-out',
          parameters: [0.25, 0],
        },
      },
    ],
  }
}

describe('table-driven Show score planning (#542)', () => {
  it('interns repeated stacks and kernels while keeping easing in frame-time score data', () => {
    const plan = buildShowScorePlan(compatibleInput())

    expect(plan).toMatchObject({
      status: 'compatible',
      stackPlanCount: 2,
      kernelCount: 1,
      easingCount: 2,
      cadence: { kind: 'regular', firstBoundaryMs: 3_000, periodMs: 5_000 },
      initialization: { timing: 'regular-cadence', loopBehavior: 'modulo-show-duration' },
    })
    if (plan.status !== 'compatible') throw new Error(plan.reason)
    expect(plan.stackPlanIndexByScene).toEqual([0, 1, 0])
    expect(plan.boundaries.map((boundary) => ({
      fromStack: boundary.fromStack,
      toStack: boundary.toStack,
      kernel: boundary.kernel,
      easing: boundary.easing,
    }))).toEqual([
      { fromStack: 0, toStack: 1, kernel: 0, easing: 0 },
      { fromStack: 1, toStack: 0, kernel: 0, easing: 1 },
    ])
  })

  it('keeps equal Pattern source in separate stack plans when authored state ownership differs', () => {
    const input = compatibleInput()
    input.scenes[2].placements[0] = {
      ...input.scenes[0].placements[0],
      patternInstanceId: 'reference-restarted',
    }

    const plan = buildShowScorePlan(input)
    expect(plan).toMatchObject({ status: 'compatible', stackPlanCount: 3 })
    if (plan.status === 'compatible') expect(plan.stackPlanIndexByScene).toEqual([0, 1, 2])
  })

  it('retains explicit timing when boundary cadence is irregular', () => {
    const input = compatibleInput()
    input.scenes.push({
      ...input.scenes[1],
      sceneIndex: 3,
      placements: input.scenes[1].placements.map((placement) => ({ ...placement })),
    })
    input.boundaries.push({
      ...input.boundaries[1],
      boundaryIndex: 2,
      startMs: 13_250,
      fromSceneIndex: 2,
      toSceneIndex: 3,
    })

    const plan = buildShowScorePlan(input)
    expect(plan).toMatchObject({
      status: 'compatible',
      cadence: { kind: 'explicit' },
      initialization: { timing: 'explicit-boundaries' },
    })
  })

  it.each([
    ['output-dimension', { outputDimension: 1 }],
    ['routing-layout-count', { routingLayoutCount: 2 }],
    ['logical-zone-count', { logicalZoneCount: 2 }],
    ['routing-switch', { routingSwitchCount: 1 }],
    ['routing-property-ramp', { routingPropertyRampCount: 1 }],
    ['placement-property-track', { placementPropertyTrackCount: 1 }],
    ['transition-ramp', { transitionRampCount: 1 }],
    ['freeze-at-entry', { freezeAtEntryCount: 1 }],
  ] as const)('rejects incompatible %s choreography without a partial score', (reason, patch) => {
    const input = compatibleInput()
    Object.assign(input.compatibility, patch)

    expect(buildShowScorePlan(input)).toEqual({ status: 'incompatible', reason })
  })
})
